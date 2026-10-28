from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView, CustomTokenObtainPairView, UserViewSet,
    EmergencyContactViewSet, EmergencyHistoryViewSet, DeviceTokenViewSet
)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'contacts', EmergencyContactViewSet, basename='contact')
router.register(r'history', EmergencyHistoryViewSet, basename='history')
router.register(r'devices', DeviceTokenViewSet, basename='device')

urlpatterns = [
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('', include(router.urls)),
]
