from django.urls import path
from .views import BylawListView, BylawUploadView, BylawAskView, BylawDownloadView

urlpatterns = [
    path('', BylawListView.as_view(), name='bylaw-list'),
    path('upload/', BylawUploadView.as_view(), name='bylaw-upload'),
    path('ask/', BylawAskView.as_view(), name='bylaw-ask'),
    path('<int:bylaw_id>/download/', BylawDownloadView.as_view(), name='bylaw-download'),
]