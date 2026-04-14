from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from datetime import datetime, timedelta

from apps.accounts.views import log_audit
from .models import Service, ServiceSlot, Booking
from .serializers import (
    ServiceSerializer, ServiceCreateSerializer, ServiceWithSlotsSerializer, ServiceSlotSerializer,
    BookingSerializer, BookingCreateSerializer, BookingUpdateSerializer, BookingListSerializer
)


class IsResident(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'resident'


class IsAdminOrCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'secretary', 'treasurer', 'committee']


class ServiceListView(generics.ListAPIView):
    serializer_class = ServiceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        
        if user.role == 'admin':
            return Service.objects.all().order_by('-created_at')
        
        if user.role in ['secretary', 'treasurer', 'committee']:
            society = user.society
            if not society:
                try:
                    society = user.resident_profile.society
                except:
                    pass
            if society:
                return Service.objects.filter(society=society)
            return Service.objects.none()
        
        return Service.objects.filter(is_active=True).order_by('-created_at')


class ServiceCreateView(generics.CreateAPIView):
    serializer_class = ServiceCreateSerializer
    permission_classes = [IsAdminOrCommittee]
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response({
            'success': True,
            'data': serializer.data,
            'message': 'Service created successfully'
        }, status=status.HTTP_201_CREATED, headers=headers)
    
    def perform_create(self, serializer):
        user = self.request.user
        society = user.society
        if not society:
            try:
                society = user.resident_profile.society
            except:
                pass
        
        service = serializer.save(society=society, created_by=user)
        
        log_audit(user, 'service_created', 'Service', service.id,
                  {'name': service.name}, self.request)


class ServiceDetailView(generics.RetrieveAPIView):
    serializer_class = ServiceWithSlotsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        
        if user.role == 'admin':
            return Service.objects.all()
        
        if user.role in ['secretary', 'treasurer', 'committee']:
            society = user.society
            if not society:
                try:
                    society = user.resident_profile.society
                except:
                    pass
            if society:
                return Service.objects.filter(society=society)
            return Service.objects.none()
        
        return Service.objects.filter(is_active=True)


class ServiceUpdateView(generics.UpdateAPIView):
    serializer_class = ServiceSerializer
    permission_classes = [IsAdminOrCommittee]
    
    def get_queryset(self):
        user = self.request.user
        
        if user.role == 'admin':
            return Service.objects.all()
        
        society = user.society
        if not society:
            try:
                society = user.resident_profile.society
            except:
                pass
        return Service.objects.filter(society=society)
    
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        
        # Update the updated_by field
        instance.updated_by = request.user
        instance.save(update_fields=['updated_by'])
        
        log_audit(request.user, 'service_updated', 'Service', instance.id,
                  {'name': instance.name}, request)
        
        return Response({
            'success': True,
            'data': serializer.data,
            'message': 'Service updated successfully'
        })


class ServiceDeleteView(generics.DestroyAPIView):
    serializer_class = ServiceSerializer
    permission_classes = [IsAdminOrCommittee]
    
    def get_queryset(self):
        user = self.request.user
        
        if user.role == 'admin':
            return Service.objects.all()
        
        society = user.society
        if not society:
            try:
                society = user.resident_profile.society
            except:
                pass
        return Service.objects.filter(society=society)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        service_id = instance.id
        service_name = instance.name
        self.perform_destroy(instance)
        
        log_audit(request.user, 'service_deleted', 'Service', service_id,
                  {'name': service_name}, request)
        
        return Response({
            'success': True,
            'message': 'Service deleted successfully'
        }, status=status.HTTP_200_OK)


class ServiceGenerateSlotsView(generics.CreateAPIView):
    serializer_class = ServiceSlotSerializer
    permission_classes = [IsAdminOrCommittee]

    def create(self, request, *args, **kwargs):
        service_id = request.data.get('service_id')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        start_time = request.data.get('start_time', '09:00')
        end_time = request.data.get('end_time', '18:00')
        
        if not service_id or not start_date or not end_date:
            return Response({
                'success': False,
                'message': 'service_id, start_date, and end_date are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            service = Service.objects.get(id=service_id)
        except Service.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Service not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        from datetime import datetime
        start = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        slots_created = 0
        current = start
        while current <= end:
            slot, created = ServiceSlot.objects.get_or_create(
                service=service,
                slot_date=current,
                start_time=start_time,
                defaults={
                    'end_time': end_time,
                    'is_available': True
                }
            )
            if created:
                slots_created += 1
            current += timedelta(days=1)
        
        return Response({
            'success': True,
            'message': f'Generated {slots_created} slots successfully',
            'data': {'slots_created': slots_created}
        }, status=status.HTTP_201_CREATED)


class ServiceSlotsView(generics.ListAPIView):
    serializer_class = ServiceSlotSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        
        service_id = self.kwargs['pk']
        
        if user.role == 'admin':
            queryset = ServiceSlot.objects.filter(
                service__id=service_id,
                slot_date__gte=timezone.now().date()
            )
        elif user.role in ['secretary', 'treasurer', 'committee']:
            society = user.society
            if not society:
                try:
                    society = user.resident_profile.society
                except:
                    pass
            if society:
                queryset = ServiceSlot.objects.filter(
                    service__id=service_id,
                    service__society=society,
                    slot_date__gte=timezone.now().date()
                )
            else:
                queryset = ServiceSlot.objects.none()
        else:
            queryset = ServiceSlot.objects.filter(
                service__id=service_id,
                service__is_active=True,
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
        
        if user.role == 'admin':
            queryset = Booking.objects.all().select_related('resident', 'slot__service', 'slot__service__society')
        elif user.role in ['secretary', 'treasurer', 'committee']:
            society = user.society
            if not society:
                try:
                    society = user.resident_profile.society
                except:
                    pass
            
            if society:
                queryset = Booking.objects.filter(
                    slot__service__society=society
                ).select_related('resident', 'slot__service', 'slot__service__society')
            else:
                queryset = Booking.objects.none()
        else:
            queryset = Booking.objects.filter(
                slot__service__is_active=True
            ).select_related('resident', 'slot__service', 'slot__service__society')

        # Filter by service
        service_id = self.request.query_params.get('service')
        if service_id:
            queryset = queryset.filter(slot__service_id=service_id)

        # Filter by date
        booking_date = self.request.query_params.get('date')
        if booking_date:
            queryset = queryset.filter(slot__slot_date=booking_date)

        # Filter by status
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)

        return queryset.order_by('-created_at')

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
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return BookingUpdateSerializer
        return BookingSerializer

    def get_queryset(self):
        user = self.request.user
        
        if user.role in ['admin', 'secretary', 'treasurer', 'committee']:
            society = user.society
            if not society:
                try:
                    society = user.resident_profile.society
                except:
                    pass
            
            if society:
                return Booking.objects.filter(slot__service__society=society)
            return Booking.objects.none()
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
        
        if user.role in ['admin', 'secretary', 'treasurer', 'committee']:
            society = user.society
            if not society:
                try:
                    society = user.resident_profile.society
                except:
                    pass
            
            if society:
                return Booking.objects.filter(slot__service__society=society)
            return Booking.objects.none()
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