import { useState, useEffect, useMemo, useRef } from "react"
import * as storage from "@/api/storage"
import { getDue, getDueWithCatchup, getNew } from "@/lib/fsrs"
import { localDateStr, genId } from "@/lib/dates"
import { createClozeCards } from "@/lib/cloze"
import { createOcclusionCards } from "@/lib/occlusion"
import { settingsGet, settingsSet, deckMetaGet, deckMetaSet, lastSyncGet, lastSyncSet, RETURN_ONBOARD_KEY } from "@/lib/settings"
import { fitSchedulerParams } from "@/lib/fit-params"
import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import * as offlineStore from "@/lib/offline-store"
import { isInstallable, triggerInstallPrompt } from "@/lib/pwa"
import { OnboardingView } from "@/views/OnboardingView"
import { LibraryView } from "@/views/LibraryView"
import { DeckView } from "@/views/DeckView"
import { StudySelectView } from "@/views/StudySelectView"
import { SessionView } from "@/views/SessionView"
import { FreeStudyView } from "@/views/FreeStudyView"
import { StatsView } from "@/views/StatsView"
import { SettingsView } from "@/views/SettingsView"
import { ReturnOnboardingCard } from "@/views/ReturnOnboardingCard"




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