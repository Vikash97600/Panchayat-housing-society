from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.db import transaction
from django.utils import timezone
from datetime import datetime, timedelta

from apps.accounts.views import log_audit
from .models import Service, ServiceSlot, Booking
from .serializers import (
    ServiceSerializer, ServiceWithSlotsSerializer, ServiceSlotSerializer,
    BookingSerializer, BookingCreateSerializer, BookingListSerializer
)


class IsResident(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'resident'


class IsAdminOrCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'committee']


class ServiceListView(generics.ListAPIView):
    serializer_class = ServiceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Service.objects.filter(
            society=self.request.user.society,
            is_active=True
        )


class ServiceDetailView(generics.RetrieveAPIView):
    serializer_class = ServiceWithSlotsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Service.objects.filter(
            society=self.request.user.society,
            is_active=True
        )


class ServiceSlotsView(generics.ListAPIView):
    serializer_class = ServiceSlotSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        service_id = self.kwargs['pk']
        queryset = ServiceSlot.objects.filter(
            service__id=service_id,
            service__society=self.request.user.society,
            is_available=True,
            slot_date__gte=timezone.now().date()
        )

        date_param = self.request.query_params.get('date')
        if date_param:
            queryset = queryset.filter(slot_date=date_param)

        return queryset


class BookingListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return BookingCreateSerializer
        return BookingListSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role in ['admin', 'committee']:
            return Booking.objects.filter(
                slot__service__society=user.society
            ).select_related('resident', 'slot__service')
        return Booking.objects.filter(resident=user).select_related('slot__service')

    @transaction.atomic
    def perform_create(self, serializer):
        slot = serializer.validated_data['slot']
        if not slot.is_available:
            raise serializers.ValidationError("This slot is not available")
        
        slot.is_available = False
        slot.save(update_fields=['is_available'])
        
        booking = serializer.save(
            resident=self.request.user,
            status='confirmed'
        )

        log_audit(self.request.user, 'booking_created', 'Booking', booking.id,
                  {'service': slot.service.name, 'date': str(slot.slot_date)}, self.request)


class BookingDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = BookingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ['admin', 'committee']:
            return Booking.objects.filter(slot__service__society=user.society)
        return Booking.objects.filter(resident=user)

    @transaction.atomic
    def perform_update(self, serializer):
        instance = serializer.save()
        if instance.status == 'cancelled':
            instance.slot.is_available = True
            instance.slot.save(update_fields=['is_available'])


class BookingCancelView(generics.UpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ['admin', 'committee']:
            return Booking.objects.filter(slot__service__society=user.society)
        return Booking.objects.filter(resident=user)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        
        if instance.status == 'cancelled':
            return Response({
                'success': False,
                'data': {},
                'message': 'Booking already cancelled'
            }, status=status.HTTP_400_BAD_REQUEST)

        instance.status = 'cancelled'
        instance.save(update_fields=['status'])

        instance.slot.is_available = True
        instance.slot.save(update_fields=['is_available'])

        log_audit(request.user, 'booking_cancelled', 'Booking', instance.id, request=request)

        return Response({
            'success': True,
            'data': BookingSerializer(instance).data,
            'message': 'Booking cancelled successfully'
        })