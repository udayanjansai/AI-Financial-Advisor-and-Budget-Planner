import os
from dotenv import load_dotenv
load_dotenv()

import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Any, List

# Try to import sklearn and xgboost
try:
    from sklearn.linear_model import LinearRegression
    from sklearn.ensemble import RandomForestRegressor
    import xgboost as xgb
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False

# Try to import Gemini
import google.generativeai as genai
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY and GEMINI_API_KEY != "YOUR_GEMINI_API_KEY_HERE":
    genai.configure(api_key=GEMINI_API_KEY)
    HAS_GEMINI = True
else:
    HAS_GEMINI = False

# Helper: Get database connection
from database import get_db

def query_db(query: str, args=(), one=False):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(query, args)
    rv = cursor.fetchall()
    conn.close()
    return (rv[0] if rv else None) if one else rv

# ==========================================
# 1. AI Spending Analyzer
# ==========================================
def analyze_spending(user_id: int) -> str:
    # Fetch user transactions for current month and previous month
    now = datetime.now()
    current_month_str = now.strftime("%Y-%m")
    prev_month = now.replace(day=1) - timedelta(days=1)
    prev_month_str = prev_month.strftime("%Y-%m")
    
    # Get current month expenses
    curr_expenses = query_db(
        "SELECT category, SUM(amount) as total FROM expenses WHERE user_id = ? AND substr(date, 1, 7) = ? GROUP BY category",
        (user_id, current_month_str)
    )
    
    # Get previous month expenses
    prev_expenses = query_db(
        "SELECT category, SUM(amount) as total FROM expenses WHERE user_id = ? AND substr(date, 1, 7) = ? GROUP BY category",
        (user_id, prev_month_str)
    )
    
    curr_dict = {row["category"]: row["total"] for row in curr_expenses}
    prev_dict = {row["category"]: row["total"] for row in prev_expenses}
    
    total_curr = sum(curr_dict.values())
    total_prev = sum(prev_dict.values())
    
    # Compile comparison text for Gemini
    data_summary = f"Comparison of expenses (Current Month: {current_month_str} vs Previous Month: {prev_month_str}):\n"
    data_summary += f"Total Spending: ₹{total_curr:.2f} (Current) vs ₹{total_prev:.2f} (Previous)\n"
    data_summary += "Category breakdown:\n"
    
    all_categories = set(list(curr_dict.keys()) + list(prev_dict.keys()))
    for cat in all_categories:
        c_val = curr_dict.get(cat, 0.0)
        p_val = prev_dict.get(cat, 0.0)
        diff_pct = ((c_val - p_val) / p_val * 100) if p_val > 0 else 100.0 if c_val > 0 else 0.0
        data_summary += f"- {cat}: Current ₹{c_val:.2f}, Previous ₹{p_val:.2f} (Change: {diff_pct:+.1f}%)\n"
        
    if HAS_GEMINI:
        try:
            model = genai.GenerativeModel("gemini-3.1-flash-lite")
            prompt = (
                "You are an expert financial counselor. Review the following spending data of a user:\n"
                f"{data_summary}\n"
                "Provide a brief spending analysis (maximum 4 bullet points). Highlight significant increases, "
                "suggest specific actionable ways to save, and calculate how much they can save (e.g. 'Reducing food spending by 10% can save ₹X'). "
                "Use Indian Rupee (₹) symbols and respond in a helpful, friendly tone."
            )
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            # Fall back to rule-based if API error
            pass
            
    # Rule-based fallback
    insights = []
    insights.append(f"Your total spending is ₹{total_curr:,.0f} this month compared to ₹{total_prev:,.0f} last month.")
    
    for cat in all_categories:
        c_val = curr_dict.get(cat, 0.0)
        p_val = prev_dict.get(cat, 0.0)
        if p_val > 0 and (c_val - p_val) / p_val > 0.15:
            pct_diff = ((c_val - p_val) / p_val) * 100
            save_val = c_val * 0.10
            insights.append(f"✓ You spent {pct_diff:.0f}% more on {cat} than last month.")
            insights.append(f"💡 Reducing your {cat} budget by 10% next month can save about ₹{save_val:,.0f}.")
            
    if len(insights) <= 1:
        insights.append("Your spending is stable. Continue tracking daily expenses to identify future savings opportunities.")
        insights.append("Tip: Aim to save at least 20% of your total income by setting monthly category budgets.")
        
    return "\n\n".join(insights)

# ==========================================
# 2. Financial Health Score
# ==========================================
def calculate_financial_health_score(user_id: int) -> Dict[str, Any]:
    # Calculate ratios based on last 30 days
    now = datetime.now()
    start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    
    # 1. Income Stability & Total Income
    income_rows = query_db(
        "SELECT SUM(amount) as total, COUNT(DISTINCT source) as sources FROM income WHERE user_id = ? AND date >= ?",
        (user_id, start_date), one=True
    )
    total_income = income_rows["total"] if income_rows and income_rows["total"] is not None else 0.0
    num_sources = income_rows["sources"] if income_rows and income_rows["sources"] is not None else 0
    
    # 2. Total Expense
    expense_rows = query_db(
        "SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND date >= ?",
        (user_id, start_date), one=True
    )
    total_expense = expense_rows["total"] if expense_rows and expense_rows["total"] is not None else 0.0
    
    # Ratios
    savings = max(0.0, total_income - total_expense)
    savings_ratio = (savings / total_income) if total_income > 0 else 0.0
    expense_ratio = (total_expense / total_income) if total_income > 0 else 0.0
    
    # 3. Budget Discipline
    # Check current month budget compliance
    current_month = now.strftime("%Y-%m")
    budgets = query_db("SELECT category, limit_amount FROM budgets WHERE user_id = ? AND month = ?", (user_id, current_month))
    
    discipline_score = 100
    failed_budgets = []
    
    if budgets:
        compliance_count = 0
        for b in budgets:
            cat = b["category"]
            limit = b["limit_amount"]
            spent_row = query_db(
                "SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND category = ? AND substr(date, 1, 7) = ?",
                (user_id, cat, current_month), one=True
            )
            spent = spent_row["total"] if spent_row and spent_row["total"] is not None else 0.0
            if spent <= limit:
                compliance_count += 1
            else:
                failed_budgets.append(cat)
        discipline_score = int((compliance_count / len(budgets)) * 100)
    
    # Calculate Component Scores
    # Savings Ratio Score: 0-100 (target >= 20% savings)
    savings_score = min(100, int((savings_ratio / 0.20) * 100)) if savings_ratio > 0 else 0
    
    # Expense Ratio Score: 0-100 (target <= 70% expenses)
    expense_score = max(0, int((1.0 - (expense_ratio / 0.80)) * 100)) if expense_ratio < 0.80 else 0
    if total_income == 0 and total_expense > 0:
        expense_score = 0
    elif total_income == 0 and total_expense == 0:
        expense_score = 100
        
    # Income Stability Score: based on income sources and total
    stability_score = 50 if num_sources == 1 else 85 if num_sources > 1 else 0
    if total_income > 50000:
        stability_score = min(100, stability_score + 15)
        
    # Overall Weighted Score
    # 30% Savings, 30% Expense, 20% Budget Discipline, 20% Income Stability
    overall_score = int(
        (savings_score * 0.30) + 
        (expense_score * 0.30) + 
        (discipline_score * 0.20) + 
        (stability_score * 0.20)
    )
    # Clamp to 0-100
    overall_score = max(0, min(100, overall_score))
    
    # Strengths / Weaknesses
    strengths = []
    weaknesses = []
    
    if savings_ratio >= 0.20:
        strengths.append("Consistent savings (Savings ratio exceeds 20%)")
    else:
        weaknesses.append("Low savings rate (Save less than 20% of your income)")
        
    if expense_ratio <= 0.60:
        strengths.append("Disciplined overall spending (Expenses are well below income)")
    elif expense_ratio > 0.85:
        weaknesses.append("High expense ratio (Over 85% of income is spent)")
        
    if discipline_score >= 80:
        strengths.append("Strong budget compliance (Most category budgets are respected)")
    elif discipline_score < 50:
        weaknesses.append("High budget deviations (Often overshoot budget limits)")
        
    if num_sources > 1:
        strengths.append("Multiple income streams (Freelance / side income adds stability)")
    elif total_income == 0:
        weaknesses.append("No active monthly income recorded")
        
    if not strengths:
        strengths.append("Began tracking finances (first step towards health)")
    if not weaknesses:
        weaknesses.append("None detected! Keep maintaining this structure.")
        
    return {
        "score": overall_score,
        "ratios": {
            "savings_ratio": round(savings_ratio, 2),
            "expense_ratio": round(expense_ratio, 2),
            "budget_discipline": round(discipline_score / 100.0, 2),
            "income_stability": round(stability_score / 100.0, 2)
        },
        "strengths": strengths,
        "weaknesses": weaknesses,
        "total_income": total_income,
        "total_expense": total_expense
    }

# ==========================================
# 3. Future Expense Prediction
# ==========================================
def predict_next_month_expenses(user_id: int) -> Dict[str, float]:
    # Retrieve user's past 6 months of expenses, aggregated monthly
    now = datetime.now()
    
    # Fallback default value
    default_prediction = 30000.0
    
    # Get all past expenses
    expense_rows = query_db(
        "SELECT date, amount FROM expenses WHERE user_id = ? ORDER BY date ASC",
        (user_id,)
    )
    
    if not expense_rows or len(expense_rows) < 5:
        # Not enough data, return simple estimations
        # Calculate daily average and extrapolate
        total_spent = sum([r["amount"] for r in expense_rows]) if expense_rows else 0.0
        if expense_rows:
            dates = [datetime.strptime(r["date"], "%Y-%m-%d") for r in expense_rows]
            days_span = max(1, (max(dates) - min(dates)).days + 1)
            daily_avg = total_spent / days_span
            predicted = daily_avg * 30.0
        else:
            predicted = default_prediction
            
        return {
            "linear_regression": round(predicted, 2),
            "random_forest": round(predicted * 0.98, 2),
            "xgboost": round(predicted * 1.02, 2),
            "status": "Fallback (Insufficient data. Need at least 5 transactions across multiple days)"
        }
        
    # We have data! Let's aggregate daily or weekly to get training samples
    df = pd.DataFrame([{"date": r["date"], "amount": r["amount"]} for r in expense_rows])
    df["date"] = pd.to_datetime(df["date"])
    
    # Resample to daily totals
    df_daily = df.groupby(df["date"].dt.date)["amount"].sum().reset_index()
    df_daily = df_daily.sort_values("date")
    
    # Let's create features: day of week, day of month, lags (past 1-7 days average)
    df_daily["day_of_week"] = pd.to_datetime(df_daily["date"]).dt.dayofweek
    df_daily["day_of_month"] = pd.to_datetime(df_daily["date"]).dt.day
    df_daily["lag_1"] = df_daily["amount"].shift(1)
    df_daily["lag_2"] = df_daily["amount"].shift(2)
    df_daily["rolling_mean_3"] = df_daily["amount"].shift(1).rolling(window=3).mean()
    
    # Drop NaNs for training
    df_features = df_daily.dropna()
    
    # Fallback if dropna leaves us empty
    if df_features.empty or len(df_features) < 3:
        avg_monthly = df["amount"].sum() / max(1, len(df["date"].dt.to_period("M").unique()))
        return {
            "linear_regression": round(avg_monthly, 2),
            "random_forest": round(avg_monthly * 0.97, 2),
            "xgboost": round(avg_monthly * 1.01, 2),
            "status": "Averages-based estimation (Too short time span)"
        }
        
    # Features & Targets
    X = df_features[["day_of_week", "day_of_month", "lag_1", "lag_2", "rolling_mean_3"]].values
    y = df_features["amount"].values
    
    # Next month prediction: we simulate next 30 days recursively
    pred_lr_total = 0.0
    pred_rf_total = 0.0
    pred_xgb_total = 0.0
    
    # Train models
    try:
        # 1. Linear Regression
        lr = LinearRegression()
        lr.fit(X, y)
        
        # 2. Random Forest
        rf = RandomForestRegressor(n_estimators=10, random_state=42)
        rf.fit(X, y)
        
        # 3. XGBoost
        xgb_model = xgb.XGBRegressor(n_estimators=10, max_depth=3, learning_rate=0.1, random_state=42)
        xgb_model.fit(X, y)
        
        # Predict next 30 days
        last_amounts = list(df_daily["amount"].values[-3:])
        current_date = df_daily["date"].iloc[-1] + timedelta(days=1)
        
        lr_history = list(last_amounts)
        rf_history = list(last_amounts)
        xgb_history = list(last_amounts)
        
        for i in range(30):
            day_of_week = current_date.weekday()
            day_of_month = current_date.day
            
            # Predict LR
            feat_lr = np.array([[day_of_week, day_of_month, lr_history[-1], lr_history[-2], np.mean(lr_history[-3:])]])
            p_lr = max(0.0, float(lr.predict(feat_lr)[0]))
            pred_lr_total += p_lr
            lr_history.append(p_lr)
            
            # Predict RF
            feat_rf = np.array([[day_of_week, day_of_month, rf_history[-1], rf_history[-2], np.mean(rf_history[-3:])]])
            p_rf = max(0.0, float(rf.predict(feat_rf)[0]))
            pred_rf_total += p_rf
            rf_history.append(p_rf)
            
            # Predict XGBoost
            feat_xgb = np.array([[day_of_week, day_of_month, xgb_history[-1], xgb_history[-2], np.mean(xgb_history[-3:])]])
            p_xgb = max(0.0, float(xgb_model.predict(feat_xgb)[0]))
            pred_xgb_total += p_xgb
            xgb_history.append(p_xgb)
            
            current_date += timedelta(days=1)
            
    except Exception as e:
        # If ML training crashes, fallback
        avg_monthly = df["amount"].sum() / max(1, len(df["date"].dt.to_period("M").unique()))
        return {
            "linear_regression": round(avg_monthly, 2),
            "random_forest": round(avg_monthly, 2),
            "xgboost": round(avg_monthly, 2),
            "status": f"Fallback due to ML execution error: {str(e)}"
        }
        
    return {
        "linear_regression": round(pred_lr_total, 2),
        "random_forest": round(pred_rf_total, 2),
        "xgboost": round(pred_xgb_total, 2),
        "status": "Success"
    }

# ==========================================
# 4. AI Finance Chatbot
# ==========================================
def chatbot_response(user_id: int, message: str) -> str:
    # 1. Fetch user transaction context
    now = datetime.now()
    current_month_str = now.strftime("%Y-%m")
    
    recent_expenses = query_db(
        "SELECT amount, category, date, description FROM expenses WHERE user_id = ? ORDER BY date DESC LIMIT 15",
        (user_id,)
    )
    recent_income = query_db(
        "SELECT amount, source, date, description FROM income WHERE user_id = ? ORDER BY date DESC LIMIT 15",
        (user_id,)
    )
    budgets = query_db(
        "SELECT category, limit_amount FROM budgets WHERE user_id = ? AND month = ?",
        (user_id, current_month_str)
    )
    
    # Calculate current category spends
    cat_spends = query_db(
        "SELECT category, SUM(amount) as spent FROM expenses WHERE user_id = ? AND substr(date, 1, 7) = ? GROUP BY category",
        (user_id, current_month_str)
    )
    
    health = calculate_financial_health_score(user_id)
    
    # Create context text
    context = "USER PROFILE:\n"
    context += f"- Active Month: {current_month_str}\n"
    context += f"- Current Monthly Income: ₹{health['total_income']:.2f}\n"
    context += f"- Current Monthly Expense: ₹{health['total_expense']:.2f}\n"
    context += f"- Savings Ratio: {health['ratios']['savings_ratio']*100:.0f}%\n"
    context += f"- Financial Health Score: {health['score']}/100\n"
    
    context += "\nBUDGET RULES & CURRENT SPENDING:\n"
    spent_dict = {row["category"]: row["spent"] for row in cat_spends}
    for b in budgets:
        cat = b["category"]
        lim = b["limit_amount"]
        spent = spent_dict.get(cat, 0.0)
        context += f"- {cat}: Budget limit ₹{lim:.2f}, Spent ₹{spent:.2f} ({spent/lim*100:.1f}% used)\n"
        
    context += "\nRECENT EXPENSES (Last 15):\n"
    for e in recent_expenses:
        context += f"- {e['date']}: ₹{e['amount']:.2f} on {e['category']} ({e['description'] or 'N/A'})\n"
        
    context += "\nRECENT INCOME SOURCES:\n"
    for i in recent_income:
        context += f"- {i['date']}: ₹{i['amount']:.2f} from {i['source']} ({i['description'] or 'N/A'})\n"
        
    if HAS_GEMINI:
        try:
            model = genai.GenerativeModel("gemini-3.1-flash-lite")
            prompt = (
                "You are FinTracker AI, a professional and smart AI Financial Advisor & Budget Planner assistant. "
                "Here is the user's financial profile, budget status, and recent history:\n"
                f"{context}\n"
                "The user is asking the following question in natural language:\n"
                f"\"{message}\"\n\n"
                "Respond directly and accurately to their question using the provided transaction data. "
                "Keep your response concise, professional, action-oriented, and easy to read. "
                "Highlight numbers and key insights using bold formatting. Always use the Indian Rupee symbol (₹)."
            )
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            pass
            
    # Fallback rule-based matching
    msg_lower = message.lower()
    if "food" in msg_lower:
        food_spent = spent_dict.get("Food", 0.0)
        food_budget = next((b["limit_amount"] for b in budgets if b["category"] == "Food"), 0.0)
        if food_budget > 0:
            return f"You have spent **₹{food_spent:,.2f}** out of your **₹{food_budget:,.2f}** food budget this month ({food_spent/food_budget*100:.1f}%)."
        return f"You spent **₹{food_spent:,.2f}** on Food this month. You haven't set a budget for Food yet."
        
    if "save" in msg_lower or "saving" in msg_lower or "where can I save" in msg_lower:
        tips = []
        for cat, spent in spent_dict.items():
            limit = next((b["limit_amount"] for b in budgets if b["category"] == cat), None)
            if limit and spent > limit:
                tips.append(f"• Reduce **{cat}** spending: You exceeded your budget by **₹{spent-limit:,.2f}**.")
            elif limit and spent > limit * 0.8:
                tips.append(f"• Care with **{cat}**: You used {spent/limit*100:.0f}% of your budget.")
                
        if not tips:
            tips.append("• Maintain a savings target of **20%** of your monthly income.")
            tips.append("• Plan large purchases at the end of the month based on remaining surplus.")
            
        return "Based on your current transaction history, here are my savings recommendations:\n" + "\n".join(tips)
        
    if "spend" in msg_lower or "expense" in msg_lower or "how much" in msg_lower:
        return (
            f"This month, you have spent a total of **₹{health['total_expense']:,.2f}** out of an income of **₹{health['total_income']:,.2f}**.\n"
            f"Your savings are **₹{health['total_income']-health['total_expense']:,.2f}** (Savings Ratio: **{health['ratios']['savings_ratio']*100:.0f}%**)."
        )
        
    return (
        "I am here to help you manage your finances. You can ask me questions like:\n"
        "- *'How much did I spend on food this month?'*\n"
        "- *'Where can I save money?'*\n"
        "- *'What is my financial health score?'*"
    )

# ==========================================
# 5. OCR Receipt Scanner
# ==========================================
def scan_receipt_image(image_bytes: bytes, filename: str) -> Dict[str, Any]:
    # Default values derived from filename or fallback mock data
    detected_merchant = "General Store"
    detected_amount = 450.0
    detected_date = datetime.now().strftime("%Y-%m-%d")
    detected_category = "Food"
    
    # Try parsing details from filename as a mock fallback (e.g., "McDonalds_1200_2026-06-15.jpg")
    try:
        clean_name = os.path.splitext(filename)[0]
        parts = clean_name.split("_")
        if len(parts) >= 1:
            detected_merchant = parts[0].replace("-", " ").title()
        if len(parts) >= 2:
            detected_amount = float(parts[1])
        if len(parts) >= 3:
            # check if YYYY-MM-DD
            datetime.strptime(parts[2], "%Y-%m-%d")
            detected_date = parts[2]
    except Exception:
        pass # Fallback to default
        
    if HAS_GEMINI:
        try:
            model = genai.GenerativeModel("gemini-3.1-flash-lite")
            prompt = (
                "Analyze this receipt image. Extract the following details: Date (format YYYY-MM-DD), "
                "Merchant (Name of store/vendor), Amount (Total cost, numerical value), and Category "
                "(Categorize this expense as one of: Food, Transport, Entertainment, Shopping, Utilities, Medical, Others).\n"
                "Return ONLY a clean JSON object with keys: date, merchant, amount, category. "
                "Example response:\n"
                '{"date": "2026-06-15", "merchant": "Subway", "amount": 350.00, "category": "Food"}\n'
                "If date or merchant is unreadable, estimate or use current date and general merchant description."
            )
            
            # Form image block for generative model
            # For simplicity we extract mime-type from file extension
            ext = os.path.splitext(filename)[1].lower()
            mime_type = "image/jpeg"
            if ext == ".png":
                mime_type = "image/png"
            elif ext == ".webp":
                mime_type = "image/webp"
                
            response = model.generate_content([
                prompt,
                {"mime_type": mime_type, "data": image_bytes}
            ])
            
            # Clean JSON response from markdown blocks
            resp_text = response.text.strip()
            if resp_text.startswith("```json"):
                resp_text = resp_text.split("```json")[1].split("```")[0].strip()
            elif resp_text.startswith("```"):
                resp_text = resp_text.split("```")[1].split("```")[0].strip()
                
            parsed = json.loads(resp_text)
            return {
                "date": parsed.get("date", detected_date),
                "merchant": parsed.get("merchant", detected_merchant),
                "amount": float(parsed.get("amount", detected_amount)),
                "category": parsed.get("category", detected_category),
                "source": "Gemini AI OCR"
            }
        except Exception as e:
            # Fall back to standard parsed defaults
            return {
                "date": detected_date,
                "merchant": detected_merchant,
                "amount": detected_amount,
                "category": detected_category,
                "source": f"Filename Mock Parser (Gemini Error: {str(e)})"
            }
            
    return {
        "date": detected_date,
        "merchant": detected_merchant,
        "amount": detected_amount,
        "category": detected_category,
        "source": "Filename Mock Parser (Gemini API key not found)"
    }


# ==========================================
# 6. Auto-Process Recurring Expenses
# ==========================================
def process_recurring_expenses(user_id: int):
    import calendar
    from datetime import date
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM recurring_expenses 
        WHERE user_id = ? AND is_active = 1
    """, (user_id,))
    recurring_items = cursor.fetchall()
    
    today = datetime.now().date()
    
    for item in recurring_items:
        rec_id = item["id"]
        title = item["title"]
        amount = item["amount"]
        category = item["category"]
        frequency = item["frequency"]
        start_date_str = item["start_date"]
        end_date_str = item["end_date"]
        last_processed_str = item["last_processed_date"]
        
        try:
            start_dt = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        except ValueError:
            continue
            
        end_dt = None
        if end_date_str:
            try:
                end_dt = datetime.strptime(end_date_str, "%Y-%m-%d").date()
            except ValueError:
                pass
                
        last_processed_dt = None
        if last_processed_str:
            try:
                last_processed_dt = datetime.strptime(last_processed_str, "%Y-%m-%d").date()
            except ValueError:
                pass
                
        # Generate due occurrences
        occurrences = []
        curr_dt = start_dt
        
        loop_guard = 0
        while curr_dt <= today and loop_guard < 1000:
            loop_guard += 1
            if end_dt and curr_dt > end_dt:
                break
                
            if last_processed_dt is None or curr_dt > last_processed_dt:
                occurrences.append(curr_dt)
                
            if frequency == "Daily":
                curr_dt = curr_dt + timedelta(days=1)
            elif frequency == "Weekly":
                curr_dt = curr_dt + timedelta(weeks=1)
            elif frequency == "Monthly":
                y = curr_dt.year + curr_dt.month // 12
                m = curr_dt.month % 12 + 1
                d = min(curr_dt.day, calendar.monthrange(y, m)[1])
                curr_dt = date(y, m, d)
            elif frequency == "Yearly":
                y = curr_dt.year + 1
                m = curr_dt.month
                d = min(curr_dt.day, calendar.monthrange(y, m)[1])
                curr_dt = date(y, m, d)
            else:
                break
                
        if occurrences:
            for occ in occurrences:
                cursor.execute("""
                    INSERT INTO expenses (user_id, amount, category, date, description)
                    VALUES (?, ?, ?, ?, ?)
                """, (user_id, amount, category, occ.strftime("%Y-%m-%d"), f"Recurring: {title}"))
            
            latest_occ_str = max(occurrences).strftime("%Y-%m-%d")
            cursor.execute("""
                UPDATE recurring_expenses 
                SET last_processed_date = ? 
                WHERE id = ?
            """, (latest_occ_str, rec_id))
            
    conn.commit()
    conn.close()


# ==========================================
# 7. AI Spending Personality Analysis
# ==========================================
def get_spending_personality(user_id: int) -> Dict[str, Any]:
    health = calculate_financial_health_score(user_id)
    
    # Fetch category breakdown for the current month
    now = datetime.now()
    current_month_str = now.strftime("%Y-%m")
    cat_spends = query_db(
        "SELECT category, SUM(amount) as spent FROM expenses WHERE user_id = ? AND substr(date, 1, 7) = ? GROUP BY category",
        (user_id, current_month_str)
    )
    spent_dict = {row["category"]: row["spent"] for row in cat_spends}
    
    # Try to classify with Gemini
    if HAS_GEMINI:
        try:
            model = genai.GenerativeModel("gemini-3.1-flash-lite")
            prompt = (
                "You are FinTracker AI, a financial psychologist and counselor. "
                "Analyze the user's monthly financial statistics and classify them into one of these spending personalities:\n"
                "- **Saver**: Highly disciplined, saves >30% of income, complies with budgets.\n"
                "- **Impulsive Buyer**: High expenses relative to income (expense ratio > 80%), or spends heavily on Shopping, Entertainment, or Others (>35% of total expenses).\n"
                "- **Balanced Spender**: Maintains a healthy balance between saving and spending, respects most budgets.\n"
                "- **Undetermined**: No active income or insufficient transactions to analyze.\n\n"
                "User Statistics:\n"
                f"- Income: ₹{health['total_income']:.2f}\n"
                f"- Expenses: ₹{health['total_expense']:.2f}\n"
                f"- Savings Ratio: {health['ratios']['savings_ratio']*100:.0f}%\n"
                f"- Expense Ratio: {health['ratios']['expense_ratio']*100:.0f}%\n"
                f"- Category Breakdown: {spent_dict}\n\n"
                "Return ONLY a clean JSON object with keys: 'personality', 'description', and 'recommendations' (a list of 3-4 actionable tips).\n"
                "Do NOT include markdown code blocks or any text other than the JSON object."
            )
            response = model.generate_content(prompt)
            resp_text = response.text.strip()
            
            # Clean JSON formatting just in case
            if resp_text.startswith("```json"):
                resp_text = resp_text.split("```json")[1].split("```")[0].strip()
            elif resp_text.startswith("```"):
                resp_text = resp_text.split("```")[1].split("```")[0].strip()
                
            parsed = json.loads(resp_text)
            return {
                "personality": parsed.get("personality", "Balanced Spender"),
                "description": parsed.get("description", ""),
                "recommendations": parsed.get("recommendations", [])
            }
        except Exception:
            pass
            
    # Rule-based fallback classifier
    total_income = health["total_income"]
    total_expense = health["total_expense"]
    savings_ratio = health["ratios"]["savings_ratio"]
    expense_ratio = health["ratios"]["expense_ratio"]
    
    # Check if Shopping/Entertainment/Others is high
    shopping_entertainment = spent_dict.get("Shopping", 0.0) + spent_dict.get("Entertainment", 0.0) + spent_dict.get("Others", 0.0)
    high_discretionary = (shopping_entertainment / total_expense) > 0.35 if total_expense > 0 else False
    
    if total_income == 0 and total_expense == 0:
        personality = "Undetermined"
        description = "You haven't added any transactions yet. Add your income and expenses to let FinTracker AI analyze your spending personality."
        recommendations = [
            "Log your monthly salary or other income streams.",
            "Record your daily expenses like food, transport, and shopping.",
            "Create a category budget to keep your spending on track."
        ]
    elif savings_ratio >= 0.30:
        personality = "Saver"
        description = "You are highly disciplined and focused on building wealth. You successfully save a significant portion of your income, keeping your expenses well below your means."
        recommendations = [
            "Consider allocating some of your savings to long-term investments like mutual funds or index funds.",
            "Don't forget to budget a small 'fun' amount for entertainment to reward yourself.",
            "Set up concrete saving goals (e.g., emergency fund, vacation) to maximize your returns."
        ]
    elif expense_ratio > 0.80 or high_discretionary:
        personality = "Impulsive Buyer"
        description = "You tend to spend a large portion of your income, possibly on impulse purchases or discretionary categories like Shopping and Entertainment. This leaves you with low savings."
        recommendations = [
            "Try the 24-hour rule: wait 24 hours before buying non-essential items.",
            "Establish a strict monthly budget for Shopping and Entertainment, and enable alerts.",
            "Automate your savings by transferring 20% of your income to a separate account right after receiving it."
        ]
    else:
        personality = "Balanced Spender"
        description = "You maintain a healthy balance between saving for the future and enjoying the present. You manage your expenses responsibly and save a reasonable portion of your income."
        recommendations = [
            "Review your category budgets monthly to optimize and find additional saving opportunities.",
            "Build an emergency fund covering 3-6 months of living expenses if you haven't already.",
            "Gradually aim to increase your savings rate by 1-2% every few months."
        ]
        
    return {
        "personality": personality,
        "description": description,
        "recommendations": recommendations
    }


# ==========================================
# 6. AI Goal Tracker Analysis & Chat
# ==========================================

def get_remaining_months(deadline_str: str) -> float:
    try:
        deadline_date = datetime.strptime(deadline_str, "%Y-%m-%d")
    except ValueError:
        return 1.0
    
    today = datetime.now()
    if deadline_date <= today:
        return 0.1
    
    diff_years = deadline_date.year - today.year
    diff_months = deadline_date.month - today.month
    diff_days = deadline_date.day - today.day
    
    total_months = diff_years * 12 + diff_months + (diff_days / 30.44)
    return max(0.1, total_months)


def format_estimated_date(months_from_now: float) -> str:
    if months_from_now == float('inf') or months_from_now <= 0:
        return "Indefinite"
    
    today = datetime.now()
    days_to_add = int(months_from_now * 30.44)
    est_date = today + timedelta(days=days_to_add)
    return est_date.strftime("%B %Y")


def analyze_savings_goal(user_id: int, goal_id: int) -> Dict[str, Any]:
    # 1. Fetch goal
    goal = query_db(
        "SELECT id, name, target_amount, current_amount, deadline FROM goals WHERE id = ? AND user_id = ?",
        (goal_id, user_id), one=True
    )
    if not goal:
        return {"error": "Goal not found"}
    
    target = goal["target_amount"]
    current = goal["current_amount"]
    deadline = goal["deadline"]
    
    remaining_to_save = max(0.0, target - current)
    months_remaining = get_remaining_months(deadline)
    required_monthly_savings = remaining_to_save / months_remaining
    
    # 2. Fetch user's current savings rate (last 30 days)
    health = calculate_financial_health_score(user_id)
    total_income = health["total_income"]
    total_expense = health["total_expense"]
    current_monthly_savings = max(0.0, total_income - total_expense)
    
    is_achievable = current_monthly_savings >= required_monthly_savings or remaining_to_save == 0
    
    # Shortfalls
    monthly_shortfall = max(0.0, required_monthly_savings - current_monthly_savings)
    total_shortfall = max(0.0, remaining_to_save - (current_monthly_savings * months_remaining))
    
    # Estimated completion date
    if remaining_to_save == 0:
        est_months_to_completion = 0.0
        est_completion_date = "Achieved!"
        status = "Achieved"
    elif current_monthly_savings > 0:
        est_months_to_completion = remaining_to_save / current_monthly_savings
        est_completion_date = format_estimated_date(est_months_to_completion)
        status = "On Track" if is_achievable else "Off Track"
    else:
        est_months_to_completion = float('inf')
        est_completion_date = "Indefinite (Zero Savings)"
        status = "Off Track"
        
    # 3. Generate AI insights
    insights = []
    if HAS_GEMINI:
        try:
            model = genai.GenerativeModel("gemini-3.1-flash-lite")
            prompt = (
                "You are an expert financial planning assistant. Analyze the following savings goal and user details:\n"
                f"- Goal Name: {goal['name']}\n"
                f"- Target Amount: ₹{target:,.2f}\n"
                f"- Current Amount Saved: ₹{current:,.2f}\n"
                f"- Target Deadline: {deadline} ({months_remaining:.1f} months remaining)\n"
                f"- User Income (Last 30d): ₹{total_income:,.2f}\n"
                f"- User Expense (Last 30d): ₹{total_expense:,.2f}\n"
                f"- User Net Monthly Savings Rate: ₹{current_monthly_savings:,.2f}\n"
                f"- Required Monthly Savings: ₹{required_monthly_savings:,.2f}\n"
                f"- Status: {status}\n"
                f"- Monthly Shortfall: ₹{monthly_shortfall:,.2f}\n"
                f"- Estimated Completion Date: {est_completion_date}\n\n"
                "Provide a brief list of exactly 3 or 4 actionable bullet points of insights. "
                "Highlight: \n"
                "1. Progress and trend analysis\n"
                "2. Feasibility of the target\n"
                "3. Risk indicators (if off track) or optimization advice (if on track)\n"
                "4. A motivational recommendations.\n"
                "Use Rupee (₹) signs, keep it concise, and speak in a friendly tone."
            )
            response = model.generate_content(prompt)
            insights = [line.strip().lstrip("*-✓ ") for line in response.text.splitlines() if line.strip()]
        except Exception:
            pass
            
    # Rule-based fallback if Gemini fails or is disabled
    if not insights:
        pct = round((current / target) * 100, 1) if target > 0 else 100
        insights.append(f"Progress: You have achieved {pct}% of your target amount of ₹{target:,.0f} for '{goal['name']}'.")
        
        if remaining_to_save == 0:
            insights.append("Feasibility: You have fully reached this savings goal! Congratulations!")
            insights.append("Optimization: You can mark this goal as complete and allocate your savings to other active goals.")
        else:
            insights.append(f"Feasibility: You need to save ₹{required_monthly_savings:,.0f}/month for the next {months_remaining:.1f} months.")
            if status == "On Track":
                insights.append(f"Savings Trend: Your current savings rate of ₹{current_monthly_savings:,.0f}/month is sufficient to reach this goal by {est_completion_date}.")
                insights.append("Motivational: You are on track! Keep up the disciplined spending to ensure you reach this target on time.")
            else:
                insights.append(f"Risk Indicator: You have a projected monthly shortfall of ₹{monthly_shortfall:,.0f}. At your current rate, you will complete the goal in {est_completion_date} (missing the deadline).")
                insights.append(f"Actionable Advice: Review your discretionary expenses (like food, shopping) in the budget planner to find ₹{monthly_shortfall:,.0f} in monthly savings.")
                
    return {
        "goal_id": goal_id,
        "name": goal["name"],
        "target_amount": target,
        "current_amount": current,
        "deadline": deadline,
        "months_remaining": round(months_remaining, 2),
        "required_monthly_savings": round(required_monthly_savings, 2),
        "current_monthly_savings": round(current_monthly_savings, 2),
        "monthly_shortfall": round(monthly_shortfall, 2),
        "total_shortfall": round(total_shortfall, 2),
        "est_completion_date": est_completion_date,
        "status": status,
        "insights": insights
    }


def chat_about_savings_goal(user_id: int, goal_id: int, message: str) -> str:
    # Get goal details
    analysis = analyze_savings_goal(user_id, goal_id)
    if "error" in analysis:
        return "Sorry, I couldn't find the goal you're asking about."
        
    goal_name = analysis["name"]
    target = analysis["target_amount"]
    current = analysis["current_amount"]
    deadline = analysis["deadline"]
    months_remaining = analysis["months_remaining"]
    req_savings = analysis["required_monthly_savings"]
    curr_savings = analysis["current_monthly_savings"]
    shortfall = analysis["monthly_shortfall"]
    est_completion = analysis["est_completion_date"]
    status = analysis["status"]
    
    # Get recent spending categories for detailed advice
    recent_spending = query_db(
        "SELECT category, SUM(amount) as total FROM expenses WHERE user_id = ? AND date >= ? GROUP BY category ORDER BY total DESC LIMIT 3",
        (user_id, (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"))
    )
    spending_summary = ", ".join([f"{r['category']} (₹{r['total']:.0f})" for r in recent_spending]) if recent_spending else "No recent expenses"

    if HAS_GEMINI:
        try:
            model = genai.GenerativeModel("gemini-3.1-flash-lite")
            prompt = (
                "You are an expert personal financial advisor and goal planner.\n"
                f"The user is asking a question about their savings goal '{goal_name}'.\n"
                f"Here is the context of their goal and financial state:\n"
                f"- Goal Details: Target ₹{target:,.2f}, Current Saved ₹{current:,.2f}, Target Deadline: {deadline} ({months_remaining:.1f} months left)\n"
                f"- Required Monthly Savings: ₹{req_savings:,.2f}/month\n"
                f"- User's Current Net Monthly Savings: ₹{curr_savings:,.2f}/month (based on recent transactions)\n"
                f"- Feasibility Status: {status} (Monthly shortfall: ₹{shortfall:,.2f}/month, Projected completion: {est_completion})\n"
                f"- Top recent monthly spending categories: {spending_summary}\n\n"
                f"User's Question: '{message}'\n\n"
                "Formulate a helpful, friendly, and highly specific answer. "
                "Be mathematically accurate. If they ask about changing the deadline (e.g. achieving it 6 months earlier), "
                "calculate the new monthly savings rate required and compare it to their current savings behavior. "
                "Suggest specific ways to adjust their budget (referencing their top spending categories if relevant). "
                "Use Rupee (₹) symbols and keep the response relatively concise (2-3 paragraphs)."
            )
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            pass
            
    # Rule-based fallback
    msg = message.lower()
    if "earlier" in msg or "faster" in msg or "speed" in msg:
        if curr_savings <= 0:
            return (
                f"To reach your goal '{goal_name}' faster, you need to establish a consistent savings rate first. "
                f"Currently, your monthly net savings is ₹0. To save ₹{req_savings:,.0f} monthly, consider reducing "
                f"discretionary spending on {spending_summary} or finding an additional income stream."
            )
        
        earlier_months = max(1.0, months_remaining - 3)
        new_req = (target - current) / earlier_months
        increase = new_req - curr_savings
        
        return (
            f"If you want to achieve your goal '{goal_name}' earlier (for instance, 3 months ahead of schedule), "
            f"your required monthly savings would increase from ₹{req_savings:,.0f} to ₹{new_req:,.0f}. "
            f"This requires saving an additional ₹{increase:,.0f} per month compared to your current savings behavior. "
            f"You could achieve this by trimming down your top spending areas: {spending_summary}."
        )
    elif "how" in msg or "what" in msg or "shortfall" in msg:
        if shortfall > 0:
            return (
                f"You currently have a monthly shortfall of ₹{shortfall:,.0f} for your goal '{goal_name}'. "
                f"To reach this goal on time, you must increase your monthly savings rate to ₹{req_savings:,.0f}. "
                f"Consider setting explicit budget caps in the 'Budget' tab for categories like dining out or shopping, "
                f"or depositing any external windfalls directly into this goal."
            )
        else:
            return (
                f"Your goal '{goal_name}' is currently On Track! You are saving ₹{curr_savings:,.0f} monthly which "
                f"exceeds the required ₹{req_savings:,.0f}. To ensure you reach it, consider automating a monthly "
                f"transfer of ₹{req_savings:,.0f} to a separate account so you aren't tempted to spend it."
            )
    else:
        return (
            f"For your goal '{goal_name}', you have saved ₹{current:,.0f} of the target ₹{target:,.0f} ({(current/target*100):.0f}%). "
            f"To achieve it by {deadline}, you need to save ₹{req_savings:,.0f} monthly. "
            f"Your current savings behavior is ₹{curr_savings:,.0f}/month, making you {status.lower()}."
        )

