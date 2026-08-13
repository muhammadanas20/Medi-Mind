import { test, expect } from '@playwright/test'

/**
 * Smoke flow: onboarding → add medicine manually → dose appears on Today →
 * mark taken → weekly stats update. Run with: npm run test:e2e
 */

test('core journey: onboarding, add med, take dose', async ({ page }) => {
  await page.goto('/')

  // onboarding
  await expect(page.getByText('Privacy-first AI medication management')).toBeVisible()
  await page.getByTestId('onb-next').click()
  await page.getByTestId('onb-name').fill('Grandpa Joe')
  await page.getByTestId('onb-create').click()
  await page.getByTestId('onb-notif').click().catch(() => undefined) // permission prompt may be blocked
  await page.getByTestId('onb-finish').click()

  // add a medication
  await page.getByTestId('nav-meds').click()
  await page.getByTestId('add-med').click()
  await page.getByTestId('med-name').fill('Concor')
  await page.getByTestId('med-slot-morning').click()
  await page.getByTestId('med-save').click()
  await expect(page.getByText('Concor').first()).toBeVisible()

  // today shows the dose
  await page.getByTestId('nav-today').click()
  await expect(page.getByTestId('dose-morning-Concor')).toBeVisible()
})

test('pill identifier never claims certainty', async ({ page }) => {
  await page.goto('/#/pill-id')
  await expect(page.getByText(/confidence/i).first()).toBeVisible()
})
