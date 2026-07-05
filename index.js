"use strict";

const express = require("express");
const axios = require("axios");
const os = require("os");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { promisify } = require("util");
const { exec, spawn } = require("child_process");

const app = express();
const execAsync = promisify(exec);

// ============================================================
// 环境变量配置区
// 仅保留 index4.js 当前使用的变量体系，不再兼容旧脚本变量名。
// 这样可以减少特征重合，也方便后续继续维护当前版本。
// ============================================================
function readBool(primaryValue, fallbackValue, defaultValue = false) {
  const value = primaryValue ?? fallbackValue;
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function readInt(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

const ENV = Object.freeze({
  REMOTE_SYNC_ENDPOINT: process.env.REMOTE_SYNC_ENDPOINT || "", // 远端同步接口，用于上传或删除节点
  PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN || "", // 当前服务对外访问地址，用于生成订阅链接
  KEEP_ALIVE_ENABLED: readBool(process.env.KEEP_ALIVE_ENABLED, undefined, false), // 是否启用保活访问
  WORK_DIR: process.env.WORK_DIR || "./tmp", // 运行目录，保存二进制、配置和订阅文件
  FEED_ROUTE: process.env.FEED_ROUTE || "123", // 订阅访问路径，例如 /123
  LISTEN_PORT: readInt(process.env.SERVER_PORT || process.env.PORT, 3000), // 当前 Node 服务监听端口
  NODE_UID: process.env.NODE_UID || "7087eb3c-de19-41ae-8c8d-7ca5a9ed4456", // 节点 UUID，同时用于多种协议认证
  MONITOR_HOST: process.env.MONITOR_HOST || "nezha.ylm52.dpdns.org:443", // 哪吒监控服务地址
  MONITOR_PORT: process.env.MONITOR_PORT || "", // 哪吒旧版端口，留空时走新版模式
  MONITOR_SECRET: process.env.MONITOR_SECRET || "ricZCX8ODNyN0X4UlSRSnZ9l92zn4UDB", // 哪吒客户端密钥
  TUNNEL_HOST: process.env.TUNNEL_HOST || "vor.ooco.pp.ua", // 固定隧道绑定的域名
  TUNNEL_CREDENTIAL: process.env.TUNNEL_CREDENTIAL || "eyJhIjoiYWViZTE2OGY2YmM2NmFhZThmMDcwNjY2ZWVkYmJiZDIiLCJ0IjoiMzAwNGI0MDAtMDE4Ni00ZTBiLWEyOTItODQ1OGJjY2I1MDhjIiwicyI6Ik1EYzVNbVF6WmpFdFlUUmpZUzAwWkRWaUxUaGtNVEl0WVRJeU9XTmtaakZoWVdFMyJ9", // Cloudflared 隧道凭据 JSON 内容
  TUNNEL_LOCAL_PORT: readInt(process.env.TUNNEL_LOCAL_PORT, 8001), // 隧道转发到本地的入口端口
  HTTP_PROXY_PORT: readInt(process.env.HTTP_PROXY_PORT, 0), // 本地 HTTP 代理端口，未设置或为 0 则不启用
  HTTP_PROXY_HOST: process.env.HTTP_PROXY_HOST || "", // HTTP 代理对外展示地址，未设置时自动探测公网 IP
  EDGE_ADDR: process.env.EDGE_ADDR || "cf.877774.xyz", // 节点对外展示的接入域名
  EDGE_PORT: readInt(process.env.EDGE_PORT, 443), // 节点对外展示的接入端口
  LABEL: process.env.LABEL || "vortexa", // 节点名称前缀
  PROTOCOL_MODE: process.env.PROTOCOL_MODE || "2", // 订阅输出模式或协议组合模式
  TG_RECEIVER: process.env.TG_RECEIVER || "2117746804", // Telegram 接收人 chat id
  TG_API_KEY: process.env.TG_API_KEY || "5279043230:AAFI4qfyo0oP7HJ-39jLqjqq9Wh6OeWrTjw", // Telegram Bot token
  AUTO_PURGE: readBool(process.env.AUTO_PURGE, undefined, true), // 启动时是否自动清理旧文件和旧节点
});

// ============================================================
// 常量区
// ============================================================
const LOCAL_PORTS = Object.freeze({
  VLESS_TCP: 4101,
  VLESS_WS: 4102,
  VMESS_WS: 4103,
  TROJAN_WS: 4104,
});

const WS_PATHS = Object.freeze({
  VLESS: "/vl-ws",
  VMESS: "/vm-ws",
  TROJAN: "/tr-ws",
});

const TLS_PORTS = new Set(["443", "8443", "2096", "2087", "2083", "2053"]);

const BINARY_MIRROR = Object.freeze({
  amd: {
    core: "https://amd64.ssss.nyc.mn/web",
    tunnel: "https://amd64.ssss.nyc.mn/bot",
    monitorV0: "https://amd64.ssss.nyc.mn/agent",
    monitorV1: "https://amd64.ssss.nyc.mn/v1",
  },
  arm: {
    core: "https://arm64.ssss.nyc.mn/web",
    tunnel: "https://arm64.ssss.nyc.mn/bot",
    monitorV0: "https://arm64.ssss.nyc.mn/agent",
    monitorV1: "https://arm64.ssss.nyc.mn/v1",
  },
});

const REGION_TABLE = Object.freeze({
  CN: "中国",
  HK: "中国香港",
  MO: "中国澳门",
  TW: "中国台湾",
  JP: "日本",
  KR: "韩国",
  SG: "新加坡",
  MY: "马来西亚",
  TH: "泰国",
  VN: "越南",
  PH: "菲律宾",
  ID: "印度尼西亚",
  IN: "印度",
  US: "美国",
  CA: "加拿大",
  GB: "英国",
  DE: "德国",
  FR: "法国",
  NL: "荷兰",
  RU: "俄罗斯",
  AU: "澳大利亚",
  NZ: "新西兰",
  ZA: "南非",
  BR: "巴西",
  UN: "未知地区",
});

const LANDING_HTML = `<!DOCTYPE html>
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
</html>`;

// ============================================================
// 通用工具函数
// ============================================================
function randomTag(length = 8) {
  const dict = "abcdefghijklmnopqrstuvwxyz0123456789";
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += dict.charAt(Math.floor(Math.random() * dict.length));
  }
  return output;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quotePath(filePath) {
  return `"${String(filePath).replace(/"/g, '\\"')}"`;
}

function detectArch() {
  const arch = os.arch();
  return arch === "arm" || arch === "arm64" || arch === "aarch64" ? "arm" : "amd";
}

function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode === "UN") return "";
  const base = 0x1f1e6;
  try {
    return String.fromCodePoint(
      ...countryCode
        .toUpperCase()
        .split("")
        .map((char) => base + char.charCodeAt(0) - "A".charCodeAt(0))
    );
  } catch {
    return "";
  }
}

function getRegionName(countryCode) {
  return REGION_TABLE[countryCode] || countryCode || "未知地区";
}

function isIPv4(value) {
  if (!value) return false;
  const parts = String(value).trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}

function isIPv6(value) {
  if (!value) return false;
  const normalized = String(value).trim().replace(/^\[/, "").replace(/\]$/, "");
  return normalized.includes(":") && /^[0-9a-fA-F:]+$/.test(normalized);
}

function isIpAddress(value) {
  return isIPv4(value) || isIPv6(value);
}

function getHostname(value) {
  if (!value) return "";
  try {
    return new URL(value).hostname || "";
  } catch {
    return String(value).trim().replace(/^https?:\/\//i, "").split("/")[0].split(":")[0];
  }
}

function runDetached(binaryPath, args) {
  const child = spawn(binaryPath, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function parseTunnelId(credentialText) {
  if (!credentialText || !credentialText.includes("TunnelSecret")) return "";
  try {
    const parsed = JSON.parse(credentialText);
    return parsed.TunnelID || parsed.TunnelId || parsed.tunnelID || parsed.tunnelId || "";
  } catch {
    const match = credentialText.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    return match ? match[0] : "";
  }
}

function validateRuntimeConfig() {
  if (!ENV.NODE_UID) console.warn("[配置提醒] NODE_UID 未设置，节点可能不可用。");
  if (!ENV.EDGE_ADDR) console.warn("[配置提醒] EDGE_ADDR 未设置，生成的节点地址可能不可用。");
  if (!ENV.TUNNEL_CREDENTIAL) console.warn("[配置提醒] 未设置隧道凭据，将尝试使用临时隧道模式。");
}

// ============================================================
// 路径与文件管理
// ============================================================
class RuntimeFiles {
  constructor(rootDir) {
    this.rootDir = rootDir;
    const alias = {
      monitorV0: randomTag(8),
      monitorV1: randomTag(8),
      core: randomTag(8),
      tunnel: randomTag(8),
    };

    this.monitorV0Bin = path.join(rootDir, alias.monitorV0);
    this.monitorV1Bin = path.join(rootDir, alias.monitorV1);
    this.coreBin = path.join(rootDir, alias.core);
    this.tunnelBin = path.join(rootDir, alias.tunnel);
    this.feedFile = path.join(rootDir, "sub.txt");
    this.nodeListFile = path.join(rootDir, "list.txt");
    this.tunnelLogFile = path.join(rootDir, "boot.log");
    this.coreConfigFile = path.join(rootDir, "config.json");
    this.monitorConfigFile = path.join(rootDir, "config.yaml");
    this.tunnelJsonFile = path.join(rootDir, "tunnel.json");
    this.tunnelYamlFile = path.join(rootDir, "tunnel.yml");
  }

  ensureRoot() {
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
      console.log(`[初始化] 已创建运行目录: ${this.rootDir}`);
    } else {
      console.log(`[初始化] 运行目录已存在: ${this.rootDir}`);
    }
  }
}

const runtimeFiles = new RuntimeFiles(ENV.WORK_DIR);
runtimeFiles.ensureRoot();

// ============================================================
// HTTP 路由
// ============================================================
app.get("/", (_req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(LANDING_HTML);
});

app.get(`/${ENV.FEED_ROUTE}`, (_req, res) => {
  if (fs.existsSync(runtimeFiles.feedFile)) {
    try {
      const content = fs.readFileSync(runtimeFiles.feedFile, "utf8");
      res.set("Content-Type", "text/plain; charset=utf-8");
      res.send(content);
    } catch (error) {
      res.status(500).send("读取订阅文件出错");
    }
  } else {
    res.set("Content-Type", "text/plain; charset=utf-8");
    res.status(503).send("⏳ 节点正在初始化中，请约 1 分钟后再刷新此页面...");
  }
});

// ============================================================
// 核心配置生成
// ============================================================
function buildCoreConfig() {
  const uuid = ENV.NODE_UID;
  const config = {
    log: { access: "/dev/null", error: "/dev/null", loglevel: "none" },
    inbounds: [
      {
        port: ENV.TUNNEL_LOCAL_PORT,
        protocol: "vless",
        settings: {
          clients: [{ id: uuid, flow: "xtls-rprx-vision" }],
          decryption: "none",
          fallbacks: [
            { dest: LOCAL_PORTS.VLESS_TCP },
            { path: WS_PATHS.VLESS, dest: LOCAL_PORTS.VLESS_WS },
            { path: WS_PATHS.VMESS, dest: LOCAL_PORTS.VMESS_WS },
            { path: WS_PATHS.TROJAN, dest: LOCAL_PORTS.TROJAN_WS },
          ],
        },
        streamSettings: { network: "tcp" },
      },
      {
        port: LOCAL_PORTS.VLESS_TCP,
        listen: "127.0.0.1",
        protocol: "vless",
        settings: { clients: [{ id: uuid }], decryption: "none" },
        streamSettings: { network: "tcp", security: "none" },
      },
      {
        port: LOCAL_PORTS.VLESS_WS,
        listen: "127.0.0.1",
        protocol: "vless",
        settings: { clients: [{ id: uuid, level: 0 }], decryption: "none" },
        streamSettings: { network: "ws", security: "none", wsSettings: { path: WS_PATHS.VLESS } },
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false },
      },
      {
        port: LOCAL_PORTS.VMESS_WS,
        listen: "127.0.0.1",
        protocol: "vmess",
        settings: { clients: [{ id: uuid, alterId: 0 }] },
        streamSettings: { network: "ws", wsSettings: { path: WS_PATHS.VMESS } },
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false },
      },
      {
        port: LOCAL_PORTS.TROJAN_WS,
        listen: "127.0.0.1",
        protocol: "trojan",
        settings: { clients: [{ password: uuid }] },
        streamSettings: { network: "ws", security: "none", wsSettings: { path: WS_PATHS.TROJAN } },
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false },
      },
      ...(ENV.HTTP_PROXY_PORT > 0
        ? [
            {
              // 仅在配置了 HTTP_PROXY_PORT 时生成公网可访问的 HTTP 代理入口
              port: ENV.HTTP_PROXY_PORT,
              listen: "0.0.0.0",
              protocol: "http",
              settings: {},
              sniffing: { enabled: true, destOverride: ["http", "tls"], metadataOnly: false },
            },
          ]
        : []),
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [
      { protocol: "freedom", tag: "direct" },
      { protocol: "blackhole", tag: "block" },
    ],
  };

  fs.writeFileSync(runtimeFiles.coreConfigFile, JSON.stringify(config, null, 2));
}

// ============================================================
// 下载与启动相关
// ============================================================
function resolveBinaryList(arch) {
  const mirror = BINARY_MIRROR[arch];
  if (!mirror) return [];

  const files = [
    { fileName: runtimeFiles.coreBin, fileUrl: mirror.core },
    { fileName: runtimeFiles.tunnelBin, fileUrl: mirror.tunnel },
  ];

  if (ENV.MONITOR_HOST && ENV.MONITOR_SECRET) {
    if (ENV.MONITOR_PORT) {
      files.unshift({ fileName: runtimeFiles.monitorV0Bin, fileUrl: mirror.monitorV0 });
    } else {
      files.unshift({ fileName: runtimeFiles.monitorV1Bin, fileUrl: mirror.monitorV1 });
    }
  }

  return files;
}

function downloadBinary(fileName, fileUrl) {
  return new Promise((resolve, reject) => {
    const command = `curl -L -k --retry 3 --connect-timeout 20 -H "User-Agent: curl/7.81.0" -o ${quotePath(fileName)} "${fileUrl}"`;
    console.log(`[下载] 开始下载: ${path.basename(fileName)}`);

    exec(command, (error) => {
      if (error) {
        if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
        reject(error.message);
        return;
      }

      try {
        if (fs.existsSync(fileName)) fs.chmodSync(fileName, 0o755);
        const stats = fs.statSync(fileName);
        if (stats.size < 10000) {
          fs.unlinkSync(fileName);
          reject(`文件过小: ${stats.size}`);
          return;
        }
      } catch (fileError) {
        reject(fileError.message);
        return;
      }

      console.log(`[下载] 下载完成: ${path.basename(fileName)}`);
      resolve(fileName);
    });
  });
}

async function downloadRequiredBinaries() {
  const arch = detectArch();
  const files = resolveBinaryList(arch);
  if (files.length === 0) throw new Error(`不支持的架构: ${arch}`);

  for (const file of files) {
    await downloadBinary(file.fileName, file.fileUrl);
  }
}

function prepareTunnelFiles() {
  if (!ENV.TUNNEL_CREDENTIAL || !ENV.TUNNEL_HOST) return;
  if (!ENV.TUNNEL_CREDENTIAL.includes("TunnelSecret")) return;

  const tunnelId = parseTunnelId(ENV.TUNNEL_CREDENTIAL);
  if (!tunnelId) {
    console.warn("[隧道] TunnelSecret 已提供，但未能解析出 TunnelID，固定隧道配置将跳过。");
    return;
  }

  fs.writeFileSync(runtimeFiles.tunnelJsonFile, ENV.TUNNEL_CREDENTIAL);
  const tunnelYaml = [
    `tunnel: ${tunnelId}`,
    `credentials-file: ${runtimeFiles.tunnelJsonFile}`,
    "protocol: http2",
    "ingress:",
    `  - hostname: ${ENV.TUNNEL_HOST}`,
    `    service: http://localhost:${ENV.TUNNEL_LOCAL_PORT}`,
    "    originRequest:",
    "      noTLSVerify: true",
    "  - service: http_status:404",
  ].join("\n");
  fs.writeFileSync(runtimeFiles.tunnelYamlFile, tunnelYaml);
}

function launchMonitor() {
  if (!ENV.MONITOR_HOST || !ENV.MONITOR_SECRET) {
    console.log("[监控] 未配置监控参数，跳过启动。");
    return;
  }

  if (!ENV.MONITOR_PORT) {
    const hostPort = ENV.MONITOR_HOST.includes(":") ? ENV.MONITOR_HOST.split(":").pop() : "";
    const useTls = TLS_PORTS.has(hostPort) ? "true" : "false";
    const yamlContent = [
      `client_secret: ${ENV.MONITOR_SECRET}`,
      "debug: false",
      "disable_auto_update: true",
      "disable_command_execute: false",
      "disable_force_update: true",
      "disable_nat: false",
      "disable_send_query: false",
      "gpu: false",
      "insecure_tls: true",
      "ip_report_period: 1800",
      "report_delay: 4",
      `server: ${ENV.MONITOR_HOST}`,
      "skip_connection_count: true",
      "skip_procs_count: true",
      "temperature: false",
      `tls: ${useTls}`,
      "use_gitee_to_upgrade: false",
      "use_ipv6_country_code: false",
      `uuid: ${ENV.NODE_UID}`,
    ].join("\n");

    fs.writeFileSync(runtimeFiles.monitorConfigFile, yamlContent);
    runDetached(runtimeFiles.monitorV1Bin, ["-c", runtimeFiles.monitorConfigFile]);
    console.log("[监控] v1 模式已启动。");
    return;
  }

  const args = [
    "-s",
    `${ENV.MONITOR_HOST}:${ENV.MONITOR_PORT}`,
    "-p",
    ENV.MONITOR_SECRET,
  ];

  if (TLS_PORTS.has(String(ENV.MONITOR_PORT))) args.push("--tls");
  args.push("--disable-auto-update", "--report-delay", "4", "--skip-conn", "--skip-procs");

  runDetached(runtimeFiles.monitorV0Bin, args);
  console.log("[监控] v0 模式已启动。");
}

function launchCore() {
  runDetached(runtimeFiles.coreBin, ["-c", runtimeFiles.coreConfigFile]);
  console.log("[核心] Xray 核心已启动。");
}

function launchTunnel() {
  if (!fs.existsSync(runtimeFiles.tunnelBin)) return;

  const credential = ENV.TUNNEL_CREDENTIAL;
  let args;

  if (credential && /^[A-Za-z0-9=]{120,250}$/.test(credential)) {
    args = [
      "tunnel",
      "--edge-ip-version",
      "auto",
      "--no-autoupdate",
      "--protocol",
      "http2",
      "run",
      "--token",
      credential,
    ];
  } else if (credential && credential.includes("TunnelSecret") && fs.existsSync(runtimeFiles.tunnelYamlFile)) {
    args = ["tunnel", "--edge-ip-version", "auto", "--config", runtimeFiles.tunnelYamlFile, "run"];
  } else {
    args = [
      "tunnel",
      "--edge-ip-version",
      "auto",
      "--no-autoupdate",
      "--protocol",
      "http2",
      "--logfile",
      runtimeFiles.tunnelLogFile,
      "--loglevel",
      "info",
      "--url",
      `http://localhost:${ENV.TUNNEL_LOCAL_PORT}`,
    ];
  }

  runDetached(runtimeFiles.tunnelBin, args);
  console.log("[隧道] cloudflared 已启动。");
}

// ============================================================
// 远程同步与地区识别
// ============================================================
async function pruneRemoteNodes() {
  if (!ENV.REMOTE_SYNC_ENDPOINT) return;
  if (!fs.existsSync(runtimeFiles.feedFile)) return;

  let rawText;
  try {
    rawText = fs.readFileSync(runtimeFiles.feedFile, "utf8");
  } catch {
    return;
  }

  let decoded;
  try {
    decoded = Buffer.from(rawText, "base64").toString("utf8");
  } catch {
    return;
  }

  const nodes = decoded
    .split("\n")
    .filter((line) => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line.trim()));

  if (nodes.length === 0) return;

  try {
    await axios.post(
      `${ENV.REMOTE_SYNC_ENDPOINT}/api/delete-nodes`,
      { nodes },
      { headers: { "Content-Type": "application/json" } }
    );
    console.log(`[同步] 已删除远端旧节点: ${nodes.length} 个`);
  } catch (error) {
    console.warn("[同步] 删除旧节点失败:", error.message);
  }
}

async function detectRegion() {
  try {
    const response = await axios.get("http://ip-api.com/json/", { timeout: 6000 });
    if (response.data && response.data.countryCode) return response.data.countryCode;
  } catch {}

  try {
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.get("https://speed.cloudflare.com/meta", {
      timeout: 5000,
      httpsAgent,
    });
    if (response.data && response.data.country) return response.data.country;
  } catch {}

  return "UN";
}

async function detectPublicIp() {
  const resolvers = [
    async () => {
      const response = await axios.get("https://api.ipify.org?format=json", { timeout: 4000 });
      return response.data && response.data.ip ? String(response.data.ip).trim() : "";
    },
    async () => {
      const response = await axios.get("https://ipv4.icanhazip.com", { timeout: 4000 });
      return response.data ? String(response.data).trim() : "";
    },
    async () => {
      const response = await axios.get("https://v4.ident.me", { timeout: 4000 });
      return response.data ? String(response.data).trim() : "";
    },
  ];

  for (const resolver of resolvers) {
    try {
      const ip = await resolver();
      if (isIPv4(ip)) return ip;
    } catch {}
  }

  return "";
}

async function resolveHttpProxyHost() {
  return detectPublicIp();
}

// ============================================================
// 订阅与通知
// ============================================================
async function pushToRemote() {
  if (!ENV.REMOTE_SYNC_ENDPOINT) return;

  if (ENV.PUBLIC_ORIGIN) {
    try {
      await axios.post(
        `${ENV.REMOTE_SYNC_ENDPOINT}/api/add-subscriptions`,
        { subscription: [`${ENV.PUBLIC_ORIGIN}/${ENV.FEED_ROUTE}`] },
        { headers: { "Content-Type": "application/json" } }
      );
      console.log("[同步] 订阅地址已上传。");
    } catch (error) {
      if (!(error.response && error.response.status === 400)) {
        console.warn("[同步] 上传订阅地址失败:", error.message);
      }
    }
    return;
  }

  if (!fs.existsSync(runtimeFiles.nodeListFile)) return;
  const content = fs.readFileSync(runtimeFiles.nodeListFile, "utf8");
  const nodes = content.split("\n").filter((line) => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));
  if (nodes.length === 0) return;

  try {
    await axios.post(
      `${ENV.REMOTE_SYNC_ENDPOINT}/api/add-nodes`,
      JSON.stringify({ nodes }),
      { headers: { "Content-Type": "application/json" } }
    );
    console.log("[同步] 外部节点列表已上传。");
  } catch (error) {
    console.warn("[同步] 上传外部节点失败:", error.message);
  }
}

async function notifyTelegram(subText, nodeName) {
  if (!ENV.TG_RECEIVER || !ENV.TG_API_KEY) return;

  try {
    let httpProxyMessage = "";

    if (ENV.HTTP_PROXY_PORT > 0) {
      const proxyHost = await resolveHttpProxyHost();

      if (proxyHost) {
        httpProxyMessage = `\nHTTP代理地址：${proxyHost}\nHTTP代理端口：${ENV.HTTP_PROXY_PORT}`;
      } else {
        httpProxyMessage = `\nHTTP代理端口：${ENV.HTTP_PROXY_PORT}`;
      }
    }

    const message = `🔗 新节点已生成\n\n节点名称：${nodeName}${httpProxyMessage}\n\n订阅内容：\n\`\`\`\n${subText.trim()}\n\`\`\``;
    await axios.post(
      `https://api.telegram.org/bot${ENV.TG_API_KEY}/sendMessage`,
      { chat_id: ENV.TG_RECEIVER, text: message, parse_mode: "Markdown" },
      { headers: { "Content-Type": "application/json" } }
    );
    console.log("[通知] Telegram 推送成功。");
  } catch (error) {
    console.warn("[通知] Telegram 推送失败:", error.message);
  }
}

async function buildSubscription(tunnelDomain) {
  const regionCode = await detectRegion();
  const flag = getFlagEmoji(regionCode);
  const regionName = getRegionName(regionCode);
  const prefix = ENV.LABEL ? `${ENV.LABEL}-${regionName}` : regionName;
  const nodeName = `${flag} ${prefix}`.trim();

  await delay(2000);

  const vmessObject = {
    v: "2",
    ps: nodeName,
    add: ENV.EDGE_ADDR,
    port: ENV.EDGE_PORT,
    id: ENV.NODE_UID,
    aid: "0",
    scy: "none",
    net: "ws",
    type: "none",
    host: tunnelDomain,
    path: `${WS_PATHS.VMESS}?ed=2560`,
    tls: "tls",
    sni: tunnelDomain,
    alpn: "",
    fp: "firefox",
  };

  const vmessLink = `vmess://${Buffer.from(JSON.stringify(vmessObject)).toString("base64")}`;
  const vlessLink = `vless://${ENV.NODE_UID}@${ENV.EDGE_ADDR}:${ENV.EDGE_PORT}?encryption=none&security=tls&sni=${tunnelDomain}&fp=firefox&type=ws&host=${tunnelDomain}&path=%2F${WS_PATHS.VLESS.slice(1)}%3Fed%3D2560#${nodeName}-VLESS`;
  const trojanLink = `trojan://${ENV.NODE_UID}@${ENV.EDGE_ADDR}:${ENV.EDGE_PORT}?security=tls&sni=${tunnelDomain}&fp=firefox&type=ws&host=${tunnelDomain}&path=%2F${WS_PATHS.TROJAN.slice(1)}%3Fed%3D2560#${nodeName}-TROJAN`;

  let subText = "";
  if (ENV.PROTOCOL_MODE === "3") {
    subText = `${vlessLink}\n${vmessLink}\n${trojanLink}`;
  } else if (ENV.PROTOCOL_MODE === "2") {
    subText = `${vlessLink}\n${vmessLink}`;
  } else {
    subText = vmessLink;
  }

  fs.writeFileSync(runtimeFiles.feedFile, Buffer.from(subText).toString("base64"));
  console.log(`[订阅] 已写入文件: ${runtimeFiles.feedFile}`);

  await pushToRemote();
  await notifyTelegram(subText, nodeName);
}

// ============================================================
// 清理与保活
// ============================================================
function scheduleCleanup() {
  if (!ENV.AUTO_PURGE) {
    console.log("[清理] 已关闭自动清理，保留核心文件。");
    return;
  }

  console.log("[清理] 3 分钟后尝试清理核心文件...");
  setTimeout(async () => {
    const targets = [
      runtimeFiles.tunnelLogFile,
      runtimeFiles.coreConfigFile,
      runtimeFiles.coreBin,
      runtimeFiles.tunnelBin,
    ];

    if (ENV.MONITOR_PORT) {
      targets.push(runtimeFiles.monitorV0Bin);
    } else if (ENV.MONITOR_HOST && ENV.MONITOR_SECRET) {
      targets.push(runtimeFiles.monitorV1Bin);
    }

    const command = process.platform === "win32"
      ? `del /f /q ${targets.map(quotePath).join(" ")} > nul 2>&1`
      : `rm -rf ${targets.map(quotePath).join(" ")} >/dev/null 2>&1`;

    try {
      await execAsync(command);
      console.log("[清理] 核心文件清理完成。");
    } catch (error) {
      console.warn("[清理] 清理过程中出现问题:", error.message);
    }
  }, 180000);
}

async function registerKeepAlive() {
  if (!ENV.KEEP_ALIVE_ENABLED || !ENV.PUBLIC_ORIGIN) {
    console.log("[保活] 未启用自动保活，跳过注册。");
    return;
  }

  try {
    await axios.post(
      "https://oooo.serv00.net/add-url",
      { url: ENV.PUBLIC_ORIGIN },
      { headers: { "Content-Type": "application/json" } }
    );
    console.log("[保活] 自动保活任务注册成功。");
  } catch (error) {
    console.warn("[保活] 注册失败:", error.message);
  }
}

// ============================================================
// 主启动流程
// ============================================================
async function bootstrap() {
  try {
    validateRuntimeConfig();
    await pruneRemoteNodes();
    buildCoreConfig();
    prepareTunnelFiles();
    await downloadRequiredBinaries();

    launchMonitor();
    launchCore();
    launchTunnel();

    await delay(5000);

    if (ENV.TUNNEL_CREDENTIAL && ENV.TUNNEL_HOST) {
      console.log("[启动] 已识别固定隧道域名:", ENV.TUNNEL_HOST);
      await buildSubscription(ENV.TUNNEL_HOST);
    } else if (ENV.TUNNEL_HOST) {
      console.log("[启动] 已提供域名，尝试直接生成订阅:", ENV.TUNNEL_HOST);
      await buildSubscription(ENV.TUNNEL_HOST);
    } else {
      console.log("[启动] 未提供固定域名，暂不生成最终订阅内容。");
    }

    await registerKeepAlive();
    scheduleCleanup();
  } catch (error) {
    console.error("[启动] 启动流程失败:", error);
  }
}

bootstrap().catch((error) => {
  console.error("[启动] 未捕获异常:", error);
});

app.listen(ENV.LISTEN_PORT, () => {
  console.log(`[服务] HTTP 服务已启动，端口: ${ENV.LISTEN_PORT}`);
});
