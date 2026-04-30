import { useState, useRef } from "react"
import { C } from "@/lib/theme"

// Searchable single or multi-card selector used for prerequisite and connects_to.
// mode: "single" → value is id string | null; "multi" → value is id[]
export function CardPicker({ allCards, value, onChange, mode="single", excludeId=null, placeholder="Search cards…" }) {
  const [query, setQuery] = useState("")
  const inputRef = useRef(null)
  const selectedIds = mode==="single" ? (value ? [value] : []) : (value||[])
  const selected = selectedIds.map(id => (allCards||[]).find(c=>c.id===id)).filter(Boolean)
  const results = query.length < 1 ? [] : (allCards||[])
    .filter(c => !selectedIds.includes(c.id) && c.id !== excludeId && c.front.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6)
  const add = id => { onChange(mode==="single" ? id : [...selectedIds, id]); setQuery(""); setTimeout(()=>inputRef.current?.focus(), 0) }
  const remove = id => onChange(mode==="single" ? null : selectedIds.filter(x=>x!==id))
  return (
    <div>
      {selected.map(c => (
        <div key={c.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, padding:"7px 10px", background:C.elevated, borderRadius:8 }}>
          {c.contentType && <span className="nid-ct-chip" style={{ marginBottom:0, flexShrink:0 }}>{c.contentType}</span>}
          <span style={{ flex:1, fontSize:13, color:C.text, lineHeight:1.5 }}>{c.front}</span>
          <button onClick={()=>remove(c.id)} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMut, fontSize:16, lineHeight:1, padding:0, fontFamily:"inherit" }}>×</button>
        </div>
      ))}
      {(mode==="multi" || !value) && (
        <div style={{ position:"relative" }}>
          <input ref={inputRef} className="rapp-input" style={{ fontSize:13 }} value={query}
            onChange={e=>setQuery(e.target.value)} placeholder={placeholder} />
          {results.length > 0 && (
            <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:C.elevated, border:`1px solid ${C.border}`, borderRadius:8, maxHeight:200, overflowY:"auto", zIndex:20, boxShadow:"0 4px 12px rgba(28,40,32,0.1)" }}>
              {results.map(c => (
                <div key={c.id} onClick={()=>add(c.id)}
                  style={{ padding:"9px 12px", cursor:"pointer", fontSize:13, color:C.text, lineHeight:1.5, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:8 }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {c.contentType && <span className="nid-ct-chip" style={{ marginBottom:0, flexShrink:0 }}>{c.contentType}</span>}
                  <span>{c.front}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
