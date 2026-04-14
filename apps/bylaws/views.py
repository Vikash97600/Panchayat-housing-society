from rest_framework import generics, permissions, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings
from django.core.cache import cache
from django.http import FileResponse
from django.core.exceptions import ObjectDoesNotExist
import os
import logging

from apps.ai_engine.gemini_client import call_gemini
from apps.ai_engine.utils import extract_pdf_text
from apps.accounts.views import log_audit
from apps.accounts.models import Society
from .models import Bylaw
from .serializers import BylawSerializer, BylawAskSerializer

logger = logging.getLogger(__name__)


class IsAdminOrCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'secretary', 'treasurer', 'committee']


class BylawListView(generics.ListAPIView):
    serializer_class = BylawSerializer
    permission_classes = [IsAdminOrCommittee]

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
        except Exception as e:
            logger.error(f"PDF extraction error: {e}")
            return Response({
                'success': False,
                'data': {},
                'message': 'Failed to extract PDF text. Please try again.'
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
        
        society = user.society
        if not society:
            return Response({
                'success': False,
                'message': 'User is not associated with any society'
            }, status=status.HTTP_400_BAD_REQUEST)

        cache_key = f"bylaw_ask_{bylaw_id or 'auto'}_{question[:50]}"
        cached = cache.get(cache_key)
        if cached:
            return Response({
                'success': True,
                'data': cached,
                'message': ''
            })

        try:
            if bylaw_id:
                bylaw = Bylaw.objects.get(id=bylaw_id, society=society, is_active=True)
            else:
                bylaw = Bylaw.objects.filter(society=society, is_active=True).first()
                
            if not bylaw:
                return Response({
                    'success': False,
                    'message': 'No bylaws found for your society'
                }, status=status.HTTP_404_NOT_FOUND)
        except Bylaw.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Bylaw not found'
            }, status=status.HTTP_404_NOT_FOUND)

        if not bylaw.extracted_text:
            return Response({
                'success': False,
                'message': 'Bylaw text not available'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            system_prompt = f"""You are a helpful assistant for {bylaw.society.name} housing society in India.
Your job is to answer resident questions based ONLY on the official society bye-laws provided below.

Rules:
1. Answer ONLY from the bye-law text. Do not use outside knowledge.
2. Always cite the specific Rule number and Section name.
3. Be friendly, clear, and concise — maximum 4 sentences.
4. If not found in bye-laws: "This topic is not covered in the uploaded bye-laws. Please contact the committee directly."
5. Never make up rules.

Society Bye-Laws:
---
{bylaw.extracted_text[:12000]}
---"""
            
            answer = call_gemini(system_prompt, question)

            response_data = {
                'answer': answer,
                'question': question,
                'bylaw_id': bylaw_id
            }

            cache.set(cache_key, response_data, 3600)

            return Response({
                'success': True,
                'data': response_data,
                'message': ''
            })

        except Exception as e:
            logger.error(f"Bylaw AI error: {e}")
            return Response({
                'success': False,
                'message': 'AI service unavailable. Please try again later.'
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