const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getDefaultOutputRoot: () => ipcRenderer.invoke('get-default-output-root'),
  selectOutputRoot: () => ipcRenderer.invoke('select-output-root'),
  startDownload: (payload) => ipcRenderer.invoke('start-download', payload),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  onLog: (callback) => ipcRenderer.on('log', (_event, msg) => callback(msg)),
  onStage: (callback) => ipcRenderer.on('stage', (_event, stage) => callback(stage)),
  onProgress: (callback) => ipcRenderer.on('progress', (_event, progress) => callback(progress)),
  onDone: (callback) => ipcRenderer.on('done', (_event, data) => callback(data)),
  onError: (callback) => ipcRenderer.on('error', (_event, err) => callback(err)),
  onCancelled: (callback) => ipcRenderer.on('cancelled', () => callback()),
});
