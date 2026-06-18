import React, { useState, useEffect } from "react";
import { PlusCircle, Trash2, ArrowUpRight, ArrowDownRight, Search } from "lucide-react";

export default function Transactions({ token, onAddExpense }) {
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Form States
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeSource, setIncomeSource] = useState("");
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().split("T")[0]);
  const [incomeDesc, setIncomeDesc] = useState("");
  
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Food");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [expenseDesc, setExpenseDesc] = useState("");
  
  const categories = ["Food", "Transport", "Entertainment", "Shopping", "Utilities", "Medical", "Others"];

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const incRes = await fetch("/api/income", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const expRes = await fetch("/api/expenses", {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (incRes.ok && expRes.ok) {
        setIncomes(await incRes.json());
        setExpenses(await expRes.json());
      }
    } catch (err) {
      console.error("Error fetching transactions", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIncome = async (e) => {
    e.preventDefault();
    if (!incomeAmount || !incomeSource) return;
    try {
      const res = await fetch("/api/income", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(incomeAmount),
          source: incomeSource,
          date: incomeDate,
          description: incomeDesc
        })
      });
      if (res.ok) {
        setIncomeAmount("");
        setIncomeSource("");
        setIncomeDesc("");
        fetchData();
      }
    } catch (err) {
      console.error(err);
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
        fetchData();
        // If there is an alert from backend, forward to dashboard / toast
        if (data.alert && onAddExpense) {
          onAddExpense(data.alert);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteIncome = async (id) => {
    if (!confirm("Are you sure you want to delete this income?")) return;
    try {
      const res = await fetch(`/api/income/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchData();
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
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Combine and sort all transactions
  const combinedTransactions = [
    ...incomes.map(i => ({ ...i, type: "income", name: i.source, category: "Income" })),
    ...expenses.map(e => ({ ...e, type: "expense", name: e.description || e.category }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredTransactions = combinedTransactions.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <div>
          <h1 style={{ fontSize: "32px", color: "white" }}>Finance Management</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Track your income streams and daily expenses</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "30px" }}>
        {/* Track Income Card */}
        <div className="glass-card">
          <h2 style={{ fontSize: "20px", color: "white", display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <ArrowUpRight style={{ color: "var(--success)" }} /> Track Income Source
          </h2>
          <form onSubmit={handleAddIncome}>
            <div className="form-group">
              <label>Amount (₹)</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="e.g. 50000" 
                value={incomeAmount} 
                onChange={(e) => setIncomeAmount(e.target.value)} 
                required 
              />
            </div>
            <div className="form-group">
              <label>Source</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. Salary, Freelance, Dividend" 
                value={incomeSource} 
                onChange={(e) => setIncomeSource(e.target.value)} 
                required 
              />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input 
                type="date" 
                className="form-control" 
                value={incomeDate} 
                onChange={(e) => setIncomeDate(e.target.value)} 
                required 
              />
            </div>
            <div className="form-group">
              <label>Description (Optional)</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Short memo" 
                value={incomeDesc} 
                onChange={(e) => setIncomeDesc(e.target.value)} 
              />
            </div>
            <button type="submit" className="btn" style={{ background: "var(--success)", width: "100%", marginTop: "10px" }}>
              <PlusCircle size={18} /> Add Income
            </button>
          </form>
        </div>

        {/* Track Expense Card */}
        <div className="glass-card">
          <h2 style={{ fontSize: "20px", color: "white", display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <ArrowDownRight style={{ color: "var(--danger)" }} /> Track Expense
          </h2>
          <form onSubmit={handleAddExpenseSubmit}>
            <div className="form-group">
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
            <div className="form-group">
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
            <div className="form-group">
              <label>Date</label>
              <input 
                type="date" 
                className="form-control" 
                value={expenseDate} 
                onChange={(e) => setExpenseDate(e.target.value)} 
                required 
              />
            </div>
            <div className="form-group">
              <label>Description (Optional)</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. Weekly Groceries, Restaurant bill" 
                value={expenseDesc} 
                onChange={(e) => setExpenseDesc(e.target.value)} 
              />
            </div>
            <button type="submit" className="btn" style={{ background: "var(--danger)", width: "100%", marginTop: "10px" }}>
              <PlusCircle size={18} /> Add Expense
            </button>
          </form>
        </div>
      </div>

      {/* Transaction History Section */}
      <div className="glass-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "20px", color: "white" }}>Transaction History</h2>
          <div style={{ display: "flex", alignItems: "center", background: "var(--input-bg)", border: "1px solid var(--input-border)", borderRadius: "8px", padding: "6px 12px", width: "260px" }}>
            <Search size={16} style={{ color: "var(--text-muted)", marginRight: "8px" }} />
            <input 
              type="text" 
              placeholder="Search source/memo..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: "transparent", border: "none", color: "white", outline: "none", width: "100%", fontSize: "14px" }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>Loading transactions...</div>
        ) : filteredTransactions.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>No transactions found.</div>
        ) : (
          <div className="table-container">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category / Source</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((t) => (
                  <tr key={`${t.type}-${t.id}`}>
                    <td style={{ color: "var(--text-muted)" }}>{t.date}</td>
                    <td>
                      <span style={{ 
                        padding: "4px 8px", 
                        borderRadius: "6px", 
                        fontSize: "12px", 
                        fontWeight: "600",
                        background: t.type === "income" ? "rgba(16, 185, 129, 0.15)" : "rgba(99, 102, 241, 0.15)",
                        color: t.type === "income" ? "var(--success)" : "var(--primary)"
                      }}>
                        {t.category || t.source}
                      </span>
                    </td>
                    <td>{t.description || "—"}</td>
                    <td style={{ 
                      color: t.type === "income" ? "var(--success)" : "var(--danger)",
                      fontWeight: "600"
                    }}>
                      {t.type === "income" ? "INCOME" : "EXPENSE"}
                    </td>
                    <td style={{ 
                      color: "white", 
                      fontWeight: "700" 
                    }}>
                      {t.type === "income" ? "+" : "-"} ₹{t.amount.toLocaleString()}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button 
                        onClick={() => t.type === "income" ? handleDeleteIncome(t.id) : handleDeleteExpense(t.id)}
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
