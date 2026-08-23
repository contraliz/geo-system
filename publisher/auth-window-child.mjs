import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { filterPlatformCookies, sanitizeAuthorizationError } from './electron-auth.mjs'
import { configureAuthorizationSession } from './auth-session-compat.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(process.env.GEO_AUTH_CONFIG || '{}')
const { app, BrowserWindow, ipcMain, session } = await import('electron')

// The authorization shell is ordinary 2D account UI. Keeping it on Chromium's
// software rendering path avoids Windows GPU-process crashes surfacing as the
// misleading ERR_FAILED page-load error reported by Electron.
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-software-rasterizer')

const resultPrefix = 'GEO_AUTH_RESULT:'
const safeString = (value, limit = 512) => typeof value === 'string' ? value.slice(0, limit) : ''
const writeResult = value => process.stdout.write(`${resultPrefix}${JSON.stringify(value)}\n`)
const writeError = (message, errorCode = 'auth-window-error') => writeResult({ ok: false, error: sanitizeAuthorizationError(message), errorCode })
const smokeAutoFinish = process.env.GEO_AUTH_SMOKE_AUTOFINISH === '1'
  && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(String(config.initialUrl || ''))
  && path.basename(String(config.profileDir || '')).startsWith('geo-electron-auth-smoke-')

let windowRef
let view
let finished = false
let resolveView
const viewReady = new Promise(resolve => { resolveView = resolve })

function isWebUrl(value) {
  try {
    const url = new URL(String(value))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function configurePlatformNavigation() {
  // The account page may redirect through a platform identity provider, so
  // allow ordinary web navigation but never permit a renderer to leave the
  // isolated web surface via file/data/javascript/custom schemes.
  view.on('will-navigate', (event, url) => {
    if (!isWebUrl(url)) event.preventDefault()
  })
  view.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void view.loadURL(url).catch(() => {})
    return { action: 'deny' }
  })
}

async function hydrateSession(authSession) {
  if (!config.hydrateSession || !config.accountId) return
  try {
    const { loadSession } = await import('./vault.mjs')
    const stored = await loadSession(config.accountId)
    const targetUrl = config.initialUrl || config.adminUrl || config.loginUrl
    for (const cookie of stored.cookies || []) {
      const sameSite = cookie.sameSite === 'None' ? 'no_restriction' : String(cookie.sameSite || '').toLowerCase() || undefined
      const payload = { ...cookie, url: targetUrl, ...(sameSite ? { sameSite } : {}) }
      delete payload.expires
      await authSession.cookies.set(payload).catch(() => {})
    }
    if (stored.cookies?.length || Object.keys(stored.localStorage || {}).length || Object.keys(stored.sessionStorage || {}).length) {
      await view.loadURL(targetUrl)
      await view.executeJavaScript(`(() => { const localStorageData=${JSON.stringify(stored.localStorage || {})}; const sessionStorageData=${JSON.stringify(stored.sessionStorage || {})}; for (const [key,value] of Object.entries(localStorageData)) localStorage.setItem(key,value); for (const [key,value] of Object.entries(sessionStorageData)) sessionStorage.setItem(key,value) })()`, true).catch(() => {})
      if (Object.keys(stored.localStorage || {}).length || Object.keys(stored.sessionStorage || {}).length) await view.reload().catch(() => {})
      return true
    }
  } catch { /* a missing vault is equivalent to a fresh authorization */ }
  return false
}

async function capture() {
  const authSession = session.fromPartition(config.partition, { cache: true })
  const cookies = filterPlatformCookies(await authSession.cookies.get({}), config.cookieDomain)
  const selectors = JSON.stringify({ names: config.nameSelectors || [], avatars: config.avatarSelectors || [] })
  const pageData = await view.executeJavaScript(`(() => { const selectors=${selectors}; const read=storage=>{const result={};try{for(let i=0;i<storage.length;i+=1){const key=storage.key(i);if(key)result[key]=storage.getItem(key)||''}}catch{}return result}; const text=list=>{for(const selector of list||[]){const element=document.querySelector(selector);const value=(element?.textContent||element?.getAttribute?.('title')||element?.getAttribute?.('alt')||'').trim();if(value)return value}return ''}; const image=list=>{for(const selector of list||[]){const element=document.querySelector(selector);const value=element?.currentSrc||element?.getAttribute?.('src')||element?.getAttribute?.('data-src')||'';if(value)return value.startsWith('//')?'https:'+value:value}return ''}; const body=document.body?.innerText||''; return {localStorage:read(localStorage),sessionStorage:read(sessionStorage),origin:location.origin,url:location.href,title:document.title||'',accountName:text(selectors.names),avatarUrl:image(selectors.avatars),body:body.slice(0,6000)}})()`, true)
  const body = String(pageData.body || '')
  const identityDetected = Boolean(pageData.accountName || pageData.avatarUrl)
  const loginRequired = (config.loginMarkers || []).some(marker => body.toLowerCase().includes(String(marker).toLowerCase())) && !identityDetected
  const clientError = /10001|请求参数异常|升级客户端|upgrade\s*client/i.test(body)
  const loginUrl = /\/(?:signin|login)(?:[/?#]|$)/i.test(String(pageData.url || ''))
  return { ok: true, authenticated: !loginRequired && !clientError && !loginUrl && identityDetected, errorCode: clientError ? 'zhihu-client-outdated' : null, error: clientError ? 'The platform reported error 10001 (request parameters invalid). Update the installed browser and retry authorization.' : null, cookies, localStorage: pageData.localStorage || {}, sessionStorage: pageData.sessionStorage || {}, origin: safeString(pageData.origin, 200), url: safeString(pageData.url, 500), accountName: safeString(pageData.accountName, 120), avatarUrl: safeString(pageData.avatarUrl, 1_000) }
}

async function finishAuthorization() {
  if (finished) return
  finished = true
  try { writeResult(await capture()) } catch (error) { writeError(error.message) } finally { setTimeout(() => app.quit(), 40) }
}

async function start() {
  if (!config.profileDir || !path.isAbsolute(config.profileDir)) throw new Error('Authorization profile path is invalid.')
  app.setPath('userData', config.profileDir)
  await app.whenReady()
  const partitionSession = session.fromPartition(config.partition, { cache: true })
  partitionSession.setSpellCheckerEnabled(false)
  configureAuthorizationSession(partitionSession)
  windowRef = new BrowserWindow({ width: 1280, height: 820, useContentSize: true, minWidth: 760, minHeight: 560, title: `${config.name || 'Account'} authorization`, webPreferences: { preload: path.join(here, 'auth-window-preload.cjs'), contextIsolation: true, nodeIntegration: false, webviewTag: true, spellcheck: false } })
  windowRef.webContents.on('did-attach-webview', (_event, webContents) => {
    if (view) return
    view = webContents
    configurePlatformNavigation()
    if (smokeAutoFinish) view.on('did-finish-load', () => {
      if (view.getURL() === config.initialUrl) setTimeout(() => void finishAuthorization(), 50)
    })
    resolveView(view)
  })
  // Keep the toolbar as a real local document. A long data URL is rejected by
  // Chromium with ERR_FAILED on some Electron versions before the user can
  // reach the platform login page.
  windowRef.on('closed', () => { if (!finished) writeError('Authorization window was closed before completion.', 'auth-window-closed'); app.quit() })
  ipcMain.once('geo-auth-cancel', () => { writeError('Authorization cancelled.', 'auth-window-cancelled'); app.quit() })
  ipcMain.once('geo-auth-finish', () => void finishAuthorization())
  ipcMain.once('geo-auth-webview-ready', () => void (async () => {
    await viewReady
    const hydrated = await hydrateSession(partitionSession)
    if (!hydrated) await view.loadURL(config.initialUrl || config.loginUrl)
  })().catch(error => { writeError(error.message); app.quit() }))
  const toolbarUrl = pathToFileURL(path.join(here, 'auth-window-toolbar.html'))
  toolbarUrl.searchParams.set('partition', config.partition)
  toolbarUrl.searchParams.set('title', `${config.name || 'Account'} authorization / ${config.nameZh || ''}`)
  toolbarUrl.searchParams.set('initialUrl', config.initialUrl || config.loginUrl || '')
  await windowRef.loadURL(toolbarUrl.href)
  void partitionSession
}

start().catch(error => { writeError(error.message); app.quit() })
