from django.db import models


class Service(models.Model):
    society = models.ForeignKey('accounts.Society', on_delete=models.CASCADE, related_name='services')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    vendor_name = models.CharField(max_length=255, blank=True, null=True)
    vendor_phone = models.CharField(max_length=15, blank=True, null=True)
    price_per_slot = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey('accounts.CustomUser', on_delete=models.SET_NULL, null=True, related_name='created_services')
    updated_by = models.ForeignKey('accounts.CustomUser', on_delete=models.SET_NULL, null=True, related_name='updated_services')

    class Meta:
        db_table = 'services'

    def __str__(self):
        return self.name


class ServiceSlot(models.Model):
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='slots')
    slot_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_available = models.BooleanField(default=True)

    class Meta:
        db_table = 'service_slots'
        ordering = ['slot_date', 'start_time']
        unique_together = ['service', 'slot_date', 'start_time']

    def __str__(self):
        return f"{self.service.name} - {self.slot_date} {self.start_time}"


class Booking(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('cancelled', 'Cancelled'),
    ]

    resident = models.ForeignKey('accounts.CustomUser', on_delete=models.CASCADE, related_name='bookings')
    slot = models.ForeignKey(ServiceSlot, on_delete=models.CASCADE, related_name='bookings')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bookings'

    def __str__(self):
        return f"{self.resident.email} - {self.slot}"