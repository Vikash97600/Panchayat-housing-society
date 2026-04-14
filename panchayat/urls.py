from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from apps.accounts.views_template import login_view, register_view, admin_view, committee_view, resident_view

@csrf_exempt
def api_root(request):
    # Render a landing page that will check auth and redirect
    html = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panchayat - Housing Society Management</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .loading-spinner {
            width: 50px;
            height: 50px;
            border: 5px solid #f3f3f3;
            border-top: 5px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .card {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 40px;
            text-align: center;
            max-width: 400px;
        }
        .brand {
            font-size: 2rem;
            font-weight: 700;
            color: #667eea;
            margin-bottom: 10px;
        }
        .tagline {
            color: #666;
            margin-bottom: 30px;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="brand">🏘️ Panchayat</div>
        <p class="tagline">Housing Society Management System</p>
        <div class="loading-spinner mx-auto mb-3"></div>
        <p class="text-muted">Loading your dashboard...</p>
    </div>
    <script>
        // Check authentication and redirect
        (function() {
            const token = localStorage.getItem('panchayat_token');
            const role = localStorage.getItem('panchayat_role');
            
            if (token && role) {
                if (role === 'admin') {
                    window.location.href = '/admin-panel/';
                } else if (role === 'secretary' || role === 'treasurer' || role === 'committee') {
                    window.location.href = '/committee/';
                } else if (role === 'resident') {
                    window.location.href = '/resident/';
                } else {
                    window.location.href = '/login/';
                }
            } else {
                window.location.href = '/login/';
            }
        })();
    </script>
</body>
</html>
    """
    return HttpResponse(html)

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
    path('api/', include('apps.services.urls')),
    path('api/finance/', include('apps.finance.urls')),
    path('api/notices/', include('apps.notices.urls')),
    path('api/ai/', include('apps.ai_engine.urls')),
    path('api/chat/', include('apps.chat.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)