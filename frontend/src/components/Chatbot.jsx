import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles } from "lucide-react";

export default function Chatbot({ token }) {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "bot",
      text: "Hello! I am your AI Financial Advisor. Ask me anything about your expenses, budgets, or savings. For example, try asking: *'Where can I save money?'* or *'How much did I spend this month?'*"
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const text = textToSend || input;
    if (!text.trim()) return;

    // Add user message
    const userMsg = {
      id: Date.now().toString(),
      sender: "user",
      text: text
    };
    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: text })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          sender: "bot",
          text: data.reply
        }]);
      } else {
        throw new Error("Chatbot failed");
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: "I apologize, but I encountered an error. Please check if the backend is running and try again."
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  const suggestions = [
    "How much did I spend on food this month?",
    "Where can I save money?",
    "What is my financial health score?",
    "Predict my expenses for next month"
  ];

  // Simple formatter for bot text with bold and bullet points
  const formatText = (text) => {
    return text.split("\n").map((line, idx) => {
      // Replace **text** with <strong>text</strong>
      let cleanLine = line;
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;
      
      while ((match = boldRegex.exec(cleanLine)) !== null) {
        parts.push(cleanLine.substring(lastIndex, match.index));
        parts.push(<strong key={match.index} style={{ color: "#ffffff" }}>{match[1]}</strong>);
        lastIndex = boldRegex.lastIndex;
      }
      parts.push(cleanLine.substring(lastIndex));

      // Bullet check
      if (line.trim().startsWith("•") || line.trim().startsWith("-")) {
        return (
          <li key={idx} style={{ marginLeft: "20px", marginBottom: "4px", listStyleType: "disc" }}>
            {parts.length > 0 ? parts : line.replace(/^[•-]\s*/, "")}
          </li>
        );
      }
      return <p key={idx} style={{ marginBottom: "8px" }}>{parts.length > 0 ? parts : line}</p>;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
      <div>
        <h1 style={{ fontSize: "32px", color: "white" }}>AI Finance Chatbot</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Ask questions about your transactions, saving tips, or scores in natural language.</p>
      </div>

      <div className="glass-card chat-container" style={{ flex: 1, marginTop: "24px", padding: "20px", display: "flex", flexDirection: "column" }}>
        
        {/* Messages list */}
        <div className="chat-messages" style={{ overflowY: "auto", flex: 1 }}>
          {messages.map((m) => (
            <div key={m.id} style={{ display: "flex", gap: "12px", width: "100%", justifyContent: m.sender === "bot" ? "flex-start" : "flex-end" }}>
              {m.sender === "bot" && (
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(99, 102, 241, 0.15)", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
                  <Bot size={16} style={{ color: "var(--primary)" }} />
                </div>
              )}
              <div className={`chat-bubble ${m.sender}`}>
                {m.sender === "bot" ? formatText(m.text) : m.text}
              </div>
              {m.sender === "user" && (
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <User size={16} style={{ color: "white" }} />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", gap: "12px", width: "100%", justifyContent: "flex-start" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(99, 102, 241, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
                <Bot size={16} style={{ color: "var(--primary)" }} />
              </div>
              <div className="chat-bubble bot" style={{ padding: "12px 18px" }}>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestion Chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
          {suggestions.map((s, idx) => (
            <button 
              key={idx} 
              onClick={() => handleSend(s)} 
              disabled={loading}
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                color: "var(--text-muted)",
                padding: "8px 14px",
                borderRadius: "20px",
                fontSize: "13px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "var(--transition-smooth)"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--primary)";
                e.currentTarget.style.color = "white";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <Sparkles size={12} style={{ color: "var(--primary)" }} /> {s}
            </button>
          ))}
        </div>

        {/* Input area */}
        <div className="chat-input-area">
          <input 
            type="text" 
            className="form-control" 
            placeholder="Ask a question about your budgets or savings..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={() => handleSend()} disabled={loading}>
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
