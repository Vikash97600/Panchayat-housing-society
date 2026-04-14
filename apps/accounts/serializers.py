from rest_framework import serializers
from .models import CustomUser, Society, AuditLog, CommitteeMember, Resident


class SocietySerializer(serializers.ModelSerializer):
    class Meta:
        model = Society
        fields = '__all__'
        read_only_fields = ['is_active']


class CustomUserSerializer(serializers.ModelSerializer):
    society_name = serializers.CharField(source='society.name', read_only=True)
    flat_no = serializers.SerializerMethodField()
    wing = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = ['id', 'email', 'full_name', 'role', 'flat_no', 'wing', 'phone', 
                  'society', 'society_name', 'is_approved', 'is_active', 'created_at', 'last_login']
        read_only_fields = ['created_at', 'last_login']

    def get_full_name(self, obj):
        return obj.get_full_name()
    
    def get_flat_no(self, obj):
        if obj.flat_no:
            return obj.flat_no
        if hasattr(obj, 'resident_profile') and obj.resident_profile:
            return obj.resident_profile.flat_no
        return None
    
    def get_wing(self, obj):
        if obj.wing:
            return obj.wing
        if hasattr(obj, 'resident_profile') and obj.resident_profile:
            return obj.resident_profile.wing_no
        return None


class CustomUserCreateSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = CustomUser
        fields = ['email', 'password', 'password_confirm', 'full_name', 'role', 
                  'flat_no', 'wing', 'phone', 'society']

    def get_full_name(self, obj):
        return obj.get_full_name() if obj else ''

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError("Passwords do not match")
        return data

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = CustomUser(**validated_data)
        user.set_password(password)
        user.is_approved = False
        user.save()
        return user


class UserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class UserProfileSerializer(serializers.ModelSerializer):
    society_name = serializers.CharField(source='society.name', read_only=True)
    flat_no = serializers.SerializerMethodField()
    wing = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = ['id', 'email', 'full_name', 'role', 'flat_no', 'wing', 'phone', 
                  'society', 'society_name', 'is_approved', 'is_active', 'created_at', 'last_login']
        read_only_fields = ['created_at', 'last_login']

    def get_full_name(self, obj):
        return obj.get_full_name()
    
    def get_flat_no(self, obj):
        if obj.flat_no:
            return obj.flat_no
        if hasattr(obj, 'resident_profile') and obj.resident_profile:
            return obj.resident_profile.flat_no
        return None
    
    def get_wing(self, obj):
        if obj.wing:
            return obj.wing
        if hasattr(obj, 'resident_profile') and obj.resident_profile:
            return obj.resident_profile.wing_no
        return None


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(min_length=6)
    password_confirm = serializers.CharField(min_length=6)

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError("Passwords do not match")
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(min_length=6)
    confirm_password = serializers.CharField(min_length=6)

    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError("New passwords do not match")
        return data


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    
    class Meta:
        model = AuditLog
        fields = ['id', 'user_name', 'action', 'model_name', 'object_id', 'details', 'ip_address', 'timestamp']
        read_only_fields = ['timestamp']
    
    def get_user_name(self, obj):
        return obj.user.get_full_name() if obj.user else 'System'


class CommitteeMemberSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = CommitteeMember
        fields = ['id', 'user', 'user_name', 'user_email', 'society', 'role', 'created_at']
        read_only_fields = ['created_at']

    def get_user_name(self, obj):
        return obj.user.get_full_name() if obj.user else ''


class AssignCommitteeSerializer(serializers.Serializer):
    society_id = serializers.IntegerField()
    secretary = serializers.DictField()
    treasurer = serializers.DictField()


class ResidentSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = Resident
        fields = ['id', 'user', 'user_name', 'user_email', 'society', 'flat_no', 'wing_no', 'mobile_no', 'created_at']
        read_only_fields = ['created_at']

    def get_user_name(self, obj):
        return obj.user.get_full_name() if obj.user else ''


class AddResidentSerializer(serializers.Serializer):
    name = serializers.CharField()
    email = serializers.EmailField()
    mobile_no = serializers.CharField()
    flat_no = serializers.CharField()
    wing_no = serializers.CharField()
    password = serializers.CharField(min_length=6)
    confirm_password = serializers.CharField()

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError("Passwords do not match")
        return data