export const PUBLISHER_PROTOCOL_VERSION = 1
export const DESKTOP_AUTH_CAPABILITY = 'desktopAuthV1'

export function hasDesktopAuthProtocol(status) {
  return Boolean(status && status.protocolVersion === PUBLISHER_PROTOCOL_VERSION && status.capabilities && status.capabilities[DESKTOP_AUTH_CAPABILITY] === true)
}

export function incompatiblePublisherError({ port, status } = {}) {
  const pid = status && Number.isInteger(status.pid) ? ` PID ${status.pid}` : ''
  return `The publisher service on port ${port || '8788'} is incompatible with desktop account authorization${pid}. Restart it from this repository so it exposes the desktopAuthV1 capability.`
}

export async function readPublisherStatus(url, fetchImpl = fetch) {
  const response = await fetchImpl(url)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(`Publisher status request failed (${response.status}).`)
    error.publisherReachable = true
    throw error
  }
  return payload
}
