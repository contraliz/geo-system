#!/usr/bin/env node
/**
 * scrape-lokegeo-watch.mjs
 *
 * Manual-trigger recorder. It launches its own isolated Chrome, then you drive
 * the terminal: open a keyword page in that window and press Enter here to read
 * + record it. Type `q` to stop.
 *
 *   node scrape-lokegeo-watch.mjs [--records records.jsonl] [--training training.jsonl]
 *
 * First run: sign in to LokeGEO once in the opened window; the session is saved
 * in the dedicated profile (~/.lokegeo-scraper-profile) and reused after that.
 *
 * On each Enter press it appends the current keyword page:
 *   - one line to records.jsonl:   { keyword, brand, source_url, scraped_at, questions[] }
 *   - training pairs to training.jsonl: { keyword, count, questions[] } (counts 3/5/10/20/50)
 *
 * Each page is recorded once (deduped by URL). Ctrl+C also quits. Your normal
 * Chrome is never touched.
 */

import fs from 'node:fs/promises'
import readline from 'node:readline'
import {
  loadPuppeteer, PROFILE_DIR, BASE_URL, buildTrainingPairs, launchOwnChrome, isKeywordUrl, extractInBrowser,
} from './lokegeo-common.mjs'

function parseArgs(argv) {
  const args = { records: 'records.jsonl', training: 'training.jsonl' }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--records') args.records = argv[++i]
    else if (flag === '--training') args.training = argv[++i]
    else if (flag === '--help' || flag === '-h') args.help = true
  }
  return args
}

async function appendLine(file, line) {
  await fs.appendFile(file, line + '\n', 'utf8')
}

async function record(page, { recordsFile, trainingFile }) {
  const { keyword, brand, questions } = await extractInBrowser(page)
  if (!questions.length) return null

  const finalKeyword = keyword || '未命名关键词'
  const record = {
    keyword: finalKeyword,
    brand,
    source_url: page.url(),
    scraped_at: new Date().toISOString(),
    questions,
  }
  await appendLine(recordsFile, JSON.stringify(record))
  for (const pair of buildTrainingPairs(finalKeyword, questions)) {
    await appendLine(trainingFile, JSON.stringify(pair))
  }
  return { keyword: finalKeyword, count: questions.length }
}

// Find the keyword page to read: prefer the foreground (visible) tab, otherwise
// the most recently opened one.
async function readCurrentPage(browser) {
  const pages = await browser.pages()
  const keywordPages = pages.filter(p => !p.isClosed() && isKeywordUrl(p.url()))
  if (!keywordPages.length) return null
  for (const p of keywordPages) {
    const visible = await p.evaluate(() => document.visibilityState === 'visible').catch(() => false)
    if (visible) return p
  }
  return keywordPages[keywordPages.length - 1]
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.error([
      'Usage: node scrape-lokegeo-watch.mjs [options]',
      '',
      'Launches its own Chrome, then you press Enter to read + record the',
      'keyword page currently open in it. Type `q` to quit.',
      '',
      '  --records FILE   raw records, one {keyword, questions[]} per line (default records.jsonl)',
      '  --training FILE  training pairs {keyword, count, questions} (default training.jsonl)',
    ].join('\n'))
    process.exit(0)
  }

  const puppeteer = await loadPuppeteer()
  if (!puppeteer) {
    console.error('Error: puppeteer-core not found (expected in the parent geo-system project).')
    process.exit(1)
  }

  const { browser, page } = await launchOwnChrome(puppeteer)
  await page.goto(BASE_URL, { waitUntil: 'load' }).catch(() => {})

  const seen = new Set()
  let recorded = 0
  let stopping = false

  const cleanup = async () => {
    if (stopping) return
    stopping = true
    console.error(`\n>> 已停止。共记录 ${recorded} 个关键词 → ${args.records} / ${args.training}`)
    await browser.close().catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', () => { void cleanup() })

  console.error('>> 已启动 Chrome（独立配置目录 ' + PROFILE_DIR + '）。')
  console.error('>> 在这个 Chrome 窗口登录 LokeGEO（首次），打开一个关键词页，然后回到这里按回车记录。')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const prompt = () => process.stdout.write('>> 按回车记录当前关键词页 | q 退出\n')

  prompt()
  for await (const line of rl) {
    const cmd = line.trim().toLowerCase()
    if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
      rl.close()
      break
    }
    try {
      const target = await readCurrentPage(browser)
      if (!target) {
        console.error('>> 未检测到关键词页面。请先在 Chrome 里打开 geo.dolewa.com/keywords/<id>。')
      } else if (seen.has(target.url())) {
        console.error(`>> 该页已记录过，跳过：${target.url()}`)
      } else {
        seen.add(target.url())
        const result = await record(target, { recordsFile: args.records, trainingFile: args.training })
        if (result) {
          recorded++
          console.error(`✓ 已记录：${result.keyword}（${result.count} 问句）`)
        } else {
          console.error('>> 未能从该页提取到问句。')
        }
      }
    } catch (error) {
      console.error(`>> 读取失败：${error.message}`)
    }
    prompt()
  }

  await cleanup()
}

main().catch(error => {
  console.error(`Error: ${error.message}`)
  process.exit(1)
})
