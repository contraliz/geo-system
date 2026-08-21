import { useEffect, useState } from 'react'
import { Check, ExternalLink, LoaderCircle, Play, Plus, ShieldCheck, X } from 'lucide-react'
import type { Article } from './data'

type Account = { id: string; label: string; platform: string; mode: 'background' | 'visible'; status: string; lastError?: string | null }
type Job = { id: string; title: string; status: string; error?: string | null; externalUrl?: string | null }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`)
  return payload as T
}

export function PublisherPanel({ articles, notify }: { articles: Article[]; notify: (message: string) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [label, setLabel] = useState('Zhihu editorial account')
  const [cookieJson, setCookieJson] = useState('')
  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id || '')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [showBrowser, setShowBrowser] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    try {
      const [accountPayload, jobPayload] = await Promise.all([
        request<{ accounts: Account[] }>('/api/publisher/accounts'),
        request<{ jobs: Job[] }>('/api/publisher/jobs'),
      ])
      setAccounts(accountPayload.accounts)
      setJobs(jobPayload.jobs)
      setSelectedAccountId(accountPayload.accounts[0]?.id || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publisher service is unavailable')
    }
  }

  useEffect(() => { void refresh() }, [])

  const connect = async () => {
    setLoading(true); setError('')
    try {
      const payload = await request<{ account: Account }>('/api/publisher/accounts/prepare', { method: 'POST', body: JSON.stringify({ platform: 'zhihu', label, mode: 'visible', visible: true }) })
      setSelectedAccountId(payload.account.id)
      notify('Account configured. Finish login, then click Verify account.')
      await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start account setup') }
    finally { setLoading(false) }
  }

  const prepare = async () => {
    const article = articles.find(item => item.id === selectedArticleId)
    if (!article || !selectedAccountId) return
    setLoading(true); setError('')
    try {
      await request(`/api/publisher/accounts/${selectedAccountId}/mode`, { method: 'POST', body: JSON.stringify({ mode: showBrowser ? 'visible' : 'background' }) })
      await request('/api/publisher/jobs', { method: 'POST', body: JSON.stringify({ accountId: selectedAccountId, title: article.title, content: article.body || `${article.title}\n\nThis local draft was prepared from the ${article.keyword} article record.`, imagePaths: [] }) })
      notify('Zhihu draft preparation started')
      await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create publishing job') }
    finally { setLoading(false) }
  }

  const verify = async () => {
    if (!selectedAccountId) return
    setLoading(true); setError('')
    try { const result = await request<{ message: string }>(`/api/publisher/accounts/${selectedAccountId}/verify`, { method: 'POST' }); notify(result.message); await refresh() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not verify account') }
    finally { setLoading(false) }
  }

  const connectWithCookies = async () => {
    setLoading(true); setError('')
    try {
      const parsed = JSON.parse(cookieJson)
      const payload = await request<{ account: Account }>('/api/publisher/accounts/cookies', { method: 'POST', body: JSON.stringify({ platform: 'zhihu', label, cookies: parsed }) })
      setSelectedAccountId(payload.account.id); setCookieJson(''); notify('Cookies saved. Click Verify account to test the session.'); await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Cookie JSON is invalid or could not be saved') }
    finally { setLoading(false) }
  }

  const approve = async (job: Job) => {
    setLoading(true); setError('')
    try { await request(`/api/publisher/jobs/${job.id}/approve`, { method: 'POST' }); notify('Publishing approval sent to the local worker'); await refresh() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not approve publishing') }
    finally { setLoading(false) }
  }

  const closeDebugBrowser = async (job: Job) => {
    setLoading(true); setError('')
    try { await request(`/api/publisher/jobs/${job.id}/cancel`, { method: 'POST' }); notify('Closed the retained debug browser'); await refresh() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not close the debug browser') }
    finally { setLoading(false) }
  }

  return <section className="card publisher-panel">
    <div className="table-toolbar"><div><div className="eyebrow"><ShieldCheck size={13} /> LOCAL PUBLISHER</div><h2>Zhihu publishing</h2><p className="toolbar-subtitle">Connect once in a visible browser, then prepare future jobs in the background when the saved session is valid.</p></div><span className="simulated-label"><span className="status-dot" /> Approval required</span></div>
    <div className="publisher-grid">
      <div className="publisher-setup"><h3>Account setup</h3><p className="muted-copy">Only one Zhihu account is stored. A new manual login or cookie import replaces the current configuration. Verification never starts automatically.</p><div className="publisher-form-row"><input aria-label="Zhihu account label" value={label} onChange={event => setLabel(event.target.value)} placeholder="Account label" /><button className="button button-outline" disabled={loading || !label.trim()} onClick={() => void connect()}><Plus size={14} /> Configure manual login</button></div><label className="publisher-field">Cookie JSON (advanced)<textarea className="publisher-cookie-input" aria-label="Zhihu cookie JSON" value={cookieJson} onChange={event => setCookieJson(event.target.value)} placeholder="Paste a browser cookie export JSON array" rows={3} /></label><button className="button button-soft" disabled={loading || !label.trim() || !cookieJson.trim()} onClick={() => void connectWithCookies()}><ShieldCheck size={14} /> Configure cookie session</button>{accounts[0] && <div className="publisher-account-summary"><strong>{accounts[0].label}</strong><span className={`status-pill ${accounts[0].status}`}>{accounts[0].status}</span><small>New setup replaces this account.</small></div>}{accounts[0]?.status === 'login-required' && <button className="button button-outline publisher-verify" disabled={loading} onClick={() => void verify()}><ShieldCheck size={14} /> Verify account</button>}</div>
      <div className="publisher-setup"><h3>Prepare an article</h3><p className="muted-copy">Preparation opens the editor, fills the draft, and stops before publishing.</p><label className="publisher-field">Article<select value={selectedArticleId} onChange={event => setSelectedArticleId(event.target.value)}>{articles.map(article => <option value={article.id} key={article.id}>{article.title}</option>)}</select></label><label className="publisher-debug-toggle"><input type="checkbox" checked={showBrowser} onChange={event => setShowBrowser(event.target.checked)} /> <span><strong>Show Chrome window</strong><small>Debug mode: display the browser during preparation and publishing.</small></span></label><button className="button button-primary" disabled={loading || !selectedAccountId || !selectedArticleId} onClick={() => void prepare()}><Play size={14} /> Prepare draft</button></div>
    </div>
    {error && <div className="publisher-error"><X size={14} /> {error}</div>}
    <div className="publisher-jobs"><div className="section-row"><div><h3>Publishing jobs</h3><p className="muted-copy">The final publish action is never automatic until you approve it.</p></div><button className="text-button" onClick={() => void refresh()}><LoaderCircle size={13} /> Refresh</button></div>{jobs.length === 0 ? <p className="empty-inline">No local publishing jobs yet.</p> : <div className="publisher-job-list">{jobs.slice(0, 5).map(job => <div className="publisher-job" key={job.id}><div><strong>{job.title}</strong><span className={`status-pill ${job.status}`}>{job.status}</span>{job.error && <small>{job.error}</small>}</div><div className="publisher-job-actions">{(job.status === 'awaiting-approval' || job.status === 'draft-saved') && <button className="button button-primary compact-button" disabled={loading} onClick={() => void approve(job)}><Check size={13} /> Approve & publish</button>}{job.status === 'failed-inspection' && <button className="button button-outline compact-button" disabled={loading} onClick={() => void closeDebugBrowser(job)}><X size={13} /> Close debug browser</button>}{job.externalUrl && <a className="text-button" href={job.externalUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open result</a>}</div></div>)}</div>}</div>
  </section>
}
