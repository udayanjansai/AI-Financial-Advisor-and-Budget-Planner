import React from "react";
import { CheckCircle, XCircle, AlertCircle, Info, X } from "lucide-react";

export default function AlertDialog({
  open,
  title,
  message,
  tone = "success", // success, danger, info, warning
  onClose
}) {
  if (!open) return null;

  let Icon = Info;
  let iconColor = "#3b82f6"; // blue
  let glowColor = "rgba(59, 130, 246, 0.2)";

  if (tone === "success") {
    Icon = CheckCircle;
    iconColor = "var(--success)"; // green
    glowColor = "var(--success-glow)";
  } else if (tone === "danger") {
    Icon = XCircle;
    iconColor = "var(--danger)"; // red
    glowColor = "var(--danger-glow)";
  } else if (tone === "warning") {
    Icon = AlertCircle;
    iconColor = "var(--warning)"; // yellow
    glowColor = "var(--warning-glow)";
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="confirm-dialog glass-card"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          maxWidth: "400px",
          padding: "28px",
          textAlign: "center",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
          position: "relative"
        }}
      >
        <button 
          className="icon-button" 
          type="button" 
          onClick={onClose} 
          aria-label="Close dialog"
          style={{
            position: "absolute",
            right: "16px",
            top: "16px",
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "4px"
          }}
        >
          <X size={18} />
        </button>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div 
            style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              width: "56px", 
              height: "56px", 
              borderRadius: "50%", 
              background: `rgba(255, 255, 255, 0.02)`,
              border: `2px solid ${iconColor}`,
              color: iconColor,
              boxShadow: `0 0 20px ${glowColor}`
            }}
          >
            <Icon size={30} />
          </div>
          <div>
            <h3 style={{ fontSize: "20px", color: "white", fontWeight: "700" }}>{title}</h3>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "8px", lineHeight: "1.5" }}>{message}</p>
          </div>
        </div>

        <div style={{ marginTop: "24px", display: "flex", justifyContent: "center" }}>
          <button 
            className="btn" 
            type="button" 
            onClick={onClose}
            style={{ 
              width: "100%", 
              background: tone === "danger" ? "var(--danger)" : "var(--primary)",
              color: "white",
              fontWeight: "600",
              height: "42px"
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
