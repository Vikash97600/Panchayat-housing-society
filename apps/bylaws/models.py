from django.db import models
from django.conf import settings


class Bylaw(models.Model):
    society = models.ForeignKey('accounts.Society', on_delete=models.CASCADE, related_name='bylaws')
    title = models.CharField(max_length=255)
    pdf_path = models.CharField(max_length=500)
    extracted_text = models.TextField(blank=True, null=True)
    version = models.CharField(max_length=20, default='1.0')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='uploaded_bylaws')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'bylaws'
        ordering = ['-uploaded_at']

    def __str__(self):
        return self.title