import { useState, useRef, useEffect } from "react"
import NidusLogo from "@/components/NidusLogo"

export default function FirstRunOverlay({ onDone }) {
  const [draft, setDraft] = useState("")
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function commit(name) {
    const trimmed = (name || "").trim().slice(0, 60)
    if (trimmed) localStorage.setItem("nidus.firstName", trimmed)
    localStorage.setItem("nidus.firstRunSeen", "1")
    onDone()
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "#101F12",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "32px 24px",
    }}>
      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>

        <div style={{ marginBottom: 40 }}>
          <NidusLogo size={56} theme="dark" withWordmark withStrapline />
        </div>

        <div style={{ fontSize: 22, fontWeight: 700, color: "#E4EDE7", marginBottom: 8, textAlign: "center", letterSpacing: "-0.4px" }}>
          What should we call you?
        </div>
        <div style={{ fontSize: 14, color: "#8AAD91", marginBottom: 28, textAlign: "center", lineHeight: 1.65 }}>
          Just a first name. We'll use it to say hello.
        </div>

        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && commit(draft)}
          placeholder="Your first name"
          maxLength={60}
          style={{
            width: "100%", marginBottom: 12,
            padding: "12px 14px", borderRadius: 10,
            border: "1.5px solid #2A3A30",
            background: "#162018", color: "#E4EDE7",
            fontSize: 16, fontFamily: "inherit", outline: "none",
          }}
          onFocus={e => { e.target.style.borderColor = "#8AAD91" }}
          onBlur={e => { e.target.style.borderColor = "#2A3A30" }}
        />

        <button
          onClick={() => commit(draft)}
          style={{
            width: "100%", padding: "12px 0", marginBottom: 10,
            background: "#2D6E52", color: "#fff",
            border: "none", borderRadius: 10, fontSize: 15,
            fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            transition: "background 0.14s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#245a42" }}
          onMouseLeave={e => { e.currentTarget.style.background = "#2D6E52" }}
        >
          Continue
        </button>

        <button
          onClick={() => commit("")}
          style={{
            width: "100%", padding: "11px 0",
            background: "transparent", color: "#8AAD91",
            border: "1.5px solid #2A3A30", borderRadius: 10, fontSize: 14,
            fontFamily: "inherit", cursor: "pointer",
            transition: "border-color 0.14s, color 0.14s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#8AAD91" }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#2A3A30" }}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
