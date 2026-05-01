import { C } from "@/lib/theme"

export function EmptyState({ icon = "📭", title, body, action }) {
  return (
    <div
      data-testid="empty-state"
      style={{
        textAlign: "center",
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 36, lineHeight: 1 }}>{icon}</span>
      <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: "8px 0 0" }}>{title}</p>
      {body && <p style={{ fontSize: 13, color: C.textMut, margin: 0, lineHeight: 1.65, maxWidth: 280 }}>{body}</p>}
      {action && (
        <button
          className="rapp-btn rapp-btn-primary"
          style={{ marginTop: 12, padding: "8px 18px", fontSize: 13 }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div
      data-testid="error-state"
      style={{
        textAlign: "center",
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 32, lineHeight: 1 }}>⚠️</span>
      <p style={{ fontSize: 14, fontWeight: 600, color: C.again, margin: "8px 0 0" }}>Something went wrong</p>
      {message && <p style={{ fontSize: 12, color: C.textMut, margin: 0, lineHeight: 1.6, maxWidth: 280 }}>{message}</p>}
      {onRetry && (
        <button
          className="rapp-btn rapp-btn-ghost"
          style={{ marginTop: 12, padding: "7px 16px", fontSize: 13 }}
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  )
}
