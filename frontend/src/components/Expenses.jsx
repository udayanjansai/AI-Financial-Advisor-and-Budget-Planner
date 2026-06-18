import React, { useState, useEffect } from "react";
import { PlusCircle, Trash2, ArrowDownRight, Search } from "lucide-react";

export default function Expenses({ token, onAddExpense, dataVersion, triggerRefresh }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  
  // Form States
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Food");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [expenseDesc, setExpenseDesc] = useState("");
  
  const categories = ["Food", "Transport", "Entertainment", "Shopping", "Utilities", "Medical", "Others"];

  useEffect(() => {
    fetchExpenses();
  }, [token, dataVersion]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/expenses", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setExpenses(await res.json());
      }
    } catch (err) {
      console.error("Error fetching expenses", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!expenseAmount) return;
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(expenseAmount),
          category: expenseCategory,
          date: expenseDate,
          description: expenseDesc
        })
      });
      if (res.ok) {
        const data = await res.json();
        setExpenseAmount("");
        setExpenseDesc("");
        if (triggerRefresh) triggerRefresh();
        else fetchExpenses();
        if (data.alert && onAddExpense) {
          onAddExpense(data.alert);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        if (triggerRefresh) triggerRefresh();
        else fetchExpenses();
      }
    } catch (err) {
      console.error(err);
    }
  };



  const filteredExpenses = expenses.filter(t => 
    t.description.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <div>
          <h1 style={{ fontSize: "32px", color: "white" }}>Expenses</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Track your daily expenses and upload receipts</p>
        </div>
      </div>

        <div className="glass-card" style={{ marginBottom: "30px" }}>
          <h2 style={{ fontSize: "20px", color: "white", display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <ArrowDownRight style={{ color: "var(--danger)" }} /> Add Expense
          </h2>
          <form onSubmit={handleAddExpenseSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", alignItems: "flex-end" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Amount (₹)</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="e.g. 1500" 
                value={expenseAmount} 
                onChange={(e) => setExpenseAmount(e.target.value)} 
                required 
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Category</label>
              <select 
                className="form-control" 
                value={expenseCategory} 
                onChange={(e) => setExpenseCategory(e.target.value)}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat} style={{ background: "#110c26" }}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Date</label>
              <input 
                type="date" 
                className="form-control" 
                value={expenseDate} 
                onChange={(e) => setExpenseDate(e.target.value)} 
                required 
              />
            </div>
            <div className="form-group" style={{ gridColumn: "span 2", marginBottom: 0 }}>
              <label>Description</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. Weekly Groceries, Restaurant bill" 
                value={expenseDesc} 
                onChange={(e) => setExpenseDesc(e.target.value)} 
              />
            </div>
            <button type="submit" className="btn" style={{ background: "var(--danger)", height: "46px" }}>
              <PlusCircle size={18} /> Add Expense
            </button>
          </form>
        </div>

      {/* Expense History Table */}
      <div className="glass-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "20px", color: "white" }}>Expense Log</h2>
          <div style={{ display: "flex", alignItems: "center", background: "var(--input-bg)", border: "1px solid var(--input-border)", borderRadius: "8px", padding: "6px 12px", width: "260px" }}>
            <Search size={16} style={{ color: "var(--text-muted)", marginRight: "8px" }} />
            <input 
              type="text" 
              placeholder="Search expenses..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: "transparent", border: "none", color: "white", outline: "none", width: "100%", fontSize: "14px" }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>Loading expenses...</div>
        ) : filteredExpenses.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>No expenses found.</div>
        ) : (
          <div className="table-container">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((t) => (
                  <tr key={t.id}>
                    <td style={{ color: "var(--text-muted)" }}>{t.date}</td>
                    <td>
                      <span style={{ 
                        padding: "4px 8px", 
                        borderRadius: "6px", 
                        fontSize: "12px", 
                        fontWeight: "600",
                        background: "rgba(99, 102, 241, 0.15)",
                        color: "var(--primary)"
                      }}>
                        {t.category}
                      </span>
                    </td>
                    <td>{t.description || "—"}</td>
                    <td style={{ color: "white", fontWeight: "700" }}>
                      - ₹{t.amount.toLocaleString()}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button 
                        onClick={() => handleDeleteExpense(t.id)}
                        style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", transition: "var(--transition-smooth)" }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "var(--danger)"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-dim)"}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
