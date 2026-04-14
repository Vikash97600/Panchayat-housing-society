from rest_framework import serializers
from .models import Service, ServiceSlot, Booking


class ServiceSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceSlot
        fields = ['id', 'service', 'slot_date', 'start_time', 'end_time', 'is_available']


class ServiceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = ['name', 'description', 'vendor_name', 'vendor_phone', 'price_per_slot', 'is_active']
        extra_kwargs = {
            'is_active': {'default': True}
        }


class ServiceSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    updated_by_name = serializers.CharField(source='updated_by.full_name', read_only=True)
    society_name = serializers.CharField(source='society.name', read_only=True)
    
    class Meta:
        model = Service
        fields = ['id', 'society', 'society_name', 'name', 'description', 'vendor_name', 
                  'vendor_phone', 'price_per_slot', 'is_active', 'created_at', 
                  'updated_at', 'created_by', 'updated_by', 'created_by_name', 'updated_by_name']


class ServiceWithSlotsSerializer(ServiceSerializer):
    slots = serializers.SerializerMethodField()

    class Meta(ServiceSerializer.Meta):
        fields = ServiceSerializer.Meta.fields + ['slots']

    def get_slots(self, obj):
        date_param = self.context.get('request').query_params.get('date') if self.context.get('request') else None
        slots = obj.slots.filter(is_available=True)
        if date_param:
            slots = slots.filter(slot_date=date_param)
        return ServiceSlotSerializer(slots[:10], many=True).data


class BookingSerializer(serializers.ModelSerializer):
    resident_name = serializers.CharField(source='resident.full_name', read_only=True)
    resident_phone = serializers.CharField(source='resident.phone', read_only=True)
    resident_flat = serializers.SerializerMethodField()
    resident_wing = serializers.SerializerMethodField()
    service_name = serializers.CharField(source='slot.service.name', read_only=True)
    slot_detail = ServiceSlotSerializer(source='slot', read_only=True)

    class Meta:
        model = Booking
        fields = ['id', 'resident', 'resident_name', 'resident_phone', 'resident_flat', 'resident_wing',
                  'slot', 'slot_detail', 'service_name', 'status', 'notes', 'created_at']
        read_only_fields = ['created_at']

    def get_resident_flat(self, obj):
        if obj.resident.flat_no:
            return obj.resident.flat_no
        if hasattr(obj.resident, 'resident_profile') and obj.resident.resident_profile:
            return obj.resident.resident_profile.flat_no
        return None

    def get_resident_wing(self, obj):
        if obj.resident.wing:
            return obj.resident.wing
        if hasattr(obj.resident, 'resident_profile') and obj.resident.resident_profile:
            return obj.resident.resident_profile.wing_no
        return None


class BookingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = ['slot', 'notes']


class BookingUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = ['status', 'notes']


class BookingListSerializer(serializers.ModelSerializer):
    resident_name = serializers.CharField(source='resident.full_name', read_only=True)
    resident_phone = serializers.CharField(source='resident.phone', read_only=True)
    resident_flat = serializers.SerializerMethodField()
    resident_wing = serializers.SerializerMethodField()
    resident = serializers.IntegerField(source='resident.id', read_only=True)
    service_name = serializers.CharField(source='slot.service.name', read_only=True)
    slot_date = serializers.DateField(source='slot.slot_date', read_only=True)
    start_time = serializers.TimeField(source='slot.start_time', read_only=True)
    end_time = serializers.TimeField(source='slot.end_time', read_only=True)
    service_id = serializers.IntegerField(source='slot.service.id', read_only=True)

    class Meta:
        model = Booking
        fields = ['id', 'service_id', 'service_name', 'slot_date', 'start_time', 'end_time', 
                  'status', 'notes', 'created_at', 'resident', 'resident_name', 'resident_phone', 
                  'resident_flat', 'resident_wing']

    def get_resident_flat(self, obj):
        if obj.resident.flat_no:
            return obj.resident.flat_no
        if hasattr(obj.resident, 'resident_profile') and obj.resident.resident_profile:
            return obj.resident.resident_profile.flat_no
        return None

    def get_resident_wing(self, obj):
        if obj.resident.wing:
            return obj.resident.wing
        if hasattr(obj.resident, 'resident_profile') and obj.resident.resident_profile:
            return obj.resident.resident_profile.wing_no
        return None