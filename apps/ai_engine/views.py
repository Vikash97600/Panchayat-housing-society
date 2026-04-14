import logging
from hashlib import md5

from rest_framework.views import APIView
from rest_framework import permissions, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.throttling import UserRateThrottle
from rest_framework.response import Response
from django.core.cache import cache
from django.utils import timezone
from datetime import datetime, date
import json

from apps.ai_engine.gemini_client import call_gemini
from apps.ai_engine.groq_client import transcribe_audio, validate_audio_file
from apps.complaints.models import Complaint
from apps.bylaws.models import Bylaw

logger = logging.getLogger(__name__)


class IsAdminOrCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.role in ['admin', 'secretary', 'treasurer', 'committee']


CATEGORIZE_PROMPT = """You are an assistant for a housing society. Analyze complaints and categorize them.
Respond with ONLY valid JSON (no markdown, no extra text):
{
  "title": "Short descriptive title (max 50 chars)",
  "category": "plumbing, electrical, lift, parking, noise, cleanliness, security, or other",
  "priority": "low, medium, or urgent",
  "reason": "brief explanation (max 30 words)"
}
Categories: plumbing (pipes, taps, leaks, water, drainage), electrical (lights, fans, power), lift, parking, noise (loud music, parties), cleanliness (dust, garbage), security (guards, entry)."""


class VoiceComplaintCategorizeView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        prompt = request.data.get('prompt', '').strip()
        
        if not prompt:
            return Response({
                'success': False,
                'message': 'Prompt required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = call_gemini(
                system_prompt=CATEGORIZE_PROMPT,
                user_message=prompt,
                max_tokens=256
            )
            
            # Parse JSON from response
            try:
                # Extract JSON from response
                json_start = result.find('{')
                json_end = result.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    json_str = result[json_start:json_end]
                    data = json.loads(json_str)
                else:
                    data = json.loads(result)
                
                return Response({'success': True, 'data': data})
            except json.JSONDecodeError:
                # Fallback parsing
                return Response({
                    'success': True,
                    'data': {
                        'title': 'Voice Complaint',
                        'category': 'other',
                        'priority': 'medium',
                        'reason': 'AI response parsing failed'
                    }
                })
                
        except Exception as e:
            logger.error(f"Categorization error: {e}")
            return Response({
                'success': False,
                'message': 'AI service unavailable'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class VoiceTranscribeView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser]
    throttle_classes = [UserRateThrottle]
    
    def post(self, request):
        audio = request.FILES.get('audio')
        
        if not audio:
            return Response(
                {'success': False, 'message': 'No audio file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        allowed_types = ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/mp3', 'audio/ogg']
        if audio.content_type not in allowed_types:
            return Response(
                {'success': False, 'message': 'Unsupported audio format'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if audio.size > 10 * 1024 * 1024:
            return Response(
                {'success': False, 'message': 'File too large (max 10MB)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            result = transcribe_audio(audio)
            return Response({'success': True, 'data': result})
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return Response(
                {'success': False, 'message': 'Transcription failed. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class BylawAskView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [UserRateThrottle]
    
    def post(self, request):
        question = request.data.get('question', '').strip()
        bylaw_id = request.data.get('bylaw_id')
        
        if not question:
            return Response(
                {'success': False, 'message': 'Question is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not bylaw_id:
            return Response(
                {'success': False, 'message': 'Bylaw ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        cache_key = f"bylaw_qa_{bylaw_id}_{md5(question.encode()).hexdigest()}"
        cached = cache.get(cache_key)
        if cached:
            return Response({'success': True, 'data': cached, 'cached': True})
        
        try:
            bylaw = Bylaw.objects.get(id=bylaw_id, is_active=True)
        except Bylaw.DoesNotExist:
            return Response(
                {'success': False, 'message': 'Bylaw not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if not bylaw.extracted_text:
            return Response(
                {'success': False, 'message': 'Bylaw text not available'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        society_name = bylaw.society.name
        system_prompt = f"""You are a helpful assistant for {society_name} housing society in India.
Your job is to answer resident questions based ONLY on the official society bye-laws provided below.

Rules you must follow:
1. Answer ONLY from the bye-law text. Do not use outside knowledge.
2. Always cite the specific Rule number and Section name.
3. Be friendly, clear, and concise — maximum 4 sentences.
4. If the answer is not found in the bye-laws, respond exactly:
   "This topic is not covered in the uploaded bye-laws. Please contact the committee directly."
5. Never make up or assume rules that are not written.

Society Bye-Laws:
---
{bylaw.extracted_text[:12000]}
---"""
        
        try:
            answer = call_gemini(system_prompt, question)
            data = {
                "answer": answer,
                "question": question,
                "bylaw_id": bylaw_id,
                "society": society_name
            }
            cache.set(cache_key, data, timeout=3600)
            return Response({'success': True, 'data': data})
        except Exception as e:
            logger.error(f"Bylaw AI error: {e}")
            return Response(
                {'success': False, 'message': 'AI service unavailable. Please try again later.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


AI_SUMMARY_PROMPT = """You are an assistant for a housing society committee secretary in India.
Below are resident complaints submitted today.

Your task:
1. Group similar complaints together (e.g. all lift complaints = 1 point)
2. Summarise into 3 to 5 bullet points maximum
3. Mark urgent ones with [URGENT] prefix
4. Keep each bullet to 1 concise sentence
5. End with: "Total: X complaints from Y unique flats"

Today's complaints:
{complaints_json}
"""


class AISummaryView(APIView):
    permission_classes = [IsAdminOrCommittee]
    
    def get(self, request):
        force_refresh = request.query_params.get('refresh') == 'true'
        cache_key = f"ai_summary_{request.user.society_id}_{date.today()}"
        
        if not force_refresh:
            cached = cache.get(cache_key)
            if cached:
                return Response({'success': True, 'data': cached, 'cached': True})
        
        today_complaints = Complaint.objects.filter(
            society=request.user.society,
            created_at__date=date.today()
        ).select_related('submitted_by')
        
        if not today_complaints.exists():
            return Response({'success': True, 'data': {
                'summary': 'No complaints submitted today.',
                'complaint_count': 0,
                'generated_at': datetime.now().isoformat()
            }})
        
        complaints_list = []
        for c in today_complaints[:30]:
            complaints_list.append({
                'id': c.id,
                'title': c.title,
                'description': c.description,
                'priority': c.priority,
                'category': c.category,
                'flat_no': c.submitted_by.flat_no if hasattr(c.submitted_by, 'flat_no') else '-'
            })
        
        complaints_json = json.dumps(complaints_list, default=str)
        prompt = AI_SUMMARY_PROMPT.format(complaints_json=complaints_json)
        
        try:
            summary_text = call_gemini(
                system_prompt="You are a concise housing society assistant.",
                user_message=prompt,
                max_tokens=512
            )
            unique_flats = today_complaints.values('submitted_by').distinct().count()
            data = {
                'summary': summary_text,
                'complaint_count': today_complaints.count(),
                'unique_flats': unique_flats,
                'generated_at': datetime.now().isoformat()
            }
            cache.set(cache_key, data, timeout=300)
            return Response({'success': True, 'data': data})
        except Exception as e:
            logger.error(f"AI summary error: {e}")
            return Response(
                {'success': False, 'message': 'AI service unavailable. Please try again later.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


MAINTENANCE_PROMPT = """Explain this housing society maintenance expense breakdown in simple, friendly language for a resident — not an accountant.
Keep it to 2 to 3 sentences only. Mention the biggest expense.
Do not use accounting jargon.

Month: {month}
Total amount: Rs. {total}
Breakdown: {breakdown}
"""


class MaintenanceExplanationView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    @staticmethod
    def get_explanation(month, breakdown, total):
        prompt = MAINTENANCE_PROMPT.format(
            month=month,
            total=total,
            breakdown=json.dumps(breakdown)
        )
        
        try:
            return call_gemini(
                system_prompt="You are a friendly housing society assistant.",
                user_message=prompt,
                max_tokens=200
            )
        except Exception as e:
            logger.error(f"Maintenance explanation error: {e}")
            return "AI explanation temporarily unavailable."