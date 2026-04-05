from rest_framework import serializers
from .models import Notice


class NoticeSerializer(serializers.ModelSerializer):
    posted_by_name = serializers.CharField(source='posted_by.full_name', read_only=True)

    class Meta:
        model = Notice
        fields = ['id', 'society', 'posted_by', 'posted_by_name', 'title', 'body', 
                  'is_pinned', 'created_at', 'expires_at']
        read_only_fields = ['created_at']


class NoticeCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notice
        fields = ['title', 'body', 'is_pinned', 'expires_at']