from rest_framework import serializers
from .models import ChatRoom, Message, MessageVisibility
from apps.accounts.serializers import UserProfileSerializer


class MessageSerializer(serializers.ModelSerializer):
    """Serializer for chat messages with visibility filtering."""
    sender_name = serializers.CharField(source='sender.get_full_name', read_only=True)
    sender_email = serializers.CharField(source='sender.email', read_only=True)
    sender_role = serializers.CharField(source='sender.role', read_only=True)
    is_me = serializers.SerializerMethodField()
    is_deleted_for_everyone = serializers.BooleanField(read_only=True)
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 'content', 'created_at', 'is_read', 'sender',
            'sender_name', 'sender_email', 'sender_role', 'is_me',
            'is_deleted_for_everyone', 'can_delete'
        ]
        read_only_fields = [
            'id', 'created_at', 'is_read', 'sender',
            'sender_name', 'sender_email', 'sender_role',
            'is_deleted_for_everyone'
        ]

    def get_is_me(self, obj):
        """Check if the message is sent by the current user."""
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user and request.user.is_authenticated:
            return obj.sender.id == request.user.id
        return False

    def get_can_delete(self, obj):
        """Check if user can delete this message (only sender, not deleted)."""
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user and request.user.is_authenticated:
            return obj.sender.id == request.user.id and not obj.is_deleted_for_everyone
        return False

    def to_representation(self, instance):
        """Customize output based on message state."""
        data = super().to_representation(instance)
        if instance.is_deleted_for_everyone:
            data['content'] = 'This message was deleted'
        return data


class ChatRoomSerializer(serializers.ModelSerializer):
    """Serializer for chat rooms with message and unread count."""
    resident_name = serializers.CharField(source='resident.get_full_name', read_only=True)
    committee_name = serializers.CharField(source='committee.get_full_name', read_only=True)
    resident_info = UserProfileSerializer(source='resident', read_only=True)
    committee_info = UserProfileSerializer(source='committee', read_only=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    other_user = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = [
            'id', 'resident', 'committee', 'created_at', 'updated_at',
            'resident_name', 'committee_name', 'resident_info', 'committee_info',
            'last_message', 'unread_count', 'other_user'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_last_message(self, obj):
        """Get the last visible message in the room."""
        request = self.context.get('request')
        user = request.user if request and hasattr(request, 'user') else None
        
        if not user or not user.is_authenticated:
            return None
        
        # Get hidden message IDs for this user
        hidden_ids = set(
            MessageVisibility.objects.filter(
                user=user,
                is_hidden=True
            ).values_list('message_id', flat=True)
        )
        
        # Get last non-hidden, non-deleted message
        messages = obj.messages.exclude(
            id__in=hidden_ids
        ).exclude(
            is_deleted_for_everyone=True
        ).order_by('-created_at')[:1]
        
        for msg in messages:
            data = MessageSerializer(msg, context=self.context).data
            return data
        return None

    def get_unread_count(self, obj):
        """Get count of unread messages for current user."""
        request = self.context.get('request')
        user = request.user if request and hasattr(request, 'user') else None
        
        if not user or not user.is_authenticated:
            return 0
        
        # Get hidden message IDs
        hidden_ids = set(
            MessageVisibility.objects.filter(
                user=user,
                is_hidden=True
            ).values_list('message_id', flat=True)
        )
        
        # Count unread, non-hidden, non-deleted messages from others
        unread = obj.messages.filter(
            is_read=False
        ).exclude(
            sender=user
        ).exclude(
            id__in=hidden_ids
        ).exclude(
            is_deleted_for_everyone=True
        )
        
        return unread.count()

    def get_other_user(self, obj):
        """Get serialized data for the other participant."""
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user and request.user.is_authenticated:
            other = obj.get_other_user(request.user)
            if other:
                return {
                    'id': other.id,
                    'name': other.get_full_name() or other.email,
                    'role': other.role,
                    'email': other.email,
                    'avatar': other.profile_picture.url if hasattr(other, 'profile_picture') and other.profile_picture else None
                }
        return None


class CreateMessageSerializer(serializers.ModelSerializer):
    """Serializer for creating messages."""

    class Meta:
        model = Message
        fields = ['content']

    def validate_content(self, value):
        """Validate message content is not empty and not too long."""
        if not value or not value.strip():
            raise serializers.ValidationError("Message content cannot be empty")
        if len(value) > 2000:
            raise serializers.ValidationError("Message content cannot exceed 2000 characters")
        return value.strip()


class CreateChatRoomSerializer(serializers.ModelSerializer):
    """Serializer for creating chat rooms with another user."""
    other_user_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = ChatRoom
        fields = ['other_user_id']

    def validate_other_user_id(self, value):
        """Validate the other user exists and role is compatible."""
        from apps.accounts.models import CustomUser
        
        try:
            user = CustomUser.objects.get(id=value, is_active=True)
        except CustomUser.DoesNotExist:
            raise serializers.ValidationError("User not found or inactive")
        
        request = self.context.get('request')
        if not request:
            raise serializers.ValidationError("Request context not available")
        
        current_user = request.user
        
        # Validate role combination - allow resident <-> committee chat
        if current_user.role == 'resident' and user.role not in ['committee']:
            raise serializers.ValidationError("Residents can only chat with committee members")
        
        if current_user.role == 'committee' and user.role not in ['resident']:
            raise serializers.ValidationError("Committee members can only chat with residents")
        
        if current_user.role == 'admin':
            raise serializers.ValidationError("Admins cannot chat")
        
        return value

    def create(self, validated_data):
        """Create or get existing chat room."""
        from apps.accounts.models import CustomUser
        
        current_user = self.context.get('request').user
        other_user = CustomUser.objects.get(id=validated_data['other_user_id'])
        
        # Determine who is resident and who is committee
        if current_user.role == 'resident':
            resident = current_user
            committee = other_user
        else:
            resident = other_user
            committee = current_user
        
        # Check if room already exists, create if not
        room, created = ChatRoom.objects.get_or_create(
            resident=resident,
            committee=committee
        )
        
        return room