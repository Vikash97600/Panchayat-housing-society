from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
from datetime import timedelta
import uuid


class Society(models.Model):
    PLAN_TYPE_CHOICES = [
        ('basic', 'Basic'),
        ('standard', 'Standard'),
        ('premium', 'Premium'),
    ]

    name = models.CharField(max_length=255)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    wing_count = models.IntegerField(default=1)
    total_flats = models.IntegerField()
    plan_type = models.CharField(max_length=20, choices=PLAN_TYPE_CHOICES, default='standard')
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'societies'

    def __str__(self):
        return self.name


class CustomUser(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('secretary', 'Secretary'),
        ('treasurer', 'Treasurer'),
        ('committee', 'Committee'),
        ('resident', 'Resident'),
    ]

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='resident')
    flat_no = models.CharField(max_length=20, blank=True, null=True)
    wing = models.CharField(max_length=10, blank=True, null=True)
    phone = models.CharField(max_length=15, blank=True, null=True)
    society = models.ForeignKey(Society, on_delete=models.CASCADE, related_name='users')
    is_approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'users'

    def __str__(self):
        return f"{self.get_full_name()} ({self.role})"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.username


class PasswordResetToken(models.Model):
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='reset_token')
    token = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = 'password_reset_tokens'

    def is_valid(self):
        return timezone.now() < self.expires_at

    def __str__(self):
        return f"Reset token for {self.user.email}"


class AuditLog(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    action = models.CharField(max_length=100)
    model_name = models.CharField(max_length=100, blank=True, null=True)
    object_id = models.IntegerField(blank=True, null=True)
    details = models.JSONField(blank=True, null=True)
    ip_address = models.CharField(max_length=45, blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.user} - {self.action} - {self.timestamp}"


class CommitteeMember(models.Model):
    ROLE_CHOICES = [
        ('secretary', 'Secretary'),
        ('treasurer', 'Treasurer'),
    ]

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='committee_roles')
    society = models.ForeignKey(Society, on_delete=models.CASCADE, related_name='committee_members')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'committee_members'
        unique_together = ['society', 'role']

    def __str__(self):
        return f"{self.user.get_full_name()} - {self.role} - {self.society.name}"


class Resident(models.Model):
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='resident_profile')
    society = models.ForeignKey(Society, on_delete=models.CASCADE, related_name='residents')
    flat_no = models.CharField(max_length=20)
    wing_no = models.CharField(max_length=10)
    mobile_no = models.CharField(max_length=15)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'residents'
        unique_together = ['society', 'flat_no', 'wing_no']

    def __str__(self):
        return f"{self.user.get_full_name()} - {self.flat_no}/{self.wing_no} - {self.society.name}"