import { test, expect } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

async function gotoFresh(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: /Run the question-to-validation flow/i })).toBeVisible()
}

test.describe('exposure tracking', () => {
  test('dashboard omits exposure panel until a tracked metric exists', async ({ page }) => {
    await gotoFresh(page)
    await expect(page.getByTestId('exposure-tracking-panel')).toHaveCount(0)
    await expect(page.getByText('1,284')).toHaveCount(0)
  })

  test('guided local validation adds a tracked exposure signal', async ({ page }) => {
    await gotoFresh(page)
    await page.getByRole('button', { name: /Open and use this knowledge base/i }).click()
    await page.getByRole('button', { name: /^Continue$/i }).click()
    await page.getByRole('button', { name: /Use this question/i }).click()
    await page.getByRole('button', { name: /Generate local article/i }).click()
    await page.getByRole('button', { name: /Stage local task/i }).click()
    await page.getByRole('button', { name: /Create validation result/i }).click()
    const panel = page.getByTestId('exposure-tracking-panel')
    await expect(panel.getByText('Tracked checks').locator('..').getByText('1')).toBeVisible()
    await expect(panel.getByText(/76%/).first()).toBeVisible()
  })
})
