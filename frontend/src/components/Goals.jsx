import React, { useState, useEffect, useRef } from "react";
import { Bar } from "react-chartjs-2";
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend 
} from "chart.js";
import { 
  Plus, 
  Trash2, 
  Milestone, 
  Calendar, 
  PiggyBank, 
  Brain, 
  Sparkles, 
  Send, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  MessageSquare, 
  HelpCircle,
  TrendingDown,
  ArrowUpRight
} from "lucide-react";

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function Goals({ token, dataVersion, triggerRefresh }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Expandable AI Analysis state
  const [activeAnalysisId, setActiveAnalysisId] = useState(null);
  const [analyses, setAnalyses] = useState({}); // Stores analysis by goal_id
  const [loadingAnalysis, setLoadingAnalysis] = useState({});
  
  // Conversational AI Assistant state
  const [chatLogs, setChatLogs] = useState({}); // Stores message logs by goal_id: [ { sender, text } ]
  const [chatInputs, setChatInputs] = useState({}); // Stores input message text by goal_id
  const [sendingChat, setSendingChat] = useState({});
  const chatEndRefs = useRef({});

  // Form State
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [deadline, setDeadline] = useState("");
  
  // Custom deposit state
  const [depositAmount, setDepositAmount] = useState({});

  useEffect(() => {
    fetchGoals();
  }, [token, dataVersion]);

  // Scroll chat window to bottom on new messages
  useEffect(() => {
    if (activeAnalysisId && chatEndRefs.current[activeAnalysisId]) {
      chatEndRefs.current[activeAnalysisId].scrollIntoView({ behavior: "smooth" });
    }
  }, [chatLogs, activeAnalysisId]);

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/goals", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setGoals(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGoal = async (e) => {
    e.preventDefault();
    if (!name || !targetAmount || !deadline) return;
    setError("");

    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          target_amount: parseFloat(targetAmount),
          current_amount: parseFloat(currentAmount || "0"),
          deadline
        })
      });

      if (res.ok) {
        setName("");
        setTargetAmount("");
        setCurrentAmount("0");
        setDeadline("");
        if (triggerRefresh) triggerRefresh();
        else fetchGoals();
      } else {
        const data = await res.json();
        setError(data.detail || "Failed to create goal");
      }
    } catch (err) {
      setError("Network error. Try again.");
    }
  };

  const handleAddMoney = async (id) => {
    const amt = parseFloat(depositAmount[id] || "1000");
    if (isNaN(amt) || amt <= 0) return;
    
    try {
      const res = await fetch(`/api/goals/${id}/add-money`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: amt })
      });
      if (res.ok) {
        setDepositAmount(prev => ({ ...prev, [id]: "" }));
        // Refresh goal analysis if it is open
        if (activeAnalysisId === id) {
          fetchGoalAnalysis(id);
        }
        if (triggerRefresh) triggerRefresh();
        else fetchGoals();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteGoal = async (id) => {
    if (!confirm("Are you sure you want to delete this goal?")) return;
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        if (activeAnalysisId === id) {
          setActiveAnalysisId(null);
        }
        if (triggerRefresh) triggerRefresh();
        else fetchGoals();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGoalAnalysis = async (id) => {
    setLoadingAnalysis(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/goals/${id}/analysis`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyses(prev => ({ ...prev, [id]: data }));
        
        // Initialize chat with default welcome message if not already set
        if (!chatLogs[id]) {
          setChatLogs(prev => ({
            ...prev,
            [id]: [
              {
                sender: "bot",
                text: `Hi! I am your Goal AI Assistant. Ask me anything about your goal '${data.name}', e.g., "Can I achieve this 6 months earlier?" or "How can I reach this goal faster?"`
              }
            ]
          }));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAnalysis(prev => ({ ...prev, [id]: false }));
    }
  };

  const toggleAnalysis = (id) => {
    if (activeAnalysisId === id) {
      setActiveAnalysisId(null);
    } else {
      setActiveAnalysisId(id);
      if (!analyses[id]) {
        fetchGoalAnalysis(id);
      }
    }
  };

  const handleSendChatMessage = async (id, overrideMessage = null) => {
    const message = overrideMessage || chatInputs[id];
    if (!message || !message.trim()) return;

    // Append user message
    setChatLogs(prev => ({
      ...prev,
      [id]: [...(prev[id] || []), { sender: "user", text: message }]
    }));
    setChatInputs(prev => ({ ...prev, [id]: "" }));
    setSendingChat(prev => ({ ...prev, [id]: true }));

    try {
      const res = await fetch(`/api/goals/${id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message })
      });
      if (res.ok) {
        const data = await res.json();
        setChatLogs(prev => ({
          ...prev,
          [id]: [...(prev[id] || []), { sender: "bot", text: data.response }]
        }));
      } else {
        setChatLogs(prev => ({
          ...prev,
          [id]: [...(prev[id] || []), { sender: "bot", text: "Sorry, I encountered an error. Please try again." }]
        }));
      }
    } catch (err) {
      setChatLogs(prev => ({
        ...prev,
        [id]: [...(prev[id] || []), { sender: "bot", text: "Network error. Please check your connection." }]
      }));
    } finally {
      setSendingChat(prev => ({ ...prev, [id]: false }));
    }
  };

  // Chart configuration
  const getChartData = (analysis) => {
    const isOnTrack = analysis.status === "On Track" || analysis.status === "Achieved";
    return {
      labels: ["Current Savings", "Required Savings"],
      datasets: [
        {
          label: "Monthly Savings (₹)",
          data: [analysis.current_monthly_savings, analysis.required_monthly_savings],
          backgroundColor: [
            isOnTrack ? "rgba(16, 185, 129, 0.45)" : "rgba(239, 68, 68, 0.45)", // Green if on track, Red if off track
            "rgba(99, 102, 241, 0.45)" // Indigo for required
          ],
          borderColor: [
            isOnTrack ? "#10b981" : "#ef4444",
            "#6366f1"
          ],
          borderWidth: 1.5,
          borderRadius: 8,
          barThickness: 28
        }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        grid: { color: "rgba(255, 255, 255, 0.05)" },
        ticks: { color: "rgba(255, 255, 255, 0.6)", font: { size: 10 } }
      },
      x: {
        grid: { display: false },
        ticks: { color: "rgba(255, 255, 255, 0.6)", font: { size: 11 } }
      }
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "30px" }}>
        <h1 style={{ fontSize: "32px", color: "white" }}>Goal Tracker</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Analyze savings feasibility, predict completion dates, and chat with AI financial coach</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "28px", alignItems: "flex-start" }}>
        
        {/* Left Form: New Goal */}
        <div className="glass-card" style={{ position: "sticky", top: "20px" }}>
          <h2 style={{ fontSize: "18px", color: "white", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Milestone size={18} style={{ color: "var(--primary)" }} /> New Goal
          </h2>
          <form onSubmit={handleCreateGoal}>
            <div className="form-group">
              <label>Goal Name</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. Downpayment for Car" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Target Amount (₹)</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="e.g. 500000" 
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Initial Saved Amount (₹)</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="e.g. 50000" 
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Target Deadline</label>
              <input 
                type="date" 
                className="form-control" 
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={{ color: "var(--danger)", fontSize: "13px", marginBottom: "12px" }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn" style={{ width: "100%", background: "linear-gradient(135deg, var(--primary), #a855f7)", marginTop: "10px" }}>
              <Plus size={16} /> Create Goal
            </button>
          </form>
        </div>

        {/* Right Panel: Goals List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {loading ? (
            <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "80px 0" }}>Loading goals...</div>
          ) : goals.length === 0 ? (
            <div className="glass-card" style={{ color: "var(--text-dim)", textAlign: "center", padding: "60px 0" }}>
              <PiggyBank size={48} style={{ color: "var(--panel-border)", marginBottom: "12px" }} />
              <p style={{ fontSize: "16px", color: "white", fontWeight: "600" }}>No savings goals set yet.</p>
              <p style={{ fontSize: "13px", marginTop: "4px" }}>Start planning by creating a goal on the left panel.</p>
            </div>
          ) : (
            goals.map((g) => {
              const progressPct = g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0;
              const isExpanded = activeAnalysisId === g.id;
              const analysis = analyses[g.id];
              const isLoadingAn = loadingAnalysis[g.id];
              
              return (
                <div key={g.id} className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "24px" }}>
                  
                  {/* Goal Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h3 style={{ fontSize: "20px", color: "white", fontWeight: "600" }}>{g.name}</h3>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "6px", fontSize: "13px", color: "var(--text-muted)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={13} /> Target: {g.deadline}</span>
                      </div>
                    </div>
                    
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button 
                        onClick={() => toggleAnalysis(g.id)}
                        className={`btn ${isExpanded ? "" : "btn-secondary"}`}
                        style={{ 
                          fontSize: "13px", 
                          padding: "8px 14px", 
                          borderRadius: "8px",
                          background: isExpanded ? "linear-gradient(135deg, var(--primary), #a855f7)" : ""
                        }}
                      >
                        <Brain size={14} /> {isExpanded ? "Close AI Analysis" : "View AI Analysis"}
                      </button>
                      
                      <button 
                        onClick={() => handleDeleteGoal(g.id)}
                        style={{ 
                          background: "rgba(255, 255, 255, 0.04)", 
                          border: "none", 
                          color: "var(--text-dim)", 
                          cursor: "pointer", 
                          padding: "8px", 
                          borderRadius: "8px", 
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "var(--transition-smooth)"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--danger)";
                          e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--text-dim)";
                          e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Goal Progress Metrics */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontSize: "24px", fontWeight: "700", color: "white" }}>
                        ₹{g.current_amount.toLocaleString()} <span style={{ color: "var(--text-dim)", fontSize: "16px", fontWeight: "400" }}>/ ₹{g.target_amount.toLocaleString()}</span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="progress-bar-bg" style={{ height: "12px", borderRadius: "8px", marginTop: "12px" }}>
                        <div 
                          className="progress-bar-fill" 
                          style={{ 
                            width: `${progressPct}%`, 
                            background: progressPct >= 100 ? "var(--warning)" : "linear-gradient(90deg, var(--primary) 0%, var(--success) 100%)",
                            borderRadius: "8px"
                          }} 
                        />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                        <span>{progressPct}% Complete</span>
                        <span>₹{(g.target_amount - g.current_amount).toLocaleString()} Remaining</span>
                      </div>
                    </div>

                    {/* Quick Deposit Actions */}
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", padding: "10px", borderRadius: "10px" }}>
                      <input 
                        type="number" 
                        placeholder="₹ Add Amount"
                        className="form-control"
                        style={{ width: "120px", padding: "6px 10px", fontSize: "13px" }}
                        value={depositAmount[g.id] || ""}
                        onChange={(e) => setDepositAmount(prev => ({ ...prev, [g.id]: e.target.value }))}
                      />
                      <button 
                        className="btn" 
                        onClick={() => handleAddMoney(g.id)}
                        style={{ padding: "6px 12px", fontSize: "13px" }}
                      >
                        Deposit
                      </button>
                    </div>
                  </div>

                  {/* Expandable AI Analysis Panel */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "20px", marginTop: "10px" }}>
                      {isLoadingAn ? (
                        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                          <Brain className="typing-dot" size={16} /> Evaluating goal feasibility & predictions...
                        </div>
                      ) : !analysis ? (
                        <div style={{ color: "var(--danger)", textAlign: "center", padding: "10px 0" }}>Could not load goal analysis.</div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                          
                          {/* Left Column: Feasibility, Date Predictions & Charts */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            
                            {/* Feasibility Summary Card */}
                            <div style={{ 
                              background: "rgba(255, 255, 255, 0.02)", 
                              border: "1px solid rgba(255, 255, 255, 0.05)", 
                              borderRadius: "12px", 
                              padding: "16px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between"
                            }}>
                              <div>
                                <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase" }}>Feasibility Status</span>
                                <h4 style={{ 
                                  fontSize: "20px", 
                                  marginTop: "4px",
                                  color: analysis.status === "Achieved" ? "var(--warning)" : (analysis.status === "On Track" ? "var(--success)" : "var(--danger)")
                                }}>
                                  {analysis.status === "Achieved" ? "Goal Achieved!" : analysis.status}
                                </h4>
                              </div>
                              
                              <div>
                                {analysis.status === "On Track" || analysis.status === "Achieved" ? (
                                  <CheckCircle2 size={32} style={{ color: "var(--success)" }} />
                                ) : (
                                  <AlertTriangle size={32} style={{ color: "var(--danger)" }} />
                                )}
                              </div>
                            </div>

                            {/* Detailed Predictions */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                              <div style={{ background: "rgba(255, 255, 255, 0.01)", border: "1px solid rgba(255, 255, 255, 0.04)", borderRadius: "10px", padding: "12px" }}>
                                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Est. Completion</div>
                                <div style={{ fontSize: "15px", fontWeight: "700", color: "white", marginTop: "4px" }}>{analysis.est_completion_date}</div>
                              </div>
                              <div style={{ background: "rgba(255, 255, 255, 0.01)", border: "1px solid rgba(255, 255, 255, 0.04)", borderRadius: "10px", padding: "12px" }}>
                                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Req. Monthly Savings</div>
                                <div style={{ fontSize: "15px", fontWeight: "700", color: "white", marginTop: "4px" }}>₹{analysis.required_monthly_savings.toLocaleString()}</div>
                              </div>
                              <div style={{ background: "rgba(255, 255, 255, 0.01)", border: "1px solid rgba(255, 255, 255, 0.04)", borderRadius: "10px", padding: "12px" }}>
                                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Current Monthly Savings</div>
                                <div style={{ fontSize: "15px", fontWeight: "700", color: "white", marginTop: "4px" }}>₹{analysis.current_monthly_savings.toLocaleString()}</div>
                              </div>
                              <div style={{ background: "rgba(255, 255, 255, 0.01)", border: "1px solid rgba(255, 255, 255, 0.04)", borderRadius: "10px", padding: "12px" }}>
                                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Monthly Shortfall</div>
                                <div style={{ fontSize: "15px", fontWeight: "700", color: analysis.monthly_shortfall > 0 ? "var(--danger)" : "var(--success)", marginTop: "4px" }}>
                                  ₹{analysis.monthly_shortfall.toLocaleString()}
                                </div>
                              </div>
                            </div>

                            {/* Savings comparison chart */}
                            <div style={{ 
                              background: "rgba(0, 0, 0, 0.15)", 
                              borderRadius: "12px", 
                              padding: "16px", 
                              border: "1px solid rgba(255, 255, 255, 0.04)",
                              height: "180px",
                              position: "relative"
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                                <span style={{ fontSize: "12px", color: "white", fontWeight: "600" }}>Monthly Savings Rate Comparison</span>
                              </div>
                              <div style={{ height: "130px" }}>
                                <Bar data={getChartData(analysis)} options={chartOptions} />
                              </div>
                            </div>
                          </div>

                          {/* Right Column: AI Insights & Conversational AI Assistant */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "16px", borderLeft: "1px solid rgba(255, 255, 255, 0.08)", paddingLeft: "24px" }}>
                            
                            {/* AI Insights */}
                            <div>
                              <h4 style={{ fontSize: "14px", color: "white", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                                <Sparkles size={14} style={{ color: "var(--warning)" }} /> Actionable AI Insights
                              </h4>
                              <ul style={{ listStyle: "none", fontSize: "12px", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "8px", padding: 0 }}>
                                {analysis.insights && analysis.insights.map((ins, idx) => (
                                  <li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                                    <ArrowUpRight size={14} style={{ color: "var(--primary)", flexShrink: 0, marginTop: "2px" }} />
                                    <span>{ins}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Goal AI Assistant Chat */}
                            <div style={{ 
                              display: "flex", 
                              flexDirection: "column", 
                              border: "1px solid rgba(255,255,255,0.06)", 
                              borderRadius: "12px", 
                              background: "rgba(0,0,0,0.2)",
                              height: "280px"
                            }}>
                              {/* Chat Header */}
                              <div style={{ 
                                padding: "10px 14px", 
                                borderBottom: "1px solid rgba(255,255,255,0.06)", 
                                display: "flex", 
                                alignItems: "center", 
                                gap: "6px",
                                fontSize: "12px",
                                color: "white",
                                fontWeight: "600"
                              }}>
                                <MessageSquare size={13} style={{ color: "var(--primary)" }} /> Goal AI Assistant
                              </div>

                              {/* Chat Bubbles Log */}
                              <div style={{ 
                                flex: 1, 
                                overflowY: "auto", 
                                padding: "12px", 
                                display: "flex", 
                                flexDirection: "column", 
                                gap: "10px"
                              }}>
                                {chatLogs[g.id] && chatLogs[g.id].map((msg, idx) => (
                                  <div 
                                    key={idx} 
                                    style={{ 
                                      alignSelf: msg.sender === "user" ? "flex-end" : "flex-start",
                                      background: msg.sender === "user" ? "var(--primary)" : "rgba(255,255,255,0.05)",
                                      color: "white",
                                      fontSize: "12px",
                                      padding: "8px 12px",
                                      borderRadius: "12px",
                                      borderBottomRightRadius: msg.sender === "user" ? "3px" : "12px",
                                      borderBottomLeftRadius: msg.sender === "bot" ? "3px" : "12px",
                                      maxWidth: "85%",
                                      lineHeight: "1.4",
                                      whiteSpace: "pre-line"
                                    }}
                                  >
                                    {msg.text}
                                  </div>
                                ))}
                                {sendingChat[g.id] && (
                                  <div style={{ 
                                    alignSelf: "flex-start",
                                    background: "rgba(255,255,255,0.05)",
                                    fontSize: "12px",
                                    padding: "8px 12px",
                                    borderRadius: "12px",
                                    borderBottomLeftRadius: "3px",
                                    color: "var(--text-muted)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px"
                                  }}>
                                    <span className="typing-dot" style={{ width: "4px", height: "4px" }} />
                                    <span className="typing-dot" style={{ width: "4px", height: "4px", animationDelay: "0.2s" }} />
                                    <span className="typing-dot" style={{ width: "4px", height: "4px", animationDelay: "0.4s" }} />
                                  </div>
                                )}
                                <div ref={el => chatEndRefs.current[g.id] = el} />
                              </div>

                              {/* Chat Suggestion Prompts */}
                              <div style={{ 
                                display: "flex", 
                                gap: "6px", 
                                padding: "6px 10px", 
                                overflowX: "auto", 
                                borderTop: "1px solid rgba(255,255,255,0.04)"
                              }}>
                                <button 
                                  onClick={() => handleSendChatMessage(g.id, "How can I reach this goal faster?")}
                                  style={{
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: "6px",
                                    color: "var(--text-muted)",
                                    fontSize: "10px",
                                    padding: "4px 8px",
                                    whiteSpace: "nowrap",
                                    cursor: "pointer"
                                  }}
                                >
                                  Reach faster?
                                </button>
                                <button 
                                  onClick={() => handleSendChatMessage(g.id, "Can I achieve this 6 months earlier?")}
                                  style={{
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: "6px",
                                    color: "var(--text-muted)",
                                    fontSize: "10px",
                                    padding: "4px 8px",
                                    whiteSpace: "nowrap",
                                    cursor: "pointer"
                                  }}
                                >
                                  Achieve 6 months earlier?
                                </button>
                                <button 
                                  onClick={() => handleSendChatMessage(g.id, "How can I reduce expenses to support this?")}
                                  style={{
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: "6px",
                                    color: "var(--text-muted)",
                                    fontSize: "10px",
                                    padding: "4px 8px",
                                    whiteSpace: "nowrap",
                                    cursor: "pointer"
                                  }}
                                >
                                  Cut expenses?
                                </button>
                              </div>

                              {/* Chat Input Panel */}
                              <div style={{ 
                                padding: "10px", 
                                borderTop: "1px solid rgba(255,255,255,0.06)", 
                                display: "flex", 
                                gap: "8px" 
                              }}>
                                <input 
                                  type="text" 
                                  className="form-control"
                                  placeholder="Ask about this goal..."
                                  style={{ flex: 1, padding: "8px 12px", fontSize: "12px" }}
                                  value={chatInputs[g.id] || ""}
                                  onChange={(e) => setChatInputs(prev => ({ ...prev, [g.id]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleSendChatMessage(g.id);
                                    }
                                  }}
                                />
                                <button 
                                  className="btn" 
                                  onClick={() => handleSendChatMessage(g.id)}
                                  style={{ padding: "8px 12px" }}
                                >
                                  <Send size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
