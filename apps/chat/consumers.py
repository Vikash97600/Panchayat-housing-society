import json
import asyncio
from datetime import timedelta
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.layers import get_channel_layer
from django.db.models import Q
from django.utils import timezone

from .models import ChatRoom, Message, MessageVisibility, UserOnlineStatus


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.room_group_name = f'chat_{self.room_id}'
        self.user = self.scope['user']

        if not self.user.is_authenticated:
            await self.close()
            return

        if not await self.validate_room_access():
            await self.close()
            return

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

        await self.update_online_status(True)
        await self.send_initial_messages()
        await self.broadcast_online_status()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        await self.update_online_status(False)
        await self.broadcast_online_status()

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        message_type = data.get('type', 'chat_message')

        if message_type == 'chat_message':
            content = data.get('content', '').strip()
            if content:
                await self.save_and_broadcast_message(content)

        elif message_type == 'typing':
            await self.broadcast_typing(data.get('is_typing', True))

        elif message_type == 'mark_read':
            message_ids = data.get('message_ids', [])
            await self.mark_messages_read(message_ids)

        elif message_type == 'delete_for_me':
            message_id = data.get('message_id')
            await self.delete_for_me(message_id)

        elif message_type == 'delete_for_everyone':
            message_id = data.get('message_id')
            await self.delete_for_everyone(message_id)

        elif message_type == 'clear_chat':
            await self.clear_chat()

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message': event['message']
        }))

    async def typing_indicator(self, event):
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'typing',
                'user_id': event['user_id'],
                'is_typing': event['is_typing']
            }))

    async def read_receipt(self, event):
        await self.send(text_data=json.dumps({
            'type': 'read_receipt',
            'message_ids': event['message_ids'],
            'user_id': event['user_id']
        }))

    async def message_deleted(self, event):
        await self.send(text_data=json.dumps({
            'type': 'message_deleted',
            'message_id': event['message_id'],
            'deleted_by': event['deleted_by'],
            'delete_type': event['delete_type']
        }))

    async def chat_cleared(self, event):
        await self.send(text_data=json.dumps({
            'type': 'chat_cleared',
            'cleared_by': event['cleared_by']
        }))

    async def user_online_status(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_online_status',
            'user_id': event['user_id'],
            'is_online': event['is_online'],
            'last_seen': event['last_seen']
        }))

    @database_sync_to_async
    def validate_room_access(self):
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
        room = ChatRoom.objects.get(id=self.room_id)
        message = Message.objects.create(
            room=room,
            sender=self.user,
            content=content
        )
        room.save()

        message_data = {
            'id': message.id,
            'content': message.content,
            'sender_id': message.sender.id,
            'sender_name': message.sender.get_full_name(),
            'sender_role': message.sender.role,
            'created_at': message.created_at.isoformat(),
            'is_read': message.is_read,
            'is_me': False,
            'can_delete': True
        }

        channel_layer = get_channel_layer()
        from asgiref.sync import async_to_sync
        async_to_sync(channel_layer.group_send)(
            self.room_group_name,
            {
                'type': 'chat_message',
                'message': message_data
            }
        )

    @database_sync_to_async
    def send_initial_messages(self):
        hidden_message_ids = list(
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
                'sender_name': msg.sender.get_full_name(),
                'sender_role': msg.sender.role,
                'created_at': msg.created_at.isoformat(),
                'is_read': msg.is_read,
                'is_me': msg.sender.id == self.user.id,
                'is_deleted_for_everyone': msg.is_deleted_for_everyone,
                'can_delete': msg.sender.id == self.user.id and not msg.is_deleted_for_everyone
            })

        if messages_data:
            from asgiref.sync import async_to_sync
            async_to_sync(self.send)(text_data=json.dumps({
                'type': 'initial_messages',
                'messages': messages_data
            }))

    @database_sync_to_async
    def broadcast_typing(self, is_typing):
        channel_layer = get_channel_layer()
        from asgiref.sync import async_to_sync
        async_to_sync(channel_layer.group_send)(
            self.room_group_name,
            {
                'type': 'typing_indicator',
                'user_id': self.user.id,
                'is_typing': is_typing
            }
        )

    @database_sync_to_async
    def mark_messages_read(self, message_ids):
        if not message_ids:
            return

        Message.objects.filter(
            id__in=message_ids,
            is_read=False
        ).exclude(sender=self.user).update(is_read=True)

        channel_layer = get_channel_layer()
        from asgiref.sync import async_to_sync
        async_to_sync(channel_layer.group_send)(
            self.room_group_name,
            {
                'type': 'read_receipt',
                'message_ids': message_ids,
                'user_id': self.user.id
            }
        )

    @database_sync_to_async
    def delete_for_me(self, message_id):
        if not message_id:
            return

        MessageVisibility.objects.get_or_create(
            user=self.user,
            message_id=message_id,
            defaults={'is_hidden': True}
        )

        channel_layer = get_channel_layer()
        from asgiref.sync import async_to_sync
        async_to_sync(channel_layer.group_send)(
            self.room_group_name,
            {
                'type': 'message_deleted',
                'message_id': message_id,
                'deleted_by': self.user.id,
                'delete_type': 'for_me'
            }
        )

    @database_sync_to_async
    def delete_for_everyone(self, message_id):
        DELETE_TIME_LIMIT = timedelta(minutes=10)
        now = timezone.now()

        try:
            message = Message.objects.get(
                id=message_id,
                sender=self.user,
                room_id=self.room_id
            )
        except Message.DoesNotExist:
            return

        if message.is_deleted_for_everyone:
            return

        if now - message.created_at > DELETE_TIME_LIMIT:
            return

        message.is_deleted_for_everyone = True
        message.deleted_at = now
        message.save()

        channel_layer = get_channel_layer()
        from asgiref.sync import async_to_sync
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
        room = ChatRoom.objects.get(id=self.room_id)
        message_ids = list(
            room.messages.values_list('id', flat=True)
        )

        for msg_id in message_ids:
            MessageVisibility.objects.get_or_create(
                user=self.user,
                message_id=msg_id,
                defaults={'is_hidden': True}
            )

        channel_layer = get_channel_layer()
        from asgiref.sync import async_to_sync
        async_to_sync(channel_layer.group_send)(
            self.room_group_name,
            {
                'type': 'chat_cleared',
                'cleared_by': self.user.id
            }
        )

    @database_sync_to_async
    def update_online_status(self, is_online):
        status, _ = UserOnlineStatus.objects.get_or_create(
            user=self.user,
            defaults={}
        )
        status.is_online = is_online
        if not is_online:
            status.last_seen = timezone.now()
        status.save()

    @database_sync_to_async
    def broadcast_online_status(self):
        try:
            status = UserOnlineStatus.objects.get(user=self.user)
        except UserOnlineStatus.DoesNotExist:
            return

        channel_layer = get_channel_layer()
        from asgiref.sync import async_to_sync
        async_to_sync(channel_layer.group_send)(
            self.room_group_name,
            {
                'type': 'user_online_status',
                'user_id': self.user.id,
                'is_online': status.is_online,
                'last_seen': status.last_seen.isoformat() if status.last_seen else None
            }
        )