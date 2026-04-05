from rest_framework import serializers
from .models import MaintenanceCategory, MaintenanceLedger, Due


class MaintenanceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceCategory
        fields = ['id', 'society', 'name', 'description']


class MaintenanceLedgerSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = MaintenanceLedger
        fields = ['id', 'society', 'category', 'category_name', 'month', 'amount', 'notes', 'created_at']
        read_only_fields = ['created_at']


class MaintenanceLedgerCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceLedger
        fields = ['category', 'month', 'amount', 'notes']


class DueSerializer(serializers.ModelSerializer):
    resident_name = serializers.CharField(source='resident.full_name', read_only=True)
    flat_info = serializers.SerializerMethodField()

    class Meta:
        model = Due
        fields = ['id', 'resident', 'resident_name', 'flat_info', 'society', 'month', 
                  'amount', 'is_paid', 'paid_at', 'payment_ref']
        read_only_fields = ['paid_at']

    def get_flat_info(self, obj):
        if obj.resident.flat_no and obj.resident.wing:
            return f"Flat {obj.resident.flat_no}, Wing {obj.resident.wing}"
        return None


class DueCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Due
        fields = ['resident', 'month', 'amount']


class DueMarkPaidSerializer(serializers.Serializer):
    payment_ref = serializers.CharField(required=False)