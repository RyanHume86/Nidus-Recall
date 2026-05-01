// ─── Palette ──────────────────────────────────────────────────────────────────
export const C = {
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

// ─── Field length constants ────────────────────────────────────────────────────
export const FRONT_MAX     = 1500
export const BACK_MAX      = 3000
export const NOTE_MAX      = 5000
export const ANCHOR_MAX    = 600
export const SOURCE_MAX    = 200
export const TAG_MAX_LEN   = 50
export const TAG_MAX_COUNT = 5
