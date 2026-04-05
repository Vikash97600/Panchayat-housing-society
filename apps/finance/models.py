from django.db import models


class MaintenanceCategory(models.Model):
    society = models.ForeignKey('accounts.Society', on_delete=models.CASCADE, related_name='maintenance_categories')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'maintenance_categories'

    def __str__(self):
        return self.name


class MaintenanceLedger(models.Model):
    society = models.ForeignKey('accounts.Society', on_delete=models.CASCADE, related_name='maintenance_ledger')
    category = models.ForeignKey(MaintenanceCategory, on_delete=models.CASCADE, related_name='entries')
    month = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'maintenance_ledger'
        unique_together = ['society', 'category', 'month']

    def __str__(self):
        return f"{self.category.name} - {self.month}"


class Due(models.Model):
    resident = models.ForeignKey('accounts.CustomUser', on_delete=models.CASCADE, related_name='dues')
    society = models.ForeignKey('accounts.Society', on_delete=models.CASCADE, related_name='dues')
    month = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    is_paid = models.BooleanField(default=False)
    paid_at = models.DateTimeField(blank=True, null=True)
    payment_ref = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'dues'
        unique_together = ['resident', 'month']

    def __str__(self):
        return f"{self.resident.email} - {self.month}"