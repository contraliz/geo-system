const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('geoDesktop', {
  isDesktop: true,
  openAuthWindow: input => ipcRenderer.invoke('geo-open-auth-window', input && typeof input === 'object' ? { accountId: String(input.accountId || ''), platform: String(input.platform || '') } : { accountId: String(input || ''), platform: 'zhihu' }),
  openApiKeyWindow: language => ipcRenderer.invoke('geo-open-api-key-window', { language: language === 'zh' ? 'zh' : 'en' }).then(result => ({ ok: result?.ok === true, configured: result?.configured === true, cancelled: result?.cancelled === true, error: typeof result?.error === 'string' ? result.error : undefined })),
})
