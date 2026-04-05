from django.urls import path
from .views import (
    MaintenanceCategoryListView, MaintenanceLedgerListView, MaintenanceSummaryView,
    DueListCreateView, MyDuesView, DueMarkPaidView, CategoryCreateView
)

urlpatterns = [
    path('maintenance/categories/', MaintenanceCategoryListView.as_view(), name='maintenance-categories'),
    path('maintenance/categories/create/', CategoryCreateView.as_view(), name='category-create'),
    path('maintenance/', MaintenanceLedgerListView.as_view(), name='maintenance-list'),
    path('maintenance/<str:month>/', MaintenanceSummaryView.as_view(), name='maintenance-summary'),
    path('dues/me/', MyDuesView.as_view(), name='my-dues'),
    path('dues/', DueListCreateView.as_view(), name='due-list-create'),
    path('dues/<int:pk>/mark-paid/', DueMarkPaidView.as_view(), name='due-mark-paid'),
]