// Ring-buffer trace used by the login sequence and exposed at /api/publisher/login-trace.
// Designed for debug visibility — never includes secrets, only step names + counts.

const MAX_EVENTS = 200
const events = []

export function trace(category, message, detail) {
  const event = { at: new Date().toISOString(), category, message }
  if (detail && typeof detail === 'object') event.detail = detail
  events.push(event)
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
}

export function getTrace({ since, category, limit } = {}) {
  let result = events
  if (since) result = result.filter(event => event.at >= since)
  if (category) result = result.filter(event => event.category === category)
  if (typeof limit === 'number' && limit > 0) result = result.slice(-limit)
  return result
}

export function clearTrace() {
  events.length = 0
}

export function traceSnapshot() {
  return { total: events.length, lastAt: events.length ? events[events.length - 1].at : null }
}