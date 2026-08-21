import http from 'node:http'
import { createJob, getAccount, getJob, listAccounts, listJobs, replaceZhihuAccount, updateAccount, updateJob } from './store.mjs'
import { discardZhihuJobSession, prepareZhihuJob, publishZhihuJob, resetZhihuAccount, startZhihuAccountSetup, verifyZhihuAccount } from './zhihu.mjs'
import { loadPuppeteer } from './puppeteer.mjs'
import { normalizeCookies, saveCookies } from './vault.mjs'
import { createPlatformLock } from './locks.mjs'
import { clearTrace, getTrace, trace as logTrace, traceSnapshot } from './trace.mjs'

const PORT = Number(process.env.PUBLISHER_PORT || 8788)
const MAX_BODY_BYTES = 8 * 1024 * 1024
const activeJobs = new Set()
const accountLock = createPlatformLock()
console.log('[publisher-debug] Server starting with modified code - job processing fix active')

async function replaceAccountConfiguration(input) {
  const existing = (await listAccounts())[0]
  if (existing) {
    const acquired = accountLock.tryAcquire(existing.id, 'zhihu')
    if (!acquired.ok) return { conflict: acquired }
    try {
      await resetZhihuAccount(await getAccount(existing.id))
    } finally {
      accountLock.release(existing.id)
    }
  }
  return { result: await replaceZhihuAccount({ ...input, platform: 'zhihu' }) }
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
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://127.0.0.1:5173', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function routeParts(url) { return new URL(url, `http://127.0.0.1:${PORT}`).pathname.split('/').filter(Boolean) }

async function handle(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return }
  let parts
  try {
    parts = routeParts(req.url || '/')
  } catch (error) {
    return send(res, 400, { error: `Invalid URL: ${error.message}` })
  }
  try {
    if (req.method === 'GET' && parts.join('/') === 'api/publisher/status') return send(res, 200, { ok: true, service: 'local-puppeteer-publisher', puppeteer: Boolean(await loadPuppeteer()), activeJobs: activeJobs.size, locks: accountLock.snapshot(), trace: traceSnapshot() })
    if (req.method === 'GET' && parts.join('/') === 'api/publisher/accounts') return send(res, 200, { accounts: await listAccounts() })
    if (req.method === 'GET' && parts.join('/') === 'api/publisher/jobs') return send(res, 200, { jobs: await listJobs() })
    if (req.method === 'GET' && parts.join('/') === 'api/publisher/login-trace') {
      const since = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams.get('since')
      const category = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams.get('category')
      const limit = Number(new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams.get('limit')) || undefined
      return send(res, 200, { events: getTrace({ since: since || undefined, category: category || undefined, limit }), locks: accountLock.snapshot() })
    }
    if (req.method === 'POST' && parts.join('/') === 'api/publisher/login-trace/clear') { clearTrace(); return send(res, 200, { ok: true }) }
    if (req.method === 'POST' && parts.join('/') === 'api/publisher/accounts/prepare') {
      const body = await readJson(req)
      if (body.platform && body.platform !== 'zhihu') return send(res, 400, { error: 'Only one Zhihu account is supported.' })
      const replacement = await replaceAccountConfiguration(body)
      if (replacement.conflict) return send(res, 409, { error: replacement.conflict.error, conflict: replacement.conflict.conflict || null })
      const account = replacement.result.account
      const configured = await updateAccount(account.id, { mode: 'visible', status: 'login-required', lastCheckedAt: null, lastError: null })
      const acquired = accountLock.tryAcquire(account.id, 'zhihu'); if (!acquired.ok) return send(res, 409, { error: acquired.error, conflict: acquired.conflict || null })
      logTrace('prepare', 'Manual Zhihu account configuration requested', { accountId: account.id, mode: 'visible' })
      startZhihuAccountSetup(await getAccount(account.id), { visible: true }).finally(() => accountLock.release(account.id)).catch(error => { logTrace('prepare', 'Account configuration failed', { accountId: account.id, error: error.message }); updateAccount(account.id, { status: 'error', lastError: error.message }) })
      return send(res, 202, { account: configured, message: 'Account configured. Finish login in the opened browser, then click Verify account.', locks: accountLock.snapshot() })
    }
    if (req.method === 'POST' && parts.join('/') === 'api/publisher/accounts/cookies') {
      const body = await readJson(req)
      const cookies = normalizeCookies(body.cookies)
      const replacement = await replaceAccountConfiguration({ label: body.label, mode: 'background' })
      if (replacement.conflict) return send(res, 409, { error: replacement.conflict.error, conflict: replacement.conflict.conflict || null })
      const account = replacement.result.account
      await saveCookies(account.id, cookies)
      const configured = await updateAccount(account.id, { status: 'login-required', lastCheckedAt: null, lastError: null })
      logTrace('cookies', 'Cookie configuration saved; waiting for manual verification', { accountId: account.id, cookieCount: cookies.length })
      return send(res, 200, { account: configured, message: 'Encrypted local cookies saved. Click Verify account to test this session.' })
    }
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'publisher' && parts[2] === 'accounts' && parts[3] && parts[4] === 'verify') {
      const account = await getAccount(parts[3]); if (!account) return send(res, 404, { error: 'Account not found.' })
      const acquired = accountLock.tryAcquire(account.id, account.platform); if (!acquired.ok) return send(res, 409, { error: acquired.error, conflict: acquired.conflict || null })
      logTrace('verify', 'Account verification requested', { accountId: account.id })
      try { const result = await verifyZhihuAccount(account); return send(res, 200, { account: await getAccount(account.id), ...result }) }
      finally { accountLock.release(account.id) }
    }
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'publisher' && parts[2] === 'accounts' && parts[3] && parts[4] === 'mode') {
      const body = await readJson(req); const account = await getAccount(parts[3]); if (!account) return send(res, 404, { error: 'Account not found.' })
      return send(res, 200, { account: await updateAccount(account.id, { mode: body.mode === 'visible' ? 'visible' : 'background' }) })
    }
    if (req.method === 'POST' && parts.join('/') === 'api/publisher/jobs') {
      const body = await readJson(req);
      const account = await getAccount(body.accountId);
      if (!account) return send(res, 400, { error: 'Account not found.' });
      // Chrome profiles cannot be used by two browser processes at once. Hold
      // the platform lock from launch through a visible draft's approval (or
      // cancellation), not just for the short HTTP request, so queued jobs do
      // not race the same user-data-dir and lose their DevTools endpoint.
      const acquired = accountLock.tryAcquire(account.id, account.platform);
      if (!acquired.ok) return send(res, 409, { error: acquired.error, conflict: acquired.conflict || null });
      let job;
      try { job = await createJob(body) }
      catch (error) { accountLock.release(account.id); throw error }
      logTrace('job-created', 'Job created, checking activeJobs', { jobId: job.id, activeJobsSize: activeJobs.size, hasJob: activeJobs.has(job.id) });
      if (!activeJobs.has(job.id)) {
        activeJobs.add(job.id);
        logTrace('job-processing', 'Starting job preparation', { jobId: job.id });
        try {
          const jobForProcessing = await getJob(job.id);
          logTrace('job-fetch-success', 'Successfully fetched job for processing', { jobId: job.id });
          prepareZhihuJob(jobForProcessing, account).catch(prepareError => {
            // prepareZhihuJob normally contains its own failure boundary, but
            // keep the service alive if an unexpected setup/store error leaks
            // out (especially a browser launch rejection).
            logTrace('job-processing-error', 'Unhandled job preparation rejection', { jobId: job.id, error: prepareError.message })
            return updateJob(job.id, { status: 'failed', error: prepareError.message }).catch(updateError => {
              logTrace('job-processing-error', 'Could not persist preparation failure', { jobId: job.id, error: updateError.message })
            })
          }).finally(() => {
            activeJobs.delete(job.id);
            void getJob(job.id).then(completed => {
              const retainsBrowser = account.mode === 'visible' && ['login-required', 'draft-saved', 'awaiting-approval', 'failed-inspection'].includes(completed?.status);
              if (!retainsBrowser) accountLock.release(account.id);
            }).catch(() => accountLock.release(account.id));
            logTrace('job-processing-finished', 'Job preparation finished', { jobId: job.id });
          });
        } catch (prepareError) {
          logTrace('job-processing-error', 'Error in job processing setup', { jobId: job.id, error: prepareError.message });
          activeJobs.delete(job.id);
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
      if (req.method === 'POST' && parts[4] === 'cancel') {
        await discardZhihuJobSession(jobId)
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
        try { const result = await publishZhihuJob({ ...job, ...approved }, account); return send(res, 200, { job: await updateJob(jobId, { status: 'published', externalUrl: result.externalUrl, error: null }) }) }
        catch (error) {
          const status = account.mode === 'visible' ? 'failed-inspection' : 'failed'
          return send(res, 200, { job: await updateJob(jobId, { status, error: error.message }) })
        }
        finally {
          const completed = await getJob(jobId).catch(() => null)
          if (completed?.status !== 'failed-inspection') accountLock.release(job.accountId)
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
server.listen(PORT, '127.0.0.1', () => console.log(`[publisher] Listening on http://127.0.0.1:${PORT}`))
