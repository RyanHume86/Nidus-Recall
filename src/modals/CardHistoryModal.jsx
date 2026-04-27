import { useState, useEffect } from "react"
import * as storage from "@/api/storage"
import { C } from "@/lib/theme"

// Shows all CardHistory records for a card, newest first.
// The original content before the first AI change is always preserved and visible.
export function CardHistoryModal({ cardId, onClose }) {
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  useEffect(() => {
    storage.listCardHistory(cardId)
      .then(h => { setHistory(h); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [cardId])
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(28,40,32,0.5)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:C.surface, borderRadius:22, width:"100%", maxWidth:480, maxHeight:"80vh", overflowY:"auto", padding:"28px 24px", boxShadow:"0 8px 48px rgba(28,40,32,0.22)" }}>
        <div className="rapp-row rapp-sb rapp-mb16">
          <span style={{ fontSize:15, fontWeight:600, color:C.text }}>Edit history</span>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.textMut }}>x</button>
        </div>
        <p style={{ fontSize:12, color:C.textMut, marginBottom:14, lineHeight:1.6 }}>AI-assisted edits are logged here. The content before the first AI change is always preserved.</p>
        {loading && <p style={{ fontSize:13, color:C.textMut }}>Loading...</p>}
        {error   && <p style={{ fontSize:13, color:C.again }}>Could not load history: {error}</p>}
        {history && history.length === 0 && <p style={{ fontSize:13, color:C.textMut, fontStyle:"italic" }}>No AI edits recorded for this card.</p>}
        {history && history.map((h,i) => (
          <div key={h.id||i} className="nid-history-row">
            <div style={{ flexShrink:0, marginTop:4, width:8, height:8, borderRadius:"50%", background: h.modified_by==="ai" ? "#2E7B88" : "#7BA090" }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", gap:6, marginBottom:4, flexWrap:"wrap" }}>
                <span style={{ fontSize:12, fontWeight:600, color:C.text }}>v{h.version}</span>
                <span style={{ fontSize:11, color:C.textMut }}>{h.modified_by==="ai" ? `AI (${h.ai_model_used||"unknown"})` : "You"}</span>
                {h.modified_at && <span style={{ fontSize:11, color:C.textMut }}>{new Date(h.modified_at).toLocaleDateString()}</span>}
              </div>
              {h.content_snapshot && (
                <div style={{ background:C.elevated, borderRadius:8, padding:"8px 10px" }}>
                  <p style={{ fontSize:11, color:C.textMut, margin:"0 0 2px" }}>Front</p>
                  <p style={{ fontSize:12, color:C.text, margin:"0 0 8px", lineHeight:1.5 }}>{h.content_snapshot.front}</p>
                  <p style={{ fontSize:11, color:C.textMut, margin:"0 0 2px" }}>Back</p>
                  <p style={{ fontSize:12, color:C.text, margin:0, lineHeight:1.5 }}>{h.content_snapshot.back}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
