from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
from django.db.models import Q

UserModel = get_user_model()

class EmailOrUsernameModelBackend(ModelBackend):
    """
    Custom authentication backend that permits authentication using:
    - Username (case-insensitive)
    - Email address (case-insensitive)
    - Phone number (last 10 digits)
    
    Preserves strict password hashing verification and is_active checks.
    """
    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None:
            username = kwargs.get(UserModel.USERNAME_FIELD)
        if not username or not password:
            return None

        identifier = str(username).strip()
        lookup = Q(username__iexact=identifier) | Q(email__iexact=identifier)
        digits = "".join(filter(str.isdigit, identifier))
        if len(digits) >= 10:
            lookup |= Q(phone_number__endswith=digits[-10:])

        users = UserModel.objects.filter(lookup)
        for user in users:
            if user.check_password(password):
                if self.user_can_authenticate(user):
                    return user
        return None
