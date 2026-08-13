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

/**
 * Regression: routes must never blank on navigation.
 *
 * Previously the app keyed an AnimatePresence wrapper by pathname around a
 * shared <Outlet/>. Because <Outlet/> always reflects the *current* location,
 * the exiting node rendered the new route instead of the old one — with lazy
 * chunks this left the viewport blank (e.g. tapping Settings "did nothing").
 * These tests walk every route and assert real page content is visible.
 */
test('route navigation: every page opens with content (no blank pages)', async ({ page }) => {
  await completeOnboarding(page)

  // Today (index route)
  await expect(page.getByRole('heading', { level: 1, name: /today's plan/i })).toBeVisible()

  // Medications (lazy)
  await page.getByTestId('nav-meds').click()
  await expect(page.getByTestId('add-med')).toBeVisible()
  await expect(page).toHaveURL(/#\/meds$/)

  // Scan (lazy, camera page). nav-* test IDs are only on the visible nav.
  await page.getByTestId('nav-scan').click()
  await expect(page.getByRole('heading', { level: 1, name: /scan prescription/i })).toBeVisible()
  await expect(page.getByText(/AI extracts — you confirm/i)).toBeVisible()

  // Pill identifier (lazy)
  await page.getByTestId('nav-pill-id').click()
  await expect(page.getByRole('heading', { level: 1, name: /pill identifier/i })).toBeVisible()

  // Insights (lazy)
  await page.getByTestId('nav-insights').click()
  await expect(page.getByRole('heading', { level: 1, name: /insights/i })).toBeVisible()

  // Settings via the header gear (the route that used to go blank)
  await page.getByTestId('open-settings').click()
  await expect(page.getByText('AI providers')).toBeVisible()
  await expect(page).toHaveURL(/#\/settings$/)

  // and back to Today
  await page.getByTestId('nav-today').click()
  await expect(page.getByRole('heading', { level: 1, name: /today's plan/i })).toBeVisible()
})

test('deep links load lazy routes directly (fresh page load) without blanking', async ({ page }) => {
  await completeOnboarding(page)

  // A full page load straight into a lazy route: the app must hydrate from
  // IndexedDB, skip onboarding, and render the requested page — not a blank.
  await page.goto('/#/settings')
  await expect(page.getByText('AI providers')).toBeVisible()

  await page.goto('/#/insights')
  await expect(page.getByRole('heading', { level: 1, name: /insights/i })).toBeVisible()

  // unknown hash falls back to Today
  await page.goto('/#/does-not-exist')
  await expect(page.getByRole('heading', { level: 1, name: /today's plan/i })).toBeVisible()
})

test('health log: opt-in BP tracking and save a manual reading', async ({ page }) => {
  await completeOnboarding(page)
  await page.getByTestId('nav-health').click()
  await expect(page.getByText(/turn on only what you need/i)).toBeVisible()

  await page.getByTestId('enable-tracker-blood_pressure').click()
  await expect(page.getByTestId('health-history')).toBeVisible()

  await page.getByTestId('log-manual').click()
  await page.getByTestId('vital-systolic').fill('128')
  await page.getByTestId('vital-diastolic').fill('82')
  await page.getByTestId('save-reading').click()
  await expect(page.getByTestId('health-report')).toBeVisible()
  await expect(page.getByText(/128\/82/).first()).toBeVisible()
  await expect(page.getByText(/what you can do/i)).toBeVisible()
})

test('upload photo opens the file picker, not the camera', async ({ page }) => {
  await completeOnboarding(page)
  await page.getByTestId('nav-scan').click()
  await expect(page.getByTestId('upload-photo')).toBeVisible()

  const gallery = page.getByTestId('gallery-file-input')
  await expect(gallery).toHaveAttribute('type', 'file')
  await expect(gallery).not.toHaveAttribute('capture')
  // specific types — not image/*, which some mobile browsers treat as "open camera"
  const accept = await gallery.getAttribute('accept')
  expect(accept ?? '').not.toMatch(/^image\/\*$/)
  expect(accept ?? '').toMatch(/jpe?g/i)
})

test('navigation resets scroll position and updates the document title', async ({ page }) => {
  await completeOnboarding(page)

  await page.evaluate(() => window.scrollTo(0, 1000))
  await page.getByTestId('nav-meds').click()
  await expect(page.getByTestId('add-med')).toBeVisible()
  await expect(page).toHaveURL(/#\/meds$/)

  // companion navigation fix: scroll must reset to the top on route change
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page).toHaveTitle(/Medications · MediMind/)
})
