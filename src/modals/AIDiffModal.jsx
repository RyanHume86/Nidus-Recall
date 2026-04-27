import { useState } from "react"
import { C } from "@/lib/theme"

// Displays original vs AI-proposed content side by side. User must click Accept,
// Edit before accepting, or Reject. No card is modified until Accept is clicked.
export function AIDiffModal({ original, proposed, isClinical, onApprove, onEdit, onReject }) {
  const [editMode, setEditMode] = useState(false)
  const [editedFront, setEditedFront] = useState(proposed.front)
  const [editedBack,  setEditedBack]  = useState(proposed.back)

  const wordDiff = (orig, next) => {
    const ow = orig.trim().split(/\s+/), nw = next.trim().split(/\s+/)
    const origSet = new Set(ow), nextSet = new Set(nw)
    const origH = ow.map((w,i) => !nextSet.has(w) ? <span key={i} className="nid-diff-del">{w} </span> : <span key={i}>{w} </span>)
    const nextH = nw.map((w,i) => !origSet.has(w) ? <span key={i} className="nid-diff-ins">{w} </span> : <span key={i}>{w} </span>)
    return { origH, nextH, changed: ow.some(w=>!nextSet.has(w)) || nw.some(w=>!origSet.has(w)) }
  }
  const fDiff = wordDiff(original.front, proposed.front)
  const bDiff = wordDiff(original.back, proposed.back)

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(28,40,32,0.5)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:C.surface, borderRadius:22, width:"100%", maxWidth:640, maxHeight:"90vh", overflowY:"auto", padding:"28px 24px", boxShadow:"0 8px 48px rgba(28,40,32,0.22)" }}>
        <div className="rapp-row rapp-sb rapp-mb20">
          <span style={{ fontSize:15, fontWeight:600, color:C.text }}>Review AI suggestion</span>
          <button onClick={onReject} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.textMut }}>x</button>
        </div>
        {isClinical && (
          <div className="nid-clinical-warn">
            AI-suggested changes to clinical content can contain subtle factual errors. Verify against a primary source before accepting.
          </div>
        )}
        <p style={{ fontSize:12, color:C.textMut, marginBottom:14, lineHeight:1.6 }}>Review the proposed changes. Nothing is saved until you click Accept.</p>
        {[{label:"Front",diff:fDiff,val:editedFront,setter:setEditedFront,rows:2},{label:"Back",diff:bDiff,val:editedBack,setter:setEditedBack,rows:4}].map(({label,diff,val,setter,rows})=>(
          <div key={label} style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.textMut, marginBottom:8 }}>{label}</div>
            {!editMode ? (
              <div style={{ display:"flex", gap:12 }}>
                <div className="nid-diff-col"><div className="nid-diff-col-label">Original</div><div className="nid-diff-original">{diff.origH}</div></div>
                <div className="nid-diff-col"><div className="nid-diff-col-label">Proposed</div><div className="nid-diff-proposed">{diff.nextH}</div></div>
              </div>
            ) : (
              <textarea className="rapp-textarea" rows={rows} value={val} onChange={e=>setter(e.target.value)} />
            )}
          </div>
        ))}
        {!fDiff.changed && !bDiff.changed && <p style={{ fontSize:12, color:C.textMut, fontStyle:"italic", marginBottom:12 }}>No changes detected.</p>}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {!editMode ? (
            <>
              <button onClick={onApprove} style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Accept</button>
              <button onClick={()=>setEditMode(true)} style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${C.border}`, background:"transparent", color:C.textSec, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Edit before accepting</button>
              <button onClick={onReject} style={{ flex:1, padding:"10px", borderRadius:10, border:"1px solid #E8B0A0", background:"transparent", color:C.again, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Reject</button>
            </>
          ) : (
            <>
              <button onClick={()=>onEdit({ front:editedFront, back:editedBack })} style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Accept edited version</button>
              <button onClick={()=>setEditMode(false)} style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${C.border}`, background:"transparent", color:C.textSec, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Back to diff</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
