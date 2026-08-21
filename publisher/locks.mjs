// In-process lock that allows at most one one one setup per platform at a time.
// e.g. one Zhihu account preparation can run even while another account on a
// different platform is preparing — but a second Zhihu preparation blocks.
export function createPlatformLock() {
  const activeAccounts = new Map() // accountId -> { platform, startedAt }
  const platformCounts = new Map() // platform -> integer count

  function release(id) {
    const entry = activeAccounts.get(id)
    if (!entry) return
    activeAccounts.delete(id)
    const count = platformCounts.get(entry.platform) || 0
    if (count <= 1) platformCounts.delete(entry.platform)
    else platformCounts.set(entry.platform, count - 1)
  }

  return {
    tryAcquire(id, platform) {
      if (!id || !platform) return { ok: false, error: 'Lock requires account id and platform.' }
      if (activeAccounts.has(id)) return { ok: false, error: 'This account is already initializing.', conflict: { sameAccount: true } }
      const count = platformCounts.get(platform) || 0
      if (count > 0) {
        const activeForPlatform = [...activeAccounts.entries()].filter(([, info]) => info.platform === platform).map(([activeId]) => activeId)
        return { ok: false, error: `Another ${platform} account is already initializing. Wait for it to finish or close its browser window.`, conflict: { sameAccount: false, platform, activeForPlatform } }
      }
      activeAccounts.set(id, { platform, startedAt: Date.now() })
      platformCounts.set(platform, 1)
      return { ok: true }
    },
    release,
    isPlatformLocked(platform) {
      return (platformCounts.get(platform) || 0) > 0
    },
    activeFor(platform) {
      return [...activeAccounts.entries()].filter(([, info]) => info.platform === platform).map(([id, info]) => ({ id, startedAt: info.startedAt }))
    },
    snapshot() {
      const result = { total: activeAccounts.size, byPlatform: {} }
      for (const [id, info] of activeAccounts) {
        if (!result.byPlatform[info.platform]) result.byPlatform[info.platform] = []
        result.byPlatform[info.platform].push({ id, startedAt: info.startedAt })
      }
      return result
    },
  }
}