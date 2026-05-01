import { useState, useEffect, useRef } from "react"
import * as storage from "@/api/storage"
import * as offlineStore from "@/lib/offline-store"
import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import { addDays, localDateStr } from "@/lib/dates"
import { scheduleFSRS, getDue, getNew, getDueWithCatchup, buildReverseIndex } from "@/lib/fsrs"
import { renderClozeFront } from "@/lib/cloze"
import { computeCalibration, computeFatigueScore, assembleFrictionNote } from "@/lib/stats"
import { fitSchedulerParams } from "@/lib/fit-params"
import { OcclusionCardRenderer } from "@/components/OcclusionCardRenderer"
import VesicleDots from "@/components/VesicleDots"
import NidusLogo from "@/components/NidusLogo"

const INTENSITY_WEIGHT = { again:4, hard:3, good:2, easy:1 }
const INTENSITY_BREAK  = 40

export function SessionView({ cards, onUpdateCards, onSaveLog, onDone, settings, studyDeckName, log=[], capOverride=null, focused=false, isFirstStudy=false, onFirstStudyComplete=null, onFitParams=null, interleavedCards=null, onSessionCompleted=null }) {
  const { newCardCap=15, reviewCap=100, catchupDays=7, retentionTarget=0.9, matureModeEnabled=true, matureCardThreshold=30, fatigueAlertsEnabled=true } = settings||{}
  const effectiveCap = capOverride != null ? capOverride : reviewCap
  // Compute once at session start - snapshot of log at that moment
  const [fatigueScore] = useState(() => computeFatigueScore(log))

  const filtered = interleavedCards ? interleavedCards : studyDeckName ? cards.filter(c=>c.deck===studyDeckName) : cards

  const [dueBefore] = useState(() => {
    // Due cards before prerequisite filter (for detecting allGated)
    const rawDue = getDue(filtered)
    if (!rawDue.length) return 0
    if (rawDue.length <= effectiveCap) return rawDue.length
    return Math.min(effectiveCap, Math.ceil(rawDue.length/catchupDays))
  })
  const [dueCards] = useState(() => getDueWithCatchup(filtered, effectiveCap, catchupDays, cards))
  const [newCards] = useState(() => capOverride != null ? [] : getNew(filtered).slice(0, newCardCap))

  const initialPhase = dueCards.length>0?"warmup":newCards.length>0?"new":"empty"
  const [phase,      setPhase]      = useState(initialPhase)
  const [idx,        setIdx]        = useState(0)
  const [side,       setSide]       = useState(0)   // 0=question, 1=answer+rating
  const [answerDraft,setAnswerDraft]= useState("")
  const [noteOpen,   setNoteOpen]   = useState(false)
  const [stats,          setStats]          = useState({ reviewed:0, failed:0, newAdded:0, ratingBreakdown:{ again:0, hard:0, good:0, easy:0 } })
  const [contentTypeBreakdown, setContentTypeBreakdown] = useState({ Factual:0, Mechanism:0, "Clinical Reasoning":0, Anatomy:0, Pathology:0 })
  const [friction,       setFriction]       = useState("")
  const [lastAction,     setLastAction]     = useState(null)
  const [intensityPts,   setIntensityPts]   = useState(0)
  const [intensityCount, setIntensityCount] = useState(0)
  const [breakDismissed, setBreakDismissed] = useState(false)
  const [reverseIndex] = useState(() => buildReverseIndex(cards))
  const [ratedCardIds] = useState(() => new Set())
  const [endedEarly, setEndedEarly] = useState(false)
  const inputRef    = useRef(null)
  const handleRateRef = useRef(null)

  const list    = phase==="warmup" ? dueCards : newCards
  const card    = list[idx]
  const isMature = matureModeEnabled && card != null && card.stability != null && card.stability >= matureCardThreshold

  useEffect(() => {
    setSide(0); setAnswerDraft(""); setNoteOpen(false)
    setTimeout(()=>inputRef.current?.focus(), 80)
  }, [idx, phase])

  useEffect(() => {
    const handler = e => {
      if (e.target.tagName==="TEXTAREA"||e.target.tagName==="INPUT") return
      if (side===1) {
        if (e.key==="1") handleRateRef.current?.("again")
        if (e.key==="2") handleRateRef.current?.("hard")
        if (e.key==="3") handleRateRef.current?.("good")
        if (e.key==="4") handleRateRef.current?.("easy")
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [side])

  const advance = (ph, ci) => {
    const l = ph==="warmup" ? dueCards : newCards
    if (ci+1 < l.length) { setIdx(ci+1) }
    else if (ph==="warmup" && newCards.length>0) { setPhase("new"); setIdx(0) }
    else { setPhase("close") }
  }

  const handleRate = async rating => {
    if (!card) return
    const { stability, difficulty, interval } = scheduleFSRS(card, rating, retentionTarget, storage.getUserSchedulerParams()?.params || null)
    const isNew = phase==="new", failed = rating==="again"?1:0
    const newEntry = { date: new Date().toISOString(), rating }
    const newReviewCount = (card.reviewCount||0)+1
    const newLapses = rating==="again"?(card.lapses||0)+1:(card.lapses||0)
    const newRatingHistory = [...(card.ratingHistory||[]), newEntry].slice(-50)
    const newState = {
      stability, difficulty, interval,
      nextReview: addDays(interval),
      lastReview: localDateStr(),
      reviewCount: newReviewCount,
      lapses: newLapses,
      ratingHistory: newRatingHistory,
    }
    const updated = cards.map(c => c.id===card.id ? { ...c, ...newState } : c)
    // If offline, queue the rating for later sync; still update local React state normally.
    if (!navigator.onLine) {
      offlineStore.queueRating({
        cardClientId: card.id,
        rating,
        timestamp: new Date().toISOString(),
        newState,
      }).catch(() => {})
    }
    await onUpdateCards(updated)
    ratedCardIds.add(card.id)
    const ct = card.contentType || 'Factual'
    setLastAction({ cardId:card.id, prevInterval:card.interval, prevNextReview:card.nextReview,
      prevReviewCount:card.reviewCount||0, prevStability:card.stability, prevDifficulty:card.difficulty,
      prevLastReview:card.lastReview, prevLapses:card.lapses||0,
      statDelta:{ reviewed:isNew?0:1, failed, newAdded:isNew?1:0 }, phase, idx,
      rating, contentType: ct })
    setStats(s => ({ ...s, reviewed:s.reviewed+(isNew?0:1), failed:s.failed+failed, newAdded:s.newAdded+(isNew?1:0), ratingBreakdown:{ ...s.ratingBreakdown, [rating]:(s.ratingBreakdown[rating]||0)+1 } }))
    setContentTypeBreakdown(b => ({ ...b, [ct]:(b[ct]||0)+1 }))
    setIntensityPts(p => p + (INTENSITY_WEIGHT[rating]||2))
    setIntensityCount(n => n + 1)
    advance(phase, idx)
  }
  handleRateRef.current = handleRate

  const handleUndo = async () => {
    if (!lastAction) return
    const restored = cards.map(c => c.id===lastAction.cardId
      ? { ...c, interval:lastAction.prevInterval, nextReview:lastAction.prevNextReview,
          reviewCount:lastAction.prevReviewCount, stability:lastAction.prevStability,
          difficulty:lastAction.prevDifficulty, lastReview:lastAction.prevLastReview, lapses:lastAction.prevLapses }
      : c)
    await onUpdateCards(restored)
    setStats(s => ({ ...s, reviewed:s.reviewed-lastAction.statDelta.reviewed, failed:s.failed-lastAction.statDelta.failed, newAdded:s.newAdded-lastAction.statDelta.newAdded, ratingBreakdown:{ ...s.ratingBreakdown, [lastAction.rating]:Math.max(0,(s.ratingBreakdown[lastAction.rating]||0)-1) } }))
    setContentTypeBreakdown(b => ({ ...b, [lastAction.contentType]:Math.max(0,(b[lastAction.contentType]||0)-1) }))
    setIdx(lastAction.idx); setPhase(lastAction.phase); setLastAction(null)
  }

  const handleClose = async () => {
    const frictionNote = assembleFrictionNote(friction)
    await onSaveLog({
      date: new Date().toISOString(),
      reviewed:    stats.reviewed,
      failed:      stats.failed,
      newAdded:    stats.newAdded,
      frictionNote,
      status:      "complete",
      intensity_score:      intensityCount > 0 ? parseFloat((intensityPts/intensityCount).toFixed(1)) : 0,
      ratingBreakdown:      stats.ratingBreakdown,
      contentTypeBreakdown,
      fatigueFlag:          fatigueAlertsEnabled && fatigueScore >= 2,
      focusedFlag:          focused,
    })
    if (isFirstStudy && onFirstStudyComplete) onFirstStudyComplete()

    // Parameter fitting: run if >= 200 total reviews and fit conditions met.
    // Current scope: adjust retentionTarget from observed recall accuracy.
    const prior = storage.getUserSchedulerParams()
    const totalReviews = cards.reduce((sum, c) => sum + (c.ratingHistory||[]).length, 0)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const shouldFit = totalReviews >= 200 && (
      !prior ||
      !prior.lastFitDate ||
      prior.lastFitDate < sevenDaysAgo ||
      (totalReviews - (prior.reviewCountAtFit || 0)) >= 50
    )
    if (shouldFit) {
      try {
        const fitResult = fitSchedulerParams(cards, retentionTarget)
        if (fitResult.changed && onFitParams) {
          onFitParams(fitResult.retentionTarget)
        }
        await storage.saveUserSchedulerParams(
          prior?.params || null,
          fitResult.reviewCount
        )
      } catch (_) { /* fitting is best-effort; never block session close */ }
    }

    if (onSessionCompleted) onSessionCompleted()
    onDone()
  }

  const intLabel = rating => {
    if (!card) return ""
    const { interval } = scheduleFSRS(card, rating, retentionTarget, storage.getUserSchedulerParams()?.params || null)
    if (interval===1) return "Tomorrow"
    if (interval<31)  return `${interval}d`
    if (interval<365) return `${Math.round(interval/30.4)}mo`
    return `${(interval/365).toFixed(1)}yr`
  }

  const allGated = phase==="empty" && dueBefore > 0 && dueCards.length === 0 && newCards.length === 0

  if (phase==="empty") return (
    <div className="rapp-wrap rapp-fadein" style={{ textAlign:"center", paddingTop:60 }}>
      <div style={{ fontSize:40, marginBottom:16 }}>✓</div>
      {allGated ? (
        <>
          <div style={{ fontSize:17, fontWeight:600, color:C.text, marginBottom:8 }}>Prerequisites not ready</div>
          <div style={{ fontSize:14, color:C.textMut, lineHeight:1.75, marginBottom:24 }}>
            All due cards have prerequisites not yet ready. Review the foundational cards first.
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize:17, fontWeight:600, color:C.text, marginBottom:8 }}>All caught up</div>
          <div style={{ fontSize:14, color:C.textMut, lineHeight:1.75, marginBottom:24 }}>No cards are due and there are no new cards.</div>
        </>
      )}
      <button className="rapp-btn rapp-btn-ghost" onClick={onDone}>Back</button>
    </div>
  )

  if (phase==="close") {
    const ratedCards = cards.filter(c => ratedCardIds.has(c.id) && c.nextReview)
    const intervals = ratedCards.map(c => c.interval).filter(Boolean)
    const minInt = intervals.length ? Math.min(...intervals) : null
    const maxInt = intervals.length ? Math.max(...intervals) : null
    const remainingInList = list.length - idx
    return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb28">
        <div className="rapp-pg-title">{endedEarly ? "Session paused" : "Session complete"}</div>
        <div className="rapp-pg-sub">Note anything that felt difficult, then save</div>
      </div>
      {endedEarly && remainingInList > 0 && (
        <div style={{ fontSize:13, color:C.textMut, marginBottom:12 }}>
          {remainingInList} card{remainingInList!==1?"s":""} remaining for today
        </div>
      )}
      {(() => {
        const total = stats.reviewed
        const nonAgain = total - stats.failed
        const pct = total > 0 ? Math.round((nonAgain / total) * 100) : null
        const line = pct === null ? null
          : pct >= 90 ? "Sharp session — your memory is consolidating well."
          : pct >= 75 ? "Solid work. The cards you missed will come back sooner."
          : pct >= 60 ? "Plenty to build on. Those hard cards are the ones worth reviewing."
          : "Tough session — that means you're working on the right material."
        return line ? (
          <div className="rapp-card rapp-mb16" style={{ position: "relative", overflow: "hidden" }}>
            <VesicleDots />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.65 }}>{line}</div>
              {pct !== null && (
                <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: "var(--nidus-warm)" }}>{pct}%</div>
              )}
              <div style={{ fontSize: 11, color: C.textMut }}>session recall</div>
            </div>
          </div>
        ) : null
      })()}
      <div className="rapp-stat-row rapp-mb20">
        <div className="rapp-stat-box"><div className="rapp-stat-num">{stats.reviewed}</div><div className="rapp-stat-lbl">Reviewed</div></div>
        <div className="rapp-stat-box"><div className="rapp-stat-num" style={{ color:stats.failed>0?C.again:C.textMut }}>{stats.failed}</div><div className="rapp-stat-lbl">Failed</div></div>
        <div className="rapp-stat-box"><div className="rapp-stat-num" style={{ color:C.accent }}>{stats.newAdded}</div><div className="rapp-stat-lbl">New cards</div></div>
      </div>
      {(() => { const cal = computeCalibration(cards); return (
        <div style={{ fontSize:13, color:C.textMut, marginBottom:8 }}>
          Recall accuracy (30 days): {cal.score !== null ? <strong style={{ color:"var(--nidus-warm)" }}>{cal.score}%</strong> : <span>appears after 10 qualifying reviews</span>}
        </div>
      )})()}
      <div style={{ fontSize:13, color:C.textMut, marginBottom:8 }}>
        Session intensity: {intensityCount > 0 ? <strong>{(intensityPts/intensityCount).toFixed(1)}</strong> : <span>-</span>}
      </div>
      {minInt !== null && (
        <div style={{ fontSize:13, color:C.textMut, marginBottom:16 }}>
          Next reviews: <strong>{minInt}-{maxInt} days</strong> based on your ratings.
        </div>
      )}
      <div className="rapp-card rapp-mb16">
        <label className="rapp-label">Session notes (optional)</label>
        <textarea className="rapp-textarea" rows={3} placeholder="Anything that felt slow or unclear?" value={friction} onChange={e=>setFriction(e.target.value)} />
      </div>
      <button className="rapp-btn rapp-btn-primary rapp-btn-full" onClick={handleClose}>Save and finish</button>

      <div style={{ marginTop: 32, display: "flex", justifyContent: "center", opacity: 0.45 }}>
        <NidusLogo size={22} theme="light" withWordmark />
      </div>
    </div>
  )}

  if (!card) return null
  const progress = Math.round(((idx+1) / list.length) * 100)

  return (
    <div className="rapp-wrap rapp-fadein">
      {/* Header: no card counter per brief */}
      <div className="rapp-row rapp-sb rapp-mb14">
        <span className="rapp-phase-tag">{phase==="warmup"?"Review":"New card"}</span>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {lastAction && (
            <button onClick={handleUndo}
              style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, fontFamily:"inherit", padding:"6px 10px", borderRadius:8 }}
              onMouseEnter={e=>e.currentTarget.style.background=C.surface}
              onMouseLeave={e=>e.currentTarget.style.background="none"}>
              ↩ Undo
            </button>
          )}
          <button onClick={()=>{ setEndedEarly(true); setPhase("close") }}
            style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, fontFamily:"inherit", padding:"6px 10px", borderRadius:8 }}
            onMouseEnter={e=>e.currentTarget.style.background=C.surface}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>
            End early
          </button>
        </div>
      </div>

      <div className="rapp-progress rapp-mb14">
        <div className="rapp-progress-fill" style={{ width:`${progress}%` }} />
      </div>

      {intensityPts >= INTENSITY_BREAK && !breakDismissed && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, background:C.warningBg, border:`1px solid ${C.warning}40`, borderRadius:12, padding:"10px 14px", marginBottom:14 }}>
          <span style={{ fontSize:13, color:C.warningText, lineHeight:1.55 }}>You've been studying intensively. A short break may help consolidate what you've learned.</span>
          <button onClick={()=>setBreakDismissed(true)} style={{ background:"none", border:"none", cursor:"pointer", color:C.warning, fontSize:18, lineHeight:1, padding:"0 0 0 4px", flexShrink:0, fontFamily:"inherit" }}>×</button>
        </div>
      )}

      {/* Card */}
      <div className="rapp-study-card rapp-mb16">
        {/* Tags */}
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
              {card.ai_edited && (
                <span className="nid-ai-badge" title="AI-edited. View history in the card editor." style={{ cursor:"default" }}>AI edited</span>
              )}
            </div>
          </div>
        )}
        <div className="nid-study-label">Question</div>
        {card.cardType === 'image_occlusion' ? (
          <OcclusionCardRenderer card={card} revealed={false} />
        ) : (
          <p className="rapp-card-front">
            {card.cardType === 'cloze' ? renderClozeFront(card.front) : card.front}
          </p>
        )}

        {side >= 1 && (
          <div className="rapp-back-reveal">
            <div className="rapp-card-sep" />
            <div className="nid-study-label">Answer</div>
            {card.cardType === 'image_occlusion' ? (
              <OcclusionCardRenderer card={card} revealed={true} />
            ) : (
              <p className="rapp-card-back">
                {card.cardType === 'cloze'
                  ? <span className="nid-cloze-revealed">{card.back}</span>
                  : card.back}
              </p>
            )}

            {card.elaboration && (
              <div style={{ marginTop:12 }}>
                <div className="nid-note-toggle" onClick={()=>setNoteOpen(o=>!o)}>
                  {Ico.chevron(12, noteOpen)}
                  <span>Note</span>
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
            {isMature && side >= 1 && (() => {
              const outgoing = (card.connects_to || []).filter(id => cards.some(c => c.id === id))
              const incoming = (reverseIndex[card.id] || []).filter(id => cards.some(c => c.id === id))
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

      {/* Side 0: typing input + disabled reveal */}
      {side === 0 && (
        <div className="rapp-fadein">
          {(() => {
            const CT_LABEL = {
              "Factual":           "Write your answer before revealing.",
              "Mechanism":         "Describe the process or pathway before revealing.",
              "Clinical Reasoning":"State your differential or clinical reasoning before revealing.",
              "Anatomy":           "Describe location, relations, and function before revealing.",
              "Pathology":         "Identify the hallmark features before revealing.",
            }
            const CT_PLACEHOLDER = {
              "Factual":           "Your answer...",
              "Mechanism":         "Describe the mechanism...",
              "Clinical Reasoning":"Your reasoning or differential...",
              "Anatomy":           "Location, relations, function...",
              "Pathology":         "Hallmark features...",
            }
            const base = CT_LABEL[card.contentType] || CT_LABEL["Factual"]
            const label = isMature ? `${base} - then add anything connected to this concept.` : base
            const placeholder = CT_PLACEHOLDER[card.contentType] || CT_PLACEHOLDER["Factual"]
            return (
              <>
                <p style={{ fontSize:12, color:C.textMut, marginBottom:8 }}>{label}</p>
                {isFirstStudy && !answerDraft && (
                  <p style={{ fontSize:12, color:C.textSec, fontStyle:"italic", marginBottom:6 }}>
                    Type your answer before revealing: even an attempt strengthens recall.
                  </p>
                )}
                <textarea ref={inputRef} className="nid-answer-input rapp-mb12" rows={3}
                  value={answerDraft} onChange={e=>setAnswerDraft(e.target.value)}
                  placeholder={placeholder}
                  onKeyDown={e=>{ if(e.key==="Enter"&&e.ctrlKey&&answerDraft.trim()){ e.preventDefault(); setSide(1) }}} />
              </>
            )
          })()}
          <button className="rapp-btn-reveal" disabled={!answerDraft.trim()} onClick={()=>setSide(1)}>
            {answerDraft.trim() ? "Reveal answer" : "Type your answer first"}
          </button>
        </div>
      )}

      {/* Side 1: user's draft + rating */}
      {side === 1 && (
        <div className="rapp-fadein">
          {answerDraft.trim() && (
            <div className="nid-draft-preview">
              Your answer: {answerDraft.trim()}
            </div>
          )}
          <p style={{ fontSize:12, color:C.textMut, marginBottom:10, textAlign:"center" }}>How well did you recall this?</p>
          <div className="rapp-rating-grid">
            {[
              { id:"again", label:"Again", cls:"r-again" },
              { id:"hard",  label:"Hard",  cls:"r-hard"  },
              { id:"good",  label:"Good",  cls:"r-good"  },
              { id:"easy",  label:"Easy",  cls:"r-easy"  },
            ].map(r => (
              <button key={r.id} className={`rapp-rating-btn ${r.cls}`} onClick={()=>handleRate(r.id)}>
                <span>{r.label}</span>
                <span className="rapp-ri">{intLabel(r.id)}</span>
              </button>
            ))}
            <p style={{ gridColumn:"1/-1", fontSize:11, color:C.textMut, textAlign:"center", marginTop:6 }}>
              <span className="rapp-kbd">1</span> Again &nbsp;·&nbsp;
              <span className="rapp-kbd">2</span> Hard &nbsp;·&nbsp;
              <span className="rapp-kbd">3</span> Good &nbsp;·&nbsp;
              <span className="rapp-kbd">4</span> Easy
            </p>
          </div>
        </div>
      )}
    </div>
  )
}