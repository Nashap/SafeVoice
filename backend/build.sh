#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "==> [SafeVoice Build] Installing Python dependencies..."
pip install -r requirements.txt

echo "==> [SafeVoice Build] Collecting static files with WhiteNoise..."
python manage.py collectstatic --no-input

echo "==> [SafeVoice Build] Running database migrations..."
python manage.py migrate --no-input

echo "==> [SafeVoice Build] Build completed successfully!"
