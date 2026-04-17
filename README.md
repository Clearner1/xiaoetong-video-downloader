# 小鹅通视频全自动下载器 (Xiaoetong Video Downloader)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Electron-Desktop_App-47848f?logo=electron)
![FFmpeg](https://img.shields.io/badge/FFmpeg-Video_Process-007808?logo=ffmpeg)

>  一款基于 Electron 打造的全自动小鹅通（Xiaoetong）视频、专栏批量解析与下载工具。支持视频 M3U8 抓取、AES-128/XOR 解密、FFmpeg 自动合并为 MP4，为您提供极致流畅的知识付费视频下载体验。
> 
> A fully automated web scraper and video downloader for Xiaoetong courses, featuring M3U8 batch downloading, DRM decryption, and auto-merging via FFmpeg.

这是一个全自动的桌面工具，专为批量下载并合并你已授权访问的小鹅通视频/专栏而设计。程序会自动帮你嗅探课程里所有的 M3U8 视频真实地址，并完成资源下载、密钥解密以及使用 ffmpeg 拼接成完整的、可在本地播放的 MP4 文件。


##  环境要求

- **Node.js**: 18+ 及 npm
- **ffmpeg**: 必须安装并在系统的环境变量 `PATH` 中配置好

##  安装与启动

最简单的启动方式（首次运行会自动拉取 Electron 环境）：
```bash
npm start
```

如果你希望以后启动更快，可以先在本地安装 Electron：
```bash
npm i -D electron
npm start
```

##  使用流程

###  视频流演示

完整操作演示（从登录到下载全流程）：

https://github.com/user-attachments/assets/4d3ddf00-6bda-4812-a4b0-ddc0f65cc5f5

### 场景一：标准课程/专栏批量下载（全自动模式）

对于绝大多数**未经过重度定制**的标准小鹅通课程页面，本工具支持一键化提取整个列表：

**1. 输入课程地址：**
在输入框中粘贴您的小鹅通课程/专栏地址链接。

**2. 登录账号：**
点击 **" 登录"** 按钮，在弹出的窗口中点击「我的」，使用微信扫码完成登录。登录成功后系统会自动获取您的用户信息。

**3. 确认登录状态：**
关闭登录窗口，返回主应用界面。此时界面会显示"已登录"状态，说明 Cookie 和用户凭证已成功保存。

**4. 开始解析课程：**
点击 **" 开始解析"** 按钮，系统会自动打开内部解析窗口。**这个过程需要一些时间，请耐心等待，不要进行任何额外操作（也不要关闭弹出的窗口）。** 系统会自动完成以下工作：
   - 自动嗅探获取您的凭证信息（如 `USER_ID`）
   - 自动滚动加载完整的课程目录
   - 逐一进入每个视频节点，提取真实的 M3U8 视频地址

**5. 批量下载：**
所有视频地址解析完毕后，解析窗口会自动关闭，视频列表会自动填入下方的下载表格中。确认好导出目录（Output root），点击 **"Start"** 按钮即可开始全自动批量下载！

### 场景二：重度定制化商铺（手动单集下载模式）

手动抓包操作演示：

https://github.com/user-attachments/assets/3c0af638-052e-4dce-9736-73a393697d71

小鹅通允许部分商家深度定制店铺主页（链接常带有 `decorate/homepage` 等字样）。针对这类非标准界面的视频，自动化爬虫不一定能探测出播放列表，因此你需要通过**抓包的方式逐一手动下载**：

1. **打开目标视频：** 在电脑端浏览器中点进你需要下载的具体某一节课程的视频播放页面。
2. **唤出开发者工具：** 按下 `F12` 键打开开发者工具，并切换到 **网络（Network）** 面板。
3. **获取 userId：** 在网络面板筛选框中输入 `pushData`，点击出现的请求，切换到 **载荷（Payload）**，在列表中就可以找到你在该商铺对应的 `userId`。
4. **获取 m3u8 链接：** 将网络筛选框关键词改为 `m3u8`（此时可以点击一下视频的播放键），选中加载出的 m3u8 请求，点击 **标头（Headers）** ，里面显示的**请求 URL** 就是目标视频的解析地址。
5. **在软件中执行下载：** 拿到上述内容后，打开下载器，将获取的 `m3u8 地址` 和 `userId` 填入主界面对应的输入框（Title 标题处可自己重命名），点击 **Start** 即可。程序会自动跨越防盗链下载合并视频！

---

##  其他补充说明

- **输出目录**：每个视频会在您选定的 Output root 下，自动创建一个与课程同名的文件夹，最后的 MP4 也会保存在其中。
- **状态管理**：如果需要切换小鹅通账号，可以点击登录状态旁边的"清除登录"按钮。
- **不支持重度定制化主页**：小鹅通允许部分商家深度定制“店铺装修页面”（通常链接带有 `decorate/homepage` 等字样）。这类非标准界面存在各式各样的防刷机制和多层嵌套（例如带分页的层叠抽取等），本工具由于通用性考虑，**无法对其提供自动化提取支持**。对于这类定制化商铺，推荐寻找它的子级标准页面地址进行提取，或自行手动抓包获取；但**对于未深度定制过的小鹅通标准页面（普通专栏、图文音视等），依旧可以完美一键提取全部内容！**

##  赞助支持 (Buy me a coffee)

如果您觉得这个工具极大地节省了您的时间，或者对您很有帮助，欢迎打赏支持，您的支持是我继续维护的动力！

<div align="center">
  <table>
    <tr>
      <td align="center">
        <strong>微信支付</strong><br>
        <img src="https://raw.githubusercontent.com/Clearner1/xiaoetong-video-downloader/main/assets/weixinpay.png" width="250"/>
      </td>
      <td align="center">
        <strong>支付宝</strong><br>
        <img src="https://raw.githubusercontent.com/Clearner1/xiaoetong-video-downloader/main/assets/alipay.jpg" width="250"/>
      </td>
    </tr>
  </table>
</div>

---

##  合规与免责声明

本项目仅供个人技术研究和学习使用，请勿用于任何商业用途。使用本工具下载内容前提是：**您必须已经合法拥有或被授权访问该内容**。因滥用本工具造成的任何版权纠纷，由使用者自行承担责任。
