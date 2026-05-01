import { useState } from "react"
import { base44 } from "@/api/base44Client"
import { C } from "@/lib/theme"
import { useAuth } from "@/lib/AuthContext"

const LS_KEY = "nidus.sleepOnboardDone"

/** Marks the onboarding as complete for the current session / account. */
async function persistDone(isAuthenticated) {
  if (isAuthenticated) {
    try {
      await base44.auth.updateMe({ onboarding_sleep_completed: true })
    } catch {}
  }
  // Always write local fallback so anonymous users aren't re-prompted.
  try { localStorage.setItem(LS_KEY, "1") } catch {}
}

function Toggle({ checked, onChange }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11, cursor: "pointer", flexShrink: 0,
        background: checked ? C.accent : C.elevated,
        position: "relative", transition: "background 0.2s",
      }}
    >
      <div style={{
        position: "absolute", top: 3,
        left: checked ? 21 : 3, width: 16, height: 16, borderRadius: 8,
        background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </div>
  )
}

/**
 * First-run modal that captures sleep schedule preferences.
 * Shows once per account (onboarding_sleep_completed flag on User entity).
 * Falls back to localStorage for anonymous sessions.
 *
 * Props:
 *   settings       — current app settings object
 *   onUpdateSettings(s) — persists settings to localStorage / store
 *   onDone()       — called after save or skip; parent dismisses the modal
 */
export function SleepScheduleModal({ settings, onUpdateSettings, onDone }) {
  const { isAuthenticated } = useAuth()

  const [bedtime, setBedtime]   = useState(settings?.sleepBedtime  || "22:00")
  const [windowMin, setWindowMin] = useState(settings?.sleepWindowMinutes ?? 90)
  const [banner, setBanner]     = useState(settings?.sleepBannerEnabled ?? true)
  const [saving, setSaving]     = useState(false)

  const handleSave = async () => {
    setSaving(true)
    onUpdateSettings({
      ...settings,
      sleepBedtime:        bedtime  || null,
      sleepWindowMinutes:  windowMin,
      sleepBannerEnabled:  banner,
    })
    await persistDone(isAuthenticated)
    setSaving(false)
    onDone()
  }

  const handleSkip = async () => {
    await persistDone(isAuthenticated)
    onDone()
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(16,31,18,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div style={{
        background: C.surface, borderRadius: 22,
        width: "100%", maxWidth: 420,
        maxHeight: "90vh", overflowY: "auto",
        padding: "28px 24px 32px",
        boxShadow: "0 8px 40px rgba(28,40,32,0.22)",
      }}>
        {/* Header */}
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.accent, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            One-time setup
          </span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6, letterSpacing: "-0.3px" }}>
          Set your bedtime
        </div>
        <p style={{ fontSize: 13, color: C.textMut, lineHeight: 1.65, marginBottom: 24 }}>
          Nidus can remind you to review cards before sleep — when memory consolidation is highest. Takes 30 seconds. You can change this any time in Settings → Sleep.
        </p>

        {/* Bedtime */}
        <div style={{ marginBottom: 20 }}>
          <label className="rapp-label">Bedtime</label>
          <input
            type="time"
            className="rapp-input"
            value={bedtime}
            onChange={e => setBedtime(e.target.value)}
            style={{ maxWidth: 150 }}
          />
          <p style={{ fontSize: 12, color: C.textMut, marginTop: 6, lineHeight: 1.5 }}>
            A banner will appear during the review window before this time.
          </p>
        </div>

        {/* Review window */}
        <div style={{ marginBottom: 20 }}>
          <label className="rapp-label">Review window</label>
          <select
            className="rapp-select"
            value={windowMin}
            onChange={e => setWindowMin(Number(e.target.value))}
            style={{ maxWidth: 160 }}
          >
            <option value={60}>60 min before</option>
            <option value={90}>90 min before</option>
            <option value={120}>120 min before</option>
          </select>
        </div>

        {/* Banner toggle */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label className="rapp-label" style={{ marginBottom: 0 }}>Show sleep reminder banner</label>
            <Toggle checked={banner} onChange={setBanner} />
          </div>
          <p style={{ fontSize: 12, color: C.textMut, marginTop: 6, lineHeight: 1.5 }}>
            Reminds you to review during the window before bedtime.
          </p>
        </div>

        {/* Actions */}
        <button
          className="rapp-btn rapp-btn-primary"
          style={{ width: "100%", marginBottom: 10 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save sleep schedule"}
        </button>
        <button
          className="rapp-btn rapp-btn-ghost"
          style={{ width: "100%" }}
          onClick={handleSkip}
          disabled={saving}
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}

/** Returns true if the sleep onboarding has been completed. */
export function sleepOnboardComplete(user, isAuthenticated) {
  if (isAuthenticated && user?.onboarding_sleep_completed) return true
  try { return localStorage.getItem(LS_KEY) === "1" } catch { return false }
}
