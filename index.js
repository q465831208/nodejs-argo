const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require("child_process");
const { promisify } = require('util');
const execAsync = promisify(exec);
const axios = require('axios');
const os = require('os');

// ----------------------------------------------------------------------------------------------------
// 环境变量配置区
// ----------------------------------------------------------------------------------------------------
const UUID = process.env.UUID || 'e0cdc618-0a74-41b7-901e-f8fe6c6626a5';
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'nezha.ylm52.dpdns.org:443';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || 'ricZCX8ODNyN0X4UlSRSnZ9l92zn4UDB';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'cs.ooco.pp.ua';
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYWViZTE2OGY2YmM2NmFhZThmMDcwNjY2ZWVkYmJiZDIiLCJ0IjoiZjVkNDliOTgtMDMyMS00ZDI1LWFjZmMtYzFhY2QxZmFjMDliIiwicyI6Ik1EWXhNV1U0TnpZdFl6QXlNUzAwTURjNUxXRTRPVGd0TVRRMVpHSmpZemcwT1RkaSJ9';
const CFIP = process.env.CFIP || 'saas.sin.fan';
const CFPORT = process.env.CFPORT || '443';
const NAME = process.env.NAME || 'cs';
const FILE_PATH = process.env.FILE_PATH || './.npm';
const ARGO_PORT = process.env.ARGO_PORT || '8001';
const S5_PORT = process.env.S5_PORT || '52123';
const HY2_PORT = process.env.HY2_PORT || '52124';
const TUIC_PORT = process.env.TUIC_PORT || '52125';
const ANYTLS_PORT = process.env.ANYTLS_PORT || '';
const REALITY_PORT = process.env.REALITY_PORT || '52126';
const ANYREALITY_PORT = process.env.ANYREALITY_PORT || '';
const CHAT_ID = process.env.CHAT_ID || '2117746804';
const BOT_TOKEN = process.env.BOT_TOKEN || '5279043230:AAFI4qfyo0oP7HJ-39jLqjqq9Wh6OeWrTjw';
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const DISABLE_ARGO = process.env.DISABLE_ARGO || 'false';
const PORT = process.env.PORT || 3000;
const subtxt = path.join(FILE_PATH, 'sub.txt');

// ----------------------------------------------------------------------------------------------------
// 工具函数
// ----------------------------------------------------------------------------------------------------

// 创建目录
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`${dirPath} is created`);
  } else {
    console.log(`${dirPath} already exists`);
  }
}

// 生成随机名称
function generateRandomName() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 获取系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm64';
  } else if (arch === 'amd64' || arch === 'x64' || arch === 'x86_64') {
    return 'amd64';
  } else if (arch === 's390x' || arch === 's390') {
    return 's390x';
  }
  return 'amd64'; // 默认
}

// 下载文件
async function downloadFile(fileUrl, filePath) {
  try {
    console.log(`正在下载: ${path.basename(filePath)} ...`);
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'curl/7.74.0'
      }
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        fs.chmodSync(filePath, 0o755);
        const stats = fs.statSync(filePath);
        if (stats.size < 10000) {
          fs.unlinkSync(filePath);
          reject(new Error('File too small'));
          return;
        }
        console.log(`✅ 下载成功: ${path.basename(filePath)}`);
        resolve(filePath);
      });
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`❌ 下载失败: ${error.message}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw error;
  }
}

// 删除旧节点
async function deleteOldNodes() {
  if (!UPLOAD_URL || !fs.existsSync(subtxt)) return;
  try {
    const fileContent = fs.readFileSync(subtxt, 'utf-8');
    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => 
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line.trim())
    );
    if (nodes.length === 0) return;
    
    await axios.delete(`${UPLOAD_URL}/api/delete-nodes`, {
      data: { nodes },
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`Deleted ${nodes.length} nodes from server`);
  } catch (error) {
    console.warn('Failed to delete nodes:', error.message);
  }
}

// 配置 Argo
function configureArgo() {
  if (DISABLE_ARGO === 'true') {
    console.log('Disable argo tunnel');
    return;
  }
  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    console.log('ARGO_DOMAIN or ARGO_AUTH variable is empty, use quick tunnels');
    return;
  }

  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelIdMatch = ARGO_AUTH.match(/"TunnelID"\s*:\s*"([^"]+)"/) || 
                          ARGO_AUTH.match(/"tunnel"\s*:\s*"([^"]+)"/);
    const tunnelId = tunnelIdMatch ? tunnelIdMatch[1] : ARGO_AUTH.split('"')[11];
    const tunnelYaml = `tunnel: ${tunnelId}\ncredentials-file: ${path.join(FILE_PATH, 'tunnel.json')}\nprotocol: http2\ningress:\n  - hostname: ${ARGO_DOMAIN}\n    service: http://localhost:${ARGO_PORT}\n    originRequest:\n      noTLSVerify: true\n  - service: http_status:404`;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
    console.log(`CF隧道配置文件已生成（TunnelSecret格式），域名: ${ARGO_DOMAIN}`);
  } else {
    console.log(`CF隧道将使用token模式启动，域名: ${ARGO_DOMAIN}`);
  }
}

// 下载并运行程序
async function downloadAndRun() {
  const architecture = getSystemArchitecture();
  let baseUrl;
  
  if (architecture === 'arm64' || architecture === 'arm') {
    baseUrl = 'https://arm64.ssss.nyc.mn';
  } else if (architecture === 's390x' || architecture === 's390') {
    baseUrl = 'https://s390x.ssss.nyc.mn';
  } else {
    baseUrl = 'https://amd64.ssss.nyc.mn';
  }

  const filesToDownload = [];
  const fileMap = {};

  // Web 和 Bot 文件
  const webName = generateRandomName();
  const botName = generateRandomName();
  const webPath = path.join(FILE_PATH, webName);
  const botPath = path.join(FILE_PATH, botName);
  
  filesToDownload.push({ url: `${baseUrl}/web`, path: webPath });
  filesToDownload.push({ url: `${baseUrl}/bot`, path: botPath });
  fileMap['web'] = webPath;
  fileMap['bot'] = botPath;

  // Nezha 文件
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      const npmName = generateRandomName();
      const npmPath = path.join(FILE_PATH, npmName);
      filesToDownload.push({ url: `${baseUrl}/agent`, path: npmPath });
      fileMap['npm'] = npmPath;
    } else {
      const phpName = generateRandomName();
      const phpPath = path.join(FILE_PATH, phpName);
      filesToDownload.push({ url: `${baseUrl}/v1`, path: phpPath });
      fileMap['php'] = phpPath;
    }
  }

  // 下载所有文件
  try {
    await Promise.all(filesToDownload.map(file => downloadFile(file.url, file.path)));
  } catch (error) {
    console.error('Error downloading files:', error);
    return;
  }

  // 生成配置文件
  await generateConfig();

  // 运行 Web
  if (fs.existsSync(fileMap['web'])) {
    exec(`nohup ${fileMap['web']} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`, (error) => {
      if (error) console.error('Error running web:', error);
      else console.log(`${path.basename(fileMap['web'])} is running`);
    });
  }

  // 运行 Bot (Argo)
  if (DISABLE_ARGO !== 'true' && fs.existsSync(fileMap['bot'])) {
    let args;
    if (ARGO_AUTH && ARGO_DOMAIN && fs.existsSync(path.join(FILE_PATH, 'tunnel.yml'))) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --config ${FILE_PATH}/tunnel.yml run`;
    } else if (ARGO_AUTH && ARGO_DOMAIN) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
    }
    
    exec(`nohup ${fileMap['bot']} ${args} >/dev/null 2>&1 &`, (error) => {
      if (error) console.error('Error running bot:', error);
      else console.log(`${path.basename(fileMap['bot'])} is running`);
    });
  }

  // 运行 Nezha
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT && fileMap['npm']) {
      const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
      const nezhaTls = tlsPorts.includes(NEZHA_PORT) ? '--tls' : '';
      exec(`nohup ${fileMap['npm']} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${nezhaTls} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`, (error) => {
        if (error) console.error('Error running nezha npm:', error);
        else console.log(`${path.basename(fileMap['npm'])} is running`);
      });
    } else if (fileMap['php']) {
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
      const nezhaTls = tlsPorts.includes(port) ? 'true' : 'false';
      const configYaml = `client_secret: ${NEZHA_KEY}\ndebug: false\ndisable_auto_update: true\ndisable_command_execute: false\ndisable_force_update: true\ndisable_nat: false\ndisable_send_query: false\ngpu: false\ninsecure_tls: true\nip_report_period: 1800\nreport_delay: 4\nserver: ${NEZHA_SERVER}\nskip_connection_count: true\nskip_procs_count: true\ntemperature: false\ntls: ${nezhaTls}\nuse_gitee_to_upgrade: false\nuse_ipv6_country_code: false\nuuid: ${UUID}`;
      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
      exec(`nohup ${fileMap['php']} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`, (error) => {
        if (error) console.error('Error running nezha php:', error);
        else console.log(`${path.basename(fileMap['php'])} is running`);
      });
    }
  }

  // 等待服务启动
  await new Promise(resolve => setTimeout(resolve, 8000));
}

// 生成配置文件
async function generateConfig() {
  const config = {
    log: {
      disabled: true,
      level: 'error',
      timestamp: true
    },
    inbounds: [
      {
        tag: 'vmess-ws-in',
        type: 'vmess',
        listen: '::',
        listen_port: parseInt(ARGO_PORT),
        users: [{ uuid: UUID }],
        transport: {
          type: 'ws',
          path: '/vmess-argo',
          early_data_header_name: 'Sec-WebSocket-Protocol'
        }
      }
    ],
    outbounds: [
      {
        type: 'wireguard',
        tag: 'warp-out',
        mtu: 1280,
        address: ['172.16.0.2/32', '2606:4700:110::8dfe:d141:69bb:6b80:925/128'],
        private_key: 'YFYOAdbw1bKTHlNNi+aEjBM3BO7unuFC5rOkMRAz9XY=',
        peers: [{
          address: 'engage.cloudflareclient.com',
          port: 2408,
          public_key: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=',
          allowed_ips: ['0.0.0.0/0', '::/0'],
          reserved: [78, 135, 76]
        }]
      },
      { type: 'direct', tag: 'direct' }
    ],
    route: {
      rule_set: [
        {
          tag: 'openai',
          type: 'remote',
          format: 'binary',
          url: 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geosite/openai.srs',
          download_detour: 'direct'
        },
        {
          tag: 'netflix',
          type: 'remote',
          format: 'binary',
          url: 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geosite/netflix.srs',
          download_detour: 'direct'
        }
      ],
      rules: [
        { action: 'sniff' },
        { rule_set: ['openai', 'netflix'], outbound: 'warp-out' }
      ],
      final: 'direct'
    }
  };

  // 添加其他协议的 inbound
  if (TUIC_PORT) {
    config.inbounds.push({
      tag: 'tuic-in',
      type: 'tuic',
      listen: '::',
      listen_port: parseInt(TUIC_PORT),
      users: [{ uuid: UUID, password: 'admin' }],
      congestion_control: 'bbr',
      tls: {
        enabled: true,
        alpn: ['h3'],
        certificate_path: `${FILE_PATH}/cert.pem`,
        key_path: `${FILE_PATH}/private.key`
      }
    });
  }

  if (HY2_PORT) {
    config.inbounds.push({
      tag: 'hysteria2-in',
      type: 'hysteria2',
      listen: '::',
      listen_port: parseInt(HY2_PORT),
      users: [{ password: UUID }],
      masquerade: 'https://bing.com',
      tls: {
        enabled: true,
        alpn: ['h3'],
        certificate_path: `${FILE_PATH}/cert.pem`,
        key_path: `${FILE_PATH}/private.key`
      }
    });
  }

  if (REALITY_PORT) {
    config.inbounds.push({
      tag: 'vless-reality-vision',
      type: 'vless',
      listen: '::',
      listen_port: parseInt(REALITY_PORT),
      users: [{ uuid: UUID, flow: 'xtls-rprx-vision' }],
      tls: {
        enabled: true,
        server_name: 'www.nazhumi.com',
        reality: {
          enabled: true,
          handshake: {
            server: 'www.nazhumi.com',
            server_port: 443
          },
          private_key: 'private_key_placeholder',
          short_id: ['']
        }
      }
    });
  }

  if (S5_PORT) {
    config.inbounds.push({
      tag: 'socks5-in',
      type: 'socks',
      listen: '::',
      listen_port: parseInt(S5_PORT),
      users: [{
        username: UUID.substring(0, 8),
        password: UUID.substring(UUID.length - 12)
      }]
    });
  }

  if (ANYTLS_PORT) {
    config.inbounds.push({
      tag: 'anytls-in',
      type: 'anytls',
      listen: '::',
      listen_port: parseInt(ANYTLS_PORT),
      users: [{ password: UUID }],
      tls: {
        enabled: true,
        certificate_path: `${FILE_PATH}/cert.pem`,
        key_path: `${FILE_PATH}/private.key`
      }
    });
  }

  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

// 获取 Argo 域名
async function getArgoDomain() {
  if (DISABLE_ARGO === 'true') return '';
  if (ARGO_AUTH && ARGO_DOMAIN) {
    return ARGO_DOMAIN;
  }
  
  // 从日志中提取域名
  const bootLogPath = path.join(FILE_PATH, 'boot.log');
  if (fs.existsSync(bootLogPath)) {
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const logContent = fs.readFileSync(bootLogPath, 'utf-8');
        const match = logContent.match(/https:\/\/([^\/]+trycloudflare\.com)/);
        if (match) {
          return match[1];
        }
      } catch (e) {}
    }
  }
  return '';
}

// 生成订阅链接
async function generateSub() {
  const argoDomain = await getArgoDomain();
  if (DISABLE_ARGO === 'false' && argoDomain) {
    console.log(`ArgoDomain: ${argoDomain}\n`);
  }

  // 获取 IP
  let ip = 'XXX';
  try {
    const response = await axios.get('http://ipv4.ip.sb', { timeout: 5000 });
    ip = response.data.trim();
  } catch (e) {
    try {
      const response = await axios.get('https://api.ipify.org', { timeout: 5000 });
      ip = response.data.trim();
    } catch (e) {}
  }

  // 获取 ISP
  let isp = 'unknown';
  try {
    const response = await axios.get('https://api.ip.sb/geoip', { 
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (response.data && response.data.isp) {
      isp = response.data.isp;
    }
  } catch (e) {}

  const customName = () => {
    return NAME ? `${NAME}_${isp}` : isp;
  };

  const nodeName = customName();
  const VMESS = {
    v: '2',
    ps: nodeName,
    add: CFIP,
    port: CFPORT,
    id: UUID,
    aid: '0',
    scy: 'none',
    net: 'ws',
    type: 'none',
    host: argoDomain,
    path: '/vmess-argo?ed=2560',
    tls: 'tls',
    sni: argoDomain,
    alpn: '',
    fp: 'chrome'
  };

  let listTxt = '';
  if (DISABLE_ARGO === 'false') {
    listTxt += `vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}\n`;
  }

  if (TUIC_PORT) {
    listTxt += `tuic://${UUID}:admin@${ip}:${TUIC_PORT}?sni=www.bing.com&alpn=h3&congestion_control=bbr#${nodeName}\n`;
  }

  if (HY2_PORT) {
    listTxt += `hysteria2://${UUID}@${ip}:${HY2_PORT}/?sni=www.bing.com&alpn=h3&insecure=1#${nodeName}\n`;
  }

  if (REALITY_PORT) {
    listTxt += `vless://${UUID}@${ip}:${REALITY_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.nazhumi.com&fp=chrome&pbk=public_key_placeholder&type=tcp&headerType=none#${nodeName}\n`;
  }

  if (ANYTLS_PORT) {
    listTxt += `anytls://${UUID}@${ip}:${ANYTLS_PORT}?security=tls&sni=${ip}&fp=chrome&insecure=1&allowInsecure=1#${nodeName}\n`;
  }

  if (S5_PORT) {
    const s5Auth = Buffer.from(`${UUID.substring(0, 8)}:${UUID.substring(UUID.length - 12)}`).toString('base64').replace(/=/g, '');
    listTxt += `socks://${s5Auth}@${ip}:${S5_PORT}#${nodeName}\n`;
  }

  if (ANYREALITY_PORT) {
    listTxt += `anytls://${UUID}@${ip}:${ANYREALITY_PORT}?security=reality&sni=www.nazhumi.com&fp=chrome&pbk=public_key_placeholder&type=tcp&headerType=none#${nodeName}\n`;
  }

  const subTxt = Buffer.from(listTxt.trim()).toString('base64');
  fs.writeFileSync(subtxt, subTxt);
  console.log(`\n${FILE_PATH}/sub.txt saved successfully`);

  // 上传节点
  await uploadNodes();

  // 发送到 Telegram
  await sendToTelegram(listTxt.trim(), nodeName);

  console.log(`\nRunning done!\n`);
}

// 上传节点
async function uploadNodes() {
  if (!UPLOAD_URL || !fs.existsSync(path.join(FILE_PATH, 'list.txt'))) return;
  try {
    const content = fs.readFileSync(path.join(FILE_PATH, 'list.txt'), 'utf-8');
    const nodes = content.split('\n').filter(line => 
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line)
    );
    if (nodes.length > 0) {
      await axios.post(`${UPLOAD_URL}/api/add-nodes`, 
        JSON.stringify({ nodes }), 
        { headers: { 'Content-Type': 'application/json' } }
      );
      console.log('Nodes uploaded');
    }
  } catch (error) {
    console.warn('Failed to upload nodes:', error.message);
  }
}

// 发送到 Telegram
async function sendToTelegram(subTxt, nodeName) {
  if (!CHAT_ID || !fs.existsSync(subtxt)) return;
  
  try {
    const message = fs.readFileSync(subtxt, 'utf-8');
    const localMessage = `*${NAME || '节点'}订阅链接*\`\`\`${message}\`\`\``;
    const botMessage = `<b>${NAME || '节点'}订阅链接</b>\n<pre>${message}</pre>`;

    if (BOT_TOKEN && CHAT_ID) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: localMessage,
        parse_mode: 'Markdown'
      });
      console.log('\nNodes sent to TG successfully');
    } else if (CHAT_ID) {
      await axios.post('http://api.tg.gvrander.eu.org/api/notify', {
        chat_id: CHAT_ID,
        message: botMessage
      }, {
        headers: {
          'Authorization': 'Bearer eJWRgxC4LcznKLiUiDousw@nMgDBCSSUk6Iw0S9Pbs',
          'Content-Type': 'application/json'
        }
      });
    } else {
      console.log('\nTG variable is empty,skip sent');
      return;
    }
  } catch (error) {
    console.error('\nFailed to send nodes to TG', error.message);
  }
}

// 初始化
async function init() {
  ensureDir(FILE_PATH);
  await deleteOldNodes();
  configureArgo();
  await downloadAndRun();
  await generateSub();
}

// 启动初始化
init().catch(error => {
  console.error('Error in init:', error);
});

// ----------------------------------------------------------------------------------------------------
// HTTP 服务器
// ----------------------------------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.url === '/') {
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
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }
  // get-sub
  if (req.url === '/sub') {
    fs.readFile(subtxt, 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error reading sub.txt' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(data);
      }
    });
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
