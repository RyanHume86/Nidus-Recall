import { useState } from "react"
import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import { isActive, buildReverseIndex } from "@/lib/fsrs"

export function FreeStudyView({ cards, studyDeckName, onDone, settings }) {
  const [order,      setOrder]     = useState("sequential")
  const [started,    setStarted]   = useState(false)
  const [studyList,  setStudyList] = useState([])
  const [idx,        setIdx]       = useState(0)
  const [revealed,   setRevealed]  = useState(false)
  const [noteOpen,   setNoteOpen]  = useState(false)

  const start = () => {
    const base = studyDeckName ? cards.filter(c=>c.deck===studyDeckName&&isActive(c)) : cards.filter(isActive)
    const list = order==="random" ? [...base].sort(()=>Math.random()-0.5) : base
    setStudyList(list); setStarted(true); setIdx(0); setRevealed(false)
  }

  if (!started) return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb24">
        <div className="rapp-pg-title">Free Study</div>
        <div className="rapp-pg-sub">Browse cards without affecting scheduling</div>
      </div>
      <div className="rapp-card rapp-mb20">
        <div className="rapp-sec-title">Card order</div>
        <div className="rapp-col" style={{ gap:10 }}>
          {[{id:"sequential",label:"Sequential"},{id:"random",label:"Random"}].map(o => (
            <label key={o.id} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontSize:14, color:C.textSec }}>
              <input type="radio" name="order" value={o.id} checked={order===o.id} onChange={()=>setOrder(o.id)} style={{ accentColor:C.accent }} />
              {o.label}
            </label>
          ))}
        </div>
      </div>
      <button className="rapp-btn rapp-btn-primary rapp-btn-full" onClick={start}>Start free study</button>
      <button className="rapp-btn rapp-btn-ghost rapp-btn-full" style={{ marginTop:10 }} onClick={onDone}>Cancel</button>
    </div>
  )

  if (idx >= studyList.length) return (
    <div className="rapp-wrap rapp-fadein" style={{ textAlign:"center", paddingTop:60 }}>
      <div style={{ fontSize:40, marginBottom:16 }}>&#10003;</div>
      <div style={{ fontSize:17, fontWeight:600, color:C.text, marginBottom:8 }}>All cards seen</div>
      <div style={{ fontSize:14, color:C.textMut, lineHeight:1.75, marginBottom:24 }}>You've gone through all {studyList.length} cards.</div>
      <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
        <button className="rapp-btn rapp-btn-ghost" onClick={start}>Again</button>
        <button className="rapp-btn rapp-btn-primary" onClick={onDone}>Done</button>
      </div>
    </div>
  )

  const card     = studyList[idx]
  const { matureModeEnabled=true, matureCardThreshold=30 } = settings||{}
  const isMature = matureModeEnabled && card != null && card.stability != null && card.stability >= matureCardThreshold
  const next = () => { setIdx(i=>i+1); setRevealed(false); setNoteOpen(false) }
  const prev = () => { if (idx>0) { setIdx(i=>i-1); setRevealed(false); setNoteOpen(false) } }

  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-row rapp-sb rapp-mb14">
        <span className="rapp-phase-tag">Free study · {studyDeckName||"All decks"}</span>
        <div className="rapp-row rapp-gap8">
          <span className="rapp-ts">{idx+1} / {studyList.length}</span>
          <button className="rapp-btn rapp-btn-ghost" style={{ padding:"6px 12px", fontSize:12 }} onClick={onDone}>Done</button>
        </div>
      </div>

      <div className="rapp-progress rapp-mb14">
        <div className="rapp-progress-fill" style={{ width:`${Math.round(((idx+1)/studyList.length)*100)}%` }} />
      </div>

      <div className="rapp-study-card rapp-mb16">
        {(card.tags||[]).length > 0 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
            {(card.tags||[]).map((t,i) => <span key={i} className="nid-tag">{t}</span>)}
          </div>
        )}
        {(card.contentType || isMature || card.stakes_flag) && (
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            {card.contentType ? <span className="nid-ct-chip" style={{ marginBottom:0 }}>{card.contentType}</span> : <span />}
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              {isMature && <span style={{ fontSize:10, fontWeight:500, color:"var(--sage)" }}>Mature</span>}
              {card.stakes_flag && <div style={{ width:8, height:8, borderRadius:"50%", background:C.accent, flexShrink:0 }} />}
            </div>
          </div>
        )}
        <div className="nid-study-label">Question</div>
        <p className="rapp-card-front">{card.front}</p>
        {revealed && (
          <div className="rapp-back-reveal">
            <div className="rapp-card-sep" />
            <div className="nid-study-label">Answer</div>
            <p className="rapp-card-back">{card.back}</p>
            {card.elaboration && (
              <div style={{ marginTop:12 }}>
                <div className="nid-note-toggle" onClick={()=>setNoteOpen(o=>!o)}>
                  {Ico.chevron(12, noteOpen)}<span>Note</span>
                </div>
                {noteOpen && <div className="nid-note-body rapp-fadein">{card.elaboration}</div>}
              </div>
            )}
            {card.anchor && (
              <div className="nid-anchor-block rapp-fadein">
                <div className="nid-anchor-label">Your memory anchor</div>
                <div className="nid-anchor-text">{card.anchor}</div>
              </div>
            )}
            {isMature && revealed && (() => {
              const freeReverseIndex = buildReverseIndex(cards)
              const outgoing = (card.connects_to || []).filter(id => cards.some(c => c.id === id))
              const incoming = (freeReverseIndex[card.id] || []).filter(id => cards.some(c => c.id === id))
              const bothExist = outgoing.length > 0 && incoming.length > 0
              if (outgoing.length === 0 && incoming.length === 0) {
                return <p style={{ fontSize:13, color:C.textMut, marginTop:12, fontStyle:"italic" }}>Can you name one concept this connects to?</p>
              }
              return (
                <div className="nid-connects-block rapp-fadein">
                  {outgoing.length > 0 && (
                    <>
                      {bothExist && <div className="nid-connects-label">You linked:</div>}
                      {!bothExist && <div className="nid-connects-label">Connected concepts</div>}
                      {outgoing.map(id => {
                        const linked = cards.find(c => c.id === id)
                        return linked ? <div key={id} className="nid-connects-item">· {linked.front}</div> : null
                      })}
                    </>
                  )}
                  {incoming.length > 0 && (
                    <>
                      {bothExist && <div className="nid-connects-label" style={{ marginTop:8 }}>Linked by:</div>}
                      {!bothExist && <div className="nid-connects-label">Linked by:</div>}
                      {incoming.map(id => {
                        const linked = cards.find(c => c.id === id)
                        return linked ? <div key={id} className="nid-connects-item">· {linked.front}</div> : null
                      })}
                    </>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {!revealed ? (
        <button className="rapp-btn-reveal" onClick={()=>setRevealed(true)}>Show answer</button>
      ) : (
        <div style={{ display:"flex", gap:10 }}>
          {idx>0 && <button className="rapp-btn rapp-btn-ghost" style={{ flex:1 }} onClick={prev}>&#8592; Prev</button>}
          <button className="rapp-btn rapp-btn-primary" style={{ flex:2 }} onClick={next}>
            {idx+1<studyList.length?"Next →":"Finish"}
          </button>
        </div>
      )}
    </div>
  )
}
