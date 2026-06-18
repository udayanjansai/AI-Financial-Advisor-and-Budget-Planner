import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from database import get_db
from ai_features import calculate_financial_health_score, query_db

MOCK_EMAIL_DIR = os.path.join(os.path.dirname(__file__), "mock_emails")

# Ensure mock email directory exists
os.makedirs(MOCK_EMAIL_DIR, exist_ok=True)

def generate_report_content(user_id: int) -> dict:
    now = datetime.now()
    month_name = now.strftime("%B %Y")
    current_month_str = now.strftime("%Y-%m")
    
    # Calculate health score and financial summary
    health = calculate_financial_health_score(user_id)
    
    # Fetch user details, category breakdown and budgets
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT username, email FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    
    # Category breakdown
    cursor.execute("""
        SELECT category, SUM(amount) as total 
        FROM expenses 
        WHERE user_id = ? AND substr(date, 1, 7) = ?
        GROUP BY category
        ORDER BY total DESC
    """, (user_id, current_month_str))
    categories = cursor.fetchall()
    
    # Budgets
    cursor.execute("""
        SELECT category, limit_amount 
        FROM budgets 
        WHERE user_id = ? AND month = ?
    """, (user_id, current_month_str))
    budgets = {b["category"]: b["limit_amount"] for b in cursor.fetchall()}
    
    conn.close()
    
    username = user["username"] if user else "User"
    email = user["email"] if user else "no-reply@finance.com"
    
    savings = max(0.0, health["total_income"] - health["total_expense"])
    
    # Compile Alerts
    alerts = []
    if health["total_expense"] > health["total_income"]:
        alerts.append("Warning: Your total expenses this month have exceeded your total income! Consider cutting back on discretionary spending.")
    for cat_row in categories:
        cat_name = cat_row["category"]
        cat_spent = cat_row["total"]
        if cat_name in budgets:
            limit = budgets[cat_name]
            if cat_spent > limit:
                alerts.append(f"Budget Alert: You have exceeded your budget for '{cat_name}' (Limit: ₹{limit:,.2f}, Spent: ₹{cat_spent:,.2f})!")
                
    alert_banner_html = ""
    if alerts:
        alert_items = "".join([f"<div style='background-color: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; padding: 12px; margin-bottom: 8px; border-radius: 6px; font-weight: bold;'>⚠️ {a}</div>" for a in alerts])
        alert_banner_html = f"<div style='margin: 20px 0;'>{alert_items}</div>"
        
    alert_banner_text = ""
    if alerts:
        alert_banner_text = "\nALERTS:\n" + "\n".join([f"⚠️ {a}" for a in alerts]) + "\n"
        
    # Generate spending recommendations
    recommendations = []
    for w in health["weaknesses"]:
        recommendations.append(f"• {w}")
    if not recommendations:
        recommendations.append("• Keep maintaining your excellent budget compliance.")
        recommendations.append("• Consider increasing your savings target by 5% next month.")
        
    # Category table rows
    category_rows_html = ""
    for cat_row in categories:
        cat_name = cat_row["category"]
        cat_spent = cat_row["total"]
        limit_text = f"₹{budgets[cat_name]:,.2f}" if cat_name in budgets else "No Limit"
        status_color = "#ef4444" if (cat_name in budgets and cat_spent > budgets[cat_name]) else "#374151"
        category_rows_html += f"""
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">{cat_name}</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right; color: {status_color}; font-weight: bold;">₹{cat_spent:,.2f}</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right; color: #6b7280;">{limit_text}</td>
          </tr>
        """
    if not categories:
        category_rows_html = """
          <tr>
            <td colspan="3" style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: #6b7280;">No expenses recorded this month.</td>
          </tr>
        """
        
    category_rows_text = ""
    for cat_row in categories:
        cat_name = cat_row["category"]
        cat_spent = cat_row["total"]
        limit_text = f"/ ₹{budgets[cat_name]:,.2f}" if cat_name in budgets else "(no limit)"
        category_rows_text += f"- {cat_name}: ₹{cat_spent:,.2f} {limit_text}\n"
    if not categories:
        category_rows_text = "No expenses recorded this month.\n"
        
    html = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #4f46e5; text-align: center; border-bottom: 2px solid #eeebff; padding-bottom: 15px;">Monthly Financial Summary - {month_name}</h2>
        <p>Hello <strong>{username}</strong>,</p>
        <p>Here is your personalized AI budget report and financial health assessment.</p>
        
        {alert_banner_html}
        
        <h3 style="color: #1f2937; border-bottom: 1px solid #f3f4f6; padding-bottom: 5px;">Cash Flow Summary</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <tr style="background-color: #f9fafb;">
            <th style="text-align: left; padding: 10px; border: 1px solid #e5e7eb;">Metric</th>
            <th style="text-align: right; padding: 10px; border: 1px solid #e5e7eb;">Value</th>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Income</strong></td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right; color: #10b981;"><strong>₹{health["total_income"]:,.2f}</strong></td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Expenses</strong></td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right; color: #ef4444;"><strong>₹{health["total_expense"]:,.2f}</strong></td>
          </tr>
          <tr style="background-color: #f3f4f6;">
            <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Savings</strong></td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right; color: #4f46e5;"><strong>₹{savings:,.2f}</strong></td>
          </tr>
        </table>
        
        <h3 style="color: #1f2937; border-bottom: 1px solid #f3f4f6; padding-bottom: 5px;">Category spending breakdown</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <tr style="background-color: #f9fafb;">
            <th style="text-align: left; padding: 10px; border: 1px solid #e5e7eb;">Category</th>
            <th style="text-align: right; padding: 10px; border: 1px solid #e5e7eb;">Spent</th>
            <th style="text-align: right; padding: 10px; border: 1px solid #e5e7eb;">Budget Limit</th>
          </tr>
          {category_rows_html}
        </table>
        
        <div style="background-color: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 6px; padding: 15px; margin: 20px 0; text-align: center;">
          <h3 style="margin: 0; color: #6d28d9;">Financial Health Score</h3>
          <span style="font-size: 36px; font-weight: bold; color: #4f46e5;">{health["score"]}/100</span>
        </div>
        
        <h3 style="color: #1f2937; border-bottom: 1px solid #f3f4f6; padding-bottom: 5px;">Strengths</h3>
        <ul style="color: #065f46; padding-left: 20px;">
          {"".join([f"<li>{s}</li>" for s in health["strengths"]])}
        </ul>
        
        <h3 style="color: #1f2937; border-bottom: 1px solid #f3f4f6; padding-bottom: 5px;">Recommendations</h3>
        <ul style="color: #991b1b; padding-left: 20px;">
          {"".join([f"<li>{r}</li>" for r in recommendations])}
        </ul>
        
        <p style="font-size: 12px; color: #6b7280; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
          Sent by FinTracker AI Financial Advisor. Modify your email settings under Profile > Settings.
        </p>
      </body>
    </html>
    """
    
    text = f"""
    Monthly Financial Summary - {month_name}
    -------------------------------------------
    Hello {username},
    
    Here is your personalized AI budget report and financial health assessment.
    {alert_banner_text}
    CASH FLOW SUMMARY:
    - Income:   ₹{health["total_income"]:,.2f}
    - Expenses: ₹{health["total_expense"]:,.2f}
    - Savings:  ₹{savings:,.2f}
    
    CATEGORY SPENDING BREAKDOWN:
    {category_rows_text}
    Financial Health Score: {health["score"]}/100
    
    Strengths:
    {chr(10).join(['- ' + s for s in health["strengths"]])}
    
    Recommendations:
    {chr(10).join(['- ' + r for r in recommendations])}
    
    Regards,
    FinTracker AI Team
    """
    
    return {"html": html, "text": text, "email": email, "username": username}

def send_monthly_report_email(user_id: int) -> dict:
    report = generate_report_content(user_id)
    
    # SMTP details (Optionally override via env variables)
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = os.environ.get("SMTP_PORT", "587")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASSWORD")
    
    if smtp_host and smtp_user and smtp_pass:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"Your Monthly Financial Report - {datetime.now().strftime('%B %Y')}"
            msg["From"] = smtp_user
            msg["To"] = report["email"]
            
            part1 = MIMEText(report["text"], "plain")
            part2 = MIMEText(report["html"], "html")
            
            msg.attach(part1)
            msg.attach(part2)
            
            with smtplib.SMTP(smtp_host, int(smtp_port)) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_user, report["email"], msg.as_string())
                
            return {"status": "success", "method": "SMTP Email Sent", "to": report["email"]}
        except Exception as e:
            # Fall back to logging on error
            pass
            
    # Mock fallback writing to folder
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join(MOCK_EMAIL_DIR, f"report_{user_id}_{timestamp}.html")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(report["html"])
        
    return {
        "status": "success", 
        "method": f"Mock Saved to Local Directory: {os.path.basename(filepath)}", 
        "to": report["email"],
        "filepath": filepath
    }
