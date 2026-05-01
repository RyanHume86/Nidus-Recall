import { useState, useEffect, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import * as storage from "@/api/storage"
import { C } from "@/lib/theme"

// Shows all CardHistory records for a card, newest first.
// The original content before the first AI change is always preserved and visible.
// If card + onRevert are supplied, each entry shows a "Revert to this version" button.
// Confirming revert writes a new CardHistory entry (append-only) then calls onRevert(snapshot).
const HISTORY_VIRTUAL_THRESHOLD = 50

export function CardHistoryModal({ cardId, card, onClose, onRevert }) {
  const [history,      setHistory]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [revertTarget, setRevertTarget] = useState(null)  // history entry pending confirmation
  const [reverting,    setReverting]    = useState(false)
  const historyListRef = useRef(null)

  useEffect(() => {
    storage.listCardHistory(cardId)
      .then(h => { setHistory(h); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [cardId])

  const handleConfirmRevert = async () => {
    if (!revertTarget?.content_snapshot) return
    setReverting(true)
    try {
      // Append-only: record this reversion in history
      await storage.saveCardHistory(
        cardId,
        revertTarget.content_snapshot,
        'user',
        null,
      )
      onRevert(revertTarget.content_snapshot)
      onClose()
    } catch {
      setReverting(false)
    }
  }

  const current = card ? { front: card.front || '', back: card.back || '' } : null

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(28,40,32,0.5)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:C.surface, borderRadius:22, width:"100%", maxWidth:480, maxHeight:"80vh", overflowY:"auto", padding:"28px 24px", boxShadow:"0 8px 48px rgba(28,40,32,0.22)" }}>

        {revertTarget ? (
          /* ── Revert confirmation pane ── */
          <div>
            <div className="rapp-row rapp-sb rapp-mb16">
              <span style={{ fontSize:15, fontWeight:600, color:C.text }}>Revert to v{revertTarget.version}?</span>
              <button aria-label="Cancel revert" onClick={() => setRevertTarget(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.textMut }}>x</button>
            </div>
            <p style={{ fontSize:12, color:C.textMut, marginBottom:14, lineHeight:1.6 }}>
              This will update the card to the content below. A new history entry will be saved so you can undo this later.
            </p>

            {current && revertTarget.content_snapshot && (() => {
              const snap    = revertTarget.content_snapshot
              const frontChanged = snap.front !== current.front
              const backChanged  = snap.back  !== current.back
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
                  {frontChanged && (
                    <div style={{ borderRadius:10, overflow:"hidden", border:`1px solid ${C.border}` }}>
                      <div style={{ padding:"6px 10px", background:C.bg, fontSize:11, fontWeight:600, color:C.textMut }}>Front</div>
                      <div style={{ padding:"8px 10px", background:"#FFF5F5", fontSize:12, color:C.again, lineHeight:1.5, borderBottom:`1px solid ${C.border}` }}>
                        <span style={{ fontWeight:600, marginRight:6 }}>Current:</span>{current.front}
                      </div>
                      <div style={{ padding:"8px 10px", background:"#F0FAF4", fontSize:12, color:C.good, lineHeight:1.5 }}>
                        <span style={{ fontWeight:600, marginRight:6 }}>Reverting to:</span>{snap.front}
                      </div>
                    </div>
                  )}
                  {backChanged && (
                    <div style={{ borderRadius:10, overflow:"hidden", border:`1px solid ${C.border}` }}>
                      <div style={{ padding:"6px 10px", background:C.bg, fontSize:11, fontWeight:600, color:C.textMut }}>Back</div>
                      <div style={{ padding:"8px 10px", background:"#FFF5F5", fontSize:12, color:C.again, lineHeight:1.5, borderBottom:`1px solid ${C.border}` }}>
                        <span style={{ fontWeight:600, marginRight:6 }}>Current:</span>{current.back}
                      </div>
                      <div style={{ padding:"8px 10px", background:"#F0FAF4", fontSize:12, color:C.good, lineHeight:1.5 }}>
                        <span style={{ fontWeight:600, marginRight:6 }}>Reverting to:</span>{snap.back}
                      </div>
                    </div>
                  )}
                  {!frontChanged && !backChanged && (
                    <p style={{ fontSize:13, color:C.textMut, fontStyle:"italic" }}>No content differences; front and back are already identical to this version.</p>
                  )}
                </div>
              )
            })()}

            <div style={{ display:"flex", gap:8 }}>
              <button className="rapp-btn rapp-btn-ghost" style={{ flex:1 }} onClick={() => setRevertTarget(null)} disabled={reverting}>Cancel</button>
              <button className="rapp-btn rapp-btn-primary" style={{ flex:1 }} onClick={handleConfirmRevert} disabled={reverting}>
                {reverting ? "Reverting..." : "Confirm revert"}
              </button>
            </div>
          </div>
        ) : (
          /* ── History list pane ── */
          <div>
            <div className="rapp-row rapp-sb rapp-mb16">
              <span style={{ fontSize:15, fontWeight:600, color:C.text }}>Edit history</span>
              <button aria-label="Close history" onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.textMut }}>x</button>
            </div>
            <p style={{ fontSize:12, color:C.textMut, marginBottom:14, lineHeight:1.6 }}>AI-assisted edits are logged here. The content before the first AI change is always preserved.</p>
            {loading && <p style={{ fontSize:13, color:C.textMut }}>Loading...</p>}
            {error   && <p style={{ fontSize:13, color:C.again }}>Could not load history: {error}</p>}
            {history && history.length === 0 && <p style={{ fontSize:13, color:C.textMut, fontStyle:"italic" }}>No AI edits recorded for this card.</p>}
            {history && history.length > 0 && (
              <HistoryList history={history} onRevert={onRevert} setRevertTarget={setRevertTarget} listRef={historyListRef} />
            )}
          </div>
        )}

      </div>
    </div>
  )
}

function HistoryList({ history, onRevert, setRevertTarget, listRef }) {
  const virtualizer = useVirtualizer({
    count: history.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 120,
    overscan: 5,
    enabled: history.length > HISTORY_VIRTUAL_THRESHOLD,
  })

  const renderRow = (h, i) => (
    <div className="nid-history-row">
      <div style={{ flexShrink:0, marginTop:4, width:8, height:8, borderRadius:"50%", background: h.modified_by==="ai" ? "#2E7B88" : "#7BA090" }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", gap:6, marginBottom:4, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:12, fontWeight:600, color:C.text }}>v{h.version}</span>
          <span style={{ fontSize:11, color:C.textMut }}>{h.modified_by==="ai" ? `AI (${h.ai_model_used||"unknown"})` : "You"}</span>
          {h.modified_at && <span style={{ fontSize:11, color:C.textMut }}>{new Date(h.modified_at).toLocaleDateString()}</span>}
          {onRevert && h.content_snapshot && (
            <button
              onClick={() => setRevertTarget(h)}
              style={{ marginLeft:"auto", padding:"2px 8px", borderRadius:6, border:`1px solid ${C.border}`, background:"none", cursor:"pointer", fontSize:11, color:C.textMut, fontFamily:"inherit" }}>
              Revert to this version
            </button>
          )}
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
  )

  if (history.length <= HISTORY_VIRTUAL_THRESHOLD) {
    return <>{history.map((h, i) => <div key={h.id||i}>{renderRow(h, i)}</div>)}</>
  }

  return (
    <div ref={listRef} style={{ height: "calc(min(80vh, 600px) - 140px)", overflowY: "auto" }}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map(vi => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)`, paddingBottom: 12 }}
          >
            {renderRow(history[vi.index], vi.index)}
          </div>
        ))}
      </div>
    </div>
  )
}
