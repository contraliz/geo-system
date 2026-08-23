const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('geoAuthWindow', {
  finishAuthorization: () => ipcRenderer.send('geo-auth-finish'),
  cancelAuthorization: () => ipcRenderer.send('geo-auth-cancel'),
  webviewReady: () => ipcRenderer.send('geo-auth-webview-ready'),
})
