# SafeVoice Backend

## Setup
1. Create a virtual environment: `python -m venv venv`
2. Activate it: `.\venv\Scripts\activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and fill in your Supabase DB string in `DATABASE_URL`.
5. Run migrations: `python manage.py migrate`
6. Start server: `python manage.py runserver`
