from rest_framework import generics, permissions, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings
from django.core.cache import cache
import os
import logging

from apps.ai_engine.gemini_client import call_gemini
from apps.ai_engine.utils import extract_pdf_text
from apps.accounts.views import log_audit
from .models import Bylaw
from .serializers import BylawSerializer, BylawAskSerializer

logger = logging.getLogger(__name__)


class IsAdminOrCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'committee']


class BylawListView(generics.ListAPIView):
    serializer_class = BylawSerializer
    permission_classes = [IsAdminOrCommittee]

    def get_queryset(self):
        return Bylaw.objects.filter(
            society=self.request.user.society,
            is_active=True
        ).select_related('uploaded_by')


class BylawUploadView(generics.CreateAPIView):
    serializer_class = BylawSerializer
    permission_classes = [IsAdminOrCommittee]
    parser_classes = [MultiPartParser, FormParser]

    def create(self, request, *args, **kwargs):
        title = request.data.get('title')
        version = request.data.get('version', '1.0')
        pdf_file = request.FILES.get('pdf')

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
        
        filename = f"{request.user.society.id}_{pdf_file.name}"
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
            society=request.user.society,
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
        bylaw_id = serializer.validated_data['bylaw_id']

        cache_key = f"bylaw_ask_{bylaw_id}_{question[:50]}"
        cached = cache.get(cache_key)
        if cached:
            return Response({
                'success': True,
                'data': cached,
                'message': ''
            })

        try:
            bylaw = Bylaw.objects.get(id=bylaw_id, society=request.user.society, is_active=True)
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