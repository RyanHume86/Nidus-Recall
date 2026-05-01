import { Tooltip } from "@/components/Tooltip"
import { C } from "@/lib/theme"

export const CONTENT_TYPES = ["Factual", "Mechanism", "Clinical Reasoning", "Anatomy", "Pathology"]

const DESCRIPTIONS = {
  "Factual":           "Isolated recall — definitions, values, names",
  "Mechanism":         "How and why — pathways, processes, explanations",
  "Clinical Reasoning":"Diagnosis, management, decision-making",
  "Anatomy":           "Structure, relations, landmarks",
  "Pathology":         "Disease processes, histology, findings",
}

const LS_KEY = "nidus.lastContentType"

export function readLastContentType() {
  try {
    const v = localStorage.getItem(LS_KEY)
    return CONTENT_TYPES.includes(v) ? v : "Factual"
  } catch {
    return "Factual"
  }
}

export function ContentTypeChips({ value, onChange }) {
  const handleSelect = (t) => {
    try { localStorage.setItem(LS_KEY, t) } catch {}
    onChange(t)
  }

  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }} role="group" aria-label="Content type">
      {CONTENT_TYPES.map(t => {
        const selected = value === t
        return (
          <Tooltip key={t} label={DESCRIPTIONS[t]}>
            <button
              type="button"
              data-testid={`ct-chip-${t.replace(/\s+/g, "-")}`}
              aria-pressed={selected}
              onClick={() => handleSelect(t)}
              style={{
                padding: "4px 10px",
                borderRadius: 20,
                border: `1.5px solid ${selected ? C.accent : C.border}`,
                background: selected ? C.accent : C.elevated,
                color: selected ? "#fff" : C.text,
                fontSize: 12,
                fontWeight: selected ? 600 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              {t}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
