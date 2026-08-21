// lokegeo-common.mjs — shared helpers for the LokeGEO scrapers.
// Launches an isolated Chrome (its own profile, so your normal browser is
// untouched) and reads the question list out of its tabs via the DevTools
// protocol (read-only). Both the one-shot and the watch scripts import from here.

import os from 'node:os'
import path from 'node:path'
import { loadPuppeteer, browserExecutablePath, launchBrowser } from '../publisher/puppeteer.mjs'

export { loadPuppeteer }

// Dedicated, persistent Chrome profile for the scraper. Login cookies are saved
// here, so after you sign in once, later runs start already logged in.
export const PROFILE_DIR = process.env.LOKEGEO_PROFILE_DIR || path.join(os.homedir(), '.lokegeo-scraper-profile')
export const BASE_URL = process.env.LOKEGEO_BASE_URL || 'https://geo.dolewa.com/'
export const TRAINING_COUNTS = [3, 5, 10, 20, 50]

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export function buildTrainingPairs(keyword, questions) {
  const counts = [...new Set([...TRAINING_COUNTS, questions.length])]
    .filter(n => n > 0 && n <= questions.length)
    .sort((a, b) => a - b)
  return counts.map(count => ({ keyword, count, questions: questions.slice(0, count) }))
}

// Launch our own headful Chrome (isolated profile) and return the browser plus
// a page to drive. Uses the parent project's LaunchServices/CDP launcher so it
// avoids the direct-binary SIGABRT crash on macOS.
export async function launchOwnChrome(puppeteer) {
  const browser = await launchBrowser(puppeteer, {
    headless: false,
    userDataDir: PROFILE_DIR,
    executablePath: browserExecutablePath(),
  })
  const pages = await browser.pages()
  const page = pages.find(candidate => !candidate.isClosed()) || await browser.newPage()
  return { browser, page }
}

export function isKeywordUrl(url) {
  return /geo\.dolewa\.com\/keywords\//.test(url)
}

export function hasKeywordTable(page) {
  return page.evaluate(() => {
    const cells = document.querySelectorAll('table th, table td')
    return [...cells].some(cell => /关键词文本/.test((cell.innerText || cell.textContent || '').trim()))
  }).catch(() => false)
}

// Find an open tab showing a LokeGEO keyword page (by URL, then by table).
export async function findKeywordPage(browser) {
  const pages = await browser.pages()
  for (const page of pages) {
    if (page.isClosed()) continue
    if (isKeywordUrl(page.url())) return page
  }
  for (const page of pages) {
    if (page.isClosed()) continue
    if (await hasKeywordTable(page)) return page
  }
  return null
}

export async function extractInBrowser(page) {
  return page.evaluate(() => {
    const text = el => (el?.innerText || el?.textContent || '').trim()

    const keyword = text(document.querySelector('h1'))

    let brand = ''
    const brandMatch = document.body.innerText.match(/品牌[：:]\s*([^\s　·\n]+)/)
    if (brandMatch) brand = brandMatch[1]

    const questions = []
    const tables = [...document.querySelectorAll('table')]
    for (const table of tables) {
      const rows = [...table.querySelectorAll('tr')]
      const headerIdx = rows.findIndex(row => [...row.querySelectorAll('th, td')].some(cell => /关键词文本/.test(text(cell))))
      if (headerIdx === -1) continue
      for (const row of rows.slice(headerIdx + 1)) {
        const question = text(row.querySelector('td'))
        if (question) questions.push(question)
      }
      break
    }
    return { keyword, brand, questions }
  })
}
