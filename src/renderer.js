const els = {
  userId: document.getElementById('userId'),
  m3u8Url: document.getElementById('m3u8Url'),
  tsUrlDemo: document.getElementById('tsUrlDemo'),
  referer: document.getElementById('referer'),
  outputRoot: document.getElementById('outputRoot'),
  outputFolder: document.getElementById('outputFolder'),
  browseBtn: document.getElementById('browseBtn'),
  startBtn: document.getElementById('startBtn'),
  cancelBtn: document.getElementById('cancelBtn'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  logOutput: document.getElementById('logOutput'),
  statusText: document.getElementById('statusText'),
  progressText: document.getElementById('progressText'),
  progressBar: document.getElementById('progressBar'),
  outputPreview: document.getElementById('outputPreview'),
};

let autoFolder = true;

function deriveVideoId(m3u8Url) {
  try {
    const url = new URL(m3u8Url);
    const file = url.pathname.split('/').pop();
    if (!file) return 'video';
    return file.replace(/\.m3u8$/i, '') || 'video';
  } catch (err) {
    return 'video';
  }
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function setProgress(current, total) {
  els.progressText.textContent = `${current} / ${total}`;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  els.progressBar.style.width = `${pct}%`;
}

function appendLog(message) {
  if (!message) return;
  const line = `${new Date().toLocaleTimeString()}  ${message}\n`;
  els.logOutput.textContent += line;
  els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

function updateOutputPreview() {
  const root = els.outputRoot.value.trim();
  const folder = els.outputFolder.value.trim();
  if (!root || !folder) {
    els.outputPreview.textContent = '...';
    return;
  }
  const separator = root.endsWith('\\') || root.endsWith('/') ? '' : '\\';
  els.outputPreview.textContent = `${root}${separator}${folder}`;
}

function lockForm(isLocked) {
  const fields = [
    els.userId,
    els.m3u8Url,
    els.tsUrlDemo,
    els.referer,
    els.outputRoot,
    els.outputFolder,
    els.browseBtn,
  ];
  fields.forEach((field) => {
    field.disabled = isLocked;
  });
  els.startBtn.disabled = isLocked;
  els.cancelBtn.disabled = !isLocked;
}

async function init() {
  const defaultRoot = await window.api.getDefaultOutputRoot();
  if (defaultRoot) {
    els.outputRoot.value = defaultRoot;
  }
  updateOutputPreview();
}

els.m3u8Url.addEventListener('input', () => {
  const derived = deriveVideoId(els.m3u8Url.value.trim());
  if (autoFolder || !els.outputFolder.value.trim()) {
    els.outputFolder.value = derived;
    autoFolder = true;
  }
  updateOutputPreview();
});

els.outputFolder.addEventListener('input', () => {
  autoFolder = false;
  updateOutputPreview();
});

els.outputRoot.addEventListener('input', updateOutputPreview);

els.browseBtn.addEventListener('click', async () => {
  const root = await window.api.selectOutputRoot();
  if (root) {
    els.outputRoot.value = root;
    updateOutputPreview();
  }
});

els.clearLogBtn.addEventListener('click', () => {
  els.logOutput.textContent = '';
});

els.startBtn.addEventListener('click', async () => {
  const payload = {
    userId: els.userId.value.trim(),
    m3u8Url: els.m3u8Url.value.trim(),
    tsUrlDemo: els.tsUrlDemo.value.trim(),
    referer: els.referer.value.trim(),
    outputRoot: els.outputRoot.value.trim(),
    outputFolder: els.outputFolder.value.trim(),
  };

  if (!payload.userId || !payload.m3u8Url) {
    appendLog('Missing userId or m3u8Url.');
    return;
  }

  setStatus('Starting');
  setProgress(0, 0);
  lockForm(true);
  appendLog('Starting download...');

  const result = await window.api.startDownload(payload);
  if (!result.ok) {
    appendLog(result.error || 'Failed to start.');
    lockForm(false);
    setStatus('Idle');
  }
});

els.cancelBtn.addEventListener('click', async () => {
  await window.api.cancelDownload();
});

window.api.onLog((msg) => appendLog(msg));
window.api.onStage((stage) => {
  const map = {
    fetching: 'Fetching m3u8',
    downloading: 'Downloading segments',
    merging: 'Merging',
    cleaning: 'Cleaning',
    done: 'Done',
  };
  setStatus(map[stage] || stage);
});

window.api.onProgress((progress) => {
  setProgress(progress.current, progress.total);
});

window.api.onDone((data) => {
  appendLog(`Done: ${data.outputFile}`);
  setStatus('Done');
  lockForm(false);
});

window.api.onError((err) => {
  appendLog(`Error: ${err}`);
  setStatus('Error');
  lockForm(false);
});

window.api.onCancelled(() => {
  appendLog('Cancelled by user.');
  setStatus('Cancelled');
  lockForm(false);
});

init();
