import { C, ANCHOR_MAX } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import { CharCount } from "@/components/CharCount"

export function AnchorToggle({ value, onChange, open, onToggle }) {
  return (
    <div>
      <div className="nid-note-toggle" onClick={onToggle}>
        {Ico.chevron(13, open)}
        <span>Memory anchor</span>
        <span style={{ fontSize:11, color:C.textMut, marginLeft:4 }}>(optional)</span>
        {value && !open && <span style={{ fontSize:11, color:C.accent, marginLeft:6 }}>●</span>}
        <span style={{ marginLeft:"auto", fontSize:12, color:C.textMut, cursor:"default" }}
          title="Anchoring a personal memory to a card significantly improves long-term recall.">ⓘ</span>
      </div>
      {open && (
        <div className="rapp-fadein">
          <textarea className="rapp-textarea" rows={3} value={value} maxLength={ANCHOR_MAX}
            onChange={e => onChange(e.target.value)}
            placeholder="A case, a moment, or a story that connects this to something you already know." />
          <CharCount current={value.length} max={ANCHOR_MAX} />
        </div>
      )}
    </div>
  )
}
