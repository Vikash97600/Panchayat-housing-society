from django.db import models


class Notice(models.Model):
    society = models.ForeignKey('accounts.Society', on_delete=models.CASCADE, related_name='notices')
    posted_by = models.ForeignKey('accounts.CustomUser', on_delete=models.CASCADE, related_name='posted_notices')
    title = models.CharField(max_length=255)
    body = models.TextField()
    is_pinned = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'notices'
        ordering = ['-is_pinned', '-created_at']

    def __str__(self):
        return self.title