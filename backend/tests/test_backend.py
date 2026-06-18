import os
import sys
import pytest
from datetime import datetime, timedelta

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database
import auth
import ai_features
import reports

# Use a test database file
TEST_DB = os.path.join(os.path.dirname(__file__), "test_finance.db")

@pytest.fixture(autouse=True)
def setup_test_db():
    # Override DB_PATH in modules to use test DB
    database.DB_PATH = TEST_DB
    ai_features.DB_PATH = TEST_DB
    reports.DB_PATH = TEST_DB
    
    # Initialize DB
    database.init_db()
    
    yield
    
    # Cleanup DB after test
    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except PermissionError:
            pass

def test_user_creation_and_auth():
    # Test hashing
    pwd = "secretpassword"
    hashed = auth.get_password_hash(pwd)
    assert auth.verify_password(pwd, hashed)
    assert not auth.verify_password("wrongpassword", hashed)
    
    # Test token creation
    token = auth.create_access_token({"sub": "testuser", "id": 1})
    assert token is not None

def test_database_crud():
    conn = database.get_db()
    cursor = conn.cursor()
    
    # Create user
    cursor.execute("INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)", ("alice", "hash", "alice@example.com"))
    user_id = cursor.lastrowid
    assert user_id > 0
    
    # Add income
    cursor.execute(
        "INSERT INTO income (user_id, amount, source, date, description) VALUES (?, ?, ?, ?, ?)",
        (user_id, 10000.0, "Salary", "2026-06-01", "Monthly wage")
    )
    income_id = cursor.lastrowid
    assert income_id > 0
    
    # Add expense
    cursor.execute(
        "INSERT INTO expenses (user_id, amount, category, date, description) VALUES (?, ?, ?, ?, ?)",
        (user_id, 2000.0, "Food", "2026-06-02", "Grocery store")
    )
    expense_id = cursor.lastrowid
    assert expense_id > 0
    
    # Check retrieval
    cursor.execute("SELECT SUM(amount) as total FROM income WHERE user_id = ?", (user_id,))
    assert cursor.fetchone()["total"] == 10000.0
    
    cursor.execute("SELECT SUM(amount) as total FROM expenses WHERE user_id = ?", (user_id,))
    assert cursor.fetchone()["total"] == 2000.0
    
    conn.commit()
    conn.close()

def test_financial_health_score():
    conn = database.get_db()
    cursor = conn.cursor()
    
    # Create user
    cursor.execute("INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)", ("bob", "hash", "bob@example.com"))
    user_id = cursor.lastrowid
    
    # Insert incomes (Total 50,000)
    cursor.execute("INSERT INTO income (user_id, amount, source, date, description) VALUES (?, 50000.0, 'Salary', ?, '')", (user_id, datetime.now().strftime("%Y-%m-%d")))
    
    # Insert expenses (Total 30,000) -> 60% expense ratio, 40% savings ratio
    cursor.execute("INSERT INTO expenses (user_id, amount, category, date, description) VALUES (?, 10000.0, 'Food', ?, '')", (user_id, datetime.now().strftime("%Y-%m-%d")))
    cursor.execute("INSERT INTO expenses (user_id, amount, category, date, description) VALUES (?, 20000.0, 'Rent', ?, '')", (user_id, datetime.now().strftime("%Y-%m-%d")))
    
    # Set budgets
    current_month = datetime.now().strftime("%Y-%m")
    cursor.execute("INSERT INTO budgets (user_id, category, limit_amount, month) VALUES (?, 'Food', 12000.0, ?)", (user_id, current_month))
    cursor.execute("INSERT INTO budgets (user_id, category, limit_amount, month) VALUES (?, 'Rent', 22000.0, ?)", (user_id, current_month))
    
    conn.commit()
    conn.close()
    
    # Calculate health score
    health = ai_features.calculate_financial_health_score(user_id)
    assert health["score"] > 50  # Should be high due to good savings ratio and compliant budgets
    assert health["ratios"]["savings_ratio"] == 0.40
    assert health["ratios"]["expense_ratio"] == 0.60
    assert health["ratios"]["budget_discipline"] == 1.0  # 100% compliant

def test_prediction_models():
    conn = database.get_db()
    cursor = conn.cursor()
    
    cursor.execute("INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)", ("charlie", "hash", "charlie@example.com"))
    user_id = cursor.lastrowid
    
    # Add daily expenses for the past 15 days to test ML models
    base_date = datetime.now() - timedelta(days=15)
    for i in range(15):
        date_str = (base_date + timedelta(days=i)).strftime("%Y-%m-%d")
        cursor.execute(
            "INSERT INTO expenses (user_id, amount, category, date, description) VALUES (?, ?, 'Food', ?, '')",
            (user_id, 500.0 + (i * 20.0), date_str)  # Linear increase
        )
    
    conn.commit()
    conn.close()
    
    # Run predictions
    predictions = ai_features.predict_next_month_expenses(user_id)
    assert "linear_regression" in predictions
    assert "random_forest" in predictions
    assert "xgboost" in predictions
    assert predictions["status"] == "Success"
    assert predictions["linear_regression"] > 0


def test_recurring_expenses():
    conn = database.get_db()
    cursor = conn.cursor()
    
    cursor.execute("INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)", ("david", "hash", "david@example.com"))
    user_id = cursor.lastrowid
    
    # Insert a daily recurring expense starting 2 days ago
    two_days_ago = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    cursor.execute(
        """
        INSERT INTO recurring_expenses (user_id, title, amount, category, frequency, start_date, is_active)
        VALUES (?, 'Netflix Daily Mock', 100.0, 'Entertainment', 'Daily', ?, 1)
        """,
        (user_id, two_days_ago)
    )
    conn.commit()
    conn.close()
    
    # Process it
    ai_features.process_recurring_expenses(user_id)
    
    # Verify three expenses were created: two days ago, yesterday, and today
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM expenses WHERE user_id = ? ORDER BY date ASC", (user_id,))
    expenses = cursor.fetchall()
    assert len(expenses) == 3
    assert expenses[0]["amount"] == 100.0
    assert expenses[0]["category"] == "Entertainment"
    
    # Verify recurring_expenses last_processed_date is set to today
    cursor.execute("SELECT last_processed_date FROM recurring_expenses WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    assert row["last_processed_date"] == datetime.now().strftime("%Y-%m-%d")
    conn.close()

def test_spending_personality():
    conn = database.get_db()
    cursor = conn.cursor()
    
    cursor.execute("INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)", ("eve", "hash", "eve@example.com"))
    user_id = cursor.lastrowid
    
    # Set high expenses relative to income (impulsive buyer profile)
    cursor.execute("INSERT INTO income (user_id, amount, source, date, description) VALUES (?, 1000.0, 'Freelance', ?, '')", (user_id, datetime.now().strftime("%Y-%m-%d")))
    cursor.execute("INSERT INTO expenses (user_id, amount, category, date, description) VALUES (?, 900.0, 'Shopping', ?, '')", (user_id, datetime.now().strftime("%Y-%m-%d")))
    conn.commit()
    conn.close()
    
    personality_data = ai_features.get_spending_personality(user_id)
    assert personality_data["personality"] in ["Impulsive Buyer", "Undetermined", "Saver", "Balanced Spender"]

def test_download_report():
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)", ("frank", "hash", "frank@example.com"))
    user_id = cursor.lastrowid
    
    cursor.execute("INSERT INTO income (user_id, amount, source, date, description) VALUES (?, 5000.0, 'Salary', ?, '')", (user_id, datetime.now().strftime("%Y-%m-%d")))
    cursor.execute("INSERT INTO expenses (user_id, amount, category, date, description) VALUES (?, 2000.0, 'Food', ?, '')", (user_id, datetime.now().strftime("%Y-%m-%d")))
    conn.commit()
    conn.close()
    
    report_data = reports.generate_report_content(user_id)
    assert "html" in report_data
    assert "text" in report_data
    assert "Monthly Financial Summary" in report_data["html"]
    assert "Category spending breakdown" in report_data["html"]
    assert "frank@example.com" in report_data["html"] or "frank" in report_data["html"]

