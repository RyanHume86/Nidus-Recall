#!/usr/bin/env node
// scripts/check-contrast.js
// WCAG 2.2 contrast ratio checker for Nidus Recall colour tokens.
// Uses only Node.js built-ins. MIT license compatible.
// Run: node scripts/check-contrast.js

// Colour tokens from Home.jsx C object and CSS
const COLORS = {
  // Nidus brand tokens
  nidusSage:      "#8AAD91",
  nidusSageLight: "#6E9275",
  nidusWarm:      "#C89968",
  // Light mode (primary)
  bg:          "#F4F7F5",
  surface:     "#EBF0ED",
  elevated:    "#DFE8E3",
  text:        "#1C2820",
  textSec:     "#3A5246",
  textMut:     "#4A6B5C",
  accent:      "#2D6E52",
  accentDk:    "#5C7A6A",  // --sage light
  teal:        "#2E7B88",
  border:      "#CFDBD5",
  borderMd:    "#BFD0CA",
  // Rating text (light mode)
  again:       "#3D1408",
  hard:        "#352A04",
  good:        "#0E3020",
  easy:        "#0A2A2A",
  // Rating backgrounds (light mode)
  againBg:     "#F5C8B8",
  hardBg:      "#F0E890",
  goodBg:      "#B0E8CC",
  easyBg:      "#A8DEDE",
  // Surfaces
  cardFrontBg: "#EBF0ED",
  cardBackBg:  "#E4EDE8",
  anchorBg:    "#EDE8DC",
  warning:     "#B87A30",
  warningBg:   "#FDF0DC",
  warningText: "#5C3A00",
  // Dark mode sidebar bg (same structure as light for nav)
  darkBg:      "#162018",
  darkSurface: "#1C2820",
  // Slider label text (#DFE8E3 bg)
  labelText:   "#3A5246",
  helperText:  "#7BA090",
}

// Parse hex to [r, g, b] 0-255
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

// WCAG relative luminance
function linearise(c) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b)
}

function contrastRatio(fg, bg) {
  const L1 = luminance(fg)
  const L2 = luminance(bg)
  const lighter = Math.max(L1, L2)
  const darker  = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

// Token pairs to check: [label, fg, bg, threshold, type]
// threshold: 4.5 = AA normal text, 3.0 = AA large/UI
const C = COLORS
const pairs = [
  // Body text on page background
  ["body text on bg",           C.text,       C.bg,       4.5, "body"],
  ["body text on surface",      C.text,       C.surface,  4.5, "body"],
  ["body text on elevated",     C.text,       C.elevated, 4.5, "body"],
  // Secondary text on backgrounds
  ["textSec on bg",             C.textSec,    C.bg,       4.5, "body"],
  ["textSec on surface",        C.textSec,    C.surface,  4.5, "body"],
  ["textSec on elevated",       C.textSec,    C.elevated, 4.5, "body"],
  // Muted text on backgrounds
  ["textMut on bg",             C.textMut,    C.bg,       4.5, "body"],
  ["textMut on surface",        C.textMut,    C.surface,  4.5, "muted"],
  ["textMut on elevated",       C.textMut,    C.elevated, 4.5, "muted"],
  // Sidebar/nav text on sidebar background (sidebar bg = surface)
  ["nav active (accent) on surface", C.accent, C.surface, 4.5, "interactive"],
  ["nav text (textMut) on surface",  C.textMut, C.surface, 3.0, "ui"],
  ["nav text (text) on surface",     C.text,    C.surface, 4.5, "body"],
  // Button text on primary button background
  ["white on accent (primary btn)",  "#FFFFFF", C.accent,  4.5, "interactive"],
  ["white on accentDk (btn hover)",  "#FFFFFF", C.accentDk,4.5, "interactive"],
  // Helper text under sliders (on elevated card bg)
  ["helper text on elevated",   C.textMut,    C.elevated, 4.5, "helper"],
  ["label text on elevated",    C.textSec,    C.elevated, 4.5, "label"],
  // Rating buttons
  ["again text on againBg",     C.again,      C.againBg,  4.5, "rating"],
  ["hard text on hardBg",       C.hard,       C.hardBg,   4.5, "rating"],
  ["good text on goodBg",       C.good,       C.goodBg,   4.5, "rating"],
  ["easy text on easyBg",       C.easy,       C.easyBg,   4.5, "rating"],
  // Warning
  ["warningText on warningBg",  C.warningText,C.warningBg,4.5, "warning"],
  // Accent on bg (for stat numbers, links)
  ["accent on bg",              C.accent,     C.bg,       4.5, "interactive"],
  ["accent on elevated",        C.accent,     C.elevated, 4.5, "interactive"],
  // Nidus brand tokens (decorative/large-text accents — WCAG AA large text 3.0:1)
  ["nidus-sage on bg",          C.nidusSage,      C.bg,      4.5, "muted"],
  ["nidus-sage-light on bg",    C.nidusSageLight, C.bg,      4.5, "muted"],
  ["nidus-warm on bg (large)",  C.nidusWarm,      C.bg,      3.0, "muted"],
  ["nidus-warm on surface (large)", C.nidusWarm,  C.surface, 3.0, "muted"],
]

const COL_W = [38, 9, 9, 7, 8]
const header = [
  "Token pair".padEnd(COL_W[0]),
  "FG".padEnd(COL_W[1]),
  "BG".padEnd(COL_W[2]),
  "Ratio".padEnd(COL_W[3]),
  "AA".padEnd(COL_W[4]),
]
console.log(header.join("  "))
console.log("-".repeat(80))

let failures = []

for (const [label, fg, bg, threshold, type] of pairs) {
  const ratio = contrastRatio(fg, bg)
  const pass  = ratio >= threshold
  const star  = pass ? "PASS" : "FAIL"
  const row = [
    label.padEnd(COL_W[0]),
    fg.padEnd(COL_W[1]),
    bg.padEnd(COL_W[2]),
    ratio.toFixed(2).padEnd(COL_W[3]),
    star.padEnd(COL_W[4]),
  ]
  console.log(row.join("  "))
  if (!pass && (type === "body" || type === "interactive" || type === "label" || type === "rating")) {
    failures.push({ label, fg, bg, ratio, threshold, type })
  }
}

console.log("-".repeat(80))

if (failures.length === 0) {
  console.log("\nAll AA checks passed for interactive and body text.")
  process.exit(0)
} else {
  console.log(`\nAA FAILURES (${failures.length}):`);
  for (const f of failures) {
    console.log(`  FAIL: ${f.label} — ratio ${f.ratio.toFixed(2)} < ${f.threshold} (${f.type})`)
  }
  process.exit(1)
}
