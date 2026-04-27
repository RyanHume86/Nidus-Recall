import { useState, useRef } from "react"
import { getGreeting } from "@/lib/greeting"
import { useVirtualizer } from "@tanstack/react-virtual"
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts"
import { C } from "@/lib/theme"
import { getDue, getNew, isActive } from "@/lib/fsrs"
import { computeCalibration, buildCalibrationChart, computeFatigueScore } from "@/lib/stats"
import { ReviewHeatmap } from "@/components/ReviewHeatmap"
import VesicleDots from "@/components/VesicleDots"

export function StatsView({ log, cards, decks, settings }) {
  const [selectedDeck, setSelectedDeck] = useState("all")
  const { leechThreshold=5, fatigueAlertsEnabled=true } = settings||{}

  const scope = selectedDeck==="all" ? cards : cards.filter(c=>c.deck===selectedDeck)
  const scopeLog = selectedDeck==="all" ? log : log  // log is global; per-deck log not tracked

  const totalReviewed = scopeLog.reduce((s,e) => s+(e.reviewed||0)+(e.newAdded||0), 0)
  const totalFailed   = scopeLog.reduce((s,e) => s+(e.failed||0), 0)
  const retention     = totalReviewed>0 ? Math.round(((totalReviewed-totalFailed)/totalReviewed)*100) : null
  const matureCards    = scope.filter(c => isActive(c)&&(c.stability||0)>=21&&(c.reviewCount||0)>=3).length
  const leechCards     = scope.filter(c => isActive(c)&&(c.lapses||0)>=leechThreshold).length
  const criticalCards  = scope.filter(c => isActive(c)&&c.stakes_flag).length
  const totalActive    = scope.filter(isActive).length
  const dueToday       = getDue(scope).length
  const newCards       = getNew(scope).length

  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb24">
        <div className="rapp-pg-title">{log.length > 0 ? getGreeting(localStorage.getItem("nidus.firstName")) : "Progress"}</div>
      </div>

      <div className="rapp-mb20">
        <select className="rapp-select" value={selectedDeck} onChange={e=>setSelectedDeck(e.target.value)}>
          <option value="all">All decks</option>
          {decks.map(d => <option key={d}>{d}</option>)}
        </select>
      </div>

      <ReviewHeatmap log={scopeLog} />

      {log.length === 0 && (
        <>
          <div className="rapp-card rapp-mb16" style={{ position: "relative", overflow: "hidden" }}>
            <VesicleDots />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>
                Your progress will appear here after your first session.
              </div>
              <div style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
                <p style={{ marginBottom:8 }}><strong>Due today</strong> — cards whose next review falls today or earlier.</p>
                <p style={{ marginBottom:8 }}><strong>Active cards</strong> — total cards in rotation (not archived).</p>
                <p style={{ marginBottom:8 }}><strong>Mature cards</strong> — cards with a stability above 30 days. They need reviewing less and less often.</p>
                <p style={{ marginBottom:8 }}><strong>Recall accuracy</strong> — the share of reviews rated Good or Easy in the last 30 days.</p>
                <p><strong>Critical cards</strong> — cards you've flagged as high-stakes. Reviewed at higher priority.</p>
              </div>
            </div>
          </div>
          <div className="rapp-card rapp-mb16">
            <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>How FSRS scheduling works</div>
            <div style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
              <p style={{ marginBottom:8 }}>
                The algorithm estimates how likely you are to recall each card,
                then schedules it just before that probability would drop below your target (default: 90%).
                Cards you know well drift out to months; cards you find hard come back in days.
              </p>
              <p>Reference: Open Spaced Repetition project, github.com/open-spaced-repetition.</p>
            </div>
          </div>
          <div className="rapp-card rapp-mb20">
            <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>What the first few months look like</div>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:12, color:C.textSec }}>
              <div><strong>Week 1</strong> — short intervals, high volume. The algorithm is learning you.</div>
              <div><strong>Week 4</strong> — familiar cards space out to 1–3 weeks. Daily load starts to settle.</div>
              <div><strong>Month 3</strong> — well-known cards reviewed monthly. New cards drive most of the workload.</div>
            </div>
          </div>
        </>
      )}

      <div style={{ opacity: log.length === 0 ? 0.25 : 1, filter: log.length === 0 ? 'blur(2px)' : 'none', pointerEvents: log.length === 0 ? 'none' : 'auto' }}>
      <div className="rapp-stat-row rapp-mb20">
        <div className="rapp-stat-box">
          <div className="rapp-stat-num" style={{ color:dueToday>0?C.accent:C.textMut }}>{dueToday}</div>
          <div className="rapp-stat-lbl">Due today</div>
        </div>
        <div className="rapp-stat-box">
          <div className="rapp-stat-num">{scope.filter(isActive).length}</div>
          <div className="rapp-stat-lbl">Active cards</div>
        </div>
        <div className="rapp-stat-box">
          <div className="rapp-stat-num" style={{ color:"var(--nidus-warm)" }}>{matureCards}</div>
          <div className="rapp-stat-lbl">Mature</div>
        </div>
      </div>

      {retention !== null && (
        <div className="rapp-card rapp-mb20">
          <div className="rapp-sec-title">Overall performance</div>
          <div className="rapp-stat-row">
            <div className="rapp-stat-box">
              <div className="rapp-stat-num" style={{ color:retention>=80?C.accent:retention>=60?"#C49568":C.again }}>{retention}%</div>
              <div className="rapp-stat-lbl">Retention</div>
            </div>
            <div className="rapp-stat-box">
              <div className="rapp-stat-num">{totalReviewed}</div>
              <div className="rapp-stat-lbl">Total reviews</div>
            </div>
            <div className="rapp-stat-box">
              <div className="rapp-stat-num" style={{ color:newCards>0?C.text:C.textMut }}>{newCards}</div>
              <div className="rapp-stat-lbl">Unseen</div>
            </div>
          </div>
          {leechCards > 0 && (
            <div style={{ marginTop:12, padding:"10px 14px", borderRadius:10, background:C.againBg, border:`1px solid #E8B0A0` }}>
              <span style={{ fontSize:13, color:C.again, fontWeight:500 }}>{leechCards} leech{leechCards!==1?"es":""}</span>
              <span style={{ fontSize:12, color:C.textMut }}> · Failed {leechThreshold}+ times. Consider rewriting or splitting.</span>
            </div>
          )}
        </div>
      )}

      {(() => {
        const fatigueScore = computeFatigueScore(scopeLog)
        return (
          <div className="rapp-card rapp-mb20">
            <div className="rapp-sec-title">Deck health</div>
            <p style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
              {criticalCards > 0 && (
                <>Critical cards: <strong style={{ color:C.accent }}>{criticalCards}</strong>
                <span style={{ color:C.textMut }}> of {totalActive} total</span></>
              )}
            </p>
            {fatigueAlertsEnabled && fatigueScore >= 2 && (
              <p style={{ fontSize:13, color:C.warning, marginTop:10, lineHeight:1.6 }}>
                Review pace may be unsustainable; consider reducing your daily cap.
              </p>
            )}
          </div>
        )
      })()}

      {(() => {
        const cal = computeCalibration(scope)
        const chartData = buildCalibrationChart(scope)
        const prevCal = computeCalibration(scope, 60)
        const trend = cal.score !== null && prevCal.score !== null ? cal.score - prevCal.score : null
        return (
          <div className="rapp-card rapp-mb20">
            <div className="rapp-sec-title">Recall accuracy</div>
            {cal.score !== null ? (
              <>
                <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:28, fontWeight:700, color:cal.score>=85?C.accent:C.warning }}>{cal.score}%</span>
                  {trend !== null && trend !== 0 && (
                    <span style={{ fontSize:12, color:trend>0?C.accent:C.warning, fontWeight:500 }}>
                      {trend>0?`+${trend}`:trend}% vs prev 30d
                    </span>
                  )}
                </div>
                <p style={{ fontSize:12, color:C.textMut, marginBottom:12 }}>Good/easy ratings not followed by Again (30-day window)</p>
              </>
            ) : (
              <p style={{ fontSize:13, color:C.textMut, marginBottom:12 }}>Your recall accuracy appears here after 10 qualifying reviews — keep going.</p>
            )}
            {chartData.length >= 4 ? (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData} margin={{ top:4, right:8, bottom:0, left:-24 }}>
                  <XAxis dataKey="week" tick={{ fontSize:10, fill:C.textMut }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize:10, fill:C.textMut }} tickLine={false} axisLine={false} tickFormatter={v=>`${v}%`} />
                  <Tooltip formatter={v=>[`${v}%`, "Accuracy"]} contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${C.border}`, background:C.surface }} />
                  <ReferenceLine y={85} stroke={C.accent} strokeDasharray="3 3" label={{ value:"Target", position:"insideTopRight", fontSize:10, fill:C.accent }} />
                  <Line type="monotone" dataKey="score" stroke={C.accent} strokeWidth={2} dot={{ r:3, fill:C.accent }} activeDot={{ r:5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              chartData.length > 0
                ? <p style={{ fontSize:12, color:C.textMut }}>Chart available after more review sessions.</p>
                : null
            )}
          </div>
        )
      })()}

      </div>

      {log.length === 0 ? (
        <div className="rapp-empty">No sessions recorded yet.</div>
      ) : (
        <>
          <div className="rapp-sec-title">Session history</div>
          <SessionLog log={log} />
        </>
      )}
    </div>
  )
}

const LOG_VIRTUAL_THRESHOLD = 200

function SessionLog({ log }) {
  const listRef = useRef(null)

  const virtualizer = useVirtualizer({
    count: log.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 110,
    overscan: 6,
    enabled: log.length > LOG_VIRTUAL_THRESHOLD,
  })

  const renderEntry = (entry) => (
    <div className="rapp-card">
      <div className="rapp-row rapp-sb rapp-mb12">
        <span style={{ fontSize:14, fontWeight:600 }}>
          {new Date(entry.date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}
        </span>
        <span className="rapp-ts">{new Date(entry.date).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>
      </div>
      <div className="rapp-row" style={{ gap:22 }}>
        <div><span style={{ fontSize:20, fontWeight:700 }}>{entry.reviewed}</span><span className="rapp-ts"> reviewed</span></div>
        <div><span style={{ fontSize:20, fontWeight:700, color:entry.failed>0?C.again:C.textMut }}>{entry.failed}</span><span className="rapp-ts"> failed</span></div>
        <div><span style={{ fontSize:20, fontWeight:700, color:C.accent }}>{entry.newAdded}</span><span className="rapp-ts"> new</span></div>
      </div>
      {entry.frictionNote && (
        <p style={{ marginTop:12, fontSize:13, color:C.textMut, fontStyle:"italic", lineHeight:1.65, borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
          "{entry.frictionNote}"
        </p>
      )}
    </div>
  )

  if (log.length <= LOG_VIRTUAL_THRESHOLD) {
    return (
      <div className="rapp-col" style={{ gap:10 }}>
        {log.map((entry, i) => <div key={i}>{renderEntry(entry)}</div>)}
      </div>
    )
  }

  return (
    <div ref={listRef} style={{ height: "min(600px, calc(100vh - 400px))", overflowY: "auto" }}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map(vi => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)`, paddingBottom: 10 }}
          >
            {renderEntry(log[vi.index])}
          </div>
        ))}
      </div>
    </div>
  )
}
