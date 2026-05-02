import { test, expect } from '@playwright/test'

// Scenario 2: Create deck, add cards (mix Basic/Cloze), tag them.

test.describe('Deck and card creation', () => {
  test.skip(!process.env.E2E_EMAIL, 'Requires E2E_EMAIL and E2E_PASSWORD env vars')

  test('create a deck', async ({ page }) => {
    await page.goto('/library')
    // Click "New Deck" — button text may vary slightly
    const newDeckBtn = page.getByRole('button', { name: /new deck/i })
    await expect(newDeckBtn).toBeVisible({ timeout: 10000 })
    await newDeckBtn.click()
    // Fill deck name and submit
    const nameInput = page.getByPlaceholder(/deck name/i)
    await nameInput.fill('E2E Test Deck')
    await page.getByRole('button', { name: /^create|^save/i }).first().click()
    // Deck should appear
    await expect(page.getByText('E2E Test Deck')).toBeVisible({ timeout: 10000 })
  })

  test('add a basic card', async ({ page }) => {
    await page.goto('/library')
    // Navigate into the test deck
    await page.getByText('E2E Test Deck').click()
    await page.getByRole('button', { name: /add card/i }).click()
    await page.getByLabel(/front/i).fill('What is the capital of France?')
    await page.getByLabel(/back/i).fill('Paris')
    await page.getByRole('button', { name: /save/i }).click()
    // Card should appear in the list
    await expect(page.getByText('What is the capital of France?')).toBeVisible({ timeout: 10000 })
  })

  test('add a cloze card', async ({ page }) => {
    await page.goto('/library')
    await page.getByText('E2E Test Deck').click()
    await page.getByRole('button', { name: /add card/i }).click()
    // Select Cloze type if a type selector exists
    const typeSelect = page.getByRole('combobox', { name: /type|card type/i })
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption({ label: /cloze/i })
    }
    await page.getByLabel(/front|text/i).fill('The mitochondria is the {{c1::powerhouse}} of the cell.')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page.getByText(/mitochondria/i)).toBeVisible({ timeout: 10000 })
  })
})
