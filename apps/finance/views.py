from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.core.cache import cache
from datetime import datetime
from dateutil.relativedelta import relativedelta
import json
import logging

from apps.ai_engine.gemini_client import call_gemini
from apps.accounts.views import log_audit
from .models import MaintenanceCategory, MaintenanceLedger, Due
from .serializers import (
    MaintenanceCategorySerializer, MaintenanceLedgerSerializer,
    MaintenanceLedgerCreateSerializer, DueSerializer, DueCreateSerializer,
    DueMarkPaidSerializer
)

logger = logging.getLogger(__name__)


class IsAdminOrCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'committee']


class MaintenanceCategoryListView(generics.ListAPIView):
    serializer_class = MaintenanceCategorySerializer
    permission_classes = [IsAdminOrCommittee]

    def get_queryset(self):
        return MaintenanceCategory.objects.filter(society=self.request.user.society)


class MaintenanceLedgerListView(generics.ListCreateAPIView):
    serializer_class = MaintenanceLedgerSerializer
    permission_classes = [IsAdminOrCommittee]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return MaintenanceLedgerCreateSerializer
        return MaintenanceLedgerSerializer

    def get_queryset(self):
        month_param = self.kwargs.get('month')
        queryset = MaintenanceLedger.objects.filter(society=self.request.user.society)
        if month_param:
            try:
                month_date = datetime.strptime(month_param, '%Y-%m').date().replace(day=1)
                queryset = queryset.filter(month=month_date)
            except ValueError:
                pass
        return queryset.select_related('category')

    def perform_create(self, serializer):
        serializer.save(society=self.request.user.society)


class MaintenanceSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, month):
        try:
            month_date = datetime.strptime(month, '%Y-%m').date().replace(day=1)
        except ValueError:
            month_date = timezone.now().date().replace(day=1)

        ledgers = MaintenanceLedger.objects.filter(
            society=request.user.society,
            month=month_date
        ).select_related('category')

        breakdown = []
        total = 0
        for ledger in ledgers:
            breakdown.append({
                'category': ledger.category.name,
                'amount': float(ledger.amount)
            })
            total += float(ledger.amount)

        cache_key = f"maintenance_summary_{request.user.society.id}_{month}"
        cached = cache.get(cache_key)

        ai_summary = ""
        if cached:
            ai_summary = cached
        else:
            try:
                prompt = f"""Explain this housing society maintenance expense breakdown in simple, friendly language for a resident — not an accountant.
Keep it to 2 to 3 sentences only. Mention the biggest expense.
Do not use accounting jargon.

Month: {month}
Total amount: Rs. {total}
Breakdown: {json.dumps(breakdown)}"""
                ai_summary = call_gemini(
                    system_prompt="You are a friendly housing society assistant.",
                    user_message=prompt,
                    max_tokens=200
                )
                cache.set(cache_key, ai_summary, 86400)
            except Exception as e:
                logger.error(f"Maintenance AI error: {e}")
                ai_summary = f"Total maintenance for {month}: ₹{total:,.2f}"

        return Response({
            'success': True,
            'data': {
                'month': month,
                'breakdown': breakdown,
                'total': total,
                'ai_summary': ai_summary
            },
            'message': ''
        })


class DueListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdminOrCommittee]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DueCreateSerializer
        return DueSerializer

    def get_queryset(self):
        return Due.objects.filter(
            society=self.request.user.society
        ).select_related('resident')


class MyDuesView(generics.ListAPIView):
    serializer_class = DueSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Due.objects.filter(
            resident=self.request.user,
            society=self.request.user.society
        ).order_by('-month')


class DueMarkPaidView(generics.UpdateAPIView):
    serializer_class = DueMarkPaidSerializer
    permission_classes = [IsAdminOrCommittee]
    queryset = Due.objects.all()

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_paid = True
        instance.paid_at = timezone.now()
        instance.payment_ref = request.data.get('payment_ref', '')
        instance.save()

        log_audit(request.user, 'due_marked_paid', 'Due', instance.id,
                  {'resident': instance.resident.email, 'month': str(instance.month)}, request)

        return Response({
            'success': True,
            'data': DueSerializer(instance).data,
            'message': 'Due marked as paid'
        })


class CategoryCreateView(generics.CreateAPIView):
    serializer_class = MaintenanceCategorySerializer
    permission_classes = [IsAdminOrCommittee]

    def perform_create(self, serializer):
        serializer.save(society=self.request.user.society)