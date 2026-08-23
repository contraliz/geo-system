const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('geoDesktop', {
  isDesktop: true,
  openAuthWindow: input => ipcRenderer.invoke('geo-open-auth-window', input && typeof input === 'object' ? { accountId: String(input.accountId || ''), platform: String(input.platform || '') } : { accountId: String(input || ''), platform: 'zhihu' }),
})
