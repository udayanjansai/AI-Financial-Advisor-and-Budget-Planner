import React, { useState, useEffect } from "react";
import { PlusCircle, Trash2, Edit2, ToggleLeft, ToggleRight, Repeat, ArrowDownRight, Check, X } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

export default function RecurringExpenses({ token, dataVersion, triggerRefresh }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form states
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [frequency, setFrequency] = useState("Monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const categories = ["Food", "Transport", "Entertainment", "Shopping", "Utilities", "Medical", "Others"];
  const frequencies = ["Daily", "Weekly", "Monthly", "Yearly"];

  useEffect(() => {
    fetchRecurringExpenses();
  }, [token, dataVersion]);

  const fetchRecurringExpenses = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recurring-expenses", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setItems(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setAmount("");
    setCategory("Food");
    setFrequency("Monthly");
    setStartDate(new Date().toISOString().split("T")[0]);
    setEndDate("");
    setIsActive(true);
    setIsEditing(false);
    setEditId(null);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!title || !amount || !startDate) return;
    setError("");
    setSuccess("");

    const payload = {
      title,
      amount: parseFloat(amount),
      category,
      frequency,
      start_date: startDate,
      end_date: endDate || null,
      is_active: isActive
    };

    const url = isEditing 
      ? `/api/recurring-expenses/${editId}`
      : "/api/recurring-expenses";
    
    const method = isEditing ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setSuccess(isEditing ? "Recurring expense updated!" : "Recurring expense created!");
        resetForm();
        if (triggerRefresh) triggerRefresh();
        else fetchRecurringExpenses();
        
        setTimeout(() => setSuccess(""), 4000);
      } else {
        const data = await res.json();
        setError(data.detail || "Failed to save recurring expense");
      }
    } catch (err) {
      setError("Network error. Try again.");
    }
  };

  const handleEditClick = (item) => {
    setIsEditing(true);
    setEditId(item.id);
    setTitle(item.title);
    setAmount(item.amount.toString());
    setCategory(item.category);
    setFrequency(item.frequency);
    setStartDate(item.start_date);
    setEndDate(item.end_date || "");
    setIsActive(!!item.is_active);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setError("");
    setSuccess("");
    setDeleteLoading(true);

    try {
      const res = await fetch(`/api/recurring-expenses/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setSuccess("Recurring expense deleted.");
        setDeleteTarget(null);
        if (triggerRefresh) triggerRefresh();
        else fetchRecurringExpenses();
        
        setTimeout(() => setSuccess(""), 4000);
      }
    } catch (err) {
      setError("Failed to delete recurring expense.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleActive = async (id) => {
    try {
      const res = await fetch(`/api/recurring-expenses/${id}/toggle`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        if (triggerRefresh) triggerRefresh();
        else fetchRecurringExpenses();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "30px" }}>
        <h1 style={{ fontSize: "32px", color: "white" }}>Recurring Expenses</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Schedule repeating expenses that auto-populate your transactions log</p>
      </div>

      {success && (
        <div className="alert-bar" style={{ background: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.2)", color: "#a7f3d0", marginBottom: "20px" }}>
          <Check size={18} /> {success}
        </div>
      )}
      {error && (
        <div className="alert-bar alert-danger" style={{ marginBottom: "20px" }}>
          <X size={18} /> {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "28px" }}>
        
        {/* Creation/Edit Form Card */}
        <div className="glass-card" style={{ height: "fit-content" }}>
          <h2 style={{ fontSize: "18px", color: "white", display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
            <ArrowDownRight style={{ color: isEditing ? "var(--warning)" : "var(--primary)" }} /> 
            {isEditing ? "Edit Recurring Expense" : "Create Recurring Expense"}
          </h2>
          <form onSubmit={handleFormSubmit}>
            <div className="form-group">
              <label>Title</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. Netflix Subscription, Rent" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required 
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="form-group">
                <label>Amount (₹)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  placeholder="e.g. 799" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select 
                  className="form-control" 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat} style={{ background: "#110c26" }}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="form-group">
                <label>Frequency</label>
                <select 
                  className="form-control" 
                  value={frequency} 
                  onChange={(e) => setFrequency(e.target.value)}
                >
                  {frequencies.map(freq => (
                    <option key={freq} value={freq} style={{ background: "#110c26" }}>{freq}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: "24px" }}>
                <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "white" }}>
                  <span>Active Status</span>
                </label>
                <button 
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  style={{ background: "transparent", border: "none", color: isActive ? "var(--success)" : "var(--text-dim)", cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  {isActive ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="form-group">
                <label>Start Date</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label>End Date (Optional)</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
              <button type="submit" className="btn" style={{ flex: 1 }}>
                {isEditing ? "Update Schedule" : "Create Schedule"}
              </button>
              {isEditing && (
                <button type="button" className="btn btn-secondary" onClick={resetForm} style={{ flex: 0.5 }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Registered list */}
        <div className="glass-card">
          <h2 style={{ fontSize: "18px", color: "white", marginBottom: "20px" }}>Registered Schedules</h2>

          {loading ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>Loading schedules...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>
              <Repeat size={40} style={{ color: "var(--panel-border)", marginBottom: "10px" }} />
              <p>No recurring expense schedules found.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Details</th>
                    <th>Frequency</th>
                    <th>Start/End</th>
                    <th>Amount</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} style={{ opacity: item.is_active ? 1 : 0.6 }}>
                      <td>
                        <div style={{ fontWeight: "600", color: "white" }}>{item.title}</div>
                        <span style={{ 
                          padding: "2px 6px", 
                          borderRadius: "4px", 
                          fontSize: "10px", 
                          fontWeight: "600",
                          background: "rgba(99, 102, 241, 0.15)",
                          color: "var(--primary)"
                        }}>
                          {item.category}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "13px", color: "white" }}>{item.frequency}</span>
                        {item.last_processed_date && (
                          <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>
                            Last paid: {item.last_processed_date}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        <div>From: {item.start_date}</div>
                        {item.end_date && <div>To: {item.end_date}</div>}
                      </td>
                      <td style={{ color: "white", fontWeight: "700", fontSize: "15px" }}>
                        ₹{item.amount.toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                          <button 
                            onClick={() => handleToggleActive(item.id)}
                            style={{ background: "transparent", border: "none", color: item.is_active ? "var(--success)" : "var(--text-dim)", cursor: "pointer" }}
                            title={item.is_active ? "Disable schedule" : "Enable schedule"}
                          >
                            {item.is_active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                          </button>
                          <button 
                            onClick={() => handleEditClick(item)}
                            style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", transition: "var(--transition-smooth)" }}
                            onMouseEnter={(e) => e.currentTarget.style.color = "var(--warning)"}
                            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-dim)"}
                            title="Edit schedule"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => setDeleteTarget(item)}
                            style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", transition: "var(--transition-smooth)" }}
                            onMouseEnter={(e) => e.currentTarget.style.color = "var(--danger)"}
                            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-dim)"}
                            title="Delete schedule"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Recurring Expense"
        message={`Are you sure you want to delete the recurring expense "${deleteTarget?.title}"?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
