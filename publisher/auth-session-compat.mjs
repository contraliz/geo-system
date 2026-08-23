const DEFAULT_ACCEPT_LANGUAGES = 'zh-CN,zh,en-US,en'

function normalizeChromiumVersion(value) {
  const match = String(value || '').match(/^\d+(?:\.\d+){0,3}$/)
  return match ? match[0] : null
}

function platformToken(currentUserAgent, platform) {
  const match = String(currentUserAgent || '').match(/^Mozilla\/5\.0 \(([^)]+)\)/i)
  if (match) return match[1]
  if (platform === 'win32') return 'Windows NT 10.0; Win64; x64'
  if (platform === 'darwin') return 'Macintosh; Intel Mac OS X 10_15_7'
  return 'X11; Linux x86_64'
}

export function buildChromiumUserAgent(chromiumVersion, platform = process.platform, currentUserAgent = '') {
  const version = normalizeChromiumVersion(chromiumVersion)
  if (!version) return null
  return `Mozilla/5.0 (${platformToken(currentUserAgent, platform)}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`
}

export function configureAuthorizationSession(ses, { chromiumVersion = process.versions.chrome, platform = process.platform } = {}) {
  if (!ses || typeof ses.getUserAgent !== 'function' || typeof ses.setUserAgent !== 'function') {
    throw new TypeError('A session with getUserAgent and setUserAgent is required for authorization.')
  }
  const userAgent = buildChromiumUserAgent(chromiumVersion, platform, ses.getUserAgent())
  if (!userAgent) return { userAgent: ses.getUserAgent(), acceptLanguages: null, applied: false }
  ses.setUserAgent(userAgent, DEFAULT_ACCEPT_LANGUAGES)
  return { userAgent, acceptLanguages: DEFAULT_ACCEPT_LANGUAGES, applied: true }
}

export { DEFAULT_ACCEPT_LANGUAGES }
