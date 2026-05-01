/**
 * Integration tests for the FSRS handler state transformation.
 * Exercises the same logic that handleRate() in SessionView.jsx performs:
 * call scheduleFSRS → build newState → assert fields.
 */

import { describe, it, expect } from 'vitest'
import { scheduleFSRS } from '@/lib/fsrs'
import { localDateStr } from '@/lib/dates'

// ── Types ─────────────────────────────────────────────────────────────────────

type Card = {
  stability:     number | null
  difficulty:    number | null
  interval:      number
  reviewCount:   number
  lapses:        number
  nextReview:    string | null
  lastReview:    string | null
  ratingHistory: Array<{ date: string; rating: string }>
  status:        string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCard(): Card {
  return {
    stability:     null,
    difficulty:    null,
    interval:      0,
    reviewCount:   0,
    lapses:        0,
    nextReview:    null,
    lastReview:    null,
    ratingHistory: [],
    status:        'Active',
  }
}

/**
 * Mirrors handleRate() logic in SessionView.jsx.
 * Accepts a fixed `now` for deterministic testing.
 */
function applyRating(card: Card, rating: string, now = new Date()): Card {
  const { stability, difficulty, interval } = scheduleFSRS(card, rating, 0.9, null, now)
  const newEntry = { date: now.toISOString(), rating }
  return {
    ...card,
    stability,
    difficulty,
    interval,
    nextReview:    localDateStr(new Date(now.getTime() + interval * 86_400_000)),
    lastReview:    localDateStr(now),
    reviewCount:   (card.reviewCount  || 0) + 1,
    lapses:        rating === 'again' ? (card.lapses || 0) + 1 : (card.lapses || 0),
    ratingHistory: [...(card.ratingHistory || []), newEntry].slice(-50),
  }
}

const BASE = new Date('2026-03-01T09:00:00.000Z')
const D = 86_400_000 // one day in ms

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FSRS integration — handleRate state transformations', () => {
  it('again: lapses increments to 1, stability becomes positive', () => {
    const after = applyRating(makeCard(), 'again', BASE)

    expect(after.lapses).toBe(1)
    expect(after.reviewCount).toBe(1)
    expect(after.stability).toBeGreaterThan(0)
    expect(after.lastReview).toBe('2026-03-01')
    expect(after.ratingHistory).toHaveLength(1)
    expect(after.ratingHistory[0].rating).toBe('again')
  })

  it('good after again: stability increases', () => {
    const afterAgain = applyRating(makeCard(), 'again', BASE)
    const afterGood  = applyRating(afterAgain,  'good',  new Date(BASE.getTime() + D))

    expect(afterGood.stability!).toBeGreaterThan(afterAgain.stability!)
    expect(afterGood.lapses).toBe(1)        // unchanged — not "again"
    expect(afterGood.reviewCount).toBe(2)
    expect(afterGood.ratingHistory).toHaveLength(2)
    expect(afterGood.ratingHistory[1].rating).toBe('good')
  })

  it('easy twice: interval and stability grow each time', () => {
    let c = applyRating(makeCard(), 'again', BASE)
    c     = applyRating(c, 'good',  new Date(BASE.getTime() + D))
    const c3 = applyRating(c,  'easy', new Date(BASE.getTime() + 2 * D))
    const c4 = applyRating(c3, 'easy', new Date(BASE.getTime() + (2 + c3.interval) * D))

    expect(c4.interval).toBeGreaterThan(c3.interval)
    expect(c4.stability!).toBeGreaterThan(c3.stability!)
  })

  it('ratingHistory accumulates four entries in order with ISO dates', () => {
    let c = applyRating(makeCard(), 'again', BASE)
    c     = applyRating(c, 'good',  new Date(BASE.getTime() + D))
    c     = applyRating(c, 'easy',  new Date(BASE.getTime() + 2 * D))
    c     = applyRating(c, 'easy',  new Date(BASE.getTime() + (2 + c.interval) * D))

    expect(c.ratingHistory).toHaveLength(4)
    expect(c.ratingHistory.map(e => e.rating)).toEqual(['again', 'good', 'easy', 'easy'])
    for (const entry of c.ratingHistory) {
      expect(new Date(entry.date).toISOString()).toBe(entry.date)
    }
  })

  it('lapses only increments on again, not on hard/good/easy', () => {
    let c = applyRating(makeCard(), 'again', BASE)            // lapses=1
    c     = applyRating(c, 'good',  new Date(BASE.getTime() + D))
    c     = applyRating(c, 'hard',  new Date(BASE.getTime() + 2 * D))
    c     = applyRating(c, 'easy',  new Date(BASE.getTime() + 3 * D))

    expect(c.lapses).toBe(1)
  })

  it('ratingHistory is capped at 50 entries', () => {
    let c: Card = makeCard()
    for (let i = 0; i < 55; i++) {
      c = applyRating(c, 'good', new Date(BASE.getTime() + i * D))
    }
    expect(c.ratingHistory.length).toBeLessThanOrEqual(50)
    expect(c.reviewCount).toBe(55)   // reviewCount is unbounded
  })

  it('new card: stability after good is greater than after again', () => {
    const afterAgain = applyRating(makeCard(), 'again', BASE)
    const afterGood  = applyRating(makeCard(), 'good',  BASE)

    expect(afterGood.stability!).toBeGreaterThan(afterAgain.stability!)
  })

  it('all four ratings on a new card produce positive stability and interval >= 1', () => {
    for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
      const after = applyRating(makeCard(), rating, BASE)
      expect(after.stability!).toBeGreaterThan(0)
      expect(after.interval).toBeGreaterThanOrEqual(1)
    }
  })
})
