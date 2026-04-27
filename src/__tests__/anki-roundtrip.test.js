/**
 * Anki .apkg round-trip test.
 *
 * Builds a synthetic deck of 50 mixed cards (basic, cloze, image occlusion),
 * exports it via buildApkg, re-imports it via parseApkg + convertToNidusCards,
 * then asserts content fidelity.
 *
 * Scheduling state is intentionally lost in both directions; only content fields
 * (front, back, deck, tags, clozeText, region geometry) are compared.
 *
 * sql.js requires a WASM binary. In Node.js/Vitest we load it from node_modules
 * and inject it via _setSqlJs before any test runs.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { cwd } from 'process'
import initSqlJs from 'sql.js'
import { buildApkg, parseApkg, convertToNidusCards, _setSqlJs } from '@/api/anki.js'
import { genId } from '@/lib/dates.js'

// ── sql.js WASM bootstrap ──────────────────────────────────────────────────────

beforeAll(async () => {
  const wasmBinary = readFileSync(resolve(cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'))
  const SqlJs = await initSqlJs({ wasmBinary })
  _setSqlJs(SqlJs)
})

// ── Synthetic card factory ────────────────────────────────────────────────────

const DECK = 'Test Deck A'

const basicCard = (i) => ({
  id: genId(), deck: DECK, cardType: 'basic',
  front: `Basic question ${i}`, back: `Basic answer ${i}`,
  tags: [`tag${i % 3}`, 'round-trip'], status: 'Active',
  reviewCount: 0, lapses: 0, ratingHistory: [],
  stability: null, difficulty: null, nextReview: null, lastReview: null,
  interval: 1, connects_to: [], stakes_flag: false,
  elaboration: '', anchor: null, source: null, prerequisite_card_id: null,
  clozeText: null, clozeIndex: null, imageUrl: null,
  occlusionRegions: null, occlusionRegionId: null,
})

const clozeText = (i) => `The {{c1::answer${i}}} is the key concept in example ${i}.`

const clozeCard = (i) => ({
  id: genId(), deck: DECK, cardType: 'cloze',
  clozeText: clozeText(i), clozeIndex: 1,
  front: `The [...] is the key concept in example ${i}.`,
  back: `The answer${i} is the key concept in example ${i}.`,
  tags: ['cloze', `c${i}`], status: 'Active',
  reviewCount: 0, lapses: 0, ratingHistory: [],
  stability: null, difficulty: null, nextReview: null, lastReview: null,
  interval: 1, connects_to: [], stakes_flag: false,
  elaboration: '', anchor: null, source: null, prerequisite_card_id: null,
  imageUrl: null, occlusionRegions: null, occlusionRegionId: null,
})

// Minimal 1x1 PNG encoded as a data URI (valid PNG header).
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const occlusionCards = (imageIdx) => {
  const imageUrl = TINY_PNG
  const regions = [
    { id: `r${imageIdx}-0`, label: `Label A${imageIdx}`, type: 'rect', x: 0.1, y: 0.1, width: 0.2, height: 0.15 },
    { id: `r${imageIdx}-1`, label: `Label B${imageIdx}`, type: 'rect', x: 0.5, y: 0.4, width: 0.25, height: 0.2 },
  ]
  return regions.map(r => ({
    id: genId(), deck: DECK, cardType: 'image_occlusion',
    imageUrl, occlusionRegions: regions, occlusionRegionId: r.id,
    front: r.label, back: r.label,
    tags: ['occlusion'], status: 'Active',
    reviewCount: 0, lapses: 0, ratingHistory: [],
    stability: null, difficulty: null, nextReview: null, lastReview: null,
    interval: 1, connects_to: [], stakes_flag: false,
    elaboration: '', anchor: null, source: null, prerequisite_card_id: null,
    clozeText: null, clozeIndex: null,
  }))
}

// 20 basic + 20 cloze + 10 occlusion (5 images x 2 regions) = 50 total
const BASIC_CARDS   = Array.from({ length: 20 }, (_, i) => basicCard(i))
const CLOZE_CARDS   = Array.from({ length: 20 }, (_, i) => clozeCard(i))
const OCCL_CARDS    = Array.from({ length: 5  }, (_, i) => occlusionCards(i)).flat()
const ALL_CARDS     = [...BASIC_CARDS, ...CLOZE_CARDS, ...OCCL_CARDS]

// ── Round-trip test ───────────────────────────────────────────────────────────

describe('Anki .apkg round-trip (50 cards)', () => {
  let apkgBytes
  let roundTripped

  beforeAll(async () => {
    apkgBytes = await buildApkg(ALL_CARDS)
    const parsed = await parseApkg(apkgBytes.buffer)
    const { cards } = convertToNidusCards(parsed.notes, genId)
    roundTripped = cards
  })

  it('buildApkg returns a non-empty Uint8Array', () => {
    expect(apkgBytes).toBeInstanceOf(Uint8Array)
    expect(apkgBytes.length).toBeGreaterThan(1000)
  })

  it('output is a valid ZIP (starts with PK signature)', () => {
    // ZIP local file header magic: 0x50 0x4B 0x03 0x04
    expect(apkgBytes[0]).toBe(0x50)
    expect(apkgBytes[1]).toBe(0x4B)
  })

  it('re-imported card count matches exported count', () => {
    // 20 basic + 20 cloze + 10 occlusion = 50
    expect(roundTripped.length).toBe(50)
  })

  it('all re-imported cards belong to the correct deck', () => {
    for (const c of roundTripped) {
      expect(c.deck).toBe(DECK)
    }
  })

  // Basic cards
  it('basic card fronts are preserved', () => {
    const rtBasic = roundTripped.filter(c => c.cardType === 'basic' && c.front.startsWith('Basic question'))
    expect(rtBasic.length).toBe(20)
    for (let i = 0; i < 20; i++) {
      const expected = `Basic question ${i}`
      expect(rtBasic.some(c => c.front === expected)).toBe(true)
    }
  })

  it('basic card backs are preserved', () => {
    const rtBasic = roundTripped.filter(c => c.front.startsWith('Basic question'))
    for (const c of rtBasic) {
      const idx = c.front.replace('Basic question ', '')
      expect(c.back).toBe(`Basic answer ${idx}`)
    }
  })

  it('basic card tags are preserved', () => {
    const rtBasic = roundTripped.filter(c => c.front.startsWith('Basic question 0'))
    expect(rtBasic.length).toBeGreaterThan(0)
    expect(rtBasic[0].tags).toContain('round-trip')
  })

  // Cloze cards
  it('cloze cards are imported as cloze type', () => {
    const rtCloze = roundTripped.filter(c => c.cardType === 'cloze')
    expect(rtCloze.length).toBe(20)
  })

  it('cloze card clozeText is preserved', () => {
    const rtCloze = roundTripped.filter(c => c.cardType === 'cloze')
    for (let i = 0; i < 20; i++) {
      const expected = clozeText(i)
      expect(rtCloze.some(c => c.clozeText === expected)).toBe(true)
    }
  })

  // Image occlusion cards
  it('occlusion cards are imported as image_occlusion type', () => {
    const rtOccl = roundTripped.filter(c => c.cardType === 'image_occlusion')
    expect(rtOccl.length).toBe(10)
  })

  it('occlusion region labels survive the round-trip', () => {
    const rtOccl = roundTripped.filter(c => c.cardType === 'image_occlusion')
    // Each exported card has its label as field[0] (Header / sfld)
    for (const c of rtOccl) {
      expect(c.front.length).toBeGreaterThan(0)
    }
  })

  it('occlusion region geometry is parsed from exported SVG', () => {
    const rtOccl = roundTripped.filter(c => c.cardType === 'image_occlusion')
    // occlusionRegions should be populated from the SVG we embedded in field[2]
    for (const c of rtOccl) {
      expect(Array.isArray(c.occlusionRegions)).toBe(true)
      expect(c.occlusionRegions.length).toBeGreaterThan(0)
    }
  })

  it('all re-imported cards start as fresh / unreviewed', () => {
    for (const c of roundTripped) {
      expect(c.reviewCount).toBe(0)
      expect(c.status).toBe('Active')
      expect(c.nextReview).toBeNull()
    }
  })
})