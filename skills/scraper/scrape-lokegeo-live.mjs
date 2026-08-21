#!/usr/bin/env node
/**
 * scrape-lokegeo-live.mjs
 *
 * One-shot: launch an isolated Chrome, open a LokeGEO keyword URL, and print the
 * question list as JSON/JSONL. See scrape-lokegeo-watch.mjs for continuous mode.
 *
 * USAGE
 *   node scrape-lokegeo-live.mjs --url "https://geo.dolewa.com/keywords/<id>"
 *         [--format json|jsonl] [--out file] [--keyword TEXT] [--brand TEXT] [--timeout 180000]
 *
 * First run: sign in to LokeGEO once in the opened window; the session is saved
 * in the dedicated profile (~/.lokegeo-scraper-profile) and reused after that.
 */

import fs from 'node:fs/promises'
import {
  loadPuppeteer, PROFILE_DIR, sleep, buildTrainingPairs, launchOwnChrome, hasKeywordTable, extractInBrowser,
} from './lokegeo-common.mjs'

const DEFAULT_TIMEOUT_MS = 180_000

function parseArgs(argv) {
  const args = { format: 'json', keyword: '', brand: '', url: '', out: '', timeout: DEFAULT_TIMEOUT_MS }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--url') args.url = argv[++i]
    else if (flag === '--format') args.format = argv[++i]
    else if (flag === '--keyword') args.keyword = argv[++i]
    else if (flag === '--brand') args.brand = argv[++i]
    else if (flag === '--out') args.out = argv[++i]
    else if (flag === '--timeout') args.timeout = Number(argv[++i]) || DEFAULT_TIMEOUT_MS
    else if (flag === '--help' || flag === '-h') args.help = true
  }
  return args
}

async function waitForTable(page, timeoutMs) {
  const started = Date.now()
  let hintPrinted = false
  while (Date.now() - started < timeoutMs) {
    if (await hasKeywordTable(page)) {
      await sleep(1200) // let remaining rows finish rendering
      return true
    }
    if (/\/login/i.test(page.url()) && !hintPrinted) {
      console.error('>> 未登录：请在打开的 Chrome 窗口中完成登录（仅第一次需要），脚本会自动继续。')
      hintPrinted = true
    }
    await sleep(1500)
  }
  return false
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.url) {
    console.error([
      'Usage: node scrape-lokegeo-live.mjs --url "https://geo.dolewa.com/keywords/<id>" [options]',
      '',
      'Launches its own Chrome, opens the keyword page, and prints the questions.',
      '',
      '  --url URL      keyword detail page to scrape (required)',
      '  --format json  (default) full JSON: questions + training_pairs',
      '  --format jsonl one line per training pair {keyword, count, questions}',
      '  --out FILE     write to a file instead of stdout',
      '  --keyword TEXT override the auto-detected keyword',
      '  --brand TEXT   override the auto-detected brand',
      '  --timeout MS   how long to wait for login/render (default 180000)',
    ].join('\n'))
    process.exit(args.help ? 0 : 1)
  }

  const puppeteer = await loadPuppeteer()
  if (!puppeteer) {
    console.error('Error: puppeteer-core not found (expected in the parent geo-system project).')
    process.exit(1)
  }

  const { browser, page } = await launchOwnChrome(puppeteer)
  try {
    await page.goto(args.url, { waitUntil: 'load', timeout: 60_000 }).catch(() => {})
    const ready = await waitForTable(page, args.timeout)
    if (!ready) {
      console.error('Error: the keyword table never appeared (login not completed, wrong URL, or the page changed).')
      process.exit(2)
    }

    const { keyword, brand, questions } = await extractInBrowser(page)
    if (!questions.length) {
      console.error('Error: no questions were extracted from the page.')
      process.exit(3)
    }

    const finalKeyword = args.keyword || keyword || '未命名关键词'
    const result = {
      source_url: args.url,
      scraped_at: new Date().toISOString(),
      keyword: finalKeyword,
      brand: args.brand || brand,
      total_count: questions.length,
      questions,
      training_pairs: buildTrainingPairs(finalKeyword, questions),
    }

    let output
    if (args.format === 'jsonl') {
      output = result.training_pairs.map(pair => JSON.stringify(pair)).join('\n') + '\n'
    } else {
      output = JSON.stringify(result, null, 2) + '\n'
    }

    if (args.out) await fs.writeFile(args.out, output, 'utf8')
    else process.stdout.write(output)
  } finally {
    await browser.close().catch(() => {})
  }
}

main().catch(error => {
  console.error(`Error: ${error.message}`)
  process.exit(1)
})
