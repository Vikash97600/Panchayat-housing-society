from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.utils import timezone
from datetime import timedelta
import uuid

from .models import CustomUser, Society, AuditLog, PasswordResetToken
from .serializers import (
    CustomUserSerializer, CustomUserCreateSerializer, 
    UserLoginSerializer, UserProfileSerializer, SocietySerializer,
    ForgotPasswordSerializer, ResetPasswordSerializer, ChangePasswordSerializer,
    AuditLogSerializer
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


class SocietyListCreateView(generics.ListCreateAPIView):
    queryset = Society.objects.all()
    serializer_class = SocietySerializer
    permission_classes = [IsAdmin]

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'success': True,
            'data': serializer.data,
            'message': ''
        })

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        society = serializer.save()
        
        log_audit(request.user, 'society_created', 'Society', society.id, {'name': society.name})
        
        return Response({
            'success': True,
            'data': serializer.data,
            'message': 'Society created successfully'
        }, status=status.HTTP_201_CREATED)


class SocietyDetailView(generics.RetrieveUpdateAPIView):
    queryset = Society.objects.all()
    serializer_class = SocietySerializer
    permission_classes = [IsAdmin]

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
        society = serializer.save()
        
        log_audit(request.user, 'society_updated', 'Society', society.id, {'name': society.name})
        
        return Response({
            'success': True,
            'data': serializer.data,
            'message': 'Society updated successfully'
        })


class ForgotPasswordView(generics.GenericAPIView):
    serializer_class = ForgotPasswordSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        email = serializer.validated_data['email']
        
        try:
            user = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            # Return success message even if user doesn't exist (security practice)
            return Response({
                'success': True,
                'data': {},
                'message': 'If an account with this email exists, a password reset token has been generated'
            }, status=status.HTTP_200_OK)
        
        # Generate reset token
        token = str(uuid.uuid4())
        expires_at = timezone.now() + timedelta(hours=1)
        
        # Delete existing token if any
        PasswordResetToken.objects.filter(user=user).delete()
        
        # Create new reset token
        reset_token = PasswordResetToken.objects.create(
            user=user,
            token=token,
            expires_at=expires_at
        )
        
        log_audit(user, 'password_reset_requested', 'CustomUser', user.id, {'email': email}, request)
        
        return Response({
            'success': True,
            'data': {
                'token': token,
                'message': f'Password reset token generated. Token expires in 1 hour.'
            },
            'message': 'Password reset token generated successfully'
        }, status=status.HTTP_200_OK)


class ResetPasswordView(generics.GenericAPIView):
    serializer_class = ResetPasswordSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        token = serializer.validated_data['token']
        password = serializer.validated_data['password']
        
        try:
            reset_token = PasswordResetToken.objects.get(token=token)
        except PasswordResetToken.DoesNotExist:
            return Response({
                'success': False,
                'data': {},
                'message': 'Invalid or expired reset token'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if token is still valid
        if not reset_token.is_valid():
            reset_token.delete()
            return Response({
                'success': False,
                'data': {},
                'message': 'Reset token has expired. Please request a new one.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update password
        user = reset_token.user
        user.set_password(password)
        user.save()
        
        # Delete the reset token after use
        reset_token.delete()
        
        log_audit(user, 'password_reset', 'CustomUser', user.id, {'email': user.email}, request)
        
        return Response({
            'success': True,
            'data': {},
            'message': 'Password reset successfully. You can now login with your new password.'
        }, status=status.HTTP_200_OK)


class ChangePasswordView(generics.GenericAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = request.user
        current_password = serializer.validated_data['current_password']
        new_password = serializer.validated_data['new_password']
        
        # Verify current password
        if not user.check_password(current_password):
            return Response({
                'success': False,
                'data': {},
                'message': 'Current password is incorrect'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if new password is different from current
        if user.check_password(new_password):
            return Response({
                'success': False,
                'data': {},
                'message': 'New password must be different from current password'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update password
        user.set_password(new_password)
        user.save()
        
        log_audit(user, 'password_changed', 'CustomUser', user.id, request=request)
        
        return Response({
            'success': True,
            'data': {},
            'message': 'Password changed successfully. Please login again with your new password.'
        }, status=status.HTTP_200_OK)


class AuditLogListView(generics.ListAPIView):
    queryset = AuditLog.objects.all().order_by('-timestamp')
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]
    
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)