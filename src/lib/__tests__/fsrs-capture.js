// Helper script: run once to print expected outputs for the regression baseline.
// Usage: node --experimental-vm-modules src/lib/__tests__/fsrs-capture.js
// (Not a test file - just a capture helper.)
import { scheduleFSRS } from '../fsrs.js'

const NOW = new Date('2026-01-15T09:00:00.000Z')

const newCard = (overrides = {}) => ({
  stability: null, difficulty: null, interval: 0,
  reviewCount: 0, lapses: 0, nextReview: null, lastReview: null,
  status: 'Active', ...overrides,
})

const reviewedCard = (overrides = {}) => ({
  stability: 4.5, difficulty: 5.5, interval: 5,
  reviewCount: 3, lapses: 0,
  nextReview: '2026-01-15', lastReview: '2026-01-10',
  status: 'Active', ...overrides,
})

const matureCard = (overrides = {}) => ({
  stability: 28, difficulty: 5.0, interval: 30,
  reviewCount: 12, lapses: 0,
  nextReview: '2026-01-15', lastReview: '2025-12-16',
  status: 'Active', ...overrides,
})

const lapsedCard = (overrides = {}) => ({
  stability: 2.1, difficulty: 7.8, interval: 3,
  reviewCount: 8, lapses: 5,
  nextReview: '2026-01-15', lastReview: '2026-01-12',
  status: 'Active', ...overrides,
})

const cases = [
  // New card, all four ratings
  [newCard(), 'again', 0.9, null],
  [newCard(), 'hard',  0.9, null],
  [newCard(), 'good',  0.9, null],
  [newCard(), 'easy',  0.9, null],

  // Young card (interval=5, reviewCount=3), all four ratings
  [reviewedCard(), 'again', 0.9, null],
  [reviewedCard(), 'hard',  0.9, null],
  [reviewedCard(), 'good',  0.9, null],
  [reviewedCard(), 'easy',  0.9, null],

  // Mature card (interval=30, reviewCount=12), all four ratings
  [matureCard(), 'again', 0.9, null],
  [matureCard(), 'hard',  0.9, null],
  [matureCard(), 'good',  0.9, null],
  [matureCard(), 'easy',  0.9, null],

  // High lapse count card, all four ratings
  [lapsedCard(), 'again', 0.9, null],
  [lapsedCard(), 'hard',  0.9, null],
  [lapsedCard(), 'good',  0.9, null],
  [lapsedCard(), 'easy',  0.9, null],

  // Retention target boundary: 0.70 (minimum)
  [newCard(),     'good', 0.70, null],
  [reviewedCard(),'good', 0.70, null],
  [matureCard(),  'good', 0.70, null],
  [lapsedCard(),  'good', 0.70, null],

  // Retention target boundary: 0.97 (maximum)
  [newCard(),     'good', 0.97, null],
  [reviewedCard(),'good', 0.97, null],
  [matureCard(),  'good', 0.97, null],
  [lapsedCard(),  'good', 0.97, null],

  // Very high stability (well-learned card)
  [newCard({ stability: 120, difficulty: 3, interval: 90, reviewCount: 30, lastReview: '2025-10-17' }), 'again', 0.9, null],
  [newCard({ stability: 120, difficulty: 3, interval: 90, reviewCount: 30, lastReview: '2025-10-17' }), 'good',  0.9, null],

  // Card with stability just at new-card boundary (reviewCount=1)
  [newCard({ stability: 1.5, difficulty: 5, interval: 1, reviewCount: 1, lapses: 0, nextReview: '2026-01-15', lastReview: '2026-01-14' }), 'again', 0.9, null],
  [newCard({ stability: 1.5, difficulty: 5, interval: 1, reviewCount: 1, lapses: 0, nextReview: '2026-01-15', lastReview: '2026-01-14' }), 'good',  0.9, null],

  // Zero-elapsed card (reviewed today)
  [newCard({ stability: 4, difficulty: 5, interval: 4, reviewCount: 5, lapses: 0, nextReview: '2026-01-15', lastReview: '2026-01-15' }), 'good', 0.9, null],
  [newCard({ stability: 4, difficulty: 5, interval: 4, reviewCount: 5, lapses: 0, nextReview: '2026-01-15', lastReview: '2026-01-15' }), 'easy', 0.9, null],

  // Cards near desired retention boundary (matureCard with various lapses)
  [matureCard({ lapses: 1 }), 'good', 0.9, null],
  [matureCard({ lapses: 2 }), 'good', 0.9, null],
  [matureCard({ lapses: 3 }), 'good', 0.9, null],
  [matureCard({ lapses: 8 }), 'again', 0.9, null],
  [matureCard({ lapses: 8 }), 'hard',  0.9, null],

  // Custom UserSchedulerParams (short custom w array, 17 params)
  ...((() => {
    const customW = [0.5, 1.0, 3.5, 16.0, 7.0, 0.5, 1.1, 0.06, 1.6, 0.15, 1.0, 2.0, 0.12, 0.30, 2.3, 0.26, 3.0]
    return [
      [newCard(),     'good', 0.9, customW],
      [newCard(),     'easy', 0.9, customW],
      [reviewedCard(),'good', 0.9, customW],
      [reviewedCard(),'again',0.9, customW],
      [matureCard(),  'good', 0.9, customW],
      [matureCard(),  'hard', 0.9, customW],
      [lapsedCard(),  'good', 0.9, customW],
      [lapsedCard(),  'again',0.9, customW],
    ]
  })()),

  // Long interval overdue card (elapsed >> scheduled)
  [newCard({ stability: 10, difficulty: 5.5, interval: 10, reviewCount: 6, lapses: 0, nextReview: '2025-12-15', lastReview: '2025-12-05' }), 'good',  0.9, null],
  [newCard({ stability: 10, difficulty: 5.5, interval: 10, reviewCount: 6, lapses: 0, nextReview: '2025-12-15', lastReview: '2025-12-05' }), 'again', 0.9, null],

  // New card, higher difficulty baseline (simulated by providing difficulty in card)
  [newCard({ difficulty: 8, stability: 0 }), 'good',  0.9, null],
  [newCard({ difficulty: 2, stability: 0 }), 'good',  0.9, null],
]

for (const [card, rating, retention, params] of cases) {
  const result = scheduleFSRS(card, rating, retention, params, NOW)
  console.log(JSON.stringify({ card, rating, retention, hasCustomParams: !!params, result }))
}
