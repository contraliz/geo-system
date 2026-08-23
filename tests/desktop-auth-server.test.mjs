import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

async function reservePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  await new Promise(resolve => server.close(resolve))
  assert.ok(address && typeof address === 'object')
  return address.port
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Publisher exited before readiness (${child.exitCode}).`)
    try { const response = await fetch(`${url}/api/publisher/accounts`); if (response.ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Publisher integration fixture did not become ready.')
}

test('desktop authorization grant saves one verified account session exactly once', async () => {
  const port = await reservePort()
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-desktop-auth-server-'))
  const child = spawn(process.execPath, [path.join(repoRoot, 'publisher', 'server.mjs')], {
    cwd: repoRoot,
    env: { ...process.env, PUBLISHER_PORT: String(port), GEO_PUBLISHER_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += String(chunk) })
  const baseUrl = `http://127.0.0.1:${port}`
  const json = async (route, init = {}) => {
    const response = await fetch(`${baseUrl}${route}`, { headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }, ...init })
    return { response, payload: await response.json() }
  }
  try {
    await waitForServer(baseUrl, child)
    const prepared = await json('/api/publisher/accounts/prepare', { method: 'POST', body: JSON.stringify({ platform: 'zhihu', label: 'Desktop fixture', desktopManaged: true }) })
    assert.equal(prepared.response.status, 201)
    const accountId = prepared.payload.account.id
    const token = 'a'.repeat(64)

    const browserGrant = await json('/api/publisher/accounts/auth-start', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'X-GEO-AUTH-TOKEN': token }, body: JSON.stringify({ accountId, platform: 'zhihu', token }) })
    assert.equal(browserGrant.response.status, 403)
    const grant = await json('/api/publisher/accounts/auth-start', { method: 'POST', headers: { 'X-GEO-AUTH-TOKEN': token }, body: JSON.stringify({ accountId, platform: 'zhihu', token }) })
    assert.equal(grant.response.status, 200)

    const capture = { ok: true, authenticated: true, cookies: [{ name: 'z_c0', value: 'fixture-secret', domain: '.zhihu.com', path: '/' }], localStorage: { fixture: 'stored' }, sessionStorage: {}, origin: 'https://www.zhihu.com', url: 'https://www.zhihu.com/', accountName: 'Fixture account', avatarUrl: '' }
    const rejected = await json(`/api/publisher/accounts/${accountId}/auth-result`, { method: 'POST', headers: { 'X-GEO-AUTH-TOKEN': 'b'.repeat(64) }, body: JSON.stringify(capture) })
    assert.equal(rejected.response.status, 403)
    const completed = await json(`/api/publisher/accounts/${accountId}/auth-result`, { method: 'POST', headers: { 'X-GEO-AUTH-TOKEN': token }, body: JSON.stringify(capture) })
    assert.equal(completed.response.status, 200)
    assert.equal(completed.payload.account.status, 'ready')
    assert.equal(completed.payload.account.accountName, 'Fixture account')
    assert.equal(Object.hasOwn(completed.payload.account, 'cookies'), false)
    const replay = await json(`/api/publisher/accounts/${accountId}/auth-result`, { method: 'POST', headers: { 'X-GEO-AUTH-TOKEN': token }, body: JSON.stringify(capture) })
    assert.equal(replay.response.status, 403)
  } finally {
    if (child.exitCode == null) child.kill()
    await new Promise(resolve => { if (child.exitCode != null) resolve(); else child.once('exit', resolve) })
    const tempRoot = path.resolve(os.tmpdir())
    const resolved = path.resolve(dataDir)
    if (!resolved.startsWith(`${tempRoot}${path.sep}`) || !path.basename(resolved).startsWith('geo-desktop-auth-server-')) throw new Error(`Refusing to remove unexpected test directory: ${resolved}`)
    await fs.rm(resolved, { recursive: true, force: true })
  }
  assert.equal(stderr.includes('fixture-secret'), false)
})
