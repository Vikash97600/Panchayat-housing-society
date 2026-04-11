import json
import asyncio
import logging
from datetime import timedelta
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.layers import get_channel_layer
from django.db.models import Q
from django.utils import timezone
from asgiref.sync import async_to_sync

from .models import ChatRoom, Message, MessageVisibility, UserOnlineStatus

logger = logging.getLogger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time chat messaging.
    
    Handles:
    - Message sending/receiving
    - Typing indicators
    - Read receipts
    - Message deletion (for me / for everyone)
    - Chat clearing
    - Online/offline status
    """

    async def connect(self):
        """Accept WebSocket connection and validate room access."""
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.room_group_name = f'chat_{self.room_id}'
        self.user = self.scope['user']

        logger.info(f'[CHAT] User {self.user.id} ({self.user.email}) connecting to room {self.room_id}')

        # Validate authentication
        if not self.user.is_authenticated:
            logger.warning(f'[CHAT] Unauthenticated user attempted to connect')
            await self.close(code=4001, reason='Unauthorized')
            return

        # Validate room access
        has_access = await self.validate_room_access()
        if not has_access:
            logger.warning(f'[CHAT] User {self.user.id} does not have access to room {self.room_id}')
            await self.close(code=4003, reason='Forbidden')
            return

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        # Accept connection
        await self.accept()
        logger.info(f'[CHAT] User {self.user.id} accepted into room {self.room_id}')

        # Update online status and send initial data
        await self.update_online_status(True)
        await self.send_initial_messages()
        await self.broadcast_online_status()

    async def disconnect(self, close_code):
        """Handle disconnect: leave group and mark offline."""
        logger.info(f'[CHAT] User {self.user.id} disconnecting from room {self.room_id} (code: {close_code})')
        
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        
        # Update online status
        await self.update_online_status(False)
        await self.broadcast_online_status()

    async def receive(self, text_data):
        """
        Receive and route incoming WebSocket messages.
        
        Supported message types:
        - chat_message: Send a message
        - typing: Send typing indicator
        - mark_read: Mark messages as read
        - delete_for_me: Delete message for current user
        - delete_for_everyone: Delete message for all users
        - clear_chat: Clear all messages for current user
        """
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            logger.error(f'[CHAT] Invalid JSON from user {self.user.id}: {text_data}')
            return

        message_type = data.get('type', 'chat_message')
        logger.debug(f'[CHAT] Received {message_type} from user {self.user.id}')

        if message_type == 'chat_message':
            content = data.get('content', '').strip()
            if content:
                await self.save_and_broadcast_message(content)
            else:
                logger.debug(f'[CHAT] Empty message from user {self.user.id}')

        elif message_type == 'typing':
            is_typing = data.get('is_typing', True)
            await self.broadcast_typing(is_typing)

        elif message_type == 'mark_read':
            message_ids = data.get('message_ids', [])
            if message_ids:
                await self.mark_messages_read(message_ids)

        elif message_type == 'delete_for_me':
            message_id = data.get('message_id')
            if message_id:
                await self.delete_for_me(message_id)

        elif message_type == 'delete_for_everyone':
            message_id = data.get('message_id')
            if message_id:
                await self.delete_for_everyone(message_id)

        elif message_type == 'clear_chat':
            await self.clear_chat()

    # ==================== WebSocket Event Handlers ====================

    async def chat_message(self, event):
        """Send a chat message to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message': event['message']
        }))

    async def typing_indicator(self, event):
        """Broadcast typing indicator (only to other users)."""
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'typing',
                'user_id': event['user_id'],
                'user_name': event.get('user_name', 'User'),
                'is_typing': event['is_typing']
            }))

    async def read_receipt(self, event):
        """Broadcast read receipts (only to other users)."""
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'read_receipt',
                'message_ids': event['message_ids'],
                'user_id': event['user_id']
            }))

    async def message_deleted(self, event):
        """Broadcast message deletion."""
        await self.send(text_data=json.dumps({
            'type': 'message_deleted',
            'message_id': event['message_id'],
            'deleted_by': event['deleted_by'],
            'delete_type': event['delete_type'],
            'action': event['delete_type']
        }))

    async def chat_cleared(self, event):
        """Broadcast chat clear."""
        await self.send(text_data=json.dumps({
            'type': 'chat_cleared',
            'cleared_by': event['cleared_by']
        }))

    async def user_online_status(self, event):
        """Broadcast online/offline status."""
        await self.send(text_data=json.dumps({
            'type': 'user_online_status',
            'user_id': event['user_id'],
            'user_name': event.get('user_name', 'User'),
            'is_online': event['is_online'],
            'status': 'online' if event['is_online'] else 'offline',
            'last_seen': event['last_seen']
        }))

    # ==================== Database Operations ====================

    @database_sync_to_async
    def validate_room_access(self):
        """Validate that user is a participant in this room."""
        try:
            ChatRoom.objects.get(
                Q(resident=self.user) | Q(committee=self.user),
                id=self.room_id
            )
            return True
        except ChatRoom.DoesNotExist:
            return False

    @database_sync_to_async
    def save_and_broadcast_message(self, content):
        """Save message to DB and broadcast to room."""
        try:
            room = ChatRoom.objects.get(id=self.room_id)
            message = Message.objects.create(
                room=room,
                sender=self.user,
                content=content
            )
            room.save()  # Update room's updated_at

            message_data = {
                'id': message.id,
                'content': message.content,
                'sender_id': message.sender.id,
                'sender_name': message.sender.get_full_name() or message.sender.email,
                'sender_role': message.sender.role,
                'created_at': message.created_at.isoformat(),
                'is_read': message.is_read,
                'is_me': message.sender.id == self.user.id,
                'is_deleted_for_everyone': False,
                'can_delete': True
            }

            logger.info(f'[CHAT] Message {message.id} saved in room {self.room_id} by user {self.user.id}')

            # Broadcast to all users in room
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'message': message_data
                }
            )
        except Exception as e:
            logger.error(f'[CHAT] Error saving message: {str(e)}')

    @database_sync_to_async
    def send_initial_messages(self):
        """Send cached messages when client first connects."""
        try:
            hidden_message_ids = set(
                MessageVisibility.objects.filter(
                    user=self.user,
                    is_hidden=True
                ).values_list('message_id', flat=True)
            )

            room = ChatRoom.objects.get(id=self.room_id)
            messages = room.messages.select_related('sender').order_by('created_at')[:50]
            
            messages_data = []
            for msg in messages:
                if msg.id in hidden_message_ids:
                    continue
                
                messages_data.append({
                    'id': msg.id,
                    'content': msg.display_content,
                    'sender_id': msg.sender.id,
                    'sender_name': msg.sender.get_full_name() or msg.sender.email,
                    'sender_role': msg.sender.role,
                    'created_at': msg.created_at.isoformat(),
                    'is_read': msg.is_read,
                    'is_me': msg.sender.id == self.user.id,
                    'is_deleted_for_everyone': msg.is_deleted_for_everyone,
                    'can_delete': msg.sender.id == self.user.id and not msg.is_deleted_for_everyone
                })

            logger.info(f'[CHAT] Sending {len(messages_data)} initial messages to user {self.user.id}')

            async_to_sync(self.send)(text_data=json.dumps({
                'type': 'initial_messages',
                'messages': messages_data
            }))
        except Exception as e:
            logger.error(f'[CHAT] Error sending initial messages: {str(e)}')

    @database_sync_to_async
    def broadcast_typing(self, is_typing):
        """Broadcast typing indicator to room."""
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                self.room_group_name,
                {
                    'type': 'typing_indicator',
                    'user_id': self.user.id,
                    'user_name': self.user.get_full_name() or self.user.email,
                    'is_typing': is_typing
                }
            )
        except Exception as e:
            logger.error(f'[CHAT] Error broadcasting typing: {str(e)}')

    @database_sync_to_async
    def mark_messages_read(self, message_ids):
        """Mark messages as read and broadcast receipt."""
        if not message_ids:
            return

        try:
            updated_count = Message.objects.filter(
                id__in=message_ids,
                is_read=False
            ).exclude(sender=self.user).update(is_read=True)

            logger.debug(f'[CHAT] Marked {updated_count} messages as read by user {self.user.id}')

            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                self.room_group_name,
                {
                    'type': 'read_receipt',
                    'message_ids': message_ids,
                    'user_id': self.user.id
                }
            )
        except Exception as e:
            logger.error(f'[CHAT] Error marking messages as read: {str(e)}')

    @database_sync_to_async
    def delete_for_me(self, message_id):
        """Delete message for current user only (hide from view)."""
        if not message_id:
            return

        try:
            MessageVisibility.objects.get_or_create(
                user=self.user,
                message_id=message_id,
                defaults={'is_hidden': True}
            )

            logger.info(f'[CHAT] Message {message_id} deleted for user {self.user.id}')

            async_to_sync(self.send)(text_data=json.dumps({
                'type': 'message_deleted',
                'message_id': message_id,
                'deleted_by': self.user.id,
                'delete_type': 'for_me'
            }))
        except Exception as e:
            logger.error(f'[CHAT] Error deleting message for me: {str(e)}')

    @database_sync_to_async
    def delete_for_everyone(self, message_id):
        """Delete message for everyone (within 10-minute window)."""
        DELETE_TIME_LIMIT = timedelta(minutes=10)
        now = timezone.now()

        try:
            message = Message.objects.get(
                id=message_id,
                sender=self.user,
                room_id=self.room_id
            )
        except Message.DoesNotExist:
            logger.warning(f'[CHAT] Message {message_id} not found or user {self.user.id} is not sender')
            return

        if message.is_deleted_for_everyone:
            logger.debug(f'[CHAT] Message {message_id} already deleted for everyone')
            return

        if now - message.created_at > DELETE_TIME_LIMIT:
            logger.debug(f'[CHAT] Message {message_id} exceeds 10-minute delete window')
            return

        message.is_deleted_for_everyone = True
        message.deleted_at = now
        message.save()

        logger.info(f'[CHAT] Message {message_id} deleted for everyone by user {self.user.id}')

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            self.room_group_name,
            {
                'type': 'message_deleted',
                'message_id': message_id,
                'deleted_by': self.user.id,
                'delete_type': 'for_everyone'
            }
        )

    @database_sync_to_async
    def clear_chat(self):
        """Clear all messages for current user (hide them)."""
        try:
            room = ChatRoom.objects.get(id=self.room_id)
            message_ids = list(room.messages.values_list('id', flat=True))

            for msg_id in message_ids:
                MessageVisibility.objects.get_or_create(
                    user=self.user,
                    message_id=msg_id,
                    defaults={'is_hidden': True}
                )

            logger.info(f'[CHAT] Cleared {len(message_ids)} messages for user {self.user.id} in room {self.room_id}')

            async_to_sync(self.send)(text_data=json.dumps({
                'type': 'chat_cleared',
                'cleared_by': self.user.id
            }))
        except Exception as e:
            logger.error(f'[CHAT] Error clearing chat: {str(e)}')

    @database_sync_to_async
    def update_online_status(self, is_online):
        """Update user's online status."""
        try:
            status, _ = UserOnlineStatus.objects.get_or_create(
                user=self.user,
                defaults={}
            )
            status.is_online = is_online
            if not is_online:
                status.last_seen = timezone.now()
            status.save()

            action = 'online' if is_online else 'offline'
            logger.info(f'[CHAT] User {self.user.id} marked as {action}')
        except Exception as e:
            logger.error(f'[CHAT] Error updating online status: {str(e)}')

    @database_sync_to_async
    def broadcast_online_status(self):
        """Broadcast user's online status to room."""
        try:
            status = UserOnlineStatus.objects.get(user=self.user)
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                self.room_group_name,
                {
                    'type': 'user_online_status',
                    'user_id': self.user.id,
                    'user_name': self.user.get_full_name() or self.user.email,
                    'is_online': status.is_online,
                    'last_seen': status.last_seen.isoformat() if status.last_seen else None
                }
            )
        except UserOnlineStatus.DoesNotExist:
            logger.warning(f'[CHAT] UserOnlineStatus not found for user {self.user.id}')
        except Exception as e:
            logger.error(f'[CHAT] Error broadcasting online status: {str(e)}')