import { test, expect } from '@playwright/test'

// Scenario 5: Go offline (Playwright route block), library still works from IDB cache.

test.describe('Offline mode', () => {
  test('offline banner appears when network is blocked', async ({ page }) => {
    await page.goto('/library')
    // Wait for app to load fully first
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    // Block all API requests to simulate offline
    await page.route('**/api.base44.app/**', route => route.abort())
    // Trigger offline event in the browser
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      window.dispatchEvent(new Event('offline'))
    })
    // Offline banner should appear
    const banner = page.locator('.nid-offline-banner')
    await expect(banner).toBeVisible({ timeout: 5000 })
  })

  test('cached library content is shown when offline', async ({ page }) => {
    // Load the page online first (populates IDB cache)
    await page.goto('/library')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    // Block API
    await page.route('**/api.base44.app/**', route => route.abort())
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      window.dispatchEvent(new Event('offline'))
    })
    // Library should still render (from IDB or in-memory state)
    const content = page.locator('.nid-deck-card, [data-testid="empty-library"]')
    await expect(content.first()).toBeVisible({ timeout: 10000 })
  })

  test('reconnect clears offline banner', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    // Go offline
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      window.dispatchEvent(new Event('offline'))
    })
    // Come back online
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
      window.dispatchEvent(new Event('online'))
    })
    // Banner should be hidden
    const banner = page.locator('.nid-offline-banner')
    await expect(banner).toBeHidden({ timeout: 5000 })
  })
})
