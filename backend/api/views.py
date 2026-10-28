import os
import logging
from datetime import timedelta
from django.db import models
from django.utils import timezone

logger = logging.getLogger(__name__)
from rest_framework import viewsets, generics, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import User, EmergencyContact, EmergencyHistory, DeviceToken, NotificationAttempt
from .serializers import (
    UserSerializer, RegisterSerializer, EmergencyContactSerializer,
    EmergencyHistorySerializer, DeviceTokenSerializer, CustomTokenObtainPairSerializer
)
from .utils import send_sos_fcm
from .sms_provider import send_emergency_sms
from .supabase_storage import upload_emergency_audio, create_signed_audio_url

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = RegisterSerializer

class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return User.objects.filter(id=self.request.user.id)
        return User.objects.none()

    @action(detail=False, methods=['get', 'patch', 'put'])
    def me(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)
        if request.method == 'GET':
            serializer = self.get_serializer(request.user)
            return Response(serializer.data)
        serializer = self.get_serializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

class EmergencyContactViewSet(viewsets.ModelViewSet):
    serializer_class = EmergencyContactSerializer

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return EmergencyContact.objects.filter(user=self.request.user)
        return EmergencyContact.objects.none()

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class EmergencyHistoryViewSet(viewsets.ModelViewSet):
    serializer_class = EmergencyHistorySerializer

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return EmergencyHistory.objects.none()

        # Auto-expire stale pending/preparing/uploading audio uploads older than 90 seconds
        try:
            stale_cutoff = timezone.now() - timedelta(seconds=90)
            EmergencyHistory.objects.filter(
                audio_status__in=['pending', 'preparing', 'uploading'],
                timestamp__lt=stale_cutoff
            ).filter(
                models.Q(audio_path__isnull=True) | models.Q(audio_path='')
            ).update(audio_status='failed')
        except Exception as e:
            logger.warning(f"[EmergencyHistoryViewSet] Could not auto-expire stale uploads: {e}")

        # Senders see their own emergencies
        qs_owner = EmergencyHistory.objects.filter(user=self.request.user)

        # Active emergency contacts can also view emergencies triggered by the sender
        contact_phone = "".join(filter(str.isdigit, self.request.user.phone_number or ""))
        if len(contact_phone) >= 10:
            contact_phone_core = contact_phone[-10:]
            sender_ids = EmergencyContact.objects.filter(
                phone__endswith=contact_phone_core,
                is_active=True
            ).values_list('user_id', flat=True)
            return EmergencyHistory.objects.filter(
                models.Q(user=self.request.user) | models.Q(user_id__in=sender_ids)
            ).distinct().order_by('-timestamp')

        return qs_owner.order_by('-timestamp')

    def create(self, request, *args, **kwargs):
        idempotency_key = request.data.get('idempotency_key')
        if idempotency_key:
            existing = EmergencyHistory.objects.filter(user=request.user, idempotency_key=idempotency_key).first()
            if existing:
                serializer = self.get_serializer(existing)
                response_data = serializer.data
                response_data['message'] = "Duplicate SOS ignored."
                return Response(response_data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        history = serializer.save(user=self.request.user)

        # Generate Google Maps link if coordinates available and not already provided
        if not history.google_maps_url and history.location_lat and history.location_lng and not (history.location_lat == 0 and history.location_lng == 0):
            history.google_maps_url = f"https://www.google.com/maps/search/?api=1&query={history.location_lat},{history.location_lng}"
            history.save(update_fields=['google_maps_url'])

        contacts = EmergencyContact.objects.filter(user=self.request.user, is_active=True)

        fcm_sent = 0
        fcm_skipped = 0
        sms_sent = 0
        sms_simulated = 0
        has_contacts = contacts.exists()

        message = f"An emergency alert has been triggered by {self.request.user.username}."

        for contact in contacts:
            # 1. SMS
            sms_success, sms_result = send_emergency_sms(contact, message, history.location_lat, history.location_lng)

            if sms_success and sms_result == "Simulated":
                sms_simulated += 1
                sms_status = 'simulated'
            elif sms_success:
                sms_sent += 1
                sms_status = 'provider_accepted'
            else:
                sms_status = 'failed'

            NotificationAttempt.objects.create(
                emergency=history,
                contact=contact,
                channel='sms',
                status=sms_status,
                error_details=sms_result
            )

            # 2. FCM to contact's app account
            contact_phone = "".join(filter(str.isdigit, contact.phone or ""))
            if len(contact_phone) >= 10:
                contact_phone_core = contact_phone[-10:]
                contact_user = User.objects.filter(phone_number__endswith=contact_phone_core).first()
            else:
                contact_user = None

            if contact_user:
                fcm_success, fcm_result = send_sos_fcm(contact_user, history, is_contact=True, sender=self.request.user)
                if fcm_success:
                    fcm_sent += 1
                    fcm_status = 'provider_accepted'
                elif 'Skipped' in fcm_result:
                    fcm_skipped += 1
                    fcm_status = 'skipped'
                else:
                    fcm_status = 'failed'

                NotificationAttempt.objects.create(
                    emergency=history,
                    contact=contact,
                    channel='fcm',
                    status=fcm_status,
                    error_details=fcm_result
                )
            else:
                fcm_skipped += 1
                NotificationAttempt.objects.create(
                    emergency=history,
                    contact=contact,
                    channel='fcm',
                    status='skipped',
                    error_details='Skipped - Contact is not registered on SafeVoice'
                )

        if not has_contacts:
            history.status = 'no_contacts'
        elif fcm_sent > 0 or sms_sent > 0 or sms_simulated > 0:
            history.status = 'dispatched'
        else:
            history.status = 'failed'
        history.save()

        # Build custom response
        response_data = serializer.data
        if not has_contacts:
            response_data['message'] = "SOS recorded successfully, but you have no active emergency contacts saved."
        else:
            msg_parts = []
            if sms_sent > 0:
                msg_parts.append(f"{sms_sent} Real SMS")
            if sms_simulated > 0:
                msg_parts.append(f"{sms_simulated} Simulated SMS")
            if fcm_sent > 0:
                msg_parts.append(f"{fcm_sent} Push notifications")
            if fcm_skipped > 0:
                msg_parts.append(f"{fcm_skipped} Skipped FCM (No Device / Unregistered)")

            if msg_parts:
                response_data['message'] = "SOS recorded. Dispatched via: " + ", ".join(msg_parts)
            else:
                response_data['message'] = "SOS recorded successfully, but all notifications genuinely failed to dispatch."

        headers = self.get_success_headers(serializer.data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def audio(self, request, pk=None):
        emergency = self.get_object()
        if emergency.user != request.user:
            return Response({'error': 'You can only upload audio for your own emergency.'}, status=status.HTTP_403_FORBIDDEN)

        # Idempotency / Duplicate upload prevention:
        if emergency.audio_status in ('uploaded', 'uploaded_local') and emergency.audio_path:
            return Response({
                'status': emergency.audio_status,
                'storage': 'supabase' if emergency.audio_bucket == 'emergency-audio' else 'local_fallback',
                'audio_bucket': emergency.audio_bucket,
                'audio_path': emergency.audio_path,
                'audio_duration': emergency.audio_duration,
                'message': 'Audio evidence was already uploaded successfully.'
            }, status=status.HTTP_200_OK)

        audio_file = request.FILES.get('audio') or request.FILES.get('file')
        if not audio_file:
            return Response({'error': 'No audio file provided'}, status=status.HTTP_400_BAD_REQUEST)

        if audio_file.size == 0:
            return Response({'error': 'Audio file is empty (0 bytes)'}, status=status.HTTP_400_BAD_REQUEST)

        if audio_file.size > 10 * 1024 * 1024:
            return Response({'error': 'Audio file exceeds 10MB limit'}, status=status.HTTP_400_BAD_REQUEST)

        audio_bytes = audio_file.read()
        # Verify valid WAV format (RIFF...WAVE header, >= 44 bytes)
        if len(audio_bytes) < 44 or not (audio_bytes[:4] == b'RIFF' and audio_bytes[8:12] == b'WAVE'):
            return Response({'error': 'Invalid audio file format. Must be a valid WAV audio file.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            duration = float(request.data.get('duration', 15.0) or 15.0)
        except (ValueError, TypeError):
            duration = 15.0

        success, object_path, err, storage_type = upload_emergency_audio(
            user_id=request.user.id,
            emergency_id=emergency.id,
            audio_bytes=audio_bytes,
            filename=audio_file.name
        )

        if not success:
            emergency.audio_bucket = 'emergency-audio' if storage_type == 'supabase' else 'local_fallback'
            emergency.audio_path = ''
            emergency.audio_duration = duration
            emergency.audio_mime_type = 'audio/wav'
            emergency.audio_status = 'failed'
            emergency.recording_timestamp = timezone.now()
            emergency.save()
            return Response({
                'status': 'failed',
                'storage': storage_type,
                'error': err or 'Upload failed'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if storage_type == 'supabase':
            emergency.audio_bucket = 'emergency-audio'
            emergency.audio_status = 'uploaded'
            msg = 'Audio clip uploaded to Supabase Storage'
        else:
            emergency.audio_bucket = 'local_fallback'
            emergency.audio_status = 'uploaded_local'
            msg = 'Audio clip saved to local fallback storage (Supabase credentials not configured)'

        emergency.audio_path = object_path
        emergency.audio_duration = duration
        emergency.audio_mime_type = 'audio/wav'
        emergency.recording_timestamp = timezone.now()
        emergency.save()

        return Response({
            'status': emergency.audio_status,
            'storage': storage_type,
            'audio_bucket': emergency.audio_bucket,
            'audio_path': emergency.audio_path,
            'audio_duration': emergency.audio_duration,
            'message': msg
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def audio_url(self, request, pk=None):
        emergency = self.get_object()

        # Strict Account Isolation check
        is_owner = (emergency.user == request.user)
        is_contact = False
        contact_phone = ''.join(filter(str.isdigit, request.user.phone_number or ''))
        if len(contact_phone) >= 10:
            contact_phone_core = contact_phone[-10:]
            is_contact = EmergencyContact.objects.filter(
                user=emergency.user,
                is_active=True,
                phone__endswith=contact_phone_core
            ).exists()

        if not (is_owner or is_contact):
            return Response({'error': 'Unauthorized to access this emergency recording'}, status=status.HTTP_403_FORBIDDEN)

        if emergency.audio_status not in ('uploaded', 'uploaded_local') or not emergency.audio_path:
            return Response({
                'error': 'Audio recording is not available for this emergency',
                'audio_status': emergency.audio_status
            }, status=status.HTTP_404_NOT_FOUND)

        storage_type = 'supabase' if emergency.audio_status == 'uploaded' else 'local_fallback'
        success, signed_url, err = create_signed_audio_url(emergency.audio_path, expires_in=300, storage_type=storage_type)
        if not success:
            return Response({'error': err or 'Failed to generate signed playback URL'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if signed_url.startswith('/api/'):
            signed_url = request.build_absolute_uri('/')[:-1] + signed_url

        return Response({
            'signed_url': signed_url,
            'expires_in': 300,
            'duration': emergency.audio_duration,
            'mime_type': emergency.audio_mime_type,
            'audio_status': emergency.audio_status,
            'storage': storage_type
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='stream_local')
    def stream_local(self, request):
        from django.conf import settings
        from django.http import FileResponse, Http404

        path = request.query_params.get('path')
        if not path:
            return Response({'error': 'Path is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Enforce account isolation on local streaming
        parts = path.strip('/').split('/')
        if len(parts) < 2:
            raise Http404("Invalid audio path structure")

        try:
            emergency_id = int(parts[1])
            emergency = EmergencyHistory.objects.filter(id=emergency_id).first()
            if not emergency:
                raise Http404("Emergency record not found")

            is_owner = (emergency.user == request.user)
            is_contact = False
            contact_phone = ''.join(filter(str.isdigit, request.user.phone_number or ''))
            if len(contact_phone) >= 10:
                contact_phone_core = contact_phone[-10:]
                is_contact = EmergencyContact.objects.filter(
                    user=emergency.user,
                    is_active=True,
                    phone__endswith=contact_phone_core
                ).exists()

            if not (is_owner or is_contact):
                return Response({'error': 'Unauthorized to access this emergency recording'}, status=status.HTTP_403_FORBIDDEN)
        except (ValueError, TypeError):
            raise Http404("Invalid emergency path")

        media_root = getattr(settings, 'MEDIA_ROOT', os.path.join(settings.BASE_DIR, 'media'))
        full_path = os.path.abspath(os.path.join(media_root, 'emergency-audio', path))
        if not full_path.startswith(os.path.abspath(media_root)) or not os.path.exists(full_path):
            raise Http404('Audio file not found')
        return FileResponse(open(full_path, 'rb'), content_type='audio/wav')
class DeviceTokenViewSet(viewsets.ModelViewSet):
    serializer_class = DeviceTokenSerializer
    lookup_field = 'token'

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return DeviceToken.objects.filter(user=self.request.user)
        return DeviceToken.objects.none()

    def create(self, request, *args, **kwargs):
        token = request.data.get('token')
        if token:
            obj, created = DeviceToken.objects.get_or_create(token=token, defaults={'user': request.user})
            if not created and obj.user != request.user:
                obj.user = request.user
                obj.save()
            serializer = self.get_serializer(obj)
            return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        return Response({'error': 'Token is required'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post', 'delete'])
    def unregister(self, request):
        token = request.data.get('token') or request.query_params.get('token')
        if token:
            DeviceToken.objects.filter(token=token, user=request.user).delete()
            return Response({'status': 'unregistered'}, status=status.HTTP_200_OK)
        return Response({'error': 'Token is required'}, status=status.HTTP_400_BAD_REQUEST)
