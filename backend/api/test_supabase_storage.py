import os
import shutil
import tempfile
from unittest.mock import patch, MagicMock
from django.test import SimpleTestCase, override_settings
from django.conf import settings
import requests

from api.supabase_storage import (
    get_supabase_config,
    upload_emergency_audio,
    create_signed_audio_url,
    STORAGE_BUCKET,
    _sanitize_error,
)


class SupabaseStorageConfigurationAndMockTests(SimpleTestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.dummy_audio = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
        self.user_id = 42
        self.emergency_id = 101
        self.test_secret_key = "sb_secret_testdummykey1234567890abcdef"
        self.test_supabase_url = "https://testproject.supabase.co"

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_supabase_config_reads_settings_and_defaults(self):
        """Ensure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and bucket are read from settings."""
        with override_settings(
            SUPABASE_URL=self.test_supabase_url,
            SUPABASE_SERVICE_ROLE_KEY=self.test_secret_key,
            SUPABASE_STORAGE_BUCKET='emergency-audio'
        ):
            with patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', self.test_secret_key), \
                 patch('api.supabase_storage.SUPABASE_URL', self.test_supabase_url):
                url, key, bucket = get_supabase_config()
                self.assertEqual(url, self.test_supabase_url)
                self.assertEqual(key, self.test_secret_key)
                self.assertEqual(bucket, 'emergency-audio')

    def test_missing_key_logs_diagnostic_and_uses_local_fallback(self):
        """When SUPABASE_SERVICE_ROLE_KEY is missing/empty, log a diagnostic message and fall back to local disk storage."""
        with override_settings(MEDIA_ROOT=self.test_dir, SUPABASE_SERVICE_ROLE_KEY=''):
            with patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', ''):
                with patch('api.supabase_storage.requests.post') as mock_post:
                    with self.assertLogs('api.supabase_storage', level='WARNING') as cm:
                        success, object_path, err, storage_type = upload_emergency_audio(
                            user_id=self.user_id,
                            emergency_id=self.emergency_id,
                            audio_bytes=self.dummy_audio,
                            allow_fallback=True
                        )

                    # 1. Cloud request was NOT attempted
                    mock_post.assert_not_called()

                    # 2. Diagnostic message logged
                    self.assertTrue(any("SUPABASE_SERVICE_ROLE_KEY is not configured" in log for log in cm.output))
                    self.assertTrue(any("Falling back to local storage" in log for log in cm.output))

                    # 3. Local fallback storage behavior
                    self.assertTrue(success)
                    self.assertEqual(storage_type, 'local_fallback')
                    self.assertEqual(err, "")
                    self.assertTrue(object_path.startswith(f"{self.user_id}/{self.emergency_id}/"))

                    # 4. Verify file was written to disk in media_root
                    expected_file = os.path.join(self.test_dir, STORAGE_BUCKET, object_path)
                    self.assertTrue(os.path.exists(expected_file))
                    with open(expected_file, 'rb') as f:
                        self.assertEqual(f.read(), self.dummy_audio)

    def test_missing_key_with_fallback_disallowed(self):
        """When key is missing and allow_fallback=False, return clean diagnostic error without raising."""
        with override_settings(SUPABASE_SERVICE_ROLE_KEY=''):
            with patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', ''):
                with self.assertLogs('api.supabase_storage', level='WARNING'):
                    success, object_path, err, storage_type = upload_emergency_audio(
                        user_id=self.user_id,
                        emergency_id=self.emergency_id,
                        audio_bytes=self.dummy_audio,
                        allow_fallback=False
                    )
                self.assertFalse(success)
                self.assertEqual(storage_type, 'none')
                self.assertIn("disallowed", err)

    def test_missing_url_diagnostic(self):
        """When SUPABASE_URL is missing, log diagnostic and fall back to local storage."""
        with override_settings(MEDIA_ROOT=self.test_dir, SUPABASE_URL=''):
            with patch('api.supabase_storage.SUPABASE_URL', ''):
                with patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', self.test_secret_key):
                    with self.assertLogs('api.supabase_storage', level='WARNING') as cm:
                        success, object_path, err, storage_type = upload_emergency_audio(
                            user_id=self.user_id,
                            emergency_id=self.emergency_id,
                            audio_bytes=self.dummy_audio,
                            allow_fallback=True
                        )
                    self.assertTrue(success)
                    self.assertEqual(storage_type, 'local_fallback')
                    self.assertTrue(any("SUPABASE_URL is not configured" in log for log in cm.output))

    @patch('api.supabase_storage.SUPABASE_URL', 'https://testproject.supabase.co')
    @patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_testdummykey1234567890abcdef')
    @patch('api.supabase_storage.requests.post')
    def test_mocked_supabase_upload_success_with_apikey_header(self, mock_post):
        """Mocked upload success uses apikey header (not Bearer token) and HTTP 200/201 without local fallback."""
        for status_code in (200, 201):
            mock_resp = MagicMock()
            mock_resp.status_code = status_code
            mock_post.return_value = mock_resp

            success, object_path, err, storage_type = upload_emergency_audio(
                user_id=self.user_id,
                emergency_id=self.emergency_id,
                audio_bytes=self.dummy_audio,
                allow_fallback=True
            )

            self.assertTrue(success)
            self.assertEqual(storage_type, 'supabase')
            self.assertEqual(err, '')
            self.assertTrue(object_path.startswith(f"{self.user_id}/{self.emergency_id}/"))

            # Verify endpoint, HTTP method, and headers
            args, kwargs = mock_post.call_args
            self.assertIn(f"/storage/v1/object/emergency-audio/{object_path}", args[0])
            self.assertEqual(kwargs['headers']['apikey'], 'sb_secret_testdummykey1234567890abcdef')
            self.assertEqual(kwargs['headers']['Content-Type'], 'audio/wav')
            self.assertEqual(kwargs['headers']['x-upsert'], 'false')
            # Critical: Must NOT treat secret key as a JWT Bearer token
            self.assertNotIn('Authorization', kwargs['headers'])
            self.assertEqual(kwargs['data'], self.dummy_audio)

    @patch('api.supabase_storage.SUPABASE_URL', 'https://testproject.supabase.co')
    @patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_testdummykey1234567890abcdef')
    @patch('api.supabase_storage.requests.post')
    def test_mocked_supabase_upload_failure_does_not_fallback(self, mock_post):
        """When Supabase returns an error (HTTP 403 or 500), it must fail cleanly and NEVER confuse with local fallback."""
        with override_settings(MEDIA_ROOT=self.test_dir):
            mock_resp = MagicMock()
            mock_resp.status_code = 403
            mock_resp.text = '{"statusCode":"403","error":"Unauthorized","message":"Invalid Compact JWS"}'
            mock_post.return_value = mock_resp

            with self.assertLogs('api.supabase_storage', level='ERROR') as cm:
                success, object_path, err, storage_type = upload_emergency_audio(
                    user_id=self.user_id,
                    emergency_id=self.emergency_id,
                    audio_bytes=self.dummy_audio,
                    allow_fallback=True
                )

            self.assertFalse(success)
            self.assertEqual(storage_type, 'supabase')
            self.assertEqual(object_path, '')
            self.assertIn('Supabase upload error 403', err)
            self.assertIn('Invalid Compact JWS', err)

            # Never log the key or expose it in error
            self.assertNotIn('sb_secret_testdummykey1234567890abcdef', err)
            for log_line in cm.output:
                self.assertNotIn('sb_secret_testdummykey1234567890abcdef', log_line)

            # Local fallback storage must NOT have any saved file
            self.assertFalse(os.path.exists(os.path.join(self.test_dir, STORAGE_BUCKET)))

    @patch('api.supabase_storage.SUPABASE_URL', 'https://testproject.supabase.co')
    @patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_testdummykey1234567890abcdef')
    @patch('api.supabase_storage.requests.post')
    def test_mocked_supabase_upload_network_exception(self, mock_post):
        """When network exception occurs, return clear diagnostic error and storage_type='supabase'."""
        mock_post.side_effect = requests.exceptions.ConnectTimeout("Connection to Supabase timed out after 15s")

        with self.assertLogs('api.supabase_storage', level='ERROR') as cm:
            success, object_path, err, storage_type = upload_emergency_audio(
                user_id=self.user_id,
                emergency_id=self.emergency_id,
                audio_bytes=self.dummy_audio,
                allow_fallback=True
            )

        self.assertFalse(success)
        self.assertEqual(storage_type, 'supabase')
        self.assertIn("ConnectTimeout", err)
        self.assertTrue(any("Network error" in log for log in cm.output))

    @patch('api.supabase_storage.SUPABASE_URL', 'https://testproject.supabase.co')
    @patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_testdummykey1234567890abcdef')
    @patch('api.supabase_storage.requests.post')
    def test_signed_audio_url_mocked_success_and_headers(self, mock_post):
        """Signed audio URL generation tests for success and verify apikey header."""
        object_path = f"{self.user_id}/{self.emergency_id}/sample.wav"

        mock_resp_ok = MagicMock()
        mock_resp_ok.status_code = 200
        mock_resp_ok.json.return_value = {'signedURL': f'/object/sign/emergency-audio/{object_path}?token=abc123token'}
        mock_post.return_value = mock_resp_ok

        success, signed_url, err = create_signed_audio_url(object_path, expires_in=300, storage_type='supabase')
        self.assertTrue(success)
        self.assertIn('/storage/v1/object/sign/emergency-audio/', signed_url)
        self.assertIn('token=abc123token', signed_url)
        self.assertEqual(err, '')

        # Verify headers used for signed URL creation
        args, kwargs = mock_post.call_args
        self.assertEqual(kwargs['headers']['apikey'], 'sb_secret_testdummykey1234567890abcdef')
        self.assertEqual(kwargs['headers']['Content-Type'], 'application/json')
        self.assertNotIn('Authorization', kwargs['headers'])
        self.assertEqual(kwargs['json'], {'expiresIn': 300})

    @patch('api.supabase_storage.SUPABASE_URL', 'https://testproject.supabase.co')
    @patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_testdummykey1234567890abcdef')
    @patch('api.supabase_storage.requests.post')
    def test_signed_audio_url_mocked_failure(self, mock_post):
        """Signed audio URL generation returns failure on HTTP 404 or 500."""
        object_path = f"{self.user_id}/{self.emergency_id}/sample.wav"

        mock_resp_fail = MagicMock()
        mock_resp_fail.status_code = 404
        mock_resp_fail.text = '{"error": "Object not found"}'
        mock_post.return_value = mock_resp_fail

        success, signed_url, err = create_signed_audio_url(object_path, expires_in=300, storage_type='supabase')
        self.assertFalse(success)
        self.assertIn('404', err)

    def test_signed_audio_url_path_traversal_defense(self):
        """Path manipulation attempts are blocked before making any network call."""
        malicious_paths = [
            "../../etc/passwd",
            "../secret.wav",
            "42/101/../../../sensitive.wav",
            "..",
        ]
        for path in malicious_paths:
            success, signed_url, err = create_signed_audio_url(path, storage_type='supabase')
            self.assertFalse(success)
            self.assertEqual(err, "Invalid audio object path")

    def test_signed_audio_url_missing_key_diagnostic(self):
        """When service role key is missing, create_signed_audio_url returns a clear diagnostic message."""
        with patch('api.supabase_storage.SUPABASE_SERVICE_ROLE_KEY', ''):
            with override_settings(SUPABASE_SERVICE_ROLE_KEY=''):
                with self.assertLogs('api.supabase_storage', level='WARNING') as cm:
                    success, signed_url, err = create_signed_audio_url(
                        f"{self.user_id}/{self.emergency_id}/clip.wav",
                        storage_type='supabase'
                    )
                self.assertFalse(success)
                self.assertIn("not configured in backend environment", err)
                self.assertTrue(any("SUPABASE_SERVICE_ROLE_KEY" in log for log in cm.output))

    def test_signed_audio_url_local_fallback(self):
        """When storage_type='local_fallback', returns streaming endpoint."""
        object_path = f"{self.user_id}/{self.emergency_id}/clip.wav"
        success, signed_url, err = create_signed_audio_url(object_path, storage_type='local_fallback')
        self.assertTrue(success)
        self.assertEqual(signed_url, f"/api/history/stream_local/?path={object_path}")
        self.assertEqual(err, "")

    def test_sanitize_error_redacts_credentials(self):
        """Verify _sanitize_error strips secret keys, publishable keys, Bearer tokens, and apikey headers."""
        raw_error = "Error with sb_secret_mysecretkey123456789 and Bearer eyJhbGciOiJIUzI1NiIsIn and apikey: sb_secret_anotherkey"
        sanitized = _sanitize_error(raw_error, secret_key="sb_secret_mysecretkey123456789")
        self.assertNotIn("sb_secret_mysecretkey123456789", sanitized)
        self.assertNotIn("eyJhbGciOiJIUzI1NiIsIn", sanitized)
        self.assertNotIn("sb_secret_anotherkey", sanitized)
        self.assertIn("[REDACTED", sanitized)
