# Generated migration for adding indexes and improving chat models

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0002_add_delete_and_visibility_models'),
    ]

    operations = [
        # Add indexes to optimize query performance
        migrations.AddIndex(
            model_name='chatroom',
            index=models.Index(fields=['resident', 'committee'], name='chat_rooms_res_comm_idx'),
        ),
        migrations.AddIndex(
            model_name='chatroom',
            index=models.Index(fields=['-updated_at'], name='chat_rooms_updated_idx'),
        ),
        migrations.AddIndex(
            model_name='message',
            index=models.Index(fields=['room', 'created_at'], name='messages_room_created_idx'),
        ),
        migrations.AddIndex(
            model_name='message',
            index=models.Index(fields=['room', 'is_read'], name='messages_room_read_idx'),
        ),
        migrations.AddIndex(
            model_name='message',
            index=models.Index(fields=['is_deleted_for_everyone'], name='messages_deleted_idx'),
        ),
        migrations.AddIndex(
            model_name='messagevisibility',
            index=models.Index(fields=['user', 'is_hidden'], name='visibility_user_hidden_idx'),
        ),
        migrations.AddIndex(
            model_name='useronlinestatus',
            index=models.Index(fields=['is_online'], name='online_status_online_idx'),
        ),
    ]
