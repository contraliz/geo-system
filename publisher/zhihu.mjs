import fs from 'node:fs/promises'
import path from 'node:path'
import { loadPuppeteer, browserExecutablePath, launchBrowser } from './puppeteer.mjs'
import { updateAccount, updateJob } from './store.mjs'
import { deleteCookies, loadCookies, saveCookies } from './vault.mjs'
import { trace as logTrace } from './trace.mjs'

const CREATOR_URL = process.env.GEO_ZHIHU_CREATOR_URL || 'https://zhuanlan.zhihu.com/write'
const pendingSessions = new Map()
const pendingJobSessions = new Map()
const NAVIGATION_SETTLE_MS = Number(process.env.GEO_PUBLISHER_NAVIGATION_SETTLE_MS || 1000)
const LAUNCH_SETTLE_MS = Number(process.env.GEO_PUBLISHER_LAUNCH_SETTLE_MS || 500)
const ACTION_PAUSE_MS = Number(process.env.GEO_PUBLISHER_ACTION_PAUSE_MS || 275)
const INPUT_DELAY_MS = Number(process.env.GEO_PUBLISHER_INPUT_DELAY_MS || 35)
const EDITOR_TIMEOUT_MS = Number(process.env.GEO_PUBLISHER_EDITOR_TIMEOUT_MS || 90_000)
const EDITOR_SETTLE_MS = Number(process.env.GEO_PUBLISHER_EDITOR_SETTLE_MS || 1_000)
const EDITOR_POLL_MS = Number(process.env.GEO_PUBLISHER_EDITOR_POLL_MS || 250)
const DRAFT_STABILITY_TIMEOUT_MS = Number(process.env.GEO_PUBLISHER_DRAFT_STABILITY_TIMEOUT_MS || 90_000)
const HUMAN_CHAR_MIN_MS = Number(process.env.GEO_PUBLISHER_HUMAN_CHAR_MIN_MS || Math.max(4, Math.round(INPUT_DELAY_MS * 0.7)))
const HUMAN_CHAR_MAX_MS = Number(process.env.GEO_PUBLISHER_HUMAN_CHAR_MAX_MS || Math.max(HUMAN_CHAR_MIN_MS, Math.round(INPUT_DELAY_MS * 2.2)))
const HUMAN_PAUSE_PROBABILITY = Number(process.env.GEO_PUBLISHER_HUMAN_PAUSE_PROBABILITY || 0.018)
const HUMAN_PAUSE_MIN_MS = Number(process.env.GEO_PUBLISHER_HUMAN_PAUSE_MIN_MS || 120)
const HUMAN_PAUSE_MAX_MS = Number(process.env.GEO_PUBLISHER_HUMAN_PAUSE_MAX_MS || 360)
const PUBLISH_DIAGNOSTIC_BODY_LIMIT = 2_000
const PUBLISH_DIAGNOSTIC_ERROR_LIMIT = 1_000
const PUBLISH_DIAGNOSTIC_URL_LIMIT = 500
const PUBLISH_DIAGNOSTIC_RESPONSE_LIMIT = 100
const PUBLISH_CONFIRMATION_TIMEOUT_MS = Number(process.env.GEO_PUBLISHER_CONFIRMATION_TIMEOUT_MS || 90_000)
const SAFE_PUBLISH_RESPONSE_KEYS = new Set(['code', 'status', 'error', 'message', 'success', 'id', 'url', 'article_id', 'articleId', 'articleUrl', 'article_url', 'data', 'result'])
const SAFE_PUBLISH_RESPONSE_VALUE_LIMIT = 500

export function getZhihuPublisherMode(account) {
  const mode = account?.mode
  if (mode !== 'visible' && mode !== 'background') throw new Error(`Unsupported Zhihu publisher mode: ${mode || '(missing)'}.`)
  return mode
}

export function getZhihuPublishStrategy(accountOrMode) {
  const mode = typeof accountOrMode === 'string' ? accountOrMode : getZhihuPublisherMode(accountOrMode)
  if (mode === 'visible') return {
    mode,
    visible: true,
    headless: false,
    retainSessionOnFailure: true,
    usePendingSession: true,
  }
  return {
    mode,
    visible: false,
    headless: true,
    retainSessionOnFailure: false,
    usePendingSession: false,
  }
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const randomBetween = (minimum, maximum) => Math.floor(minimum + Math.random() * Math.max(1, maximum - minimum + 1))

function assertPageOpen(page, label) {
  if (!page || page.isClosed()) throw new Error(`${label} page closed before the operation completed.`)
}

export async function assertHandleConnected(handle, label) {
  if (!handle || typeof handle.evaluate !== 'function') throw new Error(`${label} handle is unavailable.`)
  const connected = await handle.evaluate(element => Boolean(element?.isConnected)).catch(() => false)
  if (!connected) throw new Error(`${label} handle is detached before the operation completed.`)
}

async function waitForPageReady(page, label, { waitForNetworkIdle = true, settleMs = NAVIGATION_SETTLE_MS } = {}) {
  assertPageOpen(page, label)
  await page.waitForSelector('body', { visible: true, timeout: EDITOR_TIMEOUT_MS })
  if (waitForNetworkIdle && typeof page.waitForNetworkIdle === 'function') {
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 10_000 }).catch(() => {})
  }
  await sleep(settleMs)
  assertPageOpen(page, label)
}

async function navigateAndWait(page, url, label, options = {}) {
  assertPageOpen(page, label)
  // waitUntil 'load' means the full page (scripts, styles, images) has finished
  // loading before we continue, so the editor is fully present before writing.
  const response = await page.goto(url, { waitUntil: 'load', timeout: EDITOR_TIMEOUT_MS })
  await waitForPageReady(page, label, options)
  const status = response?.status?.()
  if (status && status >= 400) throw new Error(`${label} returned HTTP ${status}.`)
}

function fieldHint(info) {
  return [info.placeholder, info.aria, info.role, info.className, info.dataPlaceholder, info.dataContents].filter(Boolean).join(' ')
}

function titleFieldScore(info) {
  const hint = fieldHint(info)
  if (/^请输入标题$/i.test(String(info.placeholder || '').trim())) return 100
  if (/请输入标题|文章标题|标题/i.test(hint)) return 80
  if (/title/i.test(hint)) return 60
  if (/100\s*字/i.test(hint)) return 40
  return 0
}

function bodyFieldScore(info) {
  const hint = fieldHint(info)
  if (/^请输入正文$/i.test(String(info.placeholder || '').trim()) || /^请输入正文$/i.test(String(info.dataPlaceholder || '').trim())) return 100
  if (info.dataContents) return 95
  if (/请输入正文|正文/i.test(hint)) return 90
  if (/public-?drafteditor|prosemirror|data-contents|editor|article|richtext/i.test(hint)) return 70
  return 0
}

// Select only fields with title/body semantics. Broad fallbacks such as the
// first non-editable input or largest contenteditable can select an overlay.
export function selectEditorFieldInfos(infos = []) {
  const titleCandidates = infos.filter(info => titleFieldScore(info) > 0).sort((a, b) => titleFieldScore(b) - titleFieldScore(a) || Number(b.area || 0) - Number(a.area || 0))
  const title = titleCandidates.find(info => info.tag === 'textarea' || info.tag === 'input') || titleCandidates[0] || null
  const bodyCandidates = infos.filter(info => info.contenteditable && info !== title && bodyFieldScore(info) > 0)
    .sort((a, b) => bodyFieldScore(b) - bodyFieldScore(a) || Number(b.area || 0) - Number(a.area || 0))
  const editor = bodyCandidates[0] || null
  return title && editor ? { title, editor } : null
}

// Discover the title and body fields of the Zhihu creator editor. The editor is
// a React/ProseMirror component whose DOM can re-render after the first input,
// so every call re-queries the page instead of caching handles.
async function discoverEditorFields(page) {
  const candidates = await page.$$('input, textarea, [contenteditable], [role="textbox"]')
  const infos = []
  for (const candidate of candidates) {
    const info = await candidate.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const style = element.ownerDocument.defaultView?.getComputedStyle(element)
      const visible = Boolean((rect.width || rect.height) && style?.display !== 'none' && style?.visibility !== 'hidden')
      return {
        tag: element.tagName.toLowerCase(),
        placeholder: element.getAttribute('placeholder') || '',
        aria: element.getAttribute('aria-label') || '',
        role: element.getAttribute('role') || '',
        className: typeof element.className === 'string' ? element.className : '',
        dataPlaceholder: element.getAttribute('data-placeholder') || '',
        dataContents: element.getAttribute('data-contents') || '',
        contenteditable: Boolean(element.isContentEditable) || element.hasAttribute('contenteditable'),
        visible,
        area: rect.width * rect.height,
        connected: element.isConnected,
      }
    }).catch(() => null)
    if (info && info.visible && info.connected) infos.push({ handle: candidate, ...info })
  }

  const selected = selectEditorFieldInfos(infos)
  if (!selected) return null
  return { title: selected.title.handle, editor: selected.editor.handle, titleInfo: selected.title, editorInfo: selected.editor }
}

function isVisibleElement(element) {
  const rect = element.getBoundingClientRect()
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  return Boolean((rect.width || rect.height) && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0')
}

export async function inspectDraftLoadingOverlay(page) {
  const exactLoadingText = '草稿加载中，请等待加载完成后再次修改。'
  if (typeof page.evaluate !== 'function') return { visible: false, hasExactConfirm: false }
  const result = await page.evaluate((loadingText) => {
    const visible = element => {
      const rect = element.getBoundingClientRect()
      const style = element.ownerDocument.defaultView?.getComputedStyle(element)
      return Boolean((rect.width || rect.height) && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0')
    }
    const candidates = [...document.querySelectorAll('body *')].filter(element => !element.matches('body,html') && visible(element))
    const loading = candidates.find(element => (element.textContent || '').includes(loadingText))
    const confirms = [...document.querySelectorAll('button')].filter(button => {
      if ((button.textContent || '').trim() !== '确定' || !visible(button)) return false
      let scope = button
      for (let depth = 0; depth < 7 && scope; depth++, scope = scope.parentElement) {
        if ((scope.textContent || '').includes(loadingText)) return true
      }
      return false
    })
    return { visible: Boolean(loading || confirms.length), hasExactConfirm: confirms.length > 0 }
  }, exactLoadingText).catch(() => ({ visible: false, hasExactConfirm: false }))
  return result || { visible: false, hasExactConfirm: false }
}

export async function dismissDraftLoadingDialog(page) {
  const exactLoadingText = '草稿加载中，请等待加载完成后再次修改。'
  const buttons = await page.$$('button')
  for (const button of buttons) {
    const exact = await button.evaluate((element, loadingText) => {
      const rect = element.getBoundingClientRect()
      const style = element.ownerDocument.defaultView?.getComputedStyle(element)
      if ((element.textContent || '').trim() !== '确定' || !(rect.width || rect.height) || style?.display === 'none' || style?.visibility === 'hidden') return false
      let scope = element
      for (let depth = 0; depth < 7 && scope; depth++, scope = scope.parentElement) {
        if ((scope.textContent || '').includes(loadingText)) return true
      }
      return false
    }, exactLoadingText).catch(() => false)
    if (!exact) continue
    await button.click({ delay: 40 })
    return true
  }
  return false
}

async function editorDocumentReady(page) {
  if (typeof page.evaluate !== 'function') return true
  return page.evaluate(() => document.readyState === 'complete').catch(() => false)
}

async function editorFieldBusy(handle) {
  return handle.evaluate(element => {
    const busy = value => /true|loading|saving/i.test(String(value || ''))
    let scope = element
    for (let depth = 0; depth < 8 && scope; depth++, scope = scope.parentElement) {
      if (busy(scope.getAttribute?.('aria-busy')) || busy(scope.getAttribute?.('data-loading')) || busy(scope.getAttribute?.('data-saving'))) return true
    }
    return Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true' || element.getAttribute('contenteditable') === 'false')
  }).catch(() => true)
}

async function editorFieldsWritable(found) {
  const [titleBusy, bodyBusy] = await Promise.all([editorFieldBusy(found.title), editorFieldBusy(found.editor)])
  return !titleBusy && !bodyBusy
}

export async function waitForEditor(page, { timeoutMs = EDITOR_TIMEOUT_MS, settleMs = EDITOR_SETTLE_MS, pollMs = EDITOR_POLL_MS } = {}) {
  const startedAt = Date.now()
  let stable = null
  let blocking = ''
  while (Date.now() - startedAt < timeoutMs) {
    assertPageOpen(page, 'Zhihu editor')
    if (!await editorDocumentReady(page)) {
      if (blocking !== 'document-loading') logTrace('prepare', 'Waiting for Zhihu document to finish loading', {})
      blocking = 'document-loading'
      stable = null
      await sleep(pollMs)
      continue
    }
    const found = await discoverEditorFields(page)
    if (!found) {
      if (blocking !== 'editor-fields-missing') logTrace('prepare', 'Waiting for Zhihu editor fields', {})
      blocking = 'editor-fields-missing'
      stable = null
      await sleep(pollMs)
      continue
    }
    // Require the fields to be present across a short settle window so we do
    // not start typing into a not-yet-hydrated editor (the main cause of the
    // "writer does not write anything" failure).
    if (!stable || !(await sameFields(stable.fields, found))) {
      stable = { fields: found, since: Date.now() }
      blocking = 'editor-fields-settling'
      await sleep(pollMs)
      continue
    }
    const overlay = await inspectDraftLoadingOverlay(page)
    if (overlay.visible) {
      if (blocking !== 'draft-modal') logTrace('prepare', 'Waiting for Zhihu draft loading modal to clear', { hasExactConfirm: overlay.hasExactConfirm })
      blocking = 'draft-modal'
      // Dismiss only the exact informational popup, and only after fields have
      // been stable. Never dismiss arbitrary dialogs or security prompts.
      if (Date.now() - stable.since >= settleMs && overlay.hasExactConfirm) {
        if (await dismissDraftLoadingDialog(page)) {
          await waitForOverlayGone(page, { timeoutMs: Math.min(timeoutMs, 10_000), pollMs })
          stable = null
        }
      }
      await sleep(pollMs)
      continue
    }
    if (!(await editorFieldsWritable(found))) {
      if (blocking !== 'editor-busy') logTrace('prepare', 'Waiting for Zhihu editor fields to become writable', {})
      blocking = 'editor-busy'
      await sleep(pollMs)
      continue
    }
    if (Date.now() - stable.since >= settleMs) {
      logTrace('prepare', 'Zhihu editor fields passed document/app readiness gate', {
        title: fieldDescriptor(found.titleInfo),
        body: fieldDescriptor(found.editorInfo),
        settleMs,
      })
      return { title: found.title, editor: found.editor }
    }
    await sleep(pollMs)
  }
  throw new Error('Zhihu editor fields did not become ready before the timeout.')
}

async function waitForOverlayGone(page, { timeoutMs = 10_000, pollMs = EDITOR_POLL_MS } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await inspectDraftLoadingOverlay(page)).visible) return true
    await sleep(Math.min(pollMs, Math.max(1, deadline - Date.now())))
  }
  throw new Error('Zhihu draft loading modal did not disappear after dismissing the exact confirmation.')
}

async function fieldSignature(handle) {
  return handle.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return [element.tagName, element.getAttribute('placeholder') || '', Boolean(element.isContentEditable), Math.round(rect.width), Math.round(rect.height)].join('|')
  }).catch(() => null)
}

async function sameFields(a, b) {
  const [titleA, titleB, editorA, editorB] = await Promise.all([
    fieldSignature(a.title), fieldSignature(b.title), fieldSignature(a.editor), fieldSignature(b.editor),
  ])
  return Boolean(titleA && titleB && editorA && editorB && titleA === titleB && editorA === editorB)
}

function fieldDescriptor(info) {
  if (!info) return null
  return {
    tag: info.tag,
    placeholder: info.placeholder || null,
    aria: info.aria || null,
    role: info.role || null,
    className: info.className || null,
    dataPlaceholder: info.dataPlaceholder || null,
    dataContents: info.dataContents || null,
    contenteditable: Boolean(info.contenteditable),
    visible: Boolean(info.visible),
    area: Number.isFinite(info.area) ? Math.round(info.area) : null,
  }
}

export async function clickAndFocus(page, handle) {
  assertPageOpen(page, 'Zhihu editor')
  // ElementHandle does not expose page.isClosed(); validate it through its
  // supported evaluate/connected-element API instead.
  await assertHandleConnected(handle, 'Zhihu editor')
  await handle.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {})
  // A DOM focus call can make text appear above a rich editor without updating
  // the editor's React state. A real hit-tested click is required first.
  await handle.click({ delay: 40 })
  await sleep(ACTION_PAUSE_MS)
  const focused = await handle.evaluate(element => document.activeElement === element || element.contains(document.activeElement)).catch(() => false)
  if (!focused) {
    const metadata = await describeHandle(handle)
    throw new Error(`Zhihu editor field did not receive focus after click (${metadata.tag || 'unknown'} ${metadata.placeholder || metadata.className || 'unlabeled'}).`)
  }
}

export async function selectAllAndClear(page) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await sleep(ACTION_PAUSE_MS)
  await page.keyboard.down(modifier)
  try {
    await page.keyboard.press('A')
  } finally {
    await page.keyboard.up(modifier)
  }
  await sleep(ACTION_PAUSE_MS)
  await page.keyboard.press('Backspace')
  await sleep(ACTION_PAUSE_MS)
}

export async function pasteWithTrustedInput(page, text) {
  // Puppeteer's sendCharacter uses Chromium's Input.insertText path, producing
  // the trusted beforeinput/input sequence React editors consume. It is
  // intentionally sent only after clickAndFocus has hit the real field.
  await sleep(ACTION_PAUSE_MS)
  await page.keyboard.sendCharacter(text)
}

async function typeWithTrustedInput(page, text) {
  // Some older Draft.js builds ignore one large insertText payload. The
  // per-character Input.insertText fallback still updates the real editor,
  // while preserving CJK and multiline content.
  for (const character of text) {
    if (character === '\n') await page.keyboard.press('Enter')
    else await page.keyboard.sendCharacter(character)
    if (INPUT_DELAY_MS > 0) await sleep(INPUT_DELAY_MS)
  }
}

async function focusAndClear(page, handle) {
  await assertEditorWritable(page, handle)
  await clickAndFocus(page, handle)
  await assertEditorWritable(page, handle)
  await selectAllAndClear(page)
}

export async function assertEditorWritable(page, handle) {
  const overlay = await inspectDraftLoadingOverlay(page)
  if (overlay.visible) throw new Error('Zhihu draft loading modal or overlay is visible; no editor input was attempted.')
  if (!(await editorFieldsWritable({ title: handle, editor: handle }))) throw new Error('Zhihu editor field is busy or disabled; no editor input was attempted.')
}

async function describeHandle(handle) {
  return handle.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return {
      tag: element.tagName.toLowerCase(),
      placeholder: element.getAttribute('placeholder') || '',
      aria: element.getAttribute('aria-label') || '',
      role: element.getAttribute('role') || '',
      className: typeof element.className === 'string' ? element.className : '',
      dataPlaceholder: element.getAttribute('data-placeholder') || '',
      dataContents: element.getAttribute('data-contents') || '',
      contenteditable: Boolean(element.isContentEditable) || element.hasAttribute('contenteditable'),
      visible: Boolean(rect.width || rect.height),
      area: Math.round(rect.width * rect.height),
    }
  }).catch(() => ({}))
}

async function settle(page, { waitForNetworkIdle = false } = {}) {
  await sleep(NAVIGATION_SETTLE_MS)
  if (waitForNetworkIdle && typeof page.waitForNetworkIdle === 'function') {
    await page.waitForNetworkIdle({ idleTime: 600, timeout: 8_000 }).catch(() => {})
  }
}

function draftStateFromText(text) {
  const value = String(text || '').replace(/\u00a0/g, ' ')
  const loading = /草稿\s*加载中|草稿\s*保存中|draft\s+(?:is\s+)?(?:loading|saving)|saving\s+draft|loading\s+draft/i.test(value)
  const saved = /(?:刚刚|昨天|前天|几秒|\d+\s*(?:秒|分钟|小时|天|周|个月|年))\s*前?\s*[·•]\s*草稿|草稿\s*(?:已保存|保存成功)|(?:draft\s+(?:is\s+)?saved|saved\s+(?:just\s+)?now|\d+\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago\s*[·•]\s*draft)/i.test(value)
  return { loading, saved, stable: saved && !loading }
}

export async function inspectDraftStability(page) {
  const text = await page.$eval('body', element => element.innerText || '').catch(() => '')
  const state = draftStateFromText(text)
  return { ...state, text }
}

// Zhihu can expose an enabled 发布 control while its draft-loading modal or
// autosave is still active. Wait for the saved footer and absence of those
// indicators before any publish click, in both visible and headless flows.
export async function waitForDraftStable(page, { timeoutMs = DRAFT_STABILITY_TIMEOUT_MS, pollMs = 500 } = {}) {
  const deadline = Date.now() + Math.max(0, timeoutMs)
  let state = await inspectDraftStability(page)
  do {
    if (state.stable) return state
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await sleep(Math.min(Math.max(1, pollMs), remaining))
    state = await inspectDraftStability(page)
  } while (Date.now() <= deadline)

  const reason = state.loading ? 'still loading or saving' : 'no stable saved indicator'
  throw new Error(`Zhihu draft remained ${reason} after the draft stability timeout; no publish click was attempted.`)
}

export function normalizeEditorText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim()
}

export function editorFieldStateIsValid({ text = '', prefix = '', expectedText = null, label, placeholderVisible = false, charCount = null } = {}) {
  const actual = normalizeEditorText(text)
  const expected = expectedText === null ? null : normalizeEditorText(expectedText)
  if (label === 'body' && placeholderVisible) return false
  // The editor-owned exact text is authoritative. Zhihu's counter can lag the
  // Draft.js state briefly (including reporting zero), so do not trigger a
  // second insertion when the body already matches exactly.
  if (expected !== null && actual === expected) return true
  if (!prefix || !actual.includes(normalizeEditorText(prefix))) return false
  // Zhihu's footer is the strongest signal that the editor's state (rather
  // than an overlaid DOM node) received the body input.
  if (label === 'body' && charCount !== null && Number(charCount) <= 0) return false
  return true
}

async function readEditorState(handle) {
  return handle.evaluate(element => {
    const text = element.tagName === 'TEXTAREA' || element.tagName === 'INPUT'
      ? element.value || ''
      : element.innerText || element.textContent || ''
    let scope = element
    let placeholderVisible = false
    for (let depth = 0; depth < 7 && scope; depth++, scope = scope.parentElement) {
      const placeholders = scope.querySelectorAll?.('[class*="placeholder" i], [data-placeholder]') || []
      for (const candidate of placeholders) {
        if (candidate === element || !(candidate.textContent || '').trim()) continue
        const style = candidate.ownerDocument.defaultView?.getComputedStyle(candidate)
        const rect = candidate.getBoundingClientRect()
        if (style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0' && (rect.width || rect.height)) {
          if (/请输入正文|正文|body/i.test(candidate.textContent || '')) placeholderVisible = true
        }
      }
    }
    const bodyText = element.ownerDocument.body?.innerText || ''
    const countMatch = bodyText.match(/字数\s*[:：]\s*(\d+)/)
    return {
      text,
      active: document.activeElement === element || element.contains(document.activeElement),
      placeholderVisible,
      charCount: countMatch ? Number(countMatch[1]) : null,
      metadata: {
        tag: element.tagName.toLowerCase(),
        placeholder: element.getAttribute('placeholder') || '',
        aria: element.getAttribute('aria-label') || '',
        role: element.getAttribute('role') || '',
        className: typeof element.className === 'string' ? element.className : '',
        dataPlaceholder: element.getAttribute('data-placeholder') || '',
        dataContents: element.getAttribute('data-contents') || '',
        contenteditable: Boolean(element.isContentEditable) || element.hasAttribute('contenteditable'),
      },
    }
  }).catch(() => ({ text: '', active: false, placeholderVisible: false, charCount: null, metadata: {} }))
}

function editorStateDiagnostic(state) {
  return {
    ...(state?.metadata || {}),
    active: Boolean(state?.active),
    placeholderVisible: Boolean(state?.placeholderVisible),
    charCount: state?.charCount ?? null,
    textLength: String(state?.text || '').length,
  }
}

// Write text into a discovered field and confirm the page's editor state
// retained it. Both attempts use trusted browser input after a real click;
// direct DOM mutation is intentionally avoided because it can create visible
// overlay text without updating Zhihu's React state.
async function writeField(page, selectField, text, { prefix, label }) {
  let lastDiagnostic = null
  const attempt = async (mode) => {
    const handle = selectField(await waitForEditor(page))
    const metadata = await describeHandle(handle)
    // Every retry re-discovers, clicks, selects all, and clears first; a
    // partial trusted insertion can therefore never be followed by an append.
    await focusAndClear(page, handle)
    if (mode === 'paste') await pasteWithTrustedInput(page, text)
    else await typeWithTrustedInput(page, text)
    return metadata
  }

  for (const mode of ['paste', 'keyboard']) {
    try {
      const metadata = await attempt(mode)
      await sleep(ACTION_PAUSE_MS)
      const verification = await fieldRetained(page, selectField, prefix, text, label)
      if (verification.valid) return
      lastDiagnostic = { mode, selectedField: metadata, editorState: editorStateDiagnostic(verification.state) }
      logTrace('prepare', 'Zhihu field input was not retained by editor state', { label, ...lastDiagnostic })
    } catch (error) {
      lastDiagnostic = { mode, error: error.message }
      logTrace('prepare', 'Zhihu field input attempt failed', { label, ...lastDiagnostic })
      // Retry with per-character trusted input, but never write through the DOM
      // because that can create visible text without updating Zhihu's state.
    }
  }
  logTrace('prepare', 'Zhihu field input did not retain editor state', { label, diagnostics: lastDiagnostic })
  throw new Error(`Zhihu ${label} field did not retain editor state after clicked input; no content was entered.`)
}

async function fieldRetained(page, selectField, prefix, expectedText, label) {
  const handle = selectField(await waitForEditor(page))
  const state = await readEditorState(handle)
  return { valid: editorFieldStateIsValid({ ...state, prefix, expectedText, label }), state }
}

const selectTitle = fields => fields.title
const selectBody = fields => fields.editor

function isLoginPage(url) {
  return /login|signin|captcha|security/i.test(url)
}

async function detectLoginRequired(page, { settleMs = 1500 } = {}) {
  if (isLoginPage(page.url())) return true
  try {
    await page.waitForSelector('body', { timeout: 10_000 })
    await new Promise(resolve => setTimeout(resolve, settleMs))
  } catch {
    return true
  }
  try {
    const [loginButtons, profileMarkers, bodyText, cookies] = await Promise.all([
      page.$$eval('button, a, [role="button"]', elements => elements.filter(element => /登录|log\s*in|sign\s*in/i.test((element.textContent || '').trim())).length).catch(() => 0),
      page.$$eval('.AppHeader-profile, .UserAvatar, [aria-label*="avatar" i], [aria-label*="头像"], [data-za-detail-view-path-module="TopNavBar"]').then(elements => elements.length).catch(() => 0),
      page.$eval('body', element => element.innerText || '').catch(() => ''),
      page.cookies('https://www.zhihu.com/').catch(() => []),
    ])
    if (isLoginPage(page.url())) return true
    if (loginButtons > 0 || /登录知乎|注册|log\s*in|sign\s*in/i.test(bodyText)) return true
    const hasAuthCookie = cookies.some(cookie => ['z_c0', 'd_c0', 'SESSIONID'].includes(cookie.name) && cookie.value)
    if (profileMarkers > 0 || hasAuthCookie) return false
    return true
  } catch {
    return true
  }
}

async function launchAccountBrowser(account, { visible }) {
  const puppeteer = await loadPuppeteer()
  if (!puppeteer) {
    await updateAccount(account.id, { status: 'error', lastError: 'Install puppeteer or puppeteer-core to connect a browser.', lastCheckedAt: new Date().toISOString() })
    throw new Error('Puppeteer is not installed. Run npm install, then retry.')
  }
  await fs.mkdir(account.profileDir, { recursive: true, mode: 0o700 })
  const executablePath = browserExecutablePath()
  logTrace('prepare', 'Chrome executable resolved', { accountId: account.id, executablePath: executablePath || '(none, using puppeteer default)', macBundle: process.platform === 'darwin' })
  const browser = await launchBrowser(puppeteer, { headless: !visible, userDataDir: account.profileDir, executablePath })
  logTrace('prepare', 'Browser launched', { accountId: account.id, mode: visible ? 'visible' : 'headless' })
  return browser
}

async function getWorkingPage(browser, { visible = false } = {}) {
  const pages = await browser.pages()
  const page = pages.find(candidate => !candidate.isClosed()) || await browser.newPage()
  if (visible) {
    // Puppeteer documents that a connected page may retain a default viewport
    // smaller than the outer Chrome window. Remove that emulation and set the
    // actual browser window bounds through the current Browser API.
    await page.setViewport(null).catch(error => logTrace('prepare', 'Could not remove the default viewport', { error: error.message }))
    if (typeof page.windowId === 'function' && typeof browser.setWindowBounds === 'function') {
      try {
        const windowId = await page.windowId()
        await browser.setWindowBounds(windowId, { left: 40, top: 40, width: 1100, height: 720, windowState: 'normal' })
      } catch (error) {
        logTrace('prepare', 'Could not set Chrome window bounds', { error: error.message })
      }
    }
  }
  return page
}

export async function resetZhihuAccount(account) {
  const pending = pendingSessions.get(account.id)
  pendingSessions.delete(account.id)
  if (pending) await pending.browser.close().catch(() => {})
  for (const [jobId, session] of pendingJobSessions) {
    if (session.accountId !== account.id) continue
    pendingJobSessions.delete(jobId)
    await session.browser.close().catch(() => {})
  }
  await deleteCookies(account.id).catch(() => {})
  if (account.profileDir) await fs.rm(account.profileDir, { recursive: true, force: true }).catch(() => {})
  logTrace('prepare', 'Cleared Zhihu account session', { accountId: account.id })
}

export async function startZhihuAccountSetup(account, { visible = true } = {}) {
  logTrace('prepare', 'Begin Zhihu account configuration', { accountId: account.id, visible, profileDir: account.profileDir })
  const browser = await launchAccountBrowser(account, { visible })
  let keepOpen = false
  try {
    const page = await getWorkingPage(browser, { visible })
    const cookies = await loadCookies(account.id)
    if (cookies.length) await page.setCookie(...cookies)
    await navigateAndWait(page, 'https://www.zhihu.com/', 'Zhihu account setup')
    pendingSessions.set(account.id, { browser, page })
    keepOpen = visible
    await updateAccount(account.id, { status: 'login-required', lastCheckedAt: null, lastError: null })
    logTrace('prepare', 'Account configured; waiting for user verification', { accountId: account.id, url: page.url() })
    return { status: 'login-required', url: page.url(), message: 'Account configured. Finish login in the opened browser, then click Verify account.' }
  } catch (error) {
    logTrace('prepare', 'Account configuration failed', { accountId: account.id, error: error.message })
    throw error
  } finally {
    if (!keepOpen) {
      pendingSessions.delete(account.id)
      await browser.close().catch(() => {})
    }
  }
}

async function verifyWithFreshBrowser(account) {
  const browser = await launchAccountBrowser(account, { visible: false })
  try {
    const page = await getWorkingPage(browser)
    const cookies = await loadCookies(account.id)
    if (cookies.length) await page.setCookie(...cookies)
    await navigateAndWait(page, 'https://www.zhihu.com/', 'Zhihu account verification')
    const loginRequired = await detectLoginRequired(page)
    if (loginRequired) {
      await updateAccount(account.id, { status: 'login-required', lastCheckedAt: new Date().toISOString(), lastError: 'Login is still required.' })
      return { status: 'login-required', message: 'The account is not verified. Check the cookie session and try again.' }
    }
    const fresh = await page.cookies()
    if (fresh.length) await saveCookies(account.id, fresh).catch(() => {})
    await updateAccount(account.id, { status: 'ready', lastCheckedAt: new Date().toISOString(), lastError: null })
    return { status: 'ready', message: 'Zhihu account verified. Future jobs can use this profile.' }
  } finally {
    await browser.close().catch(() => {})
  }
}

export async function verifyZhihuAccount(account) {
  const session = pendingSessions.get(account.id)
  logTrace('verify', 'Begin Zhihu verify sequence', { accountId: account.id, hasPendingSession: Boolean(session) })
  if (!session) return verifyWithFreshBrowser(account)
  try {
    await navigateAndWait(session.page, 'https://www.zhihu.com/', 'Zhihu account verification')
    logTrace('verify', 'Re-navigated to zhihu.com', { accountId: account.id, url: session.page.url() })
    const loginRequired = await detectLoginRequired(session.page)
    logTrace('verify', 'Login detection finished', { accountId: account.id, loginRequired, url: session.page.url() })
    if (loginRequired) {
      await updateAccount(account.id, { status: 'login-required', lastCheckedAt: new Date().toISOString(), lastError: 'Login is still required.' })
      return { status: 'login-required', message: 'The account is still not logged in.' }
    }
    try {
      const fresh = await session.page.cookies()
      if (fresh.length) await saveCookies(account.id, fresh).catch(() => {})
      logTrace('verify', 'Persisted cookies back to vault', { accountId: account.id, count: fresh.length })
    } catch (error) { logTrace('verify', 'Cookie persistence failed', { accountId: account.id, error: error.message }) }
    await updateAccount(account.id, { status: 'ready', lastCheckedAt: new Date().toISOString(), lastError: null })
    pendingSessions.delete(account.id)
    await session.browser.close().catch(() => {})
    logTrace('verify', 'Verify sequence completed, status ready', { accountId: account.id })
    return { status: 'ready', message: 'Zhihu login verified. Future jobs can use this profile.' }
  } catch (error) {
    logTrace('verify', 'Verify sequence threw', { accountId: account.id, error: error.message })
    await updateAccount(account.id, { status: 'error', lastCheckedAt: new Date().toISOString(), lastError: error.message })
    return { status: 'error', message: error.message }
  }
}

async function loadAccountCookies(page, account) {
  const cookies = await loadCookies(account.id)
  if (cookies.length) await page.setCookie(...cookies)
  return cookies.length
}

async function fillZhihuDraft(page, job) {
  // Give the freshly launched Chrome a short settle window before navigating,
  // so we don't drive the renderer while it is still finishing startup.
  await sleep(LAUNCH_SETTLE_MS)
  // `goto(..., { waitUntil: 'load' })` has completed here. For the editor
  // path, wait exactly the configured settle interval (1s by default) before
  // discovery; network-idle can remain open for analytics/streaming requests
  // and otherwise delays input by up to ten additional seconds.
  await navigateAndWait(page, CREATOR_URL, 'Zhihu editor', { waitForNetworkIdle: false, settleMs: NAVIGATION_SETTLE_MS })
  // The editor navigation already waited for full `load` plus the exact
  // one-second settle. Avoid adding detectLoginRequired's login-page grace
  // delay before the first field click/input.
  if (await detectLoginRequired(page, { settleMs: 0 })) return { loginRequired: true }

  const titleText = String(job.title).trim()
  const bodyText = String(job.content).trim()

  await writeField(page, selectTitle, titleText, { prefix: titleText.slice(0, 20), label: 'title' })
  await writeField(page, selectBody, bodyText, { prefix: bodyText.slice(0, 30), label: 'body' })
  await settle(page)
  await waitForDraftStable(page)
  return { loginRequired: false }
}

export async function prepareZhihuJob(job, account, { load = loadPuppeteer, launch = launchBrowser } = {}) {
  const strategy = getZhihuPublishStrategy(account)
  const mode = strategy.mode
  logTrace('prepare-job-start', 'Starting Zhihu job preparation', { jobId: job.id, accountId: account.id, mode })
  let puppeteer
  try {
    puppeteer = await load()
  } catch (error) {
    const message = `Puppeteer could not be loaded: ${error.message}`
    logTrace('prepare-job-error', 'Puppeteer load failed', { jobId: job.id, error: message })
    await updateJob(job.id, { status: 'failed', error: message })
    return
  }
  if (!puppeteer) {
    logTrace('prepare-job-error', 'Puppeteer not installed', { jobId: job.id })
    await updateJob(job.id, { status: 'failed', error: 'Puppeteer is not installed. Install it before running a browser job.' })
    return
  }
  const visible = strategy.visible
  const executablePath = browserExecutablePath()
  let browser = null
  let keepOpen = false
  let page = null
  try {
    await fs.mkdir(job.artifactDir, { recursive: true, mode: 0o700 })
    logTrace('prepare-browser-launch', 'Launching browser', { jobId: job.id, visible, executablePath })
    browser = await launch(puppeteer, { headless: !visible, userDataDir: account.profileDir, executablePath })
    logTrace('prepare-get-working-page', 'Getting working page', { jobId: job.id })
    page = await getWorkingPage(browser, { visible })
    await loadAccountCookies(page, account)
    await updateJob(job.id, { status: 'editor-open', error: null })
    logTrace('prepare-wait-editor-ready', 'Waiting for Zhihu editor readiness', { accountId: account.id, jobId: job.id, visible })
    const draft = await fillZhihuDraft(page, job)
    if (draft.loginRequired) {
      logTrace('prepare-login-required', 'Login required for job', { jobId: job.id })
      await updateJob(job.id, { status: 'login-required', error: 'Zhihu requires login or a manual security check.' })
      await updateAccount(account.id, { status: 'login-required', lastCheckedAt: new Date().toISOString(), lastError: 'Manual login required.' })
      if (visible) {
        pendingJobSessions.set(job.id, { browser, page, accountId: account.id })
        keepOpen = true
      }
      return
    }
    logTrace('prepare-content-filled', 'Content filled for job', { jobId: job.id })
    await updateJob(job.id, { status: 'content-filled' })
    const publishReadiness = await inspectPublishReadiness(page)
    logTrace('prepare', 'Zhihu publish control readiness inspected', { jobId: job.id, ...publishReadiness })
    if (!publishReadiness.ready) throw new Error('Exact Zhihu publish control is not visible and enabled; draft was retained for inspection.')
    await page.screenshot({ path: path.join(job.artifactDir, 'prepared.png'), fullPage: true })
    await updateJob(job.id, { status: 'draft-saved' })
    await updateJob(job.id, { status: 'awaiting-approval' })
    logTrace('prepare-draft-ready', 'Zhihu draft is ready for approval', { accountId: account.id, jobId: job.id, visible })
    if (visible) {
      // Keep the exact prepared page alive. Approval must publish the draft
      // that was inspected, rather than opening a new blank editor.
      pendingJobSessions.set(job.id, { browser, page, accountId: account.id })
      keepOpen = true
    }
    logTrace('prepare-job-success', 'Job preparation completed successfully', { jobId: job.id })
  } catch (error) {
    logTrace('prepare-job-error', 'Zhihu draft preparation failed', { accountId: account.id, jobId: job.id, error: error.message, stack: error.stack })
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(job.artifactDir, 'prepare-failed.png'), fullPage: true }).catch(() => {})
    const retainForInspection = visible && page && !page.isClosed()
    if (retainForInspection) {
      pendingJobSessions.set(job.id, { browser, page, accountId: account.id })
      keepOpen = true
    }
    await updateJob(job.id, { status: retainForInspection ? 'failed-inspection' : 'failed', error: error.message })
  } finally {
    logTrace('prepare-job-finally', 'Cleaning up browser', { jobId: job.id, keepOpen })
    if (browser && !keepOpen) await browser.close().catch(() => {})
  }
}

const PUBLISH_BUTTON_TEXT = /^(发布|发布文章|确定发布|立即发布|确认发布|发表)$/

async function findPublishButton(page, { skipMarked = false, requiredText = null, includeDisabled = false } = {}) {
  const buttons = await page.$$('button, [role="button"]')
  const candidates = []
  for (const button of buttons) {
    const meta = await button.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const style = element.ownerDocument.defaultView?.getComputedStyle(element)
      const rawText = (element.textContent || '').trim()
      // Remove zero-width spaces and similar invisible characters that can interfere with matching
      const text = rawText.replace(/[​-‍﻿]/g, '')
      return {
        text,
        disabled: Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true' || element.classList.contains('is-disabled') || element.classList.contains('Button--disabled'),
        visible: Boolean((rect.width || rect.height) && style?.display !== 'none' && style?.visibility !== 'hidden'),
        marked: element.getAttribute('data-geo-publish-clicked') === '1',
      }
    }).catch(() => null)
    if (!meta || !meta.visible || (!includeDisabled && meta.disabled)) continue
    if (skipMarked && meta.marked) continue
    candidates.push({ button, meta })
  }

  // Look for exact match
  for (const { button, meta } of candidates) {
    if (requiredText ? meta.text === requiredText : PUBLISH_BUTTON_TEXT.test(meta.text)) {
      return button
    }
  }

  // If we get here, no exact match. Log the candidates for debugging.
  if (candidates.length > 0) {
    const textList = candidates.map(c => `"${c.meta.text}"`).join(', ')
    logTrace('publish', `No exact publish button found. Candidates: ${textList}`, {})
  }

  return null
}

export async function inspectPublishReadiness(page) {
  // Include an exact disabled control in the inspection result so background
  // publishing can distinguish "still autosaving" from "control missing".
  // Click paths keep the default includeDisabled=false behavior.
  const button = await findPublishButton(page, { requiredText: '发布', includeDisabled: true })
  if (!button) return { ready: false, control: null }
  const control = await button.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const style = element.ownerDocument.defaultView?.getComputedStyle(element)
    const text = (element.textContent || '').trim().replace(/[​-‍﻿]/g, '')
    return {
      text,
      visible: Boolean((rect.width || rect.height) && style?.display !== 'none' && style?.visibility !== 'hidden'),
      enabled: !(Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true' || element.classList.contains('is-disabled') || element.classList.contains('Button--disabled')),
      area: Math.round(rect.width * rect.height),
    }
  }).catch(() => null)
  return { ready: Boolean(control?.visible && control?.enabled && control.text === '发布'), control }
}

export async function waitForPublishReadiness(page, { timeoutMs = EDITOR_TIMEOUT_MS, pollMs = 500 } = {}) {
  const deadline = Date.now() + Math.max(0, timeoutMs)
  let readiness = { ready: false, control: null }
  do {
    readiness = await inspectPublishReadiness(page)
    if (readiness.ready) return readiness
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await sleep(Math.min(Math.max(1, pollMs), remaining))
  } while (Date.now() <= deadline)

  const state = readiness.control ? 'present but disabled' : 'missing'
  throw new Error(`Exact Zhihu publish control remained ${state} after the draft readiness timeout; no click was attempted.`)
}

async function clickPublishButton(page, button, { waitForNavigation = false } = {}) {
  await button.evaluate(element => {
    element.scrollIntoView({ block: 'center', behavior: 'instant' })
  }).catch(() => {})
  await sleep(300)
  assertPageOpen(page, 'Zhihu publish')
  const navigation = waitForNavigation && typeof page.waitForNavigation === 'function'
    ? page.waitForNavigation({ waitUntil: 'load', timeout: 20_000 }).then(() => true).catch(() => false)
    : Promise.resolve(false)
  try {
    await button.click({ delay: 80 })
  } catch (error) { throw error }
  // A control is marked only after Puppeteer reports that the trusted pointer
  // click completed. The marker is diagnostic state, never a click fallback.
  await button.evaluate(element => element.setAttribute('data-geo-publish-clicked', '1')).catch(() => {})
  return navigation
}

async function publishControlState(button) {
  if (!button) return null
  return button.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const style = element.ownerDocument.defaultView?.getComputedStyle(element)
    const text = (element.textContent || '').trim().replace(/[​-‍﻿]/g, '')
    const disabled = Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true' || element.classList.contains('is-disabled') || element.classList.contains('Button--disabled')
    return {
      text,
      disabled,
      visible: Boolean((rect.width || rect.height) && style?.display !== 'none' && style?.visibility !== 'hidden'),
      area: Math.round(rect.width * rect.height),
    }
  }).catch(() => null)
}

function samePublishControlState(before, after) {
  if (!before || !after) return false
  return before.text === after.text && before.disabled === after.disabled && before.visible === after.visible && before.area === after.area
}

function isAllowedPublishEndpoint(url) {
  return /\/api\/v4\/content\/publish(?:[/?#]|$)|\/api\/articles\/[^/]+\/(?:publish|draft)(?:[/?#]|$)/i.test(String(url || ''))
}

export function sanitizePublishResponsePayload(payload, depth = 0) {
  if (depth > 3 || payload === null || payload === undefined) return payload === null ? null : undefined
  if (typeof payload === 'string') return payload.slice(0, SAFE_PUBLISH_RESPONSE_VALUE_LIMIT)
  if (typeof payload === 'number' || typeof payload === 'boolean') return payload
  if (Array.isArray(payload)) return payload.slice(0, 10).map(value => sanitizePublishResponsePayload(value, depth + 1)).filter(value => value !== undefined)
  if (typeof payload !== 'object') return undefined
  const result = {}
  for (const [key, value] of Object.entries(payload)) {
    if (!SAFE_PUBLISH_RESPONSE_KEYS.has(key)) continue
    const safe = sanitizePublishResponsePayload(value, depth + 1)
    if (safe !== undefined) result[key] = safe
  }
  return result
}

function responsePayloadText(payload) {
  return [payload?.error, payload?.message].filter(Boolean).join(' ').slice(0, SAFE_PUBLISH_RESPONSE_VALUE_LIMIT)
}

function findPublicUrlInPayload(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (typeof payload.url === 'string' && /^https?:\/\/(?:zhuanlan|www)\.zhihu\.com\/p\/\d+(?:[/?#]|$)/i.test(payload.url) && !/\/edit(?:[/?#]|$)/i.test(payload.url)) return payload.url
  for (const value of Object.values(payload)) {
    const found = findPublicUrlInPayload(value)
    if (found) return found
  }
  return ''
}

export function normalizePublicArticleUrl(candidate) {
  try {
    const parsed = new URL(String(candidate || ''))
    if (!['zhuanlan.zhihu.com', 'www.zhihu.com'].includes(parsed.hostname)) return ''
    const match = parsed.pathname.match(/^\/p\/(\d+)(?:\/)?$/)
    return match ? `https://zhuanlan.zhihu.com/p/${match[1]}` : ''
  } catch {
    return ''
  }
}

function findArticleIdInPayload(payload) {
  if (!payload || typeof payload !== 'object') return ''
  for (const key of ['id', 'article_id', 'articleId']) {
    if (/^\d+$/.test(String(payload[key] || ''))) return String(payload[key])
  }
  for (const value of Object.values(payload)) {
    const found = findArticleIdInPayload(value)
    if (found) return found
  }
  return ''
}

export function classifyPublishResponse({ httpStatus = null, payload = {}, url = '' } = {}) {
  const status = Number(httpStatus)
  const code = payload?.code
  const message = responsePayloadText(payload)
  const rateLimited = /rate.?limit|too many|频繁|过于频繁|稍后再试|操作频繁|限制/i.test(message) || status === 429 || code === 429
  const applicationError = rateLimited || (Number.isFinite(status) && status >= 400) || payload?.success === false || (code !== undefined && code !== null && ![0, 200, '0', '200'].includes(code)) || Boolean(payload?.error)
  const publicUrl = normalizePublicArticleUrl(findPublicUrlInPayload(payload)) || (findArticleIdInPayload(payload) ? `https://zhuanlan.zhihu.com/p/${findArticleIdInPayload(payload)}` : '')
  return {
    seen: true,
    httpStatus: Number.isFinite(status) ? status : null,
    payload,
    url: sanitizeDiagnosticUrl(url),
    applicationError,
    rateLimited,
    publicUrl,
    message,
  }
}

async function findConfirmationButton(page) {
  for (const text of ['确定发布', '立即发布', '确认发布', '发表']) {
    const button = await findPublishButton(page, { requiredText: text })
    if (button) return button
  }
  return null
}

async function waitForPublishEffect(page, beforeUrl, beforeControl, { navigationObserved = false, effectSignal = null, reacquirePage = null, timeoutMs = 5_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let detached = false
  let activePage = page
  while (Date.now() < deadline) {
    try {
      const signal = typeof effectSignal === 'function' ? await effectSignal() : null
      if (signal?.applicationError) throw new Error(`Zhihu publish rejected${signal.rateLimited ? ' (rate limited)' : ''}: ${signal.message || `HTTP ${signal.httpStatus || 'error'}`}`)
      if (navigationObserved || signal?.seen === true || signal === true) return { observed: true, kind: navigationObserved ? 'navigation' : 'network', response: signal, page: activePage }
      if (await isPublished(activePage, beforeUrl, { navigationObserved })) return { observed: true, kind: 'article-transition', page: activePage }
      if (await findConfirmationButton(activePage)) return { observed: true, kind: 'confirmation-control', page: activePage }
      const current = await findPublishButton(activePage, { requiredText: '发布', includeDisabled: true })
      const currentState = await publishControlState(current)
      if (!current || !samePublishControlState(beforeControl, currentState)) return { observed: true, kind: 'control-transition', page: activePage }
    } catch (error) {
      if (!isTransientDetachedFrameError(error)) throw error
      detached = true
      logTrace('publish', 'Zhihu publish observation hit a transient detached frame; continuing bounded polling', { error: error.message })
      if (typeof reacquirePage === 'function') {
        try { activePage = await reacquirePage(activePage) || activePage } catch (reacquireError) {
          logTrace('publish', 'Could not reacquire Zhihu page after detached frame', { error: reacquireError.message })
        }
      }
    }
    await sleep(250)
  }
  return { observed: false, kind: detached ? 'detached-frame' : 'none', detached, page: activePage }
}

function isTransientDetachedFrameError(error) {
  return /detached frame|execution context was destroyed|cannot find context|target closed|target page, context or browser has been closed/i.test(String(error?.message || error || ''))
}

async function clickControlWithBoundedRetry(page, beforeUrl, initialButton, { effectSignal = null, onClickStart = null, reacquirePage = null, deadline } = {}) {
  let button = initialButton
  for (let attempt = 0; attempt < 2; attempt++) {
    const beforeControl = await publishControlState(button)
    if (!beforeControl?.visible || beforeControl.disabled) throw new Error('Exact Zhihu publish control became disabled before the trusted click; no click was attempted.')
    const clickStartedAt = typeof onClickStart === 'function' ? onClickStart() : null
    const navigationObserved = await clickPublishButton(page, button, { waitForNavigation: attempt > 0 })
    const effect = await waitForPublishEffect(page, beforeUrl, beforeControl, {
      navigationObserved,
      effectSignal: effectSignal ? () => effectSignal(clickStartedAt) : null,
      reacquirePage,
      timeoutMs: Math.min(5_000, Math.max(250, deadline - Date.now())),
    })
    if (effect.page) page = effect.page
    if (effect.observed) return effect
    if (effect.detached) throw new Error('Zhihu publish observation lost its frame during navigation; no retry was attempted.')
    if (attempt === 1) break
    const sameButton = await findPublishButton(page, { requiredText: beforeControl.text, includeDisabled: true })
    const sameState = await publishControlState(sameButton)
    if (!sameButton || !samePublishControlState(beforeControl, sameState) || sameState.disabled) break
    logTrace('publish', 'Trusted publish click produced no observable effect; retrying the unchanged enabled control once', {})
    button = sameButton
  }
  throw new Error('Zhihu publish click produced no observable effect after one bounded retry; no further click was attempted.')
}

export async function isPublished(page, beforeUrl, { navigationObserved = false } = {}) {
  const currentUrl = page.url()
  // Never treat an editor URL as published, even if a stale success message
  // remains in the DOM after navigation or a dialog transition.
  if (/\/edit(?:[/?#]|$)/.test(currentUrl)) return false
  const articleTransition = currentUrl !== beforeUrl && /\/p\/\d+(?:[/?#]|$)/.test(currentUrl) && !/\/edit(?:[/?#]|$)/.test(currentUrl)
  if (articleTransition) return true
  if (!navigationObserved) return false
  const bodyText = await page.$eval('body', element => element.innerText || '').catch(() => '')
  return /发布成功|文章已发布|已成功发布|发布完成|successfully published|published successfully/i.test(bodyText)
}

export async function verifyPublicArticleUrl(page, candidateUrl, { timeoutMs = EDITOR_TIMEOUT_MS } = {}) {
  const publicUrl = normalizePublicArticleUrl(candidateUrl)
  if (!publicUrl || !page || typeof page.goto !== 'function') return false
  const response = await page.goto(publicUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  const status = response?.status?.()
  const currentUrl = normalizePublicArticleUrl(page.url?.())
  return Boolean((!status || status < 400) && currentUrl === publicUrl)
}

async function waitForPublishedState(page, beforeUrl, deadline, { navigationObserved = false } = {}) {
  while (Date.now() < deadline) {
    if (await isPublished(page, beforeUrl, { navigationObserved })) return true
    const remaining = deadline - Date.now()
    await sleep(Math.min(500, Math.max(50, remaining)))
  }
  return false
}

function truncateDiagnosticText(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1))}…`
}

function sanitizeDiagnosticUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    return truncateDiagnosticText(`${parsed.origin}${parsed.pathname}`, PUBLISH_DIAGNOSTIC_URL_LIMIT)
  } catch {
    return truncateDiagnosticText(raw.split(/[?#]/, 1)[0], PUBLISH_DIAGNOSTIC_URL_LIMIT)
  }
}

function publishIndicatorLines(bodyText) {
  const indicators = []
  const patterns = [
    ['success', /发布成功|文章已发布|已成功发布|发布完成|published successfully|successfully published/i],
    ['error', /发布失败|发布异常|错误|失败|error|failed|异常/i],
    ['toast', /toast|提示|通知|请稍候|请重试|稍后再试/i],
  ]
  for (const line of String(bodyText || '').split(/\r?\n+/).map(value => truncateDiagnosticText(value, 500)).filter(Boolean)) {
    for (const [kind, pattern] of patterns) {
      if (pattern.test(line)) {
        indicators.push({ kind, text: line })
        break
      }
    }
    if (indicators.length >= 20) break
  }
  return indicators
}

/**
 * Reduce page/network state to a bounded, secret-safe publish diagnostic.
 * Response URLs intentionally omit query strings and no request data is read.
 */
export function summarizePublishDiagnostics({ currentUrl = '', beforeUrl = '', bodyText = '', errorMessage = '', responses = [] } = {}) {
  const nonGetResponses = []
  const publishResponses = []
  for (const response of Array.isArray(responses) ? responses : []) {
    const method = String(response?.method || '').toUpperCase()
    if (!method || method === 'GET') continue
    const rawStatus = response?.status
    const status = rawStatus === null || rawStatus === undefined || rawStatus === ''
      ? null
      : Number.isFinite(Number(rawStatus)) ? Number(rawStatus) : null
    nonGetResponses.push({
      method,
      status,
      url: sanitizeDiagnosticUrl(response?.url),
    })
    if (response?.publishPayload && isAllowedPublishEndpoint(response?.url)) {
      publishResponses.push({
        method,
        status,
        url: sanitizeDiagnosticUrl(response?.url),
        payload: sanitizePublishResponsePayload(response.publishPayload),
      })
    }
    if (nonGetResponses.length >= PUBLISH_DIAGNOSTIC_RESPONSE_LIMIT) break
  }
  return {
    currentUrl: sanitizeDiagnosticUrl(currentUrl),
    beforeUrl: sanitizeDiagnosticUrl(beforeUrl),
    bodyTextExcerpt: truncateDiagnosticText(bodyText, PUBLISH_DIAGNOSTIC_BODY_LIMIT),
    error: truncateDiagnosticText(errorMessage, PUBLISH_DIAGNOSTIC_ERROR_LIMIT),
    indicators: publishIndicatorLines(bodyText),
    nonGetResponses,
    publishResponses,
  }
}

function observePublishResponses(page) {
  const responses = []
  const publishResponses = []
  const onResponse = async response => {
    try {
      const request = typeof response?.request === 'function' ? response.request() : null
      const method = String(typeof request?.method === 'function' ? request.method() : request?.method || '').toUpperCase()
      if (!method || method === 'GET') return
      const status = typeof response?.status === 'function' ? response.status() : response?.status
      const url = typeof response?.url === 'function' ? response.url() : response?.url
      const at = Date.now()
      if (responses.length < PUBLISH_DIAGNOSTIC_RESPONSE_LIMIT) responses.push({ method, status, url, at })
      if (method !== 'OPTIONS' && isAllowedPublishEndpoint(url)) {
        const rawPayload = await Promise.resolve(typeof response?.json === 'function' ? response.json() : null).catch(() => null)
        const payload = sanitizePublishResponsePayload(rawPayload) || {}
        publishResponses.push({ ...classifyPublishResponse({ httpStatus: status, payload, url }), method, at })
        const diagnostic = responses.find(entry => entry.at === at && entry.url === url)
        if (diagnostic) diagnostic.publishPayload = payload
      }
    } catch {
      // A response can disappear while the page navigates; diagnostics must
      // never interfere with cleanup or the publish result.
    }
  }
  if (typeof page?.on !== 'function') return {
    snapshot: () => responses.slice(),
    markInteraction: () => Date.now(),
    hasResponseSince: () => false,
    stop: () => {},
  }
  page.on('response', onResponse)
  let stopped = false
  return {
    snapshot: () => responses.slice(),
    markInteraction: () => Date.now(),
    hasResponseSince: startedAt => publishResponses.find(response => startedAt && response.at >= startedAt) || null,
    stop: () => {
      if (stopped) return
      stopped = true
      try {
        if (typeof page.off === 'function') page.off('response', onResponse)
        else if (typeof page.removeListener === 'function') page.removeListener('response', onResponse)
      } catch {
        // Cleanup is best-effort if the page disconnects during navigation.
      }
    },
  }
}

async function writePublishDiagnostics(page, { artifactDir, beforeUrl, errorMessage = '', responses = [] } = {}) {
  if (!artifactDir) return null
  const currentUrl = await Promise.resolve().then(() => page?.url?.() || '').catch(() => '')
  const bodyText = await Promise.resolve().then(() => page?.$eval?.('body', element => element.innerText || '')).catch(() => '')
  const summary = summarizePublishDiagnostics({ currentUrl, beforeUrl, bodyText, errorMessage, responses })
  try {
    await fs.mkdir(artifactDir, { recursive: true, mode: 0o700 })
    await fs.writeFile(path.join(artifactDir, 'publish-diagnostic.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), ...summary }, null, 2)}\n`, { mode: 0o600 })
    if (errorMessage && page && !page.isClosed()) {
      await page.screenshot({ path: path.join(artifactDir, 'publish-failed.png'), fullPage: true }).catch(() => {})
    }
    logTrace('publish', 'Zhihu post-click diagnostics captured', {
      url: summary.currentUrl,
      responseCount: summary.nonGetResponses.length,
      indicators: summary.indicators,
      error: summary.error,
    })
  } catch (diagnosticError) {
    logTrace('publish', 'Could not persist Zhihu post-click diagnostics', { error: diagnosticError.message })
  }
  return summary
}

// Zhihu's publish flow is two-step in current editor versions: the toolbar
// 发布 button opens a settings dialog whose own 发布/确定发布 button actually
// submits. Click the first control, then any follow-up confirmation, and only
// record success once the page navigates to an article URL or shows a success
// message. Fails safely without guessing when no exact control is found.
export async function clickPublishAndConfirm(page, beforeUrl, { effectSignal = null, onClickStart = null, reacquirePage = null, verifyPublicUrl = null, timeoutMs = PUBLISH_CONFIRMATION_TIMEOUT_MS } = {}) {
  let activePage = page
  let button = await findPublishButton(activePage)
  if (!button) throw new Error('Exact Zhihu publish button was not found; no click was attempted.')
  const deadline = Date.now() + timeoutMs
  const firstEffect = await clickControlWithBoundedRetry(activePage, beforeUrl, button, { effectSignal, onClickStart, reacquirePage, deadline })
  activePage = firstEffect.page || activePage
  if (firstEffect.response?.publicUrl && typeof verifyPublicUrl === 'function' && await verifyPublicUrl(activePage, firstEffect.response.publicUrl)) return
  if (await isPublished(activePage, beforeUrl, { navigationObserved: firstEffect.kind === 'navigation' })) return
  let confirmation = await findConfirmationButton(activePage)
  if (confirmation) {
    const confirmationEffect = await clickControlWithBoundedRetry(activePage, beforeUrl, confirmation, { effectSignal, onClickStart, reacquirePage, deadline })
    activePage = confirmationEffect.page || activePage
    if (confirmationEffect.response?.publicUrl && typeof verifyPublicUrl === 'function' && await verifyPublicUrl(activePage, confirmationEffect.response.publicUrl)) return
  }
  // A successful click can start an asynchronous publish transition while the
  // editor controls disappear. Poll that transition instead of issuing a
  // speculative extra click.
  if (await waitForPublishedState(activePage, beforeUrl, deadline, { navigationObserved: firstEffect.kind === 'navigation' })) return
  if (!confirmation) confirmation = await findConfirmationButton(activePage)
  if (confirmation) {
    const confirmationEffect = await clickControlWithBoundedRetry(activePage, beforeUrl, confirmation, { effectSignal, onClickStart, reacquirePage, deadline })
    activePage = confirmationEffect.page || activePage
    if (confirmationEffect.response?.publicUrl && typeof verifyPublicUrl === 'function' && await verifyPublicUrl(activePage, confirmationEffect.response.publicUrl)) return
    if (await waitForPublishedState(activePage, beforeUrl, deadline, { navigationObserved: false })) return
  }
  throw new Error('Zhihu did not confirm that the article was published; no success was recorded.')
}

export async function publishZhihuJob(job, account) {
  const puppeteer = await loadPuppeteer()
  if (!puppeteer) throw new Error('Puppeteer is not installed.')
  if (!job.approvedAt) throw new Error('Job approval is required before publishing.')
  const strategy = getZhihuPublishStrategy(account)
  const mode = strategy.mode
  const visible = strategy.visible
  // Background mode is intentionally stateless: it must never reuse a page
  // retained by the visible approval flow, even if the account mode changed
  // between preparation and approval.
  let session = strategy.usePendingSession ? pendingJobSessions.get(job.id) : null
  if (!strategy.usePendingSession) {
    const staleVisibleSession = pendingJobSessions.get(job.id)
    if (staleVisibleSession) {
      pendingJobSessions.delete(job.id)
      await staleVisibleSession.browser.close().catch(() => {})
    }
  }
  if (session && session.page.isClosed()) {
    pendingJobSessions.delete(job.id)
    session = null
  }
  const executablePath = browserExecutablePath()
  const browser = session?.browser || await launchBrowser(puppeteer, { headless: strategy.headless, userDataDir: account.profileDir, executablePath })
  // Visible sessions are retained for human inspection after a failed
  // approval-gated publish. Background sessions are always cleaned up here;
  // they never reuse or retain the visible browser path.
  let keepOpen = Boolean(session && strategy.usePendingSession)
  let page = null
  let beforeUrl = ''
  let responseCapture = null
  try {
    page = session?.page || await getWorkingPage(browser, { visible })
    if (!session) {
      await loadAccountCookies(page, account)
      const draft = await fillZhihuDraft(page, job)
      if (draft.loginRequired) throw new Error('Zhihu requires login or a manual security check.')
      const publishReadiness = await waitForPublishReadiness(page)
      logTrace('publish', 'Background Zhihu publish control became ready', { jobId: job.id, ...publishReadiness })
    } else {
      await waitForPageReady(page, 'Prepared Zhihu draft')
      if (await detectLoginRequired(page)) throw new Error('Zhihu requires login or a manual security check.')
      await waitForDraftStable(page)
    }
    beforeUrl = page.url()
    responseCapture = observePublishResponses(page)
    await clickPublishAndConfirm(page, beforeUrl, {
      onClickStart: responseCapture.markInteraction,
      effectSignal: startedAt => responseCapture.hasResponseSince(startedAt),
      reacquirePage: async () => {
        page = await getWorkingPage(browser, { visible })
        return page
      },
      verifyPublicUrl: (candidatePage, candidateUrl) => verifyPublicArticleUrl(candidatePage, candidateUrl),
    })
    responseCapture.stop()
    await writePublishDiagnostics(page, { artifactDir: job.artifactDir, beforeUrl, responses: responseCapture.snapshot() })
    pendingJobSessions.delete(job.id)
    keepOpen = false
    return { externalUrl: page.url() }
  } catch (error) {
    responseCapture?.stop()
    await writePublishDiagnostics(page, { artifactDir: job.artifactDir, beforeUrl, errorMessage: error.message, responses: responseCapture?.snapshot() || [] })
    logTrace('publish', 'Zhihu publish failed', { accountId: account.id, jobId: job.id, error: error.message })
    if (strategy.retainSessionOnFailure && page && !page.isClosed()) {
      pendingJobSessions.set(job.id, { browser, page, accountId: account.id })
      keepOpen = true
    }
    throw error
  } finally {
    responseCapture?.stop()
    if (!keepOpen) await browser.close().catch(() => {})
  }
}

export async function discardZhihuJobSession(jobId) {
  const session = pendingJobSessions.get(jobId)
  if (!session) return false
  pendingJobSessions.delete(jobId)
  await session.browser.close().catch(() => {})
  return true
}
