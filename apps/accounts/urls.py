from django.urls import path
from .views import RegisterView, LoginView, LogoutView, MeView, UserListView, ApproveUserView, SocietyListCreateView, SocietyDetailView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),
    path('users/', UserListView.as_view(), name='user-list'),
    path('users/<int:pk>/approve/', ApproveUserView.as_view(), name='approve-user'),
    path('societies/', SocietyListCreateView.as_view(), name='society-list-create'),
    path('societies/<int:pk>/', SocietyDetailView.as_view(), name='society-detail'),
]