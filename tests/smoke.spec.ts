import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_IMAGE = path.join(__dirname, 'fixtures', 'sample.png')

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

async function gotoFresh(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(() => {
    try { window.localStorage.clear() } catch {}
  })
  await page.reload()
  await expect(page.getByRole('button', { name: /Dashboard/i }).first()).toBeVisible()
}

test.describe('GEO operations smoke harness', () => {
  test('dashboard renders the welcome banner, KPIs, and recent events', async ({ page }) => {
    await gotoFresh(page)
    await expect(page.getByRole('heading', { level: 2, name: /Run the question-to-validation flow/i })).toBeVisible()
    await expect(page.getByText(/Keyword coverage/i).first()).toBeVisible()
    await expect(page.getByText(/Content output/i).first()).toBeVisible()
    await expect(page.getByText(/Brand exposure/i).first()).toBeVisible()
    await expect(page.getByText(/Model calls/i).first()).toBeVisible()
    await expect(page.getByText(/Recent operating events/i)).toBeVisible()
    await expect(page.getByText(/v0\.8\.4/).first()).toBeVisible()
  })

  test('language toggle switches UI strings to Chinese and back', async ({ page }) => {
    await gotoFresh(page)
    await expect(page.getByRole('heading', { level: 2, name: /Run the question-to-validation flow/i })).toBeVisible()
    await page.locator('.language-toggle').click()
    await expect(page.getByRole('heading', { level: 2, name: /运行从问题到验证的流程/ })).toBeVisible()
    await page.locator('.language-toggle').click()
    await expect(page.getByRole('heading', { level: 2, name: /Run the question-to-validation flow/i })).toBeVisible()
  })

  test('theme toggle flips between light and dark mode', async ({ page }) => {
    await gotoFresh(page)
    const root = page.locator('html')
    const initialTheme = (await root.getAttribute('data-theme')) || 'light'
    await page.locator('button[aria-label="Toggle theme"]').click()
    const afterDark = await root.getAttribute('data-theme')
    expect(afterDark).not.toEqual(initialTheme)
    await page.locator('button[aria-label="Toggle theme"]').click()
    const afterLight = await root.getAttribute('data-theme')
    expect(afterLight).toEqual(initialTheme)
  })

  test('image library: sample placeholder flow adds a record', async ({ page }) => {
    await gotoFresh(page)
    await page.getByRole('button', { name: /^Image Libraries$/i }).first().click()
    await page.getByText('Brand Kit').first().click()
    await page.getByRole('button', { name: /Add image/i }).click()
    await page.getByPlaceholder('e.g. workflow-note.png').fill('smoke-sample.png')
    await page.getByRole('button', { name: /Add sample placeholder/i }).click()
    await expect(page.getByText('smoke-sample.png')).toBeVisible()
  })

  test('image library: real file upload stores a base64 data URL and persists', async ({ page }) => {
    await gotoFresh(page)
    await page.getByRole('button', { name: /^Image Libraries$/i }).first().click()
    await page.getByText('Brand Kit').first().click()
    await page.getByRole('button', { name: /Add image/i }).click()
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(FIXTURE_IMAGE)
    await expect(page.getByText(/Uploaded from device/i).first()).toBeVisible({ timeout: 10_000 })
    const imgs = page.locator('.image-thumb-img')
    await expect(imgs.first()).toBeVisible()
    const src = await imgs.first().getAttribute('src')
    expect(src).toMatch(/^data:image\//)
    await page.reload()
    await page.getByRole('button', { name: /^Image Libraries$/i }).first().click()
    await page.getByText('Brand Kit').first().click()
    await expect(page.locator('.image-thumb-img').first()).toBeVisible()
  })

  test('localStorage round-trips a custom keyword set', async ({ page }) => {
    await gotoFresh(page)
    await page.getByRole('button', { name: /Keyword Distillation/i }).first().click()
    await page.getByRole('button', { name: /New keyword set/i }).click()
    await page.getByPlaceholder('e.g. Operations planning').fill('Smoke keyword set')
    await page.getByRole('button', { name: /Create record/i }).click()
    await expect(page.getByRole('heading', { name: 'Smoke keyword set', level: 3 })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: /Keyword Distillation/i }).first().click()
    await expect(page.getByRole('heading', { name: 'Smoke keyword set', level: 3 })).toBeVisible()
  })

  test('reset local demo restores the seed snapshot', async ({ page }) => {
    await gotoFresh(page)
    await page.getByRole('button', { name: /Keyword Distillation/i }).first().click()
    await page.getByRole('button', { name: /New keyword set/i }).click()
    await page.getByPlaceholder('e.g. Operations planning').fill('Throwaway set')
    await page.getByRole('button', { name: /Create record/i }).click()
    await expect(page.getByRole('heading', { name: 'Throwaway set', level: 3 })).toBeVisible()
    await page.getByRole('button', { name: /About & Settings/i }).first().click()
    await page.getByRole('button', { name: /Reset local demo/i }).click()
    await page.getByRole('button', { name: /Keyword Distillation/i }).first().click()
    await expect(page.getByRole('heading', { name: 'Throwaway set', level: 3 })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Operations planning', level: 3 })).toBeVisible()
  })

  test('settings page shows the live writing agent panel with provider, key, and last-test fields', async ({ page }) => {
    await gotoFresh(page)
    await page.getByRole('button', { name: /About & Settings/i }).first().click()
    await expect(page.getByRole('heading', { name: /Live writing agent/i })).toBeVisible()
    await expect(page.getByText(/Tasks that select a real model call the local proxy/i)).toBeVisible()
    // The status block always renders Provider / API key / Last test regardless of whether the
    // local proxy is reachable, so we don't assert on the specific value.
    await expect(page.getByText(/^Provider$/)).toBeVisible()
    await expect(page.getByText(/^API key$/)).toBeVisible()
    await expect(page.getByText(/^Last test$/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Refresh status/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Send test ping/i })).toBeVisible()
  })

  test('automatic creation lists the seeded MiniMax pilot task with a live-agent button', async ({ page }) => {
    await gotoFresh(page)
    await page.getByRole('button', { name: /Automatic Creation/i }).first().click()
    await expect(page.getByRole('heading', { name: 'Live MiniMax pilot', level: 3 })).toBeVisible()
    await expect(page.locator('.task-card-clickable').getByRole('button', { name: /Call live agent/i }).first()).toBeVisible()
  })

  test('writing instruction cards open read-only details, then edit and save locally', async ({ page }) => {
    await gotoFresh(page)
    await page.getByRole('button', { name: /Writing Instructions/i }).first().click()
    await expect(page.getByRole('heading', { name: 'Long-form standard', level: 3 })).toBeVisible()
    await expect(page.getByRole('button', { name: /Inspect Long-form standard/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Edit Long-form standard/i })).toHaveCount(0)
    await page.locator('.instruction-card-clickable').filter({ hasText: 'Long-form standard' }).first().click()
    await expect(page.getByRole('heading', { name: /Inspect writing instruction/i })).toBeVisible()
    await expect(page.getByLabel(/^Title$/)).toBeDisabled()
    await page.getByRole('button', { name: /^Edit$/i }).click()
    await expect(page.getByRole('heading', { name: /Edit writing instruction/i })).toBeVisible()
    const editable = page.getByLabel(/^Title$/)
    await expect(editable).toBeEnabled()
    await editable.fill('Long-form standard (edited)')
    await page.getByRole('button', { name: /^Save changes$/ }).click()
    await expect(page.getByRole('heading', { name: /Edit writing instruction/i })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Long-form standard (edited)', level: 3 })).toBeVisible()
  })

  test('automatic creation cards open read-only details, then edit and save locally', async ({ page }) => {
    await gotoFresh(page)
    await page.getByRole('button', { name: /Automatic Creation/i }).first().click()
    await expect(page.getByRole('heading', { name: 'Live MiniMax pilot', level: 3 })).toBeVisible()
    await expect(page.getByRole('button', { name: /Inspect Live MiniMax pilot/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Edit Live MiniMax pilot/i })).toHaveCount(0)

    await page.locator('.task-card-clickable').filter({ hasText: 'Live MiniMax pilot' }).filter({ hasNotText: 'copy' }).first().getByRole('button', { name: /Duplicate/ }).click()
    await expect(page.getByRole('button', { name: /Create duplicated task/i })).toBeVisible()
    await expect(page.getByLabel(/^Task name$/)).toHaveValue('Live MiniMax pilot copy')
    await page.getByRole('button', { name: /Create duplicated task/i }).click()
    await expect(page.getByRole('heading', { name: 'Live MiniMax pilot copy', level: 3 })).toBeVisible()

    await page.locator('.task-card-clickable').filter({ hasText: 'Live MiniMax pilot' }).filter({ hasNotText: 'copy' }).click()
    await expect(page.getByRole('heading', { name: /Inspect creation task/i })).toBeVisible()
    await expect(page.getByLabel(/^Task name$/)).toHaveValue('Live MiniMax pilot')
    await expect(page.getByLabel(/^Target quantity$/)).toBeDisabled()
    await page.getByRole('button', { name: /^Edit$/i }).click()
    await expect(page.getByRole('heading', { name: /Edit creation task/i })).toBeVisible()
    const targetEditable = page.getByLabel(/^Target quantity$/)
    await expect(targetEditable).toBeEnabled()
    await page.getByLabel(/^Task name$/).fill('Live MiniMax pilot (edited)')
    await targetEditable.fill('6')
    await page.getByRole('button', { name: /^Save changes$/ }).click()
    await expect(page.getByRole('heading', { name: 'Live MiniMax pilot (edited)', level: 3 })).toBeVisible()
  })
})
