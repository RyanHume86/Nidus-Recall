import { useState, useRef } from "react"
import { C } from "@/lib/theme"

export function Tooltip({ children, label, delay = 300 }) {
  const [visible, setVisible] = useState(false)
  const timer = useRef(null)

  const show = () => { timer.current = setTimeout(() => setVisible(true), delay) }
  const hide = () => { clearTimeout(timer.current); setVisible(false) }

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
            transform: "translateX(-50%)",
            background: C.text, color: "#fff", fontSize: 11, fontWeight: 500,
            padding: "4px 9px", borderRadius: 6, whiteSpace: "nowrap",
            pointerEvents: "none", zIndex: 300,
            boxShadow: "0 2px 8px rgba(28,40,32,0.18)",
          }}
        >
          {label}
        </span>
      )}
    </span>
  )
}
