import { launchElectronAuthorization, sanitizeAuthorizationResult } from './electron-auth.mjs'
import { getPlatformAuthConfig } from './platform-auth-config.mjs'
import { updateAccount } from './store.mjs'
import { normalizeCookies, saveSession } from './vault.mjs'
import { safeHttpUrl } from './common.mjs'

function normalizeName(value) {
  const name = String(value || '').replace(/知乎|登录|首页|创作中心|创作者中心|管理|后台/g, '').replace(/[-|–—]/g, '').trim()
  return name && name.length < 80 ? name : null
}

export async function persistAuthorizationResult(account, rawResult) {
  const metadata = getPlatformAuthConfig(account.platform || 'zhihu')
  if (!metadata) throw new Error(`No authorization configuration exists for platform ${account.platform || 'zhihu'}.`)
  const result = sanitizeAuthorizationResult(rawResult)
  if (!result.ok) {
    await updateAccount(account.id, { status: 'error', lastCheckedAt: new Date().toISOString(), lastError: result.error || 'Authorization window failed.', errorCode: result.errorCode || 'auth-window-error' })
    return { status: 'error', message: result.error || 'Authorization window failed.', errorCode: result.errorCode || 'auth-window-error' }
  }
  if (result.errorCode) {
    await updateAccount(account.id, { status: 'error', lastCheckedAt: new Date().toISOString(), lastError: result.error || 'The platform rejected the authorization request.', errorCode: result.errorCode })
    return { status: 'error', message: result.error, errorCode: result.errorCode }
  }
  if (!result.cookies.length) {
    await updateAccount(account.id, { status: 'login-required', lastCheckedAt: new Date().toISOString(), lastError: 'No browser cookies were captured. Finish login, then retry.', errorCode: null })
    return { status: 'login-required', message: 'No browser session was captured. Finish login, then retry.' }
  }
  const cookies = normalizeCookies(result.cookies)
  await saveSession(account.id, { cookies, localStorage: result.localStorage, sessionStorage: result.sessionStorage, origin: result.origin })
  const capturedAt = new Date().toISOString()
  const patch = { status: result.authenticated ? 'ready' : 'login-required', lastCheckedAt: capturedAt, lastAuthAt: result.authenticated ? capturedAt : account.lastAuthAt || null, sessionCapturedAt: capturedAt, lastError: result.authenticated ? null : 'The platform still requires login.', errorCode: null, accountName: normalizeName(result.accountName) || account.accountName || null, avatarUrl: safeHttpUrl(result.avatarUrl) || account.avatarUrl || null, cookieDomain: metadata.cookieDomain }
  await updateAccount(account.id, patch)
  return { status: patch.status, message: patch.status === 'ready' ? 'Account authorization captured and verified.' : 'Session captured, but the platform still requires login.', accountName: patch.accountName, avatarUrl: patch.avatarUrl, cookieCount: cookies.length }
}

export async function authorizeAccountWithElectron(account, options = {}) {
  const result = await launchElectronAuthorization(account, { platform: account.platform || 'zhihu', ...options })
  return persistAuthorizationResult(account, result)
}
