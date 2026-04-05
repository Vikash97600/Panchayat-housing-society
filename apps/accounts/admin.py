from django.contrib import admin
from .models import Society, CustomUser, AuditLog


@admin.register(Society)
class SocietyAdmin(admin.ModelAdmin):
    list_display = ['name', 'city', 'state', 'total_flats', 'plan_type', 'is_active']
    search_fields = ['name', 'city']


@admin.register(CustomUser)
class CustomUserAdmin(admin.ModelAdmin):
    list_display = ['email', 'get_full_name', 'role', 'society', 'is_approved', 'is_active']
    list_filter = ['role', 'is_approved', 'is_active', 'society']
    search_fields = ['email', 'first_name', 'last_name', 'flat_no']

    @admin.display(description='Full Name')
    def get_full_name(self, obj):
        return obj.get_full_name()


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'action', 'model_name', 'object_id', 'timestamp']
    list_filter = ['action', 'model_name']
    search_fields = ['user__email', 'action']