// Local Anthropic-compatible proxy for the GEO operations SPA.
//
// The SPA calls /api/anthropic/* on the same origin as Vite; this proxy
// forwards /v1/messages to the configured upstream (defaults to Anthropic's
// real API but is intended to be pointed at MiniMax's Anthropic-compatible
// endpoint via ANTHROPIC_BASE_URL). The API key is read from the server's
// environment and never reaches the browser bundle.
//
// Required env:
//   ANTHROPIC_API_KEY   the upstream API key (MiniMax or Anthropic)
//   ANTHROPIC_BASE_URL  the upstream base URL (e.g. https://api.minimax.io/anthropic)
// Optional:
//   PROXY_PORT          port to listen on (default 8787)
//   PROXY_ALLOW_ORIGIN  allowed browser origin for CORS (default 127.0.0.1:5174)

import http from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { fetchMiniMaxUsage } from './minimax-usage.mjs'

const PORT = Number(process.env.PROXY_PORT || 8787)
const ALLOW_ORIGIN = process.env.PROXY_ALLOW_ORIGIN || 'http://127.0.0.1:5174'
const MAX_BODY_BYTES = 4 * 1024 * 1024
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.minimaxi.com/anthropic'

function configuredBaseUrl() {
  return process.env.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch (err) { reject(err) }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function describeUpstream() {
  const baseUrl = configuredBaseUrl()
  const provider = baseUrl.includes('minimax') ? 'minimax' : 'anthropic'
  const display = baseUrl ? baseUrl.replace(/\/\/(.+?)\..*/, (_m, host) => `//${host}.<redacted>`) : ''
  return { provider, display }
}

async function handleMessages(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) {
    sendJson(res, 503, {
      error: 'ANTHROPIC_API_KEY not configured on the proxy. Set it in your shell or .env and restart npm run dev:full.',
      type: 'configuration_error',
    })
    return
  }
  let payload
  try { payload = await readJsonBody(req) }
  catch (err) { sendJson(res, 400, { error: `Invalid JSON body: ${err.message}`, type: 'invalid_request' }); return }

  if (!payload || typeof payload.model !== 'string' || !Array.isArray(payload.messages)) {
    sendJson(res, 400, { error: 'Body must include { model: string, messages: [...] }.', type: 'invalid_request' })
    return
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: configuredBaseUrl() })
    const response = await client.messages.create({
      model: payload.model,
      max_tokens: payload.max_tokens ?? 1024,
      messages: payload.messages,
      system: payload.system,
      temperature: payload.temperature,
    })
    sendJson(res, 200, response)
  } catch (err) {
    const status = typeof err?.status === 'number' ? err.status : 500
    console.error('[proxy] upstream error:', err?.status, err?.message)
    sendJson(res, status, {
      error: err?.message || 'Upstream error',
      type: err?.error?.type || 'upstream_error',
    })
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  const url = req.url || '/'

  if (req.method === 'GET' && url.startsWith('/api/anthropic/status')) {
    sendJson(res, 200, {
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      ...describeUpstream(),
      proxyPort: PORT,
      pid: process.pid,
    })
    return
  }

  if (req.method === 'GET' && url.startsWith('/api/anthropic/usage')) {
    const usage = await fetchMiniMaxUsage({ apiKey: process.env.ANTHROPIC_API_KEY, baseUrl: configuredBaseUrl() })
    sendJson(res, 200, usage)
    return
  }

  if (req.method === 'POST' && url.startsWith('/api/anthropic/v1/messages')) {
    await handleMessages(req, res)
    return
  }

  sendJson(res, 404, { error: `No route for ${req.method} ${url}`, type: 'not_found' })
})

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.log(`[proxy] Another local proxy is already running on http://127.0.0.1:${PORT}; using that instance.`)
    process.exit(0)
  }
  console.error('[proxy] server error:', error)
  process.exit(1)
})

server.listen(PORT, '127.0.0.1', () => {
  const upstream = describeUpstream()
  console.log(`[proxy] Listening on http://127.0.0.1:${PORT}`)
  console.log(`[proxy] Provider: ${upstream.provider}${upstream.display ? ` (${upstream.display})` : ''}`)
  console.log(`[proxy] API key: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET — agent calls will return 503'}`)
})

const shutdown = () => { console.log('[proxy] shutting down'); server.close(() => process.exit(0)) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
