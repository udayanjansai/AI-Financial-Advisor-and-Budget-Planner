import React, { useState, useEffect } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  ArcElement, 
  Title, 
  Tooltip, 
  Legend 
} from "chart.js";
import { 
  TrendingUp, 
  TrendingDown, 
  PiggyBank, 
  ShieldAlert, 
  Activity, 
  Sparkles, 
  Brain,
  Calendar,
  Save,
  Plus
} from "lucide-react";

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export default function Dashboard({ token, activeAlert, dataVersion }) {
  const [data, setData] = useState(null);
  const [heatmapData, setHeatmapData] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [predData, setPredData] = useState(null);
  const [predLoading, setPredLoading] = useState(false);
  const [personality, setPersonality] = useState(null);
  const [personalityLoading, setPersonalityLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Modal for heatmap details
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDayDetails, setSelectedDayDetails] = useState({ totalSpent: 0, categoryBreakdown: {}, transactions: [] });
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Heatmap View State
  const [heatmapMonth, setHeatmapMonth] = useState(new Date().getMonth());
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());

  const getDateKey = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value.slice(0, 10);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const getMoneyValue = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getTransactionTitle = (tx) => {
    const description = tx.description?.trim();
    if (description) return description;
    if (tx.type === "expense") return tx.category || "Expense";
    return tx.source || "Income";
  };

  useEffect(() => {
    fetchDashboardData();
    fetchHeatmapData();
    fetchPersonality();
  }, [token, dataVersion]);

  // Sync heatmap view to the month and year of the latest transaction when data updates
  useEffect(() => {
    if (heatmapData && heatmapData.length > 0) {
      const sorted = [...heatmapData].sort((a, b) => b.date.localeCompare(a.date));
      if (sorted.length > 0) {
        const latest = new Date(sorted[0].date);
        setHeatmapMonth(latest.getMonth());
        setHeatmapYear(latest.getFullYear());
      }
    }
  }, [heatmapData]);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch(`/api/analytics/dashboard?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHeatmapData = async () => {
    try {
      const [expensesRes, incomeRes] = await Promise.all([
        fetch(`/api/expenses?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`/api/income?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!expensesRes.ok || !incomeRes.ok) return;

      const [expenses, incomes] = await Promise.all([
        expensesRes.json(),
        incomeRes.json()
      ]);

      const byDate = {};

      expenses.forEach(expense => {
        const dateKey = getDateKey(expense.date);
        if (!dateKey) return;
        const totals = byDate[dateKey] || { date: dateKey, expense_amount: 0, income_amount: 0, transaction_count: 0 };
        totals.expense_amount += getMoneyValue(expense.amount);
        totals.transaction_count += 1;
        byDate[dateKey] = totals;
      });

      incomes.forEach(income => {
        const dateKey = getDateKey(income.date);
        if (!dateKey) return;
        const totals = byDate[dateKey] || { date: dateKey, expense_amount: 0, income_amount: 0, transaction_count: 0 };
        totals.income_amount += getMoneyValue(income.amount);
        totals.transaction_count += 1;
        byDate[dateKey] = totals;
      });

      setHeatmapData(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));
    } catch (err) {
      console.error(err);
      try {
        const res = await fetch(`/api/analytics/heatmap?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          setHeatmapData(await res.json());
        }
      } catch (fallbackErr) {
        console.error(fallbackErr);
      }
    }
  };

  const fetchAiAnalysis = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/analyze", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setAiAnalysis(json.analysis);
      }
    } catch (err) {
      setAiAnalysis("Error loaded analysis. Verify network connectivity.");
    } finally {
      setAiLoading(false);
    }
  };

  const fetchPredictions = async () => {
    setPredLoading(true);
    try {
      const res = await fetch("/api/ai/predict", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setPredData(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPredLoading(false);
    }
  };

  const fetchPersonality = async () => {
    setPersonalityLoading(true);
    try {
      const res = await fetch(`/api/ai/personality?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setPersonality(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPersonalityLoading(false);
    }
  };

  const handleDateClick = async (dateStr, spentAmount) => {
    setSelectedDate(dateStr);
    setDetailsLoading(true);
    setSelectedDayDetails({ totalSpent: spentAmount, categoryBreakdown: {}, transactions: [] });
    
    try {
      const expensesRes = await fetch("/api/expenses", {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const incomeRes = await fetch("/api/income", {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (expensesRes.ok && incomeRes.ok) {
        const allExpenses = await expensesRes.json();
        const allIncome = await incomeRes.json();
        
        const dayExpenses = allExpenses.filter(e => getDateKey(e.date) === dateStr);
        const dayIncome = allIncome.filter(i => getDateKey(i.date) === dateStr);
        const totalSpent = dayExpenses.reduce((sum, e) => sum + getMoneyValue(e.amount), 0);
        
        const breakdown = {};
        dayExpenses.forEach(e => {
          breakdown[e.category] = (breakdown[e.category] || 0) + getMoneyValue(e.amount);
        });
        
        const txs = [
          ...dayExpenses.map(e => ({ ...e, type: "expense" })),
          ...dayIncome.map(i => ({ ...i, type: "income" }))
        ];
        
        setSelectedDayDetails({
          totalSpent,
          categoryBreakdown: breakdown,
          transactions: txs
        });
      }
    } catch (err) {
      console.error("Error loading day details", err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const triggerDownloadReport = async () => {
    try {
      const res = await fetch(`/api/reports/download?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const html = await res.text();
        const blob = new Blob([html], { type: "text/html" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `financial_report_${new Date().toISOString().split("T")[0]}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert("Failed to generate report download.");
      }
    } catch (err) {
      console.error(err);
      alert("Error downloading report.");
    }
  };

  if (loading || !data) {
    return <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "80px 0" }}>Loading financial dashboard...</div>;
  }

  const { monthly_summary, categories: catSpend, budgets, alerts, health_score, strengths, weaknesses } = data;

  // Chart 1: Income vs Expense (Bar Chart)
  const barChartData = {
    labels: ["Income", "Expense", "Savings"],
    datasets: [
      {
        label: "Amount (₹)",
        data: [monthly_summary.income, monthly_summary.expenses, monthly_summary.savings],
        backgroundColor: [
          "rgba(16, 185, 129, 0.45)", // Success Green
          "rgba(239, 68, 68, 0.45)",  // Danger Red
          "rgba(52, 211, 153, 0.35)"  // Savings Green
        ],
        borderColor: [
          "var(--success)",
          "var(--danger)",
          "var(--success)"
        ],
        borderWidth: 1.5,
        borderRadius: 8,
      }
    ]
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `₹${context.raw.toLocaleString()}`
        }
      }
    },
    scales: {
      y: {
        grid: { color: "rgba(255, 255, 255, 0.05)" },
        ticks: { color: "#9ca3af" }
      },
      x: {
        grid: { display: false },
        ticks: { color: "#9ca3af" }
      }
    }
  };

  // Chart 2: Category Spending Breakdown (Doughnut Chart)
  const doughnutChartData = {
    labels: catSpend.map(c => c.category),
    datasets: [
      {
        data: catSpend.map(c => c.total),
        backgroundColor: [
          "rgba(99, 102, 241, 0.5)",
          "rgba(168, 85, 247, 0.5)",
          "rgba(236, 72, 153, 0.5)",
          "rgba(245, 158, 11, 0.5)",
          "rgba(16, 185, 129, 0.5)",
          "rgba(6, 182, 212, 0.5)",
          "rgba(107, 114, 128, 0.5)"
        ],
        borderColor: [
          "#6366f1", "#a855f7", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#6b7280"
        ],
        borderWidth: 1,
      }
    ]
  };

  const doughnutChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right",
        labels: { color: "#9ca3af", font: { family: "Plus Jakarta Sans", size: 11 } }
      },
      tooltip: {
        callbacks: {
          label: (context) => ` ₹${context.raw.toLocaleString()}`
        }
      }
    }
  };

  // Heatmap generation
  const renderHeatmap = () => {
    // Compile heatmap values by date
    const dateMap = {};
    heatmapData.forEach(d => {
      const dateKey = getDateKey(d.date);
      if (!dateKey) return;
      const existing = dateMap[dateKey] || { expenseAmount: 0, incomeAmount: 0, transactionCount: 0 };
      dateMap[dateKey] = {
        expenseAmount: existing.expenseAmount + getMoneyValue(d.expense_amount ?? d.amount ?? d.total),
        incomeAmount: existing.incomeAmount + getMoneyValue(d.income_amount),
        transactionCount: existing.transactionCount + getMoneyValue(d.transaction_count ?? d.count)
      };
    });

    const cells = [];
    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    
    // Start of the selected month
    const firstOfMonth = new Date(heatmapYear, heatmapMonth, 1);
    
    // Adjust to starting Monday of the calendar grid
    const startDay = firstOfMonth.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const diffToMonday = startDay === 0 ? 6 : startDay - 1;
    
    const startDate = new Date(firstOfMonth);
    startDate.setDate(firstOfMonth.getDate() - diffToMonday);

    // 42 cells (6 rows * 7 days) ensures any month calendar fits perfectly
    const totalCells = 42; 

    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(startDate);
      cellDate.setDate(startDate.getDate() + i);
      
      // Timezone-safe YYYY-MM-DD formatting
      const yyyy = cellDate.getFullYear();
      const mm = String(cellDate.getMonth() + 1).padStart(2, "0");
      const dd = String(cellDate.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      const dayTotals = dateMap[dateStr] || { expenseAmount: 0, incomeAmount: 0, transactionCount: 0 };
      const spent = dayTotals.expenseAmount;
      const earned = dayTotals.incomeAmount;
      const hasTransactions = dayTotals.transactionCount > 0 || spent > 0 || earned > 0;
      const isCurrentMonth = cellDate.getMonth() === heatmapMonth;
      
      // Calculate color opacity based on spending intensity
      let colorClass = "rgba(255, 255, 255, 0.02)";
      let textColor = isCurrentMonth ? "var(--text-muted)" : "rgba(255, 255, 255, 0.08)";
      let borderColor = isCurrentMonth ? "rgba(255, 255, 255, 0.03)" : "transparent";
      
      if (spent > 0) {
        textColor = "#ffffff";
        if (spent < 500) colorClass = "rgba(251, 113, 133, 0.16)";
        else if (spent < 1500) colorClass = "rgba(251, 113, 133, 0.34)";
        else if (spent < 4000) colorClass = "rgba(244, 63, 94, 0.58)";
        else colorClass = "rgba(225, 29, 72, 0.86)";
        if (earned > 0) borderColor = "rgba(16, 185, 129, 0.75)";
      } else if (hasTransactions) {
        textColor = "#ffffff";
        colorClass = "rgba(16, 185, 129, 0.22)";
        borderColor = "rgba(16, 185, 129, 0.55)";
      }

      cells.push(
        <div 
          key={dateStr}
          className="heatmap-cell"
          style={{ 
            background: colorClass, 
            color: textColor, 
            cursor: "pointer",
            border: `1px solid ${borderColor}`
          }}
          title={`${dateStr}: spent ₹${spent.toLocaleString()}, income ₹${earned.toLocaleString()}`}
          onClick={() => handleDateClick(dateStr, spent)}
        >
          {cellDate.getDate()}
        </div>
      );
    }

    return (
      <div>
        {/* Month and Year selectors */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
          <select 
            value={heatmapMonth} 
            onChange={(e) => setHeatmapMonth(parseInt(e.target.value))}
            style={{ 
              background: "rgba(255, 255, 255, 0.05)", 
              border: "1px solid rgba(255, 255, 255, 0.1)", 
              color: "white", 
              padding: "6px 12px", 
              borderRadius: "8px", 
              cursor: "pointer", 
              fontFamily: "inherit",
              outline: "none"
            }}
          >
            {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, idx) => (
              <option key={m} value={idx} style={{ background: "#0d0a21", color: "white" }}>{m}</option>
            ))}
          </select>
          
          <select 
            value={heatmapYear} 
            onChange={(e) => setHeatmapYear(parseInt(e.target.value))}
            style={{ 
              background: "rgba(255, 255, 255, 0.05)", 
              border: "1px solid rgba(255, 255, 255, 0.1)", 
              color: "white", 
              padding: "6px 12px", 
              borderRadius: "8px", 
              cursor: "pointer", 
              fontFamily: "inherit",
              outline: "none"
            }}
          >
            {Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - 11 + i).map(yr => (
              <option key={yr} value={yr} style={{ background: "#0d0a21", color: "white" }}>{yr}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "12px", marginBottom: "8px" }}>
          {weekdays.map(d => <span key={d} style={{ width: "calc(100% / 7)", textAlign: "center" }}>{d}</span>)}
        </div>
        <div className="heatmap-grid">
          {cells}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-dim)", marginTop: "12px" }}>
          <span>Low</span>
          <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "rgba(255, 255, 255, 0.02)" }} />
          <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "rgba(251, 113, 133, 0.16)" }} />
          <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "rgba(244, 63, 94, 0.58)" }} />
          <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "rgba(225, 29, 72, 0.86)" }} />
          <span>High</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontSize: "32px", color: "white" }}>Financial Dashboard</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Welcome back! Here's your financial overview.</p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button className="btn btn-secondary" onClick={triggerDownloadReport}>
            Download Report
          </button>
        </div>
      </div>

      {/* Active Alerts */}
      {(activeAlert || alerts.length > 0 || monthly_summary.expenses > monthly_summary.income) && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
          {activeAlert && (
            <div className={`alert-bar alert-${activeAlert.type}`}>
              <ShieldAlert size={18} />
              <span>{activeAlert.message}</span>
            </div>
          )}
          {monthly_summary.expenses > monthly_summary.income && (
            <div className="alert-bar alert-danger">
              <ShieldAlert size={18} />
              <span><strong>Overspending Alert:</strong> Monthly expenses (₹{monthly_summary.expenses.toLocaleString()}) have exceeded monthly income (₹{monthly_summary.income.toLocaleString()}).</span>
            </div>
          )}
          {alerts.map((al, idx) => (
            <div key={idx} className={`alert-bar alert-${al.alert_type}`}>
              <ShieldAlert size={18} />
              <span>{al.message} ({al.percentage}% used of ₹{al.limit.toLocaleString()} limit)</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="summary-cards-container">
        <div className="glass-card summary-card">
          <div className="summary-icon-wrapper" style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--success)" }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>Total Income</span>
            <div className="summary-val" style={{ color: "var(--success)" }}>₹{monthly_summary.income.toLocaleString()}</div>
          </div>
        </div>

        <div className="glass-card summary-card">
          <div className="summary-icon-wrapper" style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--danger)" }}>
            <TrendingDown size={24} />
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>Total Expenses</span>
            <div className="summary-val" style={{ color: "var(--danger)" }}>₹{monthly_summary.expenses.toLocaleString()}</div>
          </div>
        </div>

        <div className="glass-card summary-card">
          <div className="summary-icon-wrapper" style={{ background: "rgba(52, 211, 153, 0.12)", color: "var(--success)" }}>
            <PiggyBank size={24} />
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>Total Savings</span>
            <div className="summary-val" style={{ color: "var(--success)" }}>₹{monthly_summary.savings.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="dashboard-grid">
        
        {/* Left Columns (Charts & Budgets) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          
          {/* Charts Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>
            <div className="glass-card" style={{ height: "300px", display: "flex", flexDirection: "column" }}>
              <h3 style={{ fontSize: "18px", color: "white", marginBottom: "16px" }}>Cash Flow Breakdown</h3>
              <div style={{ flex: 1, position: "relative" }}>
                <Bar data={barChartData} options={barChartOptions} />
              </div>
            </div>

            <div className="glass-card" style={{ height: "300px", display: "flex", flexDirection: "column" }}>
              <h3 style={{ fontSize: "18px", color: "white", marginBottom: "16px" }}>Spending by Category</h3>
              <div style={{ flex: 1, position: "relative" }}>
                {catSpend.length > 0 ? (
                  <Doughnut data={doughnutChartData} options={doughnutChartOptions} />
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}>
                    No expenses logged this month
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Budget Utilizations */}
          <div className="glass-card">
            <h3 style={{ fontSize: "18px", color: "white", marginBottom: "20px" }}>Monthly Budget Tracking</h3>
            
            {budgets.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No budgets defined for this month. Set budgets using the panel on the right.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {budgets.map((b) => {
                  const spentObj = catSpend.find(c => c.category === b.category);
                  const spent = spentObj ? spentObj.total : 0.0;
                  const ratio = Math.min(1.0, spent / b.limit_amount);
                  const pct = (spent / b.limit_amount) * 100;
                  
                  // Color based on status
                  const color = pct > 100 ? "var(--danger)" : pct > 85 ? "var(--warning)" : "var(--primary)";
                  
                  return (
                    <div key={b.category}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: "600", color: "white" }}>{b.category}</span>
                        <span style={{ color: "var(--text-muted)" }}>
                          ₹{spent.toLocaleString()} / ₹{b.limit_amount.toLocaleString()} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="progress-bar-bg">
                        <div 
                          className="progress-bar-fill"
                          style={{ width: `${ratio * 100}%`, background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Spending Heatmap */}
          <div className="glass-card">
            <h3 style={{ fontSize: "18px", color: "white", display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <Calendar size={18} style={{ color: "var(--primary)" }} /> Daily Spending Heatmap
            </h3>
            {renderHeatmap()}
          </div>

        </div>

        {/* Right Columns (AI analyzer & health score) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          
          {/* AI Spending Personality */}
          <div className="glass-card">
            <h3 style={{ fontSize: "18px", color: "white", display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Brain size={18} style={{ color: "var(--ai)" }} /> AI Spending Personality
            </h3>
            {personalityLoading ? (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px 0" }}>Analyzing personality...</div>
            ) : personality ? (
              <div>
                <div style={{ display: "inline-block", background: "linear-gradient(135deg, #a855f7, #6366f1)", padding: "6px 14px", borderRadius: "12px", color: "white", fontWeight: "700", fontSize: "14px", marginBottom: "12px", boxShadow: "0 0 15px rgba(168, 85, 247, 0.4)" }}>
                  {personality.personality}
                </div>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: "1.6", marginBottom: "16px" }}>
                  {personality.description}
                </p>
                {personality.recommendations && personality.recommendations.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: "12px", color: "white", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Recommendations</h4>
                    <ul style={{ paddingLeft: "16px", color: "var(--text-dim)", fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {personality.recommendations.map((rec, index) => (
                        <li key={index} style={{ lineHeight: "1.5" }}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "12px" }}>No personality data available.</p>
              </div>
            )}
          </div>

          {/* Financial Health Score */}
          <div className="glass-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", textContent: "center", textAlign: "center" }}>
            <h3 style={{ fontSize: "18px", color: "white", display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px", width: "100%", textAlign: "left" }}>
              <Activity size={18} style={{ color: "var(--success)" }} /> Financial Health Score
            </h3>
            
            <div style={{
              width: "120px",
              height: "120px",
              borderRadius: "50%",
              background: `conic-gradient(var(--primary) ${health_score}%, rgba(255,255,255,0.05) ${health_score}%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              marginBottom: "20px"
            }}>
              <div style={{
                width: "104px",
                height: "104px",
                borderRadius: "50%",
                background: "#0d0a21",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center"
              }}>
                <span style={{ fontSize: "32px", fontWeight: "700", color: "white" }}>{health_score}</span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}> wellness score </span>
              </div>
            </div>

            <div style={{ width: "100%", textAlign: "left" }}>
              <h4 style={{ fontSize: "14px", color: "white", marginBottom: "8px" }}>Strengths / Weaknesses</h4>
              <ul style={{ listStyle: "none", fontSize: "13px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {strengths && strengths.map((s, idx) => (
                  <li key={`str-${idx}`} style={{ color: "#a7f3d0" }}>✓ {s}</li>
                ))}
                {weaknesses && weaknesses.filter(w => w !== "None detected! Keep maintaining this structure.").map((w, idx) => (
                  <li key={`wk-${idx}`} style={{ color: "#fca5a5" }}>✗ {w}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* AI Spending Analyzer */}
          <div className="glass-card">
            <h3 style={{ fontSize: "18px", color: "white", display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Brain size={18} style={{ color: "var(--ai)" }} /> AI Spending Analyzer
            </h3>
            
            {aiAnalysis ? (
              <div style={{ fontSize: "14px", color: "var(--text-muted)", whiteSpace: "pre-line", lineHeight: "1.6" }}>
                {aiAnalysis}
                <button className="btn btn-secondary" onClick={fetchAiAnalysis} style={{ width: "100%", marginTop: "14px" }}>
                  Recalculate Insights
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>Generate custom AI suggestions to reduce spending.</p>
                <button className="btn" onClick={fetchAiAnalysis} disabled={aiLoading} style={{ width: "100%" }}>
                  {aiLoading ? "Analyzing..." : "Analyze Spending Pattern"}
                </button>
              </div>
            )}
          </div>

          {/* Future Expense Predictions */}
          <div className="glass-card">
            <h3 style={{ fontSize: "18px", color: "white", display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Sparkles size={18} style={{ color: "var(--ai)" }} /> Future Expense Prediction
            </h3>
            
            {predData ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "6px" }}>
                  <span>Linear Regression:</span>
                  <span style={{ fontWeight: "700", color: "white" }}>₹{predData.linear_regression.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "6px" }}>
                  <span>Random Forest:</span>
                  <span style={{ fontWeight: "700", color: "white" }}>₹{predData.random_forest.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "6px" }}>
                  <span>XGBoost Model:</span>
                  <span style={{ fontWeight: "700", color: "white" }}>₹{predData.xgboost.toLocaleString()}</span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "6px" }}>Status: {predData.status}</span>
                
                <button className="btn btn-secondary" onClick={fetchPredictions} style={{ width: "100%", marginTop: "10px" }}>
                  Re-train Models
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>Train ML algorithms to forecast next month's total expenses.</p>
                <button className="btn btn-ai" onClick={fetchPredictions} disabled={predLoading} style={{ width: "100%" }}>
                  {predLoading ? "Training..." : "Forecast Next Month"}
                </button>
              </div>
            )}
          </div>



        </div>

      </div>

      {/* Heatmap Cell Date Details Modal */}
      {selectedDate && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(10, 6, 27, 0.75)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }}>
          <div className="glass-card" style={{
            maxWidth: "500px",
            width: "100%",
            padding: "24px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            position: "relative"
          }}>
            <button 
              onClick={() => setSelectedDate(null)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "transparent",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                fontSize: "18px"
              }}
            >
              ✕
            </button>
            
            <h3 style={{ fontSize: "20px", color: "white", marginBottom: "8px" }}>Transactions for {selectedDate}</h3>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "20px" }}>
              Total Spending Today: <strong style={{ color: "white", fontSize: "16px" }}>₹{selectedDayDetails.totalSpent.toLocaleString()}</strong>
            </p>
            
            {detailsLoading ? (
              <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>Loading details...</div>
            ) : (
              <div>
                {Object.keys(selectedDayDetails.categoryBreakdown).length > 0 && (
                  <div style={{ marginBottom: "20px", background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <h4 style={{ fontSize: "12px", color: "white", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Category Breakdown</h4>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {Object.entries(selectedDayDetails.categoryBreakdown).map(([cat, amt]) => (
                        <span key={cat} style={{ fontSize: "12px", background: "rgba(251, 113, 133, 0.12)", color: "var(--danger)", padding: "4px 8px", borderRadius: "6px", fontWeight: "600" }}>
                          {cat}: ₹{amt.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                <h4 style={{ fontSize: "12px", color: "white", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Daily log</h4>
                {selectedDayDetails.transactions.length === 0 ? (
                  <p style={{ color: "var(--text-dim)", fontSize: "13px" }}>No transactions logged on this day.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "200px", overflowY: "auto", paddingRight: "6px" }}>
                    {selectedDayDetails.transactions.map((tx, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <div>
                          <div style={{ fontWeight: "600", color: "white", fontSize: "13px" }}>{getTransactionTitle(tx)}</div>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{tx.type === "expense" ? tx.category || "Expense" : tx.source || "Income"}</span>
                        </div>
                        <span style={{ fontWeight: "700", color: tx.type === "expense" ? "var(--danger)" : "var(--success)" }}>
                          {tx.type === "expense" ? "-" : "+"} ₹{tx.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
