import { useState, useEffect, useMemo, useRef } from "react"
import { base44 } from "@/api/base44Client"
import * as storage from "@/api/storage"

// ─── Constants ───────────────────────────────────────────────────────────────
const CONTENT_TYPES = ["Factual", "Mechanism", "Clinical Reasoning", "Anatomy", "Pathology"]
const DECK_LIST = ["Pain Neuroscience", "Epidemiology", "Research Methods", "Bioethics", "Clinical Pharmacology", "General"]
const NEEDS_ELAB = ["Mechanism", "Clinical Reasoning", "Anatomy", "Pathology"]

const TYPE_HELP = {
  "Factual":            "A discrete fact, definition, or number that must simply be known.",
  "Mechanism":          "A process, pathway, or cause-and-effect chain. Requires an elaboration.",
  "Clinical Reasoning": "A case-based prompt requiring judgement. Requires an elaboration.",
  "Anatomy":            "A structural or pathway card. Requires an elaboration.",
  "Pathology":          "A disease process or clinical presentation. Requires an elaboration.",
}

// ─── Colour palette ──────────────────────────────────────────────────────────
const C = {
  bg:       "#F4EFE8",
  surface:  "#FDFAF5",
  elevated: "#FFFFFF",
  text:     "#2C2825",
  textSec:  "#796D65",
  textMut:  "#ADA59C",
  accent:   "#6A9D79",
  accentDk: "#527A5F",
  warm:     "#C4906A",
  border:   "#E6DDD2",
  borderMd: "#CFBFB0",
  again:    "#C06E6A",
  hard:     "#C49568",
  good:     "#6A9D79",
  easy:     "#6888A0",
}

const TAG_COLORS = {
  "Factual":           { bg: "#E2EFF6", text: "#3A6E8A" },
  "Mechanism":         { bg: "#F2EDE3", text: "#8A5E2A" },
  "Clinical Reasoning":{ bg: "#E4EDE0", text: "#3A6E4A" },
  "Anatomy":           { bg: "#EDE4F2", text: "#6A3A8A" },
  "Pathology":         { bg: "#F2E4E4", text: "#8A3A3A" },
}

// ─── Settings (localStorage only — UI preferences, no remote sync needed) ────
const settingsGet = (def) => {
  try { const r = localStorage.getItem("recall-settings"); return r ? JSON.parse(r) : def }
  catch { return def }
}
const settingsSet = (val) => {
  try { localStorage.setItem("recall-settings", JSON.stringify(val)) } catch {}
}

// Onboarding flag (localStorage)
const onboardedGet = () => {
  try { return JSON.parse(localStorage.getItem("recall-onboarded") || "false") }
  catch { return false }
}
const onboardedSet = () => {
  try { localStorage.setItem("recall-onboarded", "true") } catch {}
}

const localDateStr = (d = new Date()) => {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return localDateStr(d) }

// ─── Utilities ────────────────────────────────────────────────────────────────
const todayStr = () => localDateStr()
const genId    = () => Date.now().toString(36) + Math.random().toString(36).slice(2)

// ─── FSRS v4 Algorithm ────────────────────────────────────────────────────────
// Reference: github.com/open-spaced-repetition/fsrs4anki
const FSRS_W = [
  0.4072, 1.1829, 3.1262, 15.4722,
  7.2102, 0.5316, 1.0651, 0.0589,
  1.5330, 0.1544, 1.0071,
  1.9442, 0.1100, 0.2900, 2.2700,
  0.2500, 2.9898
]
const FSRS_DECAY  = -0.5
const FSRS_FACTOR = 19 / 81

const fsrsS0 = g => FSRS_W[g - 1]
const fsrsD0 = g => Math.min(10, Math.max(1, FSRS_W[4] - Math.exp(FSRS_W[5] * (g - 1)) + 1))
const fsrsR  = (elapsed, S) => Math.pow(1 + FSRS_FACTOR * elapsed / S, FSRS_DECAY)

const fsrsSRecall = (D, S, R, g) => {
  const base = S * (Math.exp(FSRS_W[8]) * (11 - D) * Math.pow(S, -FSRS_W[9]) * (Math.exp(FSRS_W[10] * (1 - R)) - 1) + 1)
  if (g === 2) return base * FSRS_W[15]
  if (g === 4) return base * Math.exp(FSRS_W[16])
  return base
}

const fsrsSForget = (D, S, R) =>
  FSRS_W[11] * Math.pow(D, -FSRS_W[12]) * (Math.pow(S + 1, FSRS_W[13]) - 1) * Math.exp(FSRS_W[14] * (1 - R))

const fsrsDUpdate = (D, g) => {
  const nextD  = D - FSRS_W[6] * (g - 3)
  const d0Easy = fsrsD0(4)
  return Math.min(10, Math.max(1, FSRS_W[7] * d0Easy + (1 - FSRS_W[7]) * nextD))
}

const fsrsInterval = S => Math.max(1, Math.round(S))

const daysSince = dateStr => {
  if (!dateStr) return 0
  const ms = new Date() - new Date(dateStr)
  return Math.max(0, Math.round(ms / 86400000))
}

const fsrsSchedule = (card, ratingStr) => {
  const g = { again: 1, hard: 2, good: 3, easy: 4 }[ratingStr]
  const S = card.stability || card.interval || 1
  const D = card.difficulty || fsrsD0(3)
  const isFirstReview = !card.lastReview && !card.stability

  if (isFirstReview) {
    const newS = fsrsS0(g)
    const newD = fsrsD0(g)
    return { stability: newS, difficulty: newD, interval: g === 1 ? 1 : fsrsInterval(newS) }
  }

  const elapsed = daysSince(card.lastReview || null)
  const R = fsrsR(elapsed, S)

  if (g === 1) {
    const newS = Math.max(0.1, fsrsSForget(D, S, R))
    const newD = fsrsDUpdate(D, g)
    return { stability: newS, difficulty: newD, interval: 1, retrievability: R }
  }
  const newS = Math.min(36500, Math.max(0.1, fsrsSRecall(D, S, R, g)))
  const newD = fsrsDUpdate(D, g)
  return { stability: newS, difficulty: newD, interval: fsrsInterval(newS), retrievability: R }
}

const isActive = c => c.status !== "Parked" && c.status !== "Archived"
const getDue    = cards =>
  cards.filter(c => isActive(c) && c.nextReview != null && c.nextReview <= todayStr())
       .sort((a, b) => a.nextReview.localeCompare(b.nextReview))
const getNew    = cards => cards.filter(c => isActive(c) && !c.nextReview)

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .rapp {
    min-height: 100vh;
    background: #F4EFE8;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #2C2825;
    display: flex;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  .rapp-sidebar {
    width: 210px;
    min-height: 100vh;
    background: #FDFAF5;
    border-right: 1px solid #E6DDD2;
    display: flex;
    flex-direction: column;
    padding: 32px 0 28px;
    position: fixed;
    left: 0; top: 0; bottom: 0;
    z-index: 20;
  }
  .rapp-logo {
    padding: 0 24px 32px;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.6px;
    color: #2C2825;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rapp-logo-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #6A9D79;
  }
  .rapp-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 24px;
    cursor: pointer;
    color: #ADA59C;
    font-size: 14px;
    font-weight: 400;
    border-left: 2.5px solid transparent;
    transition: color 0.14s ease, background-color 0.14s ease, border-color 0.14s ease;
    user-select: none;
    letter-spacing: -0.1px;
  }
  .rapp-nav-item:hover { color: #2C2825; background: #F4EFE8; }
  .rapp-nav-item.active {
    color: #6A9D79;
    border-left-color: #6A9D79;
    background: #F4EFE8;
    font-weight: 500;
  }

  .rapp-main {
    margin-left: 210px;
    flex: 1;
    padding: 44px 36px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  @media (min-width: 900px) {
    .rapp-main { padding: 52px max(36px, calc((100% - 520px) / 2)); }
  }

  .rapp-bnav { display: none; }

  @media (max-width: 639px) {
    .rapp-sidebar { display: none; }
    .rapp-main { margin-left: 0; padding: 28px 18px 96px; }
    .rapp-bnav {
      display: flex;
      position: fixed;
      bottom: 0; left: 0; right: 0;
      background: #FDFAF5;
      border-top: 1px solid #E6DDD2;
      z-index: 100;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
    .rapp-bnav-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 10px 0 8px;
      cursor: pointer;
      color: #ADA59C;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.2px;
      transition: color 0.14s;
      user-select: none;
    }
    .rapp-bnav-item.active { color: #6A9D79; }
  }

  .rapp-wrap { max-width: 520px; }

  .rapp-pg-title  { font-size: 24px; font-weight: 700; letter-spacing: -0.7px; color: #2C2825; }
  .rapp-pg-sub    { font-size: 13px; color: #ADA59C; margin-top: 3px; }
  .rapp-sec-title { font-size: 14px; font-weight: 600; color: #2C2825; margin-bottom: 14px; letter-spacing: -0.2px; }
  .rapp-label     { font-size: 11.5px; font-weight: 600; color: #796D65; display: block; margin-bottom: 7px; letter-spacing: 0.15px; text-transform: uppercase; }
  .rapp-phase-tag { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #ADA59C; }

  .rapp-card {
    background: #FDFAF5;
    border: 1px solid #E6DDD2;
    border-radius: 16px;
    padding: 22px;
  }

  .rapp-study-card {
    background: #FFFFFF;
    border: 1px solid #E6DDD2;
    border-radius: 24px;
    padding: 34px 30px 28px;
    min-height: 210px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 2px 12px rgba(44,40,37,0.07);
  }
  .rapp-card-front { font-size: 19px; line-height: 1.6; color: #2C2825; font-weight: 500; flex-grow: 1; }
  .rapp-card-back  { font-size: 14px; line-height: 1.75; color: #5C5049; white-space: pre-wrap; }
  .rapp-card-sep   { height: 1px; background: #E6DDD2; margin: 22px 0; }
  .rapp-card-meta  { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; }

  .rapp-stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .rapp-stat-box {
    background: #FFFFFF;
    border: 1px solid #E6DDD2;
    border-radius: 12px;
    padding: 16px 10px;
    text-align: center;
  }
  .rapp-stat-num { font-size: 28px; font-weight: 700; letter-spacing: -1.5px; color: #2C2825; }
  .rapp-stat-lbl { font-size: 12px; color: #ADA59C; margin-top: 4px; letter-spacing: 0.1px; }

  .rapp-progress {
    height: 3px;
    background: #E6DDD2;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 24px;
  }
  .rapp-progress-fill {
    height: 100%;
    background: #6A9D79;
    border-radius: 3px;
    transition: width 0.45s cubic-bezier(0.4, 0, 0.2, 1);
    will-change: width;
  }

  .rapp-btn {
    padding: 12px 22px;
    border-radius: 12px;
    border: none;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.14s ease;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    letter-spacing: -0.1px;
  }
  .rapp-btn-primary { background: #6A9D79; color: #FFFFFF; }
  .rapp-btn-primary:hover { background: #527A5F; box-shadow: 0 0 0 3px rgba(106,157,121,0.2); }
  .rapp-btn-primary:disabled { opacity: 0.38; cursor: not-allowed; }
  .rapp-btn-ghost { background: transparent; color: #796D65; border: 1px solid #E6DDD2; }
  .rapp-btn-ghost:hover { background: #F4EFE8; color: #2C2825; border-color: #CFBFB0; }
  .rapp-btn-full { width: 100%; padding: 16px; font-size: 15px; border-radius: 16px; }

  .rapp-btn-reveal {
    width: 100%;
    padding: 18px;
    background: #F4EFE8;
    border: 1.5px dashed #CFBFB0;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    color: #796D65;
    cursor: pointer;
    transition: all 0.14s ease;
    font-family: inherit;
  }
  .rapp-btn-reveal:hover {
    background: #FDFAF5;
    border-color: #6A9D79;
    border-style: solid;
    color: #2C2825;
  }

  .rapp-rating-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .rapp-rating-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 15px 6px 13px;
    border-radius: 12px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.14s ease;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.1px;
    will-change: transform;
  }
  .rapp-rating-btn:hover  { transform: translateY(-2px); }
  .rapp-rating-btn:active { transform: translateY(0); }
  .rapp-ri { font-size: 10px; font-weight: 400; opacity: 0.7; letter-spacing: 0; }
  .r-again { background: #FBF0EE; color: #C06E6A; border-color: #EFCFCC; }
  .r-hard  { background: #FBF4EC; color: #C49568; border-color: #F0DBC8; }
  .r-good  { background: #EEF6EF; color: #6A9D79; border-color: #C4DFCA; }
  .r-easy  { background: #EAF1F6; color: #6888A0; border-color: #BFCFDF; }
  .r-again:active { background: #F2DDD9; }
  .r-hard:active  { background: #F2E4D4; }
  .r-good:active  { background: #DDF0E0; }
  .r-easy:active  { background: #D6E8F2; }

  .rapp-input,
  .rapp-textarea,
  .rapp-select {
    background: #FFFFFF;
    border: 1px solid #E6DDD2;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 14px;
    color: #2C2825;
    width: 100%;
    font-family: inherit;
    outline: none;
    transition: border-color 0.14s;
    line-height: 1.5;
    appearance: none;
    -webkit-appearance: none;
  }
  .rapp-input:focus,
  .rapp-textarea:focus,
  .rapp-select:focus { border-color: #6A9D79; box-shadow: 0 0 0 3px rgba(106,157,121,0.1); }
  .rapp-textarea { resize: vertical; min-height: 80px; }
  .rapp-select {
    cursor: pointer;
    padding-right: 34px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23ADA59C' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 13px center;
  }

  .rapp-elab-box {
    background: #F4EFE8;
    border: 1px solid #E6DDD2;
    border-radius: 16px;
    padding: 18px;
    margin-top: 14px;
  }
  .rapp-elab-q {
    font-size: 12.5px;
    font-style: italic;
    color: #ADA59C;
    margin-bottom: 12px;
    line-height: 1.55;
  }

  .rapp-card-item {
    background: #FFFFFF;
    border: 1px solid #E6DDD2;
    border-radius: 16px;
    padding: 16px 18px;
    cursor: pointer;
    transition: border-color 0.14s, box-shadow 0.14s;
  }
  .rapp-card-item:hover {
    border-color: #CFBFB0;
    box-shadow: 0 2px 8px rgba(44,40,37,0.05);
  }
  .rapp-card-item-q { font-size: 14px; color: #2C2825; line-height: 1.55; }

  .rapp-phase-row { display: flex; align-items: center; gap: 14px; }
  .rapp-phase-num {
    width: 28px; height: 28px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700;
    flex-shrink: 0;
    transition: all 0.14s;
  }

  .rapp-hr    { border: none; border-top: 1px solid #E6DDD2; }

  .rapp-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1px;
    white-space: nowrap;
  }

  .rapp-empty {
    text-align: center;
    padding: 52px 24px;
    color: #ADA59C;
    font-size: 14px;
    line-height: 1.75;
  }

  @media (max-width: 639px) {
    .rapp-modal-backdrop { align-items: flex-end !important; padding: 0 !important; }
    .rapp-modal-inner    { border-radius: 22px 22px 0 0 !important; max-height: 92vh !important; }
  }

  button, [role="button"], .rapp-nav-item, .rapp-bnav-item, .rapp-card-item {
    touch-action: manipulation;
  }
  button:focus-visible, [tabindex]:focus-visible {
    outline: 2px solid #6A9D79;
    outline-offset: 2px;
    border-radius: 8px;
  }

  .rapp-nav-badge {
    min-width: 18px;
    height: 18px;
    background: #C06E6A;
    color: #fff;
    border-radius: 9px;
    font-size: 10px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 5px;
    margin-left: auto;
    margin-right: 4px;
  }

  .rapp-ob-dots { display: flex; gap: 5px; align-items: center; width: 54px; }
  .rapp-ob-dot  { height: 6px; border-radius: 3px; background: #E6DDD2; transition: all 0.25s ease; flex-shrink: 0; }
  .rapp-ob-dot.active   { background: #6A9D79; flex: 1; }
  .rapp-ob-dot.inactive { width: 6px; }

  .rapp-proposal { background: #FFFFFF; border: 1px solid #E6DDD2; border-radius: 16px; padding: 16px 18px; transition: border-color 0.14s; }
  .rapp-proposal.rejected { opacity: 0.45; }
  .rapp-proposal.accepted { border-color: #C4DFCA; }

  .rapp-slider { width: 100%; accent-color: #6A9D79; height: 4px; cursor: pointer; }

  .rapp-kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 1px 6px;
    border: 1px solid #CFBFB0;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 600;
    color: #ADA59C;
    background: #FDFAF5;
    line-height: 1.6;
  }

  .rapp-leech {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 700;
    background: #FBF0EE;
    color: #C06E6A;
    border: 1px solid #EFCFCC;
  }

  @keyframes rapp-fadein {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .rapp-fadein { animation: rapp-fadein 0.22s ease forwards; }

  @keyframes rapp-reveal {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .rapp-back-reveal { animation: rapp-reveal 0.2s ease forwards; will-change: opacity, transform; }

  .rapp-row   { display: flex; align-items: center; }
  .rapp-col   { display: flex; flex-direction: column; }
  .rapp-sb    { justify-content: space-between; }
  .rapp-gap8  { gap: 8px; }
  .rapp-gap12 { gap: 12px; }
  .rapp-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .rapp-mt4   { margin-top: 4px; }
  .rapp-mt8   { margin-top: 8px; }
  .rapp-mt12  { margin-top: 12px; }
  .rapp-mt16  { margin-top: 16px; }
  .rapp-mt20  { margin-top: 20px; }
  .rapp-mt24  { margin-top: 24px; }
  .rapp-mt28  { margin-top: 28px; }
  .rapp-mb8   { margin-bottom: 8px; }
  .rapp-mb12  { margin-bottom: 12px; }
  .rapp-mb14  { margin-bottom: 14px; }
  .rapp-mb16  { margin-bottom: 16px; }
  .rapp-mb20  { margin-bottom: 20px; }
  .rapp-mb24  { margin-bottom: 24px; }
  .rapp-mb28  { margin-bottom: 28px; }
  .rapp-flex1 { flex: 1; }
  .rapp-ts    { font-size: 13px; color: #ADA59C; }
  .rapp-tm    { font-size: 14px; color: #796D65; }
`

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Ico = {
  home:    (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  study:   (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  cards:   (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/></svg>,
  log:     (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  plus:    (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  gear:    (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  spark:   (s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  chevron: (s=16, open=false) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s ease", flexShrink: 0, color: "#ADA59C" }}><polyline points="6 9 12 15 18 9"/></svg>,
}

// ─── Small components ─────────────────────────────────────────────────────────
function Badge({ type }) {
  const t = TAG_COLORS[type] || { bg: "#F0EDE3", text: "#8A7050" }
  return <span className="rapp-badge" style={{ background: t.bg, color: t.text }}>{type}</span>
}

function PhaseRow({ n, label, sub, on }) {
  return (
    <div className="rapp-phase-row">
      <div className="rapp-phase-num" style={{ background: on ? C.accent : C.border, color: on ? "#fff" : C.textMut }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: on ? C.text : C.textMut }}>{label}</div>
        <div className="rapp-ts rapp-mt4">{sub}</div>
      </div>
    </div>
  )
}

// ─── Home View ────────────────────────────────────────────────────────────────
function HomeView({ due, newAvail, log, onStart, totalCards, forecast }) {
  const dateStr = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
  const last = log[0]

  const streak = (() => {
    if (log.length === 0) return 0
    const days = new Set(log.map(e => new Date(e.date).toISOString().split("T")[0]))
    let count = 0
    const d = new Date()
    const todayS = d.toISOString().split("T")[0]
    d.setDate(d.getDate() - 1)
    const yestS = d.toISOString().split("T")[0]
    const start = days.has(todayS) ? todayS : (days.has(yestS) ? yestS : null)
    if (!start) return 0
    const cur = new Date(start)
    while (days.has(cur.toISOString().split("T")[0])) { count++; cur.setDate(cur.getDate() - 1) }
    return count
  })()

  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb24">
        <div className="rapp-pg-title">Today</div>
        <div className="rapp-pg-sub">{dateStr}</div>
      </div>

      <div className="rapp-stat-row rapp-mb24">
        <div className="rapp-stat-box">
          <div className="rapp-stat-num" style={{ color: due.length > 0 ? C.again : C.accent }}>{due.length}</div>
          <div className="rapp-stat-lbl">Due today</div>
        </div>
        <div className="rapp-stat-box">
          <div className="rapp-stat-num">{Math.min(newAvail.length, 5)}</div>
          <div className="rapp-stat-lbl">New today</div>
        </div>
        <div className="rapp-stat-box" title="Consecutive days with a session">
          <div className="rapp-stat-num" style={{ color: streak > 0 ? C.accent : C.textMut }}>{streak}</div>
          <div className="rapp-stat-lbl">Day streak {streak > 2 ? "🔥" : ""}</div>
        </div>
      </div>

      {totalCards === 0 && (
        <div style={{ background: "#EEF6EF", border: "1px solid #C4DFCA", borderRadius: 16, padding: "20px 22px", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.accent, marginBottom: 6 }}>Start by adding your first card</div>
          <div style={{ fontSize: 13, color: "#527A5F", lineHeight: 1.65 }}>Go to Cards to create your first study card.</div>
        </div>
      )}

      <div className="rapp-card rapp-mb24">
        <div className="rapp-sec-title">Session structure</div>
        <div className="rapp-col" style={{ gap: 16 }}>
          <PhaseRow n={1} label="Warm-up review" sub={due.length > 0 ? `${due.length} card${due.length !== 1 ? "s" : ""} due` : "Nothing due today"} on={due.length > 0} />
          <PhaseRow n={2} label="New material"   sub={newAvail.length > 0 ? `${Math.min(newAvail.length, 5)} of ${newAvail.length} new card${newAvail.length !== 1 ? "s" : ""} (daily cap: 5)` : "No new cards"} on={newAvail.length > 0} />
          <PhaseRow n={3} label="Session close"  sub="Close and record session notes" on />
        </div>
      </div>

      {forecast && (
        <div className="rapp-card rapp-mb24">
          <div className="rapp-sec-title">7-day review forecast</div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 56 }}>
            {forecast.map((day, i) => {
              const maxCount = Math.max(...forecast.map(d => d.count), 1)
              const barH = day.count === 0 ? 4 : Math.max(8, Math.round((day.count / maxCount) * 44))
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: day.count > 0 ? C.text : C.textMut }}>{day.count || ""}</div>
                  <div style={{ width: "100%", height: barH, borderRadius: 4, background: day.isToday ? C.accent : day.count > 0 ? "#C4DFCA" : C.border, transition: "height 0.3s ease" }} />
                  <div style={{ fontSize: 10, color: day.isToday ? C.accent : C.textMut, fontWeight: day.isToday ? 600 : 400 }}>{day.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <button className="rapp-btn rapp-btn-primary rapp-btn-full rapp-mb28" onClick={onStart}>Start session</button>

      {last && (
        <div>
          <div className="rapp-sec-title">Last session</div>
          <div className="rapp-card">
            <div className="rapp-row rapp-sb rapp-mb12">
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                {new Date(last.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <span className="rapp-ts">{new Date(last.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="rapp-row rapp-gap12" style={{ gap: 22 }}>
              <div><span style={{ fontSize: 20, fontWeight: 700 }}>{last.reviewed}</span><span className="rapp-ts"> reviewed</span></div>
              <div><span style={{ fontSize: 20, fontWeight: 700, color: last.failed > 0 ? C.again : C.textMut }}>{last.failed}</span><span className="rapp-ts"> failed</span></div>
              <div><span style={{ fontSize: 20, fontWeight: 700, color: C.accent }}>{last.newAdded}</span><span className="rapp-ts"> new</span></div>
            </div>
            {last.frictionNote && (
              <p style={{ marginTop: 14, fontSize: 13, color: C.textMut, fontStyle: "italic", lineHeight: 1.65, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                "{last.frictionNote}"
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Session View ─────────────────────────────────────────────────────────────
function SessionView({ cards, onUpdateCards, onSaveLog, onDone, newCardCap = 5 }) {
  const initialPhase = (() => {
    if (getDue(cards).length > 0) return "warmup"
    if (getNew(cards).length > 0) return "new"
    return "empty"
  })()

  const [phase,       setPhase]      = useState(initialPhase)
  const [dueCards]                   = useState(() => getDue(cards))
  const [newCards]                   = useState(() => getNew(cards).slice(0, newCardCap))
  const [idx,         setIdx]        = useState(0)
  const [revealed,    setRevealed]   = useState(false)
  const [showElab,    setShowElab]   = useState(false)
  const [elabText,    setElabText]   = useState("")
  const [stats,       setStats]      = useState({ reviewed: 0, failed: 0, newAdded: 0 })
  const [friction,    setFriction]   = useState("")
  const [lastAction,  setLastAction] = useState(null)

  const list = phase === "warmup" ? dueCards : newCards
  const card = list[idx]

  const revealedRef   = useRef(revealed)
  const showElabRef   = useRef(showElab)
  const phaseRef      = useRef(phase)
  const handleRateRef = useRef(null)

  useEffect(() => { revealedRef.current = revealed  }, [revealed])
  useEffect(() => { showElabRef.current = showElab  }, [showElab])
  useEffect(() => { phaseRef.current    = phase     }, [phase])

  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return
      const ph = phaseRef.current
      if (ph === "warmup" || ph === "new") {
        if (!revealedRef.current && !showElabRef.current) {
          if (e.key === " " || e.key === "Enter") { e.preventDefault(); setRevealed(true) }
        } else if (revealedRef.current && !showElabRef.current) {
          if (e.key === "1") handleRateRef.current("again")
          if (e.key === "2") handleRateRef.current("hard")
          if (e.key === "3") handleRateRef.current("good")
          if (e.key === "4") handleRateRef.current("easy")
        }
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  const advance = (ph, ci) => {
    const l = ph === "warmup" ? dueCards : newCards
    if (ci + 1 < l.length) {
      setIdx(ci + 1); setRevealed(false); setShowElab(false); setElabText("")
    } else if (ph === "warmup" && newCards.length > 0) {
      setPhase("new"); setIdx(0); setRevealed(false); setShowElab(false); setElabText("")
    } else {
      setPhase("close")
    }
  }

  const handleRate = async (rating) => {
    if (!card) return
    const { stability, difficulty, interval } = fsrsSchedule(card, rating)
    const nextRev = addDays(interval)
    const isNew   = phase === "new"
    const failed  = rating === "again" ? 1 : 0

    const updated = cards.map(c =>
      c.id === card.id
        ? { ...c, interval, nextReview: nextRev, reviewCount: (c.reviewCount || 0) + 1,
            stability, difficulty, lastReview: localDateStr(),
            lapses: rating === "again" ? (c.lapses || 0) + 1 : (c.lapses || 0) }
        : c
    )
    await onUpdateCards(updated)

    setLastAction({
      cardId: card.id,
      prevInterval: card.interval, prevNextReview: card.nextReview,
      prevReviewCount: card.reviewCount || 0, prevStability: card.stability,
      prevDifficulty: card.difficulty, prevLastReview: card.lastReview,
      prevLapses: card.lapses || 0,
      statDelta: { reviewed: isNew ? 0 : 1, failed, newAdded: isNew ? 1 : 0 },
      phase, idx
    })
    setStats(s => ({ reviewed: s.reviewed + (isNew ? 0 : 1), failed: s.failed + failed, newAdded: s.newAdded + (isNew ? 1 : 0) }))

    if ((rating === "good" || rating === "easy") && NEEDS_ELAB.includes(card.contentType)) {
      setShowElab(true); setElabText(card.elaboration || "")
    } else {
      advance(phase, idx)
    }
  }

  handleRateRef.current = handleRate

  const handleElabDone = async (save) => {
    if (save && elabText.trim() && card) {
      const updated = cards.map(c => c.id === card.id ? { ...c, elaboration: elabText.trim() } : c)
      await onUpdateCards(updated)
    }
    setShowElab(false); advance(phase, idx)
  }

  const handleUndo = async () => {
    if (!lastAction) return
    const restored = cards.map(c =>
      c.id === lastAction.cardId
        ? { ...c, interval: lastAction.prevInterval, nextReview: lastAction.prevNextReview,
            reviewCount: lastAction.prevReviewCount, stability: lastAction.prevStability,
            difficulty: lastAction.prevDifficulty, lastReview: lastAction.prevLastReview,
            lapses: lastAction.prevLapses }
        : c
    )
    await onUpdateCards(restored)
    setStats(s => ({ reviewed: s.reviewed - lastAction.statDelta.reviewed, failed: s.failed - lastAction.statDelta.failed, newAdded: s.newAdded - lastAction.statDelta.newAdded }))
    setIdx(lastAction.idx); setPhase(lastAction.phase)
    setRevealed(false); setShowElab(false); setElabText(""); setLastAction(null)
  }

  const handleClose = async () => {
    await onSaveLog({ date: new Date().toISOString(), reviewed: stats.reviewed, failed: stats.failed, newAdded: stats.newAdded, frictionNote: friction.trim() })
    onDone()
  }

  const intLabel = rating => {
    if (!card) return ""
    const { interval } = fsrsSchedule(card, rating)
    if (interval === 1) return "Tomorrow"
    if (interval < 31)  return `${interval}d`
    if (interval < 365) return `${Math.round(interval / 30.4)}mo`
    return `${(interval / 365).toFixed(1)}yr`
  }

  if (phase === "empty") return (
    <div className="rapp-wrap rapp-fadein">
      <div style={{ textAlign: "center", padding: "60px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 8 }}>Nothing to review</div>
        <div style={{ fontSize: 14, color: C.textMut, lineHeight: 1.75, marginBottom: 24 }}>No cards are due and there are no new cards. Add cards in the Cards tab or come back tomorrow.</div>
        <button className="rapp-btn rapp-btn-ghost" onClick={onDone}>Back to home</button>
      </div>
    </div>
  )

  if (phase === "close") return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb28">
        <div className="rapp-pg-title">Session complete</div>
        <div className="rapp-pg-sub">Note anything that felt slow or awkward, then save</div>
      </div>
      <div className="rapp-stat-row rapp-mb20">
        <div className="rapp-stat-box"><div className="rapp-stat-num">{stats.reviewed}</div><div className="rapp-stat-lbl">Reviewed</div></div>
        <div className="rapp-stat-box"><div className="rapp-stat-num" style={{ color: stats.failed > 0 ? C.again : C.accent }}>{stats.failed}</div><div className="rapp-stat-lbl">Failed</div></div>
        <div className="rapp-stat-box"><div className="rapp-stat-num" style={{ color: C.accent }}>{stats.newAdded}</div><div className="rapp-stat-lbl">New cards</div></div>
      </div>
      <div className="rapp-card rapp-mb16">
        <label className="rapp-label">Session notes (optional)</label>
        <textarea className="rapp-textarea" rows={3} placeholder="What felt slow, awkward, or unclear today?" value={friction} onChange={e => setFriction(e.target.value)} />
      </div>
      <button className="rapp-btn rapp-btn-primary rapp-btn-full" onClick={handleClose}>Save and finish</button>
    </div>
  )

  if (!card) return null
  const progress = Math.round(((idx + 1) / list.length) * 100)

  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-row rapp-sb rapp-mb16">
        <span className="rapp-phase-tag">{phase === "warmup" ? "Warm-up review" : "New material"}</span>
        <div className="rapp-row rapp-gap8">
          {lastAction && (
            <button onClick={handleUndo}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.textMut, fontFamily: "inherit", padding: "8px 10px", borderRadius: 8, transition: "background 0.14s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#F4EFE8"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              ↩ Undo
            </button>
          )}
          <span className="rapp-ts">{idx + 1} / {list.length}</span>
        </div>
      </div>

      <div className="rapp-progress">
        <div className="rapp-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="rapp-study-card rapp-mb16">
        <div className="rapp-card-meta">
          {card.contentType && <Badge type={card.contentType} />}
          {card.deck && <span className="rapp-ts">{card.deck}</span>}
          {card.stability && (
            <span className="rapp-ts" style={{ marginLeft: "auto", fontSize: 11, color: "#CFBFB0" }} title="FSRS stability · difficulty">
              S{Math.round(card.stability)}d · D{(card.difficulty || 5).toFixed(1)}
            </span>
          )}
        </div>
        <p className="rapp-card-front">{card.front}</p>
        {revealed && (
          <div className="rapp-back-reveal">
            <div className="rapp-card-sep" />
            <p className="rapp-card-back">{card.back}</p>
            {card.elaboration && (
              <p style={{ marginTop: 14, fontSize: 12.5, color: "#ADA59C", fontStyle: "italic", lineHeight: 1.65, borderTop: "1px solid #E6DDD2", paddingTop: 12 }}>
                ↳ {card.elaboration}
              </p>
            )}
          </div>
        )}
      </div>

      {showElab && (
        <div className="rapp-elab-box rapp-fadein">
          <p className="rapp-elab-q">
            {elabText ? "Review and update your elaboration. Does it still capture the mechanism accurately?" : "Why is this true, or how does this work? One sentence in your own words."}
          </p>
          <textarea className="rapp-textarea" rows={3} value={elabText} onChange={e => setElabText(e.target.value)} placeholder="Your explanation..." style={{ marginBottom: 10 }} />
          <div className="rapp-row rapp-gap8">
            <button className="rapp-btn rapp-btn-primary rapp-flex1" onClick={() => handleElabDone(true)}>Save elaboration</button>
            <button className="rapp-btn rapp-btn-ghost" onClick={() => handleElabDone(false)}>Skip</button>
          </div>
        </div>
      )}

      {!revealed && !showElab && (
        <button className="rapp-btn-reveal" onClick={() => setRevealed(true)}>Reveal answer</button>
      )}

      {revealed && !showElab && (
        <div className="rapp-fadein">
          <p className="rapp-ts rapp-mb12" style={{ textAlign: "center" }}>How well did you recall this?</p>
          <div className="rapp-rating-grid">
            {[
              { id: "again", label: "Again", cls: "r-again" },
              { id: "hard",  label: "Hard",  cls: "r-hard"  },
              { id: "good",  label: "Good",  cls: "r-good"  },
              { id: "easy",  label: "Easy",  cls: "r-easy"  },
            ].map(r => (
              <button key={r.id} className={`rapp-rating-btn ${r.cls}`} onClick={() => handleRate(r.id)}>
                <span>{r.label}</span>
                <span className="rapp-ri">{intLabel(r.id)}</span>
              </button>
            ))}
            <p style={{ gridColumn: "1/-1", fontSize: 12, color: "#ADA59C", textAlign: "center", marginTop: 6, lineHeight: 1.6 }}>
              Again = blank &nbsp;·&nbsp; Hard = partial &nbsp;·&nbsp; Good = effort &nbsp;·&nbsp; Easy = instant
            </p>
            <p style={{ gridColumn: "1/-1", textAlign: "center", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
              <span className="rapp-kbd">Space</span><span style={{ fontSize: 11, color: "#CFBFB0" }}>reveal</span>
              <span style={{ fontSize: 11, color: "#CFBFB0", margin: "0 2px" }}>·</span>
              <span className="rapp-kbd">1</span><span className="rapp-kbd">2</span><span className="rapp-kbd">3</span><span className="rapp-kbd">4</span>
              <span style={{ fontSize: 11, color: "#CFBFB0" }}>rate</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ card, cards, onUpdateCards, onClose, decks }) {
  const [form, setForm] = useState({
    front: card.front || "", back: card.back || "",
    contentType: card.contentType || "Factual",
    deck: card.deck || (decks || DECK_LIST)[0],
    elaboration: card.elaboration || "",
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const needsElab = NEEDS_ELAB.includes(form.contentType)

  const handleSave = async () => {
    if (!form.front.trim() || !form.back.trim()) return
    await onUpdateCards(cards.map(c => c.id === card.id ? { ...c, ...form } : c))
    onClose()
  }

  const handleDelete = async () => {
    await onUpdateCards(cards.filter(c => c.id !== card.id))
    onClose()
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(44,40,37,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
      className="rapp-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: C.surface, borderRadius: 22, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", padding: "28px 24px 36px", boxShadow: "0 8px 40px rgba(44,40,37,0.18)" }}
        className="rapp-modal-inner">
        <div className="rapp-row rapp-sb rapp-mb20">
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Edit card</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.textMut, lineHeight: 1 }}>×</button>
        </div>

        <div className="rapp-grid2 rapp-mb14">
          <div>
            <label className="rapp-label">Content type</label>
            <select className="rapp-select" value={form.contentType} onChange={e => setForm(f => ({ ...f, contentType: e.target.value }))}>
              {CONTENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="rapp-label">Deck</label>
            <select className="rapp-select" value={form.deck} onChange={e => setForm(f => ({ ...f, deck: e.target.value }))}>
              {(decks || DECK_LIST).map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="rapp-mb12">
          <label className="rapp-label">Front</label>
          <textarea className="rapp-textarea" rows={3} value={form.front} onChange={e => setForm(f => ({ ...f, front: e.target.value }))} />
        </div>
        <div className="rapp-mb12">
          <label className="rapp-label">Back</label>
          <textarea className="rapp-textarea" rows={4} value={form.back} onChange={e => setForm(f => ({ ...f, back: e.target.value }))} />
        </div>
        {needsElab && (
          <div className="rapp-mb16">
            <label className="rapp-label">Elaboration</label>
            <textarea className="rapp-textarea" rows={2} value={form.elaboration} onChange={e => setForm(f => ({ ...f, elaboration: e.target.value }))} placeholder="Why is this true?" />
          </div>
        )}

        <button className="rapp-btn rapp-btn-primary rapp-mb12" style={{ width: "100%" }} onClick={handleSave}
          disabled={!form.front.trim() || !form.back.trim()}>
          Save changes
        </button>

        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
            style={{ width: "100%", padding: "11px", borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.again, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            Delete card
          </button>
        ) : (
          <div style={{ background: "#FBF0EE", border: "1px solid #EFCFCC", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 13, color: C.again, marginBottom: 12 }}>Delete this card permanently?</p>
            <div className="rapp-row rapp-gap8">
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: C.again, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Yes, delete</button>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── AI Generate Panel ────────────────────────────────────────────────────────
const AI_SYSTEM_PROMPT = `You are a medical study flashcard generator for a spaced repetition system.

RULES — follow every one precisely:
1. Each card tests EXACTLY ONE concept. No compound questions.
2. Front: a question forcing active retrieval. Never a topic label.
   BAD: "Central Sensitisation"  GOOD: "What three mechanisms drive central sensitisation at the dorsal horn?"
3. Back: 1-3 sentences maximum. Clinically accurate. No bullet lists.
4. contentType: exactly one of: Factual | Mechanism | Clinical Reasoning | Anatomy | Pathology
5. elaboration: for non-Factual types, one sentence answering "why is this true?" in plain language. Empty string for Factual.
6. Generate 4-8 cards. Prioritise load-bearing concepts over peripheral detail.
7. Skip content too vague to answer with precision.`

const CARD_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      front:       { type: "string" },
      back:        { type: "string" },
      contentType: { type: "string", enum: ["Factual", "Mechanism", "Clinical Reasoning", "Anatomy", "Pathology"] },
      elaboration: { type: "string" },
    },
    required: ["front", "back", "contentType", "elaboration"],
  },
}

function AIGeneratePanel({ decks, onAddCards }) {
  const [text,      setText]      = useState("")
  const [deck,      setDeck]      = useState((decks || DECK_LIST)[0])
  const [loading,   setLoading]   = useState(false)
  const [proposals, setProposals] = useState([])
  const [error,     setError]     = useState("")
  const [added,     setAdded]     = useState(false)

  const generate = async () => {
    if (!text.trim()) return
    setLoading(true); setError(""); setProposals([]); setAdded(false)
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: AI_SYSTEM_PROMPT + "\n\nContent to convert into flashcards:\n\n" + text.trim(),
        model: "claude_sonnet_4_6",
        response_json_schema: CARD_SCHEMA,
      })
      if (!Array.isArray(result)) throw new Error("Unexpected response format")
      setProposals(result.map((c, i) => ({ ...c, deck, _id: i, accepted: true })))
    } catch(e) {
      setError("Generation failed: " + (e.message || "unknown error"))
    }
    setLoading(false)
  }

  const toggle = i => setProposals(ps => ps.map((p, pi) => pi === i ? { ...p, accepted: !p.accepted } : p))
  const update = (i, field, val) => setProposals(ps => ps.map((p, pi) => pi === i ? { ...p, [field]: val } : p))

  const addAccepted = () => {
    const toAdd = proposals.filter(p => p.accepted).map(p => ({
      id: genId(), front: p.front, back: p.back,
      contentType: p.contentType, deck: p.deck || deck, elaboration: p.elaboration || "",
      status: "Active", nextReview: null, interval: 1,
      reviewCount: 0, lapses: 0, createdAt: new Date().toISOString()
    }))
    onAddCards(toAdd)
    setAdded(true)
    setTimeout(() => { setProposals([]); setText(""); setAdded(false) }, 1400)
  }

  const accepted = proposals.filter(p => p.accepted).length

  if (added) return (
    <div style={{ textAlign: "center", padding: "40px 24px" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.accent }}>Cards added</div>
    </div>
  )

  if (proposals.length > 0) return (
    <>
      <div className="rapp-row rapp-sb rapp-mb16">
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{proposals.length} cards generated</span>
        <span className="rapp-ts">{accepted} selected</span>
      </div>
      <div className="rapp-col" style={{ gap: 10, marginBottom: 20 }}>
        {proposals.map((p, i) => (
          <div key={i} className={`rapp-proposal ${p.accepted ? "accepted" : "rejected"}`}>
            <div className="rapp-row rapp-sb rapp-mb8">
              <Badge type={p.contentType} />
              <button onClick={() => toggle(i)}
                style={{ background: p.accepted ? "#EEF6EF" : C.bg, border: `1px solid ${p.accepted ? "#C4DFCA" : C.border}`, borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 600, color: p.accepted ? C.accent : C.textMut, cursor: "pointer", fontFamily: "inherit" }}>
                {p.accepted ? "✓ Include" : "Skip"}
              </button>
            </div>
            <textarea className="rapp-textarea" rows={2} value={p.front} onChange={e => update(i, "front", e.target.value)} style={{ marginBottom: 8, fontSize: 13 }} />
            <textarea className="rapp-textarea" rows={2} value={p.back}  onChange={e => update(i, "back",  e.target.value)} style={{ fontSize: 13 }} />
            {NEEDS_ELAB.includes(p.contentType) && p.elaboration && (
              <p style={{ marginTop: 8, fontSize: 12, color: C.textMut, fontStyle: "italic", lineHeight: 1.6 }}>↳ {p.elaboration}</p>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="rapp-btn rapp-btn-primary rapp-flex1 rapp-btn-full" onClick={addAccepted} disabled={accepted === 0}>
          Add {accepted} card{accepted !== 1 ? "s" : ""} to {deck}
        </button>
        <button className="rapp-btn rapp-btn-ghost" onClick={() => { setProposals([]); setError("") }}>Retry</button>
      </div>
    </>
  )

  return (
    <>
      <div className="rapp-mb12">
        <label className="rapp-label">Target deck</label>
        <select className="rapp-select" value={deck} onChange={e => setDeck(e.target.value)}>
          {(decks || DECK_LIST).map(d => <option key={d}>{d}</option>)}
        </select>
      </div>
      <div className="rapp-mb14">
        <label className="rapp-label">Paste your study content</label>
        <textarea className="rapp-textarea" rows={7} value={text} onChange={e => setText(e.target.value)}
          placeholder="Paste lecture notes, a paper abstract, textbook passage, or bullet points. Claude will generate atomic, retrievable flashcards from the content." />
      </div>
      {error && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13, background: "#FBF0EE", color: C.again, border: "1px solid #EFCFCC" }}>{error}</div>
      )}
      <button className="rapp-btn rapp-btn-primary rapp-btn-full" onClick={generate} disabled={!text.trim() || loading}>
        {loading ? "Generating..." : <>{Ico.spark(15)} Generate cards</>}
      </button>
      <p style={{ marginTop: 10, fontSize: 12, color: C.textMut, lineHeight: 1.65 }}>
        Claude will generate 4-8 atomic cards following spaced repetition principles. Review and edit before adding.
      </p>
    </>
  )
}

// ─── Settings View ────────────────────────────────────────────────────────────
function SettingsView({ settings, onUpdateSettings }) {
  const { newCardCap = 5, leechThreshold = 5 } = settings || {}
  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb28">
        <div className="rapp-pg-title">Settings</div>
        <div className="rapp-pg-sub">Session and scheduling preferences</div>
      </div>
      <div className="rapp-card rapp-mb16">
        <div className="rapp-sec-title">Session</div>
        <div className="rapp-mb20">
          <div className="rapp-row rapp-sb rapp-mb8">
            <label className="rapp-label" style={{ marginBottom: 0 }}>New cards per session</label>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text, minWidth: 28, textAlign: "right" }}>{newCardCap}</span>
          </div>
          <input type="range" className="rapp-slider" min={1} max={20} value={newCardCap}
            onChange={e => onUpdateSettings({ ...settings, newCardCap: Number(e.target.value) })} />
          <p style={{ fontSize: 12, color: C.textMut, marginTop: 6, lineHeight: 1.6 }}>Recommended: 3-5 for early learning, up to 10 for intensive revision phases.</p>
        </div>
        <div>
          <div className="rapp-row rapp-sb rapp-mb8">
            <label className="rapp-label" style={{ marginBottom: 0 }}>Leech threshold (lapses)</label>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.again, minWidth: 28, textAlign: "right" }}>{leechThreshold}</span>
          </div>
          <input type="range" className="rapp-slider" min={3} max={10} value={leechThreshold}
            onChange={e => onUpdateSettings({ ...settings, leechThreshold: Number(e.target.value) })} />
          <p style={{ fontSize: 12, color: C.textMut, marginTop: 6, lineHeight: 1.6 }}>Cards failing this many times are flagged as leeches. Consider rewriting or splitting them.</p>
        </div>
      </div>
      <div className="rapp-card" style={{ background: "#F4EFE8" }}>
        <p style={{ fontSize: 13, color: C.textSec, lineHeight: 1.75 }}>
          <strong>Keyboard shortcuts during review:</strong> Space or Enter to reveal · 1 = Again · 2 = Hard · 3 = Good · 4 = Easy
        </p>
      </div>
    </div>
  )
}

// ─── Cards View ───────────────────────────────────────────────────────────────
function CardsView({ cards, onUpdateCards, decks, onAddDeck, onExport, onImport, settings, onAddCards }) {
  const [showForm,    setShowForm]    = useState(false)
  const [filterDeck,  setFilterDeck]  = useState("all")
  const [filterSt,    setFilterSt]    = useState("active")
  const [expanded,    setExpanded]    = useState(null)
  const [editCard,    setEditCard]    = useState(null)
  const [search,      setSearch]      = useState("")
  const [activeTab,   setActiveTab]   = useState("browse")
  const [form,        setForm]        = useState({ front: "", back: "", contentType: "Factual", deck: (decks || DECK_LIST)[0], elaboration: "" })
  const [newDeckInput, setNewDeckInput] = useState("")
  const [showDeckForm, setShowDeckForm] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const importRef = useRef(null)

  const leechThreshold = (settings || {}).leechThreshold || 5
  const isLeech    = c => (c.lapses || 0) >= leechThreshold
  const isArchived = c => c.status === "Archived" || c.status === "Parked"

  const filtered = cards
    .filter(c => filterDeck === "all" || c.deck === filterDeck)
    .filter(c => {
      if (filterSt === "active")   return !isArchived(c)
      if (filterSt === "archived") return isArchived(c)
      if (filterSt === "leeches")  return isActive(c) && isLeech(c)
      return true
    })
    .filter(c => !search.trim() || c.front.toLowerCase().includes(search.toLowerCase()) || (c.back || "").toLowerCase().includes(search.toLowerCase()))

  const handleAdd = async () => {
    if (!form.front.trim() || !form.back.trim()) return
    const card = { ...form, id: genId(), status: "Active", nextReview: null, interval: 1, reviewCount: 0, createdAt: new Date().toISOString() }
    await onUpdateCards([...cards, card])
    setForm({ front: "", back: "", contentType: "Factual", deck: (decks || DECK_LIST)[0], elaboration: "" })
    setShowForm(false)
  }

  const handleArchive = async (id, e) => {
    e.stopPropagation()
    await onUpdateCards(cards.map(c => c.id === id ? { ...c, status: isArchived(c) ? "Active" : "Archived" } : c))
  }

  const activeCount = cards.filter(c => !isArchived(c)).length
  const leechCount  = cards.filter(c => isActive(c) && isLeech(c)).length
  const needsElab   = NEEDS_ELAB.includes(form.contentType)
  const canAdd      = form.front.trim() && form.back.trim()

  return (
    <div className="rapp-wrap rapp-fadein">
      {editCard && <EditModal card={editCard} cards={cards} onUpdateCards={onUpdateCards} decks={decks} onClose={() => setEditCard(null)} />}

      <div className="rapp-row rapp-sb rapp-mb16">
        <div>
          <div className="rapp-pg-title">Cards</div>
          <div className="rapp-pg-sub rapp-row" style={{ gap: 8, marginTop: 4 }}>
            <span>{activeCount} active · {cards.length} total</span>
            {leechCount > 0 && <span className="rapp-leech">{leechCount} leech{leechCount !== 1 ? "es" : ""}</span>}
          </div>
        </div>
        <div className="rapp-row rapp-gap8">
          <button className="rapp-btn rapp-btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }}
            onClick={() => setActiveTab(t => t === "generate" ? "browse" : "generate")}>
            {activeTab === "generate" ? "← Browse" : <>{Ico.spark(13)} Generate</>}
          </button>
          {activeTab === "browse" && (
            <button className="rapp-btn rapp-btn-primary" style={{ padding: "8px 14px", fontSize: 13 }}
              onClick={() => setShowForm(v => !v)}>
              {showForm ? "Cancel" : <>{Ico.plus(13)} Add</>}
            </button>
          )}
        </div>
      </div>

      {activeTab === "generate" && (
        <div className="rapp-fadein">
          <AIGeneratePanel decks={decks} onAddCards={onAddCards} />
        </div>
      )}

      {activeTab === "browse" && (
        <>
          {showForm && (
            <div className="rapp-card rapp-mb20 rapp-fadein">
              <div className="rapp-sec-title">New card</div>
              <div className="rapp-grid2 rapp-mb8">
                <div>
                  <label className="rapp-label">Content type</label>
                  <select className="rapp-select" value={form.contentType} onChange={e => setForm(f => ({ ...f, contentType: e.target.value }))}>
                    {CONTENT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="rapp-label">Deck</label>
                  <select className="rapp-select" value={form.deck} onChange={e => setForm(f => ({ ...f, deck: e.target.value }))}>
                    {(decks || DECK_LIST).map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              {TYPE_HELP[form.contentType] && (
                <p style={{ fontSize: 12, color: C.textMut, marginBottom: 14, lineHeight: 1.6, fontStyle: "italic" }}>{TYPE_HELP[form.contentType]}</p>
              )}
              <div className="rapp-mb12">
                <label className="rapp-label">Front — question or prompt</label>
                <textarea className="rapp-textarea" rows={3} value={form.front} onChange={e => setForm(f => ({ ...f, front: e.target.value }))} placeholder="Phrase as a question that forces retrieval." />
              </div>
              <div className={needsElab ? "rapp-mb12" : "rapp-mb16"}>
                <label className="rapp-label">Back — answer</label>
                <textarea className="rapp-textarea" rows={3} value={form.back} onChange={e => setForm(f => ({ ...f, back: e.target.value }))} placeholder="Keep this concise and atomic — one idea only." />
              </div>
              {needsElab && (
                <div className="rapp-mb16">
                  <label className="rapp-label">Elaboration — why is this true? (optional)</label>
                  <textarea className="rapp-textarea" rows={2} value={form.elaboration} onChange={e => setForm(f => ({ ...f, elaboration: e.target.value }))} placeholder="One sentence in your own words explaining the mechanism." />
                </div>
              )}
              <button className="rapp-btn rapp-btn-primary" style={{ width: "100%" }} onClick={handleAdd} disabled={!canAdd}>Add card</button>
            </div>
          )}

          <div className="rapp-mb12">
            <input className="rapp-input" placeholder="Search cards..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="rapp-row rapp-gap8 rapp-mb20">
            <select className="rapp-select rapp-flex1" value={filterDeck} onChange={e => setFilterDeck(e.target.value)}>
              <option value="all">All decks</option>
              {(decks || DECK_LIST).map(d => <option key={d}>{d}</option>)}
            </select>
            <select className="rapp-select" style={{ width: 120 }} value={filterSt} onChange={e => setFilterSt(e.target.value)}>
              <option value="active">Active</option>
              <option value="leeches">Leeches</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            {!showDeckForm ? (
              <button onClick={() => setShowDeckForm(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.textMut, fontFamily: "inherit", padding: "4px 0" }}>
                + Add custom deck
              </button>
            ) : (
              <div className="rapp-fadein" style={{ display: "flex", gap: 8 }}>
                <input className="rapp-input rapp-flex1" value={newDeckInput} onChange={e => setNewDeckInput(e.target.value)} placeholder="New deck name..."
                  onKeyDown={e => { if (e.key === "Enter" && newDeckInput.trim()) { onAddDeck(newDeckInput); setNewDeckInput(""); setShowDeckForm(false) }}} autoFocus />
                <button className="rapp-btn rapp-btn-primary" style={{ padding: "9px 14px", fontSize: 13 }}
                  onClick={() => { if (newDeckInput.trim()) { onAddDeck(newDeckInput); setNewDeckInput(""); setShowDeckForm(false) }}}>Add</button>
                <button className="rapp-btn rapp-btn-ghost" style={{ padding: "9px 12px", fontSize: 13 }}
                  onClick={() => { setShowDeckForm(false); setNewDeckInput("") }}>✕</button>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="rapp-empty">{search ? "No cards match that search." : "No cards match this filter."}</div>
          ) : (
            <div className="rapp-col" style={{ gap: 10 }}>
              {filtered.map(c => (
                <div key={c.id} className="rapp-card-item" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                  <div className="rapp-row rapp-sb" style={{ gap: 10 }}>
                    <p className="rapp-card-item-q" style={{ flex: 1 }}>{c.front}</p>
                    <div className="rapp-row rapp-gap8" style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setEditCard(c)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.textMut, padding: "8px 6px", fontFamily: "inherit" }}>Edit</button>
                      <button onClick={e => handleArchive(c.id, e)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.textMut, padding: "8px 6px", fontFamily: "inherit" }}>
                        {isArchived(c) ? "Unarchive" : "Archive"}
                      </button>
                      {Ico.chevron(15, expanded === c.id)}
                    </div>
                  </div>
                  <div className="rapp-row rapp-mt8" style={{ gap: 8, flexWrap: "wrap" }}>
                    {c.contentType && <Badge type={c.contentType} />}
                    <span className="rapp-ts">{c.deck}</span>
                    {c.nextReview  && <span className="rapp-ts">· Due {c.nextReview}</span>}
                    {!c.nextReview && !isArchived(c) && <span style={{ fontSize: 12, color: C.accent, fontWeight: 500 }}>· New</span>}
                    {isArchived(c) && <span style={{ fontSize: 12, color: C.textMut }}>· Archived</span>}
                    {isActive(c) && isLeech(c) && <span className="rapp-leech">leech</span>}
                    {c.stability   && <span style={{ fontSize: 11, color: "#CFBFB0" }}>S{Math.round(c.stability)}d</span>}
                  </div>
                  {expanded === c.id && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }} className="rapp-fadein">
                      <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{c.back}</p>
                      {c.elaboration && <p style={{ marginTop: 10, fontSize: 13, color: C.textMut, fontStyle: "italic", lineHeight: 1.65 }}>↳ {c.elaboration}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
            <div className="rapp-sec-title" style={{ marginBottom: 12 }}>Data</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="rapp-btn rapp-btn-ghost" style={{ padding: "9px 16px", fontSize: 13 }} onClick={onExport}>Export backup</button>
              <button className="rapp-btn rapp-btn-ghost" style={{ padding: "9px 16px", fontSize: 13 }} onClick={() => importRef.current?.click()}>Import backup</button>
              <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={e => { onImport(e.target.files[0], r => setImportResult(r)); e.target.value = "" }} />
            </div>
            {importResult && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, fontSize: 13, background: importResult.ok ? "#EEF6EF" : "#FBF0EE", color: importResult.ok ? "#527A5F" : C.again, border: `1px solid ${importResult.ok ? "#C4DFCA" : "#EFCFCC"}` }}>
                {importResult.ok ? `✓ Imported ${importResult.count} cards` : `✗ ${importResult.msg}`}
              </div>
            )}
            <p style={{ fontSize: 11.5, color: C.textMut, marginTop: 10, lineHeight: 1.65 }}>Export saves all cards, session log, and custom decks as JSON. Import replaces current data.</p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Log View ─────────────────────────────────────────────────────────────────
function LogView({ log, cards, leechThreshold = 5 }) {
  const totalReviewed = log.reduce((s, e) => s + (e.reviewed || 0) + (e.newAdded || 0), 0)
  const totalFailed   = log.reduce((s, e) => s + (e.failed   || 0), 0)
  const retention     = totalReviewed > 0 ? Math.round(((totalReviewed - totalFailed) / totalReviewed) * 100) : null
  const matureCards   = (cards || []).filter(c => isActive(c) && (c.stability || 0) >= 21 && (c.reviewCount || 0) >= 3).length
  const leechCards    = (cards || []).filter(c => isActive(c) && (c.lapses || 0) >= leechThreshold).length
  const typeStats     = CONTENT_TYPES.reduce((acc, t) => { acc[t] = (cards || []).filter(c => c.contentType === t && isActive(c)).length; return acc }, {})

  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb24">
        <div className="rapp-pg-title">Session log</div>
        <div className="rapp-pg-sub">{log.length} session{log.length !== 1 ? "s" : ""} recorded</div>
      </div>

      {retention !== null && (
        <div className="rapp-card rapp-mb20">
          <div className="rapp-sec-title">Overall stats</div>
          <div className="rapp-stat-row">
            <div className="rapp-stat-box"><div className="rapp-stat-num" style={{ color: retention >= 80 ? C.accent : retention >= 60 ? C.warm : C.again }}>{retention}%</div><div className="rapp-stat-lbl">Retention</div></div>
            <div className="rapp-stat-box"><div className="rapp-stat-num">{totalReviewed}</div><div className="rapp-stat-lbl">Total reviews</div></div>
            <div className="rapp-stat-box"><div className="rapp-stat-num" style={{ color: C.accent }}>{matureCards}</div><div className="rapp-stat-lbl">Mature cards</div></div>
          </div>
          {leechCards > 0 && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#FBF0EE", border: "1px solid #EFCFCC" }}>
              <span style={{ fontSize: 13, color: C.again, fontWeight: 500 }}>{leechCards} leech{leechCards !== 1 ? "es" : ""} detected</span>
              <span style={{ fontSize: 12, color: C.textMut }}> · Cards failing {leechThreshold}+ times. Review in the Cards tab and consider rewriting or splitting them.</span>
            </div>
          )}
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(typeStats).filter(([,v]) => v > 0).map(([t, v]) => {
              const tc = TAG_COLORS[t] || { bg: "#F0EDE3", text: "#8A7050" }
              return <span key={t} style={{ background: tc.bg, color: tc.text, padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500 }}>{t} · {v}</span>
            })}
          </div>
        </div>
      )}

      {log.length === 0 ? (
        <div className="rapp-empty">No sessions logged yet. Complete your first session to see it here.</div>
      ) : (
        <div className="rapp-col" style={{ gap: 12 }}>
          {log.map((entry, i) => (
            <div key={i} className="rapp-card">
              <div className="rapp-row rapp-sb rapp-mb14">
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {new Date(entry.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <span className="rapp-ts">{new Date(entry.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="rapp-row" style={{ gap: 24 }}>
                <div><div style={{ fontSize: 22, fontWeight: 700 }}>{entry.reviewed}</div><div className="rapp-ts">reviewed</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 700, color: entry.failed > 0 ? C.again : C.textMut }}>{entry.failed}</div><div className="rapp-ts">failed</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 700, color: C.accent }}>{entry.newAdded}</div><div className="rapp-ts">new</div></div>
              </div>
              {entry.frictionNote && (
                <p style={{ marginTop: 14, fontSize: 13, color: C.textMut, fontStyle: "italic", lineHeight: 1.65, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                  "{entry.frictionNote}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Onboarding Overlay ───────────────────────────────────────────────────────
const ONBOARDING = [
  { title: "How Recall works", icon: "01", body: "Each card has a question on the front and an answer on the back. During a session you attempt to recall the answer from memory — no peeking — then reveal it and rate how well you did." },
  { title: "Rating your recall", icon: "02", body: "After revealing the back, rate yourself honestly: Again (blank recall), Hard (major gaps), Good (correct with effort), or Easy (instant). Honest ratings make the system work." },
  { title: "Sessions and scheduling", icon: "03", body: "Every session has three phases: warm-up review of due cards, introduction of new cards (up to 5 per session), and a brief close log. The FSRS v4 algorithm schedules each card at the optimal interval for long-term retention." },
]

function OnboardingOverlay({ onDone }) {
  const [step, setStep] = useState(0)
  const s      = ONBOARDING[step]
  const isLast = step === ONBOARDING.length - 1

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(44,40,37,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#FDFAF5", borderRadius: 22, padding: "36px 30px 28px", maxWidth: 400, width: "100%" }} className="rapp-fadein">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EEF6EF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#6A9D79", flexShrink: 0 }}>{s.icon}</div>
          <div className="rapp-ob-dots">
            {ONBOARDING.map((_, i) => <div key={i} className={`rapp-ob-dot ${i === step ? "active" : "inactive"}`} />)}
          </div>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#2C2825", marginBottom: 12, letterSpacing: "-0.4px", lineHeight: 1.3 }}>{s.title}</h2>
        <p style={{ fontSize: 14, color: "#796D65", lineHeight: 1.75, marginBottom: 28 }}>{s.body}</p>
        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid #E6DDD2", background: "transparent", color: "#796D65", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
          )}
          <button onClick={() => isLast ? onDone() : setStep(s => s + 1)} style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "#6A9D79", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            {isLast ? "Get started" : "Next"}
          </button>
        </div>
        <button onClick={onDone} style={{ display: "block", margin: "16px auto 0", background: "none", border: "none", fontSize: 12, color: "#ADA59C", cursor: "pointer", fontFamily: "inherit" }}>Skip introduction</button>
      </div>
    </div>
  )
}

// ─── Root Component ───────────────────────────────────────────────────────────
export default function Home() {
  const [view,        setView]        = useState("home")
  const [cards,       setCards]       = useState([])
  const [log,         setLog]         = useState([])
  const [decks,       setDecks]       = useState(DECK_LIST)
  const [settings,    setSettings]    = useState({ newCardCap: 5, leechThreshold: 5 })
  const [ready,       setReady]       = useState(false)
  const [showOnboard, setShowOnboard] = useState(false)
  const pendingCards  = useRef(null)
  const saveTimer     = useRef(null)

  // ── Initial load from Base44 ────────────────────────────────────────────────
  useEffect(() => {
    storage.loadAll()
      .then(({ cards: remoteCards, deckNames, log: remoteLog }) => {
        setCards(remoteCards)
        setLog(remoteLog)
        // Merge default deck list with any remote-only decks
        const merged = [...new Set([...DECK_LIST, ...deckNames])]
        setDecks(merged)
        const s = settingsGet(null)
        if (s) setSettings(s)
        if (!onboardedGet()) setShowOnboard(true)
        setReady(true)
      })
      .catch(() => {
        // Fallback: start empty if Base44 is unreachable
        if (!onboardedGet()) setShowOnboard(true)
        setReady(true)
      })
  }, [])

  // ── Card writes — debounced 800ms so rapid session reviews batch ─────────────
  const updateCards = (updated) => {
    setCards(updated)
    pendingCards.current = updated
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (pendingCards.current) storage.syncCards(pendingCards.current).catch(console.error)
    }, 800)
  }

  const flushCards = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (pendingCards.current) await storage.syncCards(pendingCards.current)
  }

  // ── Log ─────────────────────────────────────────────────────────────────────
  const addLog = async (entry) => {
    setLog(l => [entry, ...l])
    await storage.appendLog(entry)
  }

  // ── Onboarding ───────────────────────────────────────────────────────────────
  const doneOnboard = () => { setShowOnboard(false); onboardedSet() }

  // ── Settings (local only) ────────────────────────────────────────────────────
  const updateSettings = (s) => { setSettings(s); settingsSet(s) }

  // ── Bulk card add (from AI generate) ────────────────────────────────────────
  const addCards = (newCards) => {
    const updated = [...cards, ...newCards]
    updateCards(updated)
  }

  // ── Deck management ──────────────────────────────────────────────────────────
  const addDeck = async (name) => {
    const t = name.trim()
    if (!t || decks.includes(t)) return
    setDecks(d => [...d, t])
    await storage.ensureDeck(t)
  }

  // ── Export / Import ──────────────────────────────────────────────────────────
  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), cards, log, decks }, null, 2)], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = `recall-backup-${localDateStr()}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (file, onResult) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.cards || !Array.isArray(data.cards)) throw new Error("Invalid format — no cards array found")
        // Push imported cards to Base44 (full replace via sync)
        setCards(data.cards)
        pendingCards.current = data.cards
        await storage.syncCards(data.cards)
        if (data.log && Array.isArray(data.log)) setLog(data.log)
        if (data.decks && Array.isArray(data.decks)) {
          const merged = [...new Set([...DECK_LIST, ...data.decks])]
          setDecks(merged)
          await Promise.all(data.decks.map(storage.ensureDeck))
        }
        onResult({ ok: true, count: data.cards.length })
      } catch (err) {
        onResult({ ok: false, msg: err.message })
      }
    }
    reader.readAsText(file)
  }

  const due      = useMemo(() => getDue(cards),  [cards])
  const newAvail = useMemo(() => getNew(cards),  [cards])
  const forecast = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i)
    const ds    = localDateStr(d)
    const count = cards.filter(c => isActive(c) && c.nextReview === ds).length
    const label = i === 0 ? "Today" : i === 1 ? "Tmrw" : d.toLocaleDateString("en-GB", { weekday: "short" })
    return { label, count, isToday: i === 0 }
  }), [cards])

  const nav = [
    { id: "home",     label: "Home",     icon: Ico.home  },
    { id: "session",  label: "Study",    icon: Ico.study },
    { id: "cards",    label: "Cards",    icon: Ico.cards },
    { id: "log",      label: "Log",      icon: Ico.log   },
    { id: "settings", label: "Settings", icon: Ico.gear  },
  ]

  if (!ready) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, color: C.textMut, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", fontSize: 14 }}>
      Loading...
    </div>
  )

  return (
    <>
      <style>{CSS}</style>
      <div className="rapp">
        {showOnboard && <OnboardingOverlay onDone={doneOnboard} />}

        <div className="rapp-sidebar">
          <div className="rapp-logo"><div className="rapp-logo-dot" />Recall</div>
          {nav.map(n => (
            <div key={n.id} className={`rapp-nav-item${view === n.id ? " active" : ""}`} onClick={() => setView(n.id)}>
              {n.icon(17)}<span>{n.label}</span>
              {n.id === "session" && due.length > 0 && <span className="rapp-nav-badge">{due.length}</span>}
            </div>
          ))}
        </div>

        <div className="rapp-main">
          {view === "home"     && <HomeView     due={due} newAvail={newAvail} log={log} onStart={() => setView("session")} totalCards={cards.length} forecast={forecast} />}
          {view === "session"  && <SessionView  cards={cards} onUpdateCards={updateCards} onSaveLog={async e => { await flushCards(); await addLog(e) }} onDone={() => setView("home")} newCardCap={settings.newCardCap} />}
          {view === "cards"    && <CardsView    cards={cards} onUpdateCards={updateCards} decks={decks} onAddDeck={addDeck} onExport={handleExport} onImport={handleImport} settings={settings} onAddCards={addCards} />}
          {view === "log"      && <LogView      log={log} cards={cards} leechThreshold={settings.leechThreshold} />}
          {view === "settings" && <SettingsView settings={settings} onUpdateSettings={updateSettings} />}
        </div>

        <div className="rapp-bnav">
          {nav.map(n => (
            <div key={n.id} className={`rapp-bnav-item${view === n.id ? " active" : ""}`} onClick={() => setView(n.id)}>
              <div style={{ position: "relative", display: "inline-flex" }}>
                {n.icon(22)}
                {n.id === "session" && due.length > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -6, width: 8, height: 8, background: "#C06E6A", borderRadius: "50%", border: "1.5px solid #FDFAF5" }} />
                )}
              </div>
              <span>{n.label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
