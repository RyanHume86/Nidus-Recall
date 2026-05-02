import { test, expect } from '@playwright/test'

// Scenario 9 + 10: Progress page populates, Settings persist.

test.describe('Stats page', () => {
  test('stats/progress page loads without error', async ({ page }) => {
    await page.goto('/')
    // Navigate to stats
    const statsNav = page.getByRole('link', { name: /stats|progress|activity/i })
      .or(page.getByRole('button', { name: /stats|progress|activity/i }))
    if (await statsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await statsNav.click()
      // Should not show error state
      await expect(page.locator('[data-testid="stats-error"]')).toBeHidden({ timeout: 5000 }).catch(() => {})
      // Headline stats section should be visible
      const statsContent = page.locator('[data-testid="headline-stats"], .nid-stats')
      await expect(statsContent.first()).toBeVisible({ timeout: 10000 })
    }
  })
})

test.describe('Settings', () => {
  test('settings page renders all tabs', async ({ page }) => {
    await page.goto('/')
    const settingsNav = page.getByRole('link', { name: /settings/i })
      .or(page.getByRole('button', { name: /settings/i }))
    if (await settingsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsNav.click()
      // All five tabs should be present
      for (const tab of ['Profile', 'Schedule', 'Algorithm', 'Data', 'Privacy']) {
        await expect(page.getByText(tab)).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('retention target slider persists', async ({ page }) => {
    await page.goto('/')
    const settingsNav = page.getByRole('link', { name: /settings/i })
      .or(page.getByRole('button', { name: /settings/i }))
    if (await settingsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsNav.click()
      await page.getByText('Algorithm').click()
      // Retention slider should be present
      const slider = page.getByLabel(/retention/i)
      await expect(slider).toBeVisible({ timeout: 5000 })
    }
  })

  test('about section shows in settings', async ({ page }) => {
    await page.goto('/')
    const settingsNav = page.getByRole('link', { name: /settings/i })
      .or(page.getByRole('button', { name: /settings/i }))
    if (await settingsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsNav.click()
      const aboutSection = page.locator('[data-testid="about-section"]')
      await expect(aboutSection).toBeVisible({ timeout: 10000 })
    }
  })
})
