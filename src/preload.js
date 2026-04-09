const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getDefaultOutputRoot: () => ipcRenderer.invoke('get-default-output-root'),
  selectOutputRoot: () => ipcRenderer.invoke('select-output-root'),
  startDownload: (payload) => ipcRenderer.invoke('start-download', payload),
  startBatchDownload: (payload) => ipcRenderer.invoke('start-batch-download', payload),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),

  // XiaoE login
  xiaoeLogin: (payload) => ipcRenderer.invoke('xiaoe-login', payload),
  clearXiaoeLogin: () => ipcRenderer.invoke('clear-xiaoe-login'),
  onLoginStatus: (callback) => ipcRenderer.on('login-status', (_event, status) => callback(status)),

  // XiaoE course parser
  parseCourse: (payload) => ipcRenderer.invoke('parse-course', payload),

  onLog: (callback) => ipcRenderer.on('log', (_event, msg) => callback(msg)),
  onStage: (callback) => ipcRenderer.on('stage', (_event, stage) => callback(stage)),
  onProgress: (callback) => ipcRenderer.on('progress', (_event, progress) => callback(progress)),
  onDone: (callback) => ipcRenderer.on('done', (_event, data) => callback(data)),
  onError: (callback) => ipcRenderer.on('error', (_event, err) => callback(err)),
  onCancelled: (callback) => ipcRenderer.on('cancelled', () => callback()),
  onBatchItemStatus: (callback) => ipcRenderer.on('batch-item-status', (_event, data) => callback(data)),
  onBatchFolderNames: (callback) => ipcRenderer.on('batch-folder-names', (_event, data) => callback(data)),
  onBatchDone: (callback) => ipcRenderer.on('batch-done', (_event, data) => callback(data)),

  // Parse progress
  onParseLog: (callback) => ipcRenderer.on('parse-log', (_event, msg) => callback(msg)),
  onParseProgress: (callback) => ipcRenderer.on('parse-progress', (_event, data) => callback(data)),
  onParseUserId: (callback) => ipcRenderer.on('parse-userId', (_event, uid) => callback(uid)),
});
