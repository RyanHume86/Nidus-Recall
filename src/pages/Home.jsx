import { useState, useEffect, useMemo, useRef } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts"
import * as storage from "@/api/storage"
import * as excel   from "@/api/excel"
import * as notion  from "@/api/notion"

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:       "#F4F7F5",
  surface:  "#EBF0ED",
  elevated: "#DFE8E3",
  text:     "#1C2820",
  textSec:  "#3A5246",
  textMut:  "#7BA090",
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
  // warning — error states, sync failures, overdue indicators, system warnings
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
  newCardCap:          50,
  reviewCap:           200,
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

const settingsGet  = ()  => ({ ...DEFAULT_SETTINGS, ...lsGet(SK.settings, {}) })
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

// ─── FSRS v4 ─────────────────────────────────────────────────────────────────
const W = [0.4072,1.1829,3.1262,15.4722,7.2102,0.5316,1.0651,0.0589,1.5330,0.1544,1.0071,1.9442,0.1100,0.2900,2.2700,0.2500,2.9898]
const DECAY  = -0.5
const FACTOR = 19 / 81

const fsrsS0 = g => W[g-1]
const fsrsD0 = g => Math.min(10, Math.max(1, W[4] - Math.exp(W[5]*(g-1)) + 1))
const fsrsR  = (t, S) => Math.pow(1 + FACTOR*t/S, DECAY)
const fsrsSRecall = (D,S,R,g) => {
  const b = S*(Math.exp(W[8])*(11-D)*Math.pow(S,-W[9])*(Math.exp(W[10]*(1-R))-1)+1)
  return g===2 ? b*W[15] : g===4 ? b*Math.exp(W[16]) : b
}
const fsrsSForget = (D,S,R) => W[11]*Math.pow(D,-W[12])*(Math.pow(S+1,W[13])-1)*Math.exp(W[14]*(1-R))
const fsrsDUpdate = (D,g)   => Math.min(10,Math.max(1, W[7]*fsrsD0(4)+(1-W[7])*(D-W[6]*(g-3))))
const fsrsInterval = (S, target=0.9) => Math.max(1, Math.round((Math.pow(target,1/DECAY)-1)*S/FACTOR))
const daysSince = d => !d ? 0 : Math.max(0, Math.round((Date.now()-new Date(d))/86400000))

const fsrsSchedule = (card, ratingStr, target=0.9) => {
  const g = {again:1,hard:2,good:3,easy:4}[ratingStr]
  const S = card.stability || card.interval || 1
  const D = card.difficulty || fsrsD0(3)
  if (!card.lastReview && !card.stability) {
    const nS=fsrsS0(g), nD=fsrsD0(g)
    return { stability:nS, difficulty:nD, interval: g===1 ? 1 : fsrsInterval(nS,target) }
  }
  const R = fsrsR(daysSince(card.lastReview), S)
  if (g===1) {
    const nS=Math.max(0.1,fsrsSForget(D,S,R))
    return { stability:nS, difficulty:fsrsDUpdate(D,g), interval:1, retrievability:R }
  }
  const nS=Math.min(36500,Math.max(0.1,fsrsSRecall(D,S,R,g)))
  return { stability:nS, difficulty:fsrsDUpdate(D,g), interval:fsrsInterval(nS,target), retrievability:R }
}

const isActive = c => c.status !== "Parked" && c.status !== "Archived"
const getDue   = cs => cs.filter(c => isActive(c) && c.nextReview && c.nextReview <= todayStr()).sort((a,b) => {
  const d = a.nextReview.localeCompare(b.nextReview)
  if (d !== 0) return d
  return (b.stakes_flag ? 1 : 0) - (a.stakes_flag ? 1 : 0)
})
const getNew   = cs => cs.filter(c => isActive(c) && !c.nextReview)
const getDueWithCatchup = (cs, cap, days) => {
  const all = getDue(cs)
  if (!all.length) return []
  if (all.length <= cap) return all
  return all.slice(0, Math.min(cap, Math.ceil(all.length/days)))
}

// Compute recall accuracy (calibration) score for a set of cards.
// Looks at pairs: good/easy entry followed by an "again" on the next review = mismatch.
// Returns { score: number 0-100, total: number } — score is null when total < 10.
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
// overwritten. This is the single authoritative write point — intensity,
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
    cursor: pointer; color: #7BA090; font-size: 14px; font-weight: 400;
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
      padding: 10px 0 8px; cursor:pointer; color:#7BA090; font-size:11px;
      font-weight:500; letter-spacing:0.2px; transition:color 0.14s; user-select:none;
    }
    .rapp-bnav-item.active { color: #2D6E52; }
    .rapp-input, .rapp-textarea, .rapp-select { font-size: 16px; }
    .rapp-study-card { min-height: 140px; }
    .rapp-rating-btn { padding: 16px 6px 14px; }
  }

  .rapp-wrap { max-width: 520px; width: 100%; }
  .rapp-pg-title  { font-size: 24px; font-weight: 700; letter-spacing: -0.7px; color: #1C2820; }
  .rapp-pg-sub    { font-size: 13px; color: #7BA090; margin-top: 3px; }
  .rapp-sec-title { font-size: 14px; font-weight: 600; color: #1C2820; margin-bottom: 14px; letter-spacing: -0.2px; }
  .rapp-label     { font-size: 11.5px; font-weight: 600; color: #3A5246; display: block; margin-bottom: 7px; letter-spacing: 0.15px; text-transform: uppercase; }
  .rapp-phase-tag { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #7BA090; }

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
  .rapp-stat-lbl { font-size: 12px; color: #7BA090; margin-top: 4px; }

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

  .rapp-empty { text-align:center; padding:52px 24px; color:#7BA090; font-size:14px; line-height:1.75; }

  .rapp-badge {
    display: inline-flex; align-items: center; padding: 3px 9px;
    border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap;
  }
  .rapp-leech { display:inline-flex; align-items:center; padding:2px 7px; border-radius:20px; font-size:10px; font-weight:700; background:#F5C8B8; color:#3D1408; border:1px solid #E8B0A0; }
  .rapp-nav-badge { min-width:18px; height:18px; background:#3D1408; color:#fff; border-radius:9px; font-size:10px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; padding:0 5px; margin-left:auto; margin-right:4px; }

  .rapp-hr { border: none; border-top: 1px solid #CFDBD5; }
  .rapp-slider { width:100%; accent-color:#2D6E52; height:4px; cursor:pointer; }
  .rapp-kbd { display:inline-flex; align-items:center; justify-content:center; padding:1px 6px; border:1px solid #BFD0CA; border-radius:5px; font-size:10px; font-weight:600; color:#7BA090; background:#EBF0ED; }

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
  .rapp-ts    { font-size:13px; color:#7BA090; }
  .rapp-tm    { font-size:14px; color:#3A5246; }

  /* ── Nidus-specific ── */
  .nid-deck-card {
    background: #DFE8E3; border: 1px solid #CFDBD5; border-radius: 20px;
    padding: 20px 22px; cursor: pointer;
    transition: border-color 0.14s, box-shadow 0.14s, transform 0.12s;
  }
  .nid-deck-card:hover { border-color:#BFD0CA; box-shadow:0 4px 16px rgba(28,40,32,0.09); transform:translateY(-1px); }
  .nid-deck-name { font-size:16px; font-weight:600; color:#1C2820; letter-spacing:-0.3px; }
  .nid-deck-meta { font-size:13px; color:#7BA090; margin-top:6px; }
  .nid-deck-due  { display:inline-flex; align-items:center; padding:3px 10px; background:#F5C8B8; color:#3D1408; border-radius:20px; font-size:11px; font-weight:600; }

  .nid-tag { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; background:#EBF0ED; color:#3A5246; border:1px solid #CFDBD5; border-radius:20px; font-size:11px; font-weight:500; }
  .nid-tag-rm { cursor:pointer; color:#7BA090; font-size:14px; line-height:1; padding:0 1px; margin-left:2px; }
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
    color:#7BA090; padding:0; margin-top:-1px; font-family:inherit; flex-shrink:0;
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
    border-radius:0 8px 8px 0; font-size:13px; color:#7BA090;
    font-style:italic; white-space:pre-wrap; line-height:1.6; margin-bottom:14px;
  }

  .nid-note-toggle {
    display:flex; align-items:center; gap:6px; font-size:12px; color:#7BA090;
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
    letter-spacing:0.9px; color:#7BA090; margin-bottom:8px;
  }

  @media (max-width:639px) {
    .rapp-modal-backdrop { align-items:flex-end !important; padding:0 !important; }
    .rapp-modal-inner    { border-radius:22px 22px 0 0 !important; max-height:92vh !important; }
  }
  button,[role="button"],.rapp-nav-item,.rapp-bnav-item,.rapp-card-item,.nid-deck-card { touch-action:manipulation; }
  button:focus-visible,[tabindex]:focus-visible { outline:2px solid #2D6E52; outline-offset:2px; border-radius:8px; }
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

// CardPicker — searchable single or multi-card selector used for prerequisite and connects_to.
// mode: "single" → value is id string | null; "multi" → value is id[]
function CardPicker({ allCards, value, onChange, mode="single", excludeId, placeholder="Search cards…" }) {
  const [query, setQuery] = useState("")
  const inputRef = useRef(null)
  const selectedIds = mode==="single" ? (value ? [value] : []) : (value||[])
  const selected = selectedIds.map(id => allCards.find(c=>c.id===id)).filter(Boolean)
  const results = query.length < 1 ? [] : allCards
    .filter(c => !selectedIds.includes(c.id) && c.id !== excludeId && c.front.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6)
  const add = id => { onChange(mode==="single" ? id : [...selectedIds, id]); setQuery(""); setTimeout(()=>inputRef.current?.focus(), 0) }
  const remove = id => onChange(mode==="single" ? null : selectedIds.filter(x=>x!==id))
  return (
    <div>
      {selected.map(c => (
        <div key={c.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, padding:"7px 10px", background:C.elevated, borderRadius:8 }}>
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
                  style={{ padding:"9px 12px", cursor:"pointer", fontSize:13, color:C.text, lineHeight:1.5, borderBottom:`1px solid ${C.border}` }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {c.front}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Library View ─────────────────────────────────────────────────────────────
function LibraryView({ cards, decks, deckMeta, onSelectDeck, onCreateDeck, syncStatus, lastSynced, settings }) {
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
          <button className="rapp-btn rapp-btn-primary" style={{ padding:"8px 16px", fontSize:13 }}
            onClick={() => { setShowCreateDeck(true); setTimeout(()=>newDeckRef.current?.focus(),50) }}>
            {Ico.plus(13)} New Deck
          </button>
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
        <div style={{ textAlign:"center", padding:"60px 24px" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📚</div>
          <div style={{ fontSize:17, fontWeight:600, color:C.text, marginBottom:8 }}>Create your first Deck</div>
          <div style={{ fontSize:14, color:C.textMut, lineHeight:1.75, marginBottom:24 }}>
            Decks organise your flashcards. Create one to start adding cards.
          </div>
          <button className="rapp-btn rapp-btn-primary"
            onClick={() => { setShowCreateDeck(true); setTimeout(()=>newDeckRef.current?.focus(),50) }}>
            {Ico.plus(14)} Create a Deck
          </button>
        </div>
      ) : visible.length === 0 && search ? (
        <div className="rapp-empty">No decks match "{search}"</div>
      ) : (
        <div className="rapp-col" style={{ gap:12 }}>
          {visible.map(d => (
            <div key={d.name} className="nid-deck-card" onClick={() => onSelectDeck(d.name)}>
              <div className="rapp-row rapp-sb">
                <div className="nid-deck-name">{d.name}</div>
                {d.due > 0 && <span className="nid-deck-due">{d.due} due</span>}
              </div>
              <div className="nid-deck-meta">
                {d.total} card{d.total!==1?"s":""}
                {d.newCount > 0 && <span style={{ color:C.accent }}> · {d.newCount} new</span>}
                {d.archived && <span> · archived</span>}
              </div>
            </div>
          ))}
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
function EditCardModal({ card, cards, onUpdateCards, onClose, decks }) {
  const [form, setForm]           = useState({ front:card.front||"", back:card.back||"", tags:card.tags||[], note:card.elaboration||"", anchor:card.anchor||"", source:card.source||"", contentType:card.contentType||"Factual", stakesFlag:card.stakes_flag||false, connects_to:card.connects_to||[], prerequisite_card_id:card.prerequisite_card_id||null })
  const [showNote, setShowNote]   = useState(!!(card.elaboration))
  const [showAnchor, setShowAnchor] = useState(!!(card.anchor))
  const [showConnects, setShowConnects] = useState(!!(card.connects_to?.length))
  const [showPrereq, setShowPrereq]     = useState(!!(card.prerequisite_card_id))
  const [confirmDel, setConfirmDel] = useState(false)

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
    await onUpdateCards(updated); onClose()
  }
  const handleArchive = async () => {
    const next = card.status==="Archived" ? "Active" : "Archived"
    await onUpdateCards(cards.map(c => c.id===card.id ? { ...c, status:next } : c)); onClose()
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(28,40,32,0.45)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
      className="rapp-modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div style={{ background:C.surface, borderRadius:22, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto", padding:"28px 24px 36px", boxShadow:"0 8px 40px rgba(28,40,32,0.18)" }}
        className="rapp-modal-inner">
        <div className="rapp-row rapp-sb rapp-mb20">
          <span style={{ fontSize:15, fontWeight:600, color:C.text }}>Edit card</span>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.textMut }}>×</button>
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
              <div style={{ fontSize:11, color:C.textMut, marginTop:2, lineHeight:1.5 }}>High-stakes card — prioritised when study time is short.</div>
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

// ─── Deck View ────────────────────────────────────────────────────────────────
function DeckView({ deckName, cards, onUpdateCards, onBack, decks, settings, onArchiveDeck }) {
  const [form, setForm]           = useState({ front:"", back:"", tags:[], note:"", anchor:"", source:"", contentType:"Factual", stakesFlag:false, connects_to:[], prerequisite_card_id:null })
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
    setForm({ front:"", back:"", tags:[], note:"", anchor:"", source:"", contentType:"Factual", stakesFlag:false, connects_to:[], prerequisite_card_id:null })
    setShowNote(false); setShowAnchor(false); setShowConnects(false); setShowPrereq(false)
    setSaved(true); setTimeout(()=>setSaved(false), 1200)
    frontRef.current?.focus()
  }

  const handleArchiveCard = async (id, e) => {
    e.stopPropagation()
    await onUpdateCards(cards.map(c => c.id===id ? { ...c, status:isArch(c)?"Active":"Archived" } : c))
  }

  const canAdd = form.front.trim() && form.back.trim()

  return (
    <div className="rapp-wrap rapp-fadein">
      {editCard && <EditCardModal card={editCard} cards={cards} onUpdateCards={onUpdateCards} decks={decks} onClose={()=>setEditCard(null)} />}

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
        <div style={{ position:"relative" }}>
          <button className="rapp-btn rapp-btn-ghost" style={{ padding:"7px 12px", fontSize:13 }}
            onClick={()=>setShowDeckMenu(o=>!o)}>⋯</button>
          {showDeckMenu && (
            <div style={{ position:"absolute", right:0, top:"calc(100% + 6px)", background:C.elevated, border:`1px solid ${C.border}`, borderRadius:12, padding:6, minWidth:160, zIndex:10, boxShadow:"0 4px 16px rgba(28,40,32,0.12)" }}>
              {[
                { label:"Archive deck", action:()=>{ onArchiveDeck(deckName); setShowDeckMenu(false) } },
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

      {/* Add card form */}
      <div className="rapp-card rapp-mb24">
        <div className="rapp-sec-title" style={{ marginBottom:12 }}>Add card</div>

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
            placeholder="Concise answer — one idea only." />
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
              <div style={{ fontSize:11, color:C.textMut, marginTop:2, lineHeight:1.5 }}>High-stakes card — prioritised when study time is short.</div>
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

        <div className="rapp-row rapp-gap8">
          <button className="rapp-btn rapp-btn-primary rapp-flex1" onClick={handleAdd} disabled={!canAdd}>
            {saved ? "✓ Saved" : "Add card"}
          </button>
        </div>
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
)}
    </div>
  )
}

// ─── Study Select View ────────────────────────────────────────────────────────
function StudySelectView({ cards, decks, settings, onStartSRS, onStartFree }) {
  const [deck, setDeck] = useState("all")
  const [mode, setMode] = useState("srs")
  const [focused, setFocused] = useState(false)
  const { newCardCap=50, reviewCap=200, catchupDays=7, attentionDeclarationEnabled=true } = settings||{}

  const filtered = deck==="all" ? cards : cards.filter(c=>c.deck===deck)
  const dueCount  = getDueWithCatchup(filtered, reviewCap, catchupDays).length
  const newCount  = getNew(filtered).slice(0, newCardCap).length
  const freeCount = filtered.filter(isActive).length
  const canStart  = mode==="srs" ? (dueCount>0||newCount>0) : freeCount>0

  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb24">
        <div className="rapp-pg-title">Study</div>
        <div className="rapp-pg-sub">Choose mode and deck</div>
      </div>

      <div className="rapp-col" style={{ gap:10, marginBottom:20 }}>
        {[
          { id:"srs",  title:"Spaced Repetition", sub:"FSRS scheduling · records progress" },
          { id:"free", title:"Free Study",         sub:"Browse cards freely · nothing recorded" },
        ].map(m => (
          <div key={m.id} className={`nid-mode-card${mode===m.id?" selected":""}`} onClick={()=>setMode(m.id)}>
            <div style={{ fontSize:15, fontWeight:600, color:mode===m.id?C.accent:C.text, marginBottom:4 }}>{m.title}</div>
            <div style={{ fontSize:13, color:C.textMut }}>{m.sub}</div>
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
            <div><span style={{ fontSize:22, fontWeight:700, color:newCount>0?C.text:C.textMut }}>{newCount}</span><span className="rapp-ts"> new</span></div>
          </div>
          {isInSleepWindow(settings) && (dueCount>0||newCount>0) && (
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

      <button className="rapp-btn rapp-btn-primary rapp-btn-full" disabled={!canStart}
        onClick={() => mode==="srs" ? onStartSRS(deck, null, focused) : onStartFree(deck)}>
        {mode==="srs" ? "Start session" : "Start free study"}
      </button>

      {mode==="srs" && !canStart && (
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

function SessionView({ cards, onUpdateCards, onSaveLog, onDone, settings, studyDeckName, log=[], capOverride=null, focused=false }) {
  const { newCardCap=50, reviewCap=200, catchupDays=7, retentionTarget=0.9, matureModeEnabled=true, matureCardThreshold=30, fatigueAlertsEnabled=true } = settings||{}
  const effectiveCap = capOverride != null ? capOverride : reviewCap
  // Compute once at session start — snapshot of log at that moment
  const [fatigueScore] = useState(() => computeFatigueScore(log))

  const filtered = studyDeckName ? cards.filter(c=>c.deck===studyDeckName) : cards

  const [dueCards] = useState(() => getDueWithCatchup(filtered, effectiveCap, catchupDays))
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
    const { stability, difficulty, interval } = fsrsSchedule(card, rating, retentionTarget)
    const isNew = phase==="new", failed = rating==="again"?1:0
    const newEntry = { date: new Date().toISOString(), rating }
    const updated = cards.map(c => c.id===card.id
      ? { ...c, interval, nextReview:addDays(interval), reviewCount:(c.reviewCount||0)+1,
          stability, difficulty, lastReview:localDateStr(), lapses:rating==="again"?(c.lapses||0)+1:(c.lapses||0),
          ratingHistory: [...(c.ratingHistory||[]), newEntry].slice(-50) }
      : c)
    await onUpdateCards(updated)
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
    await onSaveLog({ date:new Date().toISOString(), reviewed:stats.reviewed, failed:stats.failed, newAdded:stats.newAdded, frictionNote })
    onDone()
  }

  const intLabel = rating => {
    if (!card) return ""
    const { interval } = fsrsSchedule(card, rating, retentionTarget)
    if (interval===1) return "Tomorrow"
    if (interval<31)  return `${interval}d`
    if (interval<365) return `${Math.round(interval/30.4)}mo`
    return `${(interval/365).toFixed(1)}yr`
  }

  if (phase==="empty") return (
    <div className="rapp-wrap rapp-fadein" style={{ textAlign:"center", paddingTop:60 }}>
      <div style={{ fontSize:40, marginBottom:16 }}>✓</div>
      <div style={{ fontSize:17, fontWeight:600, color:C.text, marginBottom:8 }}>All caught up</div>
      <div style={{ fontSize:14, color:C.textMut, lineHeight:1.75, marginBottom:24 }}>No cards are due and there are no new cards.</div>
      <button className="rapp-btn rapp-btn-ghost" onClick={onDone}>Back</button>
    </div>
  )

  if (phase==="close") return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb28">
        <div className="rapp-pg-title">Session complete</div>
        <div className="rapp-pg-sub">Note anything that felt difficult, then save</div>
      </div>
      <div className="rapp-stat-row rapp-mb20">
        <div className="rapp-stat-box"><div className="rapp-stat-num">{stats.reviewed}</div><div className="rapp-stat-lbl">Reviewed</div></div>
        <div className="rapp-stat-box"><div className="rapp-stat-num" style={{ color:stats.failed>0?C.again:C.textMut }}>{stats.failed}</div><div className="rapp-stat-lbl">Failed</div></div>
        <div className="rapp-stat-box"><div className="rapp-stat-num" style={{ color:C.accent }}>{stats.newAdded}</div><div className="rapp-stat-lbl">New cards</div></div>
      </div>
      {(() => { const cal = computeCalibration(cards); return (
        <div style={{ fontSize:13, color:C.textMut, marginBottom:16 }}>
          Recall accuracy (30 days): {cal.score !== null ? <strong style={{ color:cal.score>=85?C.accent:C.warning }}>{cal.score}%</strong> : <span>tracking started</span>}
        </div>
      )})()}
      <div className="rapp-card rapp-mb16">
        <label className="rapp-label">Session notes (optional)</label>
        <textarea className="rapp-textarea" rows={3} placeholder="Anything that felt slow or unclear?" value={friction} onChange={e=>setFriction(e.target.value)} />
      </div>
      <button className="rapp-btn rapp-btn-primary rapp-btn-full" onClick={handleClose}>Save and finish</button>
    </div>
  )

  if (!card) return null
  const progress = Math.round(((idx+1) / list.length) * 100)

  return (
    <div className="rapp-wrap rapp-fadein">
      {/* Header — no card counter per brief */}
      <div className="rapp-row rapp-sb rapp-mb14">
        <span className="rapp-phase-tag">{phase==="warmup"?"Review":"New card"}</span>
        {lastAction && (
          <button onClick={handleUndo}
            style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, fontFamily:"inherit", padding:"6px 10px", borderRadius:8 }}
            onMouseEnter={e=>e.currentTarget.style.background=C.surface}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>
            ↩ Undo
          </button>
        )}
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
            </div>
          </div>
        )}
        <div className="nid-study-label">Question</div>
        <p className="rapp-card-front">{card.front}</p>

        {side >= 1 && (
          <div className="rapp-back-reveal">
            <div className="rapp-card-sep" />
            <div className="nid-study-label">Answer</div>
            <p className="rapp-card-back">{card.back}</p>

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
            {isMature && side >= 1 && (
              (card.connects_to||[]).length > 0
                ? (
                  <div className="nid-connects-block rapp-fadein">
                    <div className="nid-connects-label">Connected concepts</div>
                    {card.connects_to.map(id => {
                      const linked = cards.find(c=>c.id===id)
                      return linked ? <div key={id} className="nid-connects-item">· {linked.front}</div> : null
                    })}
                  </div>
                )
                : <p style={{ fontSize:13, color:C.textMut, marginTop:12, fontStyle:"italic" }}>
                    Can you name one concept this connects to?
                  </p>
            )}
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
            const label = isMature ? `${base} — then add anything connected to this concept.` : base
            const placeholder = CT_PLACEHOLDER[card.contentType] || CT_PLACEHOLDER["Factual"]
            return (
              <>
                <p style={{ fontSize:12, color:C.textMut, marginBottom:8 }}>{label}</p>
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
            {isMature && revealed && (
              (card.connects_to||[]).length > 0
                ? (
                  <div className="nid-connects-block rapp-fadein">
                    <div className="nid-connects-label">Connected concepts</div>
                    {card.connects_to.map(id => {
                      const linked = cards.find(c=>c.id===id)
                      return linked ? <div key={id} className="nid-connects-item">· {linked.front}</div> : null
                    })}
                  </div>
                )
                : <p style={{ fontSize:13, color:C.textMut, marginTop:12, fontStyle:"italic" }}>
                    Can you name one concept this connects to?
                  </p>
            )}
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
                Review pace may be unsustainable — consider reducing your daily cap.
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
              <p style={{ fontSize:13, color:C.textMut, marginBottom:12 }}>Tracking started — score shown after 10 qualifying reviews.</p>
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
function SettingsView({ settings, onUpdateSettings, cards, decks, onExport, onImport, onImportCards }) {
  const {
    newCardCap=50, reviewCap=200, leechThreshold=5, retentionTarget=0.90, catchupDays=7,
    sleepBedtime=null, sleepWindowMinutes=90, sleepBannerEnabled=true,
    matureModeEnabled=true, matureCardThreshold=30,
    fatigueAlertsEnabled=true, attentionDeclarationEnabled=true,
  } = settings||{}
  const [activeTab, setActiveTab] = useState("study")

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
              <input type="range" className="rapp-slider" min={5} max={100} step={5} value={newCardCap}
                onChange={e=>onUpdateSettings({...settings, newCardCap:Number(e.target.value)})} />
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>Recommended: 10–20 for steady learning.</p>
            </div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Reviews per day</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{reviewCap}</span>
              </div>
              <input type="range" className="rapp-slider" min={20} max={500} step={10} value={reviewCap}
                onChange={e=>onUpdateSettings({...settings, reviewCap:Number(e.target.value)})} />
            </div>

            <div>
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Catch-up spread (days)</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{catchupDays}</span>
              </div>
              <input type="range" className="rapp-slider" min={1} max={14} value={catchupDays}
                onChange={e=>onUpdateSettings({...settings, catchupDays:Number(e.target.value)})} />
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>Overdue cards are spread across this many days to avoid overwhelming sessions.</p>
            </div>
          </div>

          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">FSRS scheduling</div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Target retention</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.accent }}>{Math.round(retentionTarget*100)}%</span>
              </div>
              <input type="range" className="rapp-slider" min={70} max={97} value={Math.round(retentionTarget*100)}
                onChange={e=>onUpdateSettings({...settings, retentionTarget:Number(e.target.value)/100})} />
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                Higher retention = shorter intervals (more reviews). 90% is the default. Lower values reduce review load at the cost of forgetting more.
              </p>
            </div>

            <div>
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Leech threshold (lapses)</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.again }}>{leechThreshold}</span>
              </div>
              <input type="range" className="rapp-slider" min={3} max={10} value={leechThreshold}
                onChange={e=>onUpdateSettings({...settings, leechThreshold:Number(e.target.value)})} />
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>Cards failing this many times are flagged as leeches.</p>
            </div>
          </div>

          <div className="rapp-card" style={{ background:C.bg }}>
            <p style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
              <strong>Keyboard shortcuts during review:</strong> Ctrl+Enter to reveal · 1 = Again · 2 = Hard · 3 = Good · 4 = Easy
            </p>
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
              <input type="range" className="rapp-slider" min={14} max={90} step={1} value={matureCardThreshold}
                onChange={e=>onUpdateSettings({...settings, matureCardThreshold:Number(e.target.value)})} />
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                A card is Mature when its FSRS stability reaches this value. Stability represents days to 90% retention.
              </p>
            </div>
          </div>
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

            <div>
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
          </div>

          <div className="rapp-card" style={{ background:C.bg }}>
            <p style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
              Reviewing cards in the hour or two before sleep has been shown to improve overnight memory consolidation during slow-wave sleep. No scheduling changes are made — this is a reminder only.
            </p>
          </div>
        </div>
      )}

      {activeTab === "data" && (
        <ImportExportPanel cards={cards} decks={decks} onExport={onExport} onImportFile={onImport} onImportCards={onImportCards} />
      )}
    </div>
  )
}

// ─── Import / Export Panel ────────────────────────────────────────────────────
function ImportExportPanel({ cards, onImportFile, onImportCards, onExport }) {
  const [tab,          setTab]         = useState("notion")
  const [notionToken,  setNotionToken] = useState(()=>notionGet().token||"")
  const [notionDb,     setNotionDb]    = useState(()=>notionGet().db||"")
  const [notionStatus, setNotionStatus]= useState("")
  const [notionBusy,   setNotionBusy]  = useState(false)
  const [notionPct,    setNotionPct]   = useState(0)
  const [csvResult,    setCsvResult]   = useState(null)
  const [importResult, setImportResult]= useState(null)
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
      <div style={{ display:"flex", gap:4, background:C.bg, borderRadius:10, padding:3, marginBottom:20 }}>
        {TAB_BTN("notion","Notion")}
        {TAB_BTN("excel", "Excel")}
        {TAB_BTN("backup","JSON backup")}
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
          Your prior learning is still there — spaced repetition builds on what you've retained, not from zero.
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
  const [deckMeta,          setDeckMeta]          = useState(() => deckMetaGet())
  const [settings,          setSettings]          = useState(() => settingsGet())
  const [ready,             setReady]             = useState(false)
  const [syncStatus,        setSyncStatus]        = useState("idle")
  const [lastSynced,        setLastSynced]        = useState(() => lastSyncGet())
  const [sessionCapOverride,setSessionCapOverride]= useState(null)
  const [sessionFocused,    setSessionFocused]    = useState(false)
  const pendingCards = useRef(null)
  const saveTimer    = useRef(null)
  const savedTimer   = useRef(null)

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    storage.loadAll()
      .then(({ cards:rc, deckNames, log:rl }) => {
        setCards(rc); setLog(rl)
        setDecks([...new Set(deckNames)])
        setReady(true)
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
    return Promise.resolve()
  }

  const flushCards = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (pendingCards.current) {
      setSyncStatus("saving")
      try { await storage.syncCards(pendingCards.current); markSaved() }
      catch { setSyncStatus("error") }
    }
  }

  const addLog = async entry => {
    setLog(l => [entry, ...l])
    await storage.appendLog(entry)
  }

  const updateSettings = s => { setSettings(s); settingsSet(s) }

  const addDeck = async name => {
    const t = name.trim()
    if (!t || decks.includes(t)) return
    setDecks(d => [...d, t])
    await storage.ensureDeck(t)
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

  const startSRS  = (deck, capOverride=null, focused=false) => { setStudyDeckName(deck==="all"?null:deck); setSessionCapOverride(capOverride); setSessionFocused(focused); setView("session") }
  const startFree = deck => { setStudyDeckName(deck==="all"?null:deck); setView("free-study") }

  const due = useMemo(() => getDueWithCatchup(cards, settings.reviewCap||200, settings.catchupDays||7), [cards, settings])

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
          {view==="library"      && (showReturnCard
            ? <ReturnOnboardingCard
                daysSince={gapDays}
                dueCount={totalDueAll}
                onCatchUp={() => { dismissOnboarding(); startSRS(null) }}
                onReviewTen={() => { dismissOnboarding(); startSRS(null, 10) }}
              />
            : <LibraryView cards={cards} decks={decks} deckMeta={deckMeta} onSelectDeck={d=>{setSelectedDeck(d);setView("deck")}} onCreateDeck={addDeck} syncStatus={syncStatus} lastSynced={lastSynced} settings={settings} />
          )}
          {view==="deck"         && <DeckView deckName={selectedDeck} cards={cards} onUpdateCards={updateCards} onBack={()=>setView("library")} decks={decks} settings={settings} onArchiveDeck={archiveDeck} />}
          {view==="study-select" && <StudySelectView cards={cards} decks={decks} settings={settings} onStartSRS={startSRS} onStartFree={startFree} />}
          {view==="session"      && <SessionView cards={cards} onUpdateCards={updateCards} onSaveLog={async e=>{await flushCards();await addLog(e)}} onDone={()=>{ setSessionCapOverride(null); setSessionFocused(false); setView("study-select") }} settings={settings} studyDeckName={studyDeckName} log={log} capOverride={sessionCapOverride} focused={sessionFocused} />}
          {view==="free-study"   && <FreeStudyView cards={cards} studyDeckName={studyDeckName} onDone={()=>setView("study-select")} settings={settings} />}
          {view==="stats"        && <StatsView log={log} cards={cards} decks={decks} settings={settings} />}
          {view==="settings"     && <SettingsView settings={settings} onUpdateSettings={updateSettings} cards={cards} decks={decks} onExport={handleExport} onImport={handleImport} onImportCards={handleImportCards} />}
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