import { C, NOTE_MAX } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import { CharCount } from "@/components/CharCount"

export function NoteToggle({ value, onChange, open, onToggle }) {
  return (
    <div>
      <button type="button" className="nid-note-toggle" aria-expanded={open} onClick={onToggle}>
        {Ico.chevron(13, open)}
        <span>Note / Context</span>
        <span style={{ fontSize:11, color:C.textMut, marginLeft:4 }}>(optional)</span>
        {value && !open && <span style={{ fontSize:11, color:C.accent, marginLeft:6 }}>●</span>}
      </button>
      {open && (
        <div className="rapp-fadein">
          <textarea className="rapp-textarea" rows={2} value={value} maxLength={NOTE_MAX}
            onChange={e => onChange(e.target.value)}
            placeholder="Context, memory hook, or related concept." />
          <CharCount current={value.length} max={NOTE_MAX} />
        </div>
      )}
    </div>
  )
}
