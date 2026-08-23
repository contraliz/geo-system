import fs from 'node:fs/promises'
import path from 'node:path'

const MAX_MARKDOWN_LENGTH = 200_000
const MAX_SNAPSHOT_HTML = 250_000
const MAX_SNAPSHOT_TEXT = 6_000
const SECRET_KEY = /(cookie|token|secret|password|authorization|session|csrf|bearer)/i
const SECRET_ATTRIBUTE = /(?:cookie|token|secret|password|authorization|session|csrf|bearer)/i

export function snapshotAttributeIsSensitive(name) {
  return /^on[a-z]+$/i.test(String(name || '')) || SECRET_ATTRIBUTE.test(String(name || ''))
}

export function sanitizeSnapshotHtmlFallback(markup) {
  return String(markup || '')
    .replace(/<\/?(?:script|noscript)\b[^>]*>[\s\S]*?<\/?(?:script|noscript)\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+[^=\s]*(?:cookie|token|secret|password|authorization|session|csrf|bearer)[^=\s]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(<(?:input|textarea|select|option)\b[^>]*?)\s+(?:value|checked|selected)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '$1')
    .replace(/(<textarea\b[^>]*>)[\s\S]*?(<\/textarea>)/gi, '$1$2')
    .slice(0, MAX_SNAPSHOT_HTML)
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value))
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

export function extractFirstMarkdownImage(markdown) {
  const match = String(markdown || '').match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+[^)]*)?\)/i)
  return match ? match[1] : null
}

function inlineMarkdown(value) {
  let text = escapeHtml(value)
  text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+[^)]*)?\)/gi, (_match, alt, url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)(?:\s+[^)]*)?\)/gi, (_match, label, url) => `<a href="${escapeHtml(url)}" rel="noreferrer noopener">${label}</a>`)
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>').replace(/\n/g, '<br>')
  return text
}

export function markdownToSafeHtml(markdown) {
  const source = String(markdown || '').slice(0, MAX_MARKDOWN_LENGTH).replace(/\r\n?/g, '\n')
  const lines = source.split('\n')
  const output = []
  let paragraph = []
  let listType = null
  let code = null
  const flushParagraph = () => { if (paragraph.length) { output.push(`<p>${inlineMarkdown(paragraph.join('\n'))}</p>`); paragraph = [] } }
  const closeList = () => { if (listType) { output.push(`</${listType}>`); listType = null } }
  for (const line of lines) {
    if (/^\s*```/.test(line)) { if (code) { output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null } else { flushParagraph(); closeList(); code = [] } continue }
    if (code) { code.push(line); continue }
    if (!line.trim()) { flushParagraph(); closeList(); continue }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) { flushParagraph(); closeList(); const level = heading[1].length; output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue }
    const quote = line.match(/^\s*>\s?(.*)$/)
    if (quote) { flushParagraph(); closeList(); output.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`); continue }
    const list = line.match(/^\s*([-*+]\s+|\d+[.)]\s+)(.+)$/)
    if (list) { flushParagraph(); const nextType = /^\d/.test(list[1]) ? 'ol' : 'ul'; if (listType !== nextType) { closeList(); output.push(`<${nextType}>`); listType = nextType } output.push(`<li>${inlineMarkdown(list[2])}</li>`); continue }
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) { flushParagraph(); closeList(); output.push('<hr>'); continue }
    closeList(); paragraph.push(line.trim())
  }
  if (code) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  flushParagraph(); closeList()
  return output.join('') || '<p><br></p>'
}

export function markdownToPlainText(markdown) {
  return String(markdown || '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/```/g, '').replace(/[*_#>`]/g, '').replace(/^\s*[-+*]\s+/gm, '').replace(/^\s*\d+[.)]\s+/gm, '').replace(/\r\n?/g, '\n').trim()
}

export function pacingEnabled(mode = process.env.GEO_PUBLISHER_PACING || 'human') {
  return String(mode).toLowerCase() !== 'disabled' && String(mode).toLowerCase() !== 'off' && String(mode).toLowerCase() !== 'none'
}

export async function randomizedPacing(minMs, maxMs, { mode, sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), random = Math.random, logger = () => {} } = {}) {
  if (!pacingEnabled(mode)) return 0
  const minimum = Math.max(0, Number(minMs) || 0)
  const maximum = Math.max(minimum, Number(maxMs) || minimum)
  const milliseconds = Math.floor(minimum + random() * (maximum - minimum + 1))
  logger(milliseconds)
  await sleep(milliseconds)
  return milliseconds
}

function redactSnapshotValue(value, depth = 0) {
  if (depth > 4) return '[truncated]'
  if (typeof value === 'string') return value.replace(/(authorization|cookie|token|secret|password|csrf)\s*[:=]\s*[^\s;,]+/gi, '$1=[redacted]').slice(0, MAX_SNAPSHOT_TEXT)
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redactSnapshotValue(item, depth + 1))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => {
    if (SECRET_KEY.test(key)) return [key, '[redacted]']
    if (/url/i.test(key) && typeof item === 'string') {
      try { const url = new URL(item); url.search = ''; url.hash = ''; return [key, url.toString()] } catch { return [key, '[invalid-url]'] }
    }
    return [key, redactSnapshotValue(item, depth + 1)]
  }))
  return value
}

export async function writePageSnapshot(page, { artifactDir, label, extra = {} } = {}) {
  if (!page || !artifactDir || !label) return null
  const safeLabel = String(label).replace(/[^a-zA-Z0-9_-]/g, '_')
  const basePath = path.join(artifactDir, safeLabel)
  let snapshot = null
  try {
    snapshot = await page.evaluate(() => {
      const visible = element => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return Boolean(rect.width || rect.height) && style.display !== 'none' && style.visibility !== 'hidden' }
      const describe = element => { const rect = element.getBoundingClientRect(); return { tag: element.tagName, text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160), placeholder: element.getAttribute('placeholder') || '', ariaLabel: element.getAttribute('aria-label') || '', role: element.getAttribute('role') || '', visible: visible(element), rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } } }
      const clone = document.documentElement.cloneNode(true)
      clone.querySelectorAll('script,noscript').forEach(element => element.remove())
      clone.querySelectorAll('*').forEach(element => {
        for (const attribute of [...element.attributes]) {
          if (/^on[a-z]+$/i.test(attribute.name) || /(?:cookie|token|secret|password|authorization|session|csrf|bearer)/i.test(attribute.name)) element.removeAttribute(attribute.name)
        }
        if (element.matches('input,textarea,select,option')) {
          element.removeAttribute('value'); element.removeAttribute('checked'); element.removeAttribute('selected')
          if (element.matches('textarea')) element.textContent = ''
        }
      })
      return { url: location.href, title: document.title, bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 6000), buttons: [...document.querySelectorAll('button,[role="button"]')].slice(0, 160).map(describe), inputs: [...document.querySelectorAll('input,textarea,[contenteditable="true"]')].slice(0, 100).map(describe), html: clone.outerHTML.slice(0, 250000) }
    })
  } catch { return null }
  try {
    await fs.mkdir(artifactDir, { recursive: true, mode: 0o700 })
    const html = sanitizeSnapshotHtmlFallback(snapshot.html)
    const { html: _html, ...diagnostics } = snapshot
    await fs.writeFile(`${basePath}.html`, html, { mode: 0o600 })
    await fs.writeFile(`${basePath}.json`, `${JSON.stringify({ capturedAt: new Date().toISOString(), extra: redactSnapshotValue(extra), diagnostics: redactSnapshotValue(diagnostics) }, null, 2)}\n`, { mode: 0o600 })
    if (typeof page.screenshot === 'function') await page.screenshot({ path: `${basePath}.png`, fullPage: true }).catch(() => {})
    return { basePath, url: snapshot.url }
  } catch { return null }
}

export class CommonPublisher {
  constructor({ platform = 'unknown', pacingMode } = {}) { this.platform = platform; this.pacingMode = pacingMode }
  delay(minMs, maxMs, options = {}) { return randomizedPacing(minMs, maxMs, { ...options, mode: options.mode ?? this.pacingMode, logger: options.logger || (() => {}) }) }
  snapshot(page, options) { return writePageSnapshot(page, options) }
}
