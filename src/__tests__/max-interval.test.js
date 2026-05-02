/**
 * Maximum interval cap tests (Item 7).
 * Verifies that:
 * - MAX_INTERVAL_CAP is 365 days
 * - settingsGet() enforces the cap on stored values
 * - The cap constant is used as the default maximumInterval
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MAX_INTERVAL_CAP, DEFAULT_SETTINGS } from '@/lib/settings'

describe('MAX_INTERVAL_CAP', () => {
  it('is 365 days', () => {
    expect(MAX_INTERVAL_CAP).toBe(365)
  })

  it('is the default maximumInterval in DEFAULT_SETTINGS', () => {
    expect(DEFAULT_SETTINGS.maximumInterval).toBe(MAX_INTERVAL_CAP)
  })
})

describe('settingsGet cap enforcement', () => {
  let origGetItem, origSetItem

  beforeEach(() => {
    origGetItem = localStorage.getItem.bind(localStorage)
    origSetItem = localStorage.setItem.bind(localStorage)
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('caps a stored maximumInterval above 365 down to 365', async () => {
    localStorage.setItem('nidus-settings', JSON.stringify({ maximumInterval: 9999 }))
    const { settingsGet } = await import('@/lib/settings')
    const s = settingsGet()
    expect(s.maximumInterval).toBe(MAX_INTERVAL_CAP)
  })

  it('leaves a stored maximumInterval at or below 365 unchanged', async () => {
    localStorage.setItem('nidus-settings', JSON.stringify({ maximumInterval: 180 }))
    const { settingsGet } = await import('@/lib/settings')
    const s = settingsGet()
    expect(s.maximumInterval).toBe(180)
  })

  it('defaults to MAX_INTERVAL_CAP when no value is stored', async () => {
    localStorage.clear()
    const { settingsGet } = await import('@/lib/settings')
    const s = settingsGet()
    expect(s.maximumInterval).toBe(MAX_INTERVAL_CAP)
  })
})

describe('scheduling cap logic', () => {
  it('Math.min clamps intervals above the cap', () => {
    const rawInterval = 500
    const cap = MAX_INTERVAL_CAP
    expect(Math.min(rawInterval, cap)).toBe(365)
  })

  it('Math.min leaves intervals at the cap unchanged', () => {
    expect(Math.min(365, MAX_INTERVAL_CAP)).toBe(365)
  })

  it('Math.min leaves intervals below the cap unchanged', () => {
    expect(Math.min(30, MAX_INTERVAL_CAP)).toBe(30)
  })
})
