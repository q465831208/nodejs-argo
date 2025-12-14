const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

// ----------------------------------------------------------------------------------------------------
// 环境变量配置区
// ----------------------------------------------------------------------------------------------------

// 只填写UPLOAD_URL将上传节点,同时填写UPLOAD_URL和PROJECT_URL将上传订阅
const UPLOAD_URL = process.env.UPLOAD_URL || '';        // 节点或订阅自动上传地址,需填写部署Merge-sub项目后的首页地址
const PROJECT_URL = process.env.PROJECT_URL || '';      // 需要上传订阅或保活时需填写项目分配的url
const AUTO_ACCESS = process.env.AUTO_ACCESS === 'true' || false; // false关闭自动保活，true开启
const FILE_PATH = process.env.FILE_PATH || './tmp';     // 运行目录,sub节点文件保存目录
const SUB_PATH = process.env.SUB_PATH || '123';         // 订阅路径
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;         // http服务订阅端口
const UUID = process.env.UUID || 'aa512b6d-a9ac-4327-8090-6f3569f8c8bf'; // UUID
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'nezha.ylm52.dpdns.org:443'; // 哪吒服务器地址
const NEZHA_PORT = process.env.NEZHA_PORT || '';             // 使用哪吒v1请留空，哪吒v0需填写
const NEZHA_KEY = process.env.NEZHA_KEY || 'ricZCX8ODNyN0X4UlSRSnZ9l92zn4UDB';                // 哪吒密钥
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'pl.oocoo.ggff.net';            // 固定隧道域名
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTIyMGI2MDFlMmJlYWE0ODQzNWRkZjAyMjllYjg1YmUiLCJ0IjoiODczMDQ4YzItODJlZC00MDUxLWE2MjUtMWVlMGVhMzBjNWNmIiwicyI6Ik5UTTVNV1U1WWpJdE9ETXhNQzAwTW1VeUxXRmhaVEF0TTJVM01qWmlObVF5TURjMiJ9';                // 固定隧道密钥
const ARGO_PORT = process.env.ARGO_PORT || 8001;             // 固定隧道端口
const CFIP = process.env.CFIP || 'cf.877774.xyz';         // 节点优选域名或优选ip 
const CFPORT = process.env.CFPORT || 443;                     // 节点优选域名或优选ip对应的端口
const NAME = process.env.NAME || 'pluox';                          // 节点名称
const XIEYI = process.env.XIEYI || '2';                          // 协议选择
const CHAT_ID = process.env.CHAT_ID || '2117746804';                     // Telegram chat_id
const BOT_TOKEN = process.env.BOT_TOKEN || '5279043230:AAFI4qfyo0oP7HJ-39jLqjqq9Wh6OeWrTjw';                 // Telegram bot_token

// ----------------------------------------------------------------------------------------------------
// 初始化与工具函数
// ----------------------------------------------------------------------------------------------------

// 创建运行文件夹
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

// 生成随机6位字符文件名
function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 全局常量
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

// 如果订阅器上存在历史运行节点则先删除
async function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;

    let fileContent;
    try {
      fileContent = fs.readFileSync(subPath, 'utf-8');
    } catch {
      return;
    }

    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => 
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line.trim())
    );

    if (nodes.length === 0) return;

    try {
      await axios.post(`${UPLOAD_URL}/api/delete-nodes`, 
        { nodes },
        { headers: { 'Content-Type': 'application/json' } }
      );
      console.log(`Deleted ${nodes.length} nodes from server`);
    } catch (error) {
      console.warn('Failed to delete nodes:', error.message);
    }
  } catch (err) {
    console.error('Error in deleteNodes:', err.message);
  }
}

// 清理历史文件
function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(FILE_PATH);
    files.forEach(file => {
      const filePath = path.join(FILE_PATH, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        // 忽略所有错误
      }
    });
  } catch (err) {
    // 忽略所有错误
  }
}

// ----------------------------------------------------------------------------------------------------
// 路由设置 (含伪装页面)
// ----------------------------------------------------------------------------------------------------

// 根路由 - 伪装成在线学习平台页面
app.get("/", function(req, res) {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>知识云课堂 - 在线学习平台</title>
    <style>
        /* 全局样式设置 */
        body {
            font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
            background-color: #f5f8ff; /* 极浅的蓝色背景 */
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            color: #333;
        }

        /* 顶部标题样式 */
        .header-title {
            font-size: 24px;
            font-weight: bold;
            color: #555;
            margin-bottom: 30px;
            text-align: center;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        /* 大横幅/Slogan区域样式 */
        .banner {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            max-width: 800px;
            width: 90%;
            margin-bottom: 50px;
            box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
        }

        .banner h1 {
            color: #ffffff;
            margin: 0 0 15px 0;
            font-size: 32px;
            letter-spacing: 1px;
        }

        .banner p {
            color: #f0f0f0;
            margin: 0;
            font-size: 18px;
        }

        /* 卡片网格容器样式 */
        .grid-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 25px;
            max-width: 1000px;
            width: 95%;
            justify-content: center;
        }

        /* 单个卡片样式 */
        .card {
            background-color: #ffffff;
            border-radius: 15px;
            padding: 25px 20px;
            text-align: center;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            border: 1px solid #e8ecf4;
        }

        /* 鼠标悬停效果 */
        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 20px rgba(102, 126, 234, 0.2);
            border-color: #667eea;
        }

        /* 图标样式 */
        .icon {
            font-size: 48px;
            margin-bottom: 15px;
            display: inline-block;
        }

        /* 卡片标题样式 */
        .card h3 {
            color: #667eea;
            margin: 10px 0;
            font-size: 18px;
            font-weight: bold;
        }

        /* 卡片描述文字样式 */
        .card p {
            color: #777;
            font-size: 14px;
            line-height: 1.6;
            margin: 0;
        }
    </style>
</head>
<body>

    <div class="header-title">
        <span style="font-size: 32px;">📚</span>
        知识云课堂 - 让学习更简单
        <span style="font-size: 32px;">🎓</span>
    </div>

    <div class="banner">
        <h1>探索知识的海洋，成就更好的自己</h1>
        <p>海量优质课程，随时随地在线学习</p>
    </div>

    <div class="grid-container">
        <div class="card">
            <div class="icon">💻</div>
            <h3>编程开发</h3>
            <p>Python、Java、前端等热门技术课程</p>
        </div>
        <div class="card">
            <div class="icon">🎨</div>
            <h3>设计创意</h3>
            <p>UI设计、平面设计、视频剪辑</p>
        </div>
        <div class="card">
            <div class="icon">🌐</div>
            <h3>语言学习</h3>
            <p>英语、日语、法语等多语种课程</p>
        </div>
        <div class="card">
            <div class="icon">📊</div>
            <h3>数据分析</h3>
            <p>大数据、数据可视化、AI应用</p>
        </div>
        <div class="card">
            <div class="icon">📱</div>
            <h3>移动开发</h3>
            <p>iOS、Android、跨平台开发</p>
        </div>
        <div class="card">
            <div class="icon">💼</div>
            <h3>职场技能</h3>
            <p>办公软件、项目管理、沟通技巧</p>
        </div>
        <div class="card">
            <div class="icon">🎯</div>
            <h3>考试培训</h3>
            <p>考研、公务员、职业资格证书</p>
        </div>
        <div class="card">
            <div class="icon">🎬</div>
            <h3>影视制作</h3>
            <p>摄影、后期、特效制作</p>
        </div>
        <div class="card">
            <div class="icon">📈</div>
            <h3>市场营销</h3>
            <p>新媒体运营、电商、品牌策划</p>
        </div>
        <div class="card">
            <div class="icon">🎵</div>
            <h3>音乐艺术</h3>
            <p>乐器、声乐、音乐制作</p>
        </div>
        <div class="card">
            <div class="icon">🏋️</div>
            <h3>健康运动</h3>
            <p>健身、瑜伽、营养学</p>
        </div>
        <div class="card">
            <div class="icon">🧠</div>
            <h3>兴趣爱好</h3>
            <p>摄影、绘画、手工制作</p>
        </div>
    </div>

</body>
</html>
  `;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ----------------------------------------------------------------------------------------------------
// 核心逻辑功能
// ----------------------------------------------------------------------------------------------------

// 生成xr-ay配置文件
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

// 判断系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

// 下载对应系统架构的依赖文件
function downloadFile(fileName, fileUrl, callback) {
  const filePath = fileName; 
  
  // 确保目录存在
  if (!fs.existsSync(FILE_PATH)) {
    fs.mkdirSync(FILE_PATH, { recursive: true });
  }
  
  const writer = fs.createWriteStream(filePath);

  axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  })
    .then(response => {
      response.data.pipe(writer);

      writer.on('finish', () => {
        writer.close();
        console.log(`Download ${path.basename(filePath)} successfully`);
        callback(null, filePath);
      });

      writer.on('error', err => {
        fs.unlink(filePath, () => { });
        const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`;
        console.error(errorMessage);
        callback(errorMessage);
      });
    })
    .catch(err => {
      const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`;
      console.error(errorMessage); 
      callback(errorMessage);
    });
}

// 下载并运行依赖文件
async function downloadFilesAndRun() { 
  
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);

  if (filesToDownload.length === 0) {
    console.log(`Can't find a file for the current architecture`);
    return;
  }

  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, filePath) => {
        if (err) {
          reject(err);
        } else {
          resolve(filePath);
        }
      });
    });
  });

  try {
    await Promise.all(downloadPromises);
  } catch (err) {
    console.error('Error downloading files:', err);
    return;
  }
  // 授权和运行
  function authorizeFiles(filePaths) {
    const newPermissions = 0o775;
    filePaths.forEach(absoluteFilePath => {
      if (fs.existsSync(absoluteFilePath)) {
        fs.chmod(absoluteFilePath, newPermissions, (err) => {
          if (err) {
            console.error(`Empowerment failed for ${absoluteFilePath}: ${err}`);
          } else {
            console.log(`Empowerment success for ${absoluteFilePath}: ${newPermissions.toString(8)}`);
          }
        });
      }
    });
  }
  const filesToAuthorize = NEZHA_PORT ? [npmPath, webPath, botPath] : [phpPath, webPath, botPath];
  authorizeFiles(filesToAuthorize);

  //运行ne-zha
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      // 检测哪吒是否开启TLS
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
      const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
      // 生成 config.yaml
      const configYaml = `
client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: true
ip_report_period: 1800
report_delay: 4
server: ${NEZHA_SERVER}
skip_connection_count: true
skip_procs_count: true
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;
      
      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
      
      // 运行 v1
      const command = `nohup ${phpPath} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`;
      try {
        await exec(command);
        console.log(`${phpName} is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`php running error: ${error}`);
      }
    } else {
      let NEZHA_TLS = '';
      const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
      if (tlsPorts.includes(NEZHA_PORT)) {
        NEZHA_TLS = '--tls';
      }
      const command = `nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`;
      try {
        await exec(command);
        console.log(`${npmName} is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`npm running error: ${error}`);
      }
    }
  } else {
    console.log('NEZHA variable is empty,skip running');
  }
  //运行xr-ay
  const command1 = `nohup ${webPath} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`;
  try {
    await exec(command1);
    console.log(`${webName} is running`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`web running error: ${error}`);
  }

  // 运行cloud-fared
  if (fs.existsSync(botPath)) {
    let args;

    if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    } else if (ARGO_AUTH.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
    }

    try {
      await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
      console.log(`${botName} is running`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error executing command: ${error}`);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));

}

//根据系统架构返回对应的url
function getFilesForArchitecture(architecture) {
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

  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      const npmUrl = architecture === 'arm' 
        ? "https://arm64.ssss.nyc.mn/agent"
        : "https://amd64.ssss.nyc.mn/agent";
        baseFiles.unshift({ 
          fileName: npmPath, 
          fileUrl: npmUrl 
        });
    } else {
      const phpUrl = architecture === 'arm' 
        ? "https://arm64.ssss.nyc.mn/v1" 
        : "https://amd64.ssss.nyc.mn/v1";
      baseFiles.unshift({ 
        fileName: phpPath, 
        fileUrl: phpUrl
      });
    }
  }

  return baseFiles;
}

// 获取固定隧道json
function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    console.log("ARGO_DOMAIN or ARGO_AUTH variable is empty, use quick tunnels");
    return;
  }

  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `
  tunnel: ${ARGO_AUTH.split('"')[11]}
  credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
  protocol: http2
   
  ingress:
    - hostname: ${ARGO_DOMAIN}
      service: http://localhost:${ARGO_PORT}
      originRequest:
        noTLSVerify: true
    - service: http_status:404
  `;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  } else {
    console.log("ARGO_AUTH mismatch TunnelSecret,use token connect to tunnel");
  }
}
argoType();

// 获取临时隧道domain
async function extractDomains() {
  let argoDomain;

  if (ARGO_AUTH && ARGO_DOMAIN) {
    argoDomain = ARGO_DOMAIN;
    console.log('ARGO_DOMAIN:', argoDomain);
    await generateLinks(argoDomain);
  } else {
    try {
      const fileContent = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
      const lines = fileContent.split('\n');
      const argoDomains = [];
      lines.forEach((line) => {
        const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (domainMatch) {
          const domain = domainMatch[1];
          argoDomains.push(domain);
        }
      });

      if (argoDomains.length > 0) {
        argoDomain = argoDomains[0];
        console.log('ArgoDomain:', argoDomain);
        await generateLinks(argoDomain);
      } else {
        console.log('ArgoDomain not found, re-running bot to obtain ArgoDomain');
        // 删除 boot.log 文件，等待 2s 重新运行 server 以获取 ArgoDomain
        fs.unlinkSync(path.join(FILE_PATH, 'boot.log'));
        // 停止 bot 进程
        try {
          await exec(`pkill -f "${botName}" > /dev/null 2>&1`);
        } catch (error) {
          // 忽略输出
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
        try {
          await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
          console.log(`${botName} is running`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await extractDomains(); // 重新提取域名
        } catch (error) {
          console.error(`Error executing command: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error reading boot.log:', error);
    }
  }
}


// 国家代码到国旗 Emoji 的映射函数
function getFlagEmoji(countryCode) {
    if (!countryCode) return '';
    // 将国家代码转换为 Unicode 标量
    const base = 0x1F1E6; // '🇦' 的基数
    const codePoints = countryCode.toUpperCase().split('').map(char => base + char.charCodeAt(0) - 'A'.charCodeAt(0));
    try {
        // 使用 String.fromCodePoint 组合出国旗 Emoji
        return String.fromCodePoint(...codePoints);
    } catch (e) {
        // 捕获可能的错误，如国旗代码不存在
        return '';
    }
}


async function generateLinks(argoDomain) {
    // 城市名称到国家/地区二位代码的映射表 (ISO 3166-1 alpha-2)
    function getAbbreviation(location) {
        const map = {
            'Singapore': 'SG', 'Hong_Kong': 'HK', 'Taipei': 'TW', 'Tokyo': 'JP', 'Osaka': 'JP', 'Seoul': 'KR', 
            'Jakarta': 'ID', 'Kuala_Lumpur': 'MY', 'Manila': 'PH', 'Mumbai': 'IN', 'Delhi': 'IN', 'Bangkok': 'TH',
            'Hanoi': 'VN', 'Ho_Chi_Minh_City': 'VN', 'Ashburn': 'US', 'Chicago': 'US', 'Dallas': 'US', 
            'Los_Angeles': 'US', 'San_Jose': 'US', 'Seattle': 'US', 'Miami': 'US', 'Toronto': 'CA', 
            'Montreal': 'CA', 'Frankfurt': 'DE', 'London': 'GB', 'Paris': 'FR', 'Amsterdam': 'NL', 
            'Warsaw': 'PL', 'Madrid': 'ES', 'Milan': 'IT', 'Stockholm': 'SE', 'Zurich': 'CH', 
            'Sydney': 'AU', 'Melbourne': 'AU', 'Auckland': 'NZ', 'Sao_Paulo': 'BR', 'Santiago': 'CL', 
            'Bogota': 'CO', 'Dubai': 'AE', 'Johannesburg': 'ZA',
        };
        
        const cleanedLocation = location.replace(/[\s_]/g, '');

        for (const full in map) {
            if (cleanedLocation.toLowerCase() === full.replace(/_/g, '').toLowerCase()) {
                return map[full];
            }
        }
        
        return cleanedLocation.substring(0, 3).toUpperCase();
    }
    
    // 提取城市名
    const metaInfo = execSync(
      'curl -sm 5 https://speed.cloudflare.com/meta | awk -F\\" \'{print $26}\' | sed -e \'s/ /_/g\'',
      { encoding: 'utf-8' }
    );
    const ISP = metaInfo.trim();
    const locationAbbreviation = getAbbreviation(ISP);
    
    // 获取国旗 Emoji 并构建 nodeName
    const flagEmoji = getFlagEmoji(locationAbbreviation);
    const baseNodeName = NAME ? `${NAME}-${locationAbbreviation}` : locationAbbreviation;
    const nodeName = `${flagEmoji} ${baseNodeName}`.trim();

    return new Promise(async (resolve) => {
      setTimeout(async () => {
        const VMESS = { v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox'};
        
        let subTxt = '';
        
        // --- 协议选择逻辑 ---
        if (XIEYI === '3') {
          // 生成 VMESS, VLESS, TROJAN (三种)
          subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}-VLESS
  
vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}
  
trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}-TROJAN
    `;
        } else if (XIEYI === '2') {
          // 生成 VMESS, VLESS (两种)
          subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}-VLESS
  
vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}
    `;
        } else {
          // 默认只生成 VMESS (一种)
          subTxt = `vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}`;
        }
        // --- 协议选择逻辑结束 ---

        console.log(Buffer.from(subTxt).toString('base64'));
        fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
        console.log(`${FILE_PATH}/sub.txt saved successfully`);
        
        await uploadNodes();
        await sendToTelegram(subTxt.trim(), nodeName);
        
        // 确保路由只被设置一次
        if (!app._router.stack.some(layer => layer.route && layer.route.path === `/${SUB_PATH}`)) {
           app.get(`/${SUB_PATH}`, (req, res) => {
             const encodedContent = Buffer.from(subTxt).toString('base64');
             res.set('Content-Type', 'text/plain; charset=utf-8');
             res.send(encodedContent);
           });
        }
        
        resolve(subTxt);
      }, 2000);
    });
}

// 推送节点到Telegram
async function sendToTelegram(subTxt, nodeName) {
  // 检查是否配置了 Telegram 参数
  if (!CHAT_ID || !BOT_TOKEN) {
    console.log('Telegram推送未配置：CHAT_ID 或 BOT_TOKEN 为空');
    return;
  }

  try {
    const telegramApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const message = `🔗 新节点已生成\n\n节点名称：${nodeName}\n\n订阅链接：\n\`\`\`\n${subTxt.trim()}\n\`\`\``;

    const response = await axios.post(telegramApiUrl, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response && response.status === 200) {
      console.log('节点已推送到Telegram');
      return response;
    } else {
      console.warn('Telegram推送失败：未知响应状态');
      return null;
    }
  } catch (error) {
    if (error.response) {
      console.error('Telegram推送失败:', error.response.data);
    } else {
      console.error('Telegram推送失败:', error.message);
    }
    return null;
  }
}

// 自动上传节点或订阅
async function uploadNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    const subscriptionUrl = `${PROJECT_URL}/${SUB_PATH}`;
    const jsonData = {
      subscription: [subscriptionUrl]
    };
    try {
        const response = await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response && response.status === 200) {
            console.log('Subscription uploaded successfully');
            return response;
        } else {
            return null;
        }
    } catch (error) {
        if (error.response) {
            if (error.response.status === 400) {
              //  console.error('Subscription already exists');
            }
        }
    }
  } else if (UPLOAD_URL) {
      if (!fs.existsSync(listPath)) return;
      const content = fs.readFileSync(listPath, 'utf-8');
      const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));

      if (nodes.length === 0) return;

      const jsonData = JSON.stringify({ nodes });

      try {
          const response = await axios.post(`${UPLOAD_URL}/api/add-nodes`, jsonData, {
              headers: { 'Content-Type': 'application/json' }
          });
          if (response && response.status === 200) {
            console.log('Nodes uploaded successfully');
            return response;
        } else {
            return null;
        }
      } catch (error) {
          return null;
      }
  } else {
      // console.log('Skipping upload nodes');
      return;
  }
}

// 90s后删除相关文件 (兼容 Windows 和 Linux)
function cleanFiles() {
  setTimeout(() => {
    const filesToDelete = [bootLogPath, configPath, webPath, botPath];
    
    if (NEZHA_PORT) {
      filesToDelete.push(npmPath);
    } else if (NEZHA_SERVER && NEZHA_KEY) {
      filesToDelete.push(phpPath);
    }

    // 1. 获取当前操作系统平台
    const platform = os.platform();
    let command = '';

    // 2. 根据系统生成对应的删除命令
    if (platform === 'win32') {
      // Windows 系统使用 del 命令
      // /f: 强制删除只读文件, /q: 安静模式(不确认)
      // Array.join(' ') 将路径数组拼接成字符串
      command = `del /f /q "${filesToDelete.join('" "')}" >nul 2>&1`;
    } else {
      // Linux/macOS 系统使用 rm 命令
      command = `rm -f ${filesToDelete.join(' ')} >/dev/null 2>&1`;
    }

    // 3. 执行删除
    exec(command, (error) => {
      // 无论是否报错，都清屏并显示成功信息
      // (在 Windows 上 console.clear() 可能行为稍有不同，但通常有效)
      console.clear();
      console.log('App is running');
      console.log('Thank you for using this script, enjoy!');
    });
  }, 90000); // 90s
}
cleanFiles();

// 自动访问项目URL
async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) {
    console.log("Skipping adding automatic access task");
    return;
  }

  try {
    const response = await axios.post('https://oooo.serv00.net/add-url', {
      url: PROJECT_URL
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    // console.log(`${JSON.stringify(response.data)}`);
    console.log(`automatic access task added successfully`);
    return response;
  } catch (error) {
    console.error(`Add automatic access task faild: ${error.message}`);
    return null;
  }
}

// 主运行逻辑
async function startserver() {
  try {
    await deleteNodes(); // 确保删除节点操作完成
    cleanupOldFiles();
    await generateConfig();
    await downloadFilesAndRun();
    await extractDomains();
    await AddVisitTask();
  } catch (error) {
    console.error('Error in startserver:', error);
  }
}
startserver().catch(error => {
  console.error('Unhandled error in startserver:', error);
});

app.listen(PORT, () => console.log(`http server is running on port:${PORT}!`));
