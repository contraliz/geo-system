const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('credentialApi', {
  saveApiKey: value => ipcRenderer.invoke('geo-save-api-key', typeof value === 'string' ? value : ''),
  cancel: () => ipcRenderer.invoke('geo-cancel-api-key'),
})
