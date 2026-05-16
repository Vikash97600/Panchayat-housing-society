from rest_framework import generics, permissions, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings
from django.core.cache import cache
from django.http import FileResponse
from django.core.exceptions import ObjectDoesNotExist
import os

from common.services.pdf_service import extract_pdf_text, PDFEmptyError, PDFExtractionError, chunk_text
from common.services.groq_bylaw_service import (
    sanitize_question,
    retrieve_relevant_chunks,
    call_groq_bylaw,
    GroqConfigError,
    GroqRateLimitError,
    GroqServiceError,
)
from common.services.bylaw_service import get_bylaw_for_user, BylawNotFoundError, BylawTextEmptyError
from apps.accounts.views import log_audit
from apps.accounts.models import Society
from .models import Bylaw
from .serializers import BylawSerializer, BylawListSerializer, BylawAskSerializer
from common.utils.logger import get_logger

logger = get_logger(__name__)


class IsAdminOrCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'secretary', 'treasurer', 'committee']


class BylawListView(generics.ListAPIView):
    serializer_class = BylawListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            society_id = self.request.query_params.get('society_id')
            if society_id:
                return Bylaw.objects.filter(society_id=society_id, is_active=True).select_related('uploaded_by', 'society')
            return Bylaw.objects.filter(is_active=True).select_related('uploaded_by', 'society')
        return Bylaw.objects.filter(society=user.society, is_active=True).select_related('uploaded_by')


class BylawUploadView(generics.CreateAPIView):
    serializer_class = BylawSerializer
    permission_classes = [IsAdminOrCommittee]
    parser_classes = [MultiPartParser, FormParser]

    def create(self, request, *args, **kwargs):
        title = request.data.get('title')
        version = request.data.get('version', '1.0')
        pdf_file = request.FILES.get('pdf')
        
        user = request.user
        if user.role == 'admin':
            society_id = request.data.get('society_id')
            if not society_id:
                return Response({
                    'success': False,
                    'data': {},
                    'message': 'Please select a society'
                }, status=status.HTTP_400_BAD_REQUEST)
            try:
                society = Society.objects.get(id=society_id)
            except Society.DoesNotExist:
                return Response({
                    'success': False,
                    'data': {},
                    'message': 'Society not found'
                }, status=status.HTTP_404_NOT_FOUND)
        else:
            society = user.society

        if not pdf_file:
            return Response({
                'success': False,
                'data': {},
                'message': 'No PDF file provided'
            }, status=status.HTTP_400_BAD_REQUEST)

        if pdf_file.size > 10 * 1024 * 1024:
            return Response({
                'success': False,
                'data': {},
                'message': 'File size exceeds 10MB limit'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not pdf_file.name.lower().endswith('.pdf'):
            return Response({
                'success': False,
                'data': {},
                'message': 'Only PDF files are allowed'
            }, status=status.HTTP_400_BAD_REQUEST)

        bylaws_dir = os.path.join(settings.MEDIA_ROOT, 'bylaws')
        os.makedirs(bylaws_dir, exist_ok=True)
        
        filename = f"{society.id}_{pdf_file.name}"
        file_path = os.path.join(bylaws_dir, filename)
        
        with open(file_path, 'wb') as f:
            for chunk in pdf_file.chunks():
                f.write(chunk)

        extracted_text = ""
        page_count = 0
        try:
            extracted_text = extract_pdf_text(pdf_file)
            page_count = extracted_text.count('--- Page')
        except PDFEmptyError as e:
            logger.warning(f"PDF extraction warning: {e}")
            return Response({
                'success': False,
                'data': {},
                'message': 'The uploaded PDF appears to be empty or unreadable.'
            }, status=status.HTTP_400_BAD_REQUEST)
        except PDFExtractionError as e:
            logger.error(f"PDF extraction error: {e}")
            return Response({
                'success': False,
                'data': {},
                'message': 'Failed to extract PDF text. The file might be corrupted.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        bylaw = Bylaw.objects.create(
            society=society,
            title=title,
            pdf_path=f"bylaws/{filename}",
            extracted_text=extracted_text[:50000] if extracted_text else "",
            version=version,
            uploaded_by=request.user
        )

        log_audit(request.user, 'bylaw_uploaded', 'Bylaw', bylaw.id, 
                 {'title': title, 'pages': page_count}, request)

        return Response({
            'success': True,
            'data': {
                'id': bylaw.id,
                'title': bylaw.title,
                'pdf_path': bylaw.pdf_path,
                'page_count': page_count,
                'version': bylaw.version
            },
            'message': f'Bylaw uploaded successfully with {page_count} pages'
        }, status=status.HTTP_201_CREATED)


class BylawAskView(APIView):
    """
    Resident-facing bylaw Q&A endpoint.

    Pipeline:
      1. Authenticate user and block admin role
      2. Fetch user's society bylaw (multi-tenant isolated)
      3. Check cache for an existing answer
      4. Sanitise question (prompt-injection prevention)
      5. Chunk bylaw text and retrieve top relevant chunks
      6. Call Groq LLM with context + question
      7. Cache and return answer
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = BylawAskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        question = serializer.validated_data['question']
        bylaw_id = serializer.validated_data.get('bylaw_id')
        user = request.user

        if user.role == 'admin':
            return Response({
                'success': False,
                'message': 'Admin cannot ask questions about bylaws'
            }, status=status.HTTP_403_FORBIDDEN)

        # ── Cache check (keyed per society + question for isolation) ─────────
        cache_key = f"bylaw_ask_{user.society_id}_{bylaw_id or 'auto'}_{question[:50]}"
        cached = cache.get(cache_key)
        if cached:
            return Response({'success': True, 'data': cached, 'message': ''})

        # ── Fetch bylaw (enforces society isolation) ──────────────────────────
        try:
            bylaw = get_bylaw_for_user(user, bylaw_id)
        except BylawNotFoundError as e:
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_404_NOT_FOUND)
        except BylawTextEmptyError as e:
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

        # ── Sanitise question ─────────────────────────────────────────────────
        try:
            clean_question = sanitize_question(question)
        except ValueError as e:
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

        # ── Chunk and retrieve relevant context ───────────────────────────────
        bylaw_text = bylaw.extracted_text or ""
        if not bylaw_text.strip():
            return Response({
                'success': False,
                'message': 'Bylaw PDF missing or corrupted. No text could be extracted.'
            }, status=status.HTTP_400_BAD_REQUEST)

        chunks = chunk_text(bylaw_text, chunk_size=800, overlap=100)
        relevant_chunks = retrieve_relevant_chunks(chunks, clean_question, top_k=5)

        # ── Call Groq ─────────────────────────────────────────────────────────
        try:
            answer = call_groq_bylaw(
                society_name=bylaw.society.name,
                context_chunks=relevant_chunks,
                question=clean_question,
            )

            response_data = {
                'answer': answer,
                'question': question,
                'bylaw_id': bylaw.id,
                'chunks_used': len(relevant_chunks),
            }

            cache.set(cache_key, response_data, 3600)

            return Response({
                'success': True,
                'data': response_data,
                'message': ''
            })

        except GroqConfigError as e:
            logger.error(f"Bylaw Groq config error: {e}")
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        except GroqRateLimitError as e:
            logger.warning(f"Bylaw Groq rate limit: {e}")
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        except GroqServiceError as e:
            logger.error(f"Bylaw Groq service error: {e}")
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        except Exception as e:
            logger.error(f"Unexpected bylaw AI error: {e}")
            return Response({
                'success': False,
                'message': 'Unable to process request at the moment. Please try again.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)




class BylawDownloadView(APIView):
    permission_classes = [IsAdminOrCommittee]

    def get(self, request, bylaw_id):
        try:
            user = request.user
            if user.role == 'admin':
                bylaw = Bylaw.objects.get(id=bylaw_id, is_active=True)
            else:
                bylaw = Bylaw.objects.get(id=bylaw_id, society=user.society, is_active=True)
        except ObjectDoesNotExist:
            return Response({
                'success': False,
                'message': 'Bylaw not found'
            }, status=status.HTTP_404_NOT_FOUND)

        file_path = os.path.join(settings.MEDIA_ROOT, bylaw.pdf_path)
        
        if not os.path.exists(file_path):
            return Response({
                'success': False,
                'message': 'File not found'
            }, status=status.HTTP_404_NOT_FOUND)

        try:
            response = FileResponse(open(file_path, 'rb'), content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{bylaw.title}.pdf"'
            return response
        except Exception as e:
            logger.error(f"Bylaw download error: {e}")
            return Response({
                'success': False,
                'message': 'Error downloading file'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class BylawDeleteView(APIView):
    """Admin-only: permanently soft-delete a bylaw and remove its PDF from disk."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, bylaw_id):
        user = request.user
        if user.role != 'admin':
            return Response({
                'success': False,
                'message': 'Only admins can delete bylaws'
            }, status=status.HTTP_403_FORBIDDEN)

        try:
            bylaw = Bylaw.objects.get(id=bylaw_id, is_active=True)
        except Bylaw.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Bylaw not found'
            }, status=status.HTTP_404_NOT_FOUND)

        # Remove PDF file from disk
        if bylaw.pdf_path:
            file_path = os.path.join(settings.MEDIA_ROOT, bylaw.pdf_path)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except OSError as e:
                    logger.warning(f"Could not delete bylaw file {file_path}: {e}")

        bylaw_title = bylaw.title
        bylaw.is_active = False
        bylaw.save(update_fields=['is_active'])

        log_audit(request.user, 'bylaw_deleted', 'Bylaw', bylaw.id,
                  {'title': bylaw_title}, request)

        return Response({
            'success': True,
            'data': {},
            'message': f'Bylaw "{bylaw_title}" deleted successfully'
        }, status=status.HTTP_200_OK)