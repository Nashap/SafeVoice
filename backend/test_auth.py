import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.test.client import Client
import json

c = Client()

# 1. Test Registration
print('Testing Registration...')
reg_resp = c.post('/api/auth/register/', {'username': 'testuser', 'email': 'test@example.com', 'password': 'testpassword123'}, content_type='application/json')
print(f'Registration Response: {reg_resp.status_code}')
assert reg_resp.status_code == 201

# 2. Test Duplicate Registration
print('Testing Duplicate Registration...')
dup_resp = c.post('/api/auth/register/', {'username': 'testuser', 'email': 'test2@example.com', 'password': 'testpassword123'}, content_type='application/json')
print(f'Duplicate Reg Response: {dup_resp.status_code}')
assert dup_resp.status_code == 400

# 3. Test Login
print('Testing Login...')
login_resp = c.post('/api/auth/login/', {'username': 'testuser', 'password': 'testpassword123'}, content_type='application/json')
print(f'Login Response: {login_resp.status_code}')
assert login_resp.status_code == 200
tokens = login_resp.json()
access_token = tokens['access']

# 4. Test Unauthenticated Access
print('Testing Unauthenticated Access to /api/contacts/...')
unauth_resp = c.get('/api/contacts/')
print(f'Unauth Access Response: {unauth_resp.status_code}')
assert unauth_resp.status_code == 401

# 5. Test Authenticated Access and Data Isolation
print('Testing Authenticated Access...')
auth_resp = c.get('/api/contacts/', HTTP_AUTHORIZATION=f'Bearer {access_token}')
print(f'Auth Access Response: {auth_resp.status_code}')
assert auth_resp.status_code == 200

# 6. Test Data Isolation (Create and List)
print('Testing Contact Creation...')
create_resp = c.post('/api/contacts/', {'name': 'Test Contact', 'phone': '1234567890'}, content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {access_token}')
print(f'Create Contact Response: {create_resp.status_code}')
assert create_resp.status_code == 201

list_resp = c.get('/api/contacts/', HTTP_AUTHORIZATION=f'Bearer {access_token}')
print(f'List Contacts count: {len(list_resp.json())}')
assert len(list_resp.json()) == 1

print('All tests passed successfully!')

from api.models import User
User.objects.filter(username='testuser').delete()
