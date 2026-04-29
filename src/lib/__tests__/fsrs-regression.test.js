/**
 * FSRS regression baseline (frozen 2026-04-27).
 *
 * Purpose: any future change to the scheduler that alters numeric outputs
 * will fail this suite, signalling a behaviour drift that must be reviewed.
 *
 * Expected values were captured by running scheduleFSRS against ts-fsrs 4.x
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
      { stability: 0.40255, difficulty: 7.1949, interval: 1 }))
    it('hard',  () => check(newCard(), 'hard',  0.9, null,
      { stability: 1.18385, difficulty: 6.4883, interval: 1 }))
    it('good',  () => check(newCard(), 'good',  0.9, null,
      { stability: 3.173,   difficulty: 5.2824, interval: 1 }))
    it('easy',  () => check(newCard(), 'easy',  0.9, null,
      { stability: 15.69105, difficulty: 3.2245, interval: 16 }))
  })

  describe('young reviewed card (interval=5, reviewCount=3) -- all four ratings', () => {
    it('again', () => check(reviewedCard(), 'again', 0.9, null,
      { stability: 1.35288839, difficulty: 6.94321487, interval: 1 }))
    it('hard',  () => check(reviewedCard(), 'hard',  0.9, null,
      { stability: 7.14916816, difficulty: 6.21637379, interval: 7 }))
    it('good',  () => check(reviewedCard(), 'good',  0.9, null,
      { stability: 15.94349097, difficulty: 5.48953271, interval: 16 }))
    it('easy',  () => check(reviewedCard(), 'easy',  0.9, null,
      { stability: 38.7137493, difficulty: 4.76269163, interval: 39 }))
  })

  describe('mature card (interval=30, reviewCount=12) -- all four ratings', () => {
    it('again', () => check(matureCard(), 'again', 0.9, null,
      { stability: 3.53421669, difficulty: 6.60703511, interval: 1 }))
    it('hard',  () => check(matureCard(), 'hard',  0.9, null,
      { stability: 41.99992246, difficulty: 5.7994339, interval: 42 }))
    it('good',  () => check(matureCard(), 'good',  0.9, null,
      { stability: 88.47482703, difficulty: 4.99183271, interval: 88 }))
    it('easy',  () => check(matureCard(), 'easy',  0.9, null,
      { stability: 208.80763786, difficulty: 4.18423151, interval: 209 }))
  })

  describe('high lapse count card (lapses=5) -- all four ratings', () => {
    it('again', () => check(lapsedCard(), 'again', 0.9, null,
      { stability: 0.83547722, difficulty: 8.48964176, interval: 1 }))
    it('hard',  () => check(lapsedCard(), 'hard',  0.9, null,
      { stability: 3.08196422, difficulty: 8.13429724, interval: 3 }))
    it('good',  () => check(lapsedCard(), 'good',  0.9, null,
      { stability: 6.34174608, difficulty: 7.77895271, interval: 6 }))
    it('easy',  () => check(lapsedCard(), 'easy',  0.9, null,
      { stability: 14.78197243, difficulty: 7.42360818, interval: 15 }))
  })

  describe('retention target 0.70 (minimum boundary)', () => {
    it('new card good',    () => check(newCard(),      'good', 0.70, null,
      { stability: 3.173, difficulty: 5.28243442, interval: 1 }))
    it('young card good',  () => check(reviewedCard(), 'good', 0.70, null,
      { stability: 15.94349097, difficulty: 5.48953271, interval: 71 }))
    it('mature card good', () => check(matureCard(),   'good', 0.70, null,
      { stability: 88.47482703, difficulty: 4.99183271, interval: 393 }))
    it('lapsed card good', () => check(lapsedCard(),   'good', 0.70, null,
      { stability: 6.34174608, difficulty: 7.77895271, interval: 28 }))
  })

  describe('retention target 0.97 (maximum boundary)', () => {
    it('new card good',    () => check(newCard(),      'good', 0.97, null,
      { stability: 3.173, difficulty: 5.28243442, interval: 1 }))
    it('young card good',  () => check(reviewedCard(), 'good', 0.97, null,
      { stability: 15.94349097, difficulty: 5.48953271, interval: 4 }))
    it('mature card good', () => check(matureCard(),   'good', 0.97, null,
      { stability: 88.47482703, difficulty: 4.99183271, interval: 24 }))
    it('lapsed card good', () => check(lapsedCard(),   'good', 0.97, null,
      { stability: 6.34174608, difficulty: 7.77895271, interval: 2 }))
  })

  describe('high stability card (stability=120, reviewCount=30)', () => {
    const card = newCard({ stability: 120, difficulty: 3, interval: 90, reviewCount: 30, lastReview: '2025-10-17' })
    it('again', () => check(card, 'again', 0.9, null,
      { stability: 6.4319608, difficulty: 5.26231606, interval: 1 }))
    it('good',  () => check(card, 'good',  0.9, null,
      { stability: 330.14690877, difficulty: 3.00103271, interval: 330 }))
  })

  describe('reviewCount=1 boundary', () => {
    const card = newCard({ stability: 1.5, difficulty: 5, interval: 1, reviewCount: 1, lapses: 0,
      nextReview: '2026-01-15', lastReview: '2026-01-14' })
    it('again', () => check(card, 'again', 0.9, null,
      { stability: 0.59362228, difficulty: 6.60703511, interval: 1 }))
    it('good',  () => check(card, 'good',  0.9, null,
      { stability: 4.47838282, difficulty: 4.99183271, interval: 4 }))
  })

  describe('zero elapsed days (reviewed today)', () => {
    const card = newCard({ stability: 4, difficulty: 5, interval: 4, reviewCount: 5,
      lapses: 0, nextReview: '2026-01-15', lastReview: '2026-01-15' })
    it('good', () => check(card, 'good', 0.9, null,
      { stability: 4, difficulty: 4.99183271, interval: 5 }))
    it('easy', () => check(card, 'easy', 0.9, null,
      { stability: 4, difficulty: 4.18423151, interval: 6 }))
  })

  describe('cards near desired retention boundary (various lapse counts)', () => {
    it('mature lapses=1 good', () => check(matureCard({ lapses: 1 }), 'good', 0.9, null,
      { stability: 88.47482703, difficulty: 4.99183271, interval: 88 }))
    it('mature lapses=2 good', () => check(matureCard({ lapses: 2 }), 'good', 0.9, null,
      { stability: 88.47482703, difficulty: 4.99183271, interval: 88 }))
    it('mature lapses=3 good', () => check(matureCard({ lapses: 3 }), 'good', 0.9, null,
      { stability: 88.47482703, difficulty: 4.99183271, interval: 88 }))
    it('mature lapses=8 again', () => check(matureCard({ lapses: 8 }), 'again', 0.9, null,
      { stability: 3.53421669, difficulty: 6.60703511, interval: 1 }))
    it('mature lapses=8 hard',  () => check(matureCard({ lapses: 8 }), 'hard',  0.9, null,
      { stability: 41.99992246, difficulty: 5.7994339, interval: 42 }))
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

  // Card in Relearning state: lapses >= 1 AND interval <= 1.
  // Session 7a, Option A: state is now derived as Relearning (3) for this shape.
  // Frozen 2026-04-29. Do not update unless the derivation rule changes intentionally.
  describe('relearning state card (lapses=1, interval=1) -- all four ratings', () => {
    const relearningCard = () => ({
      stability: 1.8, difficulty: 7.8, interval: 1,
      reviewCount: 8, lapses: 1,
      nextReview: '2026-01-15', lastReview: '2026-01-14',
      status: 'Active',
    })
    it('again', () => check(relearningCard(), 'again', 0.9, null,
      { stability: 0.90185134, difficulty: 8.48964176, interval: 1 }))
    it('hard',  () => check(relearningCard(), 'hard',  0.9, null,
      { stability: 1.51171447, difficulty: 8.13429724, interval: 1 }))
    it('good',  () => check(relearningCard(), 'good',  0.9, null,
      { stability: 2.53398819, difficulty: 7.77895271, interval: 3 }))
    it('easy',  () => check(relearningCard(), 'easy',  0.9, null,
      { stability: 4.24755881, difficulty: 7.42360818, interval: 4 }))
  })

  // lapsedCard (lapses=5, interval=3) remains in Review state: interval > 1 so no Relearning.
  // Baselines below are identical to pre-session-7a values; listed to confirm no regression.
  describe('high lapse review card (lapses=5, interval=3, state=Review) -- baseline unchanged', () => {
    it('again', () => check(lapsedCard(), 'again', 0.9, null,
      { stability: 0.83547722, difficulty: 8.48964176, interval: 1 }))
    it('good',  () => check(lapsedCard(), 'good',  0.9, null,
      { stability: 6.34174608, difficulty: 7.77895271, interval: 6 }))
  })

  describe('overdue card (elapsed >> scheduled_days)', () => {
    const card = newCard({ stability: 10, difficulty: 5.5, interval: 10, reviewCount: 6,
      lapses: 0, nextReview: '2025-12-15', lastReview: '2025-12-05' })
    it('good',  () => check(card, 'good',  0.9, null,
      { stability: 76.37539942, difficulty: 5.48953271, interval: 76 }))
    it('again', () => check(card, 'again', 0.9, null,
      { stability: 3.18152321, difficulty: 6.94321487, interval: 1 }))
  })

  describe('initial difficulty ignored for new cards (ts-fsrs resets from rating)', () => {
    it('difficulty=8 good produces same interval as default new card good', () => {
      const r1 = scheduleFSRS(newCard({ difficulty: 8, stability: 0 }), 'good', 0.9, null, NOW)
      const r2 = scheduleFSRS(newCard(), 'good', 0.9, null, NOW)
      expect(r1.interval).toBe(r2.interval)
    })
    it('difficulty=2 good produces same interval as default new card good', () => {
      const r1 = scheduleFSRS(newCard({ difficulty: 2, stability: 0 }), 'good', 0.9, null, NOW)
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
