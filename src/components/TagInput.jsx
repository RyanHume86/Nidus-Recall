import { useState } from "react"
import { TAG_MAX_LEN, TAG_MAX_COUNT } from "@/lib/theme"

export function TagInput({ tags=[], onChange }) {
  const [input, setInput] = useState("")
  const addTag = () => {
    const t = input.trim().slice(0, TAG_MAX_LEN)
    if (!t || tags.includes(t) || tags.length >= TAG_MAX_COUNT) return
    onChange([...tags, t]); setInput("")
  }
  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
          {tags.map((t,i) => (
            <span key={i} className="nid-tag">
              {t}
              <span className="nid-tag-rm" onClick={() => onChange(tags.filter((_,j)=>j!==i))}>×</span>
            </span>
          ))}
        </div>
      )}
      {tags.length < TAG_MAX_COUNT && (
        <input className="rapp-input" style={{ fontSize:13 }} value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key==="Enter"||e.key===",") { e.preventDefault(); addTag() } }}
          placeholder={`Add tag, Enter to confirm${tags.length>0?` · ${TAG_MAX_COUNT-tags.length} left`:""}`}
          maxLength={TAG_MAX_LEN}
        />
      )}
    </div>
  )
}
