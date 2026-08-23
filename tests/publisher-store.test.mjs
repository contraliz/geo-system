import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-publisher-store-'))
process.env.GEO_PUBLISHER_DATA_DIR = dataDir
const store = await import('../publisher/store.mjs')

test.after(async () => { await fs.rm(dataDir, { recursive: true, force: true }) })

test('publisher store supports multiple Zhihu accounts and safe rename/delete', async () => {
  await store.resetStore()
  const first = await store.createZhihuAccount({ label: 'Editorial one', mode: 'visible' })
  const second = await store.createZhihuAccount({ label: 'Editorial two' })
  assert.equal((await store.listAccounts()).length, 2)
  assert.equal((await store.renameAccount(first.id, 'Renamed one')).label, 'Renamed one')
  const job = await store.createJob({ accountId: first.id, title: 'A title', content: 'Body', aiDisclosure: true, coverImageUrl: 'https://example.com/cover.png', pacingMode: 'disabled' })
  assert.equal(job.approvalRequired, false)
  assert.equal(job.aiDisclosure, true)
  assert.equal(job.coverImageUrl, 'https://example.com/cover.png')
  assert.equal(job.pacingMode, 'disabled')
  assert.equal(Object.hasOwn(job, 'profileDir'), false)
  assert.equal(Object.hasOwn(job, 'artifactDir'), false)
  assert.equal((await store.deleteAccount(first.id)).id, first.id)
  assert.equal((await store.getJob(job.id)).status, 'cancelled')
  assert.equal((await store.getAccount(second.id)).id, second.id)
  const reviewed = await store.createJob({ accountId: second.id, title: 'Reviewed title', content: 'Body', manualReview: true })
  assert.equal(reviewed.approvalRequired, true)
})

test('publisher store creates accounts for configured Chinese auth platforms', async () => {
  await store.resetStore()
  const account = await store.createPlatformAccount({ platform: 'weibo', label: 'Weibo editorial', mode: 'visible' })
  assert.equal(account.platform, 'weibo')
  assert.equal(account.cookieDomain, 'weibo.com')
  assert.equal(account.status, 'login-required')
  assert.equal((await store.listAccounts())[0].id, account.id)
})

test('publisher store claims, heartbeats, rejects competing workers, and reclaims expired leases', async () => {
  await store.resetStore()
  const account = await store.createZhihuAccount({ label: 'Lease account' })
  const job = await store.createJob({ accountId: account.id, title: 'Lease title', content: 'Lease body' })
  const claimed = await store.claimJob(job.id, 'runner-a')
  assert.equal(claimed.ok, true)
  assert.equal(claimed.job.attempt, 1)
  assert.equal((await store.claimJob(job.id, 'runner-b')).ok, false)
  const heartbeat = await store.heartbeatJob(job.id, claimed.job.runnerId, claimed.job.leaseId)
  assert.equal(heartbeat.ok, true)
  assert.equal((await store.heartbeatJob(job.id, 'runner-b', claimed.job.leaseId)).ok, false)
  await store.updateJob(job.id, { leaseExpiresAt: new Date(Date.now() - 1_000).toISOString() })
  const reclaimed = (await store.listJobs())[0]
  assert.equal(reclaimed.status, 'queued')
  assert.equal(reclaimed.runnerId, null)
  const next = await store.claimJob(job.id, 'runner-b')
  assert.equal(next.ok, true)
  assert.equal(next.job.attempt, 2)
})
