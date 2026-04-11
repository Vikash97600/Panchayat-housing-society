from rest_framework import generics, status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q
from django.utils import timezone
from datetime import timedelta
from .models import ChatRoom, Message, MessageVisibility
from .serializers import (
    ChatRoomSerializer, 
    MessageSerializer, 
    CreateMessageSerializer,
    CreateChatRoomSerializer
)


class IsChatUser(permissions.BasePermission):
    """Permission check for chat access."""
    
    def has_permission(self, request, view):
        user = request.user
        return user and user.is_authenticated and user.role in ['resident', 'committee']


class ChatRoomListView(generics.ListAPIView):
    """
    GET /api/chat/rooms/
    List all chat rooms for the logged-in user.
    """
    serializer_class = ChatRoomSerializer
    permission_classes = [IsChatUser]

    def get_queryset(self):
        user = self.request.user
        return ChatRoom.objects.filter(
            Q(resident=user) | Q(committee=user)
        ).select_related('resident', 'committee').prefetch_related('messages')


class CreateChatRoomView(generics.CreateAPIView):
    """
    POST /api/chat/rooms/create/
    Create a new chat room with another user.
    """
    serializer_class = CreateChatRoomSerializer
    permission_classes = [IsChatUser]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        room = serializer.save()
        
        response_serializer = ChatRoomSerializer(room, context={'request': request})
        return Response({
            'success': True,
            'data': response_serializer.data,
            'message': 'Chat room created successfully'
        }, status=status.HTTP_201_CREATED)


class GetChatUsersView(APIView):
    """
    GET /api/chat/users/
    Get list of users that the current user can chat with.
    Residents get committee members, Committee members get residents.
    """
    permission_classes = [IsChatUser]

    def get(self, request):
        from apps.accounts.models import CustomUser
        from apps.accounts.serializers import UserProfileSerializer
        
        user = request.user
        
        if not user.society:
            return Response({
                'success': False,
                'message': 'User has no society assigned'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get both committee members and residents in the same society
        users = CustomUser.objects.filter(
            society=user.society,
            is_active=True,
            is_approved=True
        ).exclude(id=user.id)
        
        serializer = UserProfileSerializer(users, many=True)
        return Response({
            'success': True,
            'data': serializer.data
        })


class MessageListView(generics.ListAPIView):
    """
    GET /api/chat/rooms/{room_id}/messages/
    Get all messages in a chat room (excluding hidden and deleted).
    """
    serializer_class = MessageSerializer
    permission_classes = [IsChatUser]

    def get_queryset(self):
        room_id = self.kwargs.get('room_id')
        user = self.request.user
        
        try:
            room = ChatRoom.objects.get(
                Q(resident=user) | Q(committee=user),
                id=room_id
            )
        except ChatRoom.DoesNotExist:
            return Message.objects.none()
        
        hidden_message_ids = set(
            MessageVisibility.objects.filter(
                user=user,
                is_hidden=True
            ).values_list('message_id', flat=True)
        )
        
        Message.objects.filter(
            room=room,
            is_read=False
        ).exclude(sender=user).update(is_read=True)
        
        return room.messages.exclude(
            id__in=hidden_message_ids
        ).select_related('sender')


class SendMessageView(generics.CreateAPIView):
    """
    POST /api/chat/rooms/{room_id}/messages/
    Send a message to a chat room.
    """
    serializer_class = CreateMessageSerializer
    permission_classes = [IsChatUser]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['room_id'] = self.kwargs.get('room_id')
        return context

    def create(self, request, *args, **kwargs):
        room_id = self.kwargs.get('room_id')
        user = request.user

        # Validate room access
        try:
            room = ChatRoom.objects.get(
                Q(resident=user) | Q(committee=user),
                id=room_id
            )
        except ChatRoom.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Chat room not found or access denied'
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = CreateMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Create message
        message = Message.objects.create(
            room=room,
            sender=user,
            content=serializer.validated_data['content']
        )

        # Update room timestamp
        room.save()  # This updates updated_at

        response_serializer = MessageSerializer(message, context={'request': request})
        return Response({
            'success': True,
            'data': response_serializer.data,
            'message': 'Message sent successfully'
        }, status=status.HTTP_201_CREATED)


class MarkMessagesReadView(APIView):
    """
    POST /api/chat/rooms/{room_id}/mark-read/
    Mark all messages in a room as read.
    """
    permission_classes = [IsChatUser]

    def post(self, request, room_id):
        user = request.user

        # Validate room access
        try:
            room = ChatRoom.objects.get(
                Q(resident=user) | Q(committee=user),
                id=room_id
            )
        except ChatRoom.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Chat room not found'
            }, status=status.HTTP_404_NOT_FOUND)

        # Mark unread messages as read (excluding own messages)
        updated = Message.objects.filter(
            room=room,
            is_read=False
        ).exclude(sender=user).update(is_read=True)

        return Response({
            'success': True,
            'message': f'{updated} messages marked as read'
        })


class GetUnreadCountView(APIView):
    """
    GET /api/chat/unread-count/
    Get total unread message count for current user.
    """
    permission_classes = [IsChatUser]

    def get(self, request):
        user = request.user
        
        rooms = ChatRoom.objects.filter(
            Q(resident=user) | Q(committee=user)
        )
        
        hidden_message_ids = set(
            MessageVisibility.objects.filter(
                user=user,
                is_hidden=True
            ).values_list('message_id', flat=True)
        )
        
        unread_count = Message.objects.filter(
            room__in=rooms,
            is_read=False
        ).exclude(sender=user).exclude(
            id__in=hidden_message_ids
        ).exclude(
            is_deleted_for_everyone=True
        ).count()

        return Response({
            'success': True,
            'data': {'unread_count': unread_count}
        })


class DeleteMessageForMeView(APIView):
    """
    DELETE /api/chat/rooms/{room_id}/messages/{message_id}/delete-for-me/
    Delete message for current user only (hide from view).
    """
    permission_classes = [IsChatUser]

    def post(self, request, room_id, message_id):
        user = request.user
        
        try:
            room = ChatRoom.objects.get(
                Q(resident=user) | Q(committee=user),
                id=room_id
            )
        except ChatRoom.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Chat room not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        try:
            message = Message.objects.get(id=message_id, room=room)
        except Message.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Message not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        MessageVisibility.objects.get_or_create(
            user=user,
            message=message,
            defaults={'is_hidden': True}
        )

        return Response({
            'success': True,
            'message': 'Message deleted for you'
        })


class DeleteMessageForEveryoneView(APIView):
    """
    DELETE /api/chat/rooms/{room_id}/messages/{message_id}/delete-for-everyone/
    Delete message for everyone (within time limit).
    """
    permission_classes = [IsChatUser]
    DELETE_TIME_LIMIT = timedelta(minutes=10)

    def post(self, request, room_id, message_id):
        user = request.user
        now = timezone.now()
        
        try:
            room = ChatRoom.objects.get(
                Q(resident=user) | Q(committee=user),
                id=room_id
            )
        except ChatRoom.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Chat room not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        try:
            message = Message.objects.get(id=message_id, room=room, sender=user)
        except Message.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Message not found or you are not the sender'
            }, status=status.HTTP_404_NOT_FOUND)
        
        if message.is_deleted_for_everyone:
            return Response({
                'success': False,
                'message': 'Message already deleted'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if now - message.created_at > self.DELETE_TIME_LIMIT:
            return Response({
                'success': False,
                'message': 'Delete time limit expired (10 minutes)'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        message.is_deleted_for_everyone = True
        message.deleted_at = now
        message.save()

        return Response({
            'success': True,
            'message': 'Message deleted for everyone'
        })


class ClearChatView(APIView):
    """
    DELETE /api/chat/rooms/{room_id}/clear/
    Clear chat history for current user.
    """
    permission_classes = [IsChatUser]

    def post(self, request, room_id):
        user = request.user
        
        try:
            room = ChatRoom.objects.get(
                Q(resident=user) | Q(committee=user),
                id=room_id
            )
        except ChatRoom.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Chat room not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        message_ids = list(room.messages.values_list('id', flat=True))
        
        for msg_id in message_ids:
            MessageVisibility.objects.get_or_create(
                user=user,
                message_id=msg_id,
                defaults={'is_hidden': True}
            )

        return Response({
            'success': True,
            'message': f'Chat cleared ({len(message_ids)} messages hidden)'
        })


class GetUserOnlineStatusView(APIView):
    """
    GET /api/chat/users/{user_id}/status/
    Get online status of a specific user.
    """
    permission_classes = [IsChatUser]

    def get(self, request, user_id):
        from apps.accounts.models import CustomUser
        from .models import UserOnlineStatus
        
        try:
            user = CustomUser.objects.get(id=user_id, is_active=True)
        except CustomUser.DoesNotExist:
            return Response({
                'success': False,
                'message': 'User not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        try:
            status_obj = UserOnlineStatus.objects.get(user=user)
            return Response({
                'success': True,
                'data': {
                    'user_id': user.id,
                    'is_online': status_obj.is_online,
                    'last_seen': status_obj.last_seen.isoformat() if status_obj.last_seen else None,
                    'updated_at': status_obj.updated_at.isoformat()
                }
            })
        except UserOnlineStatus.DoesNotExist:
            return Response({
                'success': True,
                'data': {
                    'user_id': user.id,
                    'is_online': False,
                    'last_seen': None,
                    'updated_at': None
                }
            })