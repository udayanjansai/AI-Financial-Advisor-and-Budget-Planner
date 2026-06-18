---
title: FinTracker AI
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
---

# FinTracker AI

Full-stack FastAPI + React finance dashboard for Hugging Face Spaces.

## Required Space Secrets

Set these in your Hugging Face Space under **Settings > Variables and secrets**:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `GEMINI_API_KEY`

Optional:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`

Optional Google OAuth:

- `VITE_ENABLE_GOOGLE_AUTH=true`
- `FRONTEND_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

For Hugging Face, the backend runs on port `7860` and serves the React frontend from `frontend/dist`.
