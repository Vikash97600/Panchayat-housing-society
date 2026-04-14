from rest_framework import generics, permissions, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.generics import get_object_or_404
from django.db.models import Q
from django.utils import timezone
import logging

from apps.accounts.models import AuditLog
from apps.accounts.views import log_audit
from apps.ai_engine.groq_client import transcribe_audio, validate_audio_file
from .models import Complaint, ComplaintNote
from .serializers import (
    ComplaintListSerializer, ComplaintDetailSerializer,
    ComplaintCreateSerializer, ComplaintNoteSerializer
)

logger = logging.getLogger(__name__)


class IsAdminOrCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'secretary', 'treasurer', 'committee']


class ComplaintListCreateView(generics.ListCreateAPIView):
    serializer_class = ComplaintListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ComplaintCreateSerializer
        return ComplaintListSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == 'resident':
            queryset = Complaint.objects.filter(submitted_by=user).select_related('submitted_by', 'assigned_to')
        elif user.role in ['admin', 'secretary', 'treasurer', 'committee']:
            queryset = Complaint.objects.filter(society=user.society).select_related('submitted_by', 'assigned_to')
        else:
            queryset = Complaint.objects.filter(society=user.society).select_related('submitted_by', 'assigned_to')

        status_filter = self.request.query_params.get('status')
        priority_filter = self.request.query_params.get('priority')
        category_filter = self.request.query_params.get('category')

        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if priority_filter:
            queryset = queryset.filter(priority=priority_filter)
        if category_filter:
            queryset = queryset.filter(category=category_filter)

        return queryset

    def perform_create(self, serializer):
        complaint = serializer.save()
        log_audit(self.request.user, 'complaint_created', 'Complaint', complaint.id,
                  {'title': complaint.title}, self.request)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response({
            'success': True,
            'data': ComplaintListSerializer(serializer.instance).data,
            'message': 'Complaint submitted successfully'
        }, status=status.HTTP_201_CREATED)


class ComplaintDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Complaint.objects.all()
    serializer_class = ComplaintDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            from .serializers import ComplaintUpdateSerializer
            return ComplaintUpdateSerializer
        return ComplaintDetailSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role in ['admin', 'secretary', 'treasurer', 'committee']:
            return Complaint.objects.filter(society=user.society)
        return Complaint.objects.filter(submitted_by=user)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        
        # Check if status is already resolved - prevent editing
        if instance.status == 'resolved':
            return Response({
                'success': False,
                'message': 'Cannot edit a resolved complaint'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = self.get_serializer(instance, data=request.data, partial=kwargs.get('partial', False))
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        
        # Refresh the instance to get updated data
        instance.refresh_from_db()

        log_audit(request.user, 'complaint_updated', 'Complaint', instance.id,
                  {'changes': request.data}, request)

        return Response({
            'success': True,
            'data': ComplaintDetailSerializer(instance, context={'request': request}).data,
            'message': 'Complaint updated'
        })

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        
        # Check if user owns this complaint (only resident can delete their own)
        if instance.submitted_by != request.user and request.user.role not in ['admin', 'secretary', 'treasurer', 'committee']:
            return Response({
                'success': False,
                'message': 'You can only delete your own complaints'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Check if already resolved
        if instance.status == 'resolved':
            return Response({
                'success': False,
                'message': 'Cannot delete a resolved complaint. Contact committee.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        complaint_id = instance.id
        complaint_title = instance.title
        instance.delete()
        
        log_audit(request.user, 'complaint_deleted', 'Complaint', complaint_id,
                  {'title': complaint_title}, request)

        return Response({
            'success': True,
            'message': 'Complaint deleted successfully'
        })


class ComplaintNoteView(generics.CreateAPIView):
    serializer_class = ComplaintNoteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ['admin', 'secretary', 'treasurer', 'committee']:
            return Complaint.objects.filter(society=user.society)
        return Complaint.objects.filter(submitted_by=user)

    def get_object(self):
        pk = self.kwargs.get('pk')
        logger.info(f"[NOTES] Getting complaint with pk={pk}")
        queryset = self.get_queryset()
        return get_object_or_404(queryset, pk=pk)

    def create(self, request, *args, **kwargs):
        logger.info(f"[NOTES] Request method: {request.method}")
        logger.info(f"[NOTES] Request content_type: {request.content_type}")
        logger.info(f"[NOTES] Request data: {request.data}")
        
        try:
            complaint = self.get_object()
            logger.info(f"[NOTES] Complaint ID: {complaint.id}")
            
            serializer = self.get_serializer(data=request.data)
            logger.info(f"[NOTES] Serializer data: {serializer.initial_data}")
            
            is_valid = serializer.is_valid()
            logger.info(f"[NOTES] Serializer is_valid: {is_valid}")
            if not is_valid:
                logger.error(f"[NOTES] Serializer errors: {serializer.errors}")
                return Response({
                    'success': False,
                    'message': f'Validation error: {serializer.errors}'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Save the note
            note = serializer.save(complaint=complaint, author=request.user)
            logger.info(f"[NOTES] Note saved successfully: id={note.id}")

            log_audit(request.user, 'note_added', 'Complaint', complaint.id, request=request)

            return Response({
                'success': True,
                'data': ComplaintNoteSerializer(note).data,
                'message': 'Note added'
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"[NOTES] Error: {type(e).__name__}: {str(e)}")
            return Response({
                'success': False,
                'message': f'Error: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)


class VoiceTranscribeView(generics.GenericAPIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        audio_file = request.FILES.get('audio_file')
        if not audio_file:
            return Response({
                'success': False,
                'message': 'No audio file provided'
            }, status=status.HTTP_400_BAD_REQUEST)

        max_size = 10 * 1024 * 1024
        if audio_file.size > max_size:
            return Response({
                'success': False,
                'message': 'File too large (max 10MB)'
            }, status=status.HTTP_400_BAD_REQUEST)

        allowed_types = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a']
        content_type = audio_file.content_type
        if content_type not in allowed_types:
            return Response({
                'success': False,
                'message': 'Unsupported audio format'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = transcribe_audio(audio_file)
            return Response({
                'success': True,
                'data': result,
                'message': 'Transcription completed'
            })
        except Exception as e:
            logger.error(f"Voice transcription error: {e}")
            return Response({
                'success': False,
                'message': 'Transcription service unavailable'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)