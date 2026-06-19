import React, { useState, useEffect } from "react";
import { PlusCircle, Trash2, ArrowUpRight, Search } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

export default function Income({ token, dataVersion, triggerRefresh }) {
  const [incomes, setIncomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Form States
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeSource, setIncomeSource] = useState("");
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().split("T")[0]);
  const [incomeDesc, setIncomeDesc] = useState("");

  useEffect(() => {
    fetchIncomes();
  }, [token, dataVersion]);

  const fetchIncomes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/income", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setIncomes(await res.json());
      }
    } catch (err) {
      console.error("Error fetching incomes", err);
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
        if (triggerRefresh) triggerRefresh();
        else fetchIncomes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteIncome = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/income/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDeleteTarget(null);
        if (triggerRefresh) triggerRefresh();
        else fetchIncomes();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredIncomes = incomes.filter(t => 
    t.source.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ marginBottom: "30px" }}>
        <h1 style={{ fontSize: "32px", color: "white" }}>Income</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Manage your salary and other monthly income sources</p>
      </div>

      <div className="glass-card" style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "20px", color: "white", display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <ArrowUpRight style={{ color: "var(--success)" }} /> Track Income Source
        </h2>
        <form onSubmit={handleAddIncome} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", alignItems: "flex-end" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
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
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Source</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="e.g. Salary, Freelance, Side Gig" 
              value={incomeSource} 
              onChange={(e) => setIncomeSource(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input 
              type="date" 
              className="form-control" 
              value={incomeDate} 
              onChange={(e) => setIncomeDate(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group" style={{ gridColumn: "span 2", marginBottom: 0 }}>
            <label>Description</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Memo / Notes" 
              value={incomeDesc} 
              onChange={(e) => setIncomeDesc(e.target.value)} 
            />
          </div>
          <button type="submit" className="btn" style={{ background: "var(--success)", height: "46px" }}>
            <PlusCircle size={18} /> Add Income
          </button>
        </form>
      </div>

      {/* Income History Table */}
      <div className="glass-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "20px", color: "white" }}>Income History</h2>
          <div style={{ display: "flex", alignItems: "center", background: "var(--input-bg)", border: "1px solid var(--input-border)", borderRadius: "8px", padding: "6px 12px", width: "260px" }}>
            <Search size={16} style={{ color: "var(--text-muted)", marginRight: "8px" }} />
            <input 
              type="text" 
              placeholder="Search income streams..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: "transparent", border: "none", color: "white", outline: "none", width: "100%", fontSize: "14px" }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>Loading income streams...</div>
        ) : filteredIncomes.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>No income logged yet.</div>
        ) : (
          <div className="table-container">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncomes.map((t) => (
                  <tr key={t.id}>
                    <td style={{ color: "var(--text-muted)" }}>{t.date}</td>
                    <td>
                      <span style={{ 
                        padding: "4px 8px", 
                        borderRadius: "6px", 
                        fontSize: "12px", 
                        fontWeight: "600",
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "var(--success)"
                      }}>
                        {t.source}
                      </span>
                    </td>
                    <td>{t.description || "—"}</td>
                    <td style={{ color: "var(--success)", fontWeight: "700" }}>
                      + ₹{t.amount.toLocaleString()}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button 
                        onClick={() => setDeleteTarget(t)}
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove income?"
        message={deleteTarget ? `This will delete ${deleteTarget.source} income of ₹${Number(deleteTarget.amount).toLocaleString()}. Dashboard totals will update after removal.` : ""}
        confirmLabel="Remove income"
        loading={deleteLoading}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteIncome}
      />
    </div>
  );
}
