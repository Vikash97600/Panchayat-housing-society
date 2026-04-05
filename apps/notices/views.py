from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.db import models
from django.utils import timezone

from apps.accounts.views import log_audit
from .models import Notice
from .serializers import NoticeSerializer, NoticeCreateSerializer


class IsAdminOrCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'committee']


class NoticeListView(generics.ListAPIView):
    serializer_class = NoticeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Notice.objects.filter(society=self.request.user.society)
        
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

    def perform_create(self, serializer):
        notice = serializer.save(
            society=self.request.user.society,
            posted_by=self.request.user
        )
        log_audit(self.request.user, 'notice_created', 'Notice', notice.id,
                  {'title': notice.title}, self.request)


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