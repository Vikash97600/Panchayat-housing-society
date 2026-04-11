from django.db import models
from django.utils import timezone
from apps.accounts.models import CustomUser


class ChatRoom(models.Model):
    """
    Chat room between a Resident and Committee Member.
    One room per Resident ↔ Committee pair.
    """
    resident = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='chat_rooms_as_resident',
        limit_choices_to={'role': 'resident'}
    )
    committee = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='chat_rooms_as_committee',
        limit_choices_to={'role': 'committee'}
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'chat_rooms'
        unique_together = ('resident', 'committee')
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['resident', 'committee']),
            models.Index(fields=['-updated_at']),
        ]

    def __str__(self):
        return f"Chat: {self.resident.email} ↔ {self.committee.email}"

    def get_other_user(self, user):
        """Get the other participant in the chat."""
        if user == self.resident:
            return self.committee
        elif user == self.committee:
            return self.resident
        return None

    def get_last_message(self):
        """Get the last non-deleted message in room."""
        return self.messages.filter(
            is_deleted_for_everyone=False
        ).order_by('-created_at').first()

    def get_unread_count(self, user):
        """Get count of unread messages for a specific user."""
        hidden_ids = MessageVisibility.objects.filter(
            user=user,
            is_hidden=True
        ).values_list('message_id', flat=True)
        
        return self.messages.filter(
            is_read=False
        ).exclude(sender=user).exclude(
            id__in=hidden_ids
        ).exclude(
            is_deleted_for_everyone=True
        ).count()


class Message(models.Model):
    """
    Chat message in a chat room.
    """
    room = models.ForeignKey(
        ChatRoom,
        on_delete=models.CASCADE,
        related_name='messages'
    )
    sender = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='sent_messages'
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)
    is_deleted_for_everyone = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'chat_messages'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['room', 'created_at']),
            models.Index(fields=['room', 'is_read']),
            models.Index(fields=['is_deleted_for_everyone']),
        ]

    def __str__(self):
        return f"Message by {self.sender.email} at {self.created_at}"

    @property
    def display_content(self):
        """Return display content, hiding if deleted for everyone."""
        if self.is_deleted_for_everyone:
            return "This message was deleted"
        return self.content

    def is_visible_to(self, user):
        """Check if message is visible to a specific user."""
        if self.is_deleted_for_everyone:
            return False
        
        hidden = MessageVisibility.objects.filter(
            user=user,
            message=self,
            is_hidden=True
        ).exists()
        
        return not hidden


class MessageVisibility(models.Model):
    """
    Track which messages are hidden for specific users.
    Supports "Delete for Me" and "Clear Chat" features.
    """
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='hidden_messages'
    )
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='visibility_entries'
    )
    is_hidden = models.BooleanField(default=True)
    hidden_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'message_visibility'
        unique_together = ('user', 'message')
        indexes = [
            models.Index(fields=['user', 'is_hidden']),
            models.Index(fields=['user', 'message']),
        ]

    def __str__(self):
        return f"Hidden: {self.user.email} - Message {self.message_id}"


class UserOnlineStatus(models.Model):
    """
    Track online/offline status of users.
    Used for real-time presence indicators.
    """
    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='online_status'
    )
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_online_status'
        indexes = [
            models.Index(fields=['is_online']),
        ]

    def __str__(self):
        status_text = 'Online' if self.is_online else 'Offline'
        return f"{self.user.email} - {status_text}"
    
    def mark_online(self):
        """Mark user as online."""
        self.is_online = True
        self.updated_at = timezone.now()
        self.save(update_fields=['is_online', 'updated_at'])
    
    def mark_offline(self):
        """Mark user as offline and record last seen time."""
        self.is_online = False
        self.last_seen = timezone.now()
        self.updated_at = timezone.now()
        self.save(update_fields=['is_online', 'last_seen', 'updated_at'])


