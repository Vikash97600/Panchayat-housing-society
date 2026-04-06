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
    class Meta:
        model = Service
        fields = ['id', 'society', 'name', 'description', 'vendor_name', 
                  'vendor_phone', 'price_per_slot', 'is_active']


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
    service_name = serializers.CharField(source='slot.service.name', read_only=True)
    slot_detail = ServiceSlotSerializer(source='slot', read_only=True)

    class Meta:
        model = Booking
        fields = ['id', 'resident', 'resident_name', 'slot', 'slot_detail', 
                  'service_name', 'status', 'notes', 'created_at']
        read_only_fields = ['created_at']


class BookingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = ['slot', 'notes']


class BookingListSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source='slot.service.name', read_only=True)
    slot_date = serializers.DateField(source='slot.slot_date', read_only=True)
    start_time = serializers.TimeField(source='slot.start_time', read_only=True)
    end_time = serializers.TimeField(source='slot.end_time', read_only=True)

    class Meta:
        model = Booking
        fields = ['id', 'service_name', 'slot_date', 'start_time', 'end_time', 
                  'status', 'notes', 'created_at']