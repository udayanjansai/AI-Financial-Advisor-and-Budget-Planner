---
title: FinTracker AI
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
---

#  FinTracker AI

**FinTracker AI** is a premium, full-stack personal finance advisor and budget planner featuring a sleek modern glassmorphism aesthetic. It integrates intelligent AI spending personality analysis, robust multi-factor security, and automated/manual calendar email reporting.

---

##  Features

###  Enhanced Security & Authentication
* **OTP-Based User Registration**: Requires verification codes sent via email to complete account creation.
* **Toggable 2FA (Two-Factor Authentication)**: Users can enable or disable 2FA from their settings. When active, login requires a secure 6-digit OTP code.
* **Forgot/Reset Password Recovery**: Safe and self-serve credential recovery via email verification.

###  Smart Budgeting & Reports
* **Manual Email Reports**: Request calendar-month cash flow summaries instantly directly from your Dashboard header.
* **Brevo HTTP API Integration**: All transaction/OTP emails are dispatched reliably via the Brevo SMTP API, with a clean local HTML mock fallback for offline development.
* **Recurring Expense Tracker**: Automates trackable monthly expenses with custom schedules.

###  AI Personality Analysis
* **Gemini AI Spending Analyzer**: Examines budget thresholds and monthly spending patterns to render a custom AI analysis of your spending habits and financial personality.

###  Premium UI/UX
* **Glassmorphism Theme**: High-contrast modern dashboard layout built with responsive components.
* **Custom Confirm & Alert Popups**: Seamless, styled overlay modals replacing native browser alerts and confirmations for deleting goals, managing expenses, and system messages.

---

##  Environment Variables & Space Secrets

To utilize the full capabilities of FinTracker AI, configure the following secrets under **Settings > Variables and secrets** in Hugging Face (or inside a local `.env` file):

### Core AI & Database Configurations
* `GEMINI_API_KEY` *(Required)*: Your Google Gemini API Key for financial analysis.
* `SUPABASE_URL` *(Optional)*: Supabase API endpoint (if omitted, the system defaults to a local SQLite database).
* `SUPABASE_KEY` *(Optional)*: Supabase service key.

### Email Delivery Configurations (Brevo API)
* `BREVO_API_KEY` *(Optional)*: Your Brevo (formerly Sendinblue) SMTP API key for sending OTPs and reports.
* `BREVO_SENDER_EMAIL` *(Optional)*: The verified sender email address.
* `BREVO_SENDER_NAME` *(Optional)*: The display sender name (default: `"FinTracker AI"`).

### Google OAuth Configurations *(Optional)*
* `VITE_ENABLE_GOOGLE_AUTH=true`
* `FRONTEND_URL` *(e.g., http://localhost:3000)*
* `GOOGLE_CLIENT_ID`
* `GOOGLE_CLIENT_SECRET`
* `GOOGLE_REDIRECT_URI` *(e.g., http://localhost:8001/api/auth/google/callback)*

---

## 🛠️ Local Development Setup

### 1. Backend (FastAPI)
```bash
# Navigate to the backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Start the uvicorn development server
uvicorn main:app --reload --port 8001
```
*The local database `finance.db` will automatically initialize and apply schema migrations upon starting uvicorn.*

### 2. Frontend (Vite + React)
```bash
# Navigate to the frontend directory
cd frontend

# Install package dependencies
npm install

# Start the development server
npm run dev
```

---

## 🐳 Container Deployment (Hugging Face Spaces)
This Space is configured as a Docker build using the root `Dockerfile`. 
* **Port**: `7860`
* **Workflow**: The frontend compiles into a static production bundle `/app/frontend/dist` which is served directly by the FastAPI backend on the default Hugging Face listening port.

