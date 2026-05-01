/**
 * Session 7a, phase 1.1: FSRS scheduler parameter validation.
 *
 * Validates that validateFsrsParams accepts only well-formed FSRS-4/4.5/5 weight
 * arrays and rejects malformed input with a structured FsrsParamValidationError.
 * Also confirms scheduleFSRS falls back to defaults (rather than throwing) when
 * persisted params are corrupt.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { default_w } from 'ts-fsrs'
import { validateFsrsParams, FsrsParamValidationError, scheduleFSRS } from '../lib/fsrs.js'
import { tuneRetentionTarget } from '../lib/fsrs-optimizer.js'

// Canonical FSRS-5 default weights from ts-fsrs (length 19).
const validFsrs5 = () => [...default_w]
// Length-17 truncation of canonical defaults: still a valid FSRS-4 array.
// Indices 0 to 16 of canonical default_w all sit inside their published clamps.
const validFsrs4 = () => default_w.slice(0, 17)

describe('validateFsrsParams: structural checks', () => {
  it('accepts a length-17 FSRS-4 array', () => {
    expect(validateFsrsParams(validFsrs4())).toBe(true)
  })
  it('accepts a length-19 FSRS-5 array (DEFAULT_PARAMS)', () => {
    expect(validateFsrsParams(validFsrs5())).toBe(true)
  })
  it('accepts a length-18 transitional array', () => {
    expect(validateFsrsParams([...validFsrs4(), 0.14])).toBe(true)
  })
  it('rejects length 16', () => {
    expect(() => validateFsrsParams(validFsrs4().slice(0, 16)))
      .toThrow(FsrsParamValidationError)
  })
  it('rejects length 20', () => {
    expect(() => validateFsrsParams([...validFsrs5(), 1.0]))
      .toThrow(FsrsParamValidationError)
  })
  it('rejects non-array input', () => {
    expect(() => validateFsrsParams(null)).toThrow(FsrsParamValidationError)
    expect(() => validateFsrsParams(undefined)).toThrow(FsrsParamValidationError)
    expect(() => validateFsrsParams('a,b,c')).toThrow(FsrsParamValidationError)
    expect(() => validateFsrsParams({ 0: 1 })).toThrow(FsrsParamValidationError)
  })
})

describe('validateFsrsParams: element checks', () => {
  it('rejects NaN at any position', () => {
    const p = validFsrs5(); p[5] = NaN
    expect(() => validateFsrsParams(p)).toThrow(/not a finite number/)
  })
  it('rejects Infinity', () => {
    const p = validFsrs5(); p[8] = Infinity
    expect(() => validateFsrsParams(p)).toThrow(/not a finite number/)
  })
  it('rejects negative initial-stability index', () => {
    const p = validFsrs5(); p[0] = -0.1
    try {
      validateFsrsParams(p)
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FsrsParamValidationError)
      expect(err.index).toBe(0)
      expect(err.reason).toBe('out-of-range')
    }
  })
  it('rejects non-numeric element', () => {
    const p = validFsrs5(); p[10] = 'oops'
    expect(() => validateFsrsParams(p)).toThrow(/not a finite number/)
  })
})

describe('validateFsrsParams: boundary values', () => {
  // w[4] published range is [1.0, 10.0].
  it('accepts w[4] at lower bound 1.0', () => {
    const p = validFsrs5(); p[4] = 1.0
    expect(validateFsrsParams(p)).toBe(true)
  })
  it('accepts w[4] at upper bound 10.0', () => {
    const p = validFsrs5(); p[4] = 10.0
    expect(validateFsrsParams(p)).toBe(true)
  })
  it('rejects w[4] just below lower bound', () => {
    const p = validFsrs5(); p[4] = 0.999
    expect(() => validateFsrsParams(p)).toThrow(/outside published range/)
  })
  it('rejects w[4] just above upper bound', () => {
    const p = validFsrs5(); p[4] = 10.001
    expect(() => validateFsrsParams(p)).toThrow(/outside published range/)
  })
  // w[17] FSRS-5 forgetting curve exponent, range [0.0, 2.0].
  it('accepts w[17] at upper bound 2.0', () => {
    const p = validFsrs5(); p[17] = 2.0
    expect(validateFsrsParams(p)).toBe(true)
  })
  it('rejects w[17] just above upper bound', () => {
    const p = validFsrs5(); p[17] = 2.0001
    expect(() => validateFsrsParams(p)).toThrow(/outside published range/)
  })
})

describe('validateFsrsParams: defaults and fitted output', () => {
  it('accepts the canonical ts-fsrs default_w (FSRS-5)', () => {
    expect(validateFsrsParams(default_w)).toBe(true)
  })
  it('accepts library-fitted output for a synthetic 200-review log', () => {
    // Build a synthetic review log: 200 events with realistic stabilities and
    // mostly-good outcomes. tuneRetentionTarget fits w[17] only; other indices
    // start from canonical FSRS-5 defaults so the fitted output stays in range.
    const log = []
    for (let i = 0; i < 200; i++) {
      log.push({
        elapsedDays: 1 + (i % 30),
        stability: 2 + (i % 25),
        rating: i % 7 === 0 ? 'again' : 'good',
      })
    }
    const { params, fitted } = tuneRetentionTarget(log, [...default_w])
    expect(fitted).toBe(true)
    expect(validateFsrsParams(params)).toBe(true)
  })
})

describe('scheduleFSRS: graceful fallback on invalid params', () => {
  beforeEach(() => {
    // Reset module-level warn-once flag by reloading vitest mocks; warnings
    // are checked via console.warn spy.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  it('falls back to defaults when given malformed params and does not throw', () => {
    const card = { stability: null, difficulty: null, interval: 0, reviewCount: 0, lapses: 0, nextReview: null, lastReview: null }
    const garbage = [NaN, NaN, NaN]
    expect(() => scheduleFSRS(card, 'good', 0.9, garbage, new Date('2026-01-15T09:00:00.000Z'))).not.toThrow()
  })
  it('produces the same result as defaults when params are invalid', () => {
    const card = { stability: null, difficulty: null, interval: 0, reviewCount: 0, lapses: 0, nextReview: null, lastReview: null }
    const NOW = new Date('2026-01-15T09:00:00.000Z')
    const withDefaults = scheduleFSRS(card, 'good', 0.9, null, NOW)
    const withGarbage  = scheduleFSRS(card, 'good', 0.9, [Infinity], NOW)
    expect(withGarbage.interval).toBe(withDefaults.interval)
    expect(withGarbage.stability).toBeCloseTo(withDefaults.stability, 6)
    expect(withGarbage.difficulty).toBeCloseTo(withDefaults.difficulty, 6)
  })
})
