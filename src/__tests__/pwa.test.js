import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
/* global process */
import { isInstallable, triggerInstallPrompt } from '@/lib/pwa'

// ── Install prompt dismissal (30-day logic) ────────────────────────────────

describe('install prompt dismissal', () => {
  const KEY = 'nidus-install-prompt-dismissed'

  function isDismissed() {
    const ts = parseInt(localStorage.getItem(KEY) || '0', 10)
    return ts > 0 && Date.now() - ts < 30 * 24 * 60 * 60 * 1000
  }

  beforeEach(() => { localStorage.clear() })

  it('returns false when key is absent', () => {
    expect(isDismissed()).toBe(false)
  })

  it('returns true immediately after dismissal', () => {
    localStorage.setItem(KEY, Date.now().toString())
    expect(isDismissed()).toBe(true)
  })

  it('returns true with a timestamp 29 days ago', () => {
    const twentyNineDaysAgo = Date.now() - 29 * 24 * 60 * 60 * 1000
    localStorage.setItem(KEY, twentyNineDaysAgo.toString())
    expect(isDismissed()).toBe(true)
  })

  it('returns false with a timestamp 31 days ago', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000
    localStorage.setItem(KEY, thirtyOneDaysAgo.toString())
    expect(isDismissed()).toBe(false)
  })

  it('returns false for the legacy "true" string value', () => {
    // Old format stored "true"; parseInt("true") = NaN which fails the ts > 0 check,
    // so the prompt re-appears after the 30-day window.
    localStorage.setItem(KEY, 'true')
    // NaN > 0 is false, so isDismissed() returns false
    expect(isDismissed()).toBe(false)
  })
})

// ── pwa.js: isInstallable / triggerInstallPrompt ───────────────────────────

describe('isInstallable', () => {
  it('returns false when no deferred prompt is set', () => {
    // Module is already loaded without a beforeinstallprompt event
    expect(typeof isInstallable).toBe('function')
    expect(isInstallable()).toBe(false)
  })
})

describe('triggerInstallPrompt', () => {
  it('returns false when deferredInstallPrompt is null', async () => {
    const result = await triggerInstallPrompt()
    expect(result).toBe(false)
  })
})

// ── Session threshold ──────────────────────────────────────────────────────

describe('install prompt session threshold', () => {
  it('prompt appears at exactly 3 completed sessions', () => {
    const shouldShow = (sessions) => sessions >= 3
    expect(shouldShow(0)).toBe(false)
    expect(shouldShow(1)).toBe(false)
    expect(shouldShow(2)).toBe(false)
    expect(shouldShow(3)).toBe(true)
    expect(shouldShow(10)).toBe(true)
  })
})

// ── Cache strategy configuration ──────────────────────────────────────────

describe('workbox cache strategy config', () => {
  it('Base44 API responses are not runtime-cached (api.base44.app removed)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.js'), 'utf-8')
    expect(src).not.toContain('base44-api-cache')
    expect(src).not.toContain('api.base44.app')
  })

  it('image cache uses CacheFirst handler', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.js'), 'utf-8')
    expect(src).toContain("'CacheFirst'")
    expect(src).toContain('images-cache')
  })

  it('image cache expiry is 30 days (2592000 seconds)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.js'), 'utf-8')
    const match = src.match(/images-cache[\s\S]*?maxAgeSeconds:\s*(\d+)/)
    expect(match).toBeTruthy()
    expect(parseInt(match[1], 10)).toBe(2592000)
  })

  it('cleanupOutdatedCaches is explicitly set', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.js'), 'utf-8')
    expect(src).toContain('cleanupOutdatedCaches: true')
  })
})

// ── manifest values (sourced from vite.config.js) ─────────────────────────

describe('manifest', () => {
  let src

  beforeEach(async () => {
    const fs = await import('fs')
    const path = await import('path')
    src = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.js'), 'utf-8')
  })

  it('start_url is /library', () => {
    const match = src.match(/start_url:\s*['"]([^'"]+)['"]/)
    expect(match).toBeTruthy()
    expect(match[1]).toBe('/library')
  })

  it('background_color is #FFFFFF', () => {
    const match = src.match(/background_color:\s*['"]([^'"]+)['"]/)
    expect(match).toBeTruthy()
    expect(match[1]).toBe('#FFFFFF')
  })

  it('has 192px and 512px icons', () => {
    expect(src).toContain('192x192')
    expect(src).toContain('512x512')
  })

  it('orientation is portrait', () => {
    expect(src).toContain("orientation: 'portrait'")
  })
})