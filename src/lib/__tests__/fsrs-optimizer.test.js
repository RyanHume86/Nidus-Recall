/**
 * Tests for src/lib/fsrs-optimizer.js
 *
 * Verifies:
 *  - tuneRetentionTarget is exported (fitParams is gone)
 *  - tuneRetentionTarget behaves correctly: returns fitted=false below threshold,
 *    adjusts w[17] on sufficient data, keeps all other parameters at defaults.
 *  - buildReviewLog produces the expected event shape.
 *  - UI copy: no source file claims "FSRS Parameters" or "19-parameter" fitting.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  tuneRetentionTarget,
  buildReviewLog,
  DEFAULT_PARAMS,
} from '../fsrs-optimizer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..', '..', '..')

// ── API shape ─────────────────────────────────────────────────────────────────

describe('module exports', () => {
  it('exports tuneRetentionTarget', () => {
    expect(typeof tuneRetentionTarget).toBe('function')
  })

  it('does NOT export fitParams', async () => {
    const mod = await import('../fsrs-optimizer.js')
    expect(mod.fitParams).toBeUndefined()
  })

  it('exports buildReviewLog', () => {
    expect(typeof buildReviewLog).toBe('function')
  })

  it('DEFAULT_PARAMS has 19 entries', () => {
    expect(DEFAULT_PARAMS).toHaveLength(19)
  })
})

// ── tuneRetentionTarget behaviour ─────────────────────────────────────────────

describe('tuneRetentionTarget', () => {
  it('returns fitted=false when reviewLog is empty', () => {
    const { fitted } = tuneRetentionTarget([])
    expect(fitted).toBe(false)
  })

  it('returns fitted=false when reviewLog has fewer than 50 entries', () => {
    const log = Array.from({ length: 49 }, (_, i) => ({
      cardId: 'c', rating: 'good', date: '2026-01-01',
      elapsedDays: i + 1, stability: 4,
    }))
    const { fitted } = tuneRetentionTarget(log)
    expect(fitted).toBe(false)
  })

  it('returns fitted=true and adjusted params on sufficient data', () => {
    // 200 review events: half "again" (forgot), half "good" (recalled)
    const log = Array.from({ length: 200 }, (_, i) => ({
      cardId: `c${i}`, rating: i % 2 === 0 ? 'again' : 'good',
      date: '2026-01-01', elapsedDays: 7, stability: 5,
    }))
    const { fitted, params, loss } = tuneRetentionTarget(log, DEFAULT_PARAMS)
    expect(fitted).toBe(true)
    expect(params).toHaveLength(19)
    expect(typeof loss).toBe('number')
    expect(loss).toBeGreaterThanOrEqual(0)
  })

  it('only w[17] changes; all other parameters remain at defaults', () => {
    const log = Array.from({ length: 100 }, (_, i) => ({
      cardId: `c${i}`, rating: 'again',
      date: '2026-01-01', elapsedDays: 10, stability: 4,
    }))
    const { params } = tuneRetentionTarget(log, DEFAULT_PARAMS)
    // All params except w[17] must be unchanged
    for (let i = 0; i < 19; i++) {
      if (i !== 17) {
        expect(params[i]).toBe(DEFAULT_PARAMS[i])
      }
    }
    // w[17] must have changed from the default 0.14
    expect(params[17]).not.toBe(DEFAULT_PARAMS[17])
  })

  it('clamps w[17] within [0.05, 0.5]', () => {
    // All "again" should drive theta toward 0 (less forgetting predicted)
    const log = Array.from({ length: 200 }, () => ({
      cardId: 'c', rating: 'again',
      date: '2026-01-01', elapsedDays: 1, stability: 4,
    }))
    const { params } = tuneRetentionTarget(log, DEFAULT_PARAMS, 500)
    expect(params[17]).toBeGreaterThanOrEqual(0.05)
    expect(params[17]).toBeLessThanOrEqual(0.5)
  })
})

// ── buildReviewLog ────────────────────────────────────────────────────────────

describe('buildReviewLog', () => {
  it('returns an empty array for cards with no history', () => {
    const cards = [{ id: 'c1', ratingHistory: [], stability: 4 }]
    expect(buildReviewLog(cards)).toHaveLength(0)
  })

  it('computes elapsedDays=0 for the first event in a sequence', () => {
    const cards = [{
      id: 'c1', stability: 3,
      ratingHistory: [
        { rating: 'good', date: '2026-01-01' },
        { rating: 'again', date: '2026-01-08' },
      ],
    }]
    const log = buildReviewLog(cards)
    expect(log).toHaveLength(2)
    expect(log[0].elapsedDays).toBe(0)
    expect(log[1].elapsedDays).toBeCloseTo(7, 0)
  })

  it('includes all cards and all events', () => {
    const cards = [
      { id: 'c1', stability: 4, ratingHistory: [{ rating: 'good', date: '2026-01-01' }, { rating: 'good', date: '2026-01-07' }] },
      { id: 'c2', stability: 6, ratingHistory: [{ rating: 'again', date: '2026-01-03' }] },
    ]
    expect(buildReviewLog(cards)).toHaveLength(3)
  })
})

// ── Rename consistency: no "fitParams" in source files ───────────────────────

describe('rename consistency', () => {
  const srcFiles = [
    'src/lib/fsrs-optimizer.js',
    'src/lib/fit-params.js',
    'src/views/SettingsView.jsx',
    'src/pages/Home.jsx',
    'src/views/SessionView.jsx',
  ]

  // The standalone identifier "fitParams" (not a substring of fitSchedulerParams etc.)
  const fitParamsStandalone = /\bfitParams\b/

  for (const rel of srcFiles) {
    it(`${rel} does not contain the standalone identifier "fitParams"`, () => {
      const src = readFileSync(resolve(root, rel), 'utf8')
      const nonCommentLines = src.split('\n').filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
      const hasOldName = nonCommentLines.some(l => fitParamsStandalone.test(l))
      expect(hasOldName).toBe(false)
    })
  }

  it('SettingsView does not say "FSRS Parameters" as a section title', () => {
    const src = readFileSync(resolve(root, 'src/views/SettingsView.jsx'), 'utf8')
    expect(src).not.toContain('"FSRS Parameters"')
  })

  it('SettingsView does not claim 19-parameter optimisation', () => {
    const src = readFileSync(resolve(root, 'src/views/SettingsView.jsx'), 'utf8')
    expect(src).not.toContain('19-parameter optimisation')
  })
})
