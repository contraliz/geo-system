import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { trace as logTrace } from './trace.mjs'

let cachedModule

export async function loadPuppeteer() {
  if (cachedModule !== undefined) return cachedModule
  try {
    cachedModule = await import('puppeteer')
  } catch (error) {
    try { cachedModule = await import('puppeteer-core') }
    catch { cachedModule = null }
  }
  return cachedModule
}

export function browserExecutablePath() {
  const configured = process.env.GEO_CHROME_EXECUTABLE || process.env.PUPPETEER_EXECUTABLE_PATH
  if (configured) return configured
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`]
    : process.platform === 'win32'
      ? [`${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  return candidates.find(candidate => candidate && fs.existsSync(candidate))
}

export function headlessBrowserExecutablePath({
  platform = process.platform,
  env = process.env,
  cacheRoot = null,
} = {}) {
  const configured = env.GEO_HEADLESS_CHROME_EXECUTABLE
  if (configured) return fs.existsSync(configured) ? configured : null

  const root = cacheRoot || env.PLAYWRIGHT_BROWSERS_PATH || (platform === 'darwin'
    ? path.join(env.HOME || '', 'Library', 'Caches', 'ms-playwright')
    : platform === 'win32'
      ? path.join(env.LOCALAPPDATA || '', 'ms-playwright')
      : path.join(env.HOME || '', '.cache', 'ms-playwright'))
  if (!root || !fs.existsSync(root)) return null

  let installations = []
  try {
    installations = fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^chromium_headless_shell-\d+$/.test(entry.name))
      .map(entry => entry.name)
      .sort((a, b) => Number(b.split('-').at(-1)) - Number(a.split('-').at(-1)))
  } catch {
    return null
  }

  const relativeCandidates = platform === 'darwin'
    ? ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell']
    : platform === 'win32'
      ? ['chrome-headless-shell-win64/chrome-headless-shell.exe']
      : ['chrome-headless-shell-linux64/chrome-headless-shell']
  for (const installation of installations) {
    for (const relative of relativeCandidates) {
      const candidate = path.join(root, installation, relative)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return null
}

function macAppBundlePath(executablePath) {
  if (process.platform !== 'darwin' || !executablePath) return null
  const macosDir = path.dirname(executablePath)
  const contentsDir = path.dirname(macosDir)
  const appPath = path.dirname(contentsDir)
  return appPath.endsWith('.app') ? appPath : null
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(error => error ? reject(error) : resolve(address.port))
    })
  })
}

function activeDevtoolsPort(userDataDir, launchedAt) {
  if (!userDataDir) return null
  try {
    const activePath = path.join(userDataDir, 'DevToolsActivePort')
    const stat = fs.statSync(activePath)
    // Do not connect to an endpoint left by a previous Chrome process. Chrome
    // rewrites this file as it starts a remote-debugging browser.
    if (launchedAt && stat.mtimeMs + 100 < launchedAt) return null
    const port = Number(fs.readFileSync(activePath, 'utf8').trim().split(/\s+/)[0])
    return Number.isInteger(port) && port > 0 && port < 65_536 ? port : null
  } catch {
    return null
  }
}

export async function waitForDevtools(port, timeoutMs = 30_000, { userDataDir, launchedAt } = {}) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const candidates = [port, activeDevtoolsPort(userDataDir, launchedAt)].filter((candidate, index, values) => candidate && values.indexOf(candidate) === index)
    for (const candidate of candidates) {
      try {
        const response = await fetch(`http://127.0.0.1:${candidate}/json/version`)
        if (response.ok) return { ...(await response.json()), port: candidate }
      } catch {
        // Chrome is still starting, or the initially requested port raced with
        // another local process. DevToolsActivePort is checked on the next poll.
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  const discovered = activeDevtoolsPort(userDataDir, launchedAt)
  const requested = port ? `requested port ${port}` : 'the requested port'
  const fileHint = userDataDir ? ` or a fresh DevToolsActivePort in ${userDataDir}` : ''
  throw new Error(`Chrome did not expose a DevTools endpoint on ${requested}${fileHint}${discovered ? ` (last discovered port ${discovered})` : ''}.`)
}

// The HTTP DevTools endpoint can answer while the browser process is still
// finishing startup. Confirm the browser is fully up by round-tripping a
// target command over the CDP connection before returning the browser handle.
async function waitForBrowserReady(browser, timeoutMs = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await browser.pages()
      return
    } catch {
      // The browser is still starting up.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Chrome did not become ready after launch.')
}

export async function launchBrowser(puppeteer, { headless, userDataDir, executablePath, headlessExecutablePath = null }) {
  const headlessExecutable = headless ? (headlessExecutablePath || headlessBrowserExecutablePath()) : null
  if (headless && !headlessExecutable && macAppBundlePath(executablePath)) {
    throw new Error('Background publishing requires Playwright Chromium headless shell. Run `npx playwright install chromium --only-shell` or set GEO_HEADLESS_CHROME_EXECUTABLE.')
  }
  const effectiveExecutablePath = headlessExecutable || executablePath
  const appPath = macAppBundlePath(effectiveExecutablePath)
  if (!appPath) {
    logTrace('puppeteer-debug', 'Launching Chromium via puppeteer.launch', { executablePath: effectiveExecutablePath, headless })
    let browser = null
    try {
      browser = await puppeteer.launch({
        headless,
        userDataDir,
        ...(effectiveExecutablePath ? { executablePath: effectiveExecutablePath } : {}),
      })
      await waitForBrowserReady(browser)
      logTrace('puppeteer-debug', 'Browser launched successfully via puppeteer', {})
      return browser
    } catch (error) {
      // Puppeteer owns this process in the direct-launch path. If readiness
      // fails after launch, close through CDP so Chrome exits cleanly rather
      // than leaving a crash-prone orphan for later cleanup.
      if (browser) await browser.close().catch(() => {})
      logTrace('puppeteer-debug-error', 'Failed to launch Chrome via puppeteer', { error: error.message })
      throw error
    }
  }

  // On macOS, launching the Chrome app through its executable directly can
  // abort during application registration. LaunchServices avoids that crash.
  logTrace('puppeteer-debug', 'Launching Chrome via LaunchServices', { appPath })
  let browser = null
  try {
    const port = await freePort()
    const launchedAt = Date.now()
    logTrace('puppeteer-debug', 'Allocated port for DevTools', { port })
    // macOS app bundles stay in the GUI process model to avoid Chrome's
    // application-registration abort. `headless` therefore means hidden
    // background mode here; -g/-j keep the proven visible startup hidden.
    const launchSpec = buildChromeLaunchSpec({ appPath, userDataDir, port, background: headless })

    logTrace('puppeteer-debug', 'Spawning Chrome process', { mode: headless ? 'hidden-background' : 'visible', args: launchSpec.chromeArgs, openArgs: launchSpec.openArgs })
    const launcher = spawn(launchSpec.command, launchSpec.openArgs, {
      stdio: 'ignore',
      detached: true,
    })
    launcher.unref()
    logTrace('puppeteer-debug', 'Waiting for DevTools endpoint', { port })
    const endpoint = await waitForDevtools(port, 30_000, { userDataDir, launchedAt })
    const endpointPort = endpoint.port || port
    logTrace('puppeteer-debug', 'DevTools endpoint available, connecting', { port: endpointPort, requestedPort: port })
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${endpointPort}` })
    await waitForBrowserReady(browser)
    logTrace('puppeteer-debug', 'Browser ready', {})
    return browser
  } catch (error) {
    if (browser) await browser.close().catch(() => {})
    logTrace('puppeteer-debug-error', 'Failed to launch Chrome via LaunchServices', { error: error.message })
    throw error
  }
}

export function buildChromeLaunchSpec({ appPath, userDataDir, port, background = false }) {
  const chromeArgs = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
  ]
  // Keep the known-good Chrome startup geometry in both modes. LaunchServices
  // hides the background window with -g/-j; these flags help the app complete
  // its normal startup and expose DevTools reliably.
  chromeArgs.push('--window-size=1100,720', '--window-position=40,40', '--new-window')
  chromeArgs.push('--no-first-run', '--no-default-browser-check')
  return {
    command: 'open',
    openArgs: background
      ? ['-g', '-j', '-n', '-a', appPath, '--args', ...chromeArgs]
      : ['-na', appPath, '--args', ...chromeArgs],
    chromeArgs,
  }
}
