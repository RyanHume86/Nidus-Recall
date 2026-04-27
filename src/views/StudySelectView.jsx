import { useState } from "react"
import { getGreeting } from "@/lib/greeting"
import { C } from "@/lib/theme"
import { getDueWithCatchup, getNew, isActive } from "@/lib/fsrs"
import { isInSleepWindow } from "@/lib/settings"

export function StudySelectView({ cards, decks, settings, onStartSRS, onStartFree, onStartInterleaved, cardsLoading }) {
  const [deck, setDeck] = useState("all")
  const [mode, setMode] = useState("srs")
  const [interleavedDecks, setInterleavedDecks] = useState([])
  const [focused, setFocused] = useState(false)
  const { newCardCap=15, reviewCap=100, catchupDays=7, attentionDeclarationEnabled=true } = settings||{}

  const filtered = deck==="all" ? cards : cards.filter(c=>c.deck===deck)
  const dueCount  = getDueWithCatchup(filtered, reviewCap, catchupDays, cards).length
  const newCount  = getNew(filtered).slice(0, newCardCap).length
  const freeCount = filtered.filter(isActive).length
  // sleepWindowActive: true when sleepPrefersReviews is on AND we are in the sleep window.
  // When active, new cards are capped to 0 for this session.
  const sleepWindowActive = !!(settings?.sleepPrefersReviews && isInSleepWindow(settings))
  const effectiveNewCount = sleepWindowActive ? 0 : newCount
  const canStart  = mode==="srs" ? (dueCount>0||effectiveNewCount>0) : mode==="interleaved" ? (getDueWithCatchup(cards.filter(c=>interleavedDecks.length===0||interleavedDecks.includes(c.deck)), reviewCap, catchupDays, cards).length > 0) : freeCount>0

  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb24">
        <div className="rapp-pg-title">{getGreeting(localStorage.getItem("nidus.firstName"))}</div>
        <div className="rapp-pg-sub">Ready when you are.</div>
      </div>

      <div className="rapp-col" style={{ gap:10, marginBottom:20 }}>
        {[
          { id:"srs",          title:"Spaced Repetition", sub:"FSRS scheduling · records progress" },
          { id:"interleaved",  title:"Interleaved Review", sub:"Mixes decks during the session. Often harder during practice, often better for long-term retention (Rohrer and Taylor, J Educ Psychol 2007; Birnbaum et al., Mem Cognit 2013)." },
          { id:"free",         title:"Free Study",         sub:"Browse cards freely · nothing recorded" },
        ].map(m => (
          <div key={m.id} className={`nid-mode-card${mode===m.id?" selected":""}`} onClick={()=>setMode(m.id)}>
            <div style={{ fontSize:15, fontWeight:600, color:mode===m.id?C.accent:C.text, marginBottom:4 }}>{m.title}</div>
            <div style={{ fontSize:12, color:C.textMut, lineHeight:1.55 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="rapp-mb20">
        <label className="rapp-label">Deck</label>
        <select className="rapp-select" value={deck} onChange={e=>setDeck(e.target.value)}>
          <option value="all">All decks</option>
          {decks.map(d=><option key={d}>{d}</option>)}
        </select>
      </div>

      {mode==="srs" && (
        <div className="rapp-card rapp-mb20">
          <div className="rapp-row" style={{ gap:28 }}>
            <div><span style={{ fontSize:22, fontWeight:700, color:dueCount>0?C.accent:C.textMut }}>{dueCount}</span><span className="rapp-ts"> due</span></div>
            <div><span style={{ fontSize:22, fontWeight:700, color:(sleepWindowActive?0:newCount)>0?C.text:C.textMut }}>{sleepWindowActive ? 0 : newCount}</span><span className="rapp-ts"> new</span></div>
          </div>
          {sleepWindowActive && (dueCount>0||newCount>0) && (
            <p style={{ fontSize:12, color:C.textMut, marginTop:10, lineHeight:1.6 }}>
              Bedtime window: reviews only. New cards are paused until tomorrow (Diekelmann and Born, 2010).
            </p>
          )}
          {isInSleepWindow(settings) && !sleepWindowActive && (dueCount>0||newCount>0) && (
            <p style={{ fontSize:12, color:C.textMut, marginTop:10, lineHeight:1.6 }}>
              Reviewing before sleep consolidates memory during slow-wave sleep.
            </p>
          )}
          {attentionDeclarationEnabled && canStart && (
            <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:14, cursor:"pointer" }}
              onClick={() => setFocused(f=>!f)}>
              <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${focused?C.accent:C.border}`, background:focused?C.accent:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.14s" }}>
                {focused && <span style={{ color:"#fff", fontSize:12, lineHeight:1 }}>✓</span>}
              </div>
              <span style={{ fontSize:13, color:focused?C.text:C.textSec, userSelect:"none" }}>
                {focused ? "Focused session" : "I'm focused on this session"}
              </span>
              {focused && <div style={{ width:6, height:6, borderRadius:"50%", background:C.accent, flexShrink:0 }} />}
            </div>
          )}
        </div>
      )}

      {mode==="free" && (
        <div className="rapp-card rapp-mb20">
          <div><span style={{ fontSize:22, fontWeight:700, color:C.text }}>{freeCount}</span><span className="rapp-ts"> active card{freeCount!==1?"s":""}</span></div>
        </div>
      )}

      {mode==="interleaved" && (
        <div className="rapp-card rapp-mb20">
          <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Decks to interleave</div>
          <div style={{ marginBottom:8 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:C.textSec, marginBottom:6 }}>
              <input type="checkbox" checked={interleavedDecks.length===0}
                onChange={() => setInterleavedDecks([])} style={{ accentColor:C.accent }} />
              All decks
            </label>
            {decks.map(d => (
              <label key={d} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:C.textSec, marginBottom:4 }}>
                <input type="checkbox"
                  checked={interleavedDecks.includes(d)}
                  onChange={() => setInterleavedDecks(ids => ids.includes(d) ? ids.filter(x=>x!==d) : [...ids, d])}
                  style={{ accentColor:C.accent }} />
                {d}
              </label>
            ))}
          </div>
        </div>
      )}
      {cardsLoading && (
        <p style={{ textAlign:"center", fontSize:12, color:C.textMut, marginBottom:10 }}>
          Loading cards… counts may be incomplete.
        </p>
      )}
      <button className="rapp-btn rapp-btn-primary rapp-btn-full" disabled={!canStart || cardsLoading}
        onClick={() => {
          if (mode==="srs") onStartSRS(deck, sleepWindowActive ? 0 : null, focused)
          else if (mode==="interleaved") onStartInterleaved(interleavedDecks)
          else onStartFree(deck)
        }}>
        {cardsLoading ? "Loading cards…" : mode==="srs" ? "Start session" : mode==="interleaved" ? "Start interleaved review" : "Start free study"}
      </button>

      {(mode==="srs" || mode==="interleaved") && !canStart && !cardsLoading && (
        <p style={{ textAlign:"center", fontSize:13, color:C.textMut, marginTop:12 }}>
          You're all caught up. Check back tomorrow, or add new cards to keep the momentum going.
        </p>
      )}
    </div>
  )
}
