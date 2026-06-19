import React, { useState, useEffect } from "react";
import { Save, Plus, AlertTriangle } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

export default function Budget({ token, onAddExpense, dataVersion, triggerRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Budget Form States
  const [newBudgetCategory, setNewBudgetCategory] = useState("Food");
  const [newBudgetLimit, setNewBudgetLimit] = useState("");
  const [budgetMonth, setBudgetMonth] = useState(new Date().toISOString().split("T")[0].substring(0, 7)); // YYYY-MM
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [budgetError, setBudgetError] = useState("");
  
  const categories = ["Food", "Transport", "Entertainment", "Shopping", "Utilities", "Medical", "Others"];

  useEffect(() => {
    fetchBudgetData();
  }, [token, dataVersion]);

  const fetchBudgetData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics/dashboard", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetBudget = async (e) => {
    e.preventDefault();
    if (!newBudgetLimit) return;
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          category: newBudgetCategory,
          limit_amount: parseFloat(newBudgetLimit),
          month: budgetMonth
        })
      });
      if (res.ok) {
        setNewBudgetLimit("");
        if (triggerRefresh) triggerRefresh();
        else fetchBudgetData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteBudget = async () => {
    if (!deleteTarget?.id) {
      setBudgetError("Could not remove this budget because its ID is missing. Please refresh and try again.");
      return;
    }

    setDeleteLoading(true);
    setBudgetError("");
    try {
      const res = await fetch(`/api/budgets/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDeleteTarget(null);
        if (triggerRefresh) triggerRefresh();
        else fetchBudgetData();
      } else {
        const errorText = await res.text();
        console.error("Failed to delete budget", errorText);
        setBudgetError("Failed to remove this budget. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setBudgetError("Error removing budget. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading || !data) {
    return <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "80px 0" }}>Loading budget planner...</div>;
  }

  const { budgets, categories: catSpend, alerts } = data;

  return (
    <div>
      <div style={{ marginBottom: "30px" }}>
        <h1 style={{ fontSize: "32px", color: "white" }}>Budget Planner</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Set, adjust, and monitor your monthly spending limits by category</p>
      </div>

      {alerts.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          {alerts.map((al, idx) => (
            <div key={idx} className={`alert-bar alert-${al.alert_type}`}>
              <AlertTriangle size={18} />
              <span>{al.message} ({al.percentage}% used of ₹{al.limit.toLocaleString()} limit)</span>
            </div>
          ))}
        </div>
      )}

      {budgetError && (
        <div className="alert-bar alert-danger">
          <AlertTriangle size={18} />
          <span>{budgetError}</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "28px" }}>
        
        {/* Set budget form */}
        <div className="glass-card" style={{ height: "fit-content" }}>
          <h2 style={{ fontSize: "18px", color: "white", display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
            <Save size={18} style={{ color: "var(--primary)" }} /> Set Category Budget
          </h2>
          <form onSubmit={handleSetBudget}>
            <div className="form-group">
              <label>Category</label>
              <select 
                className="form-control" 
                value={newBudgetCategory} 
                onChange={(e) => setNewBudgetCategory(e.target.value)}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat} style={{ background: "#110c26" }}>{cat}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Budget Month</label>
              <input 
                type="month" 
                className="form-control" 
                value={budgetMonth}
                onChange={(e) => setBudgetMonth(e.target.value)}
                required 
              />
            </div>

            <div className="form-group">
              <label>Limit Amount (₹)</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="e.g. 5000" 
                value={newBudgetLimit}
                onChange={(e) => setNewBudgetLimit(e.target.value)}
                required 
              />
            </div>

            <button type="submit" className="btn" style={{ width: "100%", marginTop: "14px" }}>
              <Plus size={18} /> Apply Budget
            </button>
          </form>
        </div>

        {/* Budget Progress bars list */}
        <div className="glass-card">
          <h2 style={{ fontSize: "18px", color: "white", marginBottom: "20px" }}>Active Budgets ({budgetMonth})</h2>
          
          {budgets.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No budgets defined for this month. Set budgets using the panel on the left.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
              {budgets.map((b) => {
                const spentObj = catSpend.find(c => c.category === b.category);
                const spent = spentObj ? spentObj.total : 0.0;
                const ratio = Math.min(1.0, spent / b.limit_amount);
                const pct = (spent / b.limit_amount) * 100;
                
                // Color based on status
                const color = pct > 100 ? "var(--danger)" : pct > 85 ? "var(--warning)" : "var(--primary)";
                
                return (
                  <div key={b.category} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontWeight: "600", color: "white" }}>{b.category}</span>
                        <button 
                          type="button"
                          onClick={() => setDeleteTarget(b)}
                          style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "11px" }}
                          onMouseEnter={(e) => e.currentTarget.style.color = "var(--danger)"}
                          onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-dim)"}
                        >
                          (remove)
                        </button>
                      </div>
                      <span style={{ color: "var(--text-muted)" }}>
                        ₹{spent.toLocaleString()} / ₹{b.limit_amount.toLocaleString()} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="progress-bar-bg" style={{ height: "10px", marginTop: "4px" }}>
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

      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove budget?"
        message={deleteTarget ? `This will remove the ${deleteTarget.category} budget for ${deleteTarget.month || budgetMonth}. Spending entries will stay untouched.` : ""}
        confirmLabel="Remove budget"
        loading={deleteLoading}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteBudget}
      />
    </div>
  );
}
