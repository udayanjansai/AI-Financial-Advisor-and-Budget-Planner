import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  TrendingDown, 
  TrendingUp, 
  Wallet, 
  Milestone, 
  Sparkles, 
  Scan,
  Settings as SettingsIcon, 
  LogOut, 
  User,
  Activity,
  Repeat,
  Eye,
  EyeOff
} from "lucide-react";

// Import custom components
import Dashboard from "./components/Dashboard";
import Expenses from "./components/Expenses";
import Income from "./components/Income";
import Budget from "./components/Budget";
import Goals from "./components/Goals";
import Chatbot from "./components/Chatbot";
import OCRScanner from "./components/OCRScanner";
import RecurringExpenses from "./components/RecurringExpenses";

// A premium 6-digit OTP verification component
function OtpInput({ value, onChange }) {
  const digits = value.split("");
  const otpArray = Array(6).fill("").map((_, i) => digits[i] || "");

  const handleInput = (index, val) => {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const newArr = [...otpArray];
      newArr[index] = "";
      onChange(newArr.join(""));
      return;
    }
    const char = clean.slice(-1);
    const newArr = [...otpArray];
    newArr[index] = char;
    onChange(newArr.join(""));

    // Auto-focus next input
    if (index < 5 && char) {
      const nextEl = document.getElementById(`otp-digit-${index + 1}`);
      if (nextEl) nextEl.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      const newArr = [...otpArray];
      if (!newArr[index] && index > 0) {
        newArr[index - 1] = "";
        onChange(newArr.join(""));
        const prevEl = document.getElementById(`otp-digit-${index - 1}`);
        if (prevEl) prevEl.focus();
      } else {
        newArr[index] = "";
        onChange(newArr.join(""));
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length > 0) {
      onChange(pasted);
      const focusIndex = Math.min(pasted.length - 1, 5);
      const nextEl = document.getElementById(`otp-digit-${focusIndex}`);
      if (nextEl) nextEl.focus();
    }
  };

  return (
    <div className="otp-digits-container">
      {otpArray.map((digit, idx) => (
        <input
          key={idx}
          id={`otp-digit-${idx}`}
          type="text"
          maxLength={1}
          value={digit}
          onChange={(e) => handleInput(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          className="otp-digit-field"
          required
        />
      ))}
    </div>
  );
}

export default function App() {
  const googleAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true";
  const usernamePattern = "^[A-Za-z][A-Za-z0-9_]{2,29}$";
  const passwordPattern = "^(?=.*[A-Za-z])(?=.*\\d).{8,}$";
  const emailPattern = "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$";
  const registrationRules = {
    username: "Username must start with a letter and use 3-30 letters, numbers, or underscores only.",
    password: "Password must be at least 8 characters and include both letters and numbers.",
    email: "Enter a valid email address, for example name@example.com."
  };
  const pageMeta = {
    dashboard: { title: "Dashboard", subtitle: "Live financial overview and spending intelligence" },
    expenses: { title: "Expenses", subtitle: "Track daily spend and manage outgoing transactions" },
    recurring: { title: "Recurring Expenses", subtitle: "Automate scheduled payments and subscriptions" },
    income: { title: "Income", subtitle: "Record salary, freelance, and other money inflows" },
    budget: { title: "Budget Planner", subtitle: "Set limits and monitor category discipline" },
    goals: { title: "Financial Goals", subtitle: "Plan target savings with AI-backed progress checks" },
    ocr: { title: "Receipt Scanner", subtitle: "Extract transaction details from receipt images" },
    chatbot: { title: "AI Advisor", subtitle: "Ask finance questions using your own data" },
    settings: { title: "Settings", subtitle: "Manage alerts and reporting preferences" }
  };
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isLoginView, setIsLoginView] = useState(true);
  
  // Auth Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [authError, setAuthError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // New OTP / 2FA / Forgot Password States
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSuccessMessage, setOtpSuccessMessage] = useState("");
  const [loginOtpRequired, setLoginOtpRequired] = useState(false);
  const [loginOtpEmail, setLoginOtpEmail] = useState("");
  const [isForgotPasswordView, setIsForgotPasswordView] = useState(false);

  // Settings State
  const [settings, setSettings] = useState({ email_reports_enabled: true, alert_threshold: 0.90, two_factor_enabled: true });
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Global expense alert state
  const [expenseAlert, setExpenseAlert] = useState(null);

  // Global data version state for real-time dashboard / component refreshes
  const [dataVersion, setDataVersion] = useState(0);
  const triggerRefresh = () => setDataVersion(v => v + 1);

  const resetAuthState = () => {
    setAuthError("");
    setOtp("");
    setOtpSent(false);
    setOtpLoading(false);
    setOtpSuccessMessage("");
    setLoginOtpRequired(false);
    setLoginOtpEmail("");
    setIsForgotPasswordView(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleToken = params.get("google_token");
    const googleError = params.get("auth_error");

    if (googleToken) {
      localStorage.setItem("token", googleToken);
      setToken(googleToken);
      setAuthError("");
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (googleError) {
      setAuthError(googleError);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchUser();
      fetchSettings();
    } else {
      setUser(null);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setUser(await res.json());
      } else {
        handleLogout();
      }
    } catch (err) {
      console.error(err);
      handleLogout();
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSettings(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRequestRegisterOtp = async () => {
    setAuthError("");
    setOtpSuccessMessage("");
    if (!email || !new RegExp(emailPattern).test(email)) {
      setAuthError("Please enter a valid email address first.");
      return;
    }
    setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        setOtpSent(true);
        setOtpSuccessMessage("OTP sent successfully to your email!");
      } else {
        setAuthError(data.detail || "Failed to send OTP");
      }
    } catch (err) {
      setAuthError("Could not connect to server");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyLoginOtp = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch("/api/auth/verify-login-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, otp })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("token", data.access_token);
        setToken(data.access_token);
        resetAuthState();
        setUsername("");
        setPassword("");
        setEmail("");
      } else {
        setAuthError(data.detail || "Verification failed");
      }
    } catch (err) {
      setAuthError("Could not connect to verification server");
    }
  };

  const handleForgotPasswordRequest = async (e) => {
    e.preventDefault();
    setAuthError("");
    setOtpSuccessMessage("");
    setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        setOtpSent(true);
        setOtpSuccessMessage("Password reset OTP sent to your email!");
      } else {
        setAuthError(data.detail || "Failed to request password reset OTP");
      }
    } catch (err) {
      setAuthError("Could not connect to server");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setOtpSuccessMessage("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, new_password: password })
      });
      const data = await res.json();
      if (res.ok) {
        setIsForgotPasswordView(false);
        setIsLoginView(true);
        setOtpSent(false);
        setOtp("");
        setPassword("");
        setOtpSuccessMessage("Password reset successfully! Please sign in with your new password.");
      } else {
        setAuthError(data.detail || "Failed to reset password");
      }
    } catch (err) {
      setAuthError("Could not connect to server");
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setOtpSuccessMessage("");
    
    if (isLoginView) {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
          if (data.status === "otp_required") {
            setLoginOtpRequired(true);
            setLoginOtpEmail(data.email);
            setOtpSuccessMessage("Verification code sent to your email!");
          } else {
            localStorage.setItem("token", data.access_token);
            setToken(data.access_token);
            setUsername("");
            setPassword("");
            setEmail("");
          }
        } else {
          setAuthError(data.detail || "Incorrect username or password");
        }
      } catch (err) {
        setAuthError("Could not connect to authentication server");
      }
    } else {
      // Registration Flow
      if (!new RegExp(usernamePattern).test(username)) {
        setAuthError(registrationRules.username);
        return;
      }
      if (!new RegExp(passwordPattern).test(password)) {
        setAuthError(registrationRules.password);
        return;
      }
      if (!new RegExp(emailPattern).test(email)) {
        setAuthError(registrationRules.email);
        return;
      }
      if (!otpSent) {
        setAuthError("Please request and enter the OTP sent to your email to complete registration.");
        return;
      }
      if (!otp || otp.length !== 6) {
        setAuthError("Please enter the 6-digit OTP code.");
        return;
      }
      
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, email, otp })
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem("token", data.access_token);
          setToken(data.access_token);
          resetAuthState();
          setUsername("");
          setPassword("");
          setEmail("");
        } else {
          setAuthError(data.detail || "Registration failed");
        }
      } catch (err) {
        setAuthError("Could not connect to authentication server");
      }
    }
  };

  const handleGoogleAuth = () => {
    setAuthError("");
    window.location.href = "/api/auth/google/login";
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
    setActiveTab("dashboard");
    resetAuthState();
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddExpenseAlert = (alert) => {
    setExpenseAlert(alert);
    triggerRefresh();
    setActiveTab("expenses"); // Redirect to expenses tab so they see it added!
    // Clear alert after 8 seconds
    setTimeout(() => {
      setExpenseAlert(null);
    }, 8000);
  };

  const currentPage = pageMeta[activeTab] || pageMeta.dashboard;
  // Auth View Render
  if (!token || !user) {
    if (loginOtpRequired) {
      return (
        <div className="auth-wrapper">
          <div className="glass-card auth-card">
            <div className="auth-header">
              <div style={{ display: "inline-flex", width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, var(--primary), #a855f7)", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", fontSize: "22px", boxShadow: "0 0 20px rgba(99, 102, 241, 0.4)", marginBottom: "16px" }}>
                🔑
              </div>
              <h1 style={{ color: "white", fontSize: "24px" }}>2FA Verification</h1>
              <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "4px" }}>
                A login verification code was sent to <strong style={{ color: "white" }}>{loginOtpEmail}</strong>
              </p>
            </div>

            <form onSubmit={handleVerifyLoginOtp}>
              <div className="form-group">
                <label>Enter 6-Digit OTP</label>
                <OtpInput value={otp} onChange={setOtp} />
              </div>

              {otpSuccessMessage && (
                <div style={{ color: "var(--success)", fontSize: "14px", margin: "10px 0", textAlign: "center" }}>
                  {otpSuccessMessage}
                </div>
              )}

              {authError && (
                <div style={{ color: "var(--danger)", fontSize: "14px", margin: "10px 0", textAlign: "center" }}>
                  {authError}
                </div>
              )}

              <button type="submit" className="btn" style={{ width: "100%", marginTop: "14px" }}>
                Verify & Login
              </button>

              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ width: "100%", marginTop: "10px", background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.08)" }}
                onClick={resetAuthState}
              >
                Back to Login
              </button>
            </form>
          </div>
        </div>
      );
    }

    if (isForgotPasswordView) {
      return (
        <div className="auth-wrapper">
          <div className="glass-card auth-card">
            <div className="auth-header">
              <div style={{ display: "inline-flex", width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, var(--primary), #a855f7)", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", fontSize: "22px", boxShadow: "0 0 20px rgba(99, 102, 241, 0.4)", marginBottom: "16px" }}>
                🔒
              </div>
              <h1 style={{ color: "white", fontSize: "24px" }}>Reset Password</h1>
              <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "4px" }}>
                {!otpSent ? "Enter your email to request a reset code" : "Verify the OTP and set your new password"}
              </p>
            </div>

            {!otpSent ? (
              <form onSubmit={handleForgotPasswordRequest}>
                <div className="form-group">
                  <label>Email Address</label>
                  <input 
                    type="email" 
                    className="form-control" 
                    placeholder="e.g. bob@example.com" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                  />
                </div>

                {authError && (
                  <div style={{ color: "var(--danger)", fontSize: "14px", margin: "10px 0", textAlign: "center" }}>
                    {authError}
                  </div>
                )}

                <button type="submit" className="btn" style={{ width: "100%", marginTop: "14px" }} disabled={otpLoading}>
                  {otpLoading ? "Sending OTP..." : "Send Reset OTP"}
                </button>

                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ width: "100%", marginTop: "10px", background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.08)" }}
                  onClick={resetAuthState}
                >
                  Back to Login
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPasswordSubmit}>
                <div style={{ background: "rgba(20, 184, 166, 0.05)", border: "1px solid rgba(20, 184, 166, 0.15)", borderRadius: "8px", padding: "10px", marginBottom: "16px", fontSize: "13px", color: "var(--text-muted)", textAlign: "center" }}>
                  Reset OTP sent to <strong style={{ color: "white" }}>{email}</strong>
                </div>

                <div className="form-group">
                  <label>Enter 6-Digit OTP</label>
                  <OtpInput value={otp} onChange={setOtp} />
                </div>

                <div className="form-group">
                  <label>New Password</label>
                  <div style={{ position: "relative" }}>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      className="form-control" 
                      style={{ width: "100%", paddingRight: "44px" }}
                      placeholder="Min 8 chars, 1 letter, 1 number" 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      pattern={passwordPattern}
                      title={registrationRules.password}
                      required 
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: "absolute",
                        right: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "4px"
                      }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {authError && (
                  <div style={{ color: "var(--danger)", fontSize: "14px", margin: "10px 0", textAlign: "center" }}>
                    {authError}
                  </div>
                )}

                <button type="submit" className="btn" style={{ width: "100%", marginTop: "14px" }}>
                  Reset Password
                </button>

                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ width: "100%", marginTop: "10px", background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.08)" }}
                  onClick={resetAuthState}
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="auth-wrapper">
        <div className="glass-card auth-card">
          <div className="auth-header">
            <div style={{ display: "inline-flex", width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, var(--primary), #a855f7)", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", fontSize: "22px", boxShadow: "0 0 20px rgba(99, 102, 241, 0.4)", marginBottom: "16px" }}>
              F
            </div>
            <h1 style={{ color: "white", fontSize: "24px" }}>FinTracker AI</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "4px" }}>
              {isLoginView ? "Sign in to access your budget planner" : "Create an account to get started"}
            </p>
          </div>

          {otpSuccessMessage && (
            <div style={{ color: "var(--success)", fontSize: "14px", margin: "10px 0", textAlign: "center" }}>
              {otpSuccessMessage}
            </div>
          )}

          <form onSubmit={handleAuthSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. investor_bob" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                pattern={isLoginView ? undefined : usernamePattern}
                minLength={isLoginView ? undefined : 3}
                maxLength={isLoginView ? undefined : 30}
                title={isLoginView ? undefined : registrationRules.username}
                required 
              />
              {!isLoginView && (
                <small style={{ color: "var(--text-dim)", fontSize: "12px" }}>
                  Start with a letter. Use letters, numbers, and underscores only.
                </small>
              )}
            </div>
            
            {!isLoginView && (
              <div className="form-group">
                <label>Email Address</label>
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
                  <input 
                    type="email" 
                    className="form-control" 
                    placeholder="e.g. bob@example.com" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    pattern={emailPattern}
                    title={registrationRules.email}
                    required 
                    style={{ flex: 1 }}
                  />
                  <button 
                    type="button" 
                    className="btn" 
                    style={{ height: "42px", whiteSpace: "nowrap", padding: "0 16px", minWidth: "110px", fontSize: "13px" }}
                    onClick={handleRequestRegisterOtp} 
                    disabled={otpLoading}
                  >
                    {otpLoading ? "Sending..." : otpSent ? "Resend OTP" : "Send OTP"}
                  </button>
                </div>
              </div>
            )}

            {!isLoginView && otpSent && (
              <div className="form-group">
                <label>Enter Registration OTP</label>
                <OtpInput value={otp} onChange={setOtp} />
              </div>
            )}

            <div className="form-group">
              <label>Password</label>
              <div style={{ position: "relative" }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  className="form-control" 
                  style={{ width: "100%", paddingRight: "44px" }}
                  placeholder="••••••••" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  pattern={isLoginView ? undefined : passwordPattern}
                  minLength={isLoginView ? undefined : 8}
                  title={isLoginView ? undefined : registrationRules.password}
                  required 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px"
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {!isLoginView && (
                <small style={{ color: "var(--text-dim)", fontSize: "12px" }}>
                  Use at least 8 characters with one letter and one number.
                </small>
              )}
              {isLoginView && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                  <span className="auth-link" style={{ fontSize: "12px", color: "var(--primary)" }} onClick={() => { resetAuthState(); setIsForgotPasswordView(true); }}>
                    Forgot Password?
                  </span>
                </div>
              )}
            </div>

            {authError && (
              <div style={{ color: "var(--danger)", fontSize: "14px", margin: "10px 0", textAlign: "center" }}>
                {authError}
              </div>
            )}

            <button type="submit" className="btn" style={{ width: "100%", marginTop: "14px" }}>
              {isLoginView ? "Sign In" : "Register Account"}
            </button>
          </form>

          {googleAuthEnabled && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "22px 0 16px" }}>
                <span style={{ height: "1px", flex: 1, background: "rgba(255,255,255,0.08)" }} />
                <span style={{ color: "var(--text-dim)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px" }}>or</span>
                <span style={{ height: "1px", flex: 1, background: "rgba(255,255,255,0.08)" }} />
              </div>

              <button
                type="button"
                onClick={handleGoogleAuth}
                className="btn btn-secondary"
                style={{ width: "100%", background: "rgba(255,255,255,0.96)", color: "#1f2937" }}
              >
                <span style={{ width: "20px", height: "20px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#4285f4", fontWeight: "800", fontFamily: "Arial, sans-serif" }}>G</span>
                {isLoginView ? "Sign in with Google" : "Sign up with Google"}
              </button>
            </>
          )}

          <div className="auth-footer">
            {isLoginView ? (
              <span>
                Don't have an account?{" "}
                <span className="auth-link" onClick={() => { resetAuthState(); setIsLoginView(false); }}>
                  Register here
                </span>
              </span>
            ) : (
              <span>
                Already have an account?{" "}
                <span className="auth-link" onClick={() => { resetAuthState(); setIsLoginView(true); }}>
                  Log in here
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Settings Sub-Page Content
  const renderSettingsPage = () => (
    <div>
      <div>
        <h1 style={{ fontSize: "32px", color: "white" }}>Settings</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Manage multi-user notifications and alert preferences</p>
      </div>

      <div className="glass-card" style={{ maxWidth: "600px", marginTop: "24px" }}>
        <h2 style={{ fontSize: "20px", color: "white", marginBottom: "20px" }}>Preferences</h2>
        
        <form onSubmit={handleSaveSettings}>
          <div className="form-group" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "16px" }}>
            <div>
              <label style={{ fontSize: "15px", color: "white", fontWeight: "600" }}>Monthly Email Reports</label>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>Receive monthly financial summary and saving suggestions automatically.</p>
            </div>
            <input 
              type="checkbox" 
              style={{ width: "20px", height: "20px", cursor: "pointer" }} 
              checked={settings.email_reports_enabled}
              onChange={(e) => setSettings(prev => ({ ...prev, email_reports_enabled: e.target.checked }))}
            />
          </div>

          <div className="form-group" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "16px", marginTop: "16px" }}>
            <div>
              <label style={{ fontSize: "15px", color: "white", fontWeight: "600" }}>Two-Factor Authentication (2FA)</label>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>Require a one-time verification code sent to your email to log in.</p>
            </div>
            <input 
              type="checkbox" 
              style={{ width: "20px", height: "20px", cursor: "pointer" }} 
              checked={settings.two_factor_enabled}
              onChange={(e) => setSettings(prev => ({ ...prev, two_factor_enabled: e.target.checked }))}
            />
          </div>

          <div className="form-group" style={{ marginTop: "16px" }}>
            <label style={{ fontSize: "15px", color: "white", fontWeight: "600" }}>Overspending Alert Threshold</label>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px", marginBottom: "8px" }}>
              Notify me when category spending exceeds: <strong>{(settings.alert_threshold * 100).toFixed(0)}%</strong> of the monthly budget.
            </p>
            <input 
              type="range" 
              min="0.5" 
              max="1.0" 
              step="0.05"
              style={{ width: "100%", cursor: "pointer" }}
              value={settings.alert_threshold}
              onChange={(e) => setSettings(prev => ({ ...prev, alert_threshold: parseFloat(e.target.value) }))}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          {settingsSaved && (
            <div style={{ color: "var(--success)", fontSize: "14px", marginTop: "14px", fontWeight: "600" }}>
              Settings saved successfully!
            </div>
          )}

          <button type="submit" className="btn" style={{ marginTop: "20px", width: "150px" }}>
            Save Settings
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <div className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-icon">
              <Sparkles size={20} style={{ color: "white" }} />
            </div>
            <div>
              <div className="brand-name">FinTracker AI</div>
              <div className="brand-tagline">Plan. Track. Grow.</div>
            </div>
          </div>

          <div className="user-badge" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "10px 12px", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
              <div className="user-avatar">{user.username[0].toUpperCase()}</div>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "white", textOverflow: "ellipsis", overflow: "hidden" }}>{user.username}</div>
                <div style={{ fontSize: "9px", color: "var(--text-muted)", textOverflow: "ellipsis", overflow: "hidden" }}>{user.email}</div>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)", color: "var(--text-dim)", cursor: "pointer", padding: "6px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", transition: "var(--transition-smooth)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"; }}
              title="Log Out"
            >
              <LogOut size={13} />
            </button>
          </div>

          <ul className="menu-list">
            <li 
              className={`menu-item ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              <LayoutDashboard size={18} /> Dashboard
            </li>
            <li 
              className={`menu-item ${activeTab === "expenses" ? "active" : ""}`}
              onClick={() => setActiveTab("expenses")}
            >
              <TrendingDown size={18} /> Expenses
            </li>
            <li 
              className={`menu-item ${activeTab === "recurring" ? "active" : ""}`}
              onClick={() => setActiveTab("recurring")}
            >
              <Repeat size={18} /> Recurring Expenses
            </li>
            <li 
              className={`menu-item ${activeTab === "income" ? "active" : ""}`}
              onClick={() => setActiveTab("income")}
            >
              <TrendingUp size={18} /> Income
            </li>
            <li 
              className={`menu-item ${activeTab === "budget" ? "active" : ""}`}
              onClick={() => setActiveTab("budget")}
            >
              <Wallet size={18} /> Budget
            </li>
            <li 
              className={`menu-item ${activeTab === "goals" ? "active" : ""}`}
              onClick={() => setActiveTab("goals")}
            >
              <Milestone size={18} /> Goals
            </li>
            <li 
              className={`menu-item ${activeTab === "ocr" ? "active" : ""}`}
              onClick={() => setActiveTab("ocr")}
            >
              <Scan size={18} /> Receipt Scanner
            </li>
            <li 
              className={`menu-item ${activeTab === "chatbot" ? "active" : ""}`}
              onClick={() => setActiveTab("chatbot")}
            >
              <Sparkles size={18} /> AI Advisor
            </li>
            <li 
              className={`menu-item ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <SettingsIcon size={18} /> Settings
            </li>
          </ul>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="main-content">
        <div className="workspace-shell">
          <div className="workspace-header">
            <div>
              <div className="workspace-eyebrow">Workspace</div>
              <h1>{currentPage.title}</h1>
              <p>{currentPage.subtitle}</p>
            </div>
            <div className="workspace-user">
              <div className="workspace-avatar">{user.username[0].toUpperCase()}</div>
              <div>
                <strong>{user.username}</strong>
                <span>{user.email}</span>
              </div>
            </div>
          </div>

          <div className="workspace-body">
            {activeTab === "dashboard" && (
              <Dashboard token={token} activeAlert={expenseAlert} dataVersion={dataVersion} />
            )}
            {activeTab === "expenses" && (
              <Expenses token={token} onAddExpense={handleAddExpenseAlert} dataVersion={dataVersion} triggerRefresh={triggerRefresh} />
            )}
            {activeTab === "recurring" && (
              <RecurringExpenses token={token} dataVersion={dataVersion} triggerRefresh={triggerRefresh} />
            )}
            {activeTab === "income" && (
              <Income token={token} dataVersion={dataVersion} triggerRefresh={triggerRefresh} />
            )}
            {activeTab === "budget" && (
              <Budget token={token} onAddExpense={handleAddExpenseAlert} dataVersion={dataVersion} triggerRefresh={triggerRefresh} />
            )}
            {activeTab === "goals" && (
              <Goals token={token} dataVersion={dataVersion} triggerRefresh={triggerRefresh} />
            )}
            {activeTab === "ocr" && (
              <OCRScanner token={token} onAddExpense={handleAddExpenseAlert} triggerRefresh={triggerRefresh} />
            )}
            {activeTab === "chatbot" && (
              <Chatbot token={token} />
            )}
            {activeTab === "settings" && renderSettingsPage()}
          </div>
        </div>
      </div>
    </div>
  );
}
