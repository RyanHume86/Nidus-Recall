import { C } from "@/lib/theme"

const SEP = <span aria-hidden="true" style={{ color: C.textMut, margin: "0 6px", fontSize: 12 }}>›</span>

function Crumb({ label, onClick }) {
  if (onClick) {
    return (
      <li style={{ display: "inline-flex", alignItems: "center" }}>
        <a
          href="#"
          onClick={e => { e.preventDefault(); onClick() }}
          style={{ color: C.textSec, fontSize: 13, textDecoration: "none", cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.color = C.accent)}
          onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}
        >
          {label}
        </a>
        {SEP}
      </li>
    )
  }
  return (
    <li style={{ display: "inline-flex", alignItems: "center" }}>
      <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }} aria-current="page">
        {label}
      </span>
    </li>
  )
}

export function Breadcrumbs({ view, selectedDeck, onNavigate }) {
  const crumbs = buildCrumbs(view, selectedDeck, onNavigate)
  if (crumbs.length <= 1) return null

  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumbs"
      style={{ marginBottom: 16, marginTop: -8 }}>
      <ol style={{ listStyle: "none", display: "flex", flexWrap: "wrap", alignItems: "center", padding: 0, margin: 0 }}>
        {crumbs.map((c, i) => (
          <Crumb key={i} label={c.label} onClick={i < crumbs.length - 1 ? c.onClick : undefined} />
        ))}
      </ol>
    </nav>
  )
}

function buildCrumbs(view, selectedDeck, onNavigate) {
  const library = { label: "Library", onClick: () => onNavigate("library") }

  switch (view) {
    case "library":
      return [{ label: "Library" }]
    case "deck":
      return [library, { label: selectedDeck || "Deck" }]
    case "study-select":
      return [{ label: "Study" }]
    case "session":
      return [{ label: "Study", onClick: () => onNavigate("study-select") }, { label: "Session in progress" }]
    case "free-study":
      return [{ label: "Study", onClick: () => onNavigate("study-select") }, { label: "Free study" }]
    case "stats":
      return [{ label: "Progress" }]
    case "settings":
      return [{ label: "Settings" }]
    default:
      return [{ label: "Library" }]
  }
}
