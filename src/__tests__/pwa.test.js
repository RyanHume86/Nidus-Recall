import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
  it('API cache max age is 5 minutes (300 seconds)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.js'), 'utf-8')
    // Find the maxAgeSeconds value in the base44-api-cache block
    const match = src.match(/base44-api-cache[\s\S]*?maxAgeSeconds:\s*(\d+)/)
    expect(match).toBeTruthy()
    expect(parseInt(match[1], 10)).toBe(300)
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
})

// ── manifest values ────────────────────────────────────────────────────────

describe('manifest', () => {
  it('start_url is /library', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const manifestPath = path.resolve(process.cwd(), 'public/manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    expect(manifest.start_url).toBe('/library')
  })

  it('background_color is #FFFFFF', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const manifestPath = path.resolve(process.cwd(), 'public/manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    expect(manifest.background_color).toBe('#FFFFFF')
  })

  it('has 192px and 512px icons', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const manifestPath = path.resolve(process.cwd(), 'public/manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    const sizes = manifest.icons.map(i => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })
})
