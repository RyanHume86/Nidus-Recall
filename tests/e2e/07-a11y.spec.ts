import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// WCAG 2.1 AA accessibility sweep across all routes.

const ROUTES = [
  { path: '/library', name: 'Library' },
  { path: '/privacy', name: 'Privacy' },
  { path: '/terms', name: 'Terms' },
  { path: '/data-processing', name: 'Data Processing' },
]

for (const { path, name } of ROUTES) {
  test(`${name} page passes WCAG 2.1 AA (axe)`, async ({ page }) => {
    await page.goto(path)
    // Wait for content to render
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    // Report violations in test output for debugging
    if (results.violations.length > 0) {
      console.log(`\nAxe violations on ${path}:`)
      for (const v of results.violations) {
        console.log(`  [${v.impact}] ${v.id}: ${v.description}`)
        for (const node of v.nodes) {
          console.log(`    HTML: ${node.html}`)
        }
      }
    }

    expect(results.violations).toEqual([])
  })
}

test('toggle buttons have accessible labels', async ({ page }) => {
  await page.goto('/')
  // Navigate to settings if available
  const settingsNav = page.getByRole('link', { name: /settings/i })
    .or(page.getByRole('button', { name: /settings/i }))
  if (await settingsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
    await settingsNav.click()
    // All role=switch elements must have accessible names
    const switches = await page.locator('[role="switch"]').all()
    for (const sw of switches) {
      const label = await sw.getAttribute('aria-label')
      const labelledBy = await sw.getAttribute('aria-labelledby')
      expect(label || labelledBy).toBeTruthy()
    }
  }
})

test('modal dialogs have role and label', async ({ page }) => {
  await page.goto('/')
  // If any dialogs are open, verify they have role=dialog and aria-modal
  const dialogs = await page.locator('[role="dialog"]').all()
  for (const dialog of dialogs) {
    const ariaModal = await dialog.getAttribute('aria-modal')
    const ariaLabel = await dialog.getAttribute('aria-label')
    const ariaLabelledBy = await dialog.getAttribute('aria-labelledby')
    expect(ariaModal).toBe('true')
    expect(ariaLabel || ariaLabelledBy).toBeTruthy()
  }
})

test('stakes flag has non-color accessible label', async ({ page }) => {
  await page.goto('/library')
  const starsInCards = await page.locator('[role="img"][aria-label*="stakes"]').all()
  // If any stakes stars are visible, they must have role=img and aria-label
  for (const star of starsInCards) {
    const label = await star.getAttribute('aria-label')
    expect(label).toMatch(/high.?stakes/i)
  }
})

test('NoteToggle and AnchorToggle expand/collapse as buttons', async ({ page }) => {
  await page.goto('/library')
  const noteToggles = await page.locator('.nid-note-toggle').all()
  for (const toggle of noteToggles) {
    const tagName = await toggle.evaluate(el => el.tagName.toLowerCase())
    expect(tagName).toBe('button')
    const ariaExpanded = await toggle.getAttribute('aria-expanded')
    expect(ariaExpanded).not.toBeNull()
  }
})
