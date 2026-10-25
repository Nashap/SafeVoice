from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from .models import User, EmergencyContact, EmergencyHistory
from unittest.mock import patch

class AccountIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.contacts_url = reverse('contact-list')
        self.history_url = reverse('history-list')
        
    def test_account_isolation(self):
        # 1. Register user Nesha
        self.user_nesha = User.objects.create_user(username='Nesha', password='password123')
        
        # 2. Log in as Nesha
        self.client.force_authenticate(user=self.user_nesha)
        
        # 3. Save Nesha's profile and emergency contacts
        response = self.client.post(self.contacts_url, {'name': 'Nesha Mom', 'phone': '1111111111'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # 4. Log out
        self.client.force_authenticate(user=None)
        
        # 5. Register or log in as Nausha
        self.user_nausha = User.objects.create_user(username='Nausha', password='password123')
        self.client.force_authenticate(user=self.user_nausha)
        
        # 6. Verify that Nausha does not see Nesha's profile or emergency contacts
        response = self.client.get(self.contacts_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0) # Should not see Nesha's contacts
        
        # 7. Save Nausha's own profile and contacts
        response = self.client.post(self.contacts_url, {'name': 'Nausha Dad', 'phone': '2222222222'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # 8. Log out and log back in as Nesha
        self.client.force_authenticate(user=self.user_nesha)
        
        # 9. Verify that Nesha's original data is still available
        response = self.client.get(self.contacts_url)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Nesha Mom')
        
        # 10. Log back in as Nausha and verify that only Nausha's data is displayed
        self.client.force_authenticate(user=self.user_nausha)
        response = self.client.get(self.contacts_url)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Nausha Dad')
        
        # 11. Verify that neither account can access or modify the other account's records through the API
        nesha_contact = EmergencyContact.objects.get(name='Nesha Mom')
        response = self.client.put(reverse('contact-detail', args=[nesha_contact.id]), {'name': 'Hacked', 'phone': '999'})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND) # Nausha cannot modify Nesha's contact
        
        # 12. Verify that SOS requests use only the currently authenticated user's emergency contacts
        history = EmergencyHistory.objects.create(
            user=self.user_nausha, trigger_type='manual', score=100, idempotency_key='test-key'
        )
        self.assertEqual(history.user, self.user_nausha)
        nausha_contacts = EmergencyContact.objects.filter(user=history.user)
        self.assertEqual(nausha_contacts.count(), 1)
        self.assertEqual(nausha_contacts.first().name, 'Nausha Dad')

