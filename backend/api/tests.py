import os
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.core.files.uploadedfile import SimpleUploadedFile
from .models import User, EmergencyHistory, DeviceToken, EmergencyContact, NotificationAttempt
from unittest.mock import patch, MagicMock

class SOSAlertTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # User 1 is the sender
        self.user1 = User.objects.create_user(username='testuser1', password='password123', phone_number='+1111111111')
        DeviceToken.objects.create(user=self.user1, token='sender-token-should-be-ignored')
        
        # User 2 is a registered user with a device token
        self.user2 = User.objects.create_user(username='testuser2', password='password123', phone_number='+2222222222')
        DeviceToken.objects.create(user=self.user2, token='user2-valid-token')
        
        # User 3 is a registered user but has NO device token
        self.user3 = User.objects.create_user(username='testuser3', password='password123', phone_number='+3333333333')

        # User 4 is a completely unrelated user
        self.user4 = User.objects.create_user(username='otheruser', password='password123', phone_number='+4444444444')
        self.contact_other = EmergencyContact.objects.create(user=self.user4, name='Other Contact', phone='+5555555555')
        
        # Contacts for User 1
        self.contact_match_device = EmergencyContact.objects.create(user=self.user1, name='Has Device', phone='+2222222222') # matches user2
        self.contact_match_no_device = EmergencyContact.objects.create(user=self.user1, name='No Device', phone='+3333333333') # matches user3
        self.contact_no_match = EmergencyContact.objects.create(user=self.user1, name='No Match', phone='+9999999999') # matches nobody
        self.contact_inactive = EmergencyContact.objects.create(user=self.user1, name='Inactive Contact', phone='+2222222222', is_active=False)
        
        self.history_url = reverse('history-list')
        self.contacts_url = reverse('contact-list')
        self.client.force_authenticate(user=self.user1)
        self.data = {'trigger_type': 'keyword', 'score': 85, 'idempotency_key': 'test-key'}

    @patch('api.utils.messaging.send_each_for_multicast')
    @patch('api.views.send_emergency_sms', return_value=(True, "Simulated"))
    def test_sos_fcm_and_sms_logic(self, mock_sms, mock_multicast):
        mock_response = MagicMock()
        mock_response.success_count = 1
        mock_response.failure_count = 0
        mock_response.responses = [MagicMock(success=True)]
        mock_multicast.return_value = mock_response

        response = self.client.post(self.history_url, self.data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        history = EmergencyHistory.objects.first()
        self.assertEqual(history.user, self.user1)
        
        # Contact 1: Has Device -> SMS(simulated) and FCM(provider_accepted)
        attempts1 = NotificationAttempt.objects.filter(emergency=history, contact=self.contact_match_device)
        self.assertEqual(attempts1.filter(channel='sms', status='simulated').count(), 1)
        self.assertEqual(attempts1.filter(channel='fcm', status='provider_accepted').count(), 1)
        
        # Contact 2: No Device -> SMS(simulated) and FCM(skipped: No devices registered)
        attempts2 = NotificationAttempt.objects.filter(emergency=history, contact=self.contact_match_no_device)
        self.assertEqual(attempts2.filter(channel='sms', status='simulated').count(), 1)
        self.assertEqual(attempts2.filter(channel='fcm', status='skipped').count(), 1)
        self.assertIn("No devices registered", attempts2.filter(channel='fcm').first().error_details)
        
        # Contact 3: No Match -> SMS(simulated) and FCM(skipped: Contact is not registered)
        attempts3 = NotificationAttempt.objects.filter(emergency=history, contact=self.contact_no_match)
        self.assertEqual(attempts3.filter(channel='sms', status='simulated').count(), 1)
        self.assertEqual(attempts3.filter(channel='fcm', status='skipped').count(), 1)
        self.assertIn("not registered on SafeVoice", attempts3.filter(channel='fcm').first().error_details)

        # Inactive Contact & Other User Contact -> 0 attempts
        self.assertEqual(NotificationAttempt.objects.filter(emergency=history, contact=self.contact_inactive).count(), 0)
        self.assertEqual(NotificationAttempt.objects.filter(emergency=history, contact=self.contact_other).count(), 0)
        
        # Sender token excluded from multicast
        self.assertEqual(mock_multicast.call_count, 1)
        multicast_message = mock_multicast.call_args[0][0]
        self.assertEqual(multicast_message.tokens, ['user2-valid-token'])

    @patch('api.utils.messaging.send_each_for_multicast')
    @patch('api.views.send_emergency_sms', return_value=(True, "Simulated"))
    def test_duplicate_submission(self, mock_sms, mock_multicast):
        mock_response = MagicMock()
        mock_response.success_count = 1
        mock_multicast.return_value = mock_response
        
        resp1 = self.client.post(self.history_url, self.data)
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        
        resp2 = self.client.post(self.history_url, self.data)
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertEqual(resp2.data['message'], "Duplicate SOS ignored.")
        
        self.assertEqual(EmergencyHistory.objects.filter(user=self.user1).count(), 1)
        self.assertEqual(mock_sms.call_count, 3)
        self.assertEqual(mock_multicast.call_count, 1)

    def test_emergency_contact_fcm_status_serialization(self):
        resp = self.client.get(self.contacts_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        contacts_data = {c['name']: c for c in resp.data}
        
        self.assertEqual(contacts_data['Has Device']['fcm_status'], 'ready')
        self.assertTrue(contacts_data['Has Device']['has_registered_account'])
        self.assertTrue(contacts_data['Has Device']['has_fcm_token'])

        self.assertEqual(contacts_data['No Device']['fcm_status'], 'no_device')
        self.assertTrue(contacts_data['No Device']['has_registered_account'])
        self.assertFalse(contacts_data['No Device']['has_fcm_token'])

        self.assertEqual(contacts_data['No Match']['fcm_status'], 'unregistered')
        self.assertFalse(contacts_data['No Match']['has_registered_account'])
        self.assertFalse(contacts_data['No Match']['has_fcm_token'])

    def test_user_me_endpoint_and_phone_update(self):
        me_url = reverse('user-me')
        resp = self.client.get(me_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['username'], 'testuser1')

        # Update phone number
        patch_resp = self.client.patch(me_url, {'phone_number': '9998887776'})
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_resp.data['phone_number'], '9998887776')
        self.user1.refresh_from_db()
        self.assertEqual(self.user1.phone_number, '9998887776')

    def test_device_token_registration_and_unregister(self):
        device_url = reverse('device-list')
        # Register new token
        resp = self.client.post(device_url, {'token': 'new-user-test-token'})
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertTrue(DeviceToken.objects.filter(token='new-user-test-token', user=self.user1).exists())

        # Unregister via action
        unreg_url = reverse('device-unregister')
        unreg_resp = self.client.post(unreg_url, {'token': 'new-user-test-token'})
        self.assertEqual(unreg_resp.status_code, status.HTTP_200_OK)
        self.assertFalse(DeviceToken.objects.filter(token='new-user-test-token').exists())

    @patch('api.supabase_storage.requests.post')
    def test_audio_upload_and_status(self, mock_post):
        mock_post.return_value = MagicMock(status_code=201)
        history = EmergencyHistory.objects.create(
            user=self.user1,
            trigger_type='keyword',
            score=90
        )
        audio_url = reverse('history-audio', kwargs={'pk': history.pk})
        
        # 1. Non-owner cannot upload audio (Account Isolation: 403 or 404)
        other_client = APIClient()
        other_client.force_authenticate(user=self.user4)
        dummy_wav = SimpleUploadedFile("evidence.wav", b"RIFF....WAVEfmt ....data....", content_type="audio/wav")
        resp_forbidden = other_client.post(audio_url, {'audio': dummy_wav, 'duration': 15.0}, format='multipart')
        self.assertIn(resp_forbidden.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # 2. Owner uploads valid audio
        self.client.force_authenticate(user=self.user1)
        dummy_wav.seek(0)
        resp_upload = self.client.post(audio_url, {'audio': dummy_wav, 'duration': 15.0}, format='multipart')
        self.assertEqual(resp_upload.status_code, status.HTTP_200_OK)
        self.assertIn(resp_upload.data['status'], ['uploaded', 'uploaded_local'])
        
        history.refresh_from_db()
        self.assertIn(history.audio_status, ['uploaded', 'uploaded_local'])
        self.assertTrue(len(history.audio_path) > 0)
        self.assertEqual(history.audio_duration, 15.0)

    @patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', 'test-supabase-key')
    @patch('api.supabase_storage.requests.post')
    def test_signed_audio_url_access_control(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {'signedURL': '/object/sign/emergency-audio/1/1/sample.wav?token=mocktoken123'}
        mock_post.return_value = mock_resp

        history = EmergencyHistory.objects.create(
            user=self.user1,
            trigger_type='keyword',
            score=95,
            audio_status='uploaded',
            audio_bucket='emergency-audio',
            audio_path=f"{self.user1.id}/1/sample.wav",
            audio_duration=15.0
        )
        url_endpoint = reverse('history-audio-url', kwargs={'pk': history.pk})

        # 1. Owner can get signed audio url
        self.client.force_authenticate(user=self.user1)
        resp_owner = self.client.get(url_endpoint)
        self.assertEqual(resp_owner.status_code, status.HTTP_200_OK)
        self.assertIn('signed_url', resp_owner.data)
        self.assertIn('mocktoken123', resp_owner.data['signed_url'])
        self.assertEqual(resp_owner.data['duration'], 15.0)
        self.assertEqual(resp_owner.data['storage'], 'supabase')

        # 2. Active emergency contact (user2) can get signed audio url
        contact_client = APIClient()
        contact_client.force_authenticate(user=self.user2)
        resp_contact = contact_client.get(url_endpoint)
        self.assertEqual(resp_contact.status_code, status.HTTP_200_OK)
        self.assertIn('signed_url', resp_contact.data)

        # 3. Unrelated user (user4) gets 403 Forbidden or 404 Not Found
        other_client = APIClient()
        other_client.force_authenticate(user=self.user4)
        resp_unauthorized = other_client.get(url_endpoint)
        self.assertIn(resp_unauthorized.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_location_and_maps_url_generation(self):
        payload = {
            'trigger_type': 'keyword',
            'score': 80,
            'location_lat': 12.9716,
            'location_lng': 77.5946,
            'resolved_address': 'MG Road, Indiranagar, Bengaluru, Karnataka',
            'location_accuracy': 5.2,
            'idempotency_key': 'test-loc-key'
        }
        resp = self.client.post(self.history_url, payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        
        history = EmergencyHistory.objects.get(idempotency_key='test-loc-key')
        self.assertEqual(history.resolved_address, 'MG Road, Indiranagar, Bengaluru, Karnataka')
        self.assertIn('maps/search/?api=1&query=12.9716,77.5946', history.google_maps_url)
        self.assertEqual(history.location_accuracy, 5.2)

        # Recipient contact can fetch the emergency details
        contact_client = APIClient()
        contact_client.force_authenticate(user=self.user2)
        detail_url = reverse('history-detail', kwargs={'pk': history.pk})
        detail_resp = contact_client.get(detail_url)
        self.assertEqual(detail_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_resp.data['resolved_address'], 'MG Road, Indiranagar, Bengaluru, Karnataka')

    def test_local_stream_authorization_and_account_isolation(self):
        history = EmergencyHistory.objects.create(
            user=self.user1,
            trigger_type='keyword',
            score=90,
            audio_status='uploaded_local',
            audio_path=''
        )
        history.audio_path = f"{self.user1.id}/{history.id}/test_clip.wav"
        history.save()

        from django.conf import settings
        import os
        media_root = getattr(settings, 'MEDIA_ROOT', os.path.join(settings.BASE_DIR, 'media'))
        clip_dir = os.path.join(media_root, 'emergency-audio', str(self.user1.id), str(history.id))
        os.makedirs(clip_dir, exist_ok=True)
        clip_path = os.path.join(clip_dir, 'test_clip.wav')
        with open(clip_path, 'wb') as f:
            f.write(b'RIFF44WAVEfmt test audio data')

        stream_url = reverse('history-stream-local') + f"?path={self.user1.id}/{history.id}/test_clip.wav"

        # 1. Owner can stream
        self.client.force_authenticate(user=self.user1)
        resp_owner = self.client.get(stream_url)
        self.assertEqual(resp_owner.status_code, status.HTTP_200_OK)

        # 2. Active contact can stream
        contact_client = APIClient()
        contact_client.force_authenticate(user=self.user2)
        resp_contact = contact_client.get(stream_url)
        self.assertEqual(resp_contact.status_code, status.HTTP_200_OK)

        # 3. Unrelated user gets 403 Forbidden
        other_client = APIClient()
        other_client.force_authenticate(user=self.user4)
        resp_other = other_client.get(stream_url)
        self.assertEqual(resp_other.status_code, status.HTTP_403_FORBIDDEN)

    @patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', 'test-supabase-key')
    @patch('api.supabase_storage.requests.post')
    def test_supabase_upload_mock_success_and_failure(self, mock_post):
        history = EmergencyHistory.objects.create(
            user=self.user1,
            trigger_type='voice',
            score=95
        )
        audio_url = reverse('history-audio', kwargs={'pk': history.pk})
        self.client.force_authenticate(user=self.user1)

        # A) Mock successful Supabase upload (status 201)
        mock_resp_success = MagicMock()
        mock_resp_success.status_code = 201
        mock_post.return_value = mock_resp_success

        dummy_wav = SimpleUploadedFile("clip.wav", b"RIFF....WAVEfmt ....data....", content_type="audio/wav")
        resp = self.client.post(audio_url, {'audio': dummy_wav, 'duration': 15.0}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['status'], 'uploaded')
        self.assertEqual(resp.data['storage'], 'supabase')
        self.assertEqual(resp.data['audio_bucket'], 'emergency-audio')

        # B) Mock failed Supabase upload (status 500) - must NEVER fall back or report success
        mock_resp_fail = MagicMock()
        mock_resp_fail.status_code = 500
        mock_resp_fail.text = 'Internal Server Error on Supabase'
        mock_post.return_value = mock_resp_fail

        dummy_wav.seek(0)
        resp_fail = self.client.post(audio_url, {'audio': dummy_wav, 'duration': 15.0}, format='multipart')
        self.assertEqual(resp_fail.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(resp_fail.data['status'], 'failed')
        self.assertEqual(resp_fail.data['storage'], 'supabase')
