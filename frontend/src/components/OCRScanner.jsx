import React, { useState } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, FileUp, RefreshCw } from "lucide-react";

export default function OCRScanner({ token, onAddExpense, triggerRefresh }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  
  // OCR Results State
  const [ocrData, setOcrData] = useState(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
      setOcrData(null);
      setError("");
      setSuccess(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      setFile(droppedFile);
      setPreviewUrl(URL.createObjectURL(droppedFile));
      setOcrData(null);
      setError("");
      setSuccess(false);
    } else {
      setError("Please drop an image file (PNG, JPG, WEBP).");
    }
  };

  const startScan = async () => {
    if (!file) return;
    setScanning(true);
    setError("");
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/ocr/scan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setOcrData(data);
      } else {
        const err = await res.json();
        setError(err.detail || "Scanning failed. Please make sure the receipt is legible.");
      }
    } catch (err) {
      setError("Unable to connect to the OCR server. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setOcrData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleConfirmAndAdd = async () => {
    if (!ocrData) return;
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(ocrData.amount),
          category: ocrData.category,
          date: ocrData.date,
          description: `${ocrData.merchant}`
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess(true);
        setFile(null);
        setPreviewUrl(null);
        setOcrData(null);
        
        if (triggerRefresh) triggerRefresh();
        
        if (onAddExpense) {
          onAddExpense(data.alert || {
            type: "success",
            message: `Expense of ₹${parseFloat(ocrData.amount).toLocaleString()} successfully parsed & added for ${ocrData.merchant}`
          });
        }
      } else {
        const err = await res.json();
        setError(err.detail || "Failed to record expense");
      }
    } catch (err) {
      setError("Failed to add expense. Try again.");
    }
  };

  const categories = ["Food", "Transport", "Entertainment", "Shopping", "Utilities", "Medical", "Others"];

  return (
    <div>
      <div>
        <h1 style={{ fontSize: "32px", color: "white" }}>OCR Receipt Scanner</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Upload a receipt photo to automatically extract transactions using Gemini AI Vision.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "28px", marginTop: "24px" }}>
        
        {/* Upload panel */}
        <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <h2 style={{ fontSize: "20px", color: "white" }}>Upload Receipt</h2>
          
          <div 
            className="upload-zone"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}
          >
            {previewUrl ? (
              <div style={{ width: "100%", height: "100%", position: "relative" }}>
                <img 
                  src={previewUrl} 
                  alt="Receipt Preview" 
                  style={{ maxWidth: "100%", maxHeight: "280px", borderRadius: "8px", objectFit: "contain" }} 
                />
                {scanning && (
                  <div style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "4px",
                    background: "linear-gradient(90deg, transparent, var(--primary), transparent)",
                    boxShadow: "0 0 10px var(--primary)",
                    animation: "scanLine 2s infinite ease-in-out"
                  }} />
                )}
              </div>
            ) : (
              <>
                <FileUp size={44} style={{ color: "var(--primary)", marginBottom: "16px" }} />
                <p style={{ fontSize: "16px", color: "white", fontWeight: "600" }}>Drag & drop your receipt image here</p>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "6px" }}>PNG, JPG, JPEG or WEBP formats supported</p>
                <div style={{ marginTop: "20px" }}>
                  <label htmlFor="receipt-upload" className="btn btn-secondary" style={{ cursor: "pointer" }}>
                    Select File
                  </label>
                  <input 
                    id="receipt-upload" 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileChange} 
                    style={{ display: "none" }} 
                  />
                </div>
              </>
            )}
          </div>

          {file && !ocrData && (
            <button className="btn" onClick={startScan} disabled={scanning} style={{ width: "100%" }}>
              {scanning ? (
                <>
                  <RefreshCw size={18} className="spin" style={{ animation: "spin 1.5s linear infinite" }} /> Scanning Receipt...
                </>
              ) : (
                "Start AI Parsing"
              )}
            </button>
          )}

          {error && (
            <div className="alert-bar alert-danger">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          {success && (
            <div className="alert-bar" style={{ background: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.2)", color: "#a7f3d0" }}>
              <CheckCircle size={18} /> Expense successfully parsed and recorded!
            </div>
          )}
        </div>

        {/* OCR Result verification */}
        <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <h2 style={{ fontSize: "20px", color: "white", display: "flex", alignItems: "center", gap: "10px" }}>
            <FileText size={20} style={{ color: "var(--primary)" }} /> Extracted Transaction
          </h2>

          {ocrData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <label>Merchant / Vendor Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={ocrData.merchant} 
                  onChange={(e) => handleFieldChange("merchant", e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label>Total Amount (₹)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  value={ocrData.amount} 
                  onChange={(e) => handleFieldChange("amount", e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select 
                  className="form-control" 
                  value={ocrData.category} 
                  onChange={(e) => handleFieldChange("category", e.target.value)}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat} style={{ background: "#110c26" }}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Date of Transaction</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={ocrData.date} 
                  onChange={(e) => handleFieldChange("date", e.target.value)} 
                />
              </div>

              <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.02)", padding: "8px 12px", borderRadius: "6px" }}>
                <span>Method used: <strong>{ocrData.source}</strong></span>
              </div>

              <button className="btn" onClick={handleConfirmAndAdd} style={{ width: "100%", background: "var(--success)", marginTop: "10px" }}>
                <CheckCircle size={18} /> Confirm & Add Expense
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-dim)", padding: "60px 0" }}>
              <FileText size={48} style={{ color: "var(--panel-border)", marginBottom: "16px" }} />
              <p>Scan results will appear here</p>
              <p style={{ fontSize: "12px", marginTop: "4px" }}>Verify extracted information before adding it to history</p>
            </div>
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scanLine {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
}
