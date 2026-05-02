/**
 * FSRS regression baseline (updated 2026-05-02 for ts-fsrs v5).
 *
 * Purpose: any future change to the scheduler that alters numeric outputs
 * will fail this suite, signalling a behaviour drift that must be reviewed.
 *
 * Expected values were captured by running scheduleFSRS against ts-fsrs 5.x
 * with a fixed NOW of 2026-01-15T09:00:00.000Z.
 * Do NOT update these values unless you have confirmed the change is intentional
 * AND have manually verified the new outputs against the FSRS-5 spec.
 */
import { describe, it, expect } from 'vitest'
import { scheduleFSRS } from '../fsrs.js'

const NOW = new Date('2026-01-15T09:00:00.000Z')

// ── Card factories ───────────────────────────────────────────────────────────
const newCard = (o = {}) => ({
  stability: null, difficulty: null, interval: 0,
  reviewCount: 0, lapses: 0, nextReview: null, lastReview: null,
  status: 'Active', ...o,
})
const reviewedCard = (o = {}) => ({
  stability: 4.5, difficulty: 5.5, interval: 5,
  reviewCount: 3, lapses: 0,
  nextReview: '2026-01-15', lastReview: '2026-01-10',
  status: 'Active', ...o,
})
const matureCard = (o = {}) => ({
  stability: 28, difficulty: 5.0, interval: 30,
  reviewCount: 12, lapses: 0,
  nextReview: '2026-01-15', lastReview: '2025-12-16',
  status: 'Active', ...o,
})
const lapsedCard = (o = {}) => ({
  stability: 2.1, difficulty: 7.8, interval: 3,
  reviewCount: 8, lapses: 5,
  nextReview: '2026-01-15', lastReview: '2026-01-12',
  status: 'Active', ...o,
})
const CUSTOM_W = [0.5,1.0,3.5,16.0,7.0,0.5,1.1,0.06,1.6,0.15,1.0,2.0,0.12,0.30,2.3,0.26,3.0]

// ── Helper ───────────────────────────────────────────────────────────────────
const check = (card, rating, retention, params, expected) => {
  const got = scheduleFSRS(card, rating, retention, params, NOW)
  expect(got.interval).toBe(expected.interval)
  expect(got.stability).toBeCloseTo(expected.stability, 4)
  expect(got.difficulty).toBeCloseTo(expected.difficulty, 4)
}

describe('FSRS regression baseline', () => {
  describe('new card -- all four ratings', () => {
    it('again', () => check(newCard(), 'again', 0.9, null,
      { stability: 0.212, difficulty: 6.4133, interval: 1 }))
    it('hard',  () => check(newCard(), 'hard',  0.9, null,
      { stability: 1.2931, difficulty: 5.11217071, interval: 1 }))
    it('good',  () => check(newCard(), 'good',  0.9, null,
      { stability: 2.3065, difficulty: 2.11810397, interval: 1 }))
    it('easy',  () => check(newCard(), 'easy',  0.9, null,
      { stability: 8.2956, difficulty: 1, interval: 8 }))
  })

  describe('young reviewed card (interval=5, reviewCount=3) -- all four ratings', () => {
    it('again', () => check(reviewedCard(), 'again', 0.9, null,
      { stability: 0.9018031, difficulty: 8.50610897, interval: 1 }))
    it('hard',  () => check(reviewedCard(), 'hard',  0.9, null,
      { stability: 11.22379753, difficulty: 6.99791867, interval: 11 }))
    it('good',  () => check(reviewedCard(), 'good',  0.9, null,
      { stability: 15.68024198, difficulty: 5.48972837, interval: 16 }))
    it('easy',  () => check(reviewedCard(), 'easy',  0.9, null,
      { stability: 25.43947521, difficulty: 3.98153807, interval: 25 }))
  })

  describe('mature card (interval=30, reviewCount=12) -- all four ratings', () => {
    it('again', () => check(matureCard(), 'again', 0.9, null,
      { stability: 2.27401015, difficulty: 8.34176237, interval: 1 }))
    it('hard',  () => check(matureCard(), 'hard',  0.9, null,
      { stability: 60.8109308, difficulty: 6.66599536, interval: 61 }))
    it('good',  () => check(matureCard(), 'good',  0.9, null,
      { stability: 82.55758364, difficulty: 4.99022837, interval: 83 }))
    it('easy',  () => check(matureCard(), 'easy',  0.9, null,
      { stability: 130.1808984, difficulty: 3.31446137, interval: 130 }))
  })

  describe('high lapse count card (lapses=5) -- all four ratings', () => {
    it('again', () => check(lapsedCard(), 'again', 0.9, null,
      { stability: 0.55786378, difficulty: 9.26210333, interval: 1 }))
    it('hard',  () => check(lapsedCard(), 'hard',  0.9, null,
      { stability: 4.55641389, difficulty: 8.52476585, interval: 5 }))
    it('good',  () => check(lapsedCard(), 'good',  0.9, null,
      { stability: 6.18449266, difficulty: 7.78742837, interval: 6 }))
    it('easy',  () => check(lapsedCard(), 'easy',  0.9, null,
      { stability: 9.74984631, difficulty: 7.05009088, interval: 10 }))
  })

  describe('retention target 0.70 (minimum boundary)', () => {
    it('new card good',    () => check(newCard(),      'good', 0.70, null,
      { stability: 2.3065, difficulty: 2.11810397, interval: 1 }))
    it('young card good',  () => check(reviewedCard(), 'good', 0.70, null,
      { stability: 15.68024198, difficulty: 5.48972837, interval: 146 }))
    it('mature card good', () => check(matureCard(),   'good', 0.70, null,
      { stability: 82.55758364, difficulty: 4.99022837, interval: 767 }))
    it('lapsed card good', () => check(lapsedCard(),   'good', 0.70, null,
      { stability: 6.18449266, difficulty: 7.78742837, interval: 57 }))
  })

  describe('retention target 0.97 (maximum boundary)', () => {
    it('new card good',    () => check(newCard(),      'good', 0.97, null,
      { stability: 2.3065, difficulty: 2.11810397, interval: 1 }))
    it('young card good',  () => check(reviewedCard(), 'good', 0.97, null,
      { stability: 15.68024198, difficulty: 5.48972837, interval: 4 }))
    it('mature card good', () => check(matureCard(),   'good', 0.97, null,
      { stability: 82.55758364, difficulty: 4.99022837, interval: 18 }))
    it('lapsed card good', () => check(lapsedCard(),   'good', 0.97, null,
      { stability: 6.18449266, difficulty: 7.78742837, interval: 2 }))
  })

  describe('high stability card (stability=120, reviewCount=30)', () => {
    const card = newCard({ stability: 120, difficulty: 3, interval: 90, reviewCount: 30, lastReview: '2025-10-17' })
    it('again', () => check(card, 'again', 0.9, null,
      { stability: 4.01000006, difficulty: 7.68437596, interval: 1 }))
    it('good',  () => check(card, 'good',  0.9, null,
      { stability: 308.39690386, difficulty: 2.99222837, interval: 308 }))
  })

  describe('reviewCount=1 boundary', () => {
    const card = newCard({ stability: 1.5, difficulty: 5, interval: 1, reviewCount: 1, lapses: 0,
      nextReview: '2026-01-15', lastReview: '2026-01-14' })
    it('again', () => check(card, 'again', 0.9, null,
      { stability: 0.41397202, difficulty: 8.34176237, interval: 1 }))
    it('good',  () => check(card, 'good',  0.9, null,
      { stability: 4.84757417, difficulty: 4.99022837, interval: 5 }))
  })

  describe('zero elapsed days (reviewed today)', () => {
    const card = newCard({ stability: 4, difficulty: 5, interval: 4, reviewCount: 5,
      lapses: 0, nextReview: '2026-01-15', lastReview: '2026-01-15' })
    it('good', () => check(card, 'good', 0.9, null,
      { stability: 4, difficulty: 4.99022837, interval: 5 }))
    it('easy', () => check(card, 'easy', 0.9, null,
      { stability: 6.59988479, difficulty: 3.31446137, interval: 7 }))
  })

  describe('cards near desired retention boundary (various lapse counts)', () => {
    it('mature lapses=1 good', () => check(matureCard({ lapses: 1 }), 'good', 0.9, null,
      { stability: 82.55758364, difficulty: 4.99022837, interval: 83 }))
    it('mature lapses=2 good', () => check(matureCard({ lapses: 2 }), 'good', 0.9, null,
      { stability: 82.55758364, difficulty: 4.99022837, interval: 83 }))
    it('mature lapses=3 good', () => check(matureCard({ lapses: 3 }), 'good', 0.9, null,
      { stability: 82.55758364, difficulty: 4.99022837, interval: 83 }))
    it('mature lapses=8 again', () => check(matureCard({ lapses: 8 }), 'again', 0.9, null,
      { stability: 2.27401015, difficulty: 8.34176237, interval: 1 }))
    it('mature lapses=8 hard',  () => check(matureCard({ lapses: 8 }), 'hard',  0.9, null,
      { stability: 60.8109308, difficulty: 6.66599536, interval: 61 }))
  })

  describe('custom UserSchedulerParams (17-element w array)', () => {
    it('new good',    () => check(newCard(),      'good',  0.9, CUSTOM_W,
      { stability: 3.5, difficulty: 7.15798427, interval: 1 }))
    it('new easy',    () => check(newCard(),      'easy',  0.9, CUSTOM_W,
      { stability: 16, difficulty: 6.50000003, interval: 16 }))
    it('young good',  () => check(reviewedCard(), 'good',  0.9, CUSTOM_W,
      { stability: 15.80456436, difficulty: 5.56, interval: 16 }))
    it('young again', () => check(reviewedCard(), 'again', 0.9, CUSTOM_W,
      { stability: 1.39950507, difficulty: 7.064, interval: 1 }))
    it('mature good', () => check(matureCard(),   'good',  0.9, CUSTOM_W,
      { stability: 84.47168347, difficulty: 5.09, interval: 84 }))
    it('mature hard', () => check(matureCard(),   'hard',  0.9, CUSTOM_W,
      { stability: 42.6826377, difficulty: 5.92555556, interval: 43 }))
    it('lapsed good', () => check(lapsedCard(),   'good',  0.9, CUSTOM_W,
      { stability: 6.38869263, difficulty: 7.722, interval: 6 }))
    it('lapsed again',() => check(lapsedCard(),   'again', 0.9, CUSTOM_W,
      { stability: 0.86079476, difficulty: 8.45728889, interval: 1 }))
  })

  describe('overdue card (elapsed >> scheduled_days)', () => {
    const card = newCard({ stability: 10, difficulty: 5.5, interval: 10, reviewCount: 6,
      lapses: 0, nextReview: '2025-12-15', lastReview: '2025-12-05' })
    it('good',  () => check(card, 'good',  0.9, null,
      { stability: 56.69701367, difficulty: 5.48972837, interval: 57 }))
    it('again', () => check(card, 'again', 0.9, null,
      { stability: 1.68721104, difficulty: 8.50610897, interval: 1 }))
  })

  describe('initial difficulty ignored for new cards (ts-fsrs resets from rating)', () => {
    it('difficulty=8 good produces same interval as default new card good', () => {
      const r1 = scheduleFSRS(newCard({ difficulty: 8 }), 'good', 0.9, null, NOW)
      const r2 = scheduleFSRS(newCard(), 'good', 0.9, null, NOW)
      expect(r1.interval).toBe(r2.interval)
    })
    it('difficulty=2 good produces same interval as default new card good', () => {
      const r1 = scheduleFSRS(newCard({ difficulty: 2 }), 'good', 0.9, null, NOW)
      const r2 = scheduleFSRS(newCard(), 'good', 0.9, null, NOW)
      expect(r1.interval).toBe(r2.interval)
    })
  })

  describe('structural invariants (must hold across all inputs)', () => {
    const cards = [newCard(), reviewedCard(), matureCard(), lapsedCard()]
    const ratings = ['again', 'hard', 'good', 'easy']
    for (const c of cards) {
      for (const r of ratings) {
        it(`interval >= 1 for ${c.reviewCount === 0 ? 'new' : 'reviewed'} card + ${r}`, () => {
          const result = scheduleFSRS(c, r, 0.9, null, NOW)
          expect(result.interval).toBeGreaterThanOrEqual(1)
        })
        it(`stability > 0 for ${c.reviewCount === 0 ? 'new' : 'reviewed'} card + ${r}`, () => {
          const result = scheduleFSRS(c, r, 0.9, null, NOW)
          expect(result.stability).toBeGreaterThan(0)
        })
      }
    }
  })
})
