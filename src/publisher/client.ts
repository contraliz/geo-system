export type PublisherMode = 'background' | 'visible'
export type AccountStatus = 'disconnected' | 'login-required' | 'ready' | 'error' | string
export type PublisherAccount = {
  id: string
  label: string
  platform: string
  mode: PublisherMode
  status: AccountStatus
  profileConfigured?: boolean
  createdAt?: string
  updatedAt?: string
  lastCheckedAt?: string | null
  lastAuthAt?: string | null
  sessionCapturedAt?: string | null
  sessionConfigured?: boolean
  errorCode?: string | null
  accountName?: string | null
  avatarUrl?: string | null
  lastError?: string | null
}

export type PublisherJobStatus = 'queued' | 'login-required' | 'editor-open' | 'content-filled' | 'draft-saved' | 'awaiting-approval' | 'publishing' | 'published' | 'failed' | 'failed-inspection' | 'cancelled' | string
export type PublisherJob = {
  id: string
  platform: string
  accountId: string
  title: string
  content?: string
  status: PublisherJobStatus
  approvalRequired?: boolean
  aiDisclosure?: boolean
  aiDisclosureSelected?: boolean
  coverFirstBodyImage?: boolean
  coverImageUrl?: string | null
  coverStatus?: string | null
  pacingMode?: 'human' | 'disabled' | string
  approvedAt?: string | null
  externalUrl?: string | null
  error?: string | null
  createdAt?: string
  updatedAt?: string
  runnerId?: string | null
  leaseId?: string | null
  claimedAt?: string | null
  heartbeatAt?: string | null
  leaseExpiresAt?: string | null
  attempt?: number
  maxAttempts?: number
}

export type PublisherPlatform = { id: string; name: string; nameZh: string; operational: boolean; publishingSupported?: boolean; authSupported?: boolean; selectorsValidated?: boolean; loginUrl?: string | null; adminUrl?: string | null; cookieDomain?: string | null; editorUrl?: string }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(mapPublisherError(payload.error || `Request failed (${response.status})`))
  return payload as T
}

export function mapPublisherError(value: string) {
  const message = String(value || '')
  if (/data:(?:text|application)\//i.test(message) || /ERR_FAILED.*(?:authorization window|loading\s+['"]file:)/i.test(message)) {
    return 'The authorization window could not load its local toolbar. Restart the desktop app and retry authorization.'
  }
  if (/10001|请求参数异常|升级客户端|upgrade.?client/i.test(message)) {
    return 'Zhihu rejected the request (10001). Update the client or retry after reopening the account session.'
  }
  if (/登录|login|required|signin|security/i.test(message)) {
    return `${message} Complete the manual Zhihu login in the opened profile, then choose Verify account.`
  }
  return message
}

export const publisherApi = {
  listAccounts: () => request<{ accounts: PublisherAccount[] }>('/api/publisher/accounts'),
  listJobs: () => request<{ jobs: PublisherJob[] }>('/api/publisher/jobs'),
  listPlatforms: () => request<{ platforms: PublisherPlatform[] }>('/api/publisher/platforms'),
  connect: (platform: string, label: string, desktopManaged = false) => request<{ account: PublisherAccount; message: string }>('/api/publisher/accounts/prepare', { method: 'POST', body: JSON.stringify({ platform, label, mode: 'visible', visible: true, desktopManaged }) }),
  importCookies: (platform: string, label: string, session: unknown, accountId?: string) => request<{ account: PublisherAccount; message: string }>('/api/publisher/accounts/cookies', { method: 'POST', body: JSON.stringify({ platform, ...(accountId ? { accountId } : {}), label, ...(Array.isArray(session) ? { cookies: session } : session && typeof session === 'object' ? session : { cookies: session }) }) }),
  reauthorize: async (accountId: string, desktopManaged = typeof window !== 'undefined' && Boolean((window as Window & { geoDesktop?: { isDesktop?: boolean } }).geoDesktop?.isDesktop)) => {
    if (!desktopManaged) throw new Error('Account reauthorization requires the GEO desktop app. Start npm run desktop:dev and retry there.')
    const result = await request<{ account: PublisherAccount; message: string }>(`/api/publisher/accounts/${encodeURIComponent(accountId)}/reauthorize`, { method: 'POST', body: JSON.stringify({ desktopManaged }) })
    return { ...result, desktopAuthorization: desktopManaged }
  },
  open: (accountId: string) => request<{ account: PublisherAccount; message?: string; url?: string }>(`/api/publisher/accounts/${encodeURIComponent(accountId)}/open`, { method: 'POST' }),
  verify: (accountId: string) => request<{ account: PublisherAccount; message: string }>(`/api/publisher/accounts/${encodeURIComponent(accountId)}/verify`, { method: 'POST' }),
  rename: (accountId: string, label: string) => request<{ account: PublisherAccount }>(`/api/publisher/accounts/${encodeURIComponent(accountId)}`, { method: 'PATCH', body: JSON.stringify({ label }) }),
  setMode: (accountId: string, mode: PublisherMode) => request<{ account: PublisherAccount }>(`/api/publisher/accounts/${encodeURIComponent(accountId)}/mode`, { method: 'POST', body: JSON.stringify({ mode }) }),
  disconnect: (accountId: string) => request<{ account: PublisherAccount; message: string }>(`/api/publisher/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }),
  createJob: (input: { accountId: string; title: string; content: string; platform?: string; imagePaths?: string[]; manualReview?: boolean; aiDisclosure?: boolean; aiDisclosureSelected?: boolean; coverFirstBodyImage?: boolean; coverImageUrl?: string | null; coverStatus?: string | null; pacingMode?: 'human' | 'disabled' }) => request<{ job: PublisherJob }>('/api/publisher/jobs', { method: 'POST', body: JSON.stringify({ platform: 'zhihu', imagePaths: [], pacingMode: 'human', ...input }) }),
  approve: (jobId: string) => request<{ job: PublisherJob }>(`/api/publisher/jobs/${encodeURIComponent(jobId)}/approve`, { method: 'POST' }),
  cancel: (jobId: string) => request<{ job: PublisherJob }>(`/api/publisher/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }),
}

export function accountStatusLabel(status: AccountStatus) {
  if (status === 'ready') return 'Connected'
  if (status === 'login-required') return 'Reauthorization required'
  if (status === 'error') return 'Action required'
  return status === 'disconnected' ? 'Disconnected' : status
}

export function jobStatusLabel(status: PublisherJobStatus) {
  return status === 'awaiting-approval' ? 'Awaiting approval' : status.replaceAll('-', ' ').replace(/\b\w/g, value => value.toUpperCase())
}
