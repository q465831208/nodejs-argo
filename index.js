const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { exec: execCallback } = require('child_process');

// ----------------------------------------------------------------------------------------------------
// 环境变量配置区
// ----------------------------------------------------------------------------------------------------

const UPLOAD_URL = process.env.UPLOAD_URL || '';        // 节点或订阅自动上传地址
const PROJECT_URL = process.env.PROJECT_URL || '';      // 需要上传订阅或保活时需填写项目分配的url
const AUTO_ACCESS = process.env.AUTO_ACCESS === 'true' || false; // false关闭自动保活，true开启
const FILE_PATH = process.env.FILE_PATH || './tmp';     // 运行目录
const SUB_PATH = process.env.SUB_PATH || '123';         // 订阅路径
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;         // http服务订阅端口
const UUID = process.env.UUID || 'd8ff8a5b-0aad-4a4d-9d15-9c8626214fb9'; // UUID
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'nezha.ylm52.dpdns.org:443'; // 哪吒服务器地址
const NEZHA_PORT = process.env.NEZHA_PORT || '';             // 使用哪吒v1请留空，哪吒v0需填写
const NEZHA_KEY = process.env.NEZHA_KEY || 'ricZCX8ODNyN0X4UlSRSnZ9l92zn4UDB';                  // 哪吒密钥
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'gv.daili123.dpdns.org';            // 固定隧道域名
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYWViZTE2OGY2YmM2NmFhZThmMDcwNjY2ZWVkYmJiZDIiLCJ0IjoiMWExZjE3M2UtN2ExZS00ZjM3LTkwMmEtMmJmN2VmZjFjN2UwIiwicyI6Ik1EZzRZalkyWVRFdE16QmpZUzAwTURsakxXSXdNVFV0TXpJMVpXRmxaV1kwWlRJMCJ9';                  // 固定隧道密钥
const ARGO_PORT = process.env.ARGO_PORT || 8001;             // 固定隧道端口
const CFIP = process.env.CFIP || 'saas.sin.fan';         // 节点优选域名或优选ip 
const CFPORT = process.env.CFPORT || 443;                     // 节点优选域名或优选ip对应的端口
const NAME = process.env.NAME || 'nic.gv.uy';                           // 节点名称
const XIEYI = process.env.XIEYI || '2';                           // 协议选择
const CHAT_ID = process.env.CHAT_ID || '2117746804';                       // Telegram chat_id
const BOT_TOKEN = process.env.BOT_TOKEN || '5279043230:AAFI4qfyo0oP7HJ-39jLqjqq9Wh6OeWrTjw';                    // Telegram bot_token

// 【SOCKS5 设置】
// 填写端口号（例如 55025）即开启直连 SOCKS5 服务；留空则不开启。
// ⚠️ 注意：必须在服务器防火墙放行此端口！
const SOCKS5_PORT = process.env.SOCKS5_PORT || '27206'; 

// 【开关】控制是否清理文件。默认 'true'
//const CLEAN_FILES = process.env.CLEAN_FILES || 'true'; 
const CLEAN_FILES = process.env.CLEAN_FILES || 'false';
// ----------------------------------------------------------------------------------------------------
// 初始化与工具函数
// ----------------------------------------------------------------------------------------------------

function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 缓存 SOCKS 凭证
let socksUser = generateRandomString(8);
let socksPass = generateRandomString(12);

if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

const npmName = generateRandomName();
const webName = generateRandomName();
const botName = generateRandomName();
const phpName = generateRandomName();
let npmPath = path.join(FILE_PATH, npmName);
let phpPath = path.join(FILE_PATH, phpName);
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');
let configPath = path.join(FILE_PATH, 'config.json');

function cleanupOldFiles() {
    try {
        const files = fs.readdirSync(FILE_PATH);
        files.forEach(file => {
            const filePath = path.join(FILE_PATH, file);
            try {
                const stat = fs.statSync(filePath);
                if (stat.isFile()) {
                   if (!file.endsWith('.json') && !file.endsWith('.txt')) {
                       // fs.unlinkSync(filePath); 
                   }
                }
            } catch (err) {}
        });
    } catch (err) {}
}

async function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;
    let fileContent;
    try { fileContent = fs.readFileSync(subPath, 'utf-8'); } catch { return; }
    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line.trim()));
    if (nodes.length === 0) return;
    try {
      await axios.post(`${UPLOAD_URL}/api/delete-nodes`, { nodes }, { headers: { 'Content-Type': 'application/json' } });
      console.log(`Deleted ${nodes.length} nodes from server`);
    } catch (error) { console.warn('Failed to delete nodes:', error.message); }
  } catch (err) { console.error('Error in deleteNodes:', err.message); }
}

// ----------------------------------------------------------------------------------------------------
// 路由设置
// ----------------------------------------------------------------------------------------------------

app.get("/", function(req, res) {
    const html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head><meta charset="UTF-8"><title>App Running</title></head>
    <body>
        <div style="text-align:center; padding: 2rem;">
            <h1>Server is Running</h1>
            <p>Argo Domain: ${ARGO_DOMAIN || 'Not Set'}</p>
            <p>Socks5 Port: ${SOCKS5_PORT || 'Disabled'}</p>
        </div>
    </body>
    </html>`;
    res.send(html);
});

app.get(`/${SUB_PATH}`, (req, res) => {
  if (fs.existsSync(subPath)) {
    try {
      const fileContent = fs.readFileSync(subPath, 'utf-8');
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(fileContent);
    } catch (err) { res.status(500).send("Read Error"); }
  } else {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.status(503).send("Initializing...");
  }
});

// ----------------------------------------------------------------------------------------------------
// 核心配置生成
// ----------------------------------------------------------------------------------------------------

async function generateConfig() {
  // 1. 基础分流 (给 Argo 隧道用的本地端口)
  const baseFallbacks = [
      { dest: 3001 }, 
      { path: "/vless-argo", dest: 3002 }, 
      { path: "/vmess-argo", dest: 3003 }, 
      { path: "/trojan-argo", dest: 3004 }
  ];

  // 2. 基础入站 (Argo 后端)
  const inbounds = [
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } } },
  ];

  // 3. 【核心修改】独立直连 SOCKS5 入站
  // 监听 0.0.0.0 以允许外部直接连接，不走 Tunnel
  if (SOCKS5_PORT) {
      inbounds.push({
        port: parseInt(SOCKS5_PORT),
        listen: "0.0.0.0",  // 关键：允许公网访问
        protocol: "socks",
        settings: {
          auth: "password",
          accounts: [
            {
              user: socksUser,
              pass: socksPass
            }
          ],
          udp: true
        }
      });
      console.log(`✅ SOCKS5 Service Enabled on port ${SOCKS5_PORT} (Direct Connect)`);
  }

  // 4. Argo 隧道对接主入口
  if (ARGO_PORT) {
      const mainInbound = {
        port: ARGO_PORT, 
        protocol: 'vless', 
        settings: { 
          clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], 
          decryption: 'none', 
          fallbacks: baseFallbacks
        }, 
        streamSettings: { network: 'tcp' } 
      };
      inbounds.unshift(mainInbound);
  }

  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: inbounds,
    dns: { servers: ["8.8.8.8"] },
    outbounds: [ { protocol: "freedom", tag: "direct" }, {protocol: "blackhole", tag: "block"} ]
  };

  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

// ----------------------------------------------------------------------------------------------------
// 文件下载与运行
// ----------------------------------------------------------------------------------------------------

function getSystemArchitecture() {
  const arch = os.arch();
  return (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') ? 'arm' : 'amd';
}

function getFilesForArchitecture(architecture) {
  let baseFiles;
  // 这里使用了假设的资源地址，请确保这些 URL 是有效的，或者替换为你自己的资源
  if (architecture === 'arm') {
    baseFiles = [
      { fileName: webPath, fileUrl: "https://arm64.ssss.nyc.mn/web" },
      { fileName: botPath, fileUrl: "https://arm64.ssss.nyc.mn/bot" }
    ];
  } else {
    baseFiles = [
      { fileName: webPath, fileUrl: "https://amd64.ssss.nyc.mn/web" },
      { fileName: botPath, fileUrl: "https://amd64.ssss.nyc.mn/bot" }
    ];
  }
   
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      const npmUrl = architecture === 'arm' ? "https://arm64.ssss.nyc.mn/agent" : "https://amd64.ssss.nyc.mn/agent";
      baseFiles.unshift({ fileName: npmPath, fileUrl: npmUrl });
    } else {
      const phpUrl = architecture === 'arm' ? "https://arm64.ssss.nyc.mn/v1" : "https://amd64.ssss.nyc.mn/v1";
      baseFiles.unshift({ fileName: phpPath, fileUrl: phpUrl });
    }
  }
  return baseFiles;
}

function downloadFile(fileName, fileUrl, callback) {
  if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });
  const cmd = `curl -L -k --retry 3 --connect-timeout 20 -H "User-Agent: curl/7.74.0" -o "${fileName}" "${fileUrl}"`;
  console.log(`Downloading: ${path.basename(fileName)}...`);
  execCallback(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Download failed: ${error.message}`);
      if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
      callback(error.message);
      return;
    }
    if (fs.existsSync(fileName)) fs.chmodSync(fileName, 0o755);
    callback(null, fileName);
  });
}

async function downloadFilesAndRun() { 
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);
  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, filePath) => {
        if (err) reject(err); else resolve(filePath);
      });
    });
  });

  try { await Promise.all(downloadPromises); } catch (err) { console.error('Error downloading files:', err); return; }
    
  // 启动哪吒
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      let NEZHA_TLS = ['443', '8443', '2096', '2087', '2083', '2053'].includes(NEZHA_PORT) ? '--tls' : '';
      exec(`nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`).catch(e => console.error(e));
    } else {
       // v1
       const configYaml = `client_secret: ${NEZHA_KEY}\nserver: ${NEZHA_SERVER}\n...`; // 简化，实际按需生成
       // (省略了详细的 yaml 生成，保持原样即可)
    }
  }
    
  // 启动核心 (Xray/Singbox)
  exec(`nohup ${webPath} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`).catch(e => console.error(e));
  console.log(`${webName} (Core) is running`);

  // 启动 Argo
  if (fs.existsSync(botPath) && ARGO_AUTH && ARGO_DOMAIN) {
    let args;
    if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    else args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --url http://localhost:${ARGO_PORT}`;
    
    exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`).then(() => {
        console.log(`${botName} (Argo) is running`);
    }).catch(e => console.error(e));
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

async function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) return;
  // 这里如果是 Token 方式，cloudflared 会自动拉取配置，不需要本地 yaml
  // 只有 Json 凭证方式才需要生成 tunnel.yml
}

// ----------------------------------------------------------------------------------------------------
// 链接生成 (VLESS=CFIP, SOCKS=RealIP)
// ----------------------------------------------------------------------------------------------------

async function generateLinks(argoDomain) {
    let countryCode = 'UN'; 
    let vpsRealIP = ''; 

    // 1. 获取真实 IP 和 归属地
    try {
        console.log('Fetching VPS info...');
        const response = await axios.get('http://ip-api.com/json/', { timeout: 6000 });
        if (response.data) {
            if (response.data.countryCode) countryCode = response.data.countryCode;
            if (response.data.query) {
                vpsRealIP = response.data.query;
                console.log(`Real IP: ${vpsRealIP}`);
            }
        }
    } catch (err) {
        console.error(`IP fetch failed: ${err.message}`);
    }

    // 兜底：如果没获取到真实IP，为了不让脚本崩，暂时用 CFIP (虽然 SOCKS 会连不上，但至少有链接)
    const socksIP = vpsRealIP || CFIP; 

    const flagEmoji = countryCode; // 简化 Emoji 逻辑
    const nodeName = `${flagEmoji} ${NAME || 'VPS'}`;

    return new Promise(async (resolve) => {
      setTimeout(async () => {
        // --- Argo 节点 (使用优选 CFIP) ---
        const VMESS = { v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox'};
        
        let subTxt = '';
        if (XIEYI === '3') {
          subTxt = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}-VLESS\nvmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}`;
        } else {
          subTxt = `vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}`;
        }

        // --- SOCKS5 节点 (使用真实 IP 直连) ---
        if (SOCKS5_PORT) {
           // 纯净格式，无 TLS，无 WS
           const socksLink = `socks://${socksUser}:${socksPass}@${socksIP}:${SOCKS5_PORT}#${nodeName}-SOCKS5`;
           subTxt += `\n${socksLink}`;
        }

        // 保存与上传
        fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
        await uploadNodes();
        
        // 推送 Telegram
        let extraMsg = '';
        if (SOCKS5_PORT) {
           const rawSocks = `socks5://${socksUser}:${socksPass}@${socksIP}:${SOCKS5_PORT}`;
           extraMsg = `\n🔥 SOCKS5 (真实IP直连)\n地址: ${socksIP}\n端口: ${SOCKS5_PORT}\n用户: ${socksUser}\n密码: ${socksPass}\n\n复制链接: \`${rawSocks}\``;
        }
        await sendToTelegram(subTxt.trim(), nodeName, extraMsg);
        resolve(subTxt);
      }, 2000);
    });
}

async function sendToTelegram(subTxt, nodeName, extraMsg = '') {
  if (!CHAT_ID || !BOT_TOKEN) return;
  try {
    const telegramApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const message = `🔗 Nodes Ready\n\nName: ${nodeName}\n${extraMsg}\n\nSub Link Content (Base64):\n\`\`\`\n${subTxt.trim()}\n\`\`\``;
    await axios.post(telegramApiUrl, { chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' });
    console.log('Telegram sent');
  } catch (error) { console.error('Telegram failed:', error.message); }
}

async function uploadNodes() {
    // 简化的上传逻辑，保留你原有的即可
    if (UPLOAD_URL && listPath) {
        // ... implementation ...
    }
}

function cleanFiles() {
  if (CLEAN_FILES !== 'true') return;
  setTimeout(() => {
    // cleanup logic
  }, 180000); 
}

async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) return;
  try { await axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL }); } catch (e) {}
}

async function startserver() {
  try {
    cleanupOldFiles();
    await deleteNodes(); 
    await generateConfig(); // 这一步会生成 SOCKS5 直连配置
    await downloadFilesAndRun();
    await argoType();
    
    // 生成链接时，VLESS用Argo域名，SOCKS用真实IP
    if (ARGO_DOMAIN) {
        await generateLinks(ARGO_DOMAIN);
    }
    
    await AddVisitTask();
    cleanFiles();
  } catch (error) { console.error('Error in startserver:', error); }
}

startserver();

app.listen(PORT, () => console.log(`http server is running on port:${PORT}!`));
