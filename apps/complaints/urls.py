from django.urls import path
from .views import ComplaintListCreateView, ComplaintDetailView, ComplaintNoteView, VoiceTranscribeView

urlpatterns = [
    path('', ComplaintListCreateView.as_view(), name='complaint-list-create'),
    path('<int:pk>/', ComplaintDetailView.as_view(), name='complaint-detail'),
    path('<int:pk>/notes/', ComplaintNoteView.as_view(), name='complaint-notes'),
    path('voice/transcribe/', VoiceTranscribeView.as_view(), name='voice-transcribe'),
]