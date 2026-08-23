import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { id, now } from './types.mjs'
import { safeHttpUrl } from './common.mjs'
import { getPlatformAuthConfig } from './platform-auth-config.mjs'

// Keep the browser demo portable and writable. Electron should override this
// with its userData directory via GEO_PUBLISHER_DATA_DIR before shipping.
const root = process.env.GEO_PUBLISHER_DATA_DIR || path.join(process.cwd(), '.geo-publisher')
const file = path.join(root, 'state.json')

// Loke-like runners heartbeat every 10 seconds. A five-minute lease leaves
// room for a slow editor/navigation cycle while still reclaiming a crashed
// worker promptly on the next list/claim/startup pass.
export const PUBLISHER_LEASE_MS = 5 * 60_000
export const PUBLISHER_MAX_ATTEMPTS = 3
const TERMINAL_JOB_STATUSES = new Set(['published', 'cancelled', 'failed'])
const initial = { accounts: [], jobs: [] }
let state = structuredClone(initial)
let loaded = false
let loadingPromise = null
let writeChain = Promise.resolve()

async function ensureLoaded() {
  if (loaded) return
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      state = {
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts.map(migrateAccount) : [],
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs.map(migrateJob) : [],
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[publisher] state reset:', error.message)
    } finally {
      loaded = true
      loadingPromise = null
    }
  })()
  return loadingPromise
}

async function reclaimExpired() {
  await ensureLoaded()
  if (reclaimExpiredInMemory()) await persist()
}

function publicAccount(account) {
  if (!account) return null
  const { profileDir, ...safe } = account
  return {
    ...safe,
    // These flags mirror Loke's account card without exposing the encrypted
    // session itself or the local Chromium profile path.
    profileConfigured: Boolean(profileDir),
    sessionConfigured: Boolean(account.sessionCapturedAt),
  }
}

function publicJob(job) {
  if (!job) return null
  const { profileDir, artifactDir, ...safe } = job
  return { ...safe }
}

function migrateAccount(account) {
  return {
    ...account,
    platform: account.platform || 'zhihu',
    label: String(account.label || account.name || 'Zhihu account'),
    accountName: account.accountName || account.name || null,
    avatarUrl: account.avatarUrl || null,
    cookieDomain: account.cookieDomain || 'zhihu.com',
    mode: account.mode === 'visible' ? 'visible' : 'background',
    status: account.status || 'login-required',
    lastCheckedAt: account.lastCheckedAt || null,
    lastAuthAt: account.lastAuthAt || null,
    sessionCapturedAt: account.sessionCapturedAt || null,
    errorCode: account.errorCode || null,
    lastError: account.lastError || null,
    createdAt: account.createdAt || now(),
    updatedAt: account.updatedAt || now(),
  }
}

function migrateJob(job) {
  return {
    ...job,
    aiDisclosure: Boolean(job.aiDisclosure),
    aiDisclosureSelected: Boolean(job.aiDisclosureSelected),
    coverFirstBodyImage: job.coverFirstBodyImage !== false,
    coverImageUrl: safeHttpUrl(job.coverImageUrl) || null,
    coverStatus: job.coverStatus || null,
    pacingMode: job.pacingMode === 'disabled' ? 'disabled' : 'human',
    runnerId: job.runnerId || null,
    leaseId: job.leaseId || null,
    claimedAt: job.claimedAt || null,
    heartbeatAt: job.heartbeatAt || null,
    leaseExpiresAt: job.leaseExpiresAt || null,
    attempt: Number.isFinite(job.attempt) ? job.attempt : 0,
    maxAttempts: Number.isFinite(job.maxAttempts) ? job.maxAttempts : PUBLISHER_MAX_ATTEMPTS,
  }
}

function isExpired(job, timestamp = Date.now()) {
  return Boolean(job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) <= timestamp)
}

function reclaimExpiredInMemory(timestamp = Date.now()) {
  let changed = false
  for (const job of state.jobs) {
    if (TERMINAL_JOB_STATUSES.has(job.status) || !isExpired(job, timestamp)) continue
    job.status = 'queued'
    job.runnerId = null
    job.leaseId = null
    job.claimedAt = null
    job.heartbeatAt = null
    job.leaseExpiresAt = null
    job.error = 'Worker lease expired; job returned to the queue.'
    job.updatedAt = now()
    changed = true
  }
  return changed
}

async function persist() {
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  const payload = JSON.stringify(state, null, 2)
  writeChain = writeChain.then(() => fs.writeFile(file, payload, { mode: 0o600 }))
  await writeChain
}

export async function listAccounts() {
  await ensureLoaded()
  return state.accounts.map(publicAccount)
}

export async function createPlatformAccount(input) {
  await ensureLoaded()
  const label = String(input.label || '').trim()
  if (!label) throw new Error('Account label is required')
  const platform = String(input.platform || '').trim().toLowerCase()
  if (!/^[a-z0-9_-]{2,40}$/.test(platform)) throw new Error('A valid account platform is required.')
  const metadata = getPlatformAuthConfig(platform)
  if (!metadata) throw new Error(`Account authorization is not configured for ${platform}.`)
  const account = {
    id: id('acct'),
    platform,
    label,
    accountName: null,
    avatarUrl: null,
    cookieDomain: metadata.cookieDomain,
    mode: input.mode === 'visible' ? 'visible' : 'background',
    status: 'login-required',
    profileDir: path.join(root, 'profiles', `${platform}-${id('profile')}`),
    createdAt: now(),
    updatedAt: now(),
    lastCheckedAt: null,
    lastAuthAt: null,
    sessionCapturedAt: null,
    errorCode: null,
    lastError: null,
  }
  state.accounts.unshift(account)
  await persist()
  return publicAccount(account)
}

export async function createZhihuAccount(input) {
  return createPlatformAccount({ ...input, platform: 'zhihu' })
}

export async function replaceZhihuAccount(input) {
  await ensureLoaded()
  const platform = 'zhihu'
  const label = String(input.label || '').trim()
  if (!label) throw new Error('Account label is required')
  const existing = state.accounts.find(account => account.platform === platform) || null
  const account = {
    id: id('acct'),
    platform,
    label,
    accountName: null,
    avatarUrl: null,
    cookieDomain: 'zhihu.com',
    mode: input.mode === 'visible' ? 'visible' : 'background',
    status: 'login-required',
    profileDir: path.join(root, 'profiles', `${platform}-${id('profile')}`),
    createdAt: now(),
    updatedAt: now(),
    lastCheckedAt: null,
    lastAuthAt: null,
    sessionCapturedAt: null,
    errorCode: null,
    lastError: null,
  }
  if (existing) {
    for (const job of state.jobs) {
      if (job.accountId === existing.id && !['published', 'cancelled'].includes(job.status)) {
        job.status = 'cancelled'
        job.error = 'The Zhihu account configuration was replaced.'
        job.updatedAt = now()
      }
    }
  }
  state.accounts = [account]
  await persist()
  return { account: publicAccount(account), replaced: existing ? publicAccount(existing) : null }
}

export async function renameAccount(accountId, label) {
  await ensureLoaded()
  const account = state.accounts.find(item => item.id === accountId)
  const nextLabel = String(label || '').trim()
  if (!account) return null
  if (!nextLabel) throw new Error('Account label is required')
  account.label = nextLabel
  account.updatedAt = now()
  await persist()
  return publicAccount(account)
}

export async function deleteAccount(accountId) {
  await ensureLoaded()
  const index = state.accounts.findIndex(item => item.id === accountId)
  if (index < 0) return null
  const [removed] = state.accounts.splice(index, 1)
  for (const job of state.jobs) {
    if (job.accountId !== accountId || TERMINAL_JOB_STATUSES.has(job.status)) continue
    job.status = 'cancelled'
    job.error = 'The publishing account was disconnected.'
    job.runnerId = null
    job.leaseId = null
    job.claimedAt = null
    job.heartbeatAt = null
    job.leaseExpiresAt = null
    job.updatedAt = now()
  }
  await persist()
  return publicAccount(removed)
}

export async function resetAccounts() {
  await ensureLoaded()
  const removed = state.accounts.map(account => ({ ...account }))
  const removedIds = new Set(removed.map(account => account.id))
  for (const job of state.jobs) {
    if (removedIds.has(job.accountId) && !['published', 'cancelled'].includes(job.status)) {
      job.status = 'cancelled'
      job.error = 'The Zhihu account configuration was removed.'
      job.updatedAt = now()
    }
  }
  state.accounts = []
  await persist()
  return removed
}

export async function getAccount(accountId) {
  await ensureLoaded()
  return state.accounts.find(account => account.id === accountId) || null
}

export async function updateAccount(accountId, patch) {
  await ensureLoaded()
  const account = state.accounts.find(item => item.id === accountId)
  if (!account) return null
  Object.assign(account, patch, { updatedAt: now() })
  await persist()
  return publicAccount(account)
}

export async function createJob(input) {
  await ensureLoaded()
  const title = String(input.title || '').trim()
  const content = String(input.content || '').trim()
  if (!title || !content) throw new Error('Title and content are required')
  if (!input.accountId) throw new Error('An account is required')
  const job = {
    id: id('job'),
    platform: input.platform || 'zhihu',
    accountId: input.accountId,
    title,
    content,
    imagePaths: Array.isArray(input.imagePaths) ? input.imagePaths.map(String).slice(0, 9) : [],
    column: input.column ? String(input.column) : null,
    status: 'queued',
    approvalRequired: input.manualReview === true,
    aiDisclosure: input.aiDisclosure === true,
    aiDisclosureSelected: false,
    coverFirstBodyImage: input.coverFirstBodyImage !== false,
    coverImageUrl: safeHttpUrl(input.coverImageUrl) || null,
    coverStatus: null,
    pacingMode: input.pacingMode === 'disabled' ? 'disabled' : 'human',
    approvedAt: null,
    externalUrl: null,
    error: null,
    artifactDir: path.join(root, 'artifacts', id('run')),
    createdAt: now(),
    updatedAt: now(),
    runnerId: null,
    leaseId: null,
    claimedAt: null,
    heartbeatAt: null,
    leaseExpiresAt: null,
    attempt: 0,
    maxAttempts: PUBLISHER_MAX_ATTEMPTS,
  }
  state.jobs.unshift(job)
  await persist()
  return publicJob(job)
}

export async function getJob(jobId) {
  await reclaimExpired()
  return publicJob(state.jobs.find(job => job.id === jobId))
}

// Internal worker view. This never crosses the HTTP boundary; it preserves
// private artifact paths needed for diagnostics while publicJob remains safe.
export async function getStoredJob(jobId) {
  await reclaimExpired()
  const job = state.jobs.find(item => item.id === jobId)
  return job ? structuredClone(job) : null
}

export async function listJobs() {
  await reclaimExpired()
  return state.jobs.map(publicJob)
}

export async function updateJob(jobId, patch) {
  await ensureLoaded()
  const job = state.jobs.find(item => item.id === jobId)
  if (!job) return null
  Object.assign(job, patch, { updatedAt: now() })
  await persist()
  return publicJob(job)
}

export async function claimJob(jobId, runnerId) {
  await reclaimExpired()
  const job = state.jobs.find(item => item.id === jobId)
  if (!job) return { ok: false, error: 'Publishing job not found.' }
  if (TERMINAL_JOB_STATUSES.has(job.status)) return { ok: false, error: `Job is already ${job.status}.`, job: publicJob(job) }
  if (job.runnerId && job.runnerId !== runnerId && !isExpired(job)) return { ok: false, error: 'Job is leased by another worker.', job: publicJob(job) }
  if (job.attempt >= job.maxAttempts) {
    job.status = 'failed'
    job.error = 'Maximum worker attempts reached.'
    job.updatedAt = now()
    await persist()
    return { ok: false, error: job.error, job: publicJob(job) }
  }
  const claimedAt = now()
  const leaseId = id('lease')
  const owner = String(runnerId || '').trim() || id('runner')
  job.runnerId = owner
  job.leaseId = leaseId
  job.claimedAt = claimedAt
  job.heartbeatAt = claimedAt
  job.leaseExpiresAt = new Date(Date.now() + PUBLISHER_LEASE_MS).toISOString()
  job.attempt += 1
  job.error = null
  job.updatedAt = claimedAt
  await persist()
  return { ok: true, job: publicJob(job) }
}

export async function heartbeatJob(jobId, runnerId, leaseId) {
  await ensureLoaded()
  const job = state.jobs.find(item => item.id === jobId)
  if (!job) return { ok: false, error: 'Publishing job not found.' }
  if (job.runnerId !== runnerId || job.leaseId !== leaseId || isExpired(job)) return { ok: false, error: 'Worker lease is no longer valid.', job: publicJob(job) }
  const heartbeatAt = now()
  job.heartbeatAt = heartbeatAt
  job.leaseExpiresAt = new Date(Date.now() + PUBLISHER_LEASE_MS).toISOString()
  job.updatedAt = heartbeatAt
  await persist()
  return { ok: true, job: publicJob(job) }
}

export async function releaseJobLease(jobId, runnerId, leaseId) {
  await ensureLoaded()
  const job = state.jobs.find(item => item.id === jobId)
  if (!job) return { ok: false, error: 'Publishing job not found.' }
  if (job.runnerId !== runnerId || (leaseId && job.leaseId !== leaseId)) return { ok: false, error: 'Worker lease is no longer valid.', job: publicJob(job) }
  job.runnerId = null
  job.leaseId = null
  job.claimedAt = null
  job.heartbeatAt = null
  job.leaseExpiresAt = null
  job.updatedAt = now()
  await persist()
  return { ok: true, job: publicJob(job) }
}

export async function withJob(jobId, callback) {
  await ensureLoaded()
  const job = state.jobs.find(item => item.id === jobId)
  if (!job) throw new Error('Publishing job not found')
  return callback(job, state)
}

export async function resetStore() {
  state = structuredClone(initial)
  loaded = true
  await persist()
}

export const publisherDataDir = root
