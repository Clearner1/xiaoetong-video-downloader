const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { DownloadJob } = require('./core/downloader');

let mainWindow = null;
let currentJob = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#f6efe4',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function sendToRenderer(channel, payload) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, payload);
  }
}

ipcMain.handle('get-default-output-root', () => app.getPath('downloads'));

ipcMain.handle('select-output-root', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('start-download', async (_event, payload) => {
  if (currentJob) {
    return { ok: false, error: 'A download is already running.' };
  }

  currentJob = new DownloadJob({
    userId: payload.userId,
    m3u8Url: payload.m3u8Url,
    tsUrlDemo: payload.tsUrlDemo,
    referer: payload.referer,
    outputRoot: payload.outputRoot,
    outputFolder: payload.outputFolder,
    cleanup: true,
  });

  currentJob.on('log', (msg) => sendToRenderer('log', msg));
  currentJob.on('stage', (stage) => sendToRenderer('stage', stage));
  currentJob.on('progress', (progress) => sendToRenderer('progress', progress));

  currentJob
    .start()
    .then((result) => {
      sendToRenderer('done', result);
    })
    .catch((err) => {
      if (err && err.code === 'CANCELLED') {
        sendToRenderer('cancelled', {});
      } else {
        sendToRenderer('error', err.message || String(err));
      }
    })
    .finally(() => {
      currentJob = null;
    });

  return { ok: true };
});

ipcMain.handle('cancel-download', () => {
  if (currentJob) {
    currentJob.cancel();
    return true;
  }
  return false;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
