import os
import sys
import sqlite3
import requests
import json

DB_PATH = os.path.join(os.path.dirname(__file__), "finance.db")

# Detect environment: pytest forces SQLite to avoid tampering with production DBs
IS_TESTING = "pytest" in sys.modules or "unittest" in sys.modules

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
IS_SUPABASE = not IS_TESTING and SUPABASE_URL is not None and SUPABASE_URL != "" and SUPABASE_KEY is not None and SUPABASE_KEY != ""

class SupabaseDatabaseError(Exception):
    pass

# Map generic DatabaseError depending on active driver
if IS_SUPABASE:
    DatabaseError = SupabaseDatabaseError
else:
    DatabaseError = sqlite3.Error

class SupabaseCursor:
    def __init__(self, url, key):
        self.url = url
        self.key = key
        self._lastrowid = None
        self._results = []
        self._index = 0

    @property
    def lastrowid(self):
        return self._lastrowid

    def execute(self, query, params=None):
        # 1. Standardize query replacements
        query = query.replace("strftime('%Y-%m', date)", "substr(date, 1, 7)")
        
        # 2. Format parameters directly into query for raw SQL execution
        if params:
            formatted_params = []
            for p in params:
                if p is None:
                    formatted_params.append("NULL")
                elif isinstance(p, (int, float)):
                    formatted_params.append(str(p))
                elif isinstance(p, bool):
                    formatted_params.append("TRUE" if p else "FALSE")
                else:
                    escaped = str(p).replace("'", "''")
                    formatted_params.append(f"'{escaped}'")
            
            standardized = query.replace("?", "%s")
            parts = standardized.split("%s")
            if len(parts) - 1 == len(formatted_params):
                new_query = ""
                for idx, part in enumerate(parts[:-1]):
                    new_query += part + formatted_params[idx]
                new_query += parts[-1]
                query = new_query

        # 3. Handle lastrowid via RETURNING id for PostgreSQL inserts
        is_insert = query.strip().upper().startswith("INSERT")
        if is_insert and "RETURNING" not in query.upper():
            query += " RETURNING id"

        # 4. Trigger Supabase stored procedure (exec_sql) via HTTP RPC
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json"
        }
        payload = {"query_text": query}
        rpc_url = f"{self.url.rstrip('/')}/rest/v1/rpc/exec_sql"

        try:
            response = requests.post(rpc_url, headers=headers, json=payload)
            if response.status_code != 200:
                raise SupabaseDatabaseError(f"Supabase RPC SQL error: {response.text}")
        except Exception as e:
            if isinstance(e, SupabaseDatabaseError):
                raise e
            raise SupabaseDatabaseError(f"Network error communicating with Supabase: {str(e)}")

        res_data = response.json()

        # Parse results
        if isinstance(res_data, list):
            self._results = res_data
        elif isinstance(res_data, dict):
            if "status" in res_data:
                self._results = []
            elif "affected_rows" in res_data:
                self._results = []
            else:
                self._results = [res_data]
        else:
            self._results = []

        self._index = 0

        # Extract lastrowid if applicable
        if is_insert and self._results:
            row = self._results[0]
            if isinstance(row, dict):
                self._lastrowid = row.get("id")
            elif hasattr(row, "keys"):
                self._lastrowid = row["id"]
            else:
                self._lastrowid = row[0]

    def fetchone(self):
        if self._index < len(self._results):
            row = self._results[self._index]
            self._index += 1
            return row
        return None

    def fetchall(self):
        rows = self._results[self._index:]
        self._index = len(self._results)
        return rows

    def close(self):
        pass

    def __iter__(self):
        return iter(self._results)


class SupabaseDBConnection:
    def __init__(self, url, key):
        self.url = url
        self.key = key

    def cursor(self):
        return SupabaseCursor(self.url, self.key)

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


class CompatibleCursor:
    def __init__(self, cursor):
        self.cursor = cursor
        self._lastrowid = None

    @property
    def lastrowid(self):
        return self._lastrowid

    def execute(self, query, params=None):
        query = query.replace("%s", "?")
        query = query.replace("to_char(date::date, 'YYYY-MM')", "strftime('%Y-%m', date)")
        
        if params is not None:
            self.cursor.execute(query, params)
        else:
            self.cursor.execute(query)
        self._lastrowid = self.cursor.lastrowid

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is not None:
            return dict(row)
        return row

    def fetchall(self):
        rows = self.cursor.fetchall()
        if rows is not None:
            return [dict(r) for r in rows]
        return rows

    def __getattr__(self, name):
        return getattr(self.cursor, name)

    def __iter__(self):
        return iter(self.cursor)


class CompatibleConnection:
    def __init__(self, conn):
        self.conn = conn

    def cursor(self, *args, **kwargs):
        cursor = self.conn.cursor(*args, **kwargs)
        return CompatibleCursor(cursor)

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()

    def __getattr__(self, name):
        return getattr(self.conn, name)


def get_db():
    if IS_SUPABASE:
        return SupabaseDBConnection(SUPABASE_URL, SUPABASE_KEY)
    else:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        return CompatibleConnection(conn)


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    if IS_SUPABASE:
        # PostgreSQL schema creation logic for Supabase
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            google_id VARCHAR(255) UNIQUE,
            auth_provider VARCHAR(50) DEFAULT 'password',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) DEFAULT 'password';")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS income (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount DOUBLE PRECISION NOT NULL,
            source VARCHAR(255) NOT NULL,
            date VARCHAR(10) NOT NULL,
            description TEXT
        );
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount DOUBLE PRECISION NOT NULL,
            category VARCHAR(255) NOT NULL,
            date VARCHAR(10) NOT NULL,
            description TEXT
        );
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            category VARCHAR(255) NOT NULL,
            limit_amount DOUBLE PRECISION NOT NULL,
            month VARCHAR(7) NOT NULL,
            UNIQUE(user_id, category, month)
        );
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            email_reports_enabled INTEGER DEFAULT 1,
            alert_threshold DOUBLE PRECISION DEFAULT 0.90,
            two_factor_enabled INTEGER DEFAULT 1
        );
        """)
        
        try:
            cursor.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS two_factor_enabled INTEGER DEFAULT 1;")
        except Exception:
            pass
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS goals (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            target_amount DOUBLE PRECISION NOT NULL,
            current_amount DOUBLE PRECISION DEFAULT 0.0,
            deadline VARCHAR(10) NOT NULL
        );
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS recurring_expenses (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            amount DOUBLE PRECISION NOT NULL,
            category VARCHAR(255) NOT NULL,
            frequency VARCHAR(50) NOT NULL,
            start_date VARCHAR(10) NOT NULL,
            end_date VARCHAR(10),
            is_active INTEGER DEFAULT 1,
            last_processed_date VARCHAR(10)
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS pending_otps (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            otp VARCHAR(6) NOT NULL,
            otp_type VARCHAR(50) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            UNIQUE(email, otp_type)
        );
        """)
    else:
        # SQLite schema creation logic
        cursor.execute("PRAGMA foreign_keys = ON;")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT NOT NULL,
            google_id TEXT UNIQUE,
            auth_provider TEXT DEFAULT 'password',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        cursor.execute("PRAGMA table_info(users);")
        user_columns = {row["name"] for row in cursor.fetchall()}
        if "google_id" not in user_columns:
            cursor.execute("ALTER TABLE users ADD COLUMN google_id TEXT;")
        if "auth_provider" not in user_columns:
            cursor.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'password';")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS income (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            source TEXT NOT NULL,
            date TEXT NOT NULL,
            description TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            date TEXT NOT NULL,
            description TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            limit_amount REAL NOT NULL,
            month TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, category, month)
        );
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            email_reports_enabled INTEGER DEFAULT 1,
            alert_threshold REAL DEFAULT 0.90,
            two_factor_enabled INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)
        
        try:
            cursor.execute("ALTER TABLE settings ADD COLUMN two_factor_enabled INTEGER DEFAULT 1;")
        except Exception:
            pass
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            target_amount REAL NOT NULL,
            current_amount REAL DEFAULT 0.0,
            deadline TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS recurring_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            frequency TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT,
            is_active INTEGER DEFAULT 1,
            last_processed_date TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS pending_otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            otp_type TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            UNIQUE(email, otp_type)
        );
        """)
        
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
