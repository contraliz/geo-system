export async function waitForHttp(url, { timeoutMs = 30_000, intervalMs = 250, requestTimeoutMs = 1_500, label = 'local service' } = {}) {
  const startedAt = Date.now()
  let lastError = 'not started'
  while (Date.now() - startedAt < timeoutMs) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const response = await fetch(url, { signal: controller.signal, redirect: 'manual' })
      if (response.status >= 200 && response.status < 500) return { status: response.status, url }
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    } finally { clearTimeout(timer) }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(`${label} did not become ready at ${url} within ${timeoutMs}ms (${lastError}).`)
}
