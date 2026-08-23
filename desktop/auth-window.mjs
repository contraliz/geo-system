import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { filterPlatformCookies, sanitizeAuthorizationError, sanitizeAuthorizationResult } from '../publisher/electron-auth.mjs'
import { configureAuthorizationSession } from '../publisher/auth-session-compat.mjs'

const { BrowserWindow, ipcMain, session } = await import('electron')
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)
const toolbarPath = path.join(root, 'publisher', 'auth-window-toolbar.html')
const preloadPath = path.join(root, 'publisher', 'auth-window-preload.cjs')

function webUrl(value) {
  try {
    const parsed = new URL(String(value))
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch { return false }
}

function partitionFor(platform, accountId) {
  return `persist:geo-${String(platform || '').replace(/[^a-z0-9_-]/gi, '')}-${String(accountId || '').replace(/[^a-z0-9_-]/gi, '')}`
}

function safeText(value, limit = 512) {
  return typeof value === 'string' ? value.slice(0, limit) : ''
}

function configureNavigation(webContents) {
  webContents.on('will-navigate', (event, url) => { if (!webUrl(url)) event.preventDefault() })
  webContents.setWindowOpenHandler(({ url }) => {
    if (webUrl(url)) void webContents.loadURL(url).catch(() => {})
    return { action: 'deny' }
  })
}

function updatePlatformState(toolbar, message, isError = false) {
  if (toolbar.isDestroyed()) return
  void toolbar.executeJavaScript(`window.geoAuthToolbar?.setState(${JSON.stringify(safeText(message, 240))}, ${Boolean(isError)})`, true).catch(() => {})
}

async function readCapture(webContents, metadata, partition) {
  const authSession = session.fromPartition(partition, { cache: true })
  const cookies = filterPlatformCookies(await authSession.cookies.get({}), metadata.cookieDomain)
  const selectors = JSON.stringify({ names: metadata.nameSelectors || [], avatars: metadata.avatarSelectors || [] })
  const pageData = await webContents.executeJavaScript(`(() => { const selectors=${selectors}; const read=storage=>{const result={};try{for(let i=0;i<storage.length;i+=1){const key=storage.key(i);if(key)result[key]=storage.getItem(key)||''}}catch{}return result}; const text=list=>{for(const selector of list||[]){const element=document.querySelector(selector);const value=(element?.textContent||element?.getAttribute?.('title')||element?.getAttribute?.('alt')||'').trim();if(value)return value}return ''}; const image=list=>{for(const selector of list||[]){const element=document.querySelector(selector);const value=element?.currentSrc||element?.getAttribute?.('src')||element?.getAttribute?.('data-src')||'';if(value)return value.startsWith('//')?'https:'+value:value}return ''}; const body=document.body?.innerText||''; return {localStorage:read(localStorage),sessionStorage:read(sessionStorage),origin:location.origin,url:location.href,title:document.title||'',accountName:text(selectors.names),avatarUrl:image(selectors.avatars),body:body.slice(0,6000)}})()`, true)
  const body = String(pageData.body || '')
  const identityDetected = Boolean(pageData.accountName || pageData.avatarUrl)
  const loginRequired = (metadata.loginMarkers || []).some(marker => body.toLowerCase().includes(String(marker).toLowerCase())) && !identityDetected
  const clientError = /10001|请求参数异常|升级客户端|upgrade\s*client/i.test(body)
  const loginUrl = /\/(?:signin|login)(?:[/?#]|$)/i.test(String(pageData.url || ''))
  return sanitizeAuthorizationResult({
    ok: true,
    authenticated: !loginRequired && !clientError && !loginUrl && identityDetected,
    errorCode: clientError ? 'zhihu-client-outdated' : null,
    error: clientError ? 'The platform reported error 10001 (request parameters invalid). Update the installed browser and retry authorization.' : null,
    cookies,
    localStorage: pageData.localStorage || {},
    sessionStorage: pageData.sessionStorage || {},
    origin: safeText(pageData.origin, 200),
    url: safeText(pageData.url, 500),
    accountName: safeText(pageData.accountName, 120),
    avatarUrl: safeText(pageData.avatarUrl, 1_000),
  })
}

async function postJson(url, body, token) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GEO-AUTH-TOKEN': token }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(sanitizeAuthorizationError(payload.error || `Authorization result rejected (${response.status}).`))
  return payload
}

export async function openDesktopAuthWindow({ accountId, platform, publisherPort = 8788, parent } = {}) {
  const metadataModule = await import('../publisher/platform-auth-config.mjs')
  const metadata = metadataModule.getPlatformAuthConfig(platform)
  if (!metadata) return { ok: false, error: `No authorization configuration exists for platform ${platform}.` }
  const normalizedAccountId = String(accountId || '')
  if (!/^acct-[a-z0-9_-]+$/i.test(normalizedAccountId)) return { ok: false, error: 'The account identifier is invalid.' }
  const partition = partitionFor(metadata.id, normalizedAccountId)
  const authSession = session.fromPartition(partition, { cache: true })
  authSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  authSession.setSpellCheckerEnabled(false)
  configureAuthorizationSession(authSession)
  const token = crypto.randomBytes(32).toString('hex')
  const publisherUrl = `http://127.0.0.1:${Number(publisherPort) || 8788}`
  await postJson(`${publisherUrl}/api/publisher/accounts/auth-start`, { accountId: normalizedAccountId, platform: metadata.id, token }, token)

  return new Promise(resolve => {
    let webContents = null
    let settled = false
    let resolveView
    const viewReady = new Promise(resolveViewValue => { resolveView = resolveViewValue })
    const win = new BrowserWindow({ parent, width: 1280, height: 820, useContentSize: true, minWidth: 760, minHeight: 560, title: `${metadata.name} authorization`, autoHideMenuBar: true, backgroundColor: '#ffffff', webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true, spellcheck: false } })
    const cleanup = () => {
      ipcMain.removeListener('geo-auth-webview-ready', onViewReady)
      ipcMain.removeListener('geo-auth-finish', onFinish)
      ipcMain.removeListener('geo-auth-cancel', onCancel)
      win.removeAllListeners('closed')
    }
    const finish = value => { if (settled) return; settled = true; cleanup(); if (!win.isDestroyed()) win.close(); resolve(value) }
    const onViewReady = event => {
      if (event.sender !== win.webContents) return
      void (async () => {
        await viewReady
        const targetUrl = metadata.initialUrl || metadata.loginUrl
        if (webContents.getURL() !== targetUrl) await webContents.loadURL(targetUrl)
      })().catch(error => finish({ ok: false, error: sanitizeAuthorizationError(error.message), errorCode: 'auth-window-load-failed' }))
    }
    const onFinish = event => {
      if (event.sender !== win.webContents) return
      void (async () => {
        if (!webContents) throw new Error('The platform login surface is not ready yet.')
        await win.webContents.executeJavaScript("const b=document.getElementById('finish'); if(b){b.disabled=true; b.textContent='Verifying… / 验证中…'}", true).catch(() => {})
        const capture = await readCapture(webContents, metadata, partition)
        const result = await postJson(`${publisherUrl}/api/publisher/accounts/${encodeURIComponent(normalizedAccountId)}/auth-result`, capture, token)
        finish({ ok: true, ...result })
      })().catch(error => finish({ ok: false, error: sanitizeAuthorizationError(error.message), errorCode: 'auth-window-error' }))
    }
    const onCancel = event => { if (event.sender === win.webContents) finish({ ok: false, error: 'Authorization cancelled.', errorCode: 'auth-window-cancelled' }) }
    win.webContents.on('did-attach-webview', (_event, guestContents) => {
      if (webContents) return
      webContents = guestContents
      configureNavigation(webContents)
      updatePlatformState(win.webContents, 'Loading secure login page… / 正在加载安全登录页面…')
      webContents.on('did-start-loading', () => { console.log('[desktop] auth guest did-start-loading'); updatePlatformState(win.webContents, 'Loading secure login page… / 正在加载安全登录页面…') })
      webContents.on('did-finish-load', () => { console.log('[desktop] auth guest did-finish-load'); updatePlatformState(win.webContents, '') })
      webContents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
        if (!isMainFrame) return
        console.error(`[desktop] auth guest did-fail-load (${errorCode}): ${safeText(errorDescription, 180)}`)
        updatePlatformState(win.webContents, `The platform page could not load (error ${errorCode}). Check your connection and retry. / 平台页面加载失败（错误 ${errorCode}）。`, true)
      })
      webContents.on('render-process-gone', (_event, details) => {
        console.error(`[desktop] auth guest render-process-gone: ${safeText(details?.reason, 80)} (${details?.exitCode ?? 'unknown'})`)
        updatePlatformState(win.webContents, `The platform page stopped unexpectedly (${safeText(details?.reason, 80)}). Reopen authorization to retry. / 平台页面意外停止，请重新授权。`, true)
      })
      resolveView(webContents)
    })
    win.on('closed', () => { if (!settled) finish({ ok: false, error: 'Authorization window was closed before completion.', errorCode: 'auth-window-closed' }) })
    ipcMain.on('geo-auth-webview-ready', onViewReady)
    ipcMain.on('geo-auth-finish', onFinish)
    ipcMain.on('geo-auth-cancel', onCancel)
    void win.loadFile(toolbarPath, { query: { partition, title: `${metadata.name} authorization / ${metadata.nameZh}`, initialUrl: metadata.initialUrl || metadata.loginUrl } }).catch(error => finish({ ok: false, error: sanitizeAuthorizationError(error.message), errorCode: 'auth-window-load-failed' }))
  })
}

export { partitionFor }
