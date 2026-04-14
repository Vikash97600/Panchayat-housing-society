from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from django.db import models
from django.utils import timezone

from apps.accounts.views import log_audit
from .models import Notice
from .serializers import NoticeSerializer, NoticeCreateSerializer, NoticeUpdateSerializer


class IsAdminOrCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'secretary', 'treasurer', 'committee']


class NoticeListView(generics.ListAPIView):
    serializer_class = NoticeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            queryset = Notice.objects.all()
        else:
            queryset = Notice.objects.filter(society=user.society)
        
        active_only = self.request.query_params.get('active')
        if active_only == 'true':
            now = timezone.now()
            queryset = queryset.filter(
                models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
            )
        
        return queryset.select_related('posted_by')


class NoticeCreateView(generics.CreateAPIView):
    serializer_class = NoticeCreateSerializer
    permission_classes = [IsAdminOrCommittee]

    def create(self, request, *args, **kwargs):
        user = self.request.user
        if not user.society:
            return Response({
                'success': False,
                'data': {},
                'message': 'User is not associated with any society'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        notice = serializer.save(
            society=user.society,
            posted_by=user
        )
        
        log_audit(self.request.user, 'notice_created', 'Notice', notice.id,
                  {'title': notice.title}, self.request)
        
        from .serializers import NoticeSerializer
        return Response({
            'success': True,
            'data': NoticeSerializer(notice).data,
            'message': 'Notice posted successfully'
        }, status=status.HTTP_201_CREATED)


class NoticeDeleteView(generics.DestroyAPIView):
    queryset = Notice.objects.all()
    permission_classes = [IsAdminOrCommittee]

    def get_queryset(self):
        return Notice.objects.filter(society=self.request.user.society)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        log_audit(request.user, 'notice_deleted', 'Notice', instance.id,
                  {'title': instance.title}, request)
        return super().destroy(request, *args, **kwargs)


class NoticeUpdateView(generics.UpdateAPIView):
    queryset = Notice.objects.all()
    serializer_class = NoticeUpdateSerializer
    permission_classes = [IsAdminOrCommittee]

    def get_queryset(self):
        return Notice.objects.filter(society=self.request.user.society)

    def perform_update(self, serializer):
        notice = serializer.save()
        log_audit(self.request.user, 'notice_updated', 'Notice', notice.id,
                  {'title': notice.title}, self.request)