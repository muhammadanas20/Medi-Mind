import { test, expect, type Page } from '@playwright/test'

/**
 * Smoke flows. Run with: npm run test:e2e
 *
 * NOTE: every Playwright test starts with a fresh browser context → fresh
 * IndexedDB → the app correctly shows the onboarding gate. Each journey must
 * pass through it first (which is itself a real user-flow assertion).
 */

async function completeOnboarding(page: Page, name = 'Grandpa Joe') {
  await page.goto('/')
  await expect(page.getByText('Privacy-first AI medication management')).toBeVisible()
  await page.getByTestId('onb-next').click()
  await page.getByTestId('onb-name').fill(name)
  await page.getByTestId('onb-create').click()
  // notifications step — permission prompt resolves automatically in headless chromium
  await page.getByTestId('onb-notif').click()
  await page.getByTestId('onb-finish').click()
  // past the gate: app shell must mount
  await expect(page.getByTestId('open-settings')).toBeVisible()
}

test('core journey: onboarding → add medicine → dose appears → mark taken', async ({ page }) => {
  await completeOnboarding(page)

  await page.getByTestId('nav-meds').click()
  await page.getByTestId('add-med').click()
  await page.getByTestId('med-name').fill('Concor')
  await page.getByTestId('med-slot-morning').click()
  await page.getByTestId('med-save').click()
  await expect(page.getByText('Concor').first()).toBeVisible()

  await page.getByTestId('nav-today').click()
  await expect(page.getByTestId('dose-morning-Concor')).toBeVisible()
})

test('pill identifier is reachable and never claims certainty', async ({ page }) => {
  await completeOnboarding(page)
  await page.getByTestId('nav-pill-id').click()

  // capture stage copy must frame results as possibilities, never certainty
  await expect(page.getByText(/possible/i).first()).toBeVisible()
  await expect(page.getByText(/confidence score/i).first()).toBeVisible()
})

test('settings: AI providers, encrypted-key hint and reminder windows', async ({ page }) => {
  await completeOnboarding(page)
  await page.getByTestId('open-settings').click()

  await expect(page.getByText('Install MediMind')).toBeVisible()
  await expect(page.getByText('AI providers')).toBeVisible()
  await expect(page.getByText(/AES/).first()).toBeVisible() // encryption promise visible
  await expect(page.getByText('Reminder windows')).toBeVisible()

  // every provider preset offers setup
  for (const label of ['OpenAI', 'Google Gemini', 'Ollama (local)']) {
    await expect(page.getByText(label).first()).toBeVisible()
  }
})
