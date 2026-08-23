import test from 'node:test'
import assert from 'node:assert/strict'
import { getPlatformAuthConfig, platformAuthConfigs } from '../publisher/platform-auth-config.mjs'
import { filterPlatformCookies, resolveElectronExecutable, sanitizeAuthorizationError, sanitizeAuthorizationResult } from '../publisher/electron-auth.mjs'
import { buildChromiumUserAgent, configureAuthorizationSession, DEFAULT_ACCEPT_LANGUAGES } from '../publisher/auth-session-compat.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

test('authorization catalog has isolated login metadata for supported Chinese platforms', () => {
  const ids = Object.keys(platformAuthConfigs)
  assert.ok(ids.length >= 12)
  for (const id of ids) {
    const config = getPlatformAuthConfig(id)
    assert.equal(config.id, id)
    assert.match(config.loginUrl, /^https:\/\//)
    assert.match(config.cookieDomain, /\./)
    assert.ok(Array.isArray(config.nameSelectors))
  }
})

test('authorization result sanitizer keeps session payload private and bounded to known fields', () => {
  const sanitized = sanitizeAuthorizationResult({ ok: 1, authenticated: 1, cookies: [{ name: 'sid', value: 'secret' }], localStorage: { token: 'value' }, sessionStorage: { temp: 'value' }, accountName: 'Zhihu account', avatarUrl: 'https://example.com/a.png', unexpected: 'discarded' })
  assert.equal(sanitized.ok, true)
  assert.deepEqual(sanitized.cookies, [{ name: 'sid', value: 'secret' }])
  assert.equal(Object.hasOwn(sanitized, 'unexpected'), false)
})

test('authorization errors redact renderer data URLs before they reach account state', () => {
  const raw = "ERR_FAILED (-2) loading 'data:text/html;charset=utf-8,very-secret-toolbar-content'"
  assert.equal(sanitizeAuthorizationError(raw), 'The authorization window could not load its local toolbar. Restart the desktop app and retry authorization.')
  assert.equal(sanitizeAuthorizationResult({ ok: false, error: raw }).error.includes('data:'), false)
  assert.equal(sanitizeAuthorizationError("ERR_FAILED (-2) loading 'file:///private/profile/toolbar.html'"), 'The authorization window could not load its local toolbar. Restart the desktop app and retry authorization.')
})

test('authorization capture keeps cookies scoped to the configured platform domain', () => {
  const cookies = filterPlatformCookies([
    { name: 'zhihu', domain: '.zhihu.com' },
    { name: 'www', domain: 'www.zhihu.com' },
    { name: 'other', domain: '.example.com' },
  ], 'zhihu.com')
  assert.deepEqual(cookies.map(cookie => cookie.name), ['zhihu', 'www'])
})

test('missing Electron runtime is detectable without launching a browser', async () => {
  const executable = await resolveElectronExecutable()
  if (!executable) assert.equal(executable, null)
  else assert.match(executable, /electron/i)
})

test('authorization UA uses the current Chromium version without the Electron token', () => {
  const userAgent = buildChromiumUserAgent('150.0.7871.224', 'win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.7871.224 Electron/43.4.1 Safari/537.36')
  assert.match(userAgent, /Chrome\/150\.0\.7871\.224/)
  assert.doesNotMatch(userAgent, /Electron\//)
  assert.match(userAgent, /^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\).*Safari\/537\.36$/)
})

test('authorization UA helper refuses an invalid Chromium version without emitting a fake fingerprint', () => {
  assert.equal(buildChromiumUserAgent('Electron-43', 'win32'), null)
})

test('authorization session applies the normalized UA before web contents exist', () => {
  const calls = []
  const session = { getUserAgent: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.7871.224 Electron/43.4.1 Safari/537.36', setUserAgent: (...args) => calls.push(args) }
  const configured = configureAuthorizationSession(session, { chromiumVersion: '150.0.7871.224', platform: 'win32' })
  assert.deepEqual(configured, { userAgent: calls[0][0], acceptLanguages: DEFAULT_ACCEPT_LANGUAGES, applied: true })
  assert.equal(calls.length, 1)
  assert.doesNotMatch(calls[0][0], /Electron\//)
  assert.equal(calls[0][1], 'zh-CN,zh,en-US,en')
})

test('authorization child uses a local toolbar document instead of a data URL', async () => {
  const child = await fs.readFile(path.join(repoRoot, 'publisher', 'auth-window-child.mjs'), 'utf8')
  const toolbar = await fs.readFile(path.join(repoRoot, 'publisher', 'auth-window-toolbar.html'), 'utf8')
  assert.match(child, /pathToFileURL\(path\.join\(here, ['"]auth-window-toolbar\.html['"]\)\)/)
  assert.match(child, /loadURL\(toolbarUrl\.href\)/)
  assert.doesNotMatch(child, /data:text\/html/)
  assert.match(child, /did-attach-webview/)
  assert.match(child, /webviewTag: true/)
  assert.match(child, /app\.disableHardwareAcceleration\(\)/)
  assert.match(child, /useContentSize: true/)
  assert.match(child, /minWidth: 760, minHeight: 560/)
  assert.match(child, /setSpellCheckerEnabled\(false\)/)
  assert.match(toolbar, /spellcheck=no/)
  assert.match(child, /spellcheck: false/)
  assert.match(toolbar, /Confirm logged in \/ 确认已登录/)
  assert.match(toolbar, /<webview id="platform"/)
  assert.match(toolbar, /const initialUrl/)
  assert.match(toolbar, /setAttribute\('src'/)
  assert.match(toolbar, /did-fail-load/)
  assert.match(toolbar, /render-process-gone/)
  assert.match(toolbar, /platform-state/)
  assert.match(toolbar, /body \{ position: relative; display: grid; grid-template-rows: 64px minmax\(0, 1fr\);/)
  assert.match(toolbar, /#platform \{ position: relative;/)
  assert.match(toolbar, /display: flex;/)
  assert.match(toolbar, /width: 100%; height: 100%; min-width: 0; min-height: 0;/)
  assert.doesNotMatch(toolbar, /min-width: 960px/)
  assert.doesNotMatch(toolbar, /html, body \{[^}]*overflow: hidden/)
  assert.match(toolbar, /finishAuthorization\(\)/)
  assert.match(toolbar, /button\.disabled = true/)
  assert.match(toolbar, /Saving session… \/ 正在保存…/)
  assert.match(child, /will-navigate/)
  assert.match(child, /setWindowOpenHandler/)
  assert.match(child, /url\.protocol === 'http:'/)
})

test('desktop account authorization stays inside the running Electron main process', async () => {
  const desktopWindow = await fs.readFile(path.join(repoRoot, 'desktop', 'auth-window.mjs'), 'utf8')
  const desktopMain = await fs.readFile(path.join(repoRoot, 'desktop', 'main.mjs'), 'utf8')
  const publisherServer = await fs.readFile(path.join(repoRoot, 'publisher', 'server.mjs'), 'utf8')
  const panel = await fs.readFile(path.join(repoRoot, 'src', 'PublisherPanel.tsx'), 'utf8')
  assert.match(desktopMain, /openDesktopAuthWindow/)
  assert.match(desktopMain, /event\.sender !== mainWindow\.webContents/)
  assert.match(desktopWindow, /new BrowserWindow/)
  assert.match(desktopWindow, /useContentSize: true/)
  assert.match(desktopWindow, /minWidth: 760, minHeight: 560/)
  assert.match(desktopWindow, /webviewTag: true/)
  assert.doesNotMatch(desktopWindow, /spawn\(/)
  assert.match(desktopWindow, /api\/publisher\/accounts\/auth-start/)
  assert.match(desktopWindow, /\/auth-result/)
  assert.match(publisherServer, /desktopAuthGrants/)
  assert.match(publisherServer, /timingSafeEqual/)
  assert.match(publisherServer, /if \(origin\).*Desktop authorization/)
  assert.match(panel, /window\.geoDesktop\.openAuthWindow/)
  assert.match(desktopWindow, /did-start-loading/)
  assert.match(desktopWindow, /did-finish-load/)
  assert.match(desktopWindow, /did-fail-load/)
  assert.match(desktopWindow, /render-process-gone/)
  assert.match(desktopWindow, /setSpellCheckerEnabled\(false\)/)
  assert.match(desktopWindow, /spellcheck: false/)
  assert.match(desktopWindow, /configureAuthorizationSession\(authSession\)/)
  assert.ok(desktopWindow.indexOf('configureAuthorizationSession(authSession)') < desktopWindow.indexOf('new BrowserWindow'))
  const compatibility = await fs.readFile(path.join(repoRoot, 'publisher', 'auth-session-compat.mjs'), 'utf8')
  assert.match(compatibility, /process\.versions\.chrome/)
  assert.match(compatibility, /setUserAgent\(userAgent, DEFAULT_ACCEPT_LANGUAGES\)/)
  assert.doesNotMatch(compatibility, /124\.0\.0\.0/)
  assert.match(desktopWindow, /webviewTag: true/)
  assert.match(desktopMain, /defaultSession\.setSpellCheckerEnabled\(false\)/)
  const authChild = await fs.readFile(path.join(repoRoot, 'publisher', 'auth-window-child.mjs'), 'utf8')
  assert.match(authChild, /configureAuthorizationSession\(partitionSession\)/)
  assert.ok(authChild.indexOf('configureAuthorizationSession(partitionSession)') < authChild.indexOf('new BrowserWindow'))
  const publisherChild = await fs.readFile(path.join(repoRoot, 'publisher', 'electron-publisher-child.mjs'), 'utf8')
  assert.match(publisherChild, /setSpellCheckerEnabled\(false\)/)
  assert.match(publisherChild, /spellcheck: false/)
  assert.match(panel, /click Confirm logged in/)
})

test('account authorization label is an isolated accessible form control', async () => {
  const panel = await fs.readFile(path.join(repoRoot, 'src', 'PublisherPanel.tsx'), 'utf8')
  assert.match(panel, /useRef<HTMLInputElement>/)
  assert.match(panel, /const \[accountLabel, setAccountLabel\]/)
  assert.match(panel, /<form className="account-connect-form" onSubmit=\{submitConnection\}/)
  assert.match(panel, /<label htmlFor="account-label">Account name<\/label>/)
  assert.match(panel, /id="account-label" name="accountLabel" type="text" autoFocus/)
  assert.match(panel, /aria-describedby=\{accountLabelError \? 'account-label-help' : undefined\}/)
  assert.match(panel, /setAccountLabelError\('Enter an account name before starting authorization\.'/)
  assert.match(panel, /onKeyDown=\{event => event\.stopPropagation\(\)\}/)
})

test('profile cleanup refuses paths outside the publisher profile root', async () => {
  const { removeAccountProfile } = await import('../publisher/profile.mjs')
  await assert.rejects(() => removeAccountProfile('C:\\outside-account-profile'), /outside the publisher profiles directory/i)
})
