from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

def health_check(request):
    """
    Lightweight health check endpoint for Render, container orchestrators, and mobile app health verification.
    """
    return JsonResponse({
        'status': 'healthy',
        'service': 'safevoice-backend',
        'version': '1.0.0'
    })

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('healthz/', health_check, name='health_check_k8s'),
    path('api/health/', health_check, name='api_health_check'),
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
]
