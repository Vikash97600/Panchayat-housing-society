from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.utils import timezone

from .models import CustomUser, Society, AuditLog
from .serializers import (
    CustomUserSerializer, CustomUserCreateSerializer, 
    UserLoginSerializer, UserProfileSerializer
)


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class IsCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'committee']


class IsResident(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'resident'


class IsAdminOrCommittee(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'committee']


def log_audit(user, action, model_name=None, object_id=None, details=None, request=None):
    ip = request.META.get('REMOTE_ADDR') if request else None
    AuditLog.objects.create(
        user=user, action=action, model_name=model_name,
        object_id=object_id, details=details, ip_address=ip
    )


class RegisterView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = CustomUserCreateSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        log_audit(user, 'user_registered', 'CustomUser', user.id, {'email': user.email})
        
        return Response({
            'success': True,
            'data': CustomUserSerializer(user).data,
            'message': 'Registration successful. Waiting for admin approval.'
        }, status=status.HTTP_201_CREATED)


class LoginView(generics.GenericAPIView):
    serializer_class = UserLoginSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = authenticate(
            username=serializer.validated_data['email'],
            password=serializer.validated_data['password']
        )
        
        if not user:
            return Response({
                'success': False,
                'data': {},
                'message': 'Invalid credentials'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        if not user.is_approved:
            return Response({
                'success': False,
                'data': {},
                'message': 'Account not approved yet'
            }, status=status.HTTP_403_FORBIDDEN)
        
        if not user.is_active:
            return Response({
                'success': False,
                'data': {},
                'message': 'Account is deactivated'
            }, status=status.HTTP_403_FORBIDDEN)
        
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        
        refresh = RefreshToken.for_user(user)
        
        log_audit(user, 'user_login', 'CustomUser', user.id, request=request)
        
        return Response({
            'success': True,
            'data': {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': UserProfileSerializer(user).data
            },
            'message': 'Login successful'
        })


class LogoutView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            
            log_audit(request.user, 'user_logout', 'CustomUser', request.user.id, request=request)
            
            return Response({
                'success': True,
                'data': {},
                'message': 'Logged out successfully'
            })
        except Exception:
            return Response({
                'success': True,
                'data': {},
                'message': 'Logged out'
            })


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response({
            'success': True,
            'data': serializer.data,
            'message': ''
        })

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        log_audit(request.user, 'user_updated', 'CustomUser', instance.id, request=request)
        
        return Response({
            'success': True,
            'data': serializer.data,
            'message': 'Profile updated'
        })


class UserListView(generics.ListAPIView):
    serializer_class = CustomUserSerializer
    permission_classes = [IsAdminOrCommittee]

    def get_queryset(self):
        return CustomUser.objects.filter(society=self.request.user.society).select_related('society')


class ApproveUserView(generics.UpdateAPIView):
    queryset = CustomUser.objects.all()
    permission_classes = [IsCommittee]

    def update(self, request, *args, **kwargs):
        user = self.get_object()
        user.is_approved = True
        user.save(update_fields=['is_approved'])
        
        log_audit(request.user, 'user_approved', 'CustomUser', user.id)
        
        return Response({
            'success': True,
            'data': CustomUserSerializer(user).data,
            'message': f'User {user.email} approved'
        })