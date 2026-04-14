from rest_framework import serializers
from .models import Bylaw


class BylawSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True)
    society_name = serializers.CharField(source='society.name', read_only=True)

    class Meta:
        model = Bylaw
        fields = ['id', 'society', 'society_name', 'title', 'pdf_path', 'extracted_text', 'version', 
                  'uploaded_by', 'uploaded_by_name', 'uploaded_at', 'is_active']
        read_only_fields = ['uploaded_at', 'extracted_text']


class BylawUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bylaw
        fields = ['title', 'pdf', 'version']

    pdf = serializers.FileField()


class BylawAskSerializer(serializers.Serializer):
    question = serializers.CharField()
    bylaw_id = serializers.IntegerField(required=False)


class BylawAskResponseSerializer(serializers.Serializer):
    answer = serializers.CharField()
    question = serializers.CharField()
    bylaw_id = serializers.IntegerField()