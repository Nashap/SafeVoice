from django.db import models
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
    idempotency_key = models.CharField(max_length=255, blank=True, null=True, unique=True)

    # Audio evidence metadata
    audio_bucket = models.CharField(max_length=100, default='emergency-audio', blank=True, null=True)
    audio_path = models.CharField(max_length=500, blank=True, null=True)
    audio_duration = models.FloatField(blank=True, null=True) # in seconds
    audio_mime_type = models.CharField(max_length=50, default='audio/wav')
    audio_status = models.CharField(max_length=50, default='none') # 'none', 'pending', 'uploaded', 'failed'
    recording_timestamp = models.DateTimeField(blank=True, null=True)

    # Human-readable location & Google Maps integration
    resolved_address = models.TextField(blank=True, null=True)
    google_maps_url = models.URLField(max_length=1000, blank=True, null=True)
    location_accuracy = models.FloatField(blank=True, null=True)

class DeviceToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='devices')
    token = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class NotificationAttempt(models.Model):
    emergency = models.ForeignKey(EmergencyHistory, on_delete=models.CASCADE, related_name='notification_attempts')
    contact = models.ForeignKey(EmergencyContact, on_delete=models.SET_NULL, null=True, blank=True)
    channel = models.CharField(max_length=50) # 'fcm' or 'sms'
    status = models.CharField(max_length=50) # 'success', 'failed'
    error_details = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
