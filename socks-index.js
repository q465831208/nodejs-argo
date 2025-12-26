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
const UUID = process.env.UUID || '1e20a528-5954-4345-bd1a-8d02c77ff418'; // UUID
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'nezha.ylm52.dpdns.org:443'; // 哪吒服务器地址
const NEZHA_PORT = process.env.NEZHA_PORT || '';             // 使用哪吒v1请留空，哪吒v0需填写
const NEZHA_KEY = process.env.NEZHA_KEY || 'ricZCX8ODNyN0X4UlSRSnZ9l92zn4UDB';                  // 哪吒密钥
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'chr.ooocc.dpdns.org';            // 固定隧道域名
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTIyMGI2MDFlMmJlYWE0ODQzNWRkZjAyMjllYjg1YmUiLCJ0IjoiODlkMzQ0MWMtMmMyZi00ZTg1LTg0M2EtZDZkYzIzYzY2NjM1IiwicyI6Ik5tVmhaV1F3TWpNdE1HSXhOQzAwTWpabUxUazVOMll0TUdKak5qWXlORGhrWWpBMiJ9';                  // 固定隧道密钥
const ARGO_PORT = process.env.ARGO_PORT || 8001;             // 固定隧道端口
const CFIP = process.env.CFIP || 'saas.sin.fan';         // 节点优选域名或优选ip 
const CFPORT = process.env.CFPORT || 443;                     // 节点优选域名或优选ip对应的端口
const NAME = process.env.NAME || 'choreo';                           // 节点名称
const XIEYI = process.env.XIEYI || '2';                           // 协议选择
const CHAT_ID = process.env.CHAT_ID || '2117746804';                       // Telegram chat_id
const BOT_TOKEN = process.env.BOT_TOKEN || '5279043230:AAFI4qfyo0oP7HJ-39jLqjqq9Wh6OeWrTjw';                    // Telegram bot_token

// 【SOCKS5 设置】
// 填写端口号（例如 3005）即开启 SOCKS5 服务；留空则不开启。
const SOCKS5_PORT = process.env.SOCKS5_PORT || ''; 

// 【开关】控制是否清理文件。默认 'true'
const CLEAN_FILES = process.env.CLEAN_FILES || 'true'; 

// ----------------------------------------------------------------------------------------------------
// 初始化与工具函数
// ----------------------------------------------------------------------------------------------------

// 生成指定长度的随机字符串（用于 SOCKS 账号密码）
function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 缓存生成的 SOCKS 凭证，防止重启后变化（如果脚本常驻）
let socksUser = generateRandomString(8);
let socksPass = generateRandomString(12);

// 创建运行目录
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
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ylm's Workspace</title>
    <style>
        :root { --bg-color: #0f172a; --text-color: #e2e8f0; --accent-color: #38bdf8; }
        body { margin: 0; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: var(--bg-color); color: var(--text-color); display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
        .container { text-align: center; padding: 2rem; animation: fadeIn 1s ease-in-out; }
        h1 { font-size: 3rem; margin-bottom: 0.5rem; letter-spacing: -0.05em; background: linear-gradient(to right, #38bdf8, #818cf8); -webkit-background-clip: text; color: transparent; }
        p { font-size: 1.2rem; color: #94a3b8; margin-bottom: 2rem; }
        .btn-group { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
        .btn { padding: 0.8rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.1); }
        .btn-primary { background-color: var(--accent-color); color: #0f172a; border: none; }
        .btn-primary:hover { background-color: #0ea5e9; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3); }
        .btn-secondary { background-color: rgba(255,255,255,0.05); color: var(--text-color); }
        .btn-secondary:hover { background-color: rgba(255,255,255,0.1); }
        .footer { position: absolute; bottom: 20px; font-size: 0.8rem; color: #475569; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="container">
        <h1>Hello, I'm Ylm.</h1>
        <p>Full Stack Developer & Cloud Enthusiast</p>
        <div class="btn-group">
            <a href="https://blog.ylm.pp.ua" target="_blank" class="btn btn-primary">访问我的博客</a>
            <a href="mailto:miny30930@gmail.com" class="btn btn-secondary">Email Me</a>
            <a href="https://t.me/lschat_bot" target="_blank" class="btn btn-secondary">Telegram</a>
        </div>
    </div>
    <div class="footer">Server is running normally | Node.js Environment</div>
</body>
</html>
  `;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.get(`/${SUB_PATH}`, (req, res) => {
  if (fs.existsSync(subPath)) {
    try {
      const fileContent = fs.readFileSync(subPath, 'utf-8');
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(fileContent);
    } catch (err) { res.status(500).send("读取订阅文件出错"); }
  } else {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.status(503).send("⏳ 节点正在初始化中，请约 1 分钟后再刷新此页面...");
  }
});

// 【核心修改】动态生成配置文件
async function generateConfig() {
  // 1. 基础分流规则 (Fallback)
  const baseFallbacks = [
      { dest: 3001 }, 
      { path: "/vless-argo", dest: 3002 }, 
      { path: "/vmess-argo", dest: 3003 }, 
      { path: "/trojan-argo", dest: 3004 }
  ];

  // 2. 基础入站列表 (Inbounds)
  const inbounds = [
      // 原有节点配置 (3001-3004)
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
  ];

  // 3. 判断是否开启 SOCKS5
  if (SOCKS5_PORT) {
      // (A) 向主入口添加分流规则
      baseFallbacks.push({ path: "/socks", dest: parseInt(SOCKS5_PORT) });
      
      // (B) 添加入站配置
      inbounds.push({
        port: parseInt(SOCKS5_PORT),
        listen: "127.0.0.1",
        protocol: "socks",
        settings: {
          auth: "password", // 开启密码认证
          accounts: [
            {
              user: socksUser, // 使用生成的随机用户名
              pass: socksPass  // 使用生成的随机密码
            }
          ],
          udp: true,
          userLevel: 0
        },
        streamSettings: {
          network: "ws",
          security: "none",
          wsSettings: { path: "/socks" }
        },
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false }
      });

      console.log(`\n=============================================`);
      console.log(`✅ SOCKS5 Proxy Enabled`);
      console.log(`Port: ${SOCKS5_PORT}`);
      console.log(`Path: /socks`);
      console.log(`User: ${socksUser}`);
      console.log(`Pass: ${socksPass}`);
      console.log(`=============================================\n`);
  } else {
      console.log(`\n⛔ SOCKS5 PORT not set. SOCKS5 service skipped.\n`);
  }

  // 4. 构建主入口 (Argo 隧道对接端口)
  const mainInbound = {
    port: ARGO_PORT, 
    protocol: 'vless', 
    settings: { 
      clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], 
      decryption: 'none', 
      fallbacks: baseFallbacks // 动态 Fallback
    }, 
    streamSettings: { network: 'tcp' } 
  };
  
  // 将主入口放到数组最前面
  inbounds.unshift(mainInbound);

  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: inbounds,
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [ { protocol: "freedom", tag: "direct" }, {protocol: "blackhole", tag: "block"} ]
  };

  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

function getSystemArchitecture() {
  const arch = os.arch();
  return (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') ? 'arm' : 'amd';
}

function downloadFile(fileName, fileUrl, callback) {
  if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });
  const cmd = `curl -L -k --retry 3 --connect-timeout 20 -H "User-Agent: curl/7.74.0" -o "${fileName}" "${fileUrl}"`;
  console.log(`正在下载 (Using curl): ${path.basename(fileName)} ...`);
  execCallback(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ 下载失败: ${error.message}`);
      if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
      callback(error.message);
      return;
    }
    try {
        if (fs.existsSync(fileName)) fs.chmodSync(fileName, 0o755);
        const stats = fs.statSync(fileName);
        if (stats.size < 10000) { 
             console.error(`❌ 文件过小 (${stats.size})，可能被拦截或源失效`);
             fs.unlinkSync(fileName);
             callback("File too small");
             return;
        }
    } catch(e) { callback(e.message); return; }
    console.log(`✅ 下载成功: ${path.basename(fileName)}`);
    callback(null, fileName);
  });
}

async function downloadFilesAndRun() { 
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);
  if (filesToDownload.length === 0) { console.log(`Can't find a file for the current architecture`); return; }
  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, filePath) => {
        if (err) reject(err); else resolve(filePath);
      });
    });
  });

  try { await Promise.all(downloadPromises); } catch (err) { console.error('Error downloading files:', err); return; }
    
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      const npmUrl = architecture === 'arm' 
        ? "https://arm64.ssss.nyc.mn/agent"
        : "https://amd64.ssss.nyc.mn/agent";
      filesToDownload.unshift({ fileName: npmPath, fileUrl: npmUrl }); // Re-add for logic consistency, though downloaded above
      
      let NEZHA_TLS = ['443', '8443', '2096', '2087', '2083', '2053'].includes(NEZHA_PORT) ? '--tls' : '';
      exec(`nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`).catch(e => console.error(e));
      console.log(`${npmName} is running`);
    } else {
        // v0 agent logic
       // ... existing logic handled by download promises above, just running here
       const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
       const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
       const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
       const configYaml = `client_secret: ${NEZHA_KEY}\ndebug: false\ndisable_auto_update: true\ndisable_command_execute: false\ndisable_force_update: true\ndisable_nat: false\ndisable_send_query: false\ngpu: false\ninsecure_tls: true\nip_report_period: 1800\nreport_delay: 4\nserver: ${NEZHA_SERVER}\nskip_connection_count: true\nskip_procs_count: true\ntemperature: false\ntls: ${nezhatls}\nuse_gitee_to_upgrade: false\nuse_ipv6_country_code: false\nuuid: ${UUID}`;
       fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
       exec(`nohup ${phpPath} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`).catch(e => console.error(e));
       console.log(`${phpName} is running`);
    }
  } else {
      console.log('NEZHA variable is empty, skip running');
  }
    
  exec(`nohup ${webPath} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`).catch(e => console.error(e));
  console.log(`${webName} is running`);

  if (fs.existsSync(botPath)) {
    let args;
    if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    else if (ARGO_AUTH.match(/TunnelSecret/)) args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`;
    else args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
      
    exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`).then(() => {
        console.log(`${botName} is running`);
    }).catch(e => console.error(e));
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) return;
  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `tunnel: ${ARGO_AUTH.split('"')[11]}\ncredentials-file: ${path.join(FILE_PATH, 'tunnel.json')}\nprotocol: http2\ningress:\n  - hostname: ${ARGO_DOMAIN}\n    service: http://localhost:${ARGO_PORT}\n    originRequest:\n      noTLSVerify: true\n  - service: http_status:404`;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  }
}
argoType();

async function extractDomains() {
  if (ARGO_AUTH && ARGO_DOMAIN) {
    console.log('ARGO_DOMAIN:', ARGO_DOMAIN);
    await generateLinks(ARGO_DOMAIN);
  }
}

function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode === 'UN') return '';
    const base = 0x1F1E6; 
    try { return String.fromCodePoint(...countryCode.toUpperCase().split('').map(char => base + char.charCodeAt(0) - 'A'.charCodeAt(0))); } catch (e) { return ''; }
}

const countryMap = {
  CN:'中国',HK:'中国香港',MO:'中国澳门',TW:'中国台湾',JP:'日本',KR:'韩国',SG:'新加坡',MY:'马来西亚',TH:'泰国',VN:'越南',PH:'菲律宾',ID:'印度尼西亚',IN:'印度',
  US:'美国',CA:'加拿大',GB:'英国',DE:'德国',FR:'法国',NL:'荷兰',RU:'俄罗斯',AU:'澳大利亚',NZ:'新西兰',
  ZA:'南非',BR:'巴西',UN:'未知地区' 
};

function getCountryName(code) {
  return countryMap[code] || code || '未知地区'; 
}

async function generateLinks(argoDomain) {
    let countryCode = 'UN'; 
    try {
        console.log('正在获取 IP 归属地信息 (via ip-api)...');
        const response = await axios.get('http://ip-api.com/json/', { timeout: 6000 });
        if (response.data && response.data.countryCode) {
            countryCode = response.data.countryCode;
            console.log(`获取成功: ${countryCode}`);
        } else {
            console.log('IP-API 返回异常');
        }
    } catch (err) {
        console.error(`IP-API 获取失败: ${err.message}`);
        try {
             const httpsAgent = new (require('https').Agent)({ rejectUnauthorized: false });
             const response = await axios.get('https://speed.cloudflare.com/meta', { timeout: 5000, httpsAgent: httpsAgent });
             if (response.data && response.data.country) countryCode = response.data.country;
        } catch(e) {}
    }

    const flagEmoji = getFlagEmoji(countryCode);
    const countryName = getCountryName(countryCode);
    const baseNodeName = NAME ? `${NAME}-${countryName}` : countryName;
    const nodeName = `${flagEmoji} ${baseNodeName}`.trim();

    return new Promise(async (resolve) => {
      setTimeout(async () => {
        const VMESS = { v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox'};
        let subTxt = '';
        if (XIEYI === '3') {
          subTxt = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}-VLESS\nvmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}\ntrojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}-TROJAN`;
        } else if (XIEYI === '2') {
          subTxt = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}-VLESS\nvmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}`;
        } else {
          subTxt = `vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}`;
        }

        console.log(Buffer.from(subTxt).toString('base64'));
        fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
        console.log(`${FILE_PATH}/sub.txt saved successfully`);
          
        await uploadNodes();
        // 传递socks信息给TG推送（如果开启的话）
        let extraMsg = '';
        if (SOCKS5_PORT) {
           extraMsg = `\n🔥 SOCKS5 已开启\n端口: 443 (WS Path: /socks)\n用户: ${socksUser}\n密码: ${socksPass}`;
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
    const message = `🔗 新节点已生成\n\n节点名称：${nodeName}\n${extraMsg}\n\n订阅链接：\n\`\`\`\n${subTxt.trim()}\n\`\`\``;
    await axios.post(telegramApiUrl, { chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' }, { headers: { 'Content-Type': 'application/json' } });
    console.log('节点已推送到Telegram');
  } catch (error) { console.error('Telegram推送失败:', error.message); }
}

async function uploadNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    const jsonData = { subscription: [`${PROJECT_URL}/${SUB_PATH}`] };
    try { 
        await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, { headers: { 'Content-Type': 'application/json' } }); 
        console.log('Subscription uploaded'); 
    } catch (error) {
        if (error.response && error.response.status === 400) {
        } else {}
    }
  } else if (UPLOAD_URL && fs.existsSync(listPath)) {
      const content = fs.readFileSync(listPath, 'utf-8');
      const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));
      if (nodes.length > 0) {
          try { await axios.post(`${UPLOAD_URL}/api/add-nodes`, JSON.stringify({ nodes }), { headers: { 'Content-Type': 'application/json' } }); console.log('Nodes uploaded'); } catch (error) {}
      }
  }
}

function cleanFiles() {
  if (CLEAN_FILES !== 'true') {
    console.log(`[Config] CLEAN_FILES is set to '${CLEAN_FILES}'. Skipping file cleanup to maintain stability.`);
    return;
  }
  console.log('启动清理倒计时: 3分钟后将删除核心文件以隐藏踪迹...');
  setTimeout(() => {
    const filesToDelete = [bootLogPath, configPath, webPath, botPath];  
    if (NEZHA_PORT) filesToDelete.push(npmPath);
    else if (NEZHA_SERVER && NEZHA_KEY) filesToDelete.push(phpPath);
    if (process.platform === 'win32') {
       exec(`del /f /q ${filesToDelete.join(' ')} > nul 2>&1`, (error) => {
         console.log('Core files have been cleaned up for security.');
       });
    } else {
       exec(`rm -rf ${filesToDelete.join(' ')} >/dev/null 2>&1`, (error) => {
         console.log('Core files have been cleaned up for security.');
       });
    }
  }, 180000); 
}

async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) { console.log("Skipping adding automatic access task"); return; }
  try { await axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL }, { headers: { 'Content-Type': 'application/json' } }); console.log(`automatic access task added successfully`); } catch (error) { console.error(`Add automatic access task faild: ${error.message}`); }
}

async function startserver() {
  try {
    cleanupOldFiles();
    await deleteNodes(); 
    await generateConfig();
    await downloadFilesAndRun();
    await extractDomains();
    await AddVisitTask();
    cleanFiles();
  } catch (error) { console.error('Error in startserver:', error); }
}

startserver().catch(error => { console.error('Unhandled error in startserver:', error); });

app.listen(PORT, () => console.log(`http server is running on port:${PORT}!`));
