from django.urls import path
from .views import (
    VoiceTranscribeView,
    AISummaryView,
    VoiceComplaintCategorizeView,
)

urlpatterns = [
    path('voice/transcribe/', VoiceTranscribeView.as_view(), name='voice-transcribe'),
    path('summary/', AISummaryView.as_view(), name='ai-summary'),
    path('categorize/', VoiceComplaintCategorizeView.as_view(), name='ai-categorize'),
]