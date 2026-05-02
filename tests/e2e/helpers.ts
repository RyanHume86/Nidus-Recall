import type { Page } from '@playwright/test'

// ── Auth helpers ────────────────────────────────────────────────────────────

/** Log in with Base44 test credentials. */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL('**/library', { timeout: 15000 })
}

/** Wait for app ready state (spinner gone, content visible). */
export async function waitForReady(page: Page) {
  await page.waitForSelector('[data-testid="library-view"], [data-testid="home-ready"]', { timeout: 15000 })
}

// ── Deck helpers ────────────────────────────────────────────────────────────

export async function createDeck(page: Page, name: string) {
  const btn = page.getByRole('button', { name: /new deck/i })
  await btn.click()
  await page.getByPlaceholder(/deck name/i).fill(name)
  await page.getByRole('button', { name: /^create/i }).click()
}

// ── Card helpers ────────────────────────────────────────────────────────────

export async function addBasicCard(page: Page, front: string, back: string, tags?: string[]) {
  await page.getByRole('button', { name: /add card/i }).click()
  await page.getByLabel(/front/i).fill(front)
  await page.getByLabel(/back/i).fill(back)
  if (tags?.length) {
    for (const tag of tags) {
      await page.getByLabel(/tags/i).fill(tag)
      await page.keyboard.press('Enter')
    }
  }
  await page.getByRole('button', { name: /save/i }).click()
}

// ── Session helpers ─────────────────────────────────────────────────────────

type Rating = 'Again' | 'Hard' | 'Good' | 'Easy'

export async function rateCard(page: Page, rating: Rating) {
  await page.getByRole('button', { name: rating, exact: true }).click()
}
