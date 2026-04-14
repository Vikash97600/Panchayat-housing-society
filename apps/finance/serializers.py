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
    resident_name = serializers.SerializerMethodField()
    flat_no = serializers.SerializerMethodField()
    flat_info = serializers.SerializerMethodField()

    class Meta:
        model = Due
        fields = ['id', 'resident', 'resident_name', 'flat_no', 'flat_info', 'society', 'month', 
                  'amount', 'is_paid', 'paid_at', 'payment_ref']
        read_only_fields = ['paid_at']

    def get_resident_name(self, obj):
        if obj.resident:
            return obj.resident.get_full_name() or obj.resident.email
        return 'Unknown'

    def get_flat_no(self, obj):
        if obj.resident:
            if obj.resident.flat_no:
                return obj.resident.flat_no
            if hasattr(obj.resident, 'resident_profile') and obj.resident.resident_profile:
                return obj.resident.resident_profile.flat_no
        return None

    def get_flat_info(self, obj):
        flat_no = None
        wing = None
        
        if obj.resident:
            if obj.resident.flat_no:
                flat_no = obj.resident.flat_no
                wing = obj.resident.wing
            elif hasattr(obj.resident, 'resident_profile') and obj.resident.resident_profile:
                flat_no = obj.resident.resident_profile.flat_no
                wing = obj.resident.resident_profile.wing_no
        
        if flat_no:
            return f"Flat {flat_no}" + (f", Wing {wing}" if wing else "")
        return None


class DueCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Due
        fields = ['resident', 'month', 'amount']


class DueMarkPaidSerializer(serializers.Serializer):
    payment_ref = serializers.CharField(required=False)