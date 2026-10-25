import os
import re
import uuid
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Dynamic module-level attribute resolution:
# Reads securely from Django settings (loaded via django-environ from backend/.env)
# while supporting unittest.mock.patch in tests.

def _sanitize_error(text: str, secret_key: str = "") -> str:
    """
    Redacts sensitive credentials, secrets, and authorization headers from error messages.
    Ensures secret keys, bearer tokens, and apikey headers are never exposed in logs or return strings.
    """
    if not text:
        return ""
    cleaned = str(text)
    if secret_key:
        cleaned = cleaned.replace(secret_key, "[REDACTED]")
    # Redact legacy Bearer tokens
    cleaned = re.sub(r'Bearer\s+[A-Za-z0-9\-_\.]+', 'Bearer [REDACTED]', cleaned, flags=re.IGNORECASE)
    # Redact Supabase secret or publishable keys
    cleaned = re.sub(r'sb_(?:secret|publishable)_[A-Za-z0-9\-_]+', '[REDACTED_KEY]', cleaned)
    # Redact apikey header values if echoed back
    cleaned = re.sub(r'(apikey["\']?\s*[:=]\s*["\']?)[A-Za-z0-9\-_\.]+(["\']?)', r'\1[REDACTED]\2', cleaned, flags=re.IGNORECASE)
    return cleaned


def get_supabase_config():
    """
    Securely resolves Supabase configuration.
    Priority order:
    1. Module-level variables if explicitly patched/set (supports unittest.mock.patch)
    2. django.conf.settings (loaded securely via django-environ from backend/.env)
    3. os.environ fallback
    Never logs or exposes the service role key.
    Returns: (supabase_url, service_role_key, bucket_name)
    """
    import sys
    mod = sys.modules.get(__name__)
    mod_dict = mod.__dict__ if mod else {}

    # 1. Service Role Key
    if 'SUPABASE_SERVICE_ROLE_KEY' in mod_dict:
        key = mod_dict['SUPABASE_SERVICE_ROLE_KEY']
    else:
        key = getattr(settings, 'SUPABASE_SERVICE_ROLE_KEY', None)
        if key is None:
            key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

    # 2. Project URL
    if 'SUPABASE_URL' in mod_dict:
        url = mod_dict['SUPABASE_URL']
    else:
        url = getattr(settings, 'SUPABASE_URL', None)
        if url is None:
            url = os.environ.get('SUPABASE_URL', '')

    # 3. Storage Bucket
    if 'STORAGE_BUCKET' in mod_dict:
        bucket = mod_dict['STORAGE_BUCKET']
    else:
        bucket = getattr(settings, 'SUPABASE_STORAGE_BUCKET', None)
        if bucket is None:
            bucket = os.environ.get('SUPABASE_STORAGE_BUCKET', 'emergency-audio')

    return str(url or '').rstrip('/'), str(key or '').strip(), str(bucket or 'emergency-audio').strip()


def __getattr__(name):
    """Dynamically resolve module-level attributes from django settings or os.environ."""
    if name == 'SUPABASE_SERVICE_ROLE_KEY':
        val = getattr(settings, 'SUPABASE_SERVICE_ROLE_KEY', None)
        return str(val if val is not None else os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')).strip()
    if name == 'SUPABASE_URL':
        val = getattr(settings, 'SUPABASE_URL', None)
        return str(val if val is not None else os.environ.get('SUPABASE_URL', '')).rstrip('/')
    if name == 'STORAGE_BUCKET':
        val = getattr(settings, 'SUPABASE_STORAGE_BUCKET', None)
        return str(val if val is not None else os.environ.get('SUPABASE_STORAGE_BUCKET', 'emergency-audio')).strip()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


def upload_emergency_audio(user_id, emergency_id, audio_bytes, filename=None, allow_fallback=True):
    """
    Uploads audio clip to private Supabase Storage bucket:
    path: emergency-audio/{user_id}/{emergency_id}/{recording_id}.wav
    Returns: (success: bool, object_path: str, error: str, storage_type: str)
    storage_type is either 'supabase' or 'local_fallback'.
    Never confuses local fallback with Supabase upload.
    """
    rec_id = uuid.uuid4().hex
    object_path = f"{user_id}/{emergency_id}/{rec_id}.wav"
    supabase_url, service_key, bucket = get_supabase_config()

    # 1. If service role key and URL are configured, use Supabase Storage REST API
    if service_key and supabase_url:
        try:
            endpoint = f"{supabase_url}/storage/v1/object/{bucket}/{object_path}"
            headers = {
                "apikey": service_key,
                "Content-Type": "audio/wav",
                "x-upsert": "false"
            }
            resp = requests.post(endpoint, headers=headers, data=audio_bytes, timeout=15)
            if resp.status_code in (200, 201):
                logger.info(
                    "[Supabase Storage] Successfully uploaded emergency audio for emergency %s to bucket '%s': %s",
                    emergency_id, bucket, object_path
                )
                return True, object_path, "", "supabase"
            else:
                raw_err = resp.text[:300] if resp.text else f"HTTP {resp.status_code}"
                clean_err = _sanitize_error(raw_err, service_key)
                err = f"Supabase upload error {resp.status_code}: {clean_err}"
                logger.error(
                    "[Supabase Storage] Failed to upload audio for emergency %s (HTTP %s): %s",
                    emergency_id, resp.status_code, clean_err
                )
                return False, "", err, "supabase"
        except requests.exceptions.RequestException as e:
            err = f"Supabase request exception: {type(e).__name__} - {str(e)}"
            err = _sanitize_error(err, service_key)
            logger.error("[Supabase Storage] Network error uploading audio for emergency %s: %s", emergency_id, err)
            return False, "", err, "supabase"
        except Exception as e:
            err = f"Supabase upload exception: {type(e).__name__} - {str(e)}"
            err = _sanitize_error(err, service_key)
            logger.error("[Supabase Storage] Unexpected error uploading audio for emergency %s: %s", emergency_id, err)
            return False, "", err, "supabase"

    # Diagnostic logging when Supabase credentials are not configured
    missing_configs = []
    if not service_key:
        missing_configs.append("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url:
        missing_configs.append("SUPABASE_URL")
    missing_str = " and ".join(missing_configs) if missing_configs else "credentials"

    logger.warning(
        "[Supabase Storage Diagnostic] %s is not configured in backend environment (.env). "
        "Supabase cloud upload skipped for emergency %s. Falling back to local storage.",
        missing_str, emergency_id
    )

    # 2. Local fallback storage (used when Supabase credentials are not configured)
    if not allow_fallback:
        diag_err = f"Supabase {missing_str} is not configured in environment and local fallback is disallowed."
        logger.error("[Supabase Storage Diagnostic] %s", diag_err)
        return False, "", diag_err, "none"

    try:
        media_root = getattr(settings, 'MEDIA_ROOT', os.path.join(settings.BASE_DIR, 'media'))
        target_dir = os.path.join(media_root, bucket, str(user_id), str(emergency_id))
        os.makedirs(target_dir, exist_ok=True)
        local_file_path = os.path.join(target_dir, f"{rec_id}.wav")
        with open(local_file_path, 'wb') as f:
            f.write(audio_bytes)
        logger.info(
            "[Supabase Storage] Emergency audio stored in local fallback storage: %s",
            local_file_path
        )
        return True, object_path, "", "local_fallback"
    except Exception as e:
        err = f"Fallback storage failed: {type(e).__name__} - {str(e)}"
        logger.error("[Supabase Storage] Fallback storage failed for emergency %s: %s", emergency_id, err)
        return False, "", err, "local_fallback"


def create_signed_audio_url(object_path, expires_in=300, storage_type="supabase"):
    """
    Generates a short-lived signed URL (default 300 seconds) for private bucket playback,
    or a local streaming endpoint if storage_type is 'local_fallback'.
    Returns: (success: bool, signed_url: str, error: str)
    """
    if not object_path:
        return False, "", "No audio object path associated with emergency"

    # Defend against path manipulation/traversal
    normalized_path = os.path.normpath(str(object_path)).replace('\\', '/')
    if normalized_path.startswith('../') or normalized_path.startswith('/..') or '/../' in normalized_path or normalized_path == '..':
        return False, "", "Invalid audio object path"

    supabase_url, service_key, bucket = get_supabase_config()

    if storage_type == "supabase" or (storage_type == "auto" and service_key and supabase_url):
        if not service_key or not supabase_url:
            missing = "SUPABASE_SERVICE_ROLE_KEY" if not service_key else "SUPABASE_URL"
            diag_err = f"{missing} is not configured in backend environment (.env) to generate signed URL"
            logger.warning("[Supabase Storage Diagnostic] %s (object_path=%s)", diag_err, object_path)
            return False, "", diag_err
        try:
            endpoint = f"{supabase_url}/storage/v1/object/sign/{bucket}/{object_path}"
            headers = {
                "apikey": service_key,
                "Content-Type": "application/json"
            }
            payload = {"expiresIn": int(expires_in)}
            resp = requests.post(endpoint, headers=headers, json=payload, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                signed_rel = data.get('signedURL') or data.get('signedUrl', '')
                if signed_rel:
                    if signed_rel.startswith('http://') or signed_rel.startswith('https://'):
                        full_url = signed_rel
                    elif signed_rel.startswith('/storage/v1'):
                        full_url = f"{supabase_url}{signed_rel}"
                    elif signed_rel.startswith('/'):
                        full_url = f"{supabase_url}/storage/v1{signed_rel}"
                    else:
                        full_url = f"{supabase_url}/storage/v1/{signed_rel}"
                    return True, full_url, ""
            raw_err = resp.text[:300] if resp.text else f"HTTP {resp.status_code}"
            clean_err = _sanitize_error(raw_err, service_key)
            err = f"Failed to sign Supabase URL ({resp.status_code}): {clean_err}"
            logger.error("[Supabase Storage] %s for object %s", err, object_path)
            return False, "", err
        except requests.exceptions.RequestException as e:
            err = f"Supabase sign request exception: {type(e).__name__} - {str(e)}"
            err = _sanitize_error(err, service_key)
            logger.error("[Supabase Storage] %s for object %s", err, object_path)
            return False, "", err
        except Exception as e:
            err = f"Supabase sign exception: {type(e).__name__} - {str(e)}"
            err = _sanitize_error(err, service_key)
            logger.error("[Supabase Storage] %s for object %s", err, object_path)
            return False, "", err

    # Local fallback URL
    return True, f"/api/history/stream_local/?path={object_path}", ""
