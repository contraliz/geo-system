import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startLocalRendererServer } from './local-server.mjs'
import { waitForHttp } from './readiness.mjs'
import { openDesktopAuthWindow } from './auth-window.mjs'
import { hasDesktopAuthProtocol, incompatiblePublisherError, readPublisherStatus } from './publisher-protocol.mjs'
import { isAllowedRendererNavigation } from './navigation.mjs'
import { readStoredApiKey, saveStoredApiKey } from './credential-store.mjs'

const { app, BrowserWindow, ipcMain, safeStorage, session, shell } = await import('electron')
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)
const useDevRenderer = process.argv.includes('--dev') || process.env.GEO_DESKTOP_DEV === '1'
const configuredUserData = process.env.GEO_DESKTOP_USER_DATA_DIR
  ? path.resolve(process.env.GEO_DESKTOP_USER_DATA_DIR)
  : useDevRenderer
    ? path.join(root, '.geo-desktop')
    : path.join(app.getPath('appData'), 'GEO System')
// Keep Chromium's profile and cache in an app-owned writable directory. This
// must happen before readiness/BrowserWindow creation; default Electron cache
// locations can be denied by locked-down Windows environments.
app.setPath('userData', configuredUserData)
app.setPath('cache', path.join(configuredUserData, 'cache'))
// Use Electron's supported software-rendering path before readiness. This
// avoids a failing GPU child process without weakening renderer sandboxing.
app.disableHardwareAcceleration()
let rendererUrl = process.env.GEO_RENDERER_URL || (useDevRenderer ? 'http://127.0.0.1:5173/' : null)
let publisherProcess
let proxyProcess
let rendererServer
let mainWindow
let credentialWindow
let credentialWindowResult
let credentialLanguage = 'en'
const credentialWindowPath = path.join(here, 'credential-window.html')

async function startPublisherService() {
  const port = Number(process.env.PUBLISHER_PORT || 8788)
  const publisherUrl = `http://127.0.0.1:${port}/api/publisher/status`
  const verify = async status => {
    if (!hasDesktopAuthProtocol(status)) throw new Error(incompatiblePublisherError({ port, status }))
    return status
  }
  try {
    const existing = await readPublisherStatus(publisherUrl)
    return await verify(existing)
  } catch (error) {
    if (/incompatible with desktop account authorization/i.test(error.message)) throw error
    if (error.publisherReachable) throw new Error(incompatiblePublisherError({ port }))
  }
  if (process.env.GEO_DESKTOP_EXTERNAL_PUBLISHER === '1') {
    await waitForHttp(publisherUrl, { label: 'publisher service' })
    return verify(await readPublisherStatus(publisherUrl))
  }
  const serverPath = path.join(root, 'publisher', 'server.mjs')
  const env = { ...process.env, GEO_ELECTRON_PATH: process.execPath, GEO_PUBLISHER_RUNTIME: 'electron', GEO_PUBLISHER_DATA_DIR: process.env.GEO_PUBLISHER_DATA_DIR || path.join(app.getPath('userData'), 'publisher') }
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
  publisherProcess = spawn(process.execPath, [serverPath], { cwd: root, env, stdio: 'inherit', windowsHide: true })
  publisherProcess.on('error', error => console.error('[desktop] publisher service failed:', error.message))
  await waitForHttp(publisherUrl, { label: 'publisher service' })
  try { return verify(await readPublisherStatus(publisherUrl)) }
  catch (error) { if (error.publisherReachable) throw new Error(incompatiblePublisherError({ port })); throw error }
}

async function startProxyService() {
  if (process.env.GEO_DESKTOP_EXTERNAL_PROXY === '1') return
  const proxyPath = path.join(root, 'server', 'proxy.mjs')
  const env = { ...process.env }
  try {
    const storedApiKey = await readStoredApiKey({ userDataPath: app.getPath('userData'), safeStorage })
    if (storedApiKey) env.ANTHROPIC_API_KEY = storedApiKey
  } catch {
    // Environment/.env configuration remains the fallback for development.
    console.error('[desktop] encrypted MiniMax API key unavailable; using environment configuration')
  }
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', proxyPath], { cwd: root, env, stdio: 'inherit', windowsHide: true })
  proxyProcess = child
  proxyProcess.on('error', error => console.error('[desktop] proxy service failed:', error.message))
  const statusUrl = `http://127.0.0.1:${Number(process.env.PROXY_PORT || 8787)}/api/anthropic/status`
  await waitForHttp(statusUrl, { label: 'AI proxy' })
  const status = await fetch(statusUrl).then(response => response.json()).catch(() => ({}))
  if (!child.pid || status.pid !== child.pid || child.exitCode !== null || child.killed) {
    if (!child.killed) child.kill()
    proxyProcess = null
    throw new Error('The desktop proxy did not own its status endpoint; stop the stale proxy on port 8787 and retry.')
  }
}

async function stopProxyService() {
  const child = proxyProcess
  proxyProcess = null
  if (!child || child.exitCode !== null) return
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 1_500)
    child.once('exit', () => { clearTimeout(timer); resolve() })
    child.kill()
  })
}

async function restartProxyService() {
  await stopProxyService()
  await startProxyService()
}

function resolveCredentialWindow(result) {
  const resolve = credentialWindowResult?.resolve
  credentialWindowResult = null
  if (resolve) resolve(result)
}

function credentialError(english, chinese) {
  return credentialLanguage === 'zh' ? chinese : english
}

function openCredentialWindow(language = 'en') {
  if (credentialWindow && !credentialWindow.isDestroyed()) {
    credentialWindow.focus()
    return credentialWindowResult?.promise || Promise.resolve({ ok: false, cancelled: true })
  }
  credentialLanguage = language === 'zh' ? 'zh' : 'en'
  credentialWindow = new BrowserWindow({
    width: 590,
    height: 430,
    minWidth: 500,
    minHeight: 380,
    parent: mainWindow,
    modal: true,
    resizable: false,
    show: false,
    title: 'Configure Live writing agent / 配置实时写作代理',
    webPreferences: {
      preload: path.join(here, 'credential-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  let resolve
  const promise = new Promise(nextResolve => { resolve = nextResolve })
  credentialWindowResult = { promise, resolve }
  const allowedCredentialUrl = pathToFileURL(credentialWindowPath).href
  credentialWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  credentialWindow.webContents.on('will-navigate', (event, destination) => {
    if (destination !== allowedCredentialUrl && !destination.startsWith(`${allowedCredentialUrl}?`)) event.preventDefault()
  })
  credentialWindow.webContents.on('did-fail-load', (_event, _code, _description, _validatedUrl, isMainFrame) => {
    if (isMainFrame) {
      resolveCredentialWindow({ ok: false, error: credentialError('The API-key window could not load. Restart the desktop app and try again.', 'API 密钥窗口无法加载，请重启桌面应用后重试。') })
      if (!credentialWindow?.isDestroyed()) credentialWindow?.close()
    }
  })
  credentialWindow.once('ready-to-show', () => credentialWindow?.show())
  credentialWindow.on('closed', () => {
    credentialWindow = null
    resolveCredentialWindow({ ok: false, cancelled: true })
  })
  void credentialWindow.loadFile(credentialWindowPath, { query: { language: language === 'zh' ? 'zh' : 'en' } }).catch(() => {
    resolveCredentialWindow({ ok: false, error: credentialError('The API-key window could not load. Restart the desktop app and try again.', 'API 密钥窗口无法加载，请重启桌面应用后重试。') })
    if (!credentialWindow?.isDestroyed()) credentialWindow?.close()
  })
  return promise
}

async function showRendererError(win) {
  await win.webContents.executeJavaScript(`document.body.innerHTML = '<main style="font:16px system-ui;padding:48px;color:#16233b;background:#f7f9fc"><h1>GEO System could not render</h1><p>The local renderer loaded without mounting its application UI.</p><p>Restart <code>npm run desktop:dev</code> and retry. If this continues, check the local Vite service at 127.0.0.1:5173.</p></main>'`, true).catch(() => {})
}

async function ensureRendererMounted(win, url) {
  const mounted = async () => win.webContents.executeJavaScript('Boolean(document.querySelector("#root")?.childElementCount)', true).catch(() => true)
  if (await mounted()) return
  console.error('[desktop] renderer root is empty; retrying one local load')
  try { await win.loadURL(url) } catch { await showRendererError(win); return }
  await new Promise(resolve => setTimeout(resolve, 750))
  if (!(await mounted())) {
    console.error('[desktop] renderer root remained empty after retry')
    await showRendererError(win)
  }
}

async function createWindow() {
  if (!rendererUrl && !fs.existsSync(path.join(root, 'dist', 'index.html'))) throw new Error('The desktop renderer is not built. Run `npm run build` first, or use `npm run desktop:dev` while Vite is running.')
  const win = new BrowserWindow({ width: 1440, height: 920, minWidth: 1080, minHeight: 700, backgroundColor: '#eef3f8', title: 'GEO System', webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } })
  const allowedRenderer = rendererUrl
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (isMainFrame) console.error(`[desktop] renderer load failed (${errorCode}): ${errorDescription} at ${validatedUrl}`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[desktop] renderer process exited: ${details.reason} (${details.exitCode})`)
  })
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) void shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (event, navigationDetails) => {
    const destination = typeof navigationDetails === 'string' ? navigationDetails : navigationDetails?.url || event.url || ''
    if (isAllowedRendererNavigation(destination, allowedRenderer)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(destination)) void shell.openExternal(destination)
  })
  await win.loadURL(rendererUrl)
  await new Promise(resolve => setTimeout(resolve, 750))
  await ensureRendererMounted(win, rendererUrl)
  mainWindow = win
  win.on('closed', () => { if (mainWindow === win) mainWindow = null })
  return win
}

app.whenReady().then(async () => {
  // Restrict the desktop renderer to local app content. Account web content
  // opens in a main-process-owned, per-account Electron partition.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setSpellCheckerEnabled(false)
  ipcMain.handle('geo-open-auth-window', (event, input) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'Authorization requests are accepted only from the GEO desktop window.' }
    return openDesktopAuthWindow({ ...input, parent: mainWindow, publisherPort: process.env.PUBLISHER_PORT || 8788 })
  })
  ipcMain.handle('geo-open-api-key-window', (event, input) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'API-key requests are accepted only from the GEO desktop window.' }
    return openCredentialWindow(input?.language)
  })
  ipcMain.handle('geo-save-api-key', async (event, input) => {
    if (!credentialWindow || event.sender !== credentialWindow.webContents) return { ok: false, error: 'Credential requests are accepted only from the API-key window.' }
    try {
      await saveStoredApiKey({ userDataPath: app.getPath('userData'), safeStorage }, input)
      await restartProxyService()
      const result = { ok: true, configured: true }
      resolveCredentialWindow(result)
      credentialWindow.close()
      return result
    } catch {
      return { ok: false, error: credentialError('The API key could not be saved or the local proxy could not be restarted. Try again.', '无法保存 API 密钥或重启本地代理，请重试。') }
    }
  })
  ipcMain.handle('geo-cancel-api-key', (event) => {
    if (!credentialWindow || event.sender !== credentialWindow.webContents) return { ok: false, error: 'Credential requests are accepted only from the API-key window.' }
    resolveCredentialWindow({ ok: false, cancelled: true })
    credentialWindow.close()
    return { ok: true, cancelled: true }
  })
  await startProxyService()
  if (!rendererUrl) {
    rendererServer = await startLocalRendererServer({ root })
    rendererUrl = rendererServer.url
  }
  await Promise.all([
    waitForHttp(rendererUrl, { label: useDevRenderer ? 'Vite renderer' : 'local renderer' }),
    startPublisherService(),
  ])
  await createWindow()
  app.on('activate', async () => { if (!BrowserWindow.getAllWindows().length) await createWindow() })
}).catch(error => { console.error('[desktop] startup failed:', error.message); app.quit() })

app.on('window-all-closed', () => { if (publisherProcess && !publisherProcess.killed) publisherProcess.kill(); if (proxyProcess && !proxyProcess.killed) proxyProcess.kill(); rendererServer?.server.close(); if (process.platform !== 'darwin') app.quit() })
