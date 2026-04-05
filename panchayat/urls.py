from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from apps.accounts.views_template import login_view, register_view, admin_view, committee_view, resident_view

def api_root(request):
    return JsonResponse({
        'success': True,
        'message': 'Panchayat API',
        'endpoints': {
            'auth': '/api/auth/',
            'complaints': '/api/complaints/',
            'bylaws': '/api/bylaws/',
            'services': '/api/services/',
            'finance': '/api/finance/',
            'notices': '/api/notices/',
            'ai': '/api/ai/',
            'admin': '/django-admin/'
        }
    })

urlpatterns = [
    path('', api_root, name='api-root'),
    path('django-admin/', admin.site.urls),
    
    # Template views
    path('login/', login_view, name='login'),
    path('register/', register_view, name='register'),
    path('admin-panel/', admin_view, name='admin'),
    path('committee/', committee_view, name='committee'),
    path('resident/', resident_view, name='resident'),
    
    # API endpoints
    path('api/auth/', include('apps.accounts.urls')),
    path('api/complaints/', include('apps.complaints.urls')),
    path('api/bylaws/', include('apps.bylaws.urls')),
    path('api/services/', include('apps.services.urls')),
    path('api/finance/', include('apps.finance.urls')),
    path('api/notices/', include('apps.notices.urls')),
    path('api/ai/', include('apps.ai_engine.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)