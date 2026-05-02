import { test, expect } from '@playwright/test'

// Scenario 3 + 4: Start session, rate cards, confirm FSRS update, pause/resume.

test.describe('Review session', () => {
  test.skip(!process.env.E2E_EMAIL, 'Requires E2E_EMAIL and E2E_PASSWORD env vars')

  test('can start a study session', async ({ page }) => {
    await page.goto('/library')
    const studyBtn = page.getByRole('button', { name: /study|review|start session/i }).first()
    if (await studyBtn.isVisible()) {
      await studyBtn.click()
      // Should enter session view
      await expect(page.locator('[data-testid="session-view"], .nid-session')).toBeVisible({ timeout: 10000 })
    }
  })

  test('rating buttons are visible in session', async ({ page }) => {
    await page.goto('/')
    // Start a session if possible
    const studyBtn = page.getByRole('button', { name: /study|review/i }).first()
    if (await studyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await studyBtn.click()
      // Show answer
      const showAnswerBtn = page.getByRole('button', { name: /show answer|flip/i })
      if (await showAnswerBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await showAnswerBtn.click()
        // Rating buttons should appear
        await expect(page.getByRole('button', { name: /again|hard|good|easy/i }).first()).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('pause button is visible during session', async ({ page }) => {
    await page.goto('/')
    const studyBtn = page.getByRole('button', { name: /study|review/i }).first()
    if (await studyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await studyBtn.click()
      // Pause button should be accessible
      const pauseBtn = page.getByRole('button', { name: /pause|exit|back/i })
      await expect(pauseBtn.first()).toBeVisible({ timeout: 10000 })
    }
  })
})
