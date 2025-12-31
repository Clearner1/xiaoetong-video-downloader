# xiaoetong-video-downloader

English | [中文](#中文说明)

A small desktop helper to download and merge Xiaoetong HLS videos you are authorized to access. It fetches the m3u8, downloads/decrypts segments, and merges to `output.mp4` via ffmpeg.

## Features
- GUI-based workflow (no terminal needed for the download flow)
- AES-128 / XOR key handling
- Auto merge with ffmpeg
- Auto cleanup of `download/` and `decode/` folders

## Requirements
- Node.js 18+ and npm
- ffmpeg available in PATH

## Install
Option A (simple, uses npx to fetch Electron on first run):
```bash
npm start
```

Option B (faster startup, install Electron once):
```bash
npm i -D electron
npm start
```

## Usage
1. Open the video page in your browser.
2. Get `userId` in DevTools Console (type `userId` and press Enter).
3. In DevTools > Network, copy the full `m3u8` request URL.
4. Copy the page URL as `referer`.
5. (Optional) If the m3u8 segment lines do not include query parameters, copy any `.ts` request URL as `tsUrlDemo`.
6. Choose output root and folder name (auto-filled from the m3u8 filename).
7. Click Start. The merged file is saved as `output.mp4` in the output folder.

## Input notes
- `tsUrlDemo` is only required when the m3u8 lists bare `xxx.ts` paths without query params. The app will prompt you when it is needed.
- After a successful merge, temp folders are cleaned automatically.

## Legal
Use this tool only for content you own or are authorized to access.

## Acknowledgements
Thanks to https://github.com/li1055107552/xiaoe-tech-decodeDemo for the original project that inspired this optimized version.

## 中文说明

这是一个桌面工具，用于下载并合并你已授权访问的小鹅通 HLS 视频。它会抓取 m3u8，下载/解密分片，并通过 ffmpeg 合并成 `output.mp4`。

## 功能
- GUI 流程（下载步骤无需终端）
- AES-128 / XOR 密钥处理
- 自动用 ffmpeg 合并
- 自动清理 `download/` 和 `decode/` 临时目录

## 环境要求
- Node.js 18+ 和 npm
- ffmpeg 已加入 PATH

## 安装
方案 A（最简单，首次会用 npx 拉取 Electron）：
```bash
npm start
```

方案 B（启动更快，先安装 Electron）：
```bash
npm i -D electron
npm start
```

## 使用步骤
1. 打开视频播放页。
2. 在 DevTools Console 输入 `userId` 获取用户 id。
3. 在 DevTools > Network 中找到 `.m3u8` 请求，复制完整 URL。
4. 将页面地址作为 `referer`。
5. （可选）如果 m3u8 的 ts 行没有参数，复制任意 `.ts` 请求 URL 作为 `tsUrlDemo`。
6. 选择输出目录和文件夹名（默认从 m3u8 文件名自动生成）。
7. 点击 Start，输出文件为 `output.mp4`。

## 输入说明
- `tsUrlDemo` 仅在 m3u8 的 ts 行缺少 query 参数时需要；程序会在需要时提示。
- 合并成功后会自动清理临时目录。

## 合规提示
仅用于已授权访问的内容。

## 致谢
感谢 https://github.com/li1055107552/xiaoe-tech-decodeDemo 本项目基于该仓库的思路进行优化。
