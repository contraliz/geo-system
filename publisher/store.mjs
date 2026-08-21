import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { id, now } from './types.mjs'

// Keep the browser demo portable and writable. Electron should override this
// with its userData directory via GEO_PUBLISHER_DATA_DIR before shipping.
const root = process.env.GEO_PUBLISHER_DATA_DIR || path.join(process.cwd(), '.geo-publisher')
const file = path.join(root, 'state.json')

const initial = { accounts: [], jobs: [] }
let state = structuredClone(initial)
let loaded = false
let writeChain = Promise.resolve()

async function ensureLoaded() {
  if (loaded) return
  loaded = true
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    state = {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[publisher] state reset:', error.message)
  }
}

function publicAccount(account) {
  if (!account) return null
  const { profileDir, ...safe } = account
  return { ...safe, profileConfigured: Boolean(profileDir) }
}

function publicJob(job) {
  if (!job) return null
  return { ...job, profileDir: undefined }
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
    mode: input.mode === 'visible' ? 'visible' : 'background',
    status: 'login-required',
    profileDir: path.join(root, 'profiles', `${platform}-${id('profile')}`),
    createdAt: now(),
    updatedAt: now(),
    lastCheckedAt: null,
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
    approvalRequired: true,
    approvedAt: null,
    externalUrl: null,
    error: null,
    artifactDir: path.join(root, 'artifacts', id('run')),
    createdAt: now(),
    updatedAt: now(),
  }
  state.jobs.unshift(job)
  await persist()
  return publicJob(job)
}

export async function getJob(jobId) {
  await ensureLoaded()
  return publicJob(state.jobs.find(job => job.id === jobId))
}

export async function listJobs() {
  await ensureLoaded()
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
