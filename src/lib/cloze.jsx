import React from 'react'
import { genId } from '@/lib/dates'

// Anki-compatible cloze syntax: {{c1::answer}}, {{c1::answer::hint}}.
// Reference: Anki manual, apps.ankiweb.net/docs/manual.html
const CLOZE_RE = /\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g

export const parseCloze = (text) => {
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

// Replaces [hint] / [...] tokens with styled blank spans.
export const renderClozeFront = (text) => {
  if (!text) return text
  const parts = text.split(/(\[[^\]]+\])/g)
  return parts.map((part, i) => {
    if (/^\[.+\]$/.test(part)) {
      return <span key={i} className="nid-cloze-blank" style={{ color: 'transparent' }}>{part}</span>
    }
    return part
  })
}

// Pre-computes front/back per cloze index so the existing review machinery works unchanged.
export const createClozeCards = (clozeText, deckName) => {
  const { cards: variants } = parseCloze(clozeText)
  const now = new Date().toISOString()
  return variants.map(v => ({
    id: genId(), front: v.front, back: v.back,
    cardType: 'cloze', clozeText, clozeIndex: v.index,
    deck: deckName, contentType: 'Factual', status: 'Active',
    interval: 1, reviewCount: 0, lapses: 0, ratingHistory: [],
    connects_to: [], stability: null, difficulty: null,
    nextReview: null, lastReview: null, elaboration: '',
    anchor: null, source: null, stakes_flag: false,
    prerequisite_card_id: null, tags: [], createdAt: now,
    imageUrl: null, occlusionRegions: null, occlusionRegionId: null,
  }))
}
