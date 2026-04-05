from django.urls import path
from .views import (
    ServiceListView, ServiceDetailView, ServiceSlotsView,
    BookingListCreateView, BookingDetailView, BookingCancelView
)

urlpatterns = [
    path('', ServiceListView.as_view(), name='service-list'),
    path('<int:pk>/', ServiceDetailView.as_view(), name='service-detail'),
    path('<int:pk>/slots/', ServiceSlotsView.as_view(), name='service-slots'),
    path('bookings/', BookingListCreateView.as_view(), name='booking-list-create'),
    path('bookings/<int:pk>/', BookingDetailView.as_view(), name='booking-detail'),
    path('bookings/<int:pk>/cancel/', BookingCancelView.as_view(), name='booking-cancel'),
]