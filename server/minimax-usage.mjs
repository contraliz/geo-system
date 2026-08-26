const CHINA_USAGE_URL = 'https://www.minimaxi.com/v1/token_plan/remains'
const INTERNATIONAL_USAGE_URL = 'https://www.minimax.io/v1/token_plan/remains'
const CACHE_TTL_MS = 15_000

let cache = { expiresAt: 0, value: null, endpoint: '' }

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function resolveMiniMaxUsageUrl(baseUrl = '') {
  const value = String(baseUrl || 'https://api.minimaxi.com/anthropic')
  if (/\.minimaxi\.com\b/i.test(value)) return CHINA_USAGE_URL
  if (/\.minimax\.io\b/i.test(value)) return INTERNATIONAL_USAGE_URL
  return null
}

export function parseMiniMaxUsage(payload) {
  if (!isRecord(payload)) return { available: false }
  const statusCode = isRecord(payload.base_resp) ? payload.base_resp.status_code : undefined
  if (typeof statusCode === 'number' && statusCode !== 0) return { available: false }
  if (!Array.isArray(payload.model_remains)) return { available: false }
  const record = payload.model_remains.find(item => {
    if (!isRecord(item) || typeof item.model_name !== 'string') return false
    const modelName = item.model_name.trim().toLowerCase()
    const isTextBucket = modelName === 'general' || modelName === 'text' || /^minimax-m(?:\d|\*)/.test(modelName)
    return isTextBucket && typeof item.current_interval_remaining_percent === 'number' && Number.isFinite(item.current_interval_remaining_percent)
  })
  const remaining = record?.current_interval_remaining_percent
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return { available: false }
  return { available: true, remainingPercent: Math.min(100, Math.max(0, remaining)) }
}

export function clearMiniMaxUsageCache() {
  cache = { expiresAt: 0, value: null, endpoint: '' }
}

export async function fetchMiniMaxUsage({ apiKey, baseUrl, fetchImpl = fetch, now = Date.now } = {}) {
  const endpoint = resolveMiniMaxUsageUrl(baseUrl)
  if (!apiKey || !endpoint) return { available: false }
  if (cache.endpoint === endpoint && cache.expiresAt > now() && cache.value) return cache.value
  let value = { available: false }
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    })
    if (response.ok) value = parseMiniMaxUsage(await response.json())
  } catch {
    value = { available: false }
  }
  cache = { endpoint, expiresAt: now() + CACHE_TTL_MS, value }
  return value
}

export { CACHE_TTL_MS, CHINA_USAGE_URL, INTERNATIONAL_USAGE_URL }
