const BADGE_COLORS = {
  "Factual":           { bg:"#DFE8E3", text:"#1C2820" },
  "Mechanism":         { bg:"#EBF0ED", text:"#2E7B88" },
  "Clinical Reasoning":{ bg:"#EBF0ED", text:"#2D6E52" },
  "Anatomy":           { bg:"#EBF0ED", text:"var(--sage)" },
  "Pathology":         { bg:"#F5C8B8", text:"#3D1408" },
}

export function Badge({ type }) {
  const t = BADGE_COLORS[type] || { bg:"#EBF0ED", text:"#3A5246" }
  return <span className="rapp-badge" style={{ background:t.bg, color:t.text }}>{type}</span>
}
