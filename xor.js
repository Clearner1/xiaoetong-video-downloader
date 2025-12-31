const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const https = require('https');

let defaultHeaders = {};

function buildDefaultHeaders(referer) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };
    if (referer) headers['Referer'] = referer;
    return headers;
}

function resolveRedirectUrl(baseUrl, location) {
    try {
        return new URL(location, baseUrl).toString();
    } catch (e) {
        return location;
    }
}

function httpGetBuffer(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { headers: defaultHeaders }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = resolveRedirectUrl(url, res.headers.location);
                resolve(httpGetBuffer(nextUrl));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
    });
}

function downloadToFile(url, savefilepath) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { headers: defaultHeaders }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = resolveRedirectUrl(url, res.headers.location);
                resolve(downloadToFile(nextUrl, savefilepath));
                return;
            }
            const fileStream = fs.createWriteStream(savefilepath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close(() => resolve('finish'));
            });
            fileStream.on('error', reject);
        });
        req.on('error', reject);
    });
}

/**
 * @description 检查路径是否存在，如果不存在，则创建它。
 * @param {String} dirPath - 需要检查或创建的路径。
 */
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {

        if (path.extname(dirPath)) {
            const dir = path.dirname(dirPath);
            ensureDirectoryExists(dir)

            fs.writeFileSync(dirPath, "")
            console.log(`创建文件：${dirPath}`);
        }
        else {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`创建目录：${dirPath}`);
        }
    } else {
        console.log(`已存在：${dirPath}`);
    }
}

/**
 * @description 获取m3u8文件内容 并保存
 * @param {URL} m3u8Url m3u8文件下载的完整URL
 * @param {String} fileDir m3u8文件保存的文件夹路径
 * @returns {String} m3u8文件内容
 */
async function getm3u8(m3u8Url, fileDir) {
    const data = await httpGetBuffer(m3u8Url);
    const content = data.toString('utf-8');
    fs.writeFileSync(path.join(__dirname, fileDir, `data.m3u8`), content, "utf-8")
    console.log(`已保存：${path.join(__dirname, fileDir, `data.m3u8`)}`)
    return content
}

/**
 * @description 根据m3u8内容，获取偏移量IV
 * @param {m3u8} m3u8Content 通过 getm3u8() 获取
 * @returns {Buffer} 偏移量 IV
 */
function getIV(m3u8Content) {
    const ivRegex = /#EXT-X-KEY:.*?IV=0x([0-9A-Fa-f]+)/;
    const match = m3u8Content.match(ivRegex);

    if (match) {
        const iv = match[1];
        console.log("Extracted IV:", iv);
        return Buffer.from(iv, 'hex')
    } else {
        console.log("IV not found");
        return Buffer.alloc(16, 0)
    }
}

/**
 * @description 获取所有TS文件的完整的URL地址
 * @param {m3u8} m3u8Content 通过 getm3u8() 获取
 * @param {URL} tsUrldemo 任意一个ts文件的下载地址
 * @returns {Array} 所有ts分片URL
 */
function getTSList(m3u8Content, tsUrldemo) {
    function parseUrl(url) {
        const urlObj = new URL(url);

        // 获取 base 部分
        const baseUrl = urlObj.origin;

        // 获取文件部分
        const filePath = urlObj.pathname;

        // 分离路径和文件名
        const pathSegments = filePath.split('/');
        const path = pathSegments.slice(0, -1).join('/');
        const fileName = pathSegments.slice(-1)[0];

        // 获取参数部分
        const queryParams = parseUri(urlObj.search).params;

        return {
            base: baseUrl,
            path: path,
            fileName: fileName,
            params: queryParams,
        };
    }
    function parseUri(str) {
        const [fileName, paramString] = str.split('?');

        // 初始化一个对象，用于存储参数键值对
        const params = {};

        // 如果存在参数部分
        if (paramString) {
            // 将参数字符串分割成键值对数组
            const paramPairs = paramString.split('&');

            // 遍历键值对数组，并将其解析为对象
            for (const pair of paramPairs) {
                if (pair == "") continue
                const [key, value] = pair.split('=');
                params[key] = value;
            }
        }

        return { fileName, params };
    }
    function objectToQueryString(obj) {
        // 将对象的键值对转换为查询字符串形式
        const queryString = Object.entries(obj).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
        return queryString;
    }

    let list = m3u8Content.match(/^.+\.ts.*/gm);
    let demoURLObj = parseUrl(tsUrldemo)

    for (let i = 0; i < list.length; i++) {
        const uri = list[i];
        let uriObj = parseUri(uri)

        let param = {}
        for (const key in demoURLObj.params) {
            param[key] = demoURLObj.params[key]
        }
        for (const key in uriObj.params) {
            param[key] = uriObj.params[key]
        }

        let newURL = demoURLObj.base + demoURLObj.path + '/' + uriObj.fileName + "?" + objectToQueryString(param)

        list[i] = newURL
    }

    return list
}

/**
 * @description 根据m3u8文件下载密钥
 * @param {m3u8} m3u8Content 通过 getm3u8() 获取
 * @param {String} userid 控制台打印 USERID 获取
 * @returns {Buffer} 密钥 key
 */
async function getkey(m3u8Content, userid) {

    const keyUri = m3u8Content.match(/#EXT-X-KEY:.*?\bURI="(.*?)"/)[1]
    let url = keyUri

    try {
        const data = await httpGetBuffer(url);
        if (data.length == 16)
            return data
        else
            throw "decode"

    } catch (error) {
        if (error === "decode") {
            url = keyUri + '&uid=' + userid
            const data = await httpGetBuffer(url);
            if (data.length == 16)
                return data
            else
                return new Error("key length not equal 16")
        }
        else
            return error
    }

}

/**
 * @description 获取 key ^ userid 之后的密钥
 * @param {Buffer} keyBuffer key的Buffer形式，可直接通过 getkey() 获取
 * @param {String} userid 控制台打印 USERID 获取
 * @returns {Buffer} key与userid异或后的密钥
 */
function xorKeys(keyBuffer, userid) {

    // 将密钥转换为数组
    const key1Array = keyBuffer;
    const key2Array = Array.from(userid);

    // 对每个字节进行异或操作
    const result = Buffer.alloc(key1Array.length);
    for (let i = 0; i < key1Array.length; i++) {
        result[i] = key1Array[i] ^ key2Array[i].charCodeAt(0);
    }

    return result;
}

/**
 * @description 下载并保存ts文件
 * @param {URL} fileurl ts文件下载的完整路径，可通过 getTSList() 获取
 * @param {String} savefilepath ts文件下载后保存的路径
 * @returns {Promise}
 */
async function downloadTS(fileurl, savefilepath) {

    console.log(`开始下载：${fileurl}`);
    const result = await downloadToFile(fileurl, savefilepath);
    console.log('文件下载完成');
    return result;


}

/**
 * @description 解密ts文件
 * @param {Buffer} secret_key 解密密钥
 * @param {Buffer} IV 偏移量
 * @param {String} rawfilepath 未解密的 ts 文件路径
 * @param {String} savefilepath 解密后 ts 文件保存的路径
 */
function decode(secret_key, IV, rawfilepath, savefilepath) {

    // 读取密文的TS分片
    const encryptedFilePath = rawfilepath;
    let encryptedData = fs.readFileSync(encryptedFilePath);

    // 创建解密器
    const decipher = crypto.createDecipheriv('aes-128-cbc', secret_key, IV);

    // 解密数据
    let decryptedData;
    if (IV.toString('hex') === "00000000000000000000000000000000")
        decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    else
        decryptedData = decipher.update(encryptedData);


    // 写入解密后的数据
    const decryptedFilePath = savefilepath;
    fs.writeFileSync(decryptedFilePath, decryptedData);

    console.log('解密完成，输出文件:', decryptedFilePath);

}

function decryptBuffer(secret_key, IV, rawfilepath) {
    const encryptedData = fs.readFileSync(rawfilepath);
    const decipher = crypto.createDecipheriv('aes-128-cbc', secret_key, IV);
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

function selectBetterCandidate(a, b) {
    if (a && b) return a.score >= b.score ? a : b;
    return a || b;
}

function writeDecrypted(buffer, savefilepath) {
    fs.writeFileSync(savefilepath, buffer);
}

async function main() {

    let fileDir = "testDir"
    let userid = `u_5ea8d7151b505_qlN2MwCR54`
    let m3u8Url = "https://c-vod-hw-k.xiaoeknow.com/asset/695935912cb78710e78e750fce6523f9/1e9774f4cb0ad1bee8f61c183ffcb24f.m3u8?sign=e9fecb43bdcaf109c7b1a6b9558da34f&t=6955401f&us=aBllJjGKLj&whref=*.xiaoe-tech.com,*.xiaoeknow.com,*.xeknow.com,*.citv.cn,*.xiaoecloud.com,*.xe-live.com,*.xiaoe-live.com,*.xiaoeeye.com,*.xiaoedata.com,*.e-quanzi.com,*.baomihua.com,*.pomoho.com,*.hainanzhenjun.com"
    let tsUrldemo = "https://c-vod-hw-k.xiaoeknow.com/asset/695935912cb78710e78e750fce6523f9/8000007_5UnZ9CxSWCqL_0.ts?us=aBllJjGKLj&whref=*.xiaoe-tech.com,*.xiaoeknow.com,*.xeknow.com,*.citv.cn,*.xiaoecloud.com,*.xe-live.com,*.xiaoe-live.com,*.xiaoeeye.com,*.xiaoedata.com,*.e-quanzi.com,*.baomihua.com,*.pomoho.com,*.hainanzhenjun.com&t=6955401f&sign=e9fecb43bdcaf109c7b1a6b9558da34f"
    let referer = "https://appjswxjuth8556.h5.xet.citv.cn/p/course/video/v_677802e0e4b023c058c2b553?product_id=p_6777cc18e4b0694c3c85e734"
    defaultHeaders = buildDefaultHeaders(referer)

    // init
    let downloadFilePath = path.join(__dirname, fileDir, 'download')
    let decodeFilePath = path.join(__dirname, fileDir, 'decode')
    ensureDirectoryExists(downloadFilePath)
    ensureDirectoryExists(decodeFilePath)
    if (fs.existsSync(path.join(decodeFilePath, "filelist.txt"))) fs.rmSync(path.join(decodeFilePath, "filelist.txt"))


    // 获取m3u8文件
    let m3u8 = await getm3u8(m3u8Url, fileDir)

    // 获取偏移量
    let IV = getIV(m3u8)

    // 获取所有ts文件url
    const tsUrls = getTSList(m3u8, tsUrldemo)

    // 获取解密的密钥
    let rawKey = null;
    let xorKey = null;
    let keyMode = 'xor';

    async function refreshKey() {
        const newKey = await getkey(m3u8, userid);
        if (newKey instanceof Error) {
            throw newKey;
        }
        rawKey = newKey;
        xorKey = xorKeys(newKey, userid);
    }

    await refreshKey();
    console.log('解密后的密钥:', xorKey);

    for (let i = 0; i < tsUrls.length; i++) {
        const url = tsUrls[i];
        const filename = `${i}_${url.match(/\/([^\/]+\.ts)(\?|$)/)[1]}`;
        await downloadTS(url, path.join(downloadFilePath, filename))

        let dname = `${i}.ts`
        try {
            const rawPath = path.join(downloadFilePath, filename);
            const outPath = path.join(decodeFilePath, dname);
            const tryDecrypt = (mode) => {
                const key = mode === 'xor' ? xorKey : rawKey;
                if (!key) return null;
                try {
                    const data = decryptBuffer(key, IV, rawPath);
                    const normalized = normalizeTs(data);
                    if (!normalized) return null;
                    return { mode, buffer: normalized.buffer, score: normalized.score };
                } catch (e) {
                    return null;
                }
            };

            let candidate = selectBetterCandidate(
                tryDecrypt(keyMode),
                tryDecrypt(keyMode === 'xor' ? 'raw' : 'xor')
            );

            if (!candidate) {
                await refreshKey();
                candidate = selectBetterCandidate(
                    tryDecrypt('xor'),
                    tryDecrypt('raw')
                );
            }

            if (!candidate) {
                await refreshKey();
                candidate = selectBetterCandidate(
                    tryDecrypt('xor'),
                    tryDecrypt('raw')
                );
            }

            if (!candidate) {
                console.log(`警告：分片 ${dname} 可能未正确解密`);
                const fallbackKey = keyMode === 'xor' ? xorKey : rawKey;
                const fallbackData = decryptBuffer(fallbackKey, IV, rawPath);
                writeDecrypted(fallbackData, outPath);
            } else {
                keyMode = candidate.mode;
                writeDecrypted(candidate.buffer, outPath);
            }
            console.log('解密完成，输出文件:', outPath);
        } catch (error) {
            if (error.code == "ERR_OSSL_EVP_BAD_DECRYPT") {
                keyMode = 'raw';
                await decode(rawKey, IV, path.join(downloadFilePath, filename), path.join(decodeFilePath, dname))
            }
            else if (error.code == "ERR_OSSL_EVP_WRONG_FINAL_BLOCK_LENGTH") {
                console.log(error);
                break;
                // let u8 = Buffer.from(decryptedKey, 'utf8');
                // IV = Buffer.alloc(16, 0)
                // await decode(u8, IV, path.join(downloadFilePath, filename), path.join(decodeFilePath, filename))
            }
            else {
                console.log(error);
                break;
            }
        }

        let str = `file '${dname}'\n`
        fs.appendFileSync(path.join(decodeFilePath, "filelist.txt"), str, "utf-8")
    }

    console.log('finish')
}

main()
