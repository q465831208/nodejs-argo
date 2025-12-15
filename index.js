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
const UUID = process.env.UUID || 'bcb14749-242d-4b9d-aa78-71ec44cb05af'; // UUID
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'nezha.ylm52.dpdns.org:443'; // 哪吒服务器地址
const NEZHA_PORT = process.env.NEZHA_PORT || '';             // 使用哪吒v1请留空，哪吒v0需填写
const NEZHA_KEY = process.env.NEZHA_KEY || 'ricZCX8ODNyN0X4UlSRSnZ9l92zn4UDB';                 // 哪吒密钥
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'zea.ooocc.dpdns.org';            // 固定隧道域名
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTIyMGI2MDFlMmJlYWE0ODQzNWRkZjAyMjllYjg1YmUiLCJ0IjoiZmZjMzkwMzktN2RlMS00YzQ4LWJjM2MtY2E4OTI0ZjkyZjZkIiwicyI6Ik1UazNOek5tTXpNdE0yVXdOeTAwTlRRMkxUZ3pNVEV0WXpjeFlqVTRNVGt4WWpBeiJ9';                 // 固定隧道密钥
const ARGO_PORT = process.env.ARGO_PORT || 8001;             // 固定隧道端口
const CFIP = process.env.CFIP || 'cf.877774.xyz';         // 节点优选域名或优选ip 
const CFPORT = process.env.CFPORT || 443;                     // 节点优选域名或优选ip对应的端口
const NAME = process.env.NAME || 'zeabur-us';                          // 节点名称
const XIEYI = process.env.XIEYI || '2';                          // 协议选择
const CHAT_ID = process.env.CHAT_ID || '2117746804';                     // Telegram chat_id
const BOT_TOKEN = process.env.BOT_TOKEN || '5279043230:AAFI4qfyo0oP7HJ-39jLqjqq9Wh6OeWrTjw';                  // Telegram bot_token

// 【开关】控制是否清理文件。默认 'false' (保留文件以提高稳定性)
const CLEAN_FILES = process.env.CLEAN_FILES || 'false'; 

// ----------------------------------------------------------------------------------------------------
// 初始化与工具函数
// ----------------------------------------------------------------------------------------------------

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

// [脚本2功能] 启动时清理以前可能残留的垃圾文件
function cleanupOldFiles() {
    try {
        const files = fs.readdirSync(FILE_PATH);
        files.forEach(file => {
            const filePath = path.join(FILE_PATH, file);
            try {
                const stat = fs.statSync(filePath);
                if (stat.isFile()) {
                   // 不删除核心配置，只删除旧的二进制或日志
                   if (!file.endsWith('.json') && !file.endsWith('.txt')) {
                       // fs.unlinkSync(filePath); // 暂时注释，避免误删，依赖 cleanFiles 控制
                   }
                }
            } catch (err) {}
        });
    } catch (err) {}
}

// [脚本2功能] 如果订阅器上存在历史运行节点则先删除
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
// 路由设置 (脚本1特色：伪装页面)
// ----------------------------------------------------------------------------------------------------

app.get("/", function(req, res) {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>知识云课堂 - 在线学习平台</title>
    <style>
        body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; background-color: #f5f8ff; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; color: #333; }
        .header-title { font-size: 24px; font-weight: bold; color: #555; margin-bottom: 30px; text-align: center; display: flex; align-items: center; gap: 10px; }
        .banner { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px; padding: 40px; text-align: center; max-width: 800px; width: 90%; margin-bottom: 50px; box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3); }
        .banner h1 { color: #ffffff; margin: 0 0 15px 0; font-size: 32px; letter-spacing: 1px; }
        .banner p { color: #f0f0f0; margin: 0; font-size: 18px; }
        .grid-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 25px; max-width: 1000px; width: 95%; justify-content: center; }
        .card { background-color: #ffffff; border-radius: 15px; padding: 25px 20px; text-align: center; transition: all 0.3s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e8ecf4; }
        .card:hover { transform: translateY(-5px); box-shadow: 0 8px 20px rgba(102, 126, 234, 0.2); border-color: #667eea; }
        .icon { font-size: 48px; margin-bottom: 15px; display: inline-block; }
        .card h3 { color: #667eea; margin: 10px 0; font-size: 18px; font-weight: bold; }
        .card p { color: #777; font-size: 14px; line-height: 1.6; margin: 0; }
    </style>
</head>
<body>
    <div class="header-title"><span style="font-size: 32px;">📚</span>知识云课堂 - 让学习更简单<span style="font-size: 32px;">🎓</span></div>
    <div class="banner"><h1>探索知识的海洋，成就更好的自己</h1><p>海量优质课程，随时随地在线学习</p></div>
    <div class="grid-container">
        <div class="card"><div class="icon">💻</div><h3>编程开发</h3><p>Python、Java、前端等热门技术课程</p></div>
        <div class="card"><div class="icon">🎨</div><h3>设计创意</h3><p>UI设计、平面设计、视频剪辑</p></div>
        <div class="card"><div class="icon">🌐</div><h3>语言学习</h3><p>英语、日语、法语等多语种课程</p></div>
        <div class="card"><div class="icon">📊</div><h3>数据分析</h3><p>大数据、数据可视化、AI应用</p></div>
        <div class="card"><div class="icon">📱</div><h3>移动开发</h3><p>iOS、Android、跨平台开发</p></div>
        <div class="card"><div class="icon">💼</div><h3>职场技能</h3><p>办公软件、项目管理、沟通技巧</p></div>
    </div>
</body>
</html>
  `;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// 订阅路由 - 提前注册 (脚本2逻辑)
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

// ----------------------------------------------------------------------------------------------------
// 核心逻辑功能
// ----------------------------------------------------------------------------------------------------

async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [ { protocol: "freedom", tag: "direct" }, {protocol: "blackhole", tag: "block"} ]
  };
  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

function getSystemArchitecture() {
  const arch = os.arch();
  return (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') ? 'arm' : 'amd';
}

// [脚本1优化] 使用 Curl 下载，比脚本2的 axios stream 更稳定
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
   
  // 运行程序
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
        // Nezha V1
        const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
        const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
        const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
        const configYaml = `client_secret: ${NEZHA_KEY}\ndebug: false\ndisable_auto_update: true\ndisable_command_execute: false\ndisable_force_update: true\ndisable_nat: false\ndisable_send_query: false\ngpu: false\ninsecure_tls: true\nip_report_period: 1800\nreport_delay: 4\nserver: ${NEZHA_SERVER}\nskip_connection_count: true\nskip_procs_count: true\ntemperature: false\ntls: ${nezhatls}\nuse_gitee_to_upgrade: false\nuse_ipv6_country_code: false\nuuid: ${UUID}`;
        fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
        exec(`nohup ${phpPath} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`).catch(e => console.error(e));
        console.log(`${phpName} is running`);
    } else {
        // Nezha Agent
        let NEZHA_TLS = ['443', '8443', '2096', '2087', '2083', '2053'].includes(NEZHA_PORT) ? '--tls' : '';
        exec(`nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`).catch(e => console.error(e));
        console.log(`${npmName} is running`);
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

// ----------------------------------------------------------------------------------------------------
// 【关键修改】使用 ssss.nyc.mn 源下载二进制文件
// ----------------------------------------------------------------------------------------------------
function getFilesForArchitecture(architecture) {
  // 1. 根据架构选择基础文件（web + bot）
  let baseFiles;
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
  
  // 2. 如果配置了哪吒监控，添加对应的监控客户端
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      // 使用新版 agent
      const npmUrl = architecture === 'arm' 
        ? "https://arm64.ssss.nyc.mn/agent"
        : "https://amd64.ssss.nyc.mn/agent";
      baseFiles.unshift({ fileName: npmPath, fileUrl: npmUrl });
    } else {
      // 使用旧版 v1
      const phpUrl = architecture === 'arm' 
        ? "https://arm64.ssss.nyc.mn/v1" 
        : "https://amd64.ssss.nyc.mn/v1";
      baseFiles.unshift({ fileName: phpPath, fileUrl: phpUrl });
    }
  }
  
  return baseFiles;
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

// [脚本1逻辑] 优先使用 ip-api 获取地区 (比脚本2的 ipapi.co 更快)
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
             // 备用 fallback
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
        // [脚本1逻辑] 多协议支持
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
        await sendToTelegram(subTxt.trim(), nodeName);
        resolve(subTxt);
      }, 2000);
    });
}

// [脚本1功能] Telegram 推送
async function sendToTelegram(subTxt, nodeName) {
  if (!CHAT_ID || !BOT_TOKEN) return;
  try {
    const telegramApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const message = `🔗 新节点已生成\n\n节点名称：${nodeName}\n\n订阅链接：\n\`\`\`\n${subTxt.trim()}\n\`\`\``;
    await axios.post(telegramApiUrl, { chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' }, { headers: { 'Content-Type': 'application/json' } });
    console.log('节点已推送到Telegram');
  } catch (error) { console.error('Telegram推送失败:', error.message); }
}

// [脚本2功能] 自动上传节点/订阅
async function uploadNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    const jsonData = { subscription: [`${PROJECT_URL}/${SUB_PATH}`] };
    try { 
        await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, { headers: { 'Content-Type': 'application/json' } }); 
        console.log('Subscription uploaded'); 
    } catch (error) {
        if (error.response && error.response.status === 400) {
            // 已存在，忽略
        } else {
            // console.error(error);
        }
    }
  } else if (UPLOAD_URL && fs.existsSync(listPath)) {
      const content = fs.readFileSync(listPath, 'utf-8');
      const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));
      if (nodes.length > 0) {
          try { await axios.post(`${UPLOAD_URL}/api/add-nodes`, JSON.stringify({ nodes }), { headers: { 'Content-Type': 'application/json' } }); console.log('Nodes uploaded'); } catch (error) {}
      }
  }
}

// [脚本1功能] 受 CLEAN_FILES 环境变量控制的清理逻辑
function cleanFiles() {
  // 1. 如果开关设为 'false'，直接跳过，不执行任何清理
  if (CLEAN_FILES !== 'true') {
    console.log(`[Config] CLEAN_FILES is set to '${CLEAN_FILES}'. Skipping file cleanup to maintain stability.`);
    return;
  }

  // 2. 否则，3分钟后执行清理 (脚本2为90s，这里稍微放宽到3分钟)
  console.log('启动清理倒计时: 3分钟后将删除核心文件以隐藏踪迹...');
  setTimeout(() => {
    const filesToDelete = [bootLogPath, configPath, webPath, botPath];  
    if (NEZHA_PORT) filesToDelete.push(npmPath);
    else if (NEZHA_SERVER && NEZHA_KEY) filesToDelete.push(phpPath);
    
    // Windows系统使用不同的删除命令
    if (process.platform === 'win32') {
       exec(`del /f /q ${filesToDelete.join(' ')} > nul 2>&1`, (error) => {
         console.log('Core files have been cleaned up for security.');
       });
    } else {
       exec(`rm -rf ${filesToDelete.join(' ')} >/dev/null 2>&1`, (error) => {
         console.log('Core files have been cleaned up for security.');
       });
    }
  }, 180000); // 3分钟
}

// [脚本2功能] Serv00 自动保活
async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) { console.log("Skipping adding automatic access task"); return; }
  try { await axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL }, { headers: { 'Content-Type': 'application/json' } }); console.log(`automatic access task added successfully`); } catch (error) { console.error(`Add automatic access task faild: ${error.message}`); }
}

async function startserver() {
  try {
    cleanupOldFiles(); // [新增] 启动时清理垃圾
    await deleteNodes(); 
    await generateConfig();
    await downloadFilesAndRun();
    await extractDomains();
    await AddVisitTask();
    
    // 流程结束后调用清理逻辑（内部会判断环境变量）
    cleanFiles();
  } catch (error) { console.error('Error in startserver:', error); }
}

startserver().catch(error => { console.error('Unhandled error in startserver:', error); });

app.listen(PORT, () => console.log(`http server is running on port:${PORT}!`));
