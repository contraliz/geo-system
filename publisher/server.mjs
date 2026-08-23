import http from 'node:http'
import crypto from 'node:crypto'
import { claimJob, createJob, createPlatformAccount, deleteAccount, getAccount, getJob, getStoredJob, heartbeatJob, listAccounts, listJobs, releaseJobLease, renameAccount, updateAccount, updateJob } from './store.mjs'
import { loadPuppeteer } from './puppeteer.mjs'
import { normalizeCookies, saveSession } from './vault.mjs'
import { createPlatformLock } from './locks.mjs'
import { clearTrace, getTrace, trace as logTrace, traceSnapshot } from './trace.mjs'
import { listPlatforms, requireAccountAdapter, requireOperationalPlatform, requirePlatformAdapter } from './platforms.mjs'
import { persistAuthorizationResult } from './account-auth.mjs'

const PORT = Number(process.env.PUBLISHER_PORT || 8788)
const MAX_BODY_BYTES = 8 * 1024 * 1024
const activeJobs = new Set()
const accountLock = createPlatformLock()
const leaseHeartbeats = new Map()
const RUNNER_ID = `publisher-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
const desktopAuthGrants = new Map()

function sameToken(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && a.length === 64 && crypto.timingSafeEqual(a, b)
}

function pruneDesktopAuthGrants() {
  const now = Date.now()
  for (const [accountId, grant] of desktopAuthGrants) if (grant.expiresAt <= now) desktopAuthGrants.delete(accountId)
}

async function prepareAccountConfiguration(input) {
  const existing = input.accountId ? await getAccount(String(input.accountId)) : null
  if (input.accountId && !existing) throw new Error('Account not found.')
  const platform = String(input.platform || existing?.platform || 'zhihu').trim().toLowerCase()
  if (existing && existing.platform !== platform) throw new Error('Account and platform do not match.')
  if (existing) {
    // Account refresh/import is non-destructive: keep the same profile and
    // vault entry so the observable Loke reauthorization lifecycle can reuse
    // the browser session. Disconnect is the only destructive path.
    const account = await updateAccount(existing.id, { mode: input.mode === 'visible' ? 'visible' : existing.mode, status: 'login-required', lastCheckedAt: null, lastError: null, errorCode: null })
    return { result: { account, replaced: null } }
  }
  return { result: { account: await createPlatformAccount({ ...input, platform }), replaced: null } }
}

function startLeaseHeartbeat(job) {
  if (!job?.runnerId || !job?.leaseId) return
  const existing = leaseHeartbeats.get(job.id)
  if (existing) clearInterval(existing)
  const timer = setInterval(() => {
    void heartbeatJob(job.id, job.runnerId, job.leaseId).then(result => {
      if (!result.ok) stopLeaseHeartbeat(job.id)
    }).catch(() => stopLeaseHeartbeat(job.id))
  }, 10_000)
  timer.unref?.()
  leaseHeartbeats.set(job.id, timer)
}

function stopLeaseHeartbeat(jobId) {
  const timer = leaseHeartbeats.get(jobId)
  if (!timer) return
  clearInterval(timer)
  leaseHeartbeats.delete(jobId)
}

async function recoverQueuedJobs() {
  const [jobs, accounts] = await Promise.all([listJobs(), listAccounts()])
  const accountMap = new Map(accounts.map(account => [account.id, account]))
  for (const queued of jobs) {
    const account = accountMap.get(queued.accountId)
    if (queued.status !== 'queued' || !account || account.status !== 'ready' || activeJobs.has(queued.id)) continue
    const acquired = accountLock.tryAcquire(account.id, account.platform)
    if (!acquired.ok) continue
    const claimed = await claimJob(queued.id, RUNNER_ID)
    if (!claimed.ok) { accountLock.release(account.id); continue }
    const job = claimed.job
    activeJobs.add(job.id)
    startLeaseHeartbeat(job)
    void (async () => {
      try {
        const stored = await getStoredJob(job.id)
        await requirePlatformAdapter(stored.platform).prepareJob(stored, account)
      } catch (error) {
        await updateJob(job.id, { status: 'failed', error: error.message }).catch(() => {})
      } finally {
        activeJobs.delete(job.id)
        const completed = await getJob(job.id).catch(() => null)
        const retainsBrowser = (account.mode === 'visible' || process.env.GEO_PUBLISHER_RUNTIME === 'electron') && ['login-required', 'draft-saved', 'awaiting-approval', 'failed-inspection'].includes(completed?.status)
        if (!retainsBrowser) {
          stopLeaseHeartbeat(job.id)
          await releaseJobLease(job.id, job.runnerId, job.leaseId).catch(() => {})
          accountLock.release(account.id)
        }
      }
    })()
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => { size += chunk.length; if (size > MAX_BODY_BYTES) { req.destroy(); reject(new Error('Request body too large')); return } chunks.push(chunk) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (error) { reject(error) } })
    req.on('error', reject)
  })
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://127.0.0.1:5173', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function routeParts(url) { return new URL(url, `http://127.0.0.1:${PORT}`).pathname.split('/').filter(Boolean) }

async function handle(req, res) {
  const origin = String(req.headers.origin || '')
  if (origin && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin)) return send(res, 403, { error: 'Publisher requests are accepted only from the local GEO application.' })
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return }
  let parts
  try {
    parts = routeParts(req.url || '/')
  } catch (error) {
    return send(res, 400, { error: `Invalid URL: ${error.message}` })
  }
  try {
    if (req.method === 'GET' && parts.join('/') === 'api/publisher/status') return send(res, 200, { ok: true, service: 'local-puppeteer-publisher', pid: process.pid, protocolVersion: 1, capabilities: { desktopAuthV1: true }, puppeteer: Boolean(await loadPuppeteer()), activeJobs: activeJobs.size, locks: accountLock.snapshot(), trace: traceSnapshot() })
    if (req.method === 'GET' && parts.join('/') === 'api/publisher/platforms') return send(res, 200, { platforms: listPlatforms() })
    if (req.method === 'GET' && parts.join('/') === 'api/publisher/accounts') return send(res, 200, { accounts: await listAccounts() })
    if (req.method === 'GET' && parts.join('/') === 'api/publisher/jobs') return send(res, 200, { jobs: await listJobs() })
    if (req.method === 'GET' && parts.join('/') === 'api/publisher/login-trace') {
      const since = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams.get('since')
      const category = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams.get('category')
      const limit = Number(new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams.get('limit')) || undefined
      return send(res, 200, { events: getTrace({ since: since || undefined, category: category || undefined, limit }), locks: accountLock.snapshot() })
    }
    if (req.method === 'POST' && parts.join('/') === 'api/publisher/login-trace/clear') { clearTrace(); return send(res, 200, { ok: true }) }
    if (req.method === 'POST' && parts.join('/') === 'api/publisher/accounts/auth-start') {
      if (origin) return send(res, 403, { error: 'Desktop authorization grants cannot be created by browser content.' })
      const body = await readJson(req)
      const account = await getAccount(String(body.accountId || ''))
      if (!account) return send(res, 404, { error: 'Account not found.' })
      if (account.platform !== String(body.platform || '')) return send(res, 400, { error: 'Account and platform do not match.' })
      const token = String(req.headers['x-geo-auth-token'] || '')
      if (!sameToken(token, body.token)) return send(res, 403, { error: 'Invalid desktop authorization grant.' })
      pruneDesktopAuthGrants()
      desktopAuthGrants.set(account.id, { token, platform: account.platform, expiresAt: Date.now() + 15 * 60_000 })
      await updateAccount(account.id, { mode: 'visible', status: 'login-required', lastCheckedAt: null, lastError: null, errorCode: null })
      return send(res, 200, { ok: true })
    }
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'publisher' && parts[2] === 'accounts' && parts[3] && parts[4] === 'auth-result') {
      if (origin) return send(res, 403, { error: 'Desktop authorization results cannot be submitted by browser content.' })
      pruneDesktopAuthGrants()
      const account = await getAccount(parts[3])
      if (!account) return send(res, 404, { error: 'Account not found.' })
      const grant = desktopAuthGrants.get(account.id)
      const token = String(req.headers['x-geo-auth-token'] || '')
      if (!grant || grant.platform !== account.platform || !sameToken(token, grant.token)) return send(res, 403, { error: 'Desktop authorization grant is missing or expired.' })
      desktopAuthGrants.delete(account.id)
      const result = await persistAuthorizationResult(account, await readJson(req))
      return send(res, 200, { account: await getAccount(account.id), ...result })
    }
    if (req.method === 'POST' && parts.join('/') === 'api/publisher/accounts/prepare') {
      const body = await readJson(req)
      try { requireAccountAdapter(body.platform || 'zhihu') } catch (error) { return send(res, 400, { error: error.message }) }
      const replacement = await prepareAccountConfiguration(body)
      if (replacement.conflict) return send(res, 409, { error: replacement.conflict.error, conflict: replacement.conflict.conflict || null })
      const account = replacement.result.account
      const configured = await updateAccount(account.id, { mode: 'visible', status: 'login-required', lastCheckedAt: null, lastError: null, errorCode: null })
      if (body.desktopManaged) return send(res, 201, { account: configured, message: `Account created. Continue ${account.platform} authorization in the GEO desktop window.` })
      const acquired = accountLock.tryAcquire(account.id, account.platform); if (!acquired.ok) return send(res, 409, { error: acquired.error, conflict: acquired.conflict || null })
      logTrace('prepare', 'Manual account configuration requested', { accountId: account.id, platform: account.platform, mode: 'visible' })
      requireAccountAdapter(account.platform).startAccountSetup(await getAccount(account.id), { visible: true }).finally(() => accountLock.release(account.id)).catch(error => { logTrace('prepare', 'Account configuration failed', { accountId: account.id, error: error.message }); updateAccount(account.id, { status: 'error', lastError: error.message, errorCode: 'auth-window-error' }) })
      return send(res, 202, { account: configured, message: `Account configured. Finish ${account.platform} authorization in the opened window.`, locks: accountLock.snapshot() })
    }
    if (req.method === 'POST' && parts.join('/') === 'api/publisher/accounts/cookies') {
      const body = await readJson(req)
      const cookies = normalizeCookies(body.cookies)
      const replacement = await prepareAccountConfiguration({ accountId: body.accountId, label: body.label, platform: body.platform, mode: 'background' })
      if (replacement.conflict) return send(res, 409, { error: replacement.conflict.error, conflict: replacement.conflict.conflict || null })
      const account = replacement.result.account
      await saveSession(account.id, { cookies, localStorage: body.localStorage, sessionStorage: body.sessionStorage, origin: body.origin })
      const configured = await updateAccount(account.id, { status: 'login-required', lastCheckedAt: null, sessionCapturedAt: new Date().toISOString(), lastError: null, errorCode: null })
      logTrace('cookies', 'Cookie configuration saved; waiting for manual verification', { accountId: account.id, cookieCount: cookies.length })
      return send(res, 200, { account: configured, message: 'Encrypted local cookies saved. Click Verify account to test this session.' })
    }
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'publisher' && parts[2] === 'accounts' && parts[3] && parts[4] === 'reauthorize') {
      const account = await getAccount(parts[3]); if (!account) return send(res, 404, { error: 'Account not found.' })
      const body = await readJson(req)
      if (body.desktopManaged) {
        const configured = await updateAccount(account.id, { mode: 'visible', status: 'login-required', lastCheckedAt: null, lastError: null, errorCode: null })
        return send(res, 200, { account: configured, message: 'Continue reauthorization in the GEO desktop window.' })
      }
      const acquired = accountLock.tryAcquire(account.id, account.platform)
      if (!acquired.ok) return send(res, 409, { error: acquired.error, conflict: acquired.conflict || null })
      try {
        // Loke reauthorization runs again in the same per-account profile.
        // Keep the profile and encrypted session intact so an already valid
        // login can be reused; disconnect is the destructive reset path.
        const configured = await updateAccount(account.id, { mode: 'visible', status: 'login-required', lastCheckedAt: null, lastError: null, errorCode: null })
        logTrace('prepare', 'Manual account reauthorization requested', { accountId: account.id, mode: 'visible' })
        requireAccountAdapter(account.platform).startAccountSetup(await getAccount(account.id), { visible: true }).finally(() => accountLock.release(account.id)).catch(error => { logTrace('prepare', 'Account reauthorization failed', { accountId: account.id, error: error.message }); updateAccount(account.id, { status: 'error', lastError: error.message, errorCode: 'auth-window-error' }) })
        return send(res, 202, { account: configured, message: 'Reauthorization started. Finish login in the opened browser, then verify the account.' })
      } catch (error) {
        accountLock.release(account.id)
        throw error
      }
    }
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'publisher' && parts[2] === 'accounts' && parts[3] && parts[4] === 'open') {
      const account = await getAccount(parts[3]); if (!account) return send(res, 404, { error: 'Account not found.' })
      const acquired = accountLock.tryAcquire(account.id, account.platform)
      if (!acquired.ok) return send(res, 409, { error: acquired.error, conflict: acquired.conflict || null })
      try {
        const result = await requireAccountAdapter(account.platform).openAccount(await getAccount(account.id), { visible: true })
        logTrace('open', 'Account profile opened for inspection', { accountId: account.id })
        return send(res, 200, { account: await getAccount(account.id), ...result })
      } catch (error) {
        await updateAccount(account.id, { status: 'error', lastCheckedAt: new Date().toISOString(), lastError: error.message })
        return send(res, 500, { error: error.message })
      } finally { accountLock.release(account.id) }
    }
    if (req.method === 'PATCH' && parts[0] === 'api' && parts[1] === 'publisher' && parts[2] === 'accounts' && parts[3]) {
      const body = await readJson(req)
      if (body.label === undefined) return send(res, 400, { error: 'Only account label can be changed.' })
      const account = await renameAccount(parts[3], body.label)
      if (!account) return send(res, 404, { error: 'Account not found.' })
      return send(res, 200, { account })
    }
    if (req.method === 'DELETE' && parts[0] === 'api' && parts[1] === 'publisher' && parts[2] === 'accounts' && parts[3]) {
      const account = await getAccount(parts[3]); if (!account) return send(res, 404, { error: 'Account not found.' })
      if (accountLock.activeFor(account.platform).some(entry => entry.id === account.id)) return send(res, 409, { error: 'Account is busy. Close the active browser or job before disconnecting.', conflict: { accountId: account.id } })
      await requireAccountAdapter(account.platform).resetAccount(account)
      const removed = await deleteAccount(account.id)
      return send(res, 200, { account: removed, message: 'Account disconnected and unfinished jobs cancelled.' })
    }
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'publisher' && parts[2] === 'accounts' && parts[3] && parts[4] === 'verify') {
      const account = await getAccount(parts[3]); if (!account) return send(res, 404, { error: 'Account not found.' })
      const acquired = accountLock.tryAcquire(account.id, account.platform); if (!acquired.ok) return send(res, 409, { error: acquired.error, conflict: acquired.conflict || null })
      logTrace('verify', 'Account verification requested', { accountId: account.id })
      try { const result = await requireAccountAdapter(account.platform).verifyAccount(account); if (result.status === 'ready') void recoverQueuedJobs().catch(() => {}); return send(res, 200, { account: await getAccount(account.id), ...result }) }
      finally { accountLock.release(account.id) }
    }
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'publisher' && parts[2] === 'accounts' && parts[3] && parts[4] === 'mode') {
      const body = await readJson(req); const account = await getAccount(parts[3]); if (!account) return send(res, 404, { error: 'Account not found.' })
      return send(res, 200, { account: await updateAccount(account.id, { mode: body.mode === 'visible' ? 'visible' : 'background' }) })
    }
    if (req.method === 'POST' && parts.join('/') === 'api/publisher/jobs') {
      const body = await readJson(req);
      try { requireOperationalPlatform(body.platform || 'zhihu') } catch (error) { return send(res, 400, { error: error.message }) }
      const account = await getAccount(body.accountId);
      if (!account) return send(res, 400, { error: 'Account not found.' });
      if (account.platform !== (body.platform || 'zhihu')) return send(res, 400, { error: 'Account and platform do not match.' });
      // Chrome profiles cannot be used by two browser processes at once. Hold
      // the platform lock from launch through a visible draft's approval (or
      // cancellation), not just for the short HTTP request, so queued jobs do
      // not race the same user-data-dir and lose their DevTools endpoint.
      const acquired = accountLock.tryAcquire(account.id, account.platform);
      if (!acquired.ok) return send(res, 409, { error: acquired.error, conflict: acquired.conflict || null });
      let job;
      try { job = await createJob(body) }
      catch (error) { accountLock.release(account.id); throw error }
      const claimed = await claimJob(job.id, RUNNER_ID)
      if (!claimed.ok) { accountLock.release(account.id); return send(res, 409, { error: claimed.error, job: claimed.job || job }) }
      job = claimed.job
      startLeaseHeartbeat(job)
      logTrace('job-created', 'Job created, checking activeJobs', { jobId: job.id, activeJobsSize: activeJobs.size, hasJob: activeJobs.has(job.id) });
      if (!activeJobs.has(job.id)) {
        activeJobs.add(job.id);
        logTrace('job-processing', 'Starting job preparation', { jobId: job.id });
        try {
          const jobForProcessing = await getStoredJob(job.id);
          logTrace('job-fetch-success', 'Successfully fetched job for processing', { jobId: job.id });
          requirePlatformAdapter(jobForProcessing.platform).prepareJob(jobForProcessing, account).catch(prepareError => {
            // prepareZhihuJob normally contains its own failure boundary, but
            // keep the service alive if an unexpected setup/store error leaks
            // out (especially a browser launch rejection).
            logTrace('job-processing-error', 'Unhandled job preparation rejection', { jobId: job.id, error: prepareError.message })
            return updateJob(job.id, { status: 'failed', error: prepareError.message }).catch(updateError => {
              logTrace('job-processing-error', 'Could not persist preparation failure', { jobId: job.id, error: updateError.message })
            })
          }).finally(() => {
            activeJobs.delete(job.id);
            void getJob(job.id).then(async completed => {
              const retainsBrowser = (account.mode === 'visible' || process.env.GEO_PUBLISHER_RUNTIME === 'electron') && ['login-required', 'draft-saved', 'awaiting-approval', 'failed-inspection'].includes(completed?.status);
              if (!retainsBrowser) {
                stopLeaseHeartbeat(job.id)
                await releaseJobLease(job.id, job.runnerId, job.leaseId).catch(() => {})
                accountLock.release(account.id)
              }
            }).catch(() => accountLock.release(account.id));
            logTrace('job-processing-finished', 'Job preparation finished', { jobId: job.id });
          });
        } catch (prepareError) {
          logTrace('job-processing-error', 'Error in job processing setup', { jobId: job.id, error: prepareError.message });
          activeJobs.delete(job.id);
          stopLeaseHeartbeat(job.id);
          await releaseJobLease(job.id, job.runnerId, job.leaseId).catch(() => {});
          accountLock.release(account.id);
          await updateJob(job.id, { status: 'failed', error: `Job processing setup failed: ${prepareError.message}` });
        }
      } else {
        logTrace('job-skipped', 'Job already being processed, skipping', { jobId: job.id });
      }
      return send(res, 202, { job })
    }
    if (parts[0] === 'api' && parts[1] === 'publisher' && parts[2] === 'jobs' && parts[3]) {
      const jobId = parts[3]; const job = await getJob(jobId); if (!job) return send(res, 404, { error: 'Job not found.' })
      if (req.method === 'GET' && parts.length === 4) return send(res, 200, { job })
      if (req.method === 'POST' && parts[4] === 'claim') {
        const body = await readJson(req)
        const result = await claimJob(jobId, body.runnerId || RUNNER_ID)
        return send(res, result.ok ? 200 : 409, result)
      }
      if (req.method === 'POST' && parts[4] === 'heartbeat') {
        const body = await readJson(req)
        const result = await heartbeatJob(jobId, body.runnerId, body.leaseId)
        return send(res, result.ok ? 200 : 409, result)
      }
      if (req.method === 'POST' && parts[4] === 'release') {
        const body = await readJson(req)
        const result = await releaseJobLease(jobId, body.runnerId, body.leaseId)
        return send(res, result.ok ? 200 : 409, result)
      }
      if (req.method === 'POST' && parts[4] === 'cancel') {
        await requirePlatformAdapter(job.platform).discardJobSession(jobId)
        stopLeaseHeartbeat(jobId)
        if (job.runnerId && job.leaseId) await releaseJobLease(jobId, job.runnerId, job.leaseId).catch(() => {})
        if (!activeJobs.has(jobId)) accountLock.release(job.accountId)
        return send(res, 200, { job: await updateJob(jobId, { status: 'cancelled', error: null }) })
      }
      if (req.method === 'POST' && parts[4] === 'approve') {
        if (job.status !== 'awaiting-approval' && job.status !== 'draft-saved') return send(res, 409, { error: `Job cannot be approved from ${job.status}.`, job })
        const account = await getAccount(job.accountId); if (!account) return send(res, 400, { error: 'Account not found.' })
        const alreadyHeld = accountLock.activeFor(account.platform).some(entry => entry.id === account.id)
        if (!alreadyHeld) {
          const acquired = accountLock.tryAcquire(account.id, account.platform)
          if (!acquired.ok) return send(res, 409, { error: acquired.error, conflict: acquired.conflict || null })
        }
        const approved = await updateJob(jobId, { status: 'publishing', approvedAt: new Date().toISOString() })
        try { const result = await requirePlatformAdapter(job.platform).publishJob(await getStoredJob(jobId), account); return send(res, 200, { job: await updateJob(jobId, { status: 'published', externalUrl: result.externalUrl, error: null }) }) }
        catch (error) {
          const status = account.mode === 'visible' || process.env.GEO_PUBLISHER_RUNTIME === 'electron' ? 'failed-inspection' : 'failed'
          return send(res, 200, { job: await updateJob(jobId, { status, error: error.message }) })
        }
        finally {
          const completed = await getJob(jobId).catch(() => null)
          if (completed?.status !== 'failed-inspection') {
            stopLeaseHeartbeat(jobId)
            if (job.runnerId && job.leaseId) await releaseJobLease(jobId, job.runnerId, job.leaseId).catch(() => {})
            accountLock.release(job.accountId)
          }
        }
      }
    }
    return send(res, 404, { error: `No route for ${req.method} ${req.url}` })
  } catch (error) { return send(res, 400, { error: error.message || 'Invalid request' }) }
}

const server = http.createServer(handle)
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.log(`[publisher] Another local publisher is already running on http://127.0.0.1:${PORT}; using that instance.`)
    process.exit(0)
  }
  console.error('[publisher] server error:', error)
  process.exit(1)
})
void recoverQueuedJobs().catch(error => console.error('[publisher] startup recovery failed:', error.message))
server.listen(PORT, '127.0.0.1', () => console.log(`[publisher] Listening on http://127.0.0.1:${PORT}`))
