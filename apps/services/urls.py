from django.urls import path
from .views import (
    ServiceListView, ServiceCreateView, ServiceDetailView, ServiceUpdateView, ServiceDeleteView, ServiceSlotsView,
    ServiceGenerateSlotsView, BookingListCreateView, BookingDetailView, BookingCancelView
)

urlpatterns = [
    path('services/', ServiceListView.as_view(), name='service-list'),
    path('services/create/', ServiceCreateView.as_view(), name='service-create'),
    path('services/<int:pk>/', ServiceDetailView.as_view(), name='service-detail'),
    path('services/<int:pk>/update/', ServiceUpdateView.as_view(), name='service-update'),
    path('services/<int:pk>/delete/', ServiceDeleteView.as_view(), name='service-delete'),
    path('services/<int:pk>/slots/', ServiceSlotsView.as_view(), name='service-slots'),
    path('services/generate-slots/', ServiceGenerateSlotsView.as_view(), name='service-generate-slots'),
    path('bookings/', BookingListCreateView.as_view(), name='booking-list-create'),
    path('bookings/<int:pk>/', BookingDetailView.as_view(), name='booking-detail'),
    path('bookings/<int:pk>/cancel/', BookingCancelView.as_view(), name='booking-cancel'),
]