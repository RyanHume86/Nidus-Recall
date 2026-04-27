import { useState, useEffect, useMemo, useRef } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts"
import * as storage from "@/api/storage"
import * as excel   from "@/api/excel"
import * as notion  from "@/api/notion"
// ts-fsrs: MIT license, open-spaced-repetition/ts-fsrs, reference FSRS-5 implementation.
import { createEmptyCard, fsrs, generatorParameters, Rating } from "ts-fsrs"
// dexie: MIT license, dfahlander/Dexie.js, IndexedDB wrapper with query API.
// workbox-window: Apache-2.0, GoogleChrome/workbox, service worker lifecycle management.
import * as offlineStore from "@/lib/offline-store"
import { isInstallable, triggerInstallPrompt } from "@/lib/pwa"

// Dynamic import so sql.js WASM does not load at app startup -- only when user opens the Anki tab.
let ankiModule = null
const getAnkiModule = async () => {
  if (!ankiModule) ankiModule = await import('../api/anki.js')
  return ankiModule
}

// Dynamic import for FSRS optimizer (avoids loading gradient descent math at startup).
// fsrs-optimizer.js: MIT-compatible, Nidus Recall implementation, see src/lib/fsrs-optimizer.js
let fsrsOptimizerModule = null
const getFsrsOptimizer = async () => {
  if (!fsrsOptimizerModule) fsrsOptimizerModule = await import('../lib/fsrs-optimizer.js')
  return fsrsOptimizerModule
}

// Dynamic import for AI assist safety layer -- only loaded when user opens AI edit panel.
// src/api/aiAssist.js: Nidus Recall implementation. See module for hallucination-rate references.
let aiAssistModule = null
const getAiAssist = async () => {
  if (!aiAssistModule) aiAssistModule = await import('../api/aiAssist.js')
  return aiAssistModule
}

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:       "#F4F7F5",
  surface:  "#EBF0ED",
  elevated: "#DFE8E3",
  text:     "#1C2820",
  textSec:  "#3A5246",
  textMut:  "#4A6B5C",
  accent:   "#2D6E52",
  accentDk: "var(--sage)",
  teal:     "#2E7B88",
  border:   "#CFDBD5",
  borderMd: "#BFD0CA",
  // rating text (light)
  again:    "#3D1408",
  hard:     "#352A04",
  good:     "#0E3020",
  easy:     "#0A2A2A",
  // rating backgrounds (light)
  againBg:  "#F5C8B8",
  hardBg:   "#F0E890",
  goodBg:   "#B0E8CC",
  easyBg:   "#A8DEDE",
  // card surfaces
  cardFrontBg: "#EBF0ED",  // dark: #162018
  cardBackBg:  "#E4EDE8",  // dark: #142016
  // anchor blocks
  anchorBg:    "#EDE8DC",  // dark: #252018
  // warning: error states, sync failures, overdue indicators, system warnings
  // (light/dark values set via CSS; use these for inline styles)
  warning:     "#B87A30",  // dark: #D4994A
  warningBg:   "#FDF0DC",  // dark: #2A1800
  warningText: "#5C3A00",  // dark: #F5D4A0
}

// ─── Constants ────────────────────────────────────────────────────────────────
const FRONT_MAX     = 500
const BACK_MAX      = 1000
const NOTE_MAX      = 500
const ANCHOR_MAX    = 400
const SOURCE_MAX    = 200
const TAG_MAX_LEN   = 50
const TAG_MAX_COUNT = 5

const DEFAULT_SETTINGS = {
  newCardCap:          15,
  reviewCap:           100,
  leechThreshold:      5,
  retentionTarget:     0.90,
  catchupDays:         7,
  sleepBedtime:        null,
  sleepWindowMinutes:  90,
  sleepBannerEnabled:  true,
  matureModeEnabled:   true,
  matureCardThreshold: 30,
  fatigueAlertsEnabled:        true,
  attentionDeclarationEnabled: true,
  sleepPrefersReviews:         true,
}

// ─── Local storage helpers ────────────────────────────────────────────────────
const SK = { settings: "nidus-settings", notion: "nidus-notion", deckMeta: "nidus-deck-meta", lastSync: "nidus-last-sync" }
const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def } catch { return def } }
const lsSet = (k, v)   => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

// Returns true when local time is within sleepWindowMinutes before sleepBedtime.
// Handles windows that cross midnight (e.g. bedtime 00:30, window 90 min → active from 23:00).
const isInSleepWindow = (settings) => {
  const { sleepBedtime, sleepWindowMinutes=90, sleepBannerEnabled=true } = settings||{}
  if (!sleepBedtime || !sleepBannerEnabled) return false
  const now   = new Date()
  const [h,m] = sleepBedtime.split(":").map(Number)
  const nowMins = now.getHours()*60 + now.getMinutes()
  const bedMins = h*60 + m
  const start   = bedMins - sleepWindowMinutes
  if (start >= 0) return nowMins >= start && nowMins < bedMins
  // Window crosses midnight: active from (start+1440) to end of day OR before bedtime
  return nowMins >= (start + 1440) || nowMins < bedMins
}

const SLEEP_DISMISS_KEY   = "nidus-sleep-banner-dismissed"
const RETURN_ONBOARD_KEY  = "nidus-return-onboarding"
const sleepBannerIsDismissed = () => localStorage.getItem(SLEEP_DISMISS_KEY) === new Date().toISOString().slice(0,10)
const sleepBannerDismiss     = () => localStorage.setItem(SLEEP_DISMISS_KEY, new Date().toISOString().slice(0,10))

const settingsGet  = ()  => {
  // Migrate old defaults to new defaults on first load.
  const stored = lsGet(SK.settings, {})
  if (stored.newCardCap === 50) stored.newCardCap = 15
  if (stored.reviewCap === 200) stored.reviewCap = 100
  return { ...DEFAULT_SETTINGS, ...stored }
}
const settingsSet  = (v) => lsSet(SK.settings, v)
const notionGet    = ()  => lsGet(SK.notion, {})
const notionSet    = (v) => lsSet(SK.notion, v)
const deckMetaGet  = ()  => lsGet(SK.deckMeta, {})
const deckMetaSet  = (v) => lsSet(SK.deckMeta, v)
const lastSyncGet  = ()  => { try { return localStorage.getItem(SK.lastSync) || null } catch { return null } }
const lastSyncSet  = ()  => { try { localStorage.setItem(SK.lastSync, new Date().toISOString()) } catch {} }

// ─── Utilities ────────────────────────────────────────────────────────────────
const localDateStr = (d = new Date()) => {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0")
  return `${y}-${m}-${day}`
}
const addDays  = n => { const d = new Date(); d.setDate(d.getDate()+n); return localDateStr(d) }
const todayStr = () => localDateStr()
const genId    = () => Date.now().toString(36) + Math.random().toString(36).slice(2)
const timeAgo  = iso => {
  if (!iso) return null
  const m = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (m < 1)   return "just now"
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}

// ─── FSRS scheduling via ts-fsrs ─────────────────────────────────────────────
// ts-fsrs: MIT license, open-spaced-repetition/ts-fsrs, reference FSRS-5 implementation.
// Replaces the previous hand-rolled FSRS v4 implementation.

const RATING_MAP = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy }

/**
 * scheduleFSRS: returns { stability, difficulty, interval, nextReview }
 * Uses per-user parameters from schedulerParams if provided (from UserSchedulerParams),
 * else uses ts-fsrs defaults.
 *
 * FSRS algorithm per Supermemo (Wozniak) and the open-spaced-repetition project.
 */
const scheduleFSRS = (card, rating, retentionTarget = 0.9, schedulerParams = null) => {
  const params = generatorParameters({
    request_retention: retentionTarget,
    ...(schedulerParams && Array.isArray(schedulerParams) ? { w: schedulerParams } : {}),
  })
  const f = fsrs(params)
  const now = new Date()

  // Build a ts-fsrs card object from our card state.
  const tsCard = {
    due:          card.nextReview ? new Date(card.nextReview) : now,
    stability:    card.stability  ?? 0,
    difficulty:   card.difficulty ?? 0,
    elapsed_days: card.lastReview
      ? Math.max(0, Math.floor((now - new Date(card.lastReview)) / 86400000))
      : 0,
    scheduled_days: card.interval ?? 0,
    reps:           card.reviewCount ?? 0,
    lapses:         card.lapses      ?? 0,
    state:          card.reviewCount ? 2 : 0,  // Review=2, New=0
    last_review:    card.lastReview ? new Date(card.lastReview) : now,
  }

  const result = f.repeat(tsCard, now)
  const scheduled = result[RATING_MAP[rating]]
  const newCard = scheduled.card

  const intervalDays = Math.max(1, Math.round(newCard.scheduled_days || 1))

  return {
    stability:  newCard.stability,
    difficulty: newCard.difficulty,
    interval:   intervalDays,
  }
}

/**
 * fitSchedulerParams: adjust desired retention AND run FSRS-5 gradient descent
 * parameter fitting using the review log.
 *
 * Synchronous path: adjusts retentionTarget from observed recall accuracy.
 * Async path (background): runs gradient descent in fsrs-optimizer.js and
 * persists fitted params to UserSchedulerParams via storage.saveUserSchedulerParams.
 *
 * Reference: open-spaced-repetition/fsrs-optimizer (gradient descent algorithm).
 */
const fitSchedulerParams = (allCards, currentRetentionTarget = 0.9) => {
  const events = []
  for (const card of allCards) {
    for (const entry of (card.ratingHistory || [])) {
      events.push(entry.rating)
    }
  }
  if (events.length < 200) return { retentionTarget: currentRetentionTarget, reviewCount: events.length, changed: false }

  const nonAgainCount = events.filter(r => r !== "again").length
  const observedAccuracy = nonAgainCount / events.length

  let newTarget = currentRetentionTarget
  if (observedAccuracy > currentRetentionTarget + 0.05) {
    newTarget = Math.max(0.70, Math.round((currentRetentionTarget - 0.02) * 100) / 100)
  } else if (observedAccuracy < currentRetentionTarget - 0.05) {
    newTarget = Math.min(0.97, Math.round((currentRetentionTarget + 0.02) * 100) / 100)
  }

  // Run gradient descent in background if enough data (>= 200 reviews).
  // Does not block return value; writes params asynchronously.
  if (events.length >= 200) {
    getFsrsOptimizer().then(async ({ fitParams, buildReviewLog, DEFAULT_PARAMS }) => {
      try {
        const reviewLog = buildReviewLog(allCards)
        const currentParams = storage.getUserSchedulerParams()?.params || DEFAULT_PARAMS
        const { params, loss, fitted } = fitParams(reviewLog, currentParams)
        if (fitted) {
          await storage.saveUserSchedulerParams(params, events.length)
          console.log('[Nidus Recall] FSRS-5 gradient descent complete. Loss:', loss)
        }
      } catch (err) {
        console.warn('[Nidus Recall] FSRS gradient descent failed (non-fatal):', err)
      }
    }).catch(() => {})
  }

  return {
    retentionTarget: newTarget,
    reviewCount: events.length,
    changed: newTarget !== currentRetentionTarget,
    observedAccuracy,
  }
}

const isActive = c => c.status !== "Parked" && c.status !== "Archived"
const getDue   = cs => cs.filter(c => isActive(c) && c.nextReview && c.nextReview <= todayStr()).sort((a,b) => {
  const d = a.nextReview.localeCompare(b.nextReview)
  if (d !== 0) return d
  return (b.stakes_flag ? 1 : 0) - (a.stakes_flag ? 1 : 0)
})
const getNew   = cs => cs.filter(c => isActive(c) && !c.nextReview)
const getDueWithCatchup = (cs, cap, days, allCards = null) => {
  const lookup = allCards || cs
  let all = getDue(cs)
  // Filter out cards whose prerequisite hasn't reached stability >= 7
  all = all.filter(card => {
    if (!card.prerequisite_card_id) return true
    const prereq = lookup.find(c => c.id === card.prerequisite_card_id)
    if (!prereq) return true  // prerequisite not found - allow card through
    return prereq.stability != null && prereq.stability >= 7
  })
  if (!all.length) return []
  if (all.length <= cap) return all
  return all.slice(0, Math.min(cap, Math.ceil(all.length/days)))
}

// Build a reverse index: for each card id, which cards point TO it via connects_to
const buildReverseIndex = (cards) => {
  const index = {}
  for (const card of cards) {
    for (const targetId of (card.connects_to || [])) {
      if (!index[targetId]) index[targetId] = []
      if (!index[targetId].includes(card.id)) index[targetId].push(card.id)
    }
  }
  return index
}

// parseCloze: parses Anki-compatible cloze syntax.
// Supported: {{c1::answer}}, {{c1::answer::hint}}, multiple indices.
// Returns: { indices: number[], cards: Array<{index, front, back, hint}> }
// Reference: Anki cloze deletion format, apps.ankiweb.net/docs/manual.html
const CLOZE_RE = /\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g

const parseCloze = (text) => {
  if (!text) return { indices: [], cards: [] }
  const indices = new Set()
  let m
  CLOZE_RE.lastIndex = 0
  while ((m = CLOZE_RE.exec(text)) !== null) indices.add(Number(m[1]))
  const sortedIndices = [...indices].sort((a, b) => a - b)

  const cards = sortedIndices.map(idx => {
    CLOZE_RE.lastIndex = 0
    const front = text.replace(CLOZE_RE, (_, i, ans, hint) =>
      Number(i) === idx ? (hint ? `[${hint}]` : '[...]') : ans
    )
    CLOZE_RE.lastIndex = 0
    const back = text.replace(CLOZE_RE, (_, _i, ans) => ans)
    CLOZE_RE.lastIndex = 0
    return { index: idx, front, back, hint: null }
  })
  return { indices: sortedIndices, cards }
}

// renderClozeFront: replace [hint] or [...] tokens with styled blank spans.
const renderClozeFront = (text) => {
  if (!text) return text
  const parts = text.split(/(\[[^\]]+\])/g)
  return parts.map((part, i) => {
    if (/^\[.+\]$/.test(part)) {
      return <span key={i} className="nid-cloze-blank" style={{ color:'transparent' }}>{part}</span>
    }
    return part
  })
}

// createClozeCards: build one Flashcard per cloze index with pre-computed front/back.
// Pre-computing front/back at create time means existing review machinery works unchanged.
const createClozeCards = (clozeText, deckName) => {
  const { cards: variants } = parseCloze(clozeText)
  const now = new Date().toISOString()
  return variants.map(v => ({
    id: genId(),
    front: v.front,
    back: v.back,
    cardType: 'cloze',
    clozeText,
    clozeIndex: v.index,
    deck: deckName,
    contentType: 'Factual',
    status: 'Active',
    interval: 1,
    reviewCount: 0,
    lapses: 0,
    ratingHistory: [],
    connects_to: [],
    stability: null,
    difficulty: null,
    nextReview: null,
    lastReview: null,
    elaboration: '',
    anchor: null,
    source: null,
    stakes_flag: false,
    prerequisite_card_id: null,
    tags: [],
    createdAt: now,
    imageUrl: null,
    occlusionRegions: null,
    occlusionRegionId: null,
  }))
}

// createOcclusionCards: build one Flashcard per region.
// Design follows Image Occlusion Enhanced addon convention used in the medical
// Anki community (AnKing, Pepper Pharm) - most users from that ecosystem expect
// this behaviour. Polygon support is a documented TODO.
const createOcclusionCards = (imageUrl, regions, deckName) => {
  const now = new Date().toISOString()
  return regions.map(region => ({
    id: genId(),
    front: region.label,
    back: region.label,
    cardType: 'image_occlusion',
    imageUrl,
    occlusionRegions: regions,
    occlusionRegionId: region.id,
    clozeText: null,
    clozeIndex: null,
    deck: deckName,
    contentType: 'Factual',
    status: 'Active',
    interval: 1,
    reviewCount: 0,
    lapses: 0,
    ratingHistory: [],
    connects_to: [],
    stability: null,
    difficulty: null,
    nextReview: null,
    lastReview: null,
    elaboration: '',
    anchor: null,
    source: null,
    stakes_flag: false,
    prerequisite_card_id: null,
    tags: [],
    createdAt: now,
  }))
}

// OcclusionCardRenderer: renders image with region overlays.
// Front: tested region is opaque mask; all others semi-transparent.
// Back (revealed=true): all regions shown with labels.
function OcclusionCardRenderer({ card, revealed }) {
  const { imageUrl, occlusionRegions, occlusionRegionId } = card
  if (!imageUrl || !occlusionRegions) return null
  return (
    <div style={{ position:'relative', display:'inline-block', maxWidth:'100%' }}>
      <img src={imageUrl} style={{ display:'block', maxWidth:'100%', userSelect:'none' }} alt="Occlusion card" />
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}
           viewBox="0 0 100 100" preserveAspectRatio="none">
        {occlusionRegions.map(r => {
          const isTarget = r.id === occlusionRegionId
          const fillColor = isTarget && !revealed ? '#2D6E52' : 'rgba(45,110,82,0.35)'
          const cx = r.type === 'polygon' && r.points
            ? r.points.reduce((s, p) => s + p.x, 0) / r.points.length
            : (r.x || 0) + (r.width || 0) / 2
          const cy = r.type === 'polygon' && r.points
            ? r.points.reduce((s, p) => s + p.y, 0) / r.points.length
            : (r.y || 0) + (r.height || 0) / 2
          return (
            <g key={r.id}>
              {r.type === 'polygon' && r.points ? (
                <polygon
                  points={r.points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
                  fill={fillColor} stroke="#2D6E52" strokeWidth="0.5"
                />
              ) : (
                <rect
                  x={(r.x || 0) * 100} y={(r.y || 0) * 100}
                  width={(r.width || 0) * 100} height={(r.height || 0) * 100}
                  fill={fillColor} stroke="#2D6E52" strokeWidth="0.5"
                />
              )}
              {(revealed || !isTarget) && (
                <text
                  x={cx * 100} y={cy * 100}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="3" fill={isTarget ? '#fff' : '#1a3d2b'} fontWeight="600"
                >
                  {r.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ImageOcclusionEditor: lets the user load an image and draw rectangular or polygon mask regions.
// Coordinates stored as fractions (0.0 to 1.0) so geometry scales with display size.
// Design follows Image Occlusion Enhanced addon convention (AnKing, Pepper Pharm).
// Keyboard: R = rectangle mode, P = polygon mode.
// Rectangle: drag to draw. Polygon: click to add vertices, double-click or Enter to close.
function ImageOcclusionEditor({ onSave }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [regions, setRegions] = useState([])
  const [drawing, setDrawing] = useState(null)
  const [selected, setSelected] = useState(null)
  const [drawMode, setDrawMode] = useState("rect")
  const [polyPoints, setPolyPoints] = useState([])
  const imgRef = useRef(null)

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setImageUrl(ev.target.result)
    reader.readAsDataURL(file)
    setRegions([]); setSelected(null); setPolyPoints([]); setDrawing(null)
  }

  const getFractionalCoords = (e) => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    }
  }

  const onMouseDown = (e) => {
    if (!imageUrl || drawMode !== "rect") return
    const coords = getFractionalCoords(e)
    if (!coords) return
    setDrawing({ startX: coords.x, startY: coords.y, x: coords.x, y: coords.y, w: 0, h: 0 })
    setSelected(null)
    e.preventDefault()
  }

  const onMouseMove = (e) => {
    if (!drawing || drawMode !== "rect") return
    const coords = getFractionalCoords(e)
    if (!coords) return
    setDrawing(d => ({
      ...d,
      x: Math.min(d.startX, coords.x), y: Math.min(d.startY, coords.y),
      w: Math.abs(coords.x - d.startX), h: Math.abs(coords.y - d.startY),
    }))
  }

  const onMouseUp = () => {
    if (drawMode !== "rect") return
    if (!drawing || drawing.w < 0.02 || drawing.h < 0.02) { setDrawing(null); return }
    const newRegion = {
      id: genId(),
      label: 'Region ' + (regions.length + 1),
      type: 'rect',
      x: drawing.x, y: drawing.y, width: drawing.w, height: drawing.h,
    }
    setRegions(r => [...r, newRegion])
    setSelected(newRegion.id)
    setDrawing(null)
  }

  const onSvgClick = (e) => {
    if (!imageUrl || drawMode !== "poly") return
    const coords = getFractionalCoords(e)
    if (!coords) return
    setPolyPoints(pts => [...pts, coords])
  }

  const onSvgDblClick = (e) => {
    if (drawMode !== "poly") return
    e.preventDefault()
    closePoly()
  }

  const closePoly = () => {
    if (polyPoints.length < 3) { setPolyPoints([]); return }
    const newRegion = {
      id: genId(),
      label: 'Region ' + (regions.length + 1),
      type: 'polygon',
      points: polyPoints,
    }
    setRegions(r => [...r, newRegion])
    setSelected(newRegion.id)
    setPolyPoints([])
  }

  const deleteSelected = () => {
    setRegions(r => r.filter(reg => reg.id !== selected))
    setSelected(null)
  }

  const updateLabel = (id, label) => {
    setRegions(r => r.map(reg => reg.id === id ? { ...reg, label } : reg))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'r' || e.key === 'R') { setDrawMode("rect"); setPolyPoints([]); return }
    if (e.key === 'p' || e.key === 'P') { setDrawMode("poly"); setDrawing(null); return }
    if (e.key === 'Enter' && drawMode === "poly" && polyPoints.length >= 3) { closePoly(); return }
    if (e.key === 'Escape') { setPolyPoints([]); setDrawing(null); return }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected && e.target.tagName !== 'INPUT') {
      deleteSelected()
    }
  }

  const sel = regions.find(r => r.id === selected)

  const renderRegion = (r) => {
    const isSelected = r.id === selected
    const fill = isSelected ? 'rgba(45,110,82,0.5)' : 'rgba(45,110,82,0.3)'
    const strokeWidth = isSelected ? '1' : '0.5'
    if (r.type === 'polygon' && r.points) {
      const pts = r.points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')
      return (
        <polygon key={r.id} points={pts}
          fill={fill} stroke="#2D6E52" strokeWidth={strokeWidth}
          style={{ cursor:'pointer' }}
          onClick={(e) => { e.stopPropagation(); setSelected(r.id) }}
        />
      )
    }
    return (
      <rect key={r.id}
        x={r.x * 100} y={r.y * 100}
        width={(r.width || 0) * 100} height={(r.height || 0) * 100}
        fill={fill} stroke="#2D6E52" strokeWidth={strokeWidth}
        style={{ cursor:'pointer' }}
        onClick={(e) => { e.stopPropagation(); setSelected(r.id) }}
      />
    )
  }

  return (
    <div onKeyDown={handleKeyDown} tabIndex={0} style={{ outline:'none' }}>
      <div className="rapp-mb12">
        <label className="rapp-label">Image file</label>
        <input type="file" accept="image/*" onChange={handleFile}
          style={{ width:'100%', fontSize:13, color:C.text, fontFamily:'inherit', padding:'8px 0', cursor:'pointer' }} />
      </div>
      {imageUrl && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            {[
              { id:'rect', label:'Rectangle (R)' },
              { id:'poly', label:'Polygon (P)' },
            ].map(m => (
              <button key={m.id}
                className={drawMode === m.id ? 'rapp-btn rapp-btn-primary' : 'rapp-btn rapp-btn-ghost'}
                style={{ padding:'6px 14px', fontSize:12 }}
                onClick={() => { setDrawMode(m.id); setPolyPoints([]); setDrawing(null) }}>
                {m.label}
              </button>
            ))}
            {drawMode === 'poly' && polyPoints.length > 0 && (
              <span style={{ fontSize:12, color:C.textMut, alignSelf:'center' }}>
                {polyPoints.length} vertices. Double-click or Enter to close.
              </span>
            )}
          </div>
          <div style={{ position:'relative', display:'inline-block', maxWidth:'100%', cursor:'crosshair', marginBottom:12, userSelect:'none' }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
            <img ref={imgRef} src={imageUrl} style={{ display:'block', maxWidth:'100%' }} alt="Occlusion source" draggable={false} />
            <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}
                 viewBox="0 0 100 100" preserveAspectRatio="none"
                 onClick={onSvgClick} onDoubleClick={onSvgDblClick}>
              {regions.map(renderRegion)}
              {drawing && drawMode === 'rect' && (
                <rect x={drawing.x * 100} y={drawing.y * 100}
                  width={drawing.w * 100} height={drawing.h * 100}
                  fill="rgba(45,110,82,0.2)" stroke="#2D6E52" strokeWidth="0.8" strokeDasharray="2,1" />
              )}
              {drawMode === 'poly' && polyPoints.length > 0 && (
                <polyline
                  points={polyPoints.map(p => `${p.x*100},${p.y*100}`).join(' ')}
                  fill="rgba(45,110,82,0.15)" stroke="#2D6E52" strokeWidth="0.8" strokeDasharray="2,1" />
              )}
            </svg>
          </div>
          {sel && (
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
              <input className="rapp-input" value={sel.label}
                onChange={e => updateLabel(sel.id, e.target.value)}
                style={{ flex:1 }} placeholder="Region label" />
              <button className="rapp-btn rapp-btn-ghost"
                style={{ padding:'8px 12px', fontSize:12, color:C.again, borderColor:'#E8B0A0' }}
                onClick={deleteSelected}>Delete</button>
            </div>
          )}
          <p style={{ fontSize:12, color:C.textMut, marginBottom:8, lineHeight:1.6 }}>
            Rectangle mode: drag to draw. Polygon mode: click vertices, double-click or Enter to close. Delete key removes selected region.
          </p>
          <p style={{ fontSize:12, color:C.textMut, marginBottom:12 }}>
            {regions.length === 0 ? 'No regions drawn yet.' : `${regions.length} region${regions.length !== 1 ? 's' : ''} drawn.`}
          </p>
          <button className="rapp-btn rapp-btn-primary" style={{ width:'100%' }}
            disabled={regions.length === 0}
            onClick={() => onSave(imageUrl, regions)}>
            Save regions ({regions.length} card{regions.length !== 1 ? 's' : ''} will be created)
          </button>
        </>
      )}
    </div>
  )
}

// buildHeatmapData: map of ISO date string -> review count from session log.
// Ref: streak visibility supports habit maintenance (Lally et al., Eur J Soc Psychol 2010).
const buildHeatmapData = (log) => {
  const map = {}
  for (const entry of log) {
    const d = entry.date ? entry.date.split('T')[0] : null
    if (d) map[d] = (map[d] || 0) + (entry.reviewed || 0)
  }
  return map
}

function ReviewHeatmap({ log }) {
  const data = buildHeatmapData(log)
  const today = new Date()
  const days = []
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    days.push({ key, count: data[key] || 0 })
  }
  let streak = 0, longestStreak = 0, cur = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) {
      cur++
      longestStreak = Math.max(longestStreak, cur)
      if (i === days.length - 1 || days[i + 1].count > 0) streak = cur
    } else {
      if (i < days.length - 1) cur = 0
    }
  }
  const maxCount = Math.max(1, ...days.map(d => d.count))
  const intensity = (count) => {
    if (count === 0) return 0
    const ratio = count / maxCount
    if (ratio < 0.25) return 1
    if (ratio < 0.5)  return 2
    if (ratio < 0.75) return 3
    return 4
  }
  const COLOURS = ['#e8f0eb', '#b3d4bc', '#6dab7e', '#2D6E52', '#1a4535']
  const weeks = []
  for (let w = 0; w < 53; w++) weeks.push(days.slice(w * 7, w * 7 + 7))
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12, color:C.textMut }}>
        <span>Current streak: <strong>{streak}</strong> day{streak !== 1 ? 's' : ''}</span>
        <span>Longest streak: <strong>{longestStreak}</strong> day{longestStreak !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ display:'flex', gap:2, overflowX:'auto' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {week.map((day) => (
              <div key={day.key}
                title={`${day.key}: ${day.count} review${day.count !== 1 ? 's' : ''}`}
                style={{ width:11, height:11, borderRadius:2, background:COLOURS[intensity(day.count)] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontSize:10, color:C.textMut, marginTop:4, textAlign:'right' }}>
        Less
        {COLOURS.map((c, i) => (
          <span key={i} style={{ display:'inline-block', width:10, height:10, background:c, borderRadius:2, margin:'0 1px', verticalAlign:'middle' }} />
        ))}
        More
      </div>
    </div>
  )
}

// buildDeckTree: builds hierarchical deck list from parentMap (from storage.getDeckParentMap()).
// Falls back to "::" name convention when parentMap has no entries.
// After the 2026-04-26-deck-hierarchy migration runs, parentDeckId populates parentMap.
const buildDeckTree = (deckNames, parentMap = new Map()) => {
  // If parentMap is populated, use parent/child relationships.
  if (parentMap && parentMap.size > 0) {
    const result = []
    const roots = deckNames.filter(n => !parentMap.has(n)).sort()
    const addNode = (name, depth) => {
      result.push({ name, displayName: name.split('::').pop().trim(), indent: depth })
      const children = deckNames.filter(n => parentMap.get(n) === name).sort()
      for (const child of children) addNode(child, depth + 1)
    }
    for (const root of roots) addNode(root, 0)
    // Include orphans (parentMap references non-existent parent).
    const seen = new Set(result.map(r => r.name))
    for (const name of deckNames) {
      if (!seen.has(name)) result.push({ name, displayName: name.split('::').pop().trim(), indent: 0 })
    }
    return result
  }
  // Fallback: derive hierarchy from "::" in name.
  return deckNames.map(name => ({
    name,
    displayName: name.includes('::') ? name.split('::').pop().trim() : name,
    indent: name.includes('::') ? (name.split('::').length - 1) : 0,
  }))
}



// Compute recall accuracy (calibration) score for a set of cards.
// Looks at pairs: good/easy entry followed by an "again" on the next review = mismatch.
// Returns { score: number 0-100, total: number } - score is null when total < 10.
const computeCalibration = (cards, days = 30) => {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  let mismatches = 0, total = 0
  for (const card of cards) {
    const hist = card.ratingHistory
    if (!hist || hist.length < 2) continue
    for (let i = 0; i < hist.length - 1; i++) {
      const entry = hist[i]
      if (entry.date < cutoff) continue
      if (entry.rating === "good" || entry.rating === "easy") {
        total++
        if (hist[i + 1].rating === "again") mismatches++
      }
    }
  }
  return { score: total >= 10 ? Math.round((1 - mismatches / total) * 100) : null, total }
}

// Build 90-day weekly calibration chart data from ratingHistory across cards.
// Returns array of { week: "Apr 14", score: number } sorted oldest-first.
// Weeks with fewer than 4 reviewable pairs are excluded.
const buildCalibrationChart = (cards) => {
  const now = Date.now()
  const weeks = []
  for (let w = 12; w >= 0; w--) {
    const start = new Date(now - (w + 1) * 7 * 86400000).toISOString()
    const end   = new Date(now - w * 7 * 86400000).toISOString()
    let mismatches = 0, total = 0
    for (const card of cards) {
      const hist = card.ratingHistory
      if (!hist || hist.length < 2) continue
      for (let i = 0; i < hist.length - 1; i++) {
        const entry = hist[i]
        if (entry.date < start || entry.date >= end) continue
        if (entry.rating === "good" || entry.rating === "easy") {
          total++
          if (hist[i + 1].rating === "again") mismatches++
        }
      }
    }
    if (total >= 4) {
      const d = new Date(now - w * 7 * 86400000)
      weeks.push({ week: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), score: Math.round((1 - mismatches / total) * 100) })
    }
  }
  return weeks
}

// Fatigue risk score based on session log from the last 14 days.
// Returns 0 when fewer than 5 sessions exist. Otherwise sums up to 3 flags.
const computeFatigueScore = (log) => {
  const now = Date.now()
  const cut14 = new Date(now - 14 * 86400000).toISOString()
  const cut7  = new Date(now -  7 * 86400000).toISOString()
  const recent = log.filter(e => e.date >= cut14)
  if (recent.length < 5) return 0
  const last7  = recent.filter(e => e.date >= cut7)
  const prior7 = recent.filter(e => e.date <  cut7)
  let flags = 0
  // Signal 1: session frequency decline > 30%
  if (prior7.length > 0 && last7.length / prior7.length < 0.7) flags++
  // Signal 2: again rate increase > 20pp
  const againRate = arr => {
    const total = arr.reduce((s,e) => s+(e.reviewed||0)+(e.newAdded||0), 0)
    if (!total) return null
    return arr.reduce((s,e) => s+(e.failed||0), 0) / total
  }
  const r7 = againRate(last7), rP = againRate(prior7)
  if (r7 !== null && rP !== null && r7 - rP > 0.20) flags++
  // Signal 3: average session size decline > 25%
  const avgSize = arr => arr.length === 0 ? null : arr.reduce((s,e) => s+(e.reviewed||0)+(e.newAdded||0), 0) / arr.length
  const s7 = avgSize(last7), sP = avgSize(prior7)
  if (s7 !== null && sP !== null && sP > 0 && s7 / sP < 0.75) flags++
  return flags
}

// Assembles the final frictionNote for a session. User-written text is
// preserved at the front; system markers are appended, never prepended or
// overwritten. This is the single authoritative write point - intensity,
// fatigue, and attention declaration must feed here rather than writing
// frictionNote independently.
const assembleFrictionNote = (userText, { intensityPts, intensityCount, fatigueScore, fatigueAlertsEnabled, focused }) => {
  const markers = []
  if (intensityCount > 0) markers.push(`[Intensity: ${(intensityPts / intensityCount).toFixed(1)}]`)
  if (fatigueAlertsEnabled && fatigueScore >= 2) markers.push("[Fatigue risk: elevated]")
  if (focused) markers.push("[Focused: yes]")
  return [userText.trim(), ...markers].filter(Boolean).join(" ")
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  :root { --sage: #5C7A6A; }
  @media (prefers-color-scheme: dark) { :root { --sage: #5C7A65; } }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .rapp {
    min-height: 100vh;
    background: #F4F7F5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #1C2820;
    display: flex;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    overscroll-behavior: none;
  }

  .rapp-sidebar {
    width: 210px; min-height: 100vh; background: #EBF0ED;
    border-right: 1px solid #CFDBD5; display: flex; flex-direction: column;
    padding: 32px 0 28px; position: fixed; left:0; top:0; bottom:0; z-index:20;
  }
  .rapp-logo {
    padding: 0 24px 32px; font-size: 20px; font-weight: 700;
    letter-spacing: -0.6px; color: #1C2820; display: flex; align-items: center; gap: 8px;
  }
  .rapp-logo-dot { width: 8px; height: 8px; border-radius: 50%; background: #2D6E52; }
  .rapp-nav-item {
    display: flex; align-items: center; gap: 10px; padding: 11px 24px;
    cursor: pointer; color: #4A6B5C; font-size: 14px; font-weight: 400;
    border-left: 2.5px solid transparent;
    transition: color 0.14s, background-color 0.14s, border-color 0.14s;
    user-select: none; letter-spacing: -0.1px;
  }
  .rapp-nav-item:hover { color: #1C2820; background: #F4F7F5; }
  .rapp-nav-item.active { color: #2D6E52; border-left-color: #2D6E52; background: #F4F7F5; font-weight: 500; }

  .rapp-main { margin-left: 210px; flex:1; padding: 44px 36px; min-height:100vh; display:flex; flex-direction:column; align-items:flex-start; }
  @media (min-width:900px) { .rapp-main { padding: 52px max(36px, calc((100% - 520px)/2)); } }
  .rapp-main-full { margin-left: 0; }

  .rapp-bnav { display: none; }
  @media (max-width:639px) {
    .rapp-sidebar { display: none; }
    .rapp-main { margin-left: 0; padding: 28px 18px 96px; }
    .rapp-main-full { padding-bottom: 0; }
    .rapp-bnav {
      display: flex; position: fixed; bottom:0; left:0; right:0;
      background: #EBF0ED; border-top: 1px solid #CFDBD5; z-index:100;
      padding-bottom: env(safe-area-inset-bottom,0px);
    }
    .rapp-bnav-item {
      flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;
      padding: 10px 0 8px; cursor:pointer; color:#4A6B5C; font-size:11px;
      font-weight:500; letter-spacing:0.2px; transition:color 0.14s; user-select:none;
    }
    .rapp-bnav-item.active { color: #2D6E52; }
    .rapp-input, .rapp-textarea, .rapp-select { font-size: 16px; }
    .rapp-study-card { min-height: 140px; }
    .rapp-rating-btn { padding: 16px 6px 14px; }
  }

  .rapp-wrap { max-width: 520px; width: 100%; }
  .rapp-pg-title  { font-size: 24px; font-weight: 700; letter-spacing: -0.7px; color: #1C2820; }
  .rapp-pg-sub    { font-size: 13px; color: #4A6B5C; margin-top: 3px; }
  .rapp-sec-title { font-size: 14px; font-weight: 600; color: #1C2820; margin-bottom: 14px; letter-spacing: -0.2px; }
  .rapp-label     { font-size: 11.5px; font-weight: 600; color: #3A5246; display: block; margin-bottom: 7px; letter-spacing: 0.15px; text-transform: uppercase; }
  .rapp-phase-tag { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #4A6B5C; }

  .rapp-card { background: #EBF0ED; border: 1px solid #CFDBD5; border-radius: 16px; padding: 22px; }
  .rapp-study-card {
    background: #EBF0ED; border: 1px solid #CFDBD5; border-radius: 24px;
    padding: 28px 26px 24px; min-height: 180px; display: flex; flex-direction: column;
    box-shadow: 0 2px 12px rgba(28,40,32,0.07); overflow: hidden;
  }
  .rapp-card-front { font-size: 19px; line-height: 1.6; color: #1C2820; font-weight: 500; flex-grow:1; }
  .rapp-card-back  { font-size: 14px; line-height: 1.75; color: #3A5246; white-space: pre-wrap; }
  .rapp-card-sep   { height: 1px; background: #CFDBD5; margin: 18px 0; }

  .rapp-stat-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
  .rapp-stat-box { background: #DFE8E3; border: 1px solid #CFDBD5; border-radius: 12px; padding: 16px 10px; text-align: center; }
  .rapp-stat-num { font-size: 28px; font-weight: 700; letter-spacing: -1.5px; color: #1C2820; }
  .rapp-stat-lbl { font-size: 12px; color: #4A6B5C; margin-top: 4px; }

  .rapp-progress { height: 3px; background: #CFDBD5; border-radius: 3px; overflow: hidden; margin-bottom: 20px; }
  .rapp-progress-fill { height:100%; background:#2D6E52; border-radius:3px; transition:width 0.45s cubic-bezier(0.4,0,0.2,1); }

  .rapp-btn {
    padding: 12px 22px; border-radius: 12px; border: none; font-size: 14px;
    font-weight: 500; cursor: pointer; transition: all 0.14s; font-family: inherit;
    display: inline-flex; align-items: center; justify-content: center; gap: 7px; letter-spacing: -0.1px;
  }
  .rapp-btn-primary { background: #2D6E52; color: #fff; }
  .rapp-btn-primary:hover { background: var(--sage); box-shadow: 0 0 0 3px rgba(45,110,82,0.2); }
  .rapp-btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
  .rapp-btn-ghost { background: transparent; color: #3A5246; border: 1px solid #CFDBD5; }
  .rapp-btn-ghost:hover { background: #EBF0ED; color: #1C2820; border-color: #BFD0CA; }
  .rapp-btn-ghost:disabled { opacity: 0.35; cursor: not-allowed; }
  .rapp-btn-full { width: 100%; padding: 16px; font-size: 15px; border-radius: 16px; }

  .rapp-btn-reveal {
    width: 100%; padding: 18px; background: #2D6E52; border: none;
    border-radius: 12px; font-size: 14px; font-weight: 500; color: #fff;
    cursor: pointer; transition: opacity 150ms linear; font-family: inherit;
  }
  .rapp-btn-reveal:disabled { opacity: 0.45; pointer-events: none; cursor: not-allowed; }

  .rapp-rating-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; }
  .rapp-rating-btn {
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    padding: 14px 6px 12px; border-radius: 12px; border: 1px solid transparent;
    cursor: pointer; transition: all 0.14s; font-family: inherit; font-size: 13px;
    font-weight: 600; letter-spacing: -0.1px; will-change: transform;
  }
  .rapp-rating-btn:hover  { transform: translateY(-2px); }
  .rapp-rating-btn:active { transform: translateY(0); }
  .rapp-ri { font-size: 10px; font-weight: 400; opacity: 0.75; }

  .r-again { background: #F5C8B8; color: #3D1408; border-color: #E8B0A0; }
  .r-hard  { background: #F0E890; color: #352A04; border-color: #E0D870; }
  .r-good  { background: #B0E8CC; color: #0E3020; border-color: #90D8B0; }
  .r-easy  { background: #A8DEDE; color: #0A2A2A; border-color: #88CECE; }
  .r-again:active { background: #EAB8A8; }
  .r-hard:active  { background: #E5DD80; }
  .r-good:active  { background: #9EDCBA; }
  .r-easy:active  { background: #98D2D2; }

  @media (prefers-color-scheme: dark) {
    .r-again { background: #3D1408; color: #F0B8A8; border-color: #5D2418; }
    .r-hard  { background: #352A04; color: #EAD890; border-color: #554A14; }
    .r-good  { background: #0E3020; color: #A8E0C0; border-color: #1E5030; }
    .r-easy  { background: #0A2A2A; color: #A0D8D8; border-color: #1A4A4A; }
  }

  .rapp-input, .rapp-textarea, .rapp-select {
    background: #DFE8E3; border: 1px solid #CFDBD5; border-radius: 8px;
    padding: 10px 14px; font-size: 14px; color: #1C2820; width: 100%;
    font-family: inherit; outline: none; transition: border-color 0.14s; line-height: 1.5;
    appearance: none; -webkit-appearance: none;
  }
  .rapp-input:focus, .rapp-textarea:focus, .rapp-select:focus { border-color: #2D6E52; box-shadow: 0 0 0 3px rgba(45,110,82,0.12); }
  .rapp-textarea { resize: vertical; min-height: 80px; }
  .rapp-select {
    cursor: pointer; padding-right: 34px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237BA090' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 13px center;
  }

  .rapp-card-item {
    background: #DFE8E3; border: 1px solid #CFDBD5; border-radius: 16px;
    padding: 16px 18px; cursor: pointer; transition: border-color 0.14s, box-shadow 0.14s;
  }
  .rapp-card-item:hover { border-color: #BFD0CA; box-shadow: 0 2px 8px rgba(28,40,32,0.06); }
  .rapp-card-item-q { font-size: 14px; color: #1C2820; line-height: 1.55; }

  .rapp-empty { text-align:center; padding:52px 24px; color:#4A6B5C; font-size:14px; line-height:1.75; }

  .rapp-badge {
    display: inline-flex; align-items: center; padding: 3px 9px;
    border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap;
  }
  .rapp-leech { display:inline-flex; align-items:center; padding:2px 7px; border-radius:20px; font-size:10px; font-weight:700; background:#F5C8B8; color:#3D1408; border:1px solid #E8B0A0; }
  .rapp-nav-badge { min-width:18px; height:18px; background:#3D1408; color:#fff; border-radius:9px; font-size:10px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; padding:0 5px; margin-left:auto; margin-right:4px; }

  .rapp-hr { border: none; border-top: 1px solid #CFDBD5; }
  .rapp-slider { width:100%; accent-color:#2D6E52; height:4px; cursor:pointer; }
  .rapp-kbd { display:inline-flex; align-items:center; justify-content:center; padding:1px 6px; border:1px solid #BFD0CA; border-radius:5px; font-size:10px; font-weight:600; color:#4A6B5C; background:#EBF0ED; }

  .rapp-sync { padding: 0 24px 4px; font-size: 11px; min-height: 18px; }

  @keyframes rapp-fadein { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  .rapp-fadein { animation: rapp-fadein 0.22s ease forwards; }
  @keyframes rapp-shimmer { 0%,100% { opacity:0.45; } 50% { opacity:0.9; } }
  .rapp-skel { background:#CFDBD5; border-radius:8px; animation:rapp-shimmer 1.5s ease infinite; }
  @keyframes rapp-reveal { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
  .rapp-back-reveal {
    animation: rapp-reveal 0.2s ease forwards;
    background: #E4EDE8;
    margin: 0 -26px -24px;
    padding: 0 26px 24px;
  }
  @media (prefers-color-scheme: dark) {
    .rapp-study-card  { background: #162018; }
    .rapp-back-reveal { background: #142016; }
  }

  .rapp-row   { display:flex; align-items:center; }
  .rapp-col   { display:flex; flex-direction:column; }
  .rapp-sb    { justify-content:space-between; }
  .rapp-gap8  { gap:8px; }
  .rapp-gap12 { gap:12px; }
  .rapp-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .rapp-flex1 { flex:1; }
  .rapp-mt4   { margin-top:4px; }    .rapp-mt8   { margin-top:8px; }
  .rapp-mt12  { margin-top:12px; }   .rapp-mt16  { margin-top:16px; }
  .rapp-mt20  { margin-top:20px; }   .rapp-mt24  { margin-top:24px; }
  .rapp-mt28  { margin-top:28px; }
  .rapp-mb8   { margin-bottom:8px; } .rapp-mb12  { margin-bottom:12px; }
  .rapp-mb14  { margin-bottom:14px; }.rapp-mb16  { margin-bottom:16px; }
  .rapp-mb20  { margin-bottom:20px; }.rapp-mb24  { margin-bottom:24px; }
  .rapp-mb28  { margin-bottom:28px; }
  .rapp-ts    { font-size:13px; color:#4A6B5C; }
  .rapp-tm    { font-size:14px; color:#3A5246; }

  /* ── Nidus-specific ── */
  .nid-deck-card {
    background: #DFE8E3; border: 1px solid #CFDBD5; border-radius: 20px;
    padding: 20px 22px; cursor: pointer;
    transition: border-color 0.14s, box-shadow 0.14s, transform 0.12s;
  }
  .nid-deck-card:hover { border-color:#BFD0CA; box-shadow:0 4px 16px rgba(28,40,32,0.09); transform:translateY(-1px); }
  .nid-deck-name { font-size:16px; font-weight:600; color:#1C2820; letter-spacing:-0.3px; }
  .nid-deck-meta { font-size:13px; color:#4A6B5C; margin-top:6px; }
  .nid-deck-due  { display:inline-flex; align-items:center; padding:3px 10px; background:#F5C8B8; color:#3D1408; border-radius:20px; font-size:11px; font-weight:600; }

  .nid-tag { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; background:#EBF0ED; color:#3A5246; border:1px solid #CFDBD5; border-radius:20px; font-size:11px; font-weight:500; }
  .nid-tag-rm { cursor:pointer; color:#4A6B5C; font-size:14px; line-height:1; padding:0 1px; margin-left:2px; }
  .nid-tag-rm:hover { color:#3D1408; }
  .nid-ct-chip { display:inline-block; padding:2px 6px; background:#DFE8E3; color:#3A5246; border-radius:4px; font-size:10px; font-weight:500; margin-bottom:10px; }
  @media (prefers-color-scheme: dark) {
    .nid-ct-chip { background:#253A2C; color:#94C4AF; }
  }
  .nid-sleep-banner {
    display:flex; align-items:flex-start; gap:12px;
    background:#EBF0ED; border-left:3px solid var(--sage); border-radius:8px;
    padding:12px 14px; margin-bottom:20px;
    font-size:13px; line-height:1.6; color:#3A5246;
  }
  .nid-sleep-banner-body { flex:1; }
  .nid-sleep-banner-dismiss {
    background:none; border:none; cursor:pointer; font-size:16px; line-height:1;
    color:#4A6B5C; padding:0; margin-top:-1px; font-family:inherit; flex-shrink:0;
  }
  .nid-sleep-banner-dismiss:hover { color:#1C2820; }
  @media (prefers-color-scheme: dark) {
    .nid-sleep-banner { background:#162018; color:#94C4AF; }
    .nid-sleep-banner-dismiss:hover { color:#D8EDE4; }
  }

  .nid-answer-input {
    width:100%; background:#DFE8E3; border:1.5px solid #CFDBD5; border-radius:12px;
    padding:14px 16px; font-size:15px; color:#1C2820; font-family:inherit;
    outline:none; resize:none; min-height:80px; transition:border-color 0.14s, box-shadow 0.14s; line-height:1.6;
  }
  .nid-answer-input:focus { border-color:#2D6E52; box-shadow:0 0 0 3px rgba(45,110,82,0.12); }
  .nid-answer-input::placeholder { color:#BFD0CA; }

  .nid-draft-preview {
    background:#EBF0ED; border-left:3px solid #BFD0CA; padding:10px 14px;
    border-radius:0 8px 8px 0; font-size:13px; color:#4A6B5C;
    font-style:italic; white-space:pre-wrap; line-height:1.6; margin-bottom:14px;
  }

  .nid-note-toggle {
    display:flex; align-items:center; gap:6px; font-size:12px; color:#4A6B5C;
    cursor:pointer; padding:8px 0; user-select:none; transition:color 0.14s;
  }
  .nid-note-toggle:hover { color:#3A5246; }
  .nid-note-body {
    background:#EBF0ED; border-radius:10px; padding:12px 14px; font-size:13px;
    color:#3A5246; line-height:1.7; white-space:pre-wrap; margin-top:4px;
  }
  .nid-anchor-block {
    background:#EDE8DC; border-radius:10px; padding:12px 14px; margin-top:12px;
  }
  .nid-anchor-label {
    font-size:10px; font-weight:500; color:#3A5246; text-transform:uppercase;
    letter-spacing:0.4px; margin-bottom:6px;
  }
  .nid-anchor-text { font-size:13px; color:#1C2820; line-height:1.7; white-space:pre-wrap; }
  @media (prefers-color-scheme: dark) {
    .nid-anchor-block { background:#252018; }
    .nid-anchor-label { color:#94C4AF; }
    .nid-anchor-text  { color:#D8EDE4; }
  }

  .nid-connects-block {
    background:#DCF0E8; border-radius:10px; padding:12px 14px; margin-top:12px;
  }
  .nid-connects-label {
    font-size:10px; font-weight:500; color:#3A5246; text-transform:uppercase;
    letter-spacing:0.4px; margin-bottom:8px;
  }
  .nid-connects-item { font-size:13px; color:#1C2820; line-height:1.6; padding:3px 0; }
  @media (prefers-color-scheme: dark) {
    .nid-connects-block { background:#253A2C; }
    .nid-connects-label { color:#94C4AF; }
    .nid-connects-item  { color:#D8EDE4; }
  }

  .nid-char-count { font-size:11px; color:#BFD0CA; text-align:right; margin-top:4px; }
  .nid-char-count.warn { color:#C49568; }
  .nid-char-count.over { color:#3D1408; }

  .nid-mode-card {
    padding:16px 18px; border-radius:16px; cursor:pointer; border:2px solid #CFDBD5;
    background:#EBF0ED; transition:all 0.14s;
  }
  .nid-mode-card.selected { border-color:#2D6E52; background:#DFE8E3; }

  .nid-study-label {
    font-size:10px; font-weight:700; text-transform:uppercase;
    letter-spacing:0.9px; color:#4A6B5C; margin-bottom:8px;
  }

  @media (max-width:639px) {
    .rapp-modal-backdrop { align-items:flex-end !important; padding:0 !important; }
    .rapp-modal-inner    { border-radius:22px 22px 0 0 !important; max-height:92vh !important; }
  }
  button,[role="button"],.rapp-nav-item,.rapp-bnav-item,.rapp-card-item,.nid-deck-card { touch-action:manipulation; }
  button:focus-visible,[tabindex]:focus-visible { outline:2px solid #2D6E52; outline-offset:2px; border-radius:8px; }

  /* Offline indicator and PWA install prompt (Session 4) */
  .nid-offline-banner {
    display: flex; align-items: center; gap: 8px;
    background: #FDF0DC; border-left: 3px solid #B87A30; border-radius: 8px;
    padding: 8px 12px; margin-bottom: 12px; font-size: 12px; color: #5C3A00;
    line-height: 1.5;
  }
  .nid-offline-dot {
    width: 7px; height: 7px; border-radius: 50%; background: #B87A30;
    flex-shrink: 0; animation: rapp-shimmer 1.5s ease infinite;
  }
  .nid-install-prompt {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    background: #EBF0ED; border: 1px solid #CFDBD5; border-radius: 12px;
    padding: 12px 14px; margin-bottom: 16px; font-size: 13px; color: #3A5246;
  }
  @media (prefers-color-scheme: dark) {
    .nid-offline-banner { background: #2A1800; color: #F5D4A0; border-color: #D4994A; }
    .nid-offline-dot { background: #D4994A; }
    .nid-install-prompt { background: #162018; border-color: #2D4A3C; color: #94C4AF; }
  }

  /* Cloze and image occlusion card styles (Session 3) */
  /* AI assist components */
  .nid-ai-badge {
    display: inline-flex; align-items: center;
    font-size: 10px; font-weight: 500; color: #2E7B88;
    background: rgba(46,123,136,0.10); border: 1px solid rgba(46,123,136,0.22);
    border-radius: 5px; padding: 2px 6px; cursor: pointer; user-select: none;
  }
  .nid-ai-badge:hover { background: rgba(46,123,136,0.18); }
  .nid-diff-col { flex: 1; min-width: 0; }
  .nid-diff-col-label { font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.8px; color: #7BA090; margin-bottom: 6px; }
  .nid-diff-original { background: rgba(189,50,50,0.07); border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.6; }
  .nid-diff-proposed { background: rgba(45,110,82,0.08); border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.6; }
  .nid-diff-del { background: rgba(189,50,50,0.18); border-radius: 3px; padding: 0 2px; }
  .nid-diff-ins { background: rgba(45,110,82,0.22); border-radius: 3px; padding: 0 2px; }
  .nid-clinical-warn { background: #FDF0DC; border: 1px solid #E8C880; border-radius: 10px;
    padding: 10px 14px; font-size: 12px; color: #5C3A00; line-height: 1.6; margin-bottom: 14px; }
  .nid-history-row { display: flex; gap: 8px; align-items: flex-start; padding: 10px 0;
    border-bottom: 1px solid #CFDBD5; }
  .nid-history-row:last-child { border-bottom: none; }

  .nid-cloze-blank {
    display: inline-block; background: #CFDBD5; color: transparent;
    border-radius: 4px; padding: 2px 8px; min-width: 40px; text-align: center;
    font-weight: 600; letter-spacing: 0.5px; user-select: none;
  }
  @media (prefers-color-scheme: dark) { .nid-cloze-blank { background: #2D4A3C; } }
  .nid-cloze-revealed {
    display: inline; color: #2D6E52; font-weight: 700;
    background: rgba(45,110,82,0.12); border-radius: 4px; padding: 0 3px;
  }
  @media (prefers-color-scheme: dark) { .nid-cloze-revealed { background: rgba(45,110,82,0.25); } }
`

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ico = {
  library: (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  study:   (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  stats:   (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  gear:    (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  plus:    (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  back:    (s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  chevron: (s=14, open=false) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.18s",flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>,
  cards:   (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/></svg>,
}

// ─── Small components ─────────────────────────────────────────────────────────
const BADGE_COLORS = {
  "Factual":           { bg:"#DFE8E3", text:"#1C2820" },
  "Mechanism":         { bg:"#EBF0ED", text:"#2E7B88" },
  "Clinical Reasoning":{ bg:"#EBF0ED", text:"#2D6E52" },
  "Anatomy":           { bg:"#EBF0ED", text:"var(--sage)" },
  "Pathology":         { bg:"#F5C8B8", text:"#3D1408" },
}
function Badge({ type }) {
  const t = BADGE_COLORS[type] || { bg:"#EBF0ED", text:"#3A5246" }
  return <span className="rapp-badge" style={{ background:t.bg, color:t.text }}>{type}</span>
}

function CharCount({ current, max }) {
  const pct = current / max
  return <div className={`nid-char-count${pct>1?" over":pct>0.8?" warn":""}`}>{current}/{max}</div>
}

function TagInput({ tags=[], onChange }) {
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

function NoteToggle({ value, onChange, open, onToggle }) {
  return (
    <div>
      <div className="nid-note-toggle" onClick={onToggle}>
        {Ico.chevron(13, open)}
        <span>Note / Context</span>
        <span style={{ fontSize:11, color:C.textMut, marginLeft:4 }}>(optional)</span>
        {value && !open && <span style={{ fontSize:11, color:C.accent, marginLeft:6 }}>●</span>}
      </div>
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

function AnchorToggle({ value, onChange, open, onToggle }) {
  return (
    <div>
      <div className="nid-note-toggle" onClick={onToggle}>
        {Ico.chevron(13, open)}
        <span>Memory anchor</span>
        <span style={{ fontSize:11, color:C.textMut, marginLeft:4 }}>(optional)</span>
        {value && !open && <span style={{ fontSize:11, color:C.accent, marginLeft:6 }}>●</span>}
        <span style={{ marginLeft:"auto", fontSize:12, color:C.textMut, cursor:"default" }}
          title="Anchoring a personal memory to a card significantly improves long-term recall.">ⓘ</span>
      </div>
      {open && (
        <div className="rapp-fadein">
          <textarea className="rapp-textarea" rows={3} value={value} maxLength={ANCHOR_MAX}
            onChange={e => onChange(e.target.value)}
            placeholder="A case, a moment, or a story that connects this to something you already know." />
          <CharCount current={value.length} max={ANCHOR_MAX} />
        </div>
      )}
    </div>
  )
}

// CardPicker: searchable single or multi-card selector used for prerequisite and connects_to.
// mode: "single" → value is id string | null; "multi" → value is id[]
function CardPicker({ allCards, value, onChange, mode="single", excludeId, placeholder="Search cards…" }) {
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


// ─── Onboarding View ──────────────────────────────────────────────────────────
function OnboardingView({ onCreateDeck, onCreateSampleDeck }) {
  // "See how it works" modal removed in Session 3: the sample deck (Common Pharmacology: Essentials)
  // demonstrates all card types in context, making the modal redundant. Users learn by doing.
  // The secondary action is kept as an outline button for users who prefer to build from scratch.
  return (
    <div className="rapp-wrap rapp-fadein" style={{ textAlign:"center", paddingTop:60 }}>
      <div style={{ fontSize:22, fontWeight:700, marginBottom:8 }}>Welcome to Nidus Recall</div>
      <div style={{ fontSize:14, color:C.textSec, marginBottom:32, lineHeight:1.65 }}>
        Build your own flashcard decks. Study using active recall.<br/>Let spaced repetition handle the scheduling.
      </div>
      <button className="rapp-btn rapp-btn-primary" onClick={onCreateSampleDeck} style={{ width:"100%", marginBottom:12 }}>
        {Ico.plus(14)} Try a sample deck
      </button>
      <button className="rapp-btn rapp-btn-ghost" onClick={onCreateDeck} style={{ width:"100%", marginBottom:16 }}>
        Create your first deck
      </button>
      <p style={{ fontSize:12, color:C.textMut, lineHeight:1.6 }}>
        The sample deck includes basic, cloze, and image occlusion card types so you can explore each format before building your own content.
      </p>
    </div>
  )
}

// ─── Library View ─────────────────────────────────────────────────────────────
function LibraryView({ cards, decks, deckMeta, onSelectDeck, onCreateDeck, syncStatus, lastSynced, settings, onCreateSampleDeck, deckParentMap }) {
  const [search,         setSearch]         = useState("")
  const [showArchived,   setShowArchived]   = useState(false)
  const [showCreateDeck, setShowCreateDeck] = useState(false)
  const [newDeckName,    setNewDeckName]    = useState("")
  const [bannerDismissed, setBannerDismissed] = useState(sleepBannerIsDismissed)
  const newDeckRef = useRef(null)

  const hasDue        = getDue(cards).length > 0
  const showSleepBanner = isInSleepWindow(settings) && hasDue && !bannerDismissed

  const dismissBanner = () => { sleepBannerDismiss(); setBannerDismissed(true) }

  const deckStats = useMemo(() => decks.map(name => {
    const dc = cards.filter(c => c.deck === name)
    return { name, total: dc.filter(isActive).length, due: getDue(dc).length, newCount: getNew(dc).length, archived: deckMeta[name]?.archived || false }
  }), [cards, decks, deckMeta])

  const visible = deckStats
    .filter(d => showArchived || !d.archived)
    .filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()))

  const archivedCount = deckStats.filter(d => d.archived).length

  const syncLabel = syncStatus === "saving" ? "Saving…"
    : syncStatus === "error" ? "Sync error"
    : lastSynced ? `Synced ${timeAgo(lastSynced)}`
    : null

  const doCreate = () => {
    if (newDeckName.trim()) { onCreateDeck(newDeckName.trim()); setNewDeckName(""); setShowCreateDeck(false) }
  }

  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb24">
        <div className="rapp-row rapp-sb" style={{ alignItems:"flex-start" }}>
          <div>
            <div className="rapp-pg-title">Library</div>
            {syncLabel && (
              <div style={{ fontSize:11.5, color: syncStatus==="error" ? C.again : C.textMut, marginTop:3 }}>
                {syncStatus==="saving"?"●":syncStatus==="error"?"⚠":"✓"} {syncLabel}
              </div>
            )}
          </div>
          {(cards.length > 0 || decks.length > 0) && (
            <button className="rapp-btn rapp-btn-primary" style={{ padding:"8px 16px", fontSize:13 }}
              onClick={() => { setShowCreateDeck(true); setTimeout(()=>newDeckRef.current?.focus(),50) }}>
              {Ico.plus(13)} New Deck
            </button>
          )}
        </div>
      </div>

      {showSleepBanner && (
        <div className="nid-sleep-banner rapp-fadein">
          <div className="nid-sleep-banner-body">
            Sleep review window open. Studying now supports overnight memory consolidation.
          </div>
          <button className="nid-sleep-banner-dismiss" aria-label="Dismiss" onClick={dismissBanner}>✕</button>
        </div>
      )}

      {showCreateDeck && (
        <div className="rapp-card rapp-mb20 rapp-fadein">
          <label className="rapp-label">Deck name</label>
          <div style={{ display:"flex", gap:8 }}>
            <input ref={newDeckRef} className="rapp-input rapp-flex1" value={newDeckName}
              onChange={e => setNewDeckName(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter") doCreate() }}
              placeholder="e.g. Anatomy, Research Methods…" />
            <button className="rapp-btn rapp-btn-primary" style={{ padding:"9px 14px", fontSize:13 }}
              onClick={doCreate} disabled={!newDeckName.trim()}>Create</button>
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 12px" }}
              onClick={() => { setShowCreateDeck(false); setNewDeckName("") }}>✕</button>
          </div>
        </div>
      )}

      {decks.length > 4 && (
        <div className="rapp-mb16">
          <input className="rapp-input" placeholder="Search decks…" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
      )}

      {decks.length === 0 ? (
        <OnboardingView
          onCreateDeck={() => { setShowCreateDeck(true); setTimeout(()=>newDeckRef.current?.focus(),50) }}
          onCreateSampleDeck={onCreateSampleDeck}
        />
      ) : visible.length === 0 && search ? (
        <div className="rapp-empty">No decks match "{search}"</div>
      ) : (
        <div className="rapp-col" style={{ gap:12 }}>
          {(() => {
            const tree = buildDeckTree(visible.map(d => d.name), deckParentMap || new Map())
            return visible.map((d, idx) => {
              const treeEntry = tree[idx]
              return (
                <div key={d.name} className="nid-deck-card"
                  style={{ marginLeft: treeEntry.indent * 20 }}
                  onClick={() => onSelectDeck(d.name)}>
                  <div className="rapp-row rapp-sb">
                    <div className="nid-deck-name">
                      {treeEntry.indent > 0 && <span style={{ color:C.textMut, marginRight:4, fontSize:12 }}>{'> '.repeat(treeEntry.indent)}</span>}
                      {treeEntry.displayName}
                    </div>
                    {d.due > 0 && <span className="nid-deck-due">{d.due} due</span>}
                  </div>
                  <div className="nid-deck-meta">
                    {d.total} card{d.total!==1?"s":""}
                    {d.newCount > 0 && <span style={{ color:C.accent }}> · {d.newCount} new</span>}
                    {d.archived && <span> · archived</span>}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}

      {archivedCount > 0 && (
        <button onClick={() => setShowArchived(v=>!v)}
          style={{ marginTop:20, background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, fontFamily:"inherit" }}>
          {showArchived?"Hide":"Show"} {archivedCount} archived deck{archivedCount!==1?"s":""}
        </button>
      )}
    </div>
  )
}

// ─── Edit Card Modal ──────────────────────────────────────────────────────────
function EditCardModal({ card, cards, onUpdateCards, onClose, decks, onSaveHistory }) {
  const [form, setForm]           = useState({ front:card.front||"", back:card.back||"", tags:card.tags||[], note:card.elaboration||"", anchor:card.anchor||"", source:card.source||"", contentType:card.contentType||"Factual", stakesFlag:card.stakes_flag||false, connects_to:card.connects_to||[], prerequisite_card_id:card.prerequisite_card_id||null })
  const [showNote, setShowNote]   = useState(!!(card.elaboration))
  const [showAnchor, setShowAnchor] = useState(!!(card.anchor))
  const [showConnects, setShowConnects] = useState(!!(card.connects_to?.length))
  const [showPrereq, setShowPrereq]     = useState(!!(card.prerequisite_card_id))
  const [confirmDel, setConfirmDel] = useState(false)
  const [aiPrompt, setAiPrompt]     = useState("")
  const [aiOpen, setAiOpen]         = useState(false)
  const [aiLoading, setAiLoading]   = useState(false)
  const [aiProposal, setAiProposal] = useState(null)
  const [aiError, setAiError]       = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const handleAiRequest = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true); setAiError(null); setAiProposal(null)
    try {
      const { requestAIEdit } = await getAiAssist()
      const result = await requestAIEdit({ ...card, ...form }, aiPrompt)
      setAiProposal(result)
    } catch (err) {
      if (err.message.startsWith("CITATION_REFUSED:")) {
        setAiError("Citations must be added manually. Paste a PMID, DOI, or URL and the system will fetch the metadata.")
      } else {
        setAiError(err.message || "AI request failed. Try again.")
      }
    }
    setAiLoading(false)
  }

  const handleApplyAiProposal = async () => {
    if (!aiProposal) return
    const snapshot = { front: card.front, back: card.back, elaboration: card.elaboration, source: card.source, tags: card.tags }
    if (onSaveHistory) {
      try { await onSaveHistory(card.id, snapshot, "ai", aiProposal.model) } catch (_) {}
    }
    setForm(f => ({ ...f, front: aiProposal.proposed.front, back: aiProposal.proposed.back, ai_edited: true }))
    setAiProposal(null); setAiOpen(false); setAiPrompt("")
  }


  const handleSave = async () => {
    if (!form.front.trim() || !form.back.trim()) return
    const prereq = form.prerequisite_card_id === card.id ? null : form.prerequisite_card_id
    await onUpdateCards(cards.map(c => c.id===card.id ? { ...c, front:form.front, back:form.back, tags:form.tags, elaboration:form.note, anchor:form.anchor.trim()||null, source:form.source.trim()||null, contentType:form.contentType, stakes_flag:form.stakesFlag, connects_to:form.connects_to, prerequisite_card_id:prereq } : c))
    onClose()
  }
  const handleDelete = async () => {
    const deletedId = card.id
    const updated = cards
      .filter(c => c.id !== deletedId)
      .map(c => ({
        ...c,
        connects_to: (c.connects_to || []).filter(id => id !== deletedId),
        prerequisite_card_id: c.prerequisite_card_id === deletedId ? null : c.prerequisite_card_id,
      }))
    if (card.status === "Active") storage.adjustDeckCount(card.deck, -1).catch(()=>{})
    await onUpdateCards(updated); onClose()
  }
  const handleArchive = async () => {
    const next = card.status==="Archived" ? "Active" : "Archived"
    if (next === "Archived") storage.adjustDeckCount(card.deck, -1).catch(()=>{})
    else storage.adjustDeckCount(card.deck, 1).catch(()=>{})
    await onUpdateCards(cards.map(c => c.id===card.id ? { ...c, status:next } : c)); onClose()
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(28,40,32,0.45)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
      className="rapp-modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div style={{ background:C.surface, borderRadius:22, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto", padding:"28px 24px 36px", boxShadow:"0 8px 40px rgba(28,40,32,0.18)" }}
        className="rapp-modal-inner">
        <div className="rapp-row rapp-sb rapp-mb20">
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:15, fontWeight:600, color:C.text }}>Edit card</span>
            {card.contentType && <span className="nid-ct-chip" style={{ marginBottom:0 }}>{card.contentType}</span>}
            {card.ai_edited && (
              <span className="nid-ai-badge" title="AI-edited. Click to view history." onClick={()=>setShowHistory(true)}>AI edited</span>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {card.ai_edited && (
              <button onClick={()=>setShowHistory(true)} style={{ background:"none", border:`1px solid ${C.border}`, cursor:"pointer", fontSize:11, color:C.textSec, borderRadius:6, padding:"3px 8px", fontFamily:"inherit" }}>History</button>
            )}
            <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.textMut }}>×</button>
          </div>

        </div>

        {decks.length > 1 && (
          <div className="rapp-mb14">
            <label className="rapp-label">Deck</label>
            <select className="rapp-select" value={form.deck||card.deck||decks[0]} onChange={e=>setForm(f=>({...f,deck:e.target.value}))}>
              {decks.map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
        )}

        <div className="rapp-mb12">
          <label className="rapp-label">Front</label>
          <textarea className="rapp-textarea" rows={3} value={form.front} maxLength={FRONT_MAX}
            onChange={e=>setForm(f=>({...f,front:e.target.value}))} />
          <CharCount current={form.front.length} max={FRONT_MAX} />
        </div>
        <div className="rapp-mb12">
          <label className="rapp-label">Back</label>
          <textarea className="rapp-textarea" rows={4} value={form.back} maxLength={BACK_MAX}
            onChange={e=>setForm(f=>({...f,back:e.target.value}))} />
          <CharCount current={form.back.length} max={BACK_MAX} />
        </div>
        <div className="rapp-mb12">
          <label className="rapp-label">Tags</label>
          <TagInput tags={form.tags} onChange={t=>setForm(f=>({...f,tags:t}))} />
        </div>

        <div className="rapp-mb12">
          <label className="rapp-label">Type</label>
          <select className="rapp-select" value={form.contentType} onChange={e=>setForm(f=>({...f,contentType:e.target.value}))}>
            {["Factual","Mechanism","Clinical Reasoning","Anatomy","Pathology"].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>

        <div className="rapp-mb12">
          <label className="rapp-label">Source (optional)</label>
          <input className="rapp-input" value={form.source} maxLength={SOURCE_MAX}
            onChange={e=>setForm(f=>({...f,source:e.target.value}))}
            placeholder="Article, chapter, guideline, or lecture this card came from." />
          {form.source.length >= SOURCE_MAX - 40 && <CharCount current={form.source.length} max={SOURCE_MAX} />}
        </div>

        <div className="rapp-mb12">
          <div className="rapp-row rapp-sb" style={{ alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:form.stakesFlag?C.accent:C.text }}>Clinically critical</div>
              <div style={{ fontSize:11, color:C.textMut, marginTop:2, lineHeight:1.5 }}>High-stakes card: prioritised when study time is short.</div>
            </div>
            <div role="switch" aria-checked={form.stakesFlag}
              onClick={()=>setForm(f=>({...f,stakesFlag:!f.stakesFlag}))}
              style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0, marginTop:2,
                background:form.stakesFlag?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
              <div style={{ position:"absolute", top:3, left:form.stakesFlag?21:3, width:16, height:16, borderRadius:8,
                background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
            </div>
          </div>
        </div>

        <div className="rapp-mb12">
          <NoteToggle value={form.note} onChange={v=>setForm(f=>({...f,note:v}))} open={showNote} onToggle={()=>setShowNote(o=>!o)} />
        </div>
        <div className="rapp-mb12">
          <AnchorToggle value={form.anchor} onChange={v=>setForm(f=>({...f,anchor:v}))} open={showAnchor} onToggle={()=>setShowAnchor(o=>!o)} />
        </div>
        <div className="rapp-mb12">
          <div className="nid-note-toggle" onClick={()=>setShowConnects(o=>!o)}>
            {Ico.chevron(13, showConnects)}
            <span>Connects to</span>
            <span style={{ fontSize:11, color:C.textMut, marginLeft:4 }}>(optional)</span>
            {form.connects_to.length > 0 && !showConnects && <span style={{ fontSize:11, color:C.accent, marginLeft:6 }}>● {form.connects_to.length}</span>}
          </div>
          {showConnects && (
            <div className="rapp-fadein" style={{ marginTop:8 }}>
              <CardPicker allCards={cards.filter(c=>c.id!==card.id)} value={form.connects_to} onChange={v=>setForm(f=>({...f,connects_to:v}))} mode="multi" excludeId={card.id} placeholder="Search cards to link…" />
            </div>
          )}
        </div>
        {cards.filter(c=>c.id!==card.id).length > 0 && (
          <div className="rapp-mb16">
            <div className="nid-note-toggle" onClick={()=>setShowPrereq(o=>!o)}>
              {Ico.chevron(13, showPrereq)}
              <span>Requires (prerequisite)</span>
              <span style={{ fontSize:11, color:C.textMut, marginLeft:4 }}>(optional)</span>
              {form.prerequisite_card_id && !showPrereq && <span style={{ fontSize:11, color:C.accent, marginLeft:6 }}>●</span>}
            </div>
            {showPrereq && (
              <div className="rapp-fadein" style={{ marginTop:8 }}>
                <p style={{ fontSize:12, color:C.textMut, marginBottom:8, lineHeight:1.6 }}>This card should only be reviewed after:</p>
                <CardPicker allCards={cards.filter(c=>c.id!==card.id)} value={form.prerequisite_card_id} onChange={v=>setForm(f=>({...f,prerequisite_card_id:v}))} mode="single" excludeId={card.id} placeholder="Search for prerequisite card…" />
              </div>
            )}
          </div>
        )}

        {/* AI assist */}
        <div style={{ marginBottom:14 }}>
          {!aiOpen ? (
            <button onClick={()=>setAiOpen(true)}
              style={{ width:"100%", padding:"9px 0", borderRadius:10, border:`1px solid ${C.border}`, background:"transparent",
                color:C.textSec, fontSize:12, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center" }}>
              AI assist
            </button>
          ) : (
            <div style={{ background:C.elevated, borderRadius:12, padding:"14px 14px 10px" }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.text, marginBottom:8 }}>AI assist</div>
              <p style={{ fontSize:11, color:C.textMut, marginBottom:8, lineHeight:1.6 }}>
                Describe how to improve this card. Citations must be added manually (LLMs hallucinate medical references at rates above 30%: Alkaissi and McFarlane, Am J Case Rep 2023; Thirunavukarasu et al., Lancet Digit Health 2023).
              </p>
              {aiError && (
                <div style={{ background:"#FDF0DC", border:"1px solid #E8C880", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#5C3A00", marginBottom:8 }}>{aiError}</div>
              )}
              <textarea className="rapp-textarea" rows={2} value={aiPrompt}
                onChange={e=>setAiPrompt(e.target.value)}
                placeholder="e.g. Make the question more concise and improve the recall cue." />
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                <button onClick={handleAiRequest} disabled={!aiPrompt.trim()||aiLoading}
                  style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", opacity:aiLoading?0.6:1 }}>
                  {aiLoading ? "Thinking..." : "Suggest edit"}
                </button>
                <button onClick={()=>{ setAiOpen(false); setAiError(null); setAiProposal(null); setAiPrompt("") }}
                  style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.textSec, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        {aiProposal && (
          <AIDiffModal
            original={{ front: form.front, back: form.back }}
            proposed={aiProposal.proposed}
            isClinical={aiProposal.isClinical}
            onApprove={handleApplyAiProposal}
            onEdit={(f) => { setForm(prev => ({ ...prev, ...f, ai_edited: true })); setAiProposal(null); setAiOpen(false); setAiPrompt("") }}
            onReject={() => setAiProposal(null)}
          />
        )}
        {showHistory && (
          <CardHistoryModal cardId={card.id} onClose={()=>setShowHistory(false)} />
        )}
        <button className="rapp-btn rapp-btn-primary rapp-mb12" style={{ width:"100%" }}
          onClick={handleSave} disabled={!form.front.trim()||!form.back.trim()}>
          Save changes
        </button>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={handleArchive}
            style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${C.border}`, background:"transparent", color:C.textSec, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            {card.status==="Archived"?"Unarchive":"Archive"}
          </button>
          {!confirmDel ? (
            <button onClick={()=>setConfirmDel(true)}
              style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid #E8B0A0`, background:"transparent", color:C.again, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              Delete
            </button>
          ) : (
            <button onClick={handleDelete}
              style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:C.againBg, color:C.again, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              Confirm delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ AI Diff Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Displays original vs AI-proposed content side by side. User must click Accept,
// Edit before accepting, or Reject. No card is modified until Accept is clicked.
function AIDiffModal({ original, proposed, isClinical, onApprove, onEdit, onReject }) {
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
              <button onClick={()=>setEditMode(true)} style={{ flex:1, padding:"10px", borderRadius:10, border:`+"`"+`1px solid ${C.border}`+"`"+`, background:"transparent", color:C.textSec, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Edit before accepting</button>
              <button onClick={onReject} style={{ flex:1, padding:"10px", borderRadius:10, border:"1px solid #E8B0A0", background:"transparent", color:C.again, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Reject</button>
            </>
          ) : (
            <>
              <button onClick={()=>onEdit({ front:editedFront, back:editedBack })} style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Accept edited version</button>
              <button onClick={()=>setEditMode(false)} style={{ flex:1, padding:"10px", borderRadius:10, border:`+"`"+`1px solid ${C.border}`+"`"+`, background:"transparent", color:C.textSec, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Back to diff</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Card History Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Shows all CardHistory records for a card, newest first.
// The original content before the first AI change is always preserved and visible.
function CardHistoryModal({ cardId, onClose }) {
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

// ─── Deck View ────────────────────────────────────────────────────────────────
function DeckView({ deckName, cards, onUpdateCards, onBack, decks, settings, onArchiveDeck }) {
  const [form, setForm]           = useState({ front:"", back:"", tags:[], note:"", anchor:"", source:"", contentType:"Factual", stakesFlag:false, connects_to:[], prerequisite_card_id:null })
  const [addMode, setAddMode]     = useState("basic") // "basic" | "cloze" | "occlusion"
  const [clozeText, setClozeText] = useState("")
  const [showOcclusionEditor, setShowOcclusionEditor] = useState(false)
  const [showNote, setShowNote]   = useState(false)
  const [showAnchor, setShowAnchor] = useState(false)
  const [showConnects, setShowConnects] = useState(false)
  const [showPrereq, setShowPrereq]     = useState(false)
  const [search, setSearch]       = useState("")
  const [filterSt, setFilterSt] = useState("active")
  const [groupBySource, setGroupBySource] = useState(false)
  const [editCard, setEditCard] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [saved, setSaved]       = useState(false)
  const [showDeckMenu, setShowDeckMenu] = useState(false)
  const [quickAdd, setQuickAdd] = useState(false)
  const [qaFront, setQaFront] = useState("")
  const [qaBack, setQaBack] = useState("")
  const qaFrontRef = useRef(null)
  const frontRef = useRef(null)

  const leechThreshold = (settings||{}).leechThreshold || 5
  const isLeech = c => (c.lapses||0) >= leechThreshold
  const isArch  = c => c.status==="Archived"||c.status==="Parked"

  const deckCards = cards.filter(c => c.deck === deckName)
  const activeCount = deckCards.filter(isActive).length

  const filtered = deckCards
    .filter(c => filterSt==="active" ? isActive(c) : filterSt==="archived" ? isArch(c) : true)
    .filter(c => !search || c.front.toLowerCase().includes(search.toLowerCase()) || (c.back||"").toLowerCase().includes(search.toLowerCase()) || (c.anchor||"").toLowerCase().includes(search.toLowerCase()) || (c.source||"").toLowerCase().includes(search.toLowerCase()))

  useEffect(() => { frontRef.current?.focus() }, [])

  const handleAdd = async () => {
    if (!form.front.trim() || !form.back.trim()) return
    const card = {
      id:genId(), front:form.front.trim(), back:form.back.trim(),
      elaboration:form.note.trim(), anchor:form.anchor.trim()||null, source:form.source.trim()||null, tags:form.tags, deck:deckName,
      contentType:form.contentType||"Factual", stakes_flag:form.stakesFlag||false, connects_to:form.connects_to, prerequisite_card_id:form.prerequisite_card_id, status:"Active", nextReview:null,
      interval:1, reviewCount:0, lapses:0, createdAt:new Date().toISOString(),
    }
    await onUpdateCards([...cards, card])
    storage.adjustDeckCount(deckName, 1).catch(()=>{})
    setForm({ front:"", back:"", tags:[], note:"", anchor:"", source:"", contentType:"Factual", stakesFlag:false, connects_to:[], prerequisite_card_id:null })
    setShowNote(false); setShowAnchor(false); setShowConnects(false); setShowPrereq(false)
    setSaved(true); setTimeout(()=>setSaved(false), 1200)
  }

  const createQuickCard = () => ({
    id:genId(), front:qaFront.trim(), back:qaBack.trim(), deck:deckName,
    contentType:"Factual", status:"Active", interval:1, reviewCount:0, lapses:0,
    ratingHistory:[], connects_to:[], stability:null, difficulty:null,
    nextReview:null, lastReview:null, elaboration:"", anchor:null,
    source:null, stakes_flag:false, prerequisite_card_id:null,
    tags:[], createdAt:new Date().toISOString()
  })

  const saveQuickAdd = async () => {
    if (!qaFront.trim() || !qaBack.trim()) return
    const card = createQuickCard()
    await onUpdateCards([...cards, card])
    storage.adjustDeckCount(deckName, 1).catch(()=>{})
    setQaFront(""); setQaBack(""); setQuickAdd(false)
  }

  const saveAndAddAnother = async () => {
    if (!qaFront.trim() || !qaBack.trim()) return
    const card = createQuickCard()
    await onUpdateCards([...cards, card])
    storage.adjustDeckCount(deckName, 1).catch(()=>{})
    setQaFront(""); setQaBack("")
    setTimeout(() => qaFrontRef.current?.focus(), 50)
  }

  const handleArchiveCard = async (id, e) => {
    e.stopPropagation()
    await onUpdateCards(cards.map(c => c.id===id ? { ...c, status:isArch(c)?"Active":"Archived" } : c))
  }

  const canAdd = form.front.trim() && form.back.trim()

  return (
    <div className="rapp-wrap rapp-fadein">
      {editCard && <EditCardModal card={editCard} cards={cards} onUpdateCards={onUpdateCards} decks={decks} onClose={()=>setEditCard(null)} onSaveHistory={storage.saveCardHistory} />}

      {/* Header */}
      <div className="rapp-row rapp-sb rapp-mb24">
        <div className="rapp-row rapp-gap8">
          <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMut, padding:"4px 8px 4px 0", display:"flex", alignItems:"center" }}>
            {Ico.back(18)}
          </button>
          <div>
            <div className="rapp-pg-title">{deckName}</div>
            <div className="rapp-pg-sub">{activeCount} card{activeCount!==1?"s":""}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, position:"relative" }}>
          <button className="rapp-btn rapp-btn-ghost" style={{ padding:"7px 12px", fontSize:13 }}
            onClick={()=>{ setQuickAdd(q=>!q); setTimeout(()=>qaFrontRef.current?.focus(),50) }}>
            ⚡ Quick add
          </button>
          <button className="rapp-btn rapp-btn-ghost" style={{ padding:"7px 12px", fontSize:13 }}
            onClick={()=>setShowDeckMenu(o=>!o)}>⋯</button>
          {showDeckMenu && (
            <div style={{ position:"absolute", right:0, top:"calc(100% + 6px)", background:C.elevated, border:`1px solid ${C.border}`, borderRadius:12, padding:6, minWidth:160, zIndex:10, boxShadow:"0 4px 16px rgba(28,40,32,0.12)" }}>
              {[
                { label:"Archive deck", action:()=>{ onArchiveDeck(deckName); setShowDeckMenu(false) } },
                { label:"Sync card count", action:()=>{ storage.recalculateDeckCount(deckName, cards).catch(()=>{}); setShowDeckMenu(false) } },
              ].map((item,i) => (
                <div key={i} onClick={item.action}
                  style={{ padding:"9px 14px", fontSize:13, cursor:"pointer", borderRadius:8, color:C.textSec, transition:"background 0.1s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {item.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


      {quickAdd && (
        <div className="rapp-card rapp-mb16 rapp-fadein">
          <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>Quick add</div>
          <input ref={qaFrontRef} className="rapp-input" placeholder="Front (question)" value={qaFront}
            onChange={e=>setQaFront(e.target.value)} style={{ marginBottom:8 }} />
          <textarea className="rapp-textarea" rows={2} placeholder="Back (answer)" value={qaBack}
            onChange={e=>setQaBack(e.target.value)} style={{ marginBottom:12 }} />
          <div style={{ display:"flex", gap:8 }}>
            <button className="rapp-btn rapp-btn-ghost" style={{ flex:1 }} onClick={saveAndAddAnother}
              disabled={!qaFront.trim()||!qaBack.trim()}>Save and add another</button>
            <button className="rapp-btn rapp-btn-primary" style={{ flex:1 }} onClick={saveQuickAdd}
              disabled={!qaFront.trim()||!qaBack.trim()}>Save</button>
          </div>
        </div>
      )}

      {/* Add card form */}
      <div className="rapp-card rapp-mb24">
        <div className="rapp-row rapp-sb" style={{ marginBottom:12, alignItems:"center" }}>
          <div className="rapp-sec-title" style={{ marginBottom:0 }}>Add card</div>
          <div style={{ display:"flex", gap:4 }}>
            {["basic","cloze","occlusion"].map(m => (
              <button key={m} onClick={()=>setAddMode(m)}
                style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${addMode===m?C.accent:C.border}`, background:addMode===m?C.accent:"transparent", color:addMode===m?"#fff":C.textSec, fontSize:11, fontWeight:500, cursor:"pointer", fontFamily:"inherit", transition:"all 0.12s", textTransform:"capitalize" }}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {addMode === "basic" && <>
        <div className="rapp-mb10" style={{ marginBottom:10 }}>
          <label className="rapp-label">Front</label>
          <textarea ref={frontRef} className="rapp-textarea" rows={2} value={form.front} maxLength={FRONT_MAX}
            onChange={e=>setForm(f=>({...f,front:e.target.value}))}
            placeholder="Question or prompt that forces retrieval."
            onKeyDown={e=>{ if(e.key==="Tab"){ e.preventDefault(); document.querySelector(".nid-back-input")?.focus() }}} />
          <CharCount current={form.front.length} max={FRONT_MAX} />
        </div>

        <div className="rapp-mb10" style={{ marginBottom:10 }}>
          <label className="rapp-label">Back</label>
          <textarea className="rapp-textarea nid-back-input" rows={2} value={form.back} maxLength={BACK_MAX}
            onChange={e=>setForm(f=>({...f,back:e.target.value}))}
            placeholder="Concise answer: one idea only." />
          <CharCount current={form.back.length} max={BACK_MAX} />
        </div>

        <div className="rapp-mb10" style={{ marginBottom:10 }}>
          <label className="rapp-label">Tags</label>
          <TagInput tags={form.tags} onChange={t=>setForm(f=>({...f,tags:t}))} />
        </div>

        <div className="rapp-mb10" style={{ marginBottom:10 }}>
          <label className="rapp-label">Type</label>
          <select className="rapp-select" value={form.contentType} onChange={e=>setForm(f=>({...f,contentType:e.target.value}))}>
            {["Factual","Mechanism","Clinical Reasoning","Anatomy","Pathology"].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>

        <div className="rapp-mb10" style={{ marginBottom:10 }}>
          <label className="rapp-label">Source (optional)</label>
          <input className="rapp-input" value={form.source} maxLength={SOURCE_MAX}
            onChange={e=>setForm(f=>({...f,source:e.target.value}))}
            placeholder="Article, chapter, guideline, or lecture this card came from." />
          {form.source.length >= SOURCE_MAX - 40 && <CharCount current={form.source.length} max={SOURCE_MAX} />}
        </div>

        <div className="rapp-mb12">
          <div className="rapp-row rapp-sb" style={{ alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:form.stakesFlag?C.accent:C.text }}>Clinically critical</div>
              <div style={{ fontSize:11, color:C.textMut, marginTop:2, lineHeight:1.5 }}>High-stakes card: prioritised when study time is short.</div>
            </div>
            <div role="switch" aria-checked={form.stakesFlag}
              onClick={()=>setForm(f=>({...f,stakesFlag:!f.stakesFlag}))}
              style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0, marginTop:2,
                background:form.stakesFlag?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
              <div style={{ position:"absolute", top:3, left:form.stakesFlag?21:3, width:16, height:16, borderRadius:8,
                background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
            </div>
          </div>
        </div>

        <div className="rapp-mb12">
          <NoteToggle value={form.note} onChange={v=>setForm(f=>({...f,note:v}))} open={showNote} onToggle={()=>setShowNote(o=>!o)} />
        </div>
        <div className="rapp-mb12">
          <AnchorToggle value={form.anchor} onChange={v=>setForm(f=>({...f,anchor:v}))} open={showAnchor} onToggle={()=>setShowAnchor(o=>!o)} />
        </div>
        {deckCards.length > 0 && (
          <>
            <div className="rapp-mb12">
              <div className="nid-note-toggle" onClick={()=>setShowConnects(o=>!o)}>
                {Ico.chevron(13, showConnects)}
                <span>Connects to</span>
                <span style={{ fontSize:11, color:C.textMut, marginLeft:4 }}>(optional)</span>
                {form.connects_to.length > 0 && !showConnects && <span style={{ fontSize:11, color:C.accent, marginLeft:6 }}>● {form.connects_to.length}</span>}
              </div>
              {showConnects && (
                <div className="rapp-fadein" style={{ marginTop:8 }}>
                  <CardPicker allCards={deckCards} value={form.connects_to} onChange={v=>setForm(f=>({...f,connects_to:v}))} mode="multi" placeholder="Search cards to link…" />
                </div>
              )}
            </div>
            <div className="rapp-mb16">
              <div className="nid-note-toggle" onClick={()=>setShowPrereq(o=>!o)}>
                {Ico.chevron(13, showPrereq)}
                <span>Requires (prerequisite)</span>
                <span style={{ fontSize:11, color:C.textMut, marginLeft:4 }}>(optional)</span>
                {form.prerequisite_card_id && !showPrereq && <span style={{ fontSize:11, color:C.accent, marginLeft:6 }}>●</span>}
              </div>
              {showPrereq && (
                <div className="rapp-fadein" style={{ marginTop:8 }}>
                  <p style={{ fontSize:12, color:C.textMut, marginBottom:8, lineHeight:1.6 }}>This card should only be reviewed after:</p>
                  <CardPicker allCards={deckCards} value={form.prerequisite_card_id} onChange={v=>setForm(f=>({...f,prerequisite_card_id:v}))} mode="single" placeholder="Search for prerequisite card…" />
                </div>
              )}
            </div>
          </>
        )}

        </>
        }
        {addMode === "basic" && (
          <div className="rapp-row rapp-gap8">
            <button className="rapp-btn rapp-btn-primary rapp-flex1" onClick={handleAdd} disabled={!canAdd}>
              {saved ? "✓ Saved" : "Add card"}
            </button>
          </div>
        )}
        {addMode === "cloze" && (
          <div className="rapp-fadein">
            <div className="rapp-mb10">
              <label className="rapp-label">Cloze text
                <span style={{ marginLeft:6, fontSize:11, fontWeight:400, color:C.textMut, cursor:"default" }}
                  title="Cloze cards force retrieval of the hidden span, which improves long-term retention more than recognition-style review (Roediger and Karpicke, Psychol Sci 2006).">ⓘ</span>
              </label>
              <textarea className="rapp-textarea" rows={3} value={clozeText}
                onChange={e=>setClozeText(e.target.value)}
                placeholder="Type {{c1::answer}} to mark a deletion. Example: The heart rate is controlled by the {{c1::sinoatrial node}}." />
            </div>
            {clozeText.trim() && (() => {
              const { cards: cv } = parseCloze(clozeText)
              return (
                <div style={{ background:C.elevated, borderRadius:10, padding:"10px 14px", marginBottom:12 }}>
                  <div style={{ fontSize:12, color:C.textMut, marginBottom:6 }}>This note produces {cv.length} card{cv.length!==1?"s":""}. Preview of card 1:</div>
                  {cv.length > 0 && <div style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{renderClozeFront(cv[0].front)}</div>}
                </div>
              )
            })()}
            <button className="rapp-btn rapp-btn-primary" style={{ width:"100%" }}
              disabled={!clozeText.trim() || parseCloze(clozeText).indices.length === 0}
              onClick={async () => {
                const newCards = createClozeCards(clozeText, deckName)
                if (!newCards.length) return
                await onUpdateCards([...cards, ...newCards])
                storage.adjustDeckCount(deckName, newCards.length).catch(()=>{})
                setClozeText("")
                setSaved(true); setTimeout(()=>setSaved(false), 1200)
              }}>
              {saved ? "✓ Saved" : `Create ${parseCloze(clozeText).indices.length} cloze card${parseCloze(clozeText).indices.length!==1?"s":""}`}
            </button>
          </div>
        )}
        {addMode === "occlusion" && (
          <div className="rapp-fadein">
            <ImageOcclusionEditor onSave={async (imgUrl, regions) => {
              const newCards = createOcclusionCards(imgUrl, regions, deckName)
              await onUpdateCards([...cards, ...newCards])
              storage.adjustDeckCount(deckName, newCards.length).catch(()=>{})
              setAddMode("basic")
              setSaved(true); setTimeout(()=>setSaved(false), 1200)
            }} />
          </div>
        )}
      </div>

      {/* Search + filter */}
      <div className="rapp-mb12">
        <input className="rapp-input" placeholder="Search cards…" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <div className="rapp-row rapp-gap8 rapp-mb16" style={{ flexWrap:"wrap" }}>
        {["active","archived","all"].map(f => (
          <button key={f} onClick={()=>setFilterSt(f)}
            style={{ padding:"6px 13px", borderRadius:8, border:`1px solid ${filterSt===f?C.accent:C.border}`, background:filterSt===f?C.accent:"transparent", color:filterSt===f?"#fff":C.textSec, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit", transition:"all 0.14s", textTransform:"capitalize" }}>
            {f}
          </button>
        ))}
        <button onClick={()=>setGroupBySource(o=>!o)}
          style={{ padding:"6px 13px", borderRadius:8, border:`1px solid ${groupBySource?C.accent:C.border}`, background:groupBySource?C.accent:"transparent", color:groupBySource?"#fff":C.textSec, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit", transition:"all 0.14s", marginLeft:"auto" }}>
          Group by source
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rapp-empty">{search?"No cards match that search.":deckCards.length===0?"No cards yet. Add your first card above.":"No cards match this filter."}</div>
      ) : groupBySource ? (() => {
        const groups = {}
        for (const c of filtered) {
          const key = c.source?.trim() || ""
          ;(groups[key] || (groups[key] = [])).push(c)
        }
        const sorted = [...Object.keys(groups)].sort((a,b) => {
          if (!a) return 1; if (!b) return -1; return a.localeCompare(b)
        })
        return (
          <div className="rapp-col" style={{ gap:20 }}>
            {sorted.map(src => (
              <div key={src||"__none"}>
                <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.textMut, marginBottom:8, paddingLeft:2 }}>
                  {src || "No source"}
                  <span style={{ marginLeft:6, fontWeight:400, textTransform:"none", letterSpacing:0 }}>({groups[src].length})</span>
                </div>
                <div className="rapp-col" style={{ gap:10 }}>
                  {groups[src].map(c => (
            <div key={c.id} className="rapp-card-item" onClick={()=>setExpanded(expanded===c.id?null:c.id)}>
              <div className="rapp-row rapp-sb" style={{ gap:10 }}>
                <p className="rapp-card-item-q" style={{ flex:1 }}>{c.front}</p>
                <div className="rapp-row rapp-gap8" style={{ flexShrink:0 }} onClick={e=>e.stopPropagation()}>
                  <button onClick={()=>setEditCard(c)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, padding:"8px 6px", fontFamily:"inherit" }}>Edit</button>
                  <button onClick={e=>handleArchiveCard(c.id,e)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, padding:"8px 6px", fontFamily:"inherit" }}>
                    {isArch(c)?"Unarchive":"Archive"}
                  </button>
                  {Ico.chevron(14, expanded===c.id)}
                </div>
              </div>
              <div className="rapp-row rapp-mt8" style={{ gap:6, flexWrap:"wrap" }}>
                {(c.tags||[]).map((t,i) => <span key={i} className="nid-tag">{t}</span>)}
                {c.nextReview && <span className="rapp-ts">· Due {c.nextReview}</span>}
                {!c.nextReview && isActive(c) && <span style={{ fontSize:12, color:C.accent, fontWeight:500 }}>· New</span>}
                {isArch(c) && <span style={{ fontSize:12, color:C.textMut }}>· Archived</span>}
                {isActive(c) && isLeech(c) && <span className="rapp-leech">leech</span>}
              </div>
              {expanded===c.id && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }} className="rapp-fadein">
                  <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.textMut, marginBottom:6 }}>Answer</p>
                  <p style={{ fontSize:14, color:C.textSec, lineHeight:1.75, whiteSpace:"pre-wrap", marginBottom:12 }}>{c.back}</p>
                  {c.elaboration && (
                    <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                      <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.textMut, marginBottom:6 }}>Note</p>
                      <p style={{ fontSize:13, color:C.textSec, fontStyle:"italic", lineHeight:1.65 }}>{c.elaboration}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      ))}
    </div>
  )
})() : (
  <div className="rapp-col" style={{ gap:10 }}>
    {filtered.map(c => (
      <div key={c.id} className="rapp-card-item" onClick={()=>setExpanded(expanded===c.id?null:c.id)}>
        <div className="rapp-row rapp-sb" style={{ gap:10 }}>
          <p className="rapp-card-item-q" style={{ flex:1 }}>{c.front}</p>
          <div className="rapp-row rapp-gap8" style={{ flexShrink:0 }} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setEditCard(c)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, padding:"8px 6px", fontFamily:"inherit" }}>Edit</button>
            <button onClick={e=>handleArchiveCard(c.id,e)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, padding:"8px 6px", fontFamily:"inherit" }}>
              {isArch(c)?"Unarchive":"Archive"}
            </button>
            {Ico.chevron(14, expanded===c.id)}
          </div>
        </div>
        <div className="rapp-row rapp-mt8" style={{ gap:6, flexWrap:"wrap", alignItems:"center" }}>
          {c.contentType && <span className="nid-ct-chip" style={{ marginBottom:0 }}>{c.contentType}</span>}
          {(c.tags||[]).map((t,i) => <span key={i} className="nid-tag">{t}</span>)}
          {c.nextReview && <span className="rapp-ts">· Due {c.nextReview}</span>}
          {!c.nextReview && isActive(c) && <span style={{ fontSize:12, color:C.accent, fontWeight:500 }}>· New</span>}
          {isArch(c) && <span style={{ fontSize:12, color:C.textMut }}>· Archived</span>}
          {isActive(c) && isLeech(c) && <span className="rapp-leech">leech</span>}
        </div>
        {expanded===c.id && (
          <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }} className="rapp-fadein">
            <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.textMut, marginBottom:6 }}>Answer</p>
            <p style={{ fontSize:14, color:C.textSec, lineHeight:1.75, whiteSpace:"pre-wrap", marginBottom:12 }}>{c.back}</p>
            {c.elaboration && (
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.textMut, marginBottom:6 }}>Note</p>
                <p style={{ fontSize:13, color:C.textSec, fontStyle:"italic", lineHeight:1.65 }}>{c.elaboration}</p>
              </div>
            )}
          </div>
        )}
      </div>
    ))}
  </div>
)}
    </div>
  )
}

// ─── Study Select View ────────────────────────────────────────────────────────
function StudySelectView({ cards, decks, settings, onStartSRS, onStartFree, onStartInterleaved }) {
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
        <div className="rapp-pg-title">Study</div>
        <div className="rapp-pg-sub">Choose mode and deck</div>
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
      <button className="rapp-btn rapp-btn-primary rapp-btn-full" disabled={!canStart}
        onClick={() => {
          if (mode==="srs") onStartSRS(deck, sleepWindowActive ? 0 : null, focused)
          else if (mode==="interleaved") onStartInterleaved(interleavedDecks)
          else onStartFree(deck)
        }}>
        {mode==="srs" ? "Start session" : mode==="interleaved" ? "Start interleaved review" : "Start free study"}
      </button>

      {(mode==="srs" || mode==="interleaved") && !canStart && (
        <p style={{ textAlign:"center", fontSize:13, color:C.textMut, marginTop:12 }}>
          Nothing to study. Come back tomorrow or add cards.
        </p>
      )}
    </div>
  )
}

// ─── Session View (FSRS) ──────────────────────────────────────────────────────
const INTENSITY_WEIGHT = { again:4, hard:3, good:2, easy:1 }
const INTENSITY_BREAK  = 40

function SessionView({ cards, onUpdateCards, onSaveLog, onDone, settings, studyDeckName, log=[], capOverride=null, focused=false, isFirstStudy=false, onFirstStudyComplete=null, onFitParams=null, interleavedCards=null, onSessionCompleted=null }) {
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
  const [stats,          setStats]          = useState({ reviewed:0, failed:0, newAdded:0 })
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
    setLastAction({ cardId:card.id, prevInterval:card.interval, prevNextReview:card.nextReview,
      prevReviewCount:card.reviewCount||0, prevStability:card.stability, prevDifficulty:card.difficulty,
      prevLastReview:card.lastReview, prevLapses:card.lapses||0,
      statDelta:{ reviewed:isNew?0:1, failed, newAdded:isNew?1:0 }, phase, idx })
    setStats(s => ({ reviewed:s.reviewed+(isNew?0:1), failed:s.failed+failed, newAdded:s.newAdded+(isNew?1:0) }))
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
    setStats(s => ({ reviewed:s.reviewed-lastAction.statDelta.reviewed, failed:s.failed-lastAction.statDelta.failed, newAdded:s.newAdded-lastAction.statDelta.newAdded }))
    setIdx(lastAction.idx); setPhase(lastAction.phase); setLastAction(null)
  }

  const handleClose = async () => {
    const frictionNote = assembleFrictionNote(friction, { intensityPts, intensityCount, fatigueScore, fatigueAlertsEnabled, focused })
    await onSaveLog({ date:new Date().toISOString(), reviewed:stats.reviewed, failed:stats.failed, newAdded:stats.newAdded, frictionNote, status: "complete", intensity_score: intensityCount > 0 ? parseFloat((intensityPts/intensityCount).toFixed(1)) : 0 })
    if (isFirstStudy && onFirstStudyComplete) onFirstStudyComplete()

    // Parameter fitting: run if >= 200 total reviews and fit conditions met.
    // Current scope: adjust retentionTarget from observed recall accuracy.
    // Full 19-parameter gradient descent is deferred to Session 3.
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
      <div className="rapp-stat-row rapp-mb20">
        <div className="rapp-stat-box"><div className="rapp-stat-num">{stats.reviewed}</div><div className="rapp-stat-lbl">Reviewed</div></div>
        <div className="rapp-stat-box"><div className="rapp-stat-num" style={{ color:stats.failed>0?C.again:C.textMut }}>{stats.failed}</div><div className="rapp-stat-lbl">Failed</div></div>
        <div className="rapp-stat-box"><div className="rapp-stat-num" style={{ color:C.accent }}>{stats.newAdded}</div><div className="rapp-stat-lbl">New cards</div></div>
      </div>
      {(() => { const cal = computeCalibration(cards); return (
        <div style={{ fontSize:13, color:C.textMut, marginBottom:8 }}>
          Recall accuracy (30 days): {cal.score !== null ? <strong style={{ color:cal.score>=85?C.accent:C.warning }}>{cal.score}%</strong> : <span>tracking started</span>}
        </div>
      )})()}
      <div style={{ fontSize:13, color:C.textMut, marginBottom:8 }}>
        Session intensity: {intensityCount > 0 ? <strong>{(intensityPts/intensityCount).toFixed(1)}</strong> : <span>-</span>}
      </div>
      {minInt !== null && (
        <div style={{ fontSize:13, color:C.textMut, marginBottom:16 }}>
          Next reviews: <strong>{minInt}–{maxInt} days</strong> based on your ratings.
        </div>
      )}
      <div className="rapp-card rapp-mb16">
        <label className="rapp-label">Session notes (optional)</label>
        <textarea className="rapp-textarea" rows={3} placeholder="Anything that felt slow or unclear?" value={friction} onChange={e=>setFriction(e.target.value)} />
      </div>
      <button className="rapp-btn rapp-btn-primary rapp-btn-full" onClick={handleClose}>Save and finish</button>
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

// ─── Free Study View ──────────────────────────────────────────────────────────
function FreeStudyView({ cards, studyDeckName, onDone, settings }) {
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
      <div style={{ fontSize:40, marginBottom:16 }}>✓</div>
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
          {idx>0 && <button className="rapp-btn rapp-btn-ghost" style={{ flex:1 }} onClick={prev}>← Prev</button>}
          <button className="rapp-btn rapp-btn-primary" style={{ flex:2 }} onClick={next}>
            {idx+1<studyList.length?"Next →":"Finish"}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Stats View ───────────────────────────────────────────────────────────────
function StatsView({ log, cards, decks, settings }) {
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
        <div className="rapp-pg-title">Stats</div>
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
          <div className="rapp-card rapp-mb16">
            <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>
              Your stats will appear here after your first study session.
            </div>
            <div style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
              <p style={{ marginBottom:8 }}><strong>Due today:</strong> cards whose next review date is today or earlier.</p>
              <p style={{ marginBottom:8 }}><strong>Active cards:</strong> total cards with status Active (not archived or parked).</p>
              <p style={{ marginBottom:8 }}><strong>Mature cards:</strong> cards with a stability value above the maturity threshold (default: 30 days). Mature cards need less frequent review.</p>
              <p style={{ marginBottom:8 }}><strong>Recall accuracy:</strong> percentage of reviews rated Good or Easy in the last 30 days.</p>
              <p style={{ marginBottom:16 }}><strong>Critical cards:</strong> cards with the stakes flag set. These are reviewed at higher priority.</p>
            </div>
          </div>
          <div className="rapp-card rapp-mb16">
            <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>How the scheduling works</div>
            <div style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
              <p style={{ marginBottom:8 }}>
                The FSRS algorithm estimates the probability you will recall a card and
                schedules it to be reviewed just before that probability drops below a
                target threshold (default: 90%). Cards you recall easily are shown less
                often; cards you struggle with come back sooner.
              </p>
              <p>Reference: Open Spaced Repetition project, github.com/open-spaced-repetition.</p>
            </div>
          </div>
          <div className="rapp-card rapp-mb20">
            <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>What to expect</div>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:12, color:C.textSec }}>
              <div><strong>Week 1:</strong> cards are new, intervals are short (1 to 3 days). High daily volume.</div>
              <div><strong>Week 4:</strong> familiar cards space out to 7 to 21 days. Daily workload stabilises.</div>
              <div><strong>Month 3:</strong> well-known cards reviewed once every few months. New cards drive most of the load.</div>
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
          <div className="rapp-stat-num" style={{ color:C.accent }}>{matureCards}</div>
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
              Critical cards: <strong style={{ color:criticalCards>0?C.accent:C.textMut }}>{criticalCards}</strong>
              <span style={{ color:C.textMut }}> of {totalActive} total</span>
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
              <p style={{ fontSize:13, color:C.textMut, marginBottom:12 }}>Tracking started: score shown after 10 qualifying reviews.</p>
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
          <div className="rapp-col" style={{ gap:10 }}>
            {log.map((entry,i) => (
              <div key={i} className="rapp-card">
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
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Settings View ────────────────────────────────────────────────────────────
function SettingsView({ settings, onUpdateSettings, cards, decks, onExport, onImport, onImportCards, onImportAnki, onRefitParams, schedulerParams }) {
  const {
    newCardCap=15, reviewCap=100, leechThreshold=5, retentionTarget=0.90, catchupDays=7,
    sleepBedtime=null, sleepWindowMinutes=90, sleepBannerEnabled=true, sleepPrefersReviews=true,
    matureModeEnabled=true, matureCardThreshold=30,
    fatigueAlertsEnabled=true, attentionDeclarationEnabled=true,
  } = settings||{}
  const [activeTab, setActiveTab] = useState("study")
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const TAB = (id, label) => (
    <button onClick={()=>setActiveTab(id)}
      style={{ padding:"7px 14px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:500,
        background:activeTab===id?C.elevated:"transparent", color:activeTab===id?C.text:C.textMut,
        boxShadow:activeTab===id?`0 1px 4px rgba(28,40,32,0.08)`:"none", transition:"all 0.14s" }}>
      {label}
    </button>
  )

  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb24">
        <div className="rapp-pg-title">Settings</div>
      </div>

      <div style={{ display:"flex", gap:4, background:C.bg, borderRadius:10, padding:3, marginBottom:20 }}>
        {TAB("study", "Study")}
        {TAB("sleep", "Sleep")}
        {TAB("data",  "Data")}
      </div>

      {activeTab === "study" && (
        <div className="rapp-fadein">
          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Daily limits</div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>New cards per day</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{newCardCap}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={5} max={100} step={5} value={newCardCap}
                  onChange={e=>onUpdateSettings({...settings, newCardCap:Number(e.target.value)})} style={{ flex:1 }} />
                <input type="number" min={5} max={100} step={5} value={newCardCap}
                  onChange={e=>onUpdateSettings({...settings, newCardCap:Math.min(100, Math.max(5, +e.target.value||5))})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>Start at 15 and raise once a sustainable routine is established. Reference: Wozniak, supermemo.com graduated introduction guidelines.</p>
            </div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Reviews per day</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{reviewCap}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={20} max={500} step={10} value={reviewCap}
                  onChange={e=>onUpdateSettings({...settings, reviewCap:Number(e.target.value)})} style={{ flex:1 }} />
                <input type="number" min={20} max={500} step={10} value={reviewCap}
                  onChange={e=>onUpdateSettings({...settings, reviewCap:Math.min(500, Math.max(20, +e.target.value||20))})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>100 reviews per day supports a manageable workload. Reference: Anki community defaults.</p>
            </div>

            <div>
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Catch-up spread (days)</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{catchupDays}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={1} max={14} value={catchupDays}
                  onChange={e=>onUpdateSettings({...settings, catchupDays:Number(e.target.value)})} style={{ flex:1 }} />
                <input type="number" min={1} max={14} step={1} value={catchupDays}
                  onChange={e=>onUpdateSettings({...settings, catchupDays:Math.min(14, Math.max(1, +e.target.value||1))})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>Overdue cards are spread across this many days to avoid overwhelming sessions.</p>
            </div>
          </div>

          <div style={{ marginTop:4, marginBottom:12 }}>
            <button onClick={()=>setAdvancedOpen(o=>!o)}
              style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:C.textMut, padding:"6px 0" }}>
              {Ico.chevron(12, advancedOpen)}
              <span style={{ fontWeight:500 }}>Advanced: adjust after you have used the app for a few weeks</span>
            </button>
          </div>

          {advancedOpen && (<div className="rapp-fadein">

          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">FSRS scheduling</div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Target retention</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.accent }}>{Math.round(retentionTarget*100)}%</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={70} max={97} value={Math.round(retentionTarget*100)}
                  onChange={e=>onUpdateSettings({...settings, retentionTarget:Number(e.target.value)/100})} style={{ flex:1 }} />
                <input type="number" min={70} max={97} step={1} value={Math.round(retentionTarget*100)}
                  onChange={e=>onUpdateSettings({...settings, retentionTarget:Math.min(97, Math.max(70, +e.target.value||90))/100})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                Higher retention = shorter intervals (more reviews). 90% is the default. Lower values reduce review load at the cost of forgetting more.
              </p>
            </div>

            <div>
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Leech threshold (lapses)</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.again }}>{leechThreshold}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={3} max={10} value={leechThreshold}
                  onChange={e=>onUpdateSettings({...settings, leechThreshold:Number(e.target.value)})} style={{ flex:1 }} />
                <input type="number" min={3} max={10} step={1} value={leechThreshold}
                  onChange={e=>onUpdateSettings({...settings, leechThreshold:Math.min(10, Math.max(3, +e.target.value||5))})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>Cards failing this many times are flagged as leeches.</p>
            </div>
          </div>

          <div className="rapp-card" style={{ background:C.bg }}>
            <p style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
              <strong>Keyboard shortcuts during review:</strong> Ctrl+Enter to reveal · 1 = Again · 2 = Hard · 3 = Good · 4 = Easy
            </p>
          </div>

          <div className="rapp-card rapp-mb16" style={{ marginTop:16 }}>
            <div className="rapp-sec-title">FSRS Parameters</div>
            <div style={{ fontSize:13, color:C.textSec, lineHeight:1.6, marginBottom:10 }}>
              {schedulerParams?.lastFitDate
                ? <>Current parameter set: fitted on {schedulerParams.lastFitDate} from {schedulerParams.reviewCountAtFit || 0} reviews</>
                : <>Current parameter set: default ts-fsrs (no fit yet)</>
              }
            </div>
            <div style={{ fontSize:13, color:C.textSec, lineHeight:1.6, marginBottom:14 }}>
              Desired retention: <strong>{Math.round(retentionTarget * 100)}%</strong>
            </div>
            <p style={{ fontSize:12, color:C.textMut, marginBottom:12, lineHeight:1.6 }}>
              Nidus Recall adjusts the desired retention target based on your observed recall accuracy.
              Fitting requires at least 200 reviews. Full 19-parameter optimisation is planned for a future update.
            </p>
            <button className="rapp-btn rapp-btn-ghost" style={{ fontSize:13, padding:"8px 16px" }}
              onClick={onRefitParams}>
              Refit now
            </button>
          </div>

          <div className="rapp-card rapp-mb16" style={{ marginTop:16 }}>
            <div className="rapp-sec-title">Sustainability</div>
            <div className="rapp-row rapp-sb rapp-mb20">
              <div>
                <label className="rapp-label" style={{ marginBottom:0 }}>Sustainable pace alerts</label>
                <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>
                  Warns when session patterns suggest study fatigue over the last 14 days.
                </p>
              </div>
              <div role="switch" aria-checked={fatigueAlertsEnabled}
                onClick={() => onUpdateSettings({...settings, fatigueAlertsEnabled:!fatigueAlertsEnabled})}
                style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0, marginLeft:16,
                  background:fatigueAlertsEnabled?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
                <div style={{ position:"absolute", top:3,
                  left:fatigueAlertsEnabled?21:3, width:16, height:16, borderRadius:8,
                  background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
            <div className="rapp-row rapp-sb">
              <div>
                <label className="rapp-label" style={{ marginBottom:0 }}>Focus mode prompt</label>
                <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>
                  Shows a focused-session checkbox on the study start screen.
                </p>
              </div>
              <div role="switch" aria-checked={attentionDeclarationEnabled}
                onClick={() => onUpdateSettings({...settings, attentionDeclarationEnabled:!attentionDeclarationEnabled})}
                style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0, marginLeft:16,
                  background:attentionDeclarationEnabled?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
                <div style={{ position:"absolute", top:3,
                  left:attentionDeclarationEnabled?21:3, width:16, height:16, borderRadius:8,
                  background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
          </div>

          <div className="rapp-card rapp-mb16" style={{ marginTop:16 }}>
            <div className="rapp-sec-title">Study depth</div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb">
                <label className="rapp-label" style={{ marginBottom:0 }}>Mature card mode</label>
                <div role="switch" aria-checked={matureModeEnabled}
                  onClick={() => onUpdateSettings({...settings, matureModeEnabled:!matureModeEnabled})}
                  style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0,
                    background:matureModeEnabled?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
                  <div style={{ position:"absolute", top:3,
                    left:matureModeEnabled?21:3, width:16, height:16, borderRadius:8,
                    background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                Cards above the maturity threshold show an expanded prompt encouraging connected recall.
              </p>
            </div>

            <div>
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Maturity threshold (days)</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{matureCardThreshold}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={14} max={90} step={1} value={matureCardThreshold}
                  onChange={e=>onUpdateSettings({...settings, matureCardThreshold:Number(e.target.value)})} style={{ flex:1 }} />
                <input type="number" min={14} max={90} step={1} value={matureCardThreshold}
                  onChange={e=>onUpdateSettings({...settings, matureCardThreshold:Math.min(90, Math.max(14, +e.target.value||30))})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                A card is Mature when its FSRS stability reaches this value. Stability represents days to 90% retention.
              </p>
            </div>
          </div>

          </div>)} {/* end advancedOpen */}

        </div>
      )}

      {activeTab === "sleep" && (
        <div className="rapp-fadein">
          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Sleep and memory</div>

            <div className="rapp-mb20">
              <label className="rapp-label">Bedtime (optional)</label>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input type="time" className="rapp-input"
                  value={sleepBedtime||""}
                  onChange={e => onUpdateSettings({...settings, sleepBedtime: e.target.value||null})}
                  style={{ maxWidth:140 }} />
                {sleepBedtime && (
                  <button className="rapp-btn rapp-btn-ghost" style={{ padding:"8px 12px", fontSize:12 }}
                    onClick={() => onUpdateSettings({...settings, sleepBedtime:null})}>Clear</button>
                )}
              </div>
              {!sleepBedtime && <p style={{ fontSize:12, color:C.textMut, marginTop:6 }}>Not set</p>}
            </div>

            <div className="rapp-mb20">
              <label className="rapp-label">Review window</label>
              <select className="rapp-select" style={{ maxWidth:180 }}
                value={sleepWindowMinutes}
                onChange={e => onUpdateSettings({...settings, sleepWindowMinutes:Number(e.target.value)})}>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={120}>120 min</option>
              </select>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                How long before bedtime the sleep review banner appears.
              </p>
            </div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb">
                <label className="rapp-label" style={{ marginBottom:0 }}>Sleep review reminder</label>
                <div role="switch" aria-checked={sleepBannerEnabled}
                  onClick={() => onUpdateSettings({...settings, sleepBannerEnabled:!sleepBannerEnabled})}
                  style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0,
                    background:sleepBannerEnabled?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
                  <div style={{ position:"absolute", top:3,
                    left:sleepBannerEnabled?21:3, width:16, height:16, borderRadius:8,
                    background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                Shows a banner on the Library screen and a hint on the Study screen during the review window.
              </p>
            </div>

            <div>
              <div className="rapp-row rapp-sb">
                <div>
                  <label className="rapp-label" style={{ marginBottom:0 }}>Bedtime window prefers reviews over new cards</label>
                  <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>
                    The evidence for sleep-enhanced consolidation is strongest for material already partially learned (Diekelmann and Born, 2010). When on, due reviews are prioritised over new cards in the pre-bedtime window.
                  </p>
                </div>
                <div role="switch" aria-checked={sleepPrefersReviews}
                  onClick={() => onUpdateSettings({...settings, sleepPrefersReviews:!sleepPrefersReviews})}
                  style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0, marginLeft:16,
                    background:sleepPrefersReviews?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
                  <div style={{ position:"absolute", top:3,
                    left:sleepPrefersReviews?21:3, width:16, height:16, borderRadius:8,
                    background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
              </div>

            </div>
          </div>

          <div className="rapp-card" style={{ background:C.bg }}>
            <p style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
              Sleep after study supports memory consolidation (Diekelmann and Born, 2010). Reviewing close to bedtime may help retention, though most direct evidence is for new learning rather than review of familiar material. This is a reminder only. No scheduling changes are made.
            </p>
          </div>
        </div>
      )}

      {activeTab === "data" && (
        <ImportExportPanel cards={cards} decks={decks} onExport={onExport} onImportFile={onImport} onImportCards={onImportCards} onImportAnki={onImportAnki} />
      )}

      <div style={{ marginTop:32, paddingTop:16, borderTop:`1px solid ${C.border}`, textAlign:"center" }}>
        <span style={{ fontSize:11, color:C.textMut }}>Nidus Recall v0.6.0</span>
      </div>
    </div>
  )
}

// ─── Import / Export Panel ────────────────────────────────────────────────────
function ImportExportPanel({ cards, onImportFile, onImportCards, onExport, onImportAnki }) {
  const [tab,          setTab]         = useState("notion")
  const [notionToken,  setNotionToken] = useState(()=>notionGet().token||"")
  const [notionDb,     setNotionDb]    = useState(()=>notionGet().db||"")
  const [notionStatus, setNotionStatus]= useState("")
  const [notionBusy,   setNotionBusy]  = useState(false)
  const [notionPct,    setNotionPct]   = useState(0)
  const [csvResult,    setCsvResult]   = useState(null)
  const [importResult, setImportResult]= useState(null)
  // Anki import state
  const [apkgPreview,    setApkgPreview]    = useState(null)
  const [apkgError,      setApkgError]      = useState(null)
  const [apkgImporting,  setApkgImporting]  = useState(false)
  const csvRef    = useRef(null)
  const backupRef = useRef(null)

  const saveNotion = (t,d) => notionSet({ token:t, db:d })
  const statusColor = s => !s?C.textMut:s.startsWith("✓")?C.accent:s.startsWith("✗")?C.again:C.textMut

  const testNotion = async () => {
    if (!notionToken.trim()||!notionDb.trim()) { setNotionStatus("Enter token and database ID first."); return }
    setNotionBusy(true); setNotionStatus("Testing…")
    try { const t = await notion.testConnection(notionToken.trim(), notionDb.trim()); setNotionStatus(`✓ Connected to "${t}"`) }
    catch(e) { setNotionStatus("✗ "+e.message) }
    setNotionBusy(false)
  }
  const exportNotion = async () => {
    const active = cards.filter(c=>c.status!=="Archived")
    setNotionBusy(true); setNotionStatus(`Exporting ${active.length} cards…`); setNotionPct(0)
    try { const n = await notion.exportToNotion(notionToken.trim(),notionDb.trim(),active,setNotionPct); setNotionStatus(`✓ Exported ${n} card${n!==1?"s":""}`) }
    catch(e) { setNotionStatus("✗ "+e.message) }
    setNotionBusy(false); setNotionPct(0)
  }
  const importNotion = async () => {
    setNotionBusy(true); setNotionStatus("Reading database…")
    try {
      const imported = await notion.importFromNotion(notionToken.trim(), notionDb.trim())
      if (!imported.length) { setNotionStatus("No valid cards found.") }
      else { onImportCards(imported, r => setNotionStatus(r.ok?`✓ Imported ${r.count} cards`:"✗ "+r.msg)) }
    } catch(e) { setNotionStatus("✗ "+e.message) }
    setNotionBusy(false)
  }

  const exportCsv = () => {
    try { excel.exportToExcel(cards); setCsvResult("✓ Downloaded") }
    catch(e) { setCsvResult("✗ "+e.message) }
  }
  const importCsv = file => {
    if (!file) return
    excel.importFromExcel(file)
      .then(imported => onImportCards(imported, r => setCsvResult(r.ok?`✓ Imported ${r.count} cards`:"✗ "+r.msg)))
      .catch(e => setCsvResult("✗ "+e.message))
  }

  const handleApkgSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setApkgError(null)
    try {
      const { parseApkg, convertToNidusCards } = await getAnkiModule()
      const parsed = await parseApkg(file)
      const { cards: converted, warnings } = convertToNidusCards(parsed.notes, genId)
      setApkgPreview({ ...parsed, convertedCards: converted, warnings })
    } catch (err) {
      setApkgError(`Parse failed: ${err.message}`)
    }
  }

  const handleApkgImport = async () => {
    if (!apkgPreview) return
    setApkgImporting(true)
    try {
      await onImportAnki(apkgPreview.convertedCards)
      setApkgPreview(null)
      setApkgError(null)
    } catch (err) {
      setApkgError(`Import failed: ${err.message}`)
    } finally {
      setApkgImporting(false)
    }
  }

  const TAB_BTN = (id, label) => (
    <button onClick={()=>setTab(id)}
      style={{ padding:"7px 14px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:500,
        background:tab===id?C.elevated:"transparent", color:tab===id?C.text:C.textMut,
        boxShadow:tab===id?`0 1px 4px rgba(28,40,32,0.08)`:"none", transition:"all 0.14s" }}>
      {label}
    </button>
  )

  return (
    <div>
      <div className="rapp-sec-title">Import &amp; Export</div>
      <div style={{ display:"flex", gap:4, background:C.bg, borderRadius:10, padding:3, marginBottom:20, flexWrap:"wrap" }}>
        {TAB_BTN("notion","Notion")}
        {TAB_BTN("excel", "Excel")}
        {TAB_BTN("backup","JSON backup")}
        {TAB_BTN("anki",  "Anki")}
      </div>

      {tab==="notion" && (
        <div className="rapp-fadein">
          <p style={{ fontSize:13, color:C.textSec, lineHeight:1.7, marginBottom:16 }}>
            Sync with a Notion database. Create an <strong>Internal Integration</strong> at notion.so/profile/integrations, then add it to your database via ⋯ → Connections.
          </p>
          <div className="rapp-mb12">
            <label className="rapp-label">Integration token</label>
            <input className="rapp-input" type="password" placeholder="secret_…" value={notionToken}
              onChange={e=>{setNotionToken(e.target.value); saveNotion(e.target.value,notionDb)}} />
          </div>
          <div className="rapp-mb16">
            <label className="rapp-label">Database ID or URL</label>
            <input className="rapp-input" placeholder="Paste URL or 32-char ID" value={notionDb}
              onChange={e=>{setNotionDb(e.target.value); saveNotion(notionToken,e.target.value)}} />
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 14px", fontSize:13 }} onClick={testNotion} disabled={notionBusy}>Test</button>
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 14px", fontSize:13 }} onClick={importNotion} disabled={notionBusy}>↑ Import</button>
            <button className="rapp-btn rapp-btn-primary" style={{ padding:"9px 14px", fontSize:13 }} onClick={exportNotion} disabled={notionBusy||!cards.length}>↓ Export</button>
          </div>
          {notionBusy && notionPct>0 && <div className="rapp-progress rapp-mb8"><div className="rapp-progress-fill" style={{ width:`${notionPct}%` }}/></div>}
          {notionStatus && <p style={{ fontSize:13, color:statusColor(notionStatus), lineHeight:1.6 }}>{notionStatus}</p>}
        </div>
      )}

      {tab==="excel" && (
        <div className="rapp-fadein">
          <p style={{ fontSize:13, color:C.textSec, lineHeight:1.7, marginBottom:16 }}>
            Export all cards to <strong>.xlsx</strong>. Edit in Excel or Google Sheets, then re-import. All scheduling fields are preserved.
          </p>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
            <button className="rapp-btn rapp-btn-primary" style={{ padding:"9px 18px", fontSize:13 }} onClick={exportCsv}>↓ Download .xlsx</button>
            <button className="rapp-btn rapp-btn-ghost"   style={{ padding:"9px 18px", fontSize:13 }} onClick={()=>csvRef.current?.click()}>↑ Import .xlsx</button>
            <input ref={csvRef} type="file" accept=".xlsx,.xls,.ods,.csv" style={{ display:"none" }}
              onChange={e=>{ importCsv(e.target.files[0]); e.target.value="" }} />
          </div>
          {csvResult && <p style={{ fontSize:13, color:statusColor(csvResult) }}>{csvResult}</p>}
        </div>
      )}

      {tab==="backup" && (
        <div className="rapp-fadein">
          <p style={{ fontSize:13, color:C.textSec, lineHeight:1.7, marginBottom:16 }}>
            Full JSON backup including session history. Import <strong>replaces</strong> all current data.
          </p>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 16px", fontSize:13 }} onClick={onExport}>↓ Export backup</button>
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 16px", fontSize:13 }} onClick={()=>backupRef.current?.click()}>↑ Import backup</button>
            <input ref={backupRef} type="file" accept=".json" style={{ display:"none" }}
              onChange={e=>{ onImportFile(e.target.files[0], r=>setImportResult(r)); e.target.value="" }} />
          </div>
          {importResult && (
            <div style={{ padding:"10px 14px", borderRadius:10, fontSize:13,
              background:importResult.ok?C.goodBg:C.againBg,
              color:importResult.ok?C.good:C.again,
              border:`1px solid ${importResult.ok?"#90D8B0":"#E8B0A0"}` }}>
              {importResult.ok?`✓ Imported ${importResult.count} cards`:`✗ ${importResult.msg}`}
            </div>
          )}
        </div>
      )}

      {tab==="anki" && (
        <div className="rapp-fadein">
          {!apkgPreview ? (
            <div className="rapp-card">
              <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>Import from Anki</div>
              <p style={{ fontSize:13, color:C.textSec, lineHeight:1.65, marginBottom:16 }}>
                Upload an Anki .apkg file to import decks, notes, and card content.
                Anki scheduling state (SM-2 intervals) is intentionally discarded:
                all imported cards start fresh with FSRS initial values, since SM-2 and
                FSRS parameters are not interchangeable. Tags and deck hierarchy are preserved.
              </p>
              <input type="file" accept=".apkg" onChange={handleApkgSelect} style={{ marginBottom:12, fontSize:13, color:C.text, fontFamily:"inherit", cursor:"pointer" }} />
              {apkgError && <p style={{ fontSize:12, color:C.again, marginTop:8 }}>{apkgError}</p>}
            </div>
          ) : (
            <div className="rapp-card">
              <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>Import preview</div>
              <div style={{ fontSize:13, lineHeight:1.75, color:C.textSec }}>
                <p>Decks: <strong>{apkgPreview.summary.decks}</strong></p>
                <p>Basic cards: <strong>{apkgPreview.summary.basic}</strong></p>
                <p>Cloze cards: <strong>{apkgPreview.summary.cloze}</strong></p>
                <p>Image occlusion cards: <strong>{apkgPreview.summary.imageOcclusion}</strong> (imported as basic with warning)</p>
                <p>Unknown note types: <strong>{apkgPreview.summary.unknown}</strong></p>
              </div>
              {apkgPreview.warnings?.length > 0 && (
                <div style={{ marginTop:8, padding:"8px 12px", background:C.warningBg, borderRadius:8 }}>
                  <strong style={{ fontSize:12, color:C.warningText }}>Warnings ({apkgPreview.warnings.length}):</strong>
                  {apkgPreview.warnings.slice(0,5).map((w,i)=>(
                    <p key={i} style={{ fontSize:11, color:C.warningText, marginTop:4 }}>{w}</p>
                  ))}
                  {apkgPreview.warnings.length > 5 && (
                    <p style={{ fontSize:11, color:C.warningText, marginTop:4 }}>... and {apkgPreview.warnings.length - 5} more</p>
                  )}
                </div>
              )}
              {apkgError && <p style={{ fontSize:12, color:C.again, marginTop:8 }}>{apkgError}</p>}
              <div style={{ display:"flex", gap:8, marginTop:16 }}>
                <button className="rapp-btn rapp-btn-ghost" onClick={()=>{ setApkgPreview(null); setApkgError(null) }}>Cancel</button>
                <button className="rapp-btn rapp-btn-primary" onClick={handleApkgImport} disabled={apkgImporting}>
                  {apkgImporting ? "Importing..." : `Import ${apkgPreview.summary.totalNotes} notes`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Return Onboarding Card ───────────────────────────────────────────────────
function ReturnOnboardingCard({ daysSince, dueCount, onCatchUp, onReviewTen }) {
  return (
    <div className="rapp-wrap rapp-fadein" style={{ paddingTop:32 }}>
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:80, fontWeight:700, letterSpacing:-4, color:C.text, lineHeight:1 }}>{daysSince}</div>
        <div style={{ fontSize:15, color:C.textMut, marginTop:8 }}>day{daysSince!==1?"s":""} since your last session</div>
      </div>

      <div className="rapp-card rapp-mb24">
        <div style={{ fontSize:18, fontWeight:600, color:C.text, marginBottom:10 }}>
          {dueCount} card{dueCount!==1?"s":""} ready for review
        </div>
        <p style={{ fontSize:14, color:C.textSec, lineHeight:1.75 }}>
          Your prior learning is still there; spaced repetition builds on what you've retained, not from zero.
        </p>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <button className="rapp-btn rapp-btn-primary rapp-btn-full" onClick={onCatchUp}>
          Start catch-up
        </button>
        <button className="rapp-btn rapp-btn-ghost rapp-btn-full" onClick={onReviewTen}>
          Review 10 cards today
        </button>
      </div>
    </div>
  )
}

// ─── Root Component ───────────────────────────────────────────────────────────
export default function Home() {
  const [view,              setView]              = useState("library")
  const [selectedDeck,      setSelectedDeck]      = useState(null)
  const [studyDeckName,     setStudyDeckName]     = useState(null)
  const [cards,             setCards]             = useState([])
  const [log,               setLog]               = useState([])
  const [decks,             setDecks]             = useState([])
  const [deckParentMap,     setDeckParentMap]     = useState(() => new Map())
  const [deckMeta,          setDeckMeta]          = useState(() => deckMetaGet())
  const [settings,          setSettings]          = useState(() => settingsGet())
  const [ready,             setReady]             = useState(false)
  const [syncStatus,        setSyncStatus]        = useState("idle")
  const [lastSynced,        setLastSynced]        = useState(() => lastSyncGet())
  const [sessionCapOverride,setSessionCapOverride]= useState(null)
  const [sessionFocused,    setSessionFocused]    = useState(false)
  const pendingCards      = useRef(null)
  const saveTimer         = useRef(null)
  const savedTimer        = useRef(null)
  const cardStateTimer    = useRef(null)

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    storage.loadAll()
      .then(async ({ cards:rc, deckNames, log:rl, deckParentMap:dpm }) => {
        setCards(rc); setLog(rl)
        setDecks([...new Set(deckNames)])
        if (dpm) setDeckParentMap(dpm)
        // Auto-run the CardState migration if any cards have scheduling state
        // but no corresponding CardState record yet.
        // This is idempotent: the migration script checks the migrated flag.
        try {
          const states = await storage.listCardStates()
          const migratedIds = new Set(states.filter(s => s.migrated).map(s => s.cardClientId))
          const needsMigration = rc.some(c => {
            const clientId = c.id
            return !migratedIds.has(clientId) && (c.stability != null || (c.reviewCount || 0) > 0)
          })
          if (needsMigration) {
            console.log('[Nidus Recall] Running CardState migration...')
            const result = await storage.runMigration()
            console.log('[Nidus Recall] Migration complete:', result)
          }
        } catch (_) {
          // Migration errors are non-fatal; app continues normally.
        }
        setReady(true)
        // Mirror loaded data to Dexie for offline access.
        offlineStore.seedFromNetwork({ cards: rc, decks: deckNames, log: rl }).catch(() => {})
      })
      .catch(() => setReady(true))
  }, [])

  // ── Card sync (debounced 800ms) ───────────────────────────────────────────────
  const markSaved = () => {
    setSyncStatus("saved")
    const iso = new Date().toISOString()
    setLastSynced(iso); lastSyncSet()
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSyncStatus("idle"), 2000)
  }

  const updateCards = updated => {
    setCards(updated); pendingCards.current = updated; setSyncStatus("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (pendingCards.current) storage.syncCards(pendingCards.current).then(markSaved).catch(()=>setSyncStatus("error"))
    }, 800)
    // Also debounce CardState sync (scheduling fields route to CardState entity)
    if (cardStateTimer.current) clearTimeout(cardStateTimer.current)
    cardStateTimer.current = setTimeout(() => {
      if (pendingCards.current) storage.syncCardStates(pendingCards.current).catch(() => {})
    }, 800)
    return Promise.resolve()
  }

  const flushCards = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (cardStateTimer.current) clearTimeout(cardStateTimer.current)
    if (pendingCards.current) {
      setSyncStatus("saving")
      try {
        await Promise.all([
          storage.syncCards(pendingCards.current),
          storage.syncCardStates(pendingCards.current),
        ])
        markSaved()
      }
      catch { setSyncStatus("error") }
    }
  }

  const addLog = async entry => {
    setLog(l => [entry, ...l])
    const entity = await storage.appendLog(entry)
    return entity
  }

  const [incompleteSession, setIncompleteSession] = useState(null)

  // Check for in-progress sessions on load (run once after initial data loads)
  useEffect(() => {
    if (log.length > 0 && incompleteSession === null) {
      const incomplete = log.find(e => e.status === "in-progress")
      if (incomplete) setIncompleteSession(incomplete)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const markSessionComplete = async () => {
    if (!incompleteSession) return
    // Update local state to mark the session complete
    const updatedEntry = { ...incompleteSession, status: "complete" }
    setLog(l => l.map(e => e.date === incompleteSession.date ? updatedEntry : e))
    // If we have an entity id, persist to Base44
    if (incompleteSession.id) {
      storage.updateLog(incompleteSession.id, { status: "complete" }).catch(() => {})
    }
    setIncompleteSession(null)
  }

  const updateSettings = s => { setSettings(s); settingsSet(s) }

  const addDeck = async name => {
    const t = name.trim()
    if (!t || decks.includes(t)) return
    setDecks(d => [...d, t])
    await storage.ensureDeck(t)
  }

  const createSampleDeck = async () => {
    const deckName = "Common Pharmacology: Essentials"
    if (!decks.includes(deckName)) {
      setDecks(d => [...d, deckName])
      await storage.ensureDeck(deckName)
    }
    const mk = (front, back, contentType, tags, cardType, clozeText, clozeIndex) => ({
      id: genId(), front, back, deck: deckName, contentType: contentType || "Factual",
      cardType: cardType || "basic", clozeText: clozeText || null, clozeIndex: clozeIndex || null,
      status: "Active", interval: 1, reviewCount: 0, lapses: 0, ratingHistory: [],
      connects_to: [], stability: null, difficulty: null, nextReview: null,
      lastReview: null, elaboration: "", anchor: null, source: "BNF / standard pharmacology reference",
      stakes_flag: false, prerequisite_card_id: null, tags: tags || [],
      imageUrl: null, occlusionRegions: null, occlusionRegionId: null,
      createdAt: new Date().toISOString(),
    })
    // Build cloze cards using parseCloze so front/back are pre-computed.
    const mkCloze = (clozeText, tags) => createClozeCards(clozeText, deckName).map(c => ({
      ...c, source: "BNF / standard pharmacology reference", tags: tags || [],
    }))
    const basicCards = [
      mk("What is the mechanism of action of beta-blockers?", "Competitive antagonism of beta-adrenoceptors (beta-1 selective agents primarily block cardiac receptors). Reduces heart rate, contractility, and renin release.", "Mechanism", ["beta-blockers","cardiology"]),
      mk("Name four major indications for beta-blockers.", "Hypertension, angina, heart failure with reduced ejection fraction (with up-titration), and rate control in atrial fibrillation.", "Clinical Reasoning", ["beta-blockers","cardiology"]),
      mk("What are the key contraindications to non-selective beta-blockers?", "Severe asthma or COPD (risk of bronchospasm), second/third-degree heart block, and uncontrolled heart failure. Use with caution in peripheral arterial disease.", "Factual", ["beta-blockers","contraindications"]),
      mk("What is the mechanism of ACE inhibitors?", "Block angiotensin-converting enzyme, preventing conversion of angiotensin I to angiotensin II. Reduces vasoconstriction, aldosterone secretion, and sodium retention.", "Mechanism", ["ACE-inhibitors","cardiology"]),
      mk("Why do ACE inhibitors cause a dry cough?", "Inhibition of ACE reduces breakdown of bradykinin. Accumulated bradykinin stimulates pulmonary C-fibres, causing a dry persistent cough in approximately 10-15% of patients.", "Mechanism", ["ACE-inhibitors","side-effects"]),
      mk("What is the mechanism of statins?", "Competitive inhibition of HMG-CoA reductase, the rate-limiting enzyme in hepatic cholesterol synthesis. Reduces LDL-C and has pleiotropic anti-inflammatory effects.", "Mechanism", ["statins","lipids"]),
      mk("What are the main contraindications to statin therapy?", "Pregnancy (teratogenic), breastfeeding, and active liver disease. Caution in myopathy risk (high-dose, drug interactions including ciclosporin, macrolides, fibrates).", "Factual", ["statins","contraindications"]),
      mk("How does warfarin work and what monitoring is required?", "Inhibits vitamin K epoxide reductase, reducing synthesis of clotting factors II, VII, IX, and X. Monitoring: INR (target 2-3 for most indications; 2.5-3.5 for mechanical heart valves).", "Mechanism", ["anticoagulants","warfarin"]),
      mk("Name two classes of drugs that significantly increase warfarin effect.", "Enzyme inhibitors that reduce warfarin metabolism: azole antifungals (fluconazole), metronidazole. Also: amiodarone, ciprofloxacin. Enzyme inducers (rifampicin, carbamazepine) decrease effect.", "Factual", ["anticoagulants","warfarin","interactions"]),
      mk("What is the mechanism of metformin and its primary indication?", "Activates AMPK, reducing hepatic gluconeogenesis and increasing peripheral insulin sensitivity. First-line pharmacological treatment for type 2 diabetes mellitus.", "Mechanism", ["diabetes","metformin"]),
    ]
    const clozeText1 = "Warfarin works by inhibiting {{c1::vitamin K epoxide reductase}}, reducing synthesis of clotting factors {{c2::II, VII, IX, X}}."
    const clozeText2 = "The commonest side effect of ACE inhibitors is {{c1::dry cough}}, caused by accumulation of {{c2::bradykinin}}."
    const clozeText3 = "Metformin reduces hepatic {{c1::gluconeogenesis}} by activating {{c2::AMPK}}."
    const clozeCards = [
      ...mkCloze(clozeText1, ["warfarin","cloze"]),
      ...mkCloze(clozeText2, ["ACE-inhibitors","cloze"]),
      ...mkCloze(clozeText3, ["metformin","cloze"]),
    ]
    // Self-contained SVG data URL: no external dependency needed.
    // Demonstrates image occlusion on the Beta-Blocker Pathway diagram.
    const pharmacologyDiagramUrl = "data:image/svg+xml," + encodeURIComponent([
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">',
      '<rect width="400" height="200" fill="#F5F0EB"/>',
      '<text x="200" y="30" text-anchor="middle" font-family="system-ui" font-size="14" font-weight="600" fill="#2D6E52">Beta-Blocker Pathway</text>',
      '<rect x="30" y="50" width="100" height="40" rx="6" fill="#DFE8E3" stroke="#2D6E52" stroke-width="1.5"/>',
      '<text x="80" y="75" text-anchor="middle" font-family="system-ui" font-size="11" fill="#1a3d2b">Beta-1 Receptor</text>',
      '<rect x="160" y="50" width="100" height="40" rx="6" fill="#DFE8E3" stroke="#2D6E52" stroke-width="1.5"/>',
      '<text x="210" y="75" text-anchor="middle" font-family="system-ui" font-size="11" fill="#1a3d2b">Adenylyl Cyclase</text>',
      '<rect x="290" y="50" width="80" height="40" rx="6" fill="#DFE8E3" stroke="#2D6E52" stroke-width="1.5"/>',
      '<text x="330" y="75" text-anchor="middle" font-family="system-ui" font-size="11" fill="#1a3d2b">cAMP</text>',
      '<line x1="130" y1="70" x2="160" y2="70" stroke="#2D6E52" stroke-width="1.5" marker-end="url(#arr)"/>',
      '<line x1="260" y1="70" x2="290" y2="70" stroke="#2D6E52" stroke-width="1.5" marker-end="url(#arr)"/>',
      '<rect x="130" y="120" width="120" height="40" rx="6" fill="#b3d4bc" stroke="#2D6E52" stroke-width="1.5"/>',
      '<text x="190" y="145" text-anchor="middle" font-family="system-ui" font-size="11" font-weight="600" fill="#1a3d2b">Beta-Blocker BLOCKS</text>',
      '<line x1="190" y1="120" x2="190" y2="90" stroke="#1a3d2b" stroke-width="1.5" stroke-dasharray="4,2"/>',
      '<defs><marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#2D6E52"/></marker></defs>',
      '</svg>',
    ].join(''))
    const occlusionRegions = [
      { id: 'region-adenylyl', label: 'Adenylyl Cyclase', type: 'rect', x: 0.4, y: 0.25, width: 0.25, height: 0.20 },
      { id: 'region-camp',     label: 'cAMP',             type: 'rect', x: 0.725, y: 0.25, width: 0.20, height: 0.20 },
    ]
    const occlusionCards = createOcclusionCards(pharmacologyDiagramUrl, occlusionRegions, deckName).map(c => ({
      ...c, source: "BNF / standard pharmacology reference", tags: ["beta-blockers","image-occlusion"],
    }))
    const sampleCards = [...basicCards, ...clozeCards, ...occlusionCards]
    await updateCards([...cards, ...sampleCards])
    storage.adjustDeckCount(deckName, sampleCards.length).catch(()=>{})
  }

  const archiveDeck = name => {
    const next = { ...deckMeta, [name]: { ...deckMeta[name], archived: !(deckMeta[name]?.archived) } }
    setDeckMeta(next); deckMetaSet(next)
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ version:3, exportedAt:new Date().toISOString(), cards, log, decks }, null, 2)], { type:"application/json" })
    const url = URL.createObjectURL(blob), a = document.createElement("a")
    a.href=url; a.download=`nidus-backup-${localDateStr()}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (file, onResult) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.cards||!Array.isArray(data.cards)) throw new Error("Invalid format")
        setSyncStatus("saving")
        setCards(data.cards); pendingCards.current = data.cards
        await storage.syncCards(data.cards)
        if (data.decks) { const m = [...new Set(data.decks)]; setDecks(m); await Promise.all(m.map(storage.ensureDeck)) }
        if (data.log)   { setLog(data.log); await Promise.all(data.log.map(e=>storage.appendLog(e).catch(()=>{}))) }
        markSaved(); onResult({ ok:true, count:data.cards.length })
      } catch(err) { setSyncStatus("error"); onResult({ ok:false, msg:err.message }) }
    }
    reader.readAsText(file)
  }

  const handleImportCards = async (importedCards, onResult) => {
    try {
      setSyncStatus("saving"); setCards(importedCards); pendingCards.current = importedCards
      await storage.syncCards(importedCards); markSaved()
      onResult({ ok:true, count:importedCards.length })
    } catch(err) { setSyncStatus("error"); onResult({ ok:false, msg:err.message }) }
  }

  // handleApkgImportCards: called from ImportExportPanel after Anki import is confirmed.
  // Merges newly imported cards with existing cards and syncs to Base44.
  const handleApkgImportCards = async (newCards) => {
    const merged = [...cards, ...newCards]
    setSyncStatus("saving")
    setCards(merged)
    pendingCards.current = merged
    await storage.syncCards(merged)
    markSaved()
    setSyncStatus(`Imported ${newCards.length} card${newCards.length !== 1 ? 's' : ''} from Anki`)
  }

  // ── Offline / PWA state ───────────────────────────────────────────────────────
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)
  const [installPromptDismissed, setInstallPromptDismissed] = useState(
    () => localStorage.getItem('nidus-install-prompt-dismissed') === 'true'
  )
  const [sessionsCompleted, setSessionsCompleted] = useState(0)

  useEffect(() => {
    const handleOnline  = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    // Drain any pending offline ratings on reconnect.
    const cleanupReconnect = offlineStore.onReconnect(async () => {
      try {
        const { flushed } = await offlineStore.drainQueue(storage.syncCardState)
        if (flushed > 0) setSyncStatus(`Synced ${flushed} offline rating${flushed !== 1 ? 's' : ''}`)
      } catch (_) {}
    })
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      cleanupReconnect()
    }
  }, [])

  const [interleavedCards, setInterleavedCards] = useState(null)
  const startSRS  = (deck, capOverride=null, focused=false) => { setStudyDeckName(deck==="all"?null:deck); setSessionCapOverride(capOverride); setSessionFocused(focused); setInterleavedCards(null); setView("session") }
  const startInterleaved = (deckIds) => {
    // Fisher-Yates shuffle of all due cards from selected decks.
    const selectedCards = deckIds.length === 0 ? cards : cards.filter(c => deckIds.includes(c.deck))
    const { newCardCap=15, reviewCap=100, catchupDays=7 } = settings||{}
    const due = getDueWithCatchup(selectedCards, reviewCap, catchupDays, cards)
    const newC = deckIds.length === 0 ? getNew(cards).slice(0, newCardCap) : getNew(selectedCards).slice(0, newCardCap)
    const combined = [...due, ...newC]
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]]
    }
    setInterleavedCards(combined)
    setStudyDeckName(null)
    setSessionCapOverride(combined.length)
    setSessionFocused(false)
    setView("session")
  }
  const startFree = deck => { setStudyDeckName(deck==="all"?null:deck); setView("free-study") }

  const due = useMemo(() => getDueWithCatchup(cards, settings.reviewCap||100, settings.catchupDays||7, cards), [cards, settings])

  // ── Return-after-gap re-onboarding ──────────────────────────────────────────
  const lastSessionDate = useMemo(() => log.reduce((latest, e) => (!latest || e.date > latest) ? e.date : latest, null), [log])
  const gapDays = lastSessionDate ? Math.floor((Date.now() - new Date(lastSessionDate)) / 86400000) : 0
  const hasGap  = log.length > 0 && gapDays >= 7
  const onboardingShownForGap = hasGap && localStorage.getItem(RETURN_ONBOARD_KEY) === lastSessionDate
  const showReturnCard = hasGap && !onboardingShownForGap

  const dismissOnboarding = () => { if (lastSessionDate) localStorage.setItem(RETURN_ONBOARD_KEY, lastSessionDate) }
  const totalDueAll = useMemo(() => getDue(cards).length, [cards])

  const inSession = view==="session" || view==="free-study"

  const NAV = [
    { id:"library",      label:"Library",  icon:Ico.library, active: view==="library"||view==="deck" },
    { id:"study-select", label:"Study",    icon:Ico.study,   active: view==="study-select" },
    { id:"stats",        label:"Stats",    icon:Ico.stats,   active: view==="stats" },
    { id:"settings",     label:"Settings", icon:Ico.gear,    active: view==="settings" },
  ]
  const navClick = id => {
    if (id==="library") { setView("library"); setSelectedDeck(null) }
    else setView(id)
  }

  if (!ready) return (
    <>
      <style>{CSS}</style>
      <div className="rapp">
        <div className="rapp-sidebar">
          <div className="rapp-logo"><div className="rapp-logo-dot"/>Nidus Recall</div>
        </div>
        <div className="rapp-main">
          <div className="rapp-wrap">
            <div className="rapp-skel" style={{ height:28, width:100, marginBottom:8 }} />
            <div className="rapp-skel" style={{ height:14, width:160, marginBottom:28 }} />
            {[0,1,2].map(i=>(
              <div key={i} className="rapp-skel" style={{ height:88, borderRadius:20, marginBottom:12 }} />
            ))}
          </div>
        </div>
      </div>
    </>
  )

  return (
    <>
      <style>{CSS}</style>
      <div className="rapp">
        {!inSession && (
          <div className="rapp-sidebar">
            <div className="rapp-logo"><div className="rapp-logo-dot"/>Nidus Recall</div>
            {NAV.map(n => (
              <div key={n.id} className={`rapp-nav-item${n.active?" active":""}`} onClick={()=>navClick(n.id)}>
                {n.icon(17)}<span>{n.label}</span>
                {n.id==="study-select" && due.length>0 && <span className="rapp-nav-badge">{due.length}</span>}
              </div>
            ))}
            <div className="rapp-sync" style={{ marginTop:"auto", color:syncStatus==="error"?C.again:syncStatus==="saved"?C.accent:C.textMut }}>
              {syncStatus==="saving"&&"● Saving…"}
              {syncStatus==="saved" &&"✓ Saved"}
              {syncStatus==="error" &&"⚠ Sync failed"}
            </div>
          </div>
        )}

        <div className={`rapp-main${inSession?" rapp-main-full":""}`}>
          {/* Offline indicator: shown whenever navigator.onLine is false */}
          {isOffline && !inSession && (
            <div className="nid-offline-banner rapp-fadein" style={{ maxWidth:520 }}>
              <div className="nid-offline-dot" />
              <span>Offline: reviews will sync when reconnected.</span>
            </div>
          )}
          {/* PWA install prompt: shown after first completed session, once per device */}
          {!installPromptDismissed && sessionsCompleted >= 1 && isInstallable() && !inSession && (
            <div className="nid-install-prompt rapp-fadein" style={{ maxWidth:520 }}>
              <span style={{ flex:1, lineHeight:1.55 }}>Add Nidus Recall to your home screen for quick daily access.</span>
              <button className="rapp-btn rapp-btn-primary" style={{ padding:"7px 14px", fontSize:13, flexShrink:0 }}
                onClick={async () => {
                  await triggerInstallPrompt()
                  setInstallPromptDismissed(true)
                  localStorage.setItem('nidus-install-prompt-dismissed', 'true')
                }}>Add</button>
              <button className="rapp-btn rapp-btn-ghost" style={{ padding:"7px 12px", fontSize:13, flexShrink:0 }}
                onClick={() => {
                  setInstallPromptDismissed(true)
                  localStorage.setItem('nidus-install-prompt-dismissed', 'true')
                }}>Not now</button>
            </div>
          )}
          {incompleteSession && !inSession && (
            <div style={{ background:C.warningBg, border:`1px solid ${C.warning}40`, borderRadius:12, padding:"10px 14px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, maxWidth:520 }}>
              <span style={{ fontSize:13, color:C.warningText, lineHeight:1.55 }}>
                You have an incomplete session from {new Date(incompleteSession.date).toLocaleDateString()}.
              </span>
              <button className="rapp-btn rapp-btn-ghost" style={{ padding:"6px 12px", fontSize:12, flexShrink:0 }}
                onClick={markSessionComplete}>
                Dismiss
              </button>
            </div>
          )}
          {view==="library"      && (showReturnCard
            ? <ReturnOnboardingCard
                daysSince={gapDays}
                dueCount={totalDueAll}
                onCatchUp={() => { dismissOnboarding(); startSRS(null) }}
                onReviewTen={() => { dismissOnboarding(); startSRS(null, 10) }}
              />
            : <LibraryView cards={cards} decks={decks} deckMeta={deckMeta} onSelectDeck={d=>{setSelectedDeck(d);setView("deck")}} onCreateDeck={addDeck} syncStatus={syncStatus} lastSynced={lastSynced} settings={settings} onCreateSampleDeck={createSampleDeck} deckParentMap={deckParentMap} />
          )}
          {view==="deck"         && <DeckView deckName={selectedDeck} cards={cards} onUpdateCards={updateCards} onBack={()=>setView("library")} decks={decks} settings={settings} onArchiveDeck={archiveDeck} />}
          {view==="study-select" && <StudySelectView cards={cards} decks={decks} settings={settings} onStartSRS={startSRS} onStartFree={startFree} onStartInterleaved={startInterleaved} />}
          {view==="session"      && <SessionView cards={cards} onUpdateCards={updateCards} onSaveLog={async e=>{await flushCards();await addLog(e)}} onDone={()=>{ setSessionCapOverride(null); setSessionFocused(false); setInterleavedCards(null); setView("study-select") }} settings={settings} studyDeckName={studyDeckName} log={log} capOverride={sessionCapOverride} focused={sessionFocused} isFirstStudy={!settings?.first_study_completed} onFirstStudyComplete={()=>updateSettings({...settings,first_study_completed:true})} onFitParams={newTarget=>updateSettings({...settings, retentionTarget:newTarget})} interleavedCards={interleavedCards} onSessionCompleted={()=>setSessionsCompleted(n=>n+1)} />}
          {view==="free-study"   && <FreeStudyView cards={cards} studyDeckName={studyDeckName} onDone={()=>setView("study-select")} settings={settings} />}
          {view==="stats"        && <StatsView log={log} cards={cards} decks={decks} settings={settings} />}
          {view==="settings"     && <SettingsView settings={settings} onUpdateSettings={updateSettings} cards={cards} decks={decks} onExport={handleExport} onImport={handleImport} onImportCards={handleImportCards} onImportAnki={handleApkgImportCards} schedulerParams={storage.getUserSchedulerParams()} onRefitParams={()=>{ const r=fitSchedulerParams(cards,settings.retentionTarget); if(r.changed) updateSettings({...settings,retentionTarget:r.retentionTarget}); storage.saveUserSchedulerParams(storage.getUserSchedulerParams()?.params||null,r.reviewCount).catch(()=>{}) }} />}
        </div>

        {!inSession && (
          <div className="rapp-bnav">
            {NAV.map(n => (
              <div key={n.id} className={`rapp-bnav-item${n.active?" active":""}`} onClick={()=>navClick(n.id)}>
                <div style={{ position:"relative", display:"inline-flex" }}>
                  {n.icon(22)}
                  {n.id==="study-select" && due.length>0 && (
                    <span style={{ position:"absolute", top:-4, right:-6, width:8, height:8, background:C.again, borderRadius:"50%", border:`1.5px solid ${C.surface}` }} />
                  )}
                </div>
                <span>{n.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}