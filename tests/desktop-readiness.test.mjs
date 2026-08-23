import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { waitForHttp } from '../desktop/readiness.mjs'
import { hasDesktopAuthProtocol, incompatiblePublisherError, readPublisherStatus } from '../desktop/publisher-protocol.mjs'
import { isAllowedRendererNavigation } from '../desktop/navigation.mjs'

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

test('desktop readiness waits for a local endpoint and returns its status', async () => {
  const server = http.createServer((_req, res) => { res.writeHead(204); res.end() })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  try {
    const result = await waitForHttp(`http://127.0.0.1:${port}/ready`, { timeoutMs: 1_000, intervalMs: 10 })
    assert.equal(result.status, 204)
  } finally { server.close() }
})

test('desktop readiness fails with a bounded actionable error', async () => {
  await assert.rejects(() => waitForHttp('http://127.0.0.1:1/ready', { timeoutMs: 60, intervalMs: 10, requestTimeoutMs: 20, label: 'Vite renderer' }), /Vite renderer did not become ready/)
})

test('desktop development script pins Vite to Electron renderer port', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'))
  assert.match(packageJson.scripts['desktop:dev'], /node --no-maglev node_modules\/vite\/bin\/vite\.js --host 127\.0\.0\.1 --port 5173 --strictPort/)
  assert.match(packageJson.scripts.dev, /^node --no-maglev node_modules\/vite\/bin\/vite\.js$/)
  assert.match(packageJson.scripts['dev:full'], /node --no-maglev --env-file-if-exists=\.env server\/proxy\.mjs/)
  assert.match(packageJson.scripts.publisher, /^node --no-maglev --env-file-if-exists=\.env publisher\/server\.mjs$/)
})

test('desktop main uses supported software rendering before app readiness', async () => {
  const main = await fs.readFile(path.join(repoRoot, 'desktop', 'main.mjs'), 'utf8')
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'))
  assert.doesNotMatch(packageJson.scripts.desktop, /--in-process-gpu|--disable-gpu/)
  assert.doesNotMatch(packageJson.scripts['desktop:dev'], /--in-process-gpu|--disable-gpu/)
  assert.match(main, /app\.disableHardwareAcceleration\(\)/)
  assert.doesNotMatch(main, /appendSwitch\(['"](?:in-process-gpu|disable-gpu)/)
  assert.match(main, /app\.setPath\(['"]userData['"], configuredUserData\)/)
  assert.match(main, /app\.setPath\(['"]cache['"], path\.join\(configuredUserData, ['"]cache['"]\)\)/)
  assert.ok(main.indexOf("app.setPath('userData'") < main.indexOf('app.whenReady()'))
})

test('desktop renderer mount diagnostic retries once and exposes a local error surface', async () => {
  const main = await fs.readFile(path.join(repoRoot, 'desktop', 'main.mjs'), 'utf8')
  assert.match(main, /renderer root is empty; retrying one local load/)
  assert.match(main, /win\.loadURL\(url\)/)
  assert.match(main, /renderer root remained empty after retry/)
  assert.match(main, /GEO System could not render/)
})

test('desktop renderer navigation guard permits its initial URL and blocks other destinations', async () => {
  assert.equal(isAllowedRendererNavigation('http://127.0.0.1:5173/', 'http://127.0.0.1:5173/'), true)
  assert.equal(isAllowedRendererNavigation('http://127.0.0.1:5173/#/accounts', 'http://127.0.0.1:5173/'), true)
  assert.equal(isAllowedRendererNavigation('http://127.0.0.1:5174/', 'http://127.0.0.1:5173/'), false)
  const main = await fs.readFile(path.join(repoRoot, 'desktop', 'main.mjs'), 'utf8')
  assert.match(main, /typeof navigationDetails === 'string'/)
  assert.match(main, /navigationDetails\?\.url \|\| event\.url/)
  assert.doesNotMatch(main, /event\.url !== allowedRenderer/)
})

test('desktop publisher protocol requires the desktop authorization capability', () => {
  assert.equal(hasDesktopAuthProtocol({ protocolVersion: 1, capabilities: { desktopAuthV1: true } }), true)
  assert.equal(hasDesktopAuthProtocol({ protocolVersion: 1, capabilities: {} }), false)
  assert.match(incompatiblePublisherError({ port: 8788, status: { pid: 1234 } }), /port 8788.*PID 1234.*desktopAuthV1/i)
})

test('publisher status reader distinguishes a reachable incompatible service from no service', async () => {
  const incompatibleFetch = async () => new Response(JSON.stringify({ error: 'No route' }), { status: 404 })
  await assert.rejects(() => readPublisherStatus('http://127.0.0.1:8788/api/publisher/status', incompatibleFetch), error => error.publisherReachable === true)
  const current = await readPublisherStatus('http://127.0.0.1:8788/api/publisher/status', async () => new Response(JSON.stringify({ protocolVersion: 1, capabilities: { desktopAuthV1: true } }), { status: 200 }))
  assert.equal(hasDesktopAuthProtocol(current), true)
})
