import os
import re

backend_dir = r"C:\Projects\SafeVoice\backend"

# 1. Update core/settings.py
settings_path = os.path.join(backend_dir, "core", "settings.py")
with open(settings_path, "r") as f:
    settings = f.read()

if "import environ" not in settings:
    settings = "import os\nfrom pathlib import Path\nimport environ\n" + settings.replace("from pathlib import Path\n", "")
    settings = settings.replace("import os\nimport os\n", "import os\n")

# Add environ
environ_setup = """
env = environ.Env(
    DEBUG=(bool, False)
)
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))
"""
settings = settings.replace("BASE_DIR = Path(__file__).resolve().parent.parent", "BASE_DIR = Path(__file__).resolve().parent.parent\n" + environ_setup)

# Update SECRET_KEY and DEBUG
settings = re.sub(r"SECRET_KEY = .*", "SECRET_KEY = env('SECRET_KEY', default='unsafe-secret-key')", settings)
settings = re.sub(r"DEBUG = .*", "DEBUG = env('DEBUG', default=True)", settings)

# Update ALLOWED_HOSTS
settings = re.sub(r"ALLOWED_HOSTS = \[\]", "ALLOWED_HOSTS = ['*']", settings)

# Update INSTALLED_APPS
installed_apps = """INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'api',
]"""
settings = re.sub(r"INSTALLED_APPS = \[.*?\]", installed_apps, settings, flags=re.DOTALL)

# Update MIDDLEWARE
middleware = """MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]"""
settings = re.sub(r"MIDDLEWARE = \[.*?\]", middleware, settings, flags=re.DOTALL)

# Add CORS and AUTH_USER_MODEL
additions = """
CORS_ALLOW_ALL_ORIGINS = True # For React Native during development
AUTH_USER_MODEL = 'api.User'

REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ]
}
"""
settings += additions

# Update DATABASES
databases = """DATABASES = {
    'default': env.db('DATABASE_URL', default=f'sqlite:///{BASE_DIR / "db.sqlite3"}')
}"""
settings = re.sub(r"DATABASES = \{.*?\}", databases, settings, flags=re.DOTALL)

with open(settings_path, "w") as f:
    f.write(settings)


# 2. Update core/urls.py
urls_path = os.path.join(backend_dir, "core", "urls.py")
urls_content = """from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
]
"""
with open(urls_path, "w") as f:
    f.write(urls_content)


# 3. Create models in api/models.py
models_path = os.path.join(backend_dir, "api", "models.py")
models_content = """from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    phone_number = models.CharField(max_length=20, blank=True, null=True)

class EmergencyContact(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='contacts')
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20)
    relationship = models.CharField(max_length=100, blank=True, null=True)
    is_active = models.BooleanField(default=True)

class EmergencyHistory(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='emergencies')
    trigger_type = models.CharField(max_length=100) # e.g., 'keyword', 'manual'
    location_lat = models.FloatField(null=True, blank=True)
    location_lng = models.FloatField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=50, default='resolved')
    score = models.IntegerField(default=0)

class DeviceToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='devices')
    token = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
"""
with open(models_path, "w") as f:
    f.write(models_content)


# 4. Create serializers in api/serializers.py
serializers_path = os.path.join(backend_dir, "api", "serializers.py")
serializers_content = """from rest_framework import serializers
from .models import User, EmergencyContact, EmergencyHistory, DeviceToken

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'phone_number']

class EmergencyContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyContact
        fields = '__all__'

class EmergencyHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyHistory
        fields = '__all__'

class DeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = '__all__'
"""
with open(serializers_path, "w") as f:
    f.write(serializers_content)


# 5. Create views in api/views.py
views_path = os.path.join(backend_dir, "api", "views.py")
views_content = """from rest_framework import viewsets
from .models import User, EmergencyContact, EmergencyHistory, DeviceToken
from .serializers import UserSerializer, EmergencyContactSerializer, EmergencyHistorySerializer, DeviceTokenSerializer

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

class EmergencyContactViewSet(viewsets.ModelViewSet):
    queryset = EmergencyContact.objects.all()
    serializer_class = EmergencyContactSerializer

class EmergencyHistoryViewSet(viewsets.ModelViewSet):
    queryset = EmergencyHistory.objects.all()
    serializer_class = EmergencyHistorySerializer

class DeviceTokenViewSet(viewsets.ModelViewSet):
    queryset = DeviceToken.objects.all()
    serializer_class = DeviceTokenSerializer
"""
with open(views_path, "w") as f:
    f.write(views_content)


# 6. Create urls in api/urls.py
api_urls_path = os.path.join(backend_dir, "api", "urls.py")
api_urls_content = """from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, EmergencyContactViewSet, EmergencyHistoryViewSet, DeviceTokenViewSet

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'contacts', EmergencyContactViewSet)
router.register(r'history', EmergencyHistoryViewSet)
router.register(r'devices', DeviceTokenViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
"""
with open(api_urls_path, "w") as f:
    f.write(api_urls_content)


# 7. Create .env and .env.example
env_path = os.path.join(backend_dir, ".env")
env_example_path = os.path.join(backend_dir, ".env.example")
env_content = """SECRET_KEY=your-secret-key
DEBUG=True
DATABASE_URL=sqlite:///db.sqlite3
"""
with open(env_path, "w") as f:
    f.write(env_content)
with open(env_example_path, "w") as f:
    f.write(env_content)


# 8. Create README.md
readme_path = os.path.join(backend_dir, "README.md")
readme_content = """# SafeVoice Backend

## Setup
1. Create a virtual environment: `python -m venv venv`
2. Activate it: `.\\venv\\Scripts\\activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and fill in your Supabase DB string in `DATABASE_URL`.
5. Run migrations: `python manage.py migrate`
6. Start server: `python manage.py runserver`
"""
with open(readme_path, "w") as f:
    f.write(readme_content)
