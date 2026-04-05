from django.urls import path
from .views import (
    VoiceTranscribeView,
    BylawAskView,
    AISummaryView,
    VoiceComplaintCategorizeView,
)

urlpatterns = [
    path('voice/transcribe/', VoiceTranscribeView.as_view(), name='voice-transcribe'),
    path('bylaw/ask/', BylawAskView.as_view(), name='bylaw-ask'),
    path('summary/', AISummaryView.as_view(), name='ai-summary'),
    path('categorize/', VoiceComplaintCategorizeView.as_view(), name='ai-categorize'),
]