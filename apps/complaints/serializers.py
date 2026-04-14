from rest_framework import serializers
from .models import Complaint, ComplaintNote


class ComplaintNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True)

    class Meta:
        model = ComplaintNote
        fields = ['id', 'author', 'author_name', 'note', 'created_at']
        read_only_fields = ['created_at']


class ComplaintListSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.CharField(source='submitted_by.full_name', read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    flat_no = serializers.SerializerMethodField()
    wing = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = ['id', 'title', 'description', 'category', 'priority', 'status', 'submitted_by', 
                  'submitted_by_name', 'assigned_to', 'assigned_to_name', 'created_at', 'updated_at',
                  'flat_no', 'wing', 'can_edit', 'can_delete']

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.email
        return None

    def get_flat_no(self, obj):
        if obj.submitted_by.flat_no:
            return obj.submitted_by.flat_no
        if hasattr(obj.submitted_by, 'resident_profile') and obj.submitted_by.resident_profile:
            return obj.submitted_by.resident_profile.flat_no
        return None
    
    def get_wing(self, obj):
        if obj.submitted_by.wing:
            return obj.submitted_by.wing
        if hasattr(obj.submitted_by, 'resident_profile') and obj.submitted_by.resident_profile:
            return obj.submitted_by.resident_profile.wing_no
        return None

    def get_can_edit(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        user = request.user
        if user.role in ['admin', 'secretary', 'treasurer', 'committee']:
            return True
        return obj.submitted_by == user and obj.status not in ['resolved', 'closed']

    def get_can_delete(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        user = request.user
        if user.role in ['admin', 'secretary', 'treasurer', 'committee']:
            return True
        return obj.submitted_by == user and obj.status == 'open'


class ComplaintCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Complaint
        fields = ['title', 'description', 'category', 'priority', 'audio_file_path', 'ai_transcript', 'language']

    def create(self, validated_data):
        validated_data['society'] = self.context['request'].user.society
        validated_data['submitted_by'] = self.context['request'].user
        return super().create(validated_data)


class ComplaintDetailSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.CharField(source='submitted_by.full_name', read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    flat_no = serializers.SerializerMethodField()
    wing = serializers.SerializerMethodField()
    notes = ComplaintNoteSerializer(many=True, read_only=True)
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = ['id', 'society', 'submitted_by', 'submitted_by_name', 'title', 'description',
                  'audio_file_path', 'ai_transcript', 'language', 'category', 'priority', 
                  'status', 'assigned_to', 'assigned_to_name', 'created_at', 'updated_at', 
                  'resolved_at', 'notes', 'flat_no', 'wing', 'can_edit', 'can_delete']
        read_only_fields = ['created_at', 'updated_at', 'resolved_at']

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.email
        return None

    def get_flat_no(self, obj):
        if obj.submitted_by.flat_no:
            return obj.submitted_by.flat_no
        if hasattr(obj.submitted_by, 'resident_profile') and obj.submitted_by.resident_profile:
            return obj.submitted_by.resident_profile.flat_no
        return None
    
    def get_wing(self, obj):
        if obj.submitted_by.wing:
            return obj.submitted_by.wing
        if hasattr(obj.submitted_by, 'resident_profile') and obj.submitted_by.resident_profile:
            return obj.submitted_by.resident_profile.wing_no
        return None

    def get_can_edit(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        user = request.user
        if user.role in ['admin', 'secretary', 'treasurer', 'committee']:
            return True
        return obj.submitted_by == user and obj.status not in ['resolved', 'closed']

    def get_can_delete(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        user = request.user
        if user.role in ['admin', 'secretary', 'treasurer', 'committee']:
            return True
        return obj.submitted_by == user and obj.status == 'open'


class ComplaintUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Complaint
        fields = ['title', 'description', 'category', 'priority', 'status', 'assigned_to']

    def update(self, instance, validated_data):
        old_status = instance.status
        new_status = validated_data.get('status', old_status)
        
        if new_status == 'resolved' and old_status != 'resolved':
            from django.utils import timezone
            instance.resolved_at = timezone.now()
        
        return super().update(instance, validated_data)