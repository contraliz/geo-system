import path from 'node:path'
const config = JSON.parse(process.env.GEO_ELECTRON_PUBLISH_CONFIG || '{}')
const { app, BrowserWindow, session } = await import('electron')

if (!config.profileDir || !path.isAbsolute(config.profileDir)) throw new Error('Publisher profile path is invalid.')
app.setPath('userData', config.profileDir)
app.commandLine.appendSwitch('remote-debugging-port', String(config.port))
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')

let win
function showWindow() { if (win && !win.isDestroyed()) { win.show(); win.focus() } }
function hideWindow() { if (win && !win.isDestroyed()) win.hide() }

app.whenReady().then(async () => {
  const partition = String(config.partition || '').replace(/[^a-z0-9:_-]/gi, '')
  if (!partition) throw new Error('Publisher session partition is invalid.')
  const publisherSession = session.fromPartition(partition, { cache: true })
  publisherSession.setSpellCheckerEnabled(false)
  win = new BrowserWindow({ width: 1400, height: 900, show: Boolean(config.visible), backgroundColor: '#eef3f8', webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false } })
  win.webContents.setBackgroundThrottling(false)
  win.on('closed', () => app.quit())
  await win.loadURL('about:blank')
  if (config.visible) showWindow(); else hideWindow()
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', value => { for (const command of String(value).split(/\r?\n/)) { if (command === 'show') showWindow(); if (command === 'hide') hideWindow(); if (command === 'quit') app.quit() } })
}).catch(error => { process.stderr.write(`[electron-publisher] ${error.message}\n`); app.quit() })

app.on('window-all-closed', () => app.quit())
