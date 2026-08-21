export const JOB_STATUSES = [
  'queued',
  'login-required',
  'editor-open',
  'content-filled',
  'draft-saved',
  'awaiting-approval',
  'publishing',
  'published',
  'failed',
  'cancelled',
]

export const ACCOUNT_STATUSES = ['disconnected', 'login-required', 'ready', 'error']

export function now() {
  return new Date().toISOString()
}

export function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
