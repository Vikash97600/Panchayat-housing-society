import os
from urllib.parse import parse_qs

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator
from channels.db import database_sync_to_async
from django.utils.functional import cached_property

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'panchayat.settings')

django_asgi_app = get_asgi_application()

from apps.chat.routing import websocket_urlpatterns


class JWTAuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'websocket':
            query_string = scope.get('query_string', b'').decode()
            query_params = parse_qs(query_string)
            token = query_params.get('token', [None])[0]
            
            if token:
                from rest_framework_simplejwt.authentication import JWTAuthentication
                from rest_framework.exceptions import AuthenticationFailed
                
                try:
                    auth = JWTAuthentication()
                    validated_token = auth.get_validated_token(token)
                    user = auth.get_user(validated_token)
                    scope['user'] = user
                except Exception:
                    scope['user'] = None
            else:
                scope['user'] = None
        
        return await self.app(scope, receive, send)


application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': AllowedHostsOriginValidator(
        JWTAuthMiddleware(
            AuthMiddlewareStack(
                URLRouter(websocket_urlpatterns)
            )
        ),
    ),
})