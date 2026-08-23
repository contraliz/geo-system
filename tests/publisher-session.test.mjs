import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-publisher-session-'))
process.env.GEO_PUBLISHER_DATA_DIR = dataDir
const { saveSession, loadSession, deleteSession } = await import('../publisher/vault.mjs')

test.after(async () => { await fs.rm(dataDir, { recursive: true, force: true }) })

test('encrypted account session round-trips cookies and both Web Storage areas', async () => {
  await saveSession('acct-session', {
    origin: 'https://www.zhihu.com',
    cookies: [{ name: 'z_c0', value: 'secret', domain: '.zhihu.com' }],
    localStorage: { user: '{"id":1}' },
    sessionStorage: { oauth: 'temporary-token' },
  })
  const restored = await loadSession('acct-session')
  assert.equal(restored.origin, 'https://www.zhihu.com')
  assert.deepEqual(restored.cookies, [{ name: 'z_c0', value: 'secret', domain: '.zhihu.com' }])
  assert.deepEqual(restored.localStorage, { user: '{"id":1}' })
  assert.deepEqual(restored.sessionStorage, { oauth: 'temporary-token' })
  const raw = await fs.readFile(path.join(dataDir, 'sessions.enc'), 'utf8')
  assert.equal(raw.includes('temporary-token'), false)
  await deleteSession('acct-session')
  assert.deepEqual(await loadSession('acct-session'), { cookies: [], localStorage: {}, sessionStorage: {}, origin: '', savedAt: null })
})
