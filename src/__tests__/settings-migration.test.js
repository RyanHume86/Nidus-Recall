/**
 * Migration tests for the daily* → *Cap key consolidation.
 * settingsGet must strip dailyNewCardLimit / dailyReviewLimit from localStorage
 * and never return them as part of the resolved settings object.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { settingsGet, SK } from '@/lib/settings'

// Minimal localStorage shim — jsdom provides one, but we seed it explicitly.
const seed = (obj) => localStorage.setItem(SK.settings, JSON.stringify(obj))
const stored = () => JSON.parse(localStorage.getItem(SK.settings) || '{}')

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('settingsGet — daily* key migration', () => {
  it('removes dailyNewCardLimit and dailyReviewLimit from result and localStorage', () => {
    seed({ newCardCap: 30, reviewCap: 250, dailyNewCardLimit: 30, dailyReviewLimit: 250 })
    const result = settingsGet()
    expect(result).not.toHaveProperty('dailyNewCardLimit')
    expect(result).not.toHaveProperty('dailyReviewLimit')
    // Confirm they are gone from localStorage after the migration write-back.
    const persisted = stored()
    expect(persisted).not.toHaveProperty('dailyNewCardLimit')
    expect(persisted).not.toHaveProperty('dailyReviewLimit')
    // The canonical keys are preserved as-is (30 / 250 are valid user choices).
    expect(result.newCardCap).toBe(30)
    expect(result.reviewCap).toBe(250)
  })

  it('applies the 50→15 newCardCap migration and persists the result', () => {
    seed({ newCardCap: 50 })
    const result = settingsGet()
    expect(result.newCardCap).toBe(15)
    expect(result).not.toHaveProperty('dailyNewCardLimit')
    expect(stored().newCardCap).toBe(15)
  })

  it('returns canonical defaults when localStorage is empty', () => {
    const result = settingsGet()
    expect(result.newCardCap).toBe(15)
    expect(result.reviewCap).toBe(100)
    expect(result).not.toHaveProperty('dailyNewCardLimit')
    expect(result).not.toHaveProperty('dailyReviewLimit')
  })

  it('is idempotent — calling settingsGet twice does not re-write localStorage unnecessarily', () => {
    seed({ newCardCap: 20, reviewCap: 150 })
    settingsGet()
    const afterFirst = stored()
    settingsGet()
    const afterSecond = stored()
    // Object shape should be stable between calls (no spurious writes add keys).
    expect(afterFirst).toEqual(afterSecond)
    expect(afterFirst).not.toHaveProperty('dailyNewCardLimit')
    expect(afterFirst).not.toHaveProperty('dailyReviewLimit')
  })
})
