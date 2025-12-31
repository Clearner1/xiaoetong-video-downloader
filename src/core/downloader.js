const crypto = require('crypto');
const { EventEmitter } = require('events');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');

function buildDefaultHeaders(referer) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  };
  if (referer) headers.Referer = referer;
  return headers;
}

function resolveRedirectUrl(baseUrl, location) {
  try {
    return new URL(location, baseUrl).toString();
  } catch (err) {
    return location;
  }
}

function createCancelSignal() {
  const listeners = new Set();
  return {
    aborted: false,
    onAbort(callback) {
      if (this.aborted) {
        callback();
        return () => {};
      }
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    abort() {
      if (this.aborted) return;
      this.aborted = true;
      for (const cb of listeners) cb();
      listeners.clear();
    },
  };
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const err = new Error('Cancelled');
    err.code = 'CANCELLED';
    throw err;
  }
}

function httpGetBuffer(url, headers, signal) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = resolveRedirectUrl(url, res.headers.location);
        res.resume();
        resolve(httpGetBuffer(nextUrl, headers, signal));
        return;
      }
      if (res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    const off = signal
      ? signal.onAbort(() => {
          req.destroy(new Error('Cancelled'));
        })
      : null;
    req.on('error', (err) => reject(err));
    req.on('close', () => {
      if (off) off();
    });
  });
}

function downloadToFile(url, savefilepath, headers, signal) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = resolveRedirectUrl(url, res.headers.location);
        res.resume();
        resolve(downloadToFile(nextUrl, savefilepath, headers, signal));
        return;
      }
      if (res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const fileStream = fs.createWriteStream(savefilepath, { flags: 'w' });
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => resolve('finish'));
      });
      fileStream.on('error', (err) => {
        fileStream.close(() => reject(err));
      });
    });
    const off = signal
      ? signal.onAbort(() => {
          req.destroy(new Error('Cancelled'));
        })
      : null;
    req.on('error', (err) => reject(err));
    req.on('close', () => {
      if (off) off();
    });
  });
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

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

async function getM3u8(m3u8Url, outputDir, headers, signal) {
  const data = await httpGetBuffer(m3u8Url, headers, signal);
  const content = data.toString('utf-8');
  fs.writeFileSync(path.join(outputDir, 'data.m3u8'), content, 'utf-8');
  if (!content.includes('#EXTM3U')) {
    throw new Error('m3u8 response is invalid. Check referer or auth.');
  }
  return content;
}

function getIV(m3u8Content) {
  const ivRegex = /#EXT-X-KEY:.*?IV=0x([0-9A-Fa-f]+)/;
  const match = m3u8Content.match(ivRegex);
  if (match) {
    return Buffer.from(match[1], 'hex');
  }
  return Buffer.alloc(16, 0);
}

function getKeyUri(m3u8Content, m3u8Url) {
  const match = m3u8Content.match(/#EXT-X-KEY:.*?\bURI="(.*?)"/);
  if (!match) {
    throw new Error('EXT-X-KEY not found in m3u8.');
  }
  const keyUri = match[1];
  return new URL(keyUri, m3u8Url).toString();
}

async function fetchKey(keyUrl, userId, headers, signal) {
  const data = await httpGetBuffer(keyUrl, headers, signal);
  if (data.length === 16) return data;
  const sep = keyUrl.includes('?') ? '&' : '?';
  const urlWithUid = `${keyUrl}${sep}uid=${encodeURIComponent(userId)}`;
  const dataWithUid = await httpGetBuffer(urlWithUid, headers, signal);
  if (dataWithUid.length === 16) return dataWithUid;
  throw new Error('Key length is not 16 bytes.');
}

function xorKeys(keyBuffer, userId) {
  const key1Array = keyBuffer;
  const key2Array = Array.from(userId);
  const result = Buffer.alloc(key1Array.length);
  for (let i = 0; i < key1Array.length; i++) {
    result[i] = key1Array[i] ^ key2Array[i].charCodeAt(0);
  }
  return result;
}

function parseTsUrls(m3u8Content, m3u8Url, tsUrlDemo) {
  const lines = m3u8Content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (lines.length === 0) {
    throw new Error('No segment lines found in m3u8.');
  }
  const demoUrl = tsUrlDemo ? new URL(tsUrlDemo) : null;
  if (!demoUrl) {
    const missingQuery = lines.some((line) => !line.includes('?'));
    if (missingQuery) {
      throw new Error(
        'tsUrlDemo is required: m3u8 segment lines do not include query parameters.'
      );
    }
  }
  return lines.map((line) => {
    const resolved = new URL(line, demoUrl || m3u8Url);
    if (!demoUrl) return resolved.toString();
    const params = new URLSearchParams(demoUrl.search);
    const lineParams = new URLSearchParams(resolved.search);
    for (const [key, value] of lineParams.entries()) {
      params.set(key, value);
    }
    resolved.search = params.toString();
    return resolved.toString();
  });
}

function decryptBuffer(secretKey, iv, rawFilepath) {
  const encryptedData = fs.readFileSync(rawFilepath);
  const decipher = crypto.createDecipheriv('aes-128-cbc', secretKey, iv);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

function detectTsSync(buffer) {
  const packetSize = 188;
  const probePackets = 5;
  if (!buffer || buffer.length < packetSize * 3) {
    return { valid: false, offset: 0, score: 0 };
  }
  const maxOffset = Math.min(packetSize - 1, buffer.length - 1);
  let bestScore = 0;
  let bestOffset = 0;
  for (let offset = 0; offset <= maxOffset; offset++) {
    let score = 0;
    for (let i = 0; i < probePackets; i++) {
      const idx = offset + i * packetSize;
      if (idx >= buffer.length) break;
      if (buffer[idx] === 0x47) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  return { valid: bestScore >= 4, offset: bestOffset, score: bestScore };
}

function normalizeTs(buffer) {
  const info = detectTsSync(buffer);
  if (!info.valid) return null;
  const start = info.offset;
  const usableLen = buffer.length - start;
  const trimmedLen = usableLen - (usableLen % 188);
  if (trimmedLen < 188) return null;
  return { buffer: buffer.slice(start, start + trimmedLen), score: info.score };
}

function pickBetterCandidate(a, b) {
  if (a && b) return a.score >= b.score ? a : b;
  return a || b || null;
}

function checkFfmpegAvailable() {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('ffmpeg not available in PATH.'));
    });
  });
}

async function mergeSegments(decodeDir, outputFile, onLog, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ffmpeg',
      ['-y', '-safe', '0', '-f', 'concat', '-i', 'filelist.txt', '-c', 'copy', outputFile],
      { cwd: decodeDir }
    );
    const onAbort = signal
      ? signal.onAbort(() => {
          proc.kill('SIGINT');
        })
      : null;
    proc.stdout.on('data', (data) => onLog(data.toString().trim()));
    proc.stderr.on('data', (data) => onLog(data.toString().trim()));
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (onAbort) onAbort();
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

class DownloadJob extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.signal = createCancelSignal();
  }

  cancel() {
    this.signal.abort();
  }

  async start() {
    const opts = this.options;
    if (!opts.userId) throw new Error('userId is required.');
    if (!opts.m3u8Url) throw new Error('m3u8Url is required.');

    const outputRoot = opts.outputRoot || process.cwd();
    const folderName = opts.outputFolder || deriveVideoId(opts.m3u8Url);
    const outputDir = path.join(outputRoot, folderName);
    const downloadDir = path.join(outputDir, 'download');
    const decodeDir = path.join(outputDir, 'decode');

    ensureDir(outputDir);
    removeDir(downloadDir);
    removeDir(decodeDir);
    ensureDir(downloadDir);
    ensureDir(decodeDir);

    const headers = buildDefaultHeaders(opts.referer);
    this.emit('stage', 'fetching');
    const m3u8Content = await getM3u8(opts.m3u8Url, outputDir, headers, this.signal);

    const iv = getIV(m3u8Content);
    const keyUrl = getKeyUri(m3u8Content, opts.m3u8Url);
    const tsUrls = parseTsUrls(m3u8Content, opts.m3u8Url, opts.tsUrlDemo);

    this.emit('log', `Segments: ${tsUrls.length}`);

    await checkFfmpegAvailable();

    let rawKey = null;
    let xorKey = null;
    let keyMode = 'xor';

    const refreshKey = async () => {
      this.emit('log', 'Refreshing key...');
      rawKey = await fetchKey(keyUrl, opts.userId, headers, this.signal);
      xorKey = xorKeys(rawKey, opts.userId);
    };

    await refreshKey();

    const filelistPath = path.join(decodeDir, 'filelist.txt');
    fs.writeFileSync(filelistPath, '', 'utf-8');

    this.emit('stage', 'downloading');
    for (let i = 0; i < tsUrls.length; i++) {
      throwIfAborted(this.signal);
      const url = tsUrls[i];
      const filename = `${i}_${url.match(/\/([^/]+\.ts)(\?|$)/)[1]}`;
      const rawPath = path.join(downloadDir, filename);
      const outPath = path.join(decodeDir, `${i}.ts`);

      this.emit('log', `Downloading ${i + 1}/${tsUrls.length}`);
      await downloadToFile(url, rawPath, headers, this.signal);

      const tryDecrypt = (mode) => {
        const key = mode === 'xor' ? xorKey : rawKey;
        if (!key) return null;
        try {
          const data = decryptBuffer(key, iv, rawPath);
          const normalized = normalizeTs(data);
          if (!normalized) return null;
          return { mode, buffer: normalized.buffer, score: normalized.score };
        } catch (err) {
          return null;
        }
      };

      let candidate = pickBetterCandidate(
        tryDecrypt(keyMode),
        tryDecrypt(keyMode === 'xor' ? 'raw' : 'xor')
      );

      if (!candidate) {
        await refreshKey();
        candidate = pickBetterCandidate(tryDecrypt('xor'), tryDecrypt('raw'));
      }

      if (!candidate) {
        await refreshKey();
        candidate = pickBetterCandidate(tryDecrypt('xor'), tryDecrypt('raw'));
      }

      if (!candidate) {
        throw new Error(`Failed to decrypt segment ${i}.`);
      }

      keyMode = candidate.mode;
      fs.writeFileSync(outPath, candidate.buffer);
      fs.appendFileSync(filelistPath, `file '${i}.ts'\n`, 'utf-8');
      this.emit('progress', { current: i + 1, total: tsUrls.length });
    }

    this.emit('stage', 'merging');
    await mergeSegments(decodeDir, path.join(outputDir, 'output.mp4'), (msg) => {
      if (msg) this.emit('log', msg);
    }, this.signal);

    if (opts.cleanup !== false) {
      this.emit('stage', 'cleaning');
      removeDir(downloadDir);
      removeDir(decodeDir);
    }

    this.emit('stage', 'done');
    return { outputDir, outputFile: path.join(outputDir, 'output.mp4') };
  }
}

module.exports = {
  DownloadJob,
  deriveVideoId,
};
