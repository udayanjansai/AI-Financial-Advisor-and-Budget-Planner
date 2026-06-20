from pydantic import BaseModel, Field
from typing import Optional, List

# Auth schemas
class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    email: str
    otp: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None

# Income schemas
class IncomeCreate(BaseModel):
    amount: float = Field(..., gt=0)
    source: str
    date: str  # YYYY-MM-DD
    description: Optional[str] = ""

class IncomeResponse(IncomeCreate):
    id: int
    user_id: int

# Expense schemas
class ExpenseCreate(BaseModel):
    amount: float = Field(..., gt=0)
    category: str
    date: str  # YYYY-MM-DD
    description: Optional[str] = ""

class ExpenseResponse(ExpenseCreate):
    id: int
    user_id: int

# Budget schemas
class BudgetCreate(BaseModel):
    category: str
    limit_amount: float = Field(..., gt=0)
    month: str  # YYYY-MM

class BudgetResponse(BudgetCreate):
    id: int
    user_id: int

# Settings schemas
class SettingsUpdate(BaseModel):
    email_reports_enabled: bool
    alert_threshold: float = Field(..., gt=0, le=1)
    two_factor_enabled: bool = True

class SettingsResponse(SettingsUpdate):
    user_id: int

# Chat schemas
class ChatQuery(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

# Goal schemas
class GoalCreate(BaseModel):
    name: str
    target_amount: float = Field(..., gt=0)
    current_amount: Optional[float] = 0.0
    deadline: str  # YYYY-MM-DD

class GoalResponse(GoalCreate):
    id: int
    user_id: int

class GoalAddMoney(BaseModel):
    amount: float = Field(..., gt=0)

# Recurring Expense schemas
class RecurringExpenseCreate(BaseModel):
    title: str
    amount: float = Field(..., gt=0)
    category: str
    frequency: str  # Daily/Weekly/Monthly/Yearly
    start_date: str  # YYYY-MM-DD
    end_date: Optional[str] = None  # YYYY-MM-DD
    is_active: Optional[bool] = True

class RecurringExpenseResponse(RecurringExpenseCreate):
    id: int
    user_id: int
    last_processed_date: Optional[str] = None

class SpendingPersonalityResponse(BaseModel):
    personality: str
    description: str
    recommendations: List[str]


class GoalAnalysisResponse(BaseModel):
    goal_id: int
    name: str
    target_amount: float
    current_amount: float
    deadline: str
    months_remaining: float
    required_monthly_savings: float
    current_monthly_savings: float
    monthly_shortfall: float
    total_shortfall: float
    est_completion_date: str
    status: str
    insights: List[str]

class GoalChatRequest(BaseModel):
    message: str

class GoalChatResponse(BaseModel):
    response: str


# New OTP and Reset Password schemas
class OTPRequest(BaseModel):
    email: str

class LoginResponse(BaseModel):
    status: str
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    email: Optional[str] = None

class VerifyLoginOTPRequest(BaseModel):
    username: str
    otp: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str = Field(..., min_length=6)


