/**
 * Tests for Prompt 2.3: SessionLog schema expansion.
 * - assembleFrictionNote only returns user text
 * - ratingBreakdown / contentTypeBreakdown logic
 */

import { describe, it, expect } from 'vitest'
import { assembleFrictionNote } from '@/lib/stats'

// ── assembleFrictionNote ──────────────────────────────────────────────────────

describe('assembleFrictionNote', () => {
  it('returns trimmed user text', () => {
    expect(assembleFrictionNote('  Hard session today  ')).toBe('Hard session today')
  })

  it('returns empty string when no user text', () => {
    expect(assembleFrictionNote('')).toBe('')
  })

  it('does not append system markers', () => {
    const result = assembleFrictionNote('Good run')
    expect(result).not.toContain('[Intensity')
    expect(result).not.toContain('[Fatigue')
    expect(result).not.toContain('[Focused')
    expect(result).toBe('Good run')
  })
})

// ── ratingBreakdown helpers ───────────────────────────────────────────────────
// These pure-logic tests verify the counting arithmetic that SessionView uses.

describe('ratingBreakdown counting', () => {
  function applyRatings(ratings) {
    const breakdown = { again: 0, hard: 0, good: 0, easy: 0 }
    for (const r of ratings) breakdown[r] = (breakdown[r] || 0) + 1
    return breakdown
  }

  it('counts each rating correctly', () => {
    const result = applyRatings(['good', 'easy', 'again', 'good', 'hard'])
    expect(result.good).toBe(2)
    expect(result.easy).toBe(1)
    expect(result.again).toBe(1)
    expect(result.hard).toBe(1)
  })

  it('starts at zero for unused ratings', () => {
    const result = applyRatings(['good', 'good'])
    expect(result.again).toBe(0)
    expect(result.hard).toBe(0)
    expect(result.easy).toBe(0)
  })

  it('undo decrements the correct rating', () => {
    const breakdown = applyRatings(['good', 'easy', 'good'])
    const undoneRating = 'good'
    breakdown[undoneRating] = Math.max(0, breakdown[undoneRating] - 1)
    expect(breakdown.good).toBe(1)
    expect(breakdown.easy).toBe(1)
  })

  it('undo never goes below zero', () => {
    const breakdown = { again: 0, hard: 0, good: 0, easy: 0 }
    breakdown.good = Math.max(0, breakdown.good - 1)
    expect(breakdown.good).toBe(0)
  })
})

// ── contentTypeBreakdown helpers ──────────────────────────────────────────────

describe('contentTypeBreakdown counting', () => {
  function applyReviews(contentTypes) {
    const breakdown = {}
    for (const ct of contentTypes) breakdown[ct] = (breakdown[ct] || 0) + 1
    return breakdown
  }

  it('counts each content type', () => {
    const result = applyReviews(['Factual', 'Anatomy', 'Factual', 'Mechanism'])
    expect(result.Factual).toBe(2)
    expect(result.Anatomy).toBe(1)
    expect(result.Mechanism).toBe(1)
    expect(result['Clinical Reasoning']).toBeUndefined()
  })

  it('handles all five content types', () => {
    const types = ['Factual', 'Mechanism', 'Clinical Reasoning', 'Anatomy', 'Pathology']
    const result = applyReviews(types)
    expect(Object.keys(result)).toHaveLength(5)
  })

  it('undo decrements contentType', () => {
    const breakdown = applyReviews(['Factual', 'Factual', 'Anatomy'])
    breakdown['Factual'] = Math.max(0, (breakdown['Factual'] || 0) - 1)
    expect(breakdown.Factual).toBe(1)
    expect(breakdown.Anatomy).toBe(1)
  })
})

// ── fatigueFlag and focusedFlag logic ─────────────────────────────────────────

describe('session flag derivation', () => {
  const buildFlags = ({ fatigueAlertsEnabled, fatigueScore, focused }) => ({
    fatigueFlag: fatigueAlertsEnabled && fatigueScore >= 2,
    focusedFlag: focused,
  })

  it('fatigueFlag is true when alerts enabled and score >= 2', () => {
    expect(buildFlags({ fatigueAlertsEnabled: true, fatigueScore: 2, focused: false }).fatigueFlag).toBe(true)
    expect(buildFlags({ fatigueAlertsEnabled: true, fatigueScore: 3, focused: false }).fatigueFlag).toBe(true)
  })

  it('fatigueFlag is false when alerts disabled', () => {
    expect(buildFlags({ fatigueAlertsEnabled: false, fatigueScore: 3, focused: false }).fatigueFlag).toBe(false)
  })

  it('fatigueFlag is false when score < 2', () => {
    expect(buildFlags({ fatigueAlertsEnabled: true, fatigueScore: 1, focused: false }).fatigueFlag).toBe(false)
  })

  it('focusedFlag reflects focused prop', () => {
    expect(buildFlags({ fatigueAlertsEnabled: false, fatigueScore: 0, focused: true }).focusedFlag).toBe(true)
    expect(buildFlags({ fatigueAlertsEnabled: false, fatigueScore: 0, focused: false }).focusedFlag).toBe(false)
  })
})
