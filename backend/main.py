from dotenv import load_dotenv
load_dotenv()

import os
import secrets
from urllib.parse import urlencode

import requests
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import List, Optional
from datetime import datetime, timedelta

# Import local backend files
from database import get_db, init_db, DatabaseError
import models
import auth
import ai_features
import reports

FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

app = FastAPI(title="FinTracker AI API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def sanitize_date(date_str: str) -> str:
    # Try parsing common formats
    formats = [
        "%Y-%m-%d",      # 2026-06-17
        "%d/%m/%Y",      # 17/06/2026
        "%m/%d/%Y",      # 06/17/2026
        "%d/%m/%y",      # 17/06/26
        "%m/%d/%y",      # 06/17/26
        "%Y/%m/%d",      # 2026/06/17
        "%d-%m-%Y",      # 17-06-2026
        "%m-%d-%Y",      # 06-17-2026
        "%d-%m-%y",      # 17-06-26
        "%m-%d-%y",      # 06-17-26
        "%b %d, %Y",     # Jun 17, 2026
        "%B %d, %Y",     # June 17, 2026
        "%d %b %Y",      # 17 Jun 2026
        "%d %B %Y",      # 17 June 2026
    ]
    cleaned = date_str.strip()
    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    # If all formats fail, fallback to today's date
    return datetime.now().strftime("%Y-%m-%d")

def get_frontend_url() -> str:
    return os.environ.get("FRONTEND_URL", "http://127.0.0.1:3000").rstrip("/")

def get_google_redirect_uri() -> str:
    return os.environ.get("GOOGLE_REDIRECT_URI", "http://127.0.0.1:8001/api/auth/google/callback")

def make_frontend_redirect(params: dict) -> RedirectResponse:
    return RedirectResponse(f"{get_frontend_url()}/?{urlencode(params)}")

def ensure_user_settings(cursor, user_id: int):
    if not user_id:
        raise DatabaseError("Cannot create settings without a valid user id")
    cursor.execute("SELECT id FROM settings WHERE user_id = ?", (user_id,))
    if not cursor.fetchone():
        cursor.execute("INSERT INTO settings (user_id) VALUES (?)", (user_id,))

def get_required_insert_id(cursor, fallback_query: str, fallback_params: tuple, entity_name: str) -> int:
    inserted_id = cursor.lastrowid
    if inserted_id:
        return inserted_id

    cursor.execute(fallback_query, fallback_params)
    row = cursor.fetchone()
    if row and row.get("id"):
        return row["id"]

    raise DatabaseError(
        f"Could not read inserted {entity_name} id. Check the Supabase exec_sql function returns SELECT and RETURNING rows."
    )

def make_unique_username(cursor, email: str, fallback_name: str = "") -> str:
    email_prefix = email.split("@")[0] if email and "@" in email else fallback_name or "google_user"
    base = "".join(ch.lower() if ch.isalnum() else "_" for ch in email_prefix).strip("_") or "google_user"
    base = base[:40]
    candidate = base
    suffix = 1

    while True:
        cursor.execute("SELECT id FROM users WHERE username = ?", (candidate,))
        if not cursor.fetchone():
            return candidate
        suffix += 1
        candidate = f"{base}_{suffix}"

# Initialize database on startup
@app.on_event("startup")
def startup_event():
    init_db()

# --- AUTH ROUTES ---

@app.post("/api/auth/register", response_model=models.Token, status_code=status.HTTP_201_CREATED)
def register(user: models.UserRegister):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if username exists
    cursor.execute("SELECT id FROM users WHERE username = ?", (user.username,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Username already registered")
        
    # Hash password and insert
    hashed_pwd = auth.get_password_hash(user.password)
    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
            (user.username, hashed_pwd, user.email)
        )
        user_id = get_required_insert_id(
            cursor,
            "SELECT id FROM users WHERE username = ?",
            (user.username,),
            "user",
        )
        
        # Create default settings
        ensure_user_settings(cursor, user_id)
        
        conn.commit()
    except DatabaseError as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
    conn.close()
    
    # Generate token
    token = auth.create_access_token({"sub": user.username, "id": user_id})
    return {"access_token": token, "token_type": "bearer"}

@app.post("/api/auth/login", response_model=models.Token)
def login(user: models.UserLogin):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (user.username,))
    db_user = cursor.fetchone()
    conn.close()
    
    if not db_user or not auth.verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
        
    # Process recurring expenses on login
    ai_features.process_recurring_expenses(db_user["id"])
        
    token = auth.create_access_token({"sub": db_user["username"], "id": db_user["id"]})
    return {"access_token": token, "token_type": "bearer"}

@app.get("/api/auth/google/login")
def google_login():
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID is not configured")

    params = {
        "client_id": client_id,
        "redirect_uri": get_google_redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
        "state": secrets.token_urlsafe(16),
    }
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}")

@app.get("/api/auth/google/callback")
def google_callback(code: Optional[str] = None, error: Optional[str] = None):
    if error:
        return make_frontend_redirect({"auth_error": f"Google sign-in failed: {error}"})
    if not code:
        return make_frontend_redirect({"auth_error": "Google sign-in did not return an authorization code."})

    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        return make_frontend_redirect({"auth_error": "Google OAuth is not configured on the server."})

    try:
        token_res = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": get_google_redirect_uri(),
                "grant_type": "authorization_code",
            },
            timeout=15,
        )
        token_res.raise_for_status()
        google_access_token = token_res.json().get("access_token")
        if not google_access_token:
            return make_frontend_redirect({"auth_error": "Google did not return an access token."})

        profile_res = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {google_access_token}"},
            timeout=15,
        )
        profile_res.raise_for_status()
        profile = profile_res.json()
    except requests.RequestException:
        return make_frontend_redirect({"auth_error": "Could not verify your Google account. Please try again."})

    google_id = profile.get("sub")
    email = profile.get("email")
    email_verified = profile.get("email_verified")
    display_name = profile.get("name") or ""

    if not google_id or not email:
        return make_frontend_redirect({"auth_error": "Google account profile is missing required information."})
    if email_verified is False:
        return make_frontend_redirect({"auth_error": "Please verify your Google email before signing in."})

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT id, username, email, google_id FROM users WHERE google_id = ? OR email = ?",
            (google_id, email),
        )
        db_user = cursor.fetchone()

        if db_user:
            user_id = db_user["id"]
            username = db_user["username"]
            if not db_user.get("google_id"):
                cursor.execute(
                    "UPDATE users SET google_id = ?, auth_provider = ? WHERE id = ?",
                    (google_id, "google", user_id),
                )
            ensure_user_settings(cursor, user_id)
        else:
            username = make_unique_username(cursor, email, display_name)
            random_password_hash = auth.get_password_hash(secrets.token_urlsafe(32))
            cursor.execute(
                """
                INSERT INTO users (username, password_hash, email, google_id, auth_provider)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, random_password_hash, email, google_id, "google"),
            )
            user_id = get_required_insert_id(
                cursor,
                "SELECT id FROM users WHERE google_id = ?",
                (google_id,),
                "Google user",
            )
            ensure_user_settings(cursor, user_id)

        conn.commit()
    except DatabaseError:
        conn.close()
        return make_frontend_redirect({"auth_error": "Could not create or link your Google account."})

    conn.close()

    ai_features.process_recurring_expenses(user_id)
    token = auth.create_access_token({"sub": username, "id": user_id})
    return make_frontend_redirect({"google_token": token})

@app.get("/api/auth/me")
def get_me(current_user: dict = Depends(auth.get_current_user)):
    return current_user


# --- INCOME ROUTES ---

@app.get("/api/income", response_model=List[models.IncomeResponse])
def get_income(current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM income WHERE user_id = ? ORDER BY date DESC", (current_user["id"],))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/income", response_model=models.IncomeResponse, status_code=status.HTTP_201_CREATED)
def add_income(income: models.IncomeCreate, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    sanitized_date_str = sanitize_date(income.date)
    cursor.execute(
        "INSERT INTO income (user_id, amount, source, date, description) VALUES (?, ?, ?, ?, ?)",
        (current_user["id"], income.amount, income.source, sanitized_date_str, income.description)
    )
    income_id = cursor.lastrowid
    conn.commit()
    
    cursor.execute("SELECT * FROM income WHERE id = ?", (income_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row)

@app.delete("/api/income/{income_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_income(income_id: int, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM income WHERE id = ? AND user_id = ?", (income_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Income item not found")
        
    cursor.execute("DELETE FROM income WHERE id = ?", (income_id,))
    conn.commit()
    conn.close()
    return None


# --- EXPENSE ROUTES ---

@app.get("/api/expenses", response_model=List[models.ExpenseResponse])
def get_expenses(current_user: dict = Depends(auth.get_current_user)):
    # Auto-process recurring expenses
    ai_features.process_recurring_expenses(current_user["id"])
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC", (current_user["id"],))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/expenses")
def add_expense(expense: models.ExpenseCreate, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Insert expense
    sanitized_date_str = sanitize_date(expense.date)
    cursor.execute(
        "INSERT INTO expenses (user_id, amount, category, date, description) VALUES (?, ?, ?, ?, ?)",
        (current_user["id"], expense.amount, expense.category, sanitized_date_str, expense.description)
    )
    expense_id = cursor.lastrowid
    conn.commit()
    
    # Fetch inserted row
    cursor.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,))
    row = dict(cursor.fetchone())
    
    # 2. Check budgets and trigger alert if applicable
    # Extract month YYYY-MM
    expense_month = datetime.strptime(expense.date, "%Y-%m-%d").strftime("%Y-%m")
    
    cursor.execute(
        "SELECT limit_amount FROM budgets WHERE user_id = ? AND category = ? AND month = ?",
        (current_user["id"], expense.category, expense_month)
    )
    budget = cursor.fetchone()
    
    alert = None
    if budget:
        limit = budget["limit_amount"]
        # Fetch user setting threshold
        cursor.execute("SELECT alert_threshold FROM settings WHERE user_id = ?", (current_user["id"],))
        setting = cursor.fetchone()
        threshold = setting["alert_threshold"] if setting else 0.90
        
        # Calculate sum spent
        cursor.execute(
            "SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND category = ? AND substr(date, 1, 7) = ?",
            (current_user["id"], expense.category, expense_month)
        )
        total_spent = cursor.fetchone()["total"] or 0.0
        
        pct_used = total_spent / limit
        if pct_used >= 1.0:
            alert = {
                "type": "danger",
                "message": f"Alert! You have exceeded your {expense.category} budget of ₹{limit:,.0f} (Spent: ₹{total_spent:,.0f})"
            }
        elif pct_used >= threshold:
            alert = {
                "type": "warning",
                "message": f"Alert! {pct_used*100:.0f}% of your {expense.category} budget is used (Spent: ₹{total_spent:,.0f} / ₹{limit:,.0f})"
            }
            
    conn.close()
    return {"expense": row, "alert": alert}

@app.delete("/api/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: int, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM expenses WHERE id = ? AND user_id = ?", (expense_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Expense item not found")
        
    cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    conn.commit()
    conn.close()
    return None


# --- BUDGET ROUTES ---

@app.get("/api/budgets", response_model=List[models.BudgetResponse])
def get_budgets(current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM budgets WHERE user_id = ? ORDER BY month DESC, category ASC", (current_user["id"],))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/budgets", response_model=models.BudgetResponse)
def set_budget(budget: models.BudgetCreate, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if budget exists, if so update, otherwise insert
    cursor.execute(
        "SELECT id FROM budgets WHERE user_id = ? AND category = ? AND month = ?",
        (current_user["id"], budget.category, budget.month)
    )
    existing = cursor.fetchone()
    
    if existing:
        cursor.execute(
            "UPDATE budgets SET limit_amount = ? WHERE id = ?",
            (budget.limit_amount, existing["id"])
        )
        budget_id = existing["id"]
    else:
        cursor.execute(
            "INSERT INTO budgets (user_id, category, limit_amount, month) VALUES (?, ?, ?, ?)",
            (current_user["id"], budget.category, budget.limit_amount, budget.month)
        )
        budget_id = cursor.lastrowid
        
    conn.commit()
    cursor.execute("SELECT * FROM budgets WHERE id = ?", (budget_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row)

@app.delete("/api/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: int, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM budgets WHERE id = ? AND user_id = ?", (budget_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Budget item not found")
        
    cursor.execute("DELETE FROM budgets WHERE id = ?", (budget_id,))
    conn.commit()
    conn.close()
    return None


# --- SETTINGS ROUTES ---

@app.get("/api/settings", response_model=models.SettingsResponse)
def get_settings(current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM settings WHERE user_id = ?", (current_user["id"],))
    row = cursor.fetchone()
    if not row:
        cursor.execute("INSERT INTO settings (user_id) VALUES (?)", (current_user["id"],))
        conn.commit()
        cursor.execute("SELECT * FROM settings WHERE user_id = ?", (current_user["id"],))
        row = cursor.fetchone()
    conn.close()
    # Map integer 1/0 to bool
    ret = dict(row)
    ret["email_reports_enabled"] = bool(ret["email_reports_enabled"])
    return ret

@app.put("/api/settings", response_model=models.SettingsResponse)
def update_settings(settings: models.SettingsUpdate, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE settings SET email_reports_enabled = ?, alert_threshold = ? WHERE user_id = ?",
        (1 if settings.email_reports_enabled else 0, settings.alert_threshold, current_user["id"])
    )
    conn.commit()
    cursor.execute("SELECT * FROM settings WHERE user_id = ?", (current_user["id"],))
    row = cursor.fetchone()
    conn.close()
    ret = dict(row)
    ret["email_reports_enabled"] = bool(ret["email_reports_enabled"])
    return ret


# --- ANALYTICS ROUTES ---

@app.get("/api/analytics/dashboard")
def get_dashboard_data(current_user: dict = Depends(auth.get_current_user)):
    # Auto-process recurring expenses
    ai_features.process_recurring_expenses(current_user["id"])
    # Aggregates details for graphs
    now = datetime.now()
    current_month_str = now.strftime("%Y-%m")
    
    # 1. Total Income & Expense (All time)
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT SUM(amount) as total FROM income WHERE user_id = ?",
        (current_user["id"],)
    )
    income_val = cursor.fetchone()["total"] or 0.0
    
    cursor.execute(
        "SELECT SUM(amount) as total FROM expenses WHERE user_id = ?",
        (current_user["id"],)
    )
    expense_val = cursor.fetchone()["total"] or 0.0
    
    # 2. Categories breakdown (All time)
    cursor.execute(
        "SELECT category, SUM(amount) as total FROM expenses WHERE user_id = ? GROUP BY category",
        (current_user["id"],)
    )
    cat_breakdown = [dict(row) for row in cursor.fetchall()]
    
    # 3. Budget compliance/limits
    cursor.execute(
        "SELECT id, category, limit_amount, month FROM budgets WHERE user_id = ? AND month = ?",
        (current_user["id"], current_month_str)
    )
    budgets = [dict(row) for row in cursor.fetchall()]
    
    budget_alerts = []
    budget_map = {b["category"]: b["limit_amount"] for b in budgets}
    spent_map = {c["category"]: c["total"] for c in cat_breakdown}
    
    cursor.execute("SELECT alert_threshold FROM settings WHERE user_id = ?", (current_user["id"],))
    setting = cursor.fetchone()
    threshold = setting["alert_threshold"] if setting else 0.90
    
    for cat, limit in budget_map.items():
        spent = spent_map.get(cat, 0.0)
        pct = spent / limit
        if pct >= 1.0:
            budget_alerts.append({
                "category": cat,
                "limit": limit,
                "spent": spent,
                "percentage": round(pct * 100, 1),
                "alert_type": "danger",
                "message": f"You used {pct*100:.0f}% of your budget for {cat}!"
            })
        elif pct >= threshold:
            budget_alerts.append({
                "category": cat,
                "limit": limit,
                "spent": spent,
                "percentage": round(pct * 100, 1),
                "alert_type": "warning",
                "message": f"Warning: {pct*100:.0f}% of your {cat} budget has been spent."
            })
            
    # 4. Savings suggestions (quick suggestions list)
    health = ai_features.calculate_financial_health_score(current_user["id"])
    
    conn.close()
    
    return {
        "monthly_summary": {
            "income": income_val,
            "expenses": expense_val,
            "savings": max(0.0, income_val - expense_val)
        },
        "categories": cat_breakdown,
        "budgets": budgets,
        "alerts": budget_alerts,
        "health_score": health["score"],
        "strengths": health["strengths"],
        "weaknesses": health["weaknesses"]
    }

@app.get("/api/analytics/heatmap")
def get_spending_heatmap(current_user: dict = Depends(auth.get_current_user)):
    # Retrieve all-time date-wise totals so we can show historical data in the heatmap.
    # Some backends may return date values with a time suffix, so group by the date key.
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT substr(date, 1, 10) as date, SUM(amount) as total, COUNT(*) as count
        FROM expenses 
        WHERE user_id = ? AND date IS NOT NULL
        GROUP BY substr(date, 1, 10)
        ORDER BY substr(date, 1, 10) ASC
        """,
        (current_user["id"],)
    )
    expense_rows = cursor.fetchall()

    cursor.execute(
        """
        SELECT substr(date, 1, 10) as date, SUM(amount) as total, COUNT(*) as count
        FROM income
        WHERE user_id = ? AND date IS NOT NULL
        GROUP BY substr(date, 1, 10)
        ORDER BY substr(date, 1, 10) ASC
        """,
        (current_user["id"],)
    )
    income_rows = cursor.fetchall()
    conn.close()
    
    # Prepare structured records
    by_date = {}
    for row in expense_rows:
        date_key = str(row["date"])[:10]
        by_date.setdefault(date_key, {"expense_amount": 0.0, "income_amount": 0.0, "expense_count": 0, "income_count": 0})
        by_date[date_key]["expense_amount"] += float(row["total"] or 0)
        by_date[date_key]["expense_count"] += int(row["count"] or 0)

    for row in income_rows:
        date_key = str(row["date"])[:10]
        by_date.setdefault(date_key, {"expense_amount": 0.0, "income_amount": 0.0, "expense_count": 0, "income_count": 0})
        by_date[date_key]["income_amount"] += float(row["total"] or 0)
        by_date[date_key]["income_count"] += int(row["count"] or 0)

    data = []
    for date_key, totals in sorted(by_date.items()):
        try:
            d_obj = datetime.strptime(date_key, "%Y-%m-%d")
            expense_amount = totals["expense_amount"]
            income_amount = totals["income_amount"]
            data.append({
                "date": date_key,
                "amount": expense_amount,
                "expense_amount": expense_amount,
                "income_amount": income_amount,
                "transaction_count": totals["expense_count"] + totals["income_count"],
                "has_expense": expense_amount > 0,
                "has_income": income_amount > 0,
                "weekday": d_obj.strftime("%A"),     # e.g., "Monday"
                "weekday_num": d_obj.weekday(),       # 0=Monday
                "week_of_year": d_obj.isocalendar()[1]
            })
        except ValueError:
            continue
    return data


# --- AI FEATURES ---

@app.get("/api/ai/analyze")
def get_ai_analysis(current_user: dict = Depends(auth.get_current_user)):
    analysis = ai_features.analyze_spending(current_user["id"])
    return {"analysis": analysis}

@app.get("/api/ai/health-score")
def get_health_score(current_user: dict = Depends(auth.get_current_user)):
    health = ai_features.calculate_financial_health_score(current_user["id"])
    return health

@app.get("/api/ai/predict")
def get_prediction(current_user: dict = Depends(auth.get_current_user)):
    pred = ai_features.predict_next_month_expenses(current_user["id"])
    return pred

@app.post("/api/ai/chatbot", response_model=models.ChatResponse)
def get_chatbot_reply(query: models.ChatQuery, current_user: dict = Depends(auth.get_current_user)):
    reply = ai_features.chatbot_response(current_user["id"], query.message)
    return {"reply": reply}

@app.post("/api/ocr/scan")
async def scan_receipt(file: UploadFile = File(...), current_user: dict = Depends(auth.get_current_user)):
    try:
        contents = await file.read()
        extracted = ai_features.scan_receipt_image(contents, file.filename)
        return extracted
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR Parsing failed: {str(e)}")


# --- GOALS ROUTES ---

@app.get("/api/goals", response_model=List[models.GoalResponse])
def get_goals(current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM goals WHERE user_id = ? ORDER BY deadline ASC", (current_user["id"],))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/goals", response_model=models.GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(goal: models.GoalCreate, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO goals (user_id, name, target_amount, current_amount, deadline) VALUES (?, ?, ?, ?, ?)",
            (current_user["id"], goal.name, goal.target_amount, goal.current_amount, goal.deadline)
        )
        goal_id = cursor.lastrowid
        conn.commit()
    except DatabaseError as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    cursor.execute("SELECT * FROM goals WHERE id = ?", (goal_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row)

@app.put("/api/goals/{goal_id}/add-money", response_model=models.GoalResponse)
def add_money_to_goal(goal_id: int, data: models.GoalAddMoney, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM goals WHERE id = ? AND user_id = ?", (goal_id, current_user["id"]))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found")
    
    new_amount = existing["current_amount"] + data.amount
    cursor.execute("UPDATE goals SET current_amount = ? WHERE id = ?", (new_amount, goal_id))
    conn.commit()
    
    cursor.execute("SELECT * FROM goals WHERE id = ?", (goal_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row)

@app.delete("/api/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM goals WHERE id = ? AND user_id = ?", (goal_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found")
    
    cursor.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
    conn.commit()
    conn.close()
    return None

@app.get("/api/goals/{goal_id}/analysis", response_model=models.GoalAnalysisResponse)
def get_goal_analysis(goal_id: int, current_user: dict = Depends(auth.get_current_user)):
    analysis = ai_features.analyze_savings_goal(current_user["id"], goal_id)
    if "error" in analysis:
        raise HTTPException(status_code=404, detail=analysis["error"])
    return analysis

@app.post("/api/goals/{goal_id}/chat", response_model=models.GoalChatResponse)
def chat_goal(goal_id: int, data: models.GoalChatRequest, current_user: dict = Depends(auth.get_current_user)):
    response = ai_features.chat_about_savings_goal(current_user["id"], goal_id, data.message)
    return {"response": response}

# --- REPORTS ROUTE ---

@app.get("/api/reports/download", response_class=HTMLResponse)
def download_report(current_user: dict = Depends(auth.get_current_user)):
    report_data = reports.generate_report_content(current_user["id"])
    return HTMLResponse(content=report_data["html"], status_code=200)


# --- RECURRING EXPENSES ROUTES ---

@app.get("/api/recurring-expenses", response_model=List[models.RecurringExpenseResponse])
def get_recurring_expenses(current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM recurring_expenses WHERE user_id = ? ORDER BY start_date DESC", (current_user["id"],))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/recurring-expenses", response_model=models.RecurringExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_recurring_expense(item: models.RecurringExpenseCreate, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        sanitized_start = sanitize_date(item.start_date)
        sanitized_end = sanitize_date(item.end_date) if item.end_date else None
        cursor.execute(
            """
            INSERT INTO recurring_expenses (user_id, title, amount, category, frequency, start_date, end_date, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                current_user["id"],
                item.title,
                item.amount,
                item.category,
                item.frequency,
                sanitized_start,
                sanitized_end,
                1 if item.is_active else 0
            )
        )
        rec_id = cursor.lastrowid
        conn.commit()
    except DatabaseError as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    ai_features.process_recurring_expenses(current_user["id"])
    
    cursor.execute("SELECT * FROM recurring_expenses WHERE id = ?", (rec_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row)

@app.put("/api/recurring-expenses/{item_id}", response_model=models.RecurringExpenseResponse)
def update_recurring_expense(item_id: int, item: models.RecurringExpenseCreate, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM recurring_expenses WHERE id = ? AND user_id = ?", (item_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Recurring expense not found")
        
    try:
        sanitized_start = sanitize_date(item.start_date)
        sanitized_end = sanitize_date(item.end_date) if item.end_date else None
        cursor.execute(
            """
            UPDATE recurring_expenses
            SET title = ?, amount = ?, category = ?, frequency = ?, start_date = ?, end_date = ?, is_active = ?
            WHERE id = ?
            """,
            (
                item.title,
                item.amount,
                item.category,
                item.frequency,
                sanitized_start,
                sanitized_end,
                1 if item.is_active else 0,
                item_id
            )
        )
        conn.commit()
    except DatabaseError as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
    cursor.execute("SELECT * FROM recurring_expenses WHERE id = ?", (item_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row)

@app.delete("/api/recurring-expenses/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring_expense(item_id: int, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM recurring_expenses WHERE id = ? AND user_id = ?", (item_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Recurring expense not found")
        
    cursor.execute("DELETE FROM recurring_expenses WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return None

@app.put("/api/recurring-expenses/{item_id}/toggle", response_model=models.RecurringExpenseResponse)
def toggle_recurring_expense(item_id: int, current_user: dict = Depends(auth.get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT is_active FROM recurring_expenses WHERE id = ? AND user_id = ?", (item_id, current_user["id"]))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Recurring expense not found")
        
    new_status = 0 if row["is_active"] else 1
    cursor.execute("UPDATE recurring_expenses SET is_active = ? WHERE id = ?", (new_status, item_id))
    conn.commit()
    
    if new_status == 1:
        ai_features.process_recurring_expenses(current_user["id"])
        
    cursor.execute("SELECT * FROM recurring_expenses WHERE id = ?", (item_id,))
    updated_row = cursor.fetchone()
    conn.close()
    return dict(updated_row)


# --- AI PERSONALITY ROUTE ---

@app.get("/api/ai/personality", response_model=models.SpendingPersonalityResponse)
def get_ai_personality(current_user: dict = Depends(auth.get_current_user)):
    return ai_features.get_spending_personality(current_user["id"])


if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    # Make sure DB exists
    init_db()
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
