import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { getPlatformAuthConfig } from './platform-auth-config.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const childPath = path.join(here, 'auth-window-child.mjs')

export function sanitizeAuthorizationError(value) {
  const message = String(value || 'Authorization window failed.')
  if (/data:(?:text|application)\//i.test(message) || /ERR_FAILED.*loading\s+['"]file:/i.test(message)) {
    return 'The authorization window could not load its local toolbar. Restart the desktop app and retry authorization.'
  }
  return message.replace(/\s+/g, ' ').slice(0, 1_000)
}

export function filterPlatformCookies(cookies, cookieDomain) {
  if (!Array.isArray(cookies)) return []
  const domain = String(cookieDomain || '').replace(/^\.+/, '').toLowerCase()
  if (!domain) return cookies
  return cookies.filter(cookie => {
    const cookieHost = String(cookie?.domain || '').replace(/^\.+/, '').toLowerCase()
    return cookieHost === domain || cookieHost.endsWith(`.${domain}`)
  })
}

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue
    try { await fs.access(candidate); return candidate } catch {}
  }
  return null
}

export async function resolveElectronExecutable() {
  const explicit = process.env.GEO_ELECTRON_PATH
  const packageEntry = (() => { try { return require.resolve('electron') } catch { return null } })()
  const packageRoot = packageEntry ? path.dirname(packageEntry) : null
  return firstExisting([
    explicit,
    process.platform === 'win32' && packageRoot ? path.join(packageRoot, 'dist', 'electron.exe') : null,
    process.platform === 'darwin' && packageRoot ? path.join(packageRoot, 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron') : null,
    process.platform !== 'win32' && process.platform !== 'darwin' && packageRoot ? path.join(packageRoot, 'dist', 'electron') : null,
  ])
}

export async function launchElectronAuthorization(account, { platform = account?.platform || 'zhihu', timeoutMs = 15 * 60_000, hydrateSession = false, url = null } = {}) {
  const executable = await resolveElectronExecutable()
  if (!executable) throw new Error('Electron authorization is unavailable. Install the Electron runtime (`npm install`) or set GEO_ELECTRON_PATH to your Electron executable, then retry.')
  const metadata = getPlatformAuthConfig(platform)
  if (!metadata) throw new Error(`No authorization configuration exists for platform ${platform}.`)
  const partition = `persist:geo-${metadata.id}-${String(account.id).replace(/[^a-z0-9_-]/gi, '')}`
  const profileDir = path.resolve(String(account.profileDir || ''))
  if (!account.profileDir || profileDir === path.parse(profileDir).root) throw new Error('The account profile path is invalid.')
  const config = { ...metadata, accountId: account.id, label: account.label, profileDir, partition, hydrateSession: Boolean(hydrateSession), initialUrl: url || metadata.loginUrl }
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, GEO_AUTH_CONFIG: JSON.stringify(config) }
    delete childEnv.ELECTRON_RUN_AS_NODE
    const child = spawn(executable, [childPath], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false })
    let buffer = ''
    let settled = false
    const timer = setTimeout(() => { if (settled) return; settled = true; child.kill(); reject(new Error(sanitizeAuthorizationError('The authorization window timed out. Complete login and click Finish authorization before retrying.'))) }, timeoutMs)
    const finish = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); fn(value) }
    child.stdout.on('data', chunk => {
      buffer += String(chunk)
      if (buffer.length > 2_000_000) { finish(reject, new Error(sanitizeAuthorizationError('Authorization window returned an oversized result.'))); child.kill(); return }
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('GEO_AUTH_RESULT:') || line.length > 1_500_000) continue
        try { finish(resolve, JSON.parse(line.slice('GEO_AUTH_RESULT:'.length))) } catch (error) { finish(reject, new Error(sanitizeAuthorizationError(`Invalid authorization result: ${error.message}`))) }
      }
    })
    // Electron diagnostics are intentionally not forwarded to the publisher
    // logs; draining stderr also prevents a long-running child from blocking.
    child.stderr.on('data', () => {})
    child.on('error', error => finish(reject, new Error(sanitizeAuthorizationError(`Could not launch Electron authorization: ${error.message}`))))
    child.on('exit', (code, signal) => { if (!settled) finish(reject, new Error(sanitizeAuthorizationError(`Authorization window exited before completion (${signal || (code ?? 'unknown')}).`))) })
  })
}

export function sanitizeAuthorizationResult(result) {
  if (!result || typeof result !== 'object') return { ok: false, error: 'Invalid authorization result.' }
  return { ok: Boolean(result.ok), authenticated: Boolean(result.authenticated), errorCode: result.errorCode || null, error: result.error ? sanitizeAuthorizationError(result.error) : null, cookies: Array.isArray(result.cookies) ? result.cookies : [], localStorage: result.localStorage && typeof result.localStorage === 'object' ? result.localStorage : {}, sessionStorage: result.sessionStorage && typeof result.sessionStorage === 'object' ? result.sessionStorage : {}, origin: typeof result.origin === 'string' ? result.origin : '', url: typeof result.url === 'string' ? result.url : '', accountName: typeof result.accountName === 'string' ? result.accountName : '', avatarUrl: typeof result.avatarUrl === 'string' ? result.avatarUrl : '' }
}
