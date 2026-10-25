# SafeVoice

SafeVoice is an emergency safety mobile application and backend service featuring offline voice-triggered emergency alerts, automated emergency SMS & push notifications, live location tracking, and secure audio evidence recording.

## Repository Architecture

```text
SafeVoice/
├── mobile/                  # React Native mobile application
│   ├── android/             # Native Android project (Vosk offline STT, audio services)
│   ├── ios/                 # iOS project configuration
│   ├── src/                 # Application components, screens, contexts, services
│   ├── App.tsx              # Main mobile entrypoint
│   └── package.json         # Node dependencies & mobile scripts
├── backend/                 # Django REST framework backend API
│   ├── api/                 # SafeVoice API, auth, contacts, SOS alerts, Supabase storage
│   ├── core/                # Django project settings and URLs
│   ├── manage.py            # Django CLI management script
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # Environment template with placeholders
├── .gitignore               # Root git ignore rules
└── README.md                # Project documentation
```

## Getting Started

### 1. Backend Service (Django)

#### Prerequisites
- Python 3.10+
- PostgreSQL or SQLite (for local testing)

#### Setup & Run
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials, JWT secret, and Supabase / Firebase keys
   ```
5. Apply database migrations:
   ```bash
   python manage.py migrate
   ```
6. Run the development server:
   ```bash
   python manage.py runserver
   ```

### 2. Mobile Application (React Native)

#### Prerequisites
- Node.js 18+
- JDK 17
- Android Studio with Android SDK / Emulator

#### Setup & Run
1. Navigate to the mobile directory:
   ```bash
   cd mobile
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Start the Metro bundler:
   ```bash
   npm start
   ```
4. In a separate terminal, launch the Android app:
   ```bash
   npm run android
   ```

## Security & Secrets
- Sensitive configuration files (`.env`, `db.sqlite3`, private service account keys) are explicitly excluded from Git tracking via `.gitignore`.
- Never commit real private keys or emergency audio recordings. Refer to `.env.example` in `backend/` for required environment variables.
