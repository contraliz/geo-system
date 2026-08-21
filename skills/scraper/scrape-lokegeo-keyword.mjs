#!/usr/bin/env node
/**
 * scrape-lokegeo-keyword.mjs
 *
 * Scrapes a LokeGEO PRO keyword detail page (saved as HTML) into structured
 * JSON that can train a "蒸馏关键词" (keyword-distillation) skill.
 *
 * The target page is behind login (geo.dolewa.com/keywords/<id> redirects to
 * /login for anonymous requests), so this script reads a SAVED HTML file rather
 * than fetching the live page. In your logged-in browser, open the keyword page,
 * then save it (Cmd+S, "Web Page, HTML Only") or copy the rendered HTML and pass
 * the file path here.
 *
 * ---------------------------------------------------------------------------
 * OUTPUT FORMAT
 * ---------------------------------------------------------------------------
 * `--format json` (default) emits one JSON object:
 *
 * {
 *   "source_url": "https://geo.dolewa.com/keywords/<id>",
 *   "scraped_at": "2026-08-20T03:08:37.532Z",
 *   "keyword": "无感睡眠呼吸监测仪",          // page title / distill keyword
 *   "brand": "讯可安,镭达晶元",                // best-effort; use --brand to override
 *   "total_count": 50,                        // number of scraped questions
 *   "questions": [                            // 关键词文本 only (text)
 *     "专业的无感睡眠监护仪哪家好",
 *     "无感睡眠监测仪适合老年人吗"
 *   ],
 *   "training_pairs": [                       // ready-to-train (keyword, N) -> N questions
 *     { "keyword": "无感睡眠呼吸监测仪", "count": 3,  "questions": ["q1", "q2", "q3"] },
 *     { "keyword": "无感睡眠呼吸监测仪", "count": 5,  "questions": ["q1", "q2", "q3", "q4", "q5"] },
 *     { "keyword": "无感睡眠呼吸监测仪", "count": 10, "questions": [ ... ] },
 *     { "keyword": "无感睡眠呼吸监测仪", "count": 20, "questions": [ ... ] },
 *     { "keyword": "无感睡眠呼吸监测仪", "count": 50, "questions": [ ... ] }
 *   ]
 * }
 *
 * The skill contract is: input = (keyword, count) -> output = exactly `count`
 * questions. `training_pairs` therefore emits the same keyword at several counts
 * (3/5/10/20/50 and the page's own total), each mapped to the first N scraped
 * questions. To aggregate many pages into one training file, use:
 *
 *   node scrape-lokegeo-keyword.mjs page1.html --format jsonl >> training.jsonl
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *   node scrape-lokegeo-keyword.mjs <saved.html> [--format json|jsonl]
 *         [--keyword "text"] [--brand "text"] [--url "https://..."] [--out file]
 *
 * This file is dependency-free: it runs with plain `node` (ESM).
 */

import fs from 'node:fs/promises'

// ---- minimal HTML text extraction ----------------------------------------

const NAMED_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ',
}

function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[match] ?? match
  })
}

function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).trim()
}

function firstTagText(html, tag) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return match ? stripTags(match[1]) : ''
}

function allTableInners(html) {
  const out = []
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi
  let match
  while ((match = re.exec(html))) out.push(match[1])
  return out
}

function rowsOf(tableInner) {
  const out = []
  const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let match
  while ((match = re.exec(tableInner))) out.push(match[1])
  return out
}

function cellsOf(rowInner) {
  const out = []
  const re = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi
  let match
  while ((match = re.exec(rowInner))) out.push(match[1])
  return out
}

// ---- page structure extraction -------------------------------------------

// Return the row-HTML array of the table whose header contains 关键词文本.
function findEntriesRows(html) {
  for (const inner of allTableInners(html)) {
    const rows = rowsOf(inner)
    for (const row of rows) {
      const cells = cellsOf(row).map(stripTags)
      if (cells.some(cell => /关键词文本/.test(cell))) return rows
    }
  }
  return null
}

function extractKeyword(html) {
  const h1 = firstTagText(html, 'h1')
  if (h1) return h1
  const title = firstTagText(html, 'title')
  return title ? title.replace(/\s*[-|–—|·]\s*.*$/, '').trim() : ''
}

// Best-effort brand; the DOM varies, so prefer the --brand override.
function extractBrand(html) {
  // 品牌：<span>讯可安,镭达晶元</span> — capture the text right after the label.
  const labeled = html.match(/品牌\s*[：:]\s*<[^>]*>([\s\S]*?)<\/[^>]+>/i)
  if (labeled) {
    const text = stripTags(labeled[1])
    if (text) return text
  }
  const candidates = [
    /<[^>]+class="[^"]*(?:brand|subtitle|sub-title|company)[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<small\b[^>]*>([\s\S]*?)<\/small>/i,
  ]
  for (const re of candidates) {
    const match = html.match(re)
    if (match) {
      const text = stripTags(match[1])
      if (text) return text
    }
  }
  return ''
}

// The question is the first cell of a row (the 关键词文本 column).
function extractQuestionText(rowInner) {
  return stripTags(cellsOf(rowInner)[0] || '')
}

const TRAINING_COUNTS = [3, 5, 10, 20, 50]

function buildTrainingPairs(keyword, questions) {
  const counts = [...new Set([...TRAINING_COUNTS, questions.length])]
    .filter(n => n > 0 && n <= questions.length)
    .sort((a, b) => a - b)
  return counts.map(count => ({ keyword, count, questions: questions.slice(0, count) }))
}

// ---- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const args = { format: 'json', keyword: '', brand: '', url: '', out: '', input: '' }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--format') args.format = argv[++i]
    else if (flag === '--keyword') args.keyword = argv[++i]
    else if (flag === '--brand') args.brand = argv[++i]
    else if (flag === '--url') args.url = argv[++i]
    else if (flag === '--out') args.out = argv[++i]
    else if (flag === '--help' || flag === '-h') args.help = true
    else if (!flag.startsWith('--')) args.input = flag
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.input) {
    console.error([
      'Usage: node scrape-lokegeo-keyword.mjs <saved.html> [options]',
      '',
      '  <saved.html>   Saved LokeGEO keyword page (Cmd+S, "HTML Only") or a plain URL',
      '  --format json  (default) full JSON: entries + training_pairs',
      '  --format jsonl one line per training pair {keyword, count, questions}',
      '  --keyword TEXT override the auto-detected keyword (page title)',
      '  --brand TEXT   override the auto-detected brand',
      '  --url URL      record the source URL in the output',
      '  --out FILE     write to a file instead of stdout',
    ].join('\n'))
    process.exit(args.help ? 0 : 1)
  }

  let html
  if (/^https?:\/\//i.test(args.input)) {
    const response = await fetch(args.input)
    if (!response.ok) throw new Error(`Fetch failed: HTTP ${response.status}`)
    html = await response.text()
  } else {
    html = await fs.readFile(args.input, 'utf8')
  }

  const rows = findEntriesRows(html)
  if (!rows) {
    console.error('Could not find a table with a "关键词文本" column.')
    console.error('The page may use div-based rows or be JS-rendered (saved file may be incomplete).')
    console.error('Save the rendered page again ("HTML Only") or attach the HTML so the selectors can be adjusted.')
    process.exit(2)
  }

  const questions = []
  for (const row of rows) {
    const cells = cellsOf(row).map(stripTags)
    if (cells.some(cell => /关键词文本/.test(cell))) continue // header row
    const text = extractQuestionText(row)
    if (text) questions.push(text)
  }
  if (!questions.length) {
    console.error('Found the table header but no data rows were parsed.')
    process.exit(3)
  }

  const keyword = args.keyword || extractKeyword(html) || '未命名关键词'
  const brand = args.brand || extractBrand(html)
  const sourceUrl = args.url || args.input

  const result = {
    source_url: sourceUrl,
    scraped_at: new Date().toISOString(),
    keyword,
    brand,
    total_count: questions.length,
    questions,
    training_pairs: buildTrainingPairs(keyword, questions),
  }

  let output
  if (args.format === 'jsonl') {
    output = result.training_pairs.map(pair => JSON.stringify(pair)).join('\n') + '\n'
  } else {
    output = JSON.stringify(result, null, 2) + '\n'
  }

  if (args.out) await fs.writeFile(args.out, output, 'utf8')
  else process.stdout.write(output)
}

main().catch(error => {
  console.error(`Error: ${error.message}`)
  process.exit(1)
})
