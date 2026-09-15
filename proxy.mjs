import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 路径常量：绿色文件夹相对定位（与 CWD 无关）
// ---------------------------------------------------------------------------
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(ROOT, 'config.json');
const BACKUP_PATH = path.join(ROOT, 'config.backup.json');
const CONSOLE_DIR = path.join(ROOT, 'console');
const CONSOLE_INDEX = path.join(CONSOLE_DIR, 'index.html');

// 可选：RELOAD_MODE='cache'（默认，读内存，面板保存后即时生效）| 'disk'（每请求读盘，防御手工改文件）
const RELOAD_MODE = (process.env.RELOAD_MODE || 'cache').toLowerCase();

// 请求体上限与上游超时（B2，可用环境变量覆盖）
const MAX_BODY_BYTES = parseInt(process.env.PROXY_MAX_BODY || String(10 * 1024 * 1024), 10);      // /v1/messages body 上限，默认 10MB
const UPSTREAM_TIMEOUT_MS = parseInt(process.env.PROXY_UPSTREAM_TIMEOUT || '120000', 10);         // 非流式上游总超时，默认 120s
const STREAM_IDLE_TIMEOUT_MS = parseInt(process.env.PROXY_STREAM_IDLE_TIMEOUT || '60000', 10);    // 流式空闲超时（无数据断开），默认 60s

// ---------------------------------------------------------------------------
// 默认播种配置（首次无 config.json 时写入）
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  version: 1,
  global: { port: 18101, host: '127.0.0.1', autoOpenBrowser: true },
  activeProviderId: 'opencode',
  providers: [
    {
      id: 'opencode',
      name: 'Codex Zen (big-pickle)',
      enabled: true,
      type: 'predefined',
      baseUrl: 'https://opencode.ai/zen/v1',
      authType: 'bearer',
      apiKey: '',
      model: 'big-pickle',
      extraHeaders: { 'User-Agent': 'opencode/latest/1.18.18/cli', 'x-opencode-client': 'cli' },
      notes: '内置预设（原 claude-zen-proxy）',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek V4 Flash (自建)',
      enabled: true,
      type: 'generic',
      baseUrl: '',
      authType: 'bearer',
      apiKey: '',
      model: 'deepseek-chat',
      extraHeaders: {},
      notes: '自建/自托管，OpenAI 兼容',
    },
    {
      id: 'volc-ark',
      name: '火山方舟 ARK',
      enabled: true,
      type: 'predefined',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      authType: 'bearer',
      apiKey: '',
      model: '',
      extraHeaders: {},
      notes: 'model 填 Endpoint id',
    },
    {
      id: 'generic',
      name: '通用 OpenAI 兼容',
      enabled: true,
      type: 'generic',
      baseUrl: '',
      authType: 'bearer',
      apiKey: '',
      model: '',
      extraHeaders: {},
      notes: '任意 OpenAI 兼容端点',
    },
  ],
};

// ---------------------------------------------------------------------------
// 配置加载 + 内存缓存
// ---------------------------------------------------------------------------
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function builtinConfig() {
  // 播种副本：避免默认对象被外部改写
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

// 配置损坏重建时，尽力从既有配置/备份恢复安全字段（authToken/host），防止鉴权被静默关闭
function recoverSecurityFields() {
  for (const f of [BACKUP_PATH, CONFIG_PATH]) {
    try {
      if (!fs.existsSync(f)) continue;
      const c = JSON.parse(fs.readFileSync(f, 'utf8'));
      const g = (c && c.global) || {};
      if (g.authToken || g.host) return { authToken: String(g.authToken || ''), host: String(g.host || '') };
    } catch { /* try next */ }
  }
  return null;
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      const seed = builtinConfig();
      writeConfigAtomic(seed);
      log('config.json 不存在，已播种默认配置');
      return seed;
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    if (!Array.isArray(cfg.providers)) throw new Error('providers 数组缺失');
    if (!cfg.global) cfg.global = {};
    return cfg;
  } catch (e) {
    // 损坏：备份后重新播种，保持运行
    if (fs.existsSync(CONFIG_PATH)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      try {
        fs.copyFileSync(CONFIG_PATH, path.join(ROOT, `config.corrupt.${ts}.json`));
        log('config.json 解析失败，已备份到 config.corrupt.', ts, ':', e.message);
      } catch (be) {
        log('config.json 备份失败:', be.message);
      }
    }
    const seed = builtinConfig();
    // 损坏重建不得静默关闭鉴权或改变监听范围：恢复安全字段后再落盘
    const rec = recoverSecurityFields();
    if (rec) {
      if (rec.authToken) seed.global.authToken = rec.authToken;
      if (rec.host) seed.global.host = rec.host;
      log('已从既有配置恢复安全字段 (authToken/host)');
    }
    try {
      writeConfigAtomic(seed);
      log('已重新播种默认配置');
    } catch (we) {
      log('播种配置写盘失败:', we.message);
    }
    return seed;
  }
}

function writeConfigAtomic(cfg) {
  // 原子写：临时文件 + rename
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
}

// 内存状态（只有 PUT /api/config 会写 config.json；请求路径只读）
const inMemory = {
  config: null, // 当前完整配置
  port: 18101,
};

function refreshActiveProvider() {
  const cfg = inMemory.config;
  if (!cfg) return null;
  let active = null;
  if (cfg.activeProviderId) {
    const p = cfg.providers.find((x) => x.id === cfg.activeProviderId && x.enabled);
    if (p) active = p;
  }
  if (!active) {
    active = cfg.providers.find((x) => x.enabled) || null;
    if (active) cfg.activeProviderId = active.id;
  }
  return active;
}

// 从磁盘或内存取当前配置（按 RELOAD_MODE）
function currentConfig() {
  if (RELOAD_MODE === 'disk') return loadConfig();
  return inMemory.config;
}

// 规范化 provider：去 baseUrl 尾部 '/'，补默认字段
function normalizeProvider(p) {
  if (!p) return null;
  return {
    id: p.id || '',
    name: p.name || p.id || '',
    enabled: !!p.enabled,
    type: p.type || 'generic',
    baseUrl: String(p.baseUrl || '').replace(/\/+$/, ''),
    authType: p.authType || 'bearer',
    apiKey: p.apiKey || '',
    model: p.model || '',
    extraHeaders: (p.extraHeaders && typeof p.extraHeaders === 'object') ? p.extraHeaders : {},
    keepAnthropicAuth: !!p.keepAnthropicAuth,
  };
}

// 当前活跃 provider 的 getter（每次取当前状态，避免闭包过期）
function activeProvider() {
  let cfg = currentConfig();
  if (!cfg) cfg = inMemory.config;
  if (!cfg) return null;
  let active = null;
  if (cfg.activeProviderId) {
    const p = cfg.providers.find((x) => x.id === cfg.activeProviderId && x.enabled);
    if (p) active = p;
  }
  if (!active) active = cfg.providers.find((x) => x.enabled) || null;
  return normalizeProvider(active);
}

// opencode/zen 上游需要 x-opencode-session 会话头，缺失返回 MissingSessionID
const opencodeSession = () => `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

// 登录鉴权：global.authToken（共享令牌）。空令牌 => 不鉴权（内网直连不变）
function authToken() {
  if (process.env.PROXY_AUTH_TOKEN) return process.env.PROXY_AUTH_TOKEN;
  const c = currentConfig() || inMemory.config;
  return (c.global && c.global.authToken) || '';
}
function requireAuth(req) {
  const t = authToken();
  if (!t) return true; // 未设令牌 => 不鉴权（内网直连不变）
  const got = req.headers['x-api-key']
    || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  return !!got && got === t;
}

// 判定监听地址是否回环
function isLoopbackHost(host) {
  if (!host) return true;
  const h = String(host).toLowerCase();
  if (h === 'localhost' || h === '::1' || h.startsWith('127.')) return true;
  return false;
}

// 启动安全校验：非回环监听（对外暴露）且未设鉴权令牌 => fail-closed 拒绝启动
function assertListenSecurity() {
  const host = (inMemory.config && inMemory.config.global && inMemory.config.global.host) || '127.0.0.1';
  if (!isLoopbackHost(host) && !authToken()) {
    console.error('[green-proxy] 安全拒绝: 监听地址 ' + host + ' 非仅回环且未配置 authToken（global.authToken 或 PROXY_AUTH_TOKEN）。');
    console.error('[green-proxy] 代理拒绝启动：对外监听必须配置鉴权令牌，防止无鉴权暴露。');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 限流 / 防爆破（内存实现，按 IP；参数可用环境变量覆盖）
//   PROXY_RATE_WINDOW_MS  失败统计窗口，默认 300000（5 分钟）
//   PROXY_RATE_MAX_FAILS  窗口内最大鉴权失败次数，默认 5
//   PROXY_RATE_BLOCK_MS   触发后封锁时长，默认 900000（15 分钟）
//   PROXY_RATE_MAX_REQ    /v1/messages 每 IP 每分钟请求上限，默认 0 = 不限
//   PROXY_TRUST_PROXY     =1 时信任 X-Forwarded-For（置于反代之后时启用）
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = parseInt(process.env.PROXY_RATE_WINDOW_MS || '300000', 10);
const RATE_MAX_FAILS = parseInt(process.env.PROXY_RATE_MAX_FAILS || '5', 10);
const RATE_BLOCK_MS = parseInt(process.env.PROXY_RATE_BLOCK_MS || '900000', 10);
const RATE_MAX_REQ = parseInt(process.env.PROXY_RATE_MAX_REQ || '0', 10);
const TRUST_PROXY = process.env.PROXY_TRUST_PROXY === '1';

const rateState = new Map(); // ip -> { fails: number[], blockedUntil: number, reqs: number[] }

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateEntry(ip) {
  let e = rateState.get(ip);
  if (!e) {
    e = { fails: [], blockedUntil: 0, reqs: [] };
    rateState.set(ip, e);
    // 惰性清理：状态条目过多时丢弃已过期项，防止内存无限增长
    if (rateState.size > 10000) {
      const now = Date.now();
      for (const [k, v] of rateState) {
        if (now - (v.fails[v.fails.length - 1] || 0) > RATE_WINDOW_MS && now - (v.reqs[v.reqs.length - 1] || 0) > 60000 && (!v.blockedUntil || v.blockedUntil < now)) rateState.delete(k);
      }
    }
  }
  return e;
}

function pruneRateEntry(e, now) {
  while (e.fails.length && now - e.fails[0] > RATE_WINDOW_MS) e.fails.shift();
  while (e.reqs.length && now - e.reqs[0] > 60000) e.reqs.shift();
}

function isAuthBlocked(ip) {
  const now = Date.now();
  const e = rateEntry(ip);
  pruneRateEntry(e, now);
  if (e.blockedUntil && e.blockedUntil > now) return true;
  if (e.blockedUntil && e.blockedUntil <= now) e.blockedUntil = 0;
  return false;
}

function noteAuthFail(ip) {
  const now = Date.now();
  const e = rateEntry(ip);
  pruneRateEntry(e, now);
  e.fails.push(now);
  if (e.fails.length >= RATE_MAX_FAILS) {
    e.blockedUntil = now + RATE_BLOCK_MS;
    e.fails = [];
    log(`rate-limit: IP ${ip} 鉴权失败过多，封锁 ${Math.round(RATE_BLOCK_MS / 60000)} 分钟`);
  }
}

function noteRequest(ip) {
  if (!RATE_MAX_REQ) return false;
  const now = Date.now();
  const e = rateEntry(ip);
  pruneRateEntry(e, now);
  e.reqs.push(now);
  return e.reqs.length > RATE_MAX_REQ;
}

// 组装上游请求头
function upstreamHeaders(provider, clientAuth) {
  const headers = { 'Content-Type': 'application/json' };
  if (provider.authType === 'bearer' && provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  } else if (provider.authType === 'none' && provider.keepAnthropicAuth && clientAuth) {
    headers['Authorization'] = clientAuth.startsWith('Bearer ') ? clientAuth : `Bearer ${clientAuth}`;
  }
  // opencode/zen 免费档强制要求会话头
  if (/opencode\.ai\/zen/i.test(String(provider.baseUrl)) && !(provider.extraHeaders && provider.extraHeaders['x-opencode-session'])) {
    headers['x-opencode-session'] = opencodeSession();
  }
  // extraHeaders 覆盖默认（对象展开顺序在后）
  return { ...headers, ...provider.extraHeaders };
}

function clientAuthOf(req) {
  return req.headers['x-api-key'] || req.headers['authorization'] || '';
}

// ---------------------------------------------------------------------------
// Anthropic <-> OpenAI 转换（核心，逐字节保留原逻辑）
// ---------------------------------------------------------------------------
function convertMessages(messages, system) {
  const out = [];
  if (system) {
    out.push({ role: 'system', content: typeof system === 'string' ? system : '' });
  }
  for (const m of messages) {
    const role = m.role;
    const content = m.content;
    // assistant 消息可能含 tool_use
    if (role === 'assistant' && Array.isArray(content)) {
      const textParts = [];
      const toolCalls = [];
      for (const c of content) {
        if (c.type === 'text' && c.text) textParts.push(c.text);
        else if (c.type === 'tool_use') {
          toolCalls.push({
            id: c.id || `call_${Math.random().toString(36).slice(2, 10)}`,
            type: 'function',
            function: { name: c.name, arguments: typeof c.input === 'string' ? c.input : JSON.stringify(c.input ?? {}) },
          });
        }
      }
      const obj = { role: 'assistant', content: textParts.join('') || null };
      if (toolCalls.length) obj.tool_calls = toolCalls;
      out.push(obj);
      continue;
    }
    // user 消息可能含 tool_result
    if (role === 'user' && Array.isArray(content)) {
      const textParts = [];
      const toolResults = [];
      for (const c of content) {
        if (c.type === 'text' && c.text) textParts.push(c.text);
        else if (c.type === 'tool_result') {
          const rc = c.content;
          const rcText = Array.isArray(rc) ? rc.map((x) => (x.type === 'text' ? x.text : '')).join('') : String(rc ?? '');
          toolResults.push({ tool_call_id: c.tool_use_id || 'call_x', content: rcText, role: 'tool' });
        }
      }
      if (toolResults.length) {
        // OpenAI 要求 tool 结果作为独立 tool 角色消息，且必须紧跟对应的 tool_calls；
        // 不能在其间插入空 user 消息，否则上游报 "tool_calls must be followed by tool messages"
        for (const tr of toolResults) out.push(tr);
        if (textParts.join('')) out.push({ role: 'user', content: textParts.join('') });
      } else {
        out.push({ role: 'user', content: textParts.join('') || '' });
      }
      continue;
    }
    // 一般文本消息
    const plain = Array.isArray(content)
      ? content.map((c) => (c.type === 'text' ? c.text : c.type === 'image' ? '[image]' : '')).join('')
      : String(content ?? '');
    out.push({ role, content: plain });
  }
  return out;
}

// Anthropic tools -> OpenAI tools
function convertTools(tools) {
  if (!Array.isArray(tools)) return undefined;
  const out = [];
  for (const t of tools) {
    if (t.type === 'custom' || t.type === 'web_search_20250305') continue;
    // 已是 OpenAI 格式
    if (t.type === 'function' && t.function) { out.push(t); continue; }
    const name = t.name;
    const desc = t.description || '';
    const inputSchema = t.input_schema || {};
    out.push({
      type: 'function',
      function: {
        name,
        description: desc,
        parameters: inputSchema,
      },
    });
  }
  return out.length ? out : undefined;
}

function anthropicResponse(openaiBody, fallbackModel) {
  const choice = openaiBody.choices && openaiBody.choices[0];
  const message = choice && choice.message ? choice.message : {};
  const text = String(message.content ?? '');
  const toolCalls = message.tool_calls || [];
  const finish = choice && choice.finish_reason;
  let stopReason =
    finish === 'stop' ? 'end_turn' : finish === 'length' ? 'max_tokens' : 'end_turn';
  const content = [];
  if (text) content.push({ type: 'text', text });
  if (toolCalls.length) {
    stopReason = 'tool_use';
    for (const tc of toolCalls) {
      let input = {};
      try { input = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function.arguments || {}); } catch { input = {}; }
      content.push({
        type: 'tool_use',
        id: tc.id || `toolu_${Math.random().toString(36).slice(2, 10)}`,
        name: tc.function.name,
        input,
      });
    }
  }
  const usage = openaiBody.usage || {};
  return {
    id: openaiBody.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: openaiBody.model || fallbackModel || 'big-pickle',
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
    },
  };
}

function sseEncode(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

// ---------------------------------------------------------------------------
// 上游调用（供应商化）
// ---------------------------------------------------------------------------
// 日志/错误透传脱敏：打码疑似密钥片段并截断，避免上游错误体泄露凭证
function sanitizeUpstreamSnippet(text) {
  return String(text || '')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-****')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ****')
    .replace(/(?:ark-|ghp_)[A-Za-z0-9_-]{8,}/g, '$1****')
    .slice(0, 200);
}

async function upstreamChat(body, provider, clientAuth) {
  const url = `${provider.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: upstreamHeaders(provider, clientAuth),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`upstream ${res.status}: ${sanitizeUpstreamSnippet(text)}`);
  }
  return { status: res.status, text };
}

async function handleMessages(req, res, rawBody, apiKey) {
  let anthropic;
  try {
    anthropic = JSON.parse(rawBody);
  } catch (e) {
    sendJson(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'bad json' } });
    return;
  }

  const provider = activeProvider();
  if (!provider || !provider.baseUrl) {
    sendJson(res, 502, {
      type: 'error',
      error: {
        type: 'api_error',
        message: '当前供应商未配置 baseUrl，请在控制台 http://127.0.0.1:' + inMemory.port + '/console 配置后保存。',
      },
    });
    return;
  }
  if (provider.authType === 'bearer' && !provider.apiKey) {
    sendJson(res, 502, {
      type: 'error',
      error: { type: 'api_error', message: `${provider.name}: 未配置 API Key，请在控制台填写后保存。` },
    });
    return;
  }

  // 供应商 model 为权威（控制台配置）；客户端传入 model 仅作 fallback，
  // 避免 Claude 侧 ANTHROPIC_MODEL 与上游模型名不一致导致 400
  const model = provider.model || anthropic.model || 'big-pickle';
  const system = anthropic.system || '';
  const stream = !!anthropic.stream;
  log(`MSG provider=${provider.id} model=${model} max_tokens=${anthropic.max_tokens} stream=${stream} msgs=${(anthropic.messages || []).length} sysLen=${typeof system === 'string' ? system.length : JSON.stringify(system).length}`);
  const openaiBody = {
    model,
    stream,
    messages: convertMessages(anthropic.messages || [], system),
  };
  const tools = convertTools(anthropic.tools);
  if (tools) openaiBody.tools = tools;
  if (anthropic.tool_choice) {
    if (anthropic.tool_choice.type === 'auto') openaiBody.tool_choice = 'auto';
    else if (anthropic.tool_choice.type === 'any') openaiBody.tool_choice = 'required';
    else if (anthropic.tool_choice.type === 'none') openaiBody.tool_choice = 'none';
    else if (anthropic.tool_choice.type === 'tool' && anthropic.tool_choice.name) {
      openaiBody.tool_choice = { type: 'function', function: { name: anthropic.tool_choice.name } };
    }
  }
  if (anthropic.max_tokens) openaiBody.max_tokens = anthropic.max_tokens;
  if (anthropic.temperature !== undefined) openaiBody.temperature = anthropic.temperature;
  if (anthropic.top_p !== undefined) openaiBody.top_p = anthropic.top_p;

  const headers = upstreamHeaders(provider, apiKey);

  // Non-streaming
  if (!stream) {
    try {
      const { text } = await upstreamChat(openaiBody, provider, apiKey);
      const parsed = JSON.parse(text);
      sendJson(res, 200, anthropicResponse(parsed, provider.model));
    } catch (e) {
      log('non-stream upstream error:', e.message);
      sendJson(res, 502, { type: 'error', error: { type: 'api_error', message: e.message } });
    }
    return;
  }

  // Streaming: forward OpenAI SSE, convert chunks to Anthropic SSE-ish
  // 流式空闲超时：每收到数据重置计时，超过 STREAM_IDLE_TIMEOUT_MS 无数据则中止，防悬挂连接
  const streamAbort = new AbortController();
  let idleTimer = setTimeout(() => streamAbort.abort(new Error(`stream idle over ${STREAM_IDLE_TIMEOUT_MS}ms`)), STREAM_IDLE_TIMEOUT_MS);
  const bumpIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => streamAbort.abort(new Error(`stream idle over ${STREAM_IDLE_TIMEOUT_MS}ms`)), STREAM_IDLE_TIMEOUT_MS);
  };
  try {
    const url = `${provider.baseUrl}/chat/completions`;
    const upstreamRes = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(openaiBody),
      signal: streamAbort.signal,
    });
    if (!upstreamRes.ok) {
      const t = await upstreamRes.text();
      clearTimeout(idleTimer);
      sendJson(res, 502, { type: 'error', error: { type: 'api_error', message: `upstream ${upstreamRes.status}: ${sanitizeUpstreamSnippet(t)}` } });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    // Anthropic message_start
    res.write(sseEncode({
      type: 'message_start',
      message: {
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }));
    let full = '';
    let toolIdx = 0;          // 文本块固定 index 0, 工具块从 1 起
    let stopReason = 'end_turn';
    const openedTools = new Map(); // toolCallIndex -> anthIndex
    const reader = upstreamRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bumpIdle();
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let chunk;
        try { chunk = JSON.parse(data); } catch { continue; }
        const c0 = chunk.choices && chunk.choices[0];
        if (!c0) continue;
        const delta = c0.delta || {};
        const piece = delta.content || '';
        if (piece) {
          full += piece;
          res.write(sseEncode({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } }));
        }
        // tool_calls (indexed streaming)
        if (Array.isArray(delta.tool_calls)) {
          for (const tcall of delta.tool_calls) {
            const oidx = tcall.index ?? 0;
            let anthIndex = openedTools.get(oidx);
            if (anthIndex === undefined) {
              toolIdx += 1;
              anthIndex = toolIdx;
              openedTools.set(oidx, anthIndex);
              const fn = tcall.function || {};
              res.write(sseEncode({
                type: 'content_block_start',
                index: anthIndex,
                content_block: {
                  type: 'tool_use',
                  id: tcall.id || `toolu_${Math.random().toString(36).slice(2, 10)}`,
                  name: fn.name || '',
                  input: {},
                },
              }));
            }
            const argDelta = tcall.function && tcall.function.arguments;
            if (argDelta) {
              res.write(sseEncode({
                type: 'content_block_delta',
                index: anthIndex,
                delta: { type: 'input_json_delta', partial_json: argDelta },
              }));
            }
          }
        }
        if (c0.finish_reason === 'tool_calls') {
          stopReason = 'tool_use';
          for (const oidx of openedTools.keys()) {
            res.write(sseEncode({ type: 'content_block_stop', index: openedTools.get(oidx) }));
          }
        }
      }
    }
    // 流正常结束，清理空闲计时器
    clearTimeout(idleTimer);
    // message_delta (stop)
    res.write(sseEncode({
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 0 },
    }));
    res.write(sseEncode({ type: 'message_stop' }));
    res.end();
    log('stream done, chars:', full.length, 'tools:', openedTools.size);
  } catch (e) {
    clearTimeout(idleTimer);
    log('stream upstream error:', e.message);
    if (!res.headersSent) sendJson(res, 502, { type: 'error', error: { type: 'api_error', message: e.message } });
    else res.end();
  }
}

// ---------------------------------------------------------------------------
// Admin 控制器
// ---------------------------------------------------------------------------
const startupMs = Date.now();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 2 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// 脱敏配置：GET /api/config 返回时对 apiKey 打码，避免泄露明文密钥
function desensitizeConfig(cfg) {
  const copy = JSON.parse(JSON.stringify(cfg));
  const provs = Array.isArray(copy.providers) ? copy.providers : [];
  for (const p of provs) {
    if (p && typeof p.apiKey === 'string' && p.apiKey.length > 0) {
      p.apiKey = p.apiKey.slice(0, 4) + '****' + p.apiKey.slice(-4);
      p.apiKeyRedacted = true;
    }
  }
  return copy;
}

async function handleApi(req, res, pathname) {
  // GET /api/config —— 脱敏返回（避免泄露明文 apiKey）
  if (req.method === 'GET' && pathname === '/api/config') {
    const cfg = currentConfig() || inMemory.config;
    return sendJson(res, 200, desensitizeConfig(cfg));
  }

  // PUT /api/config —— 面板保存（唯一的写盘点）
  if (req.method === 'PUT' && pathname === '/api/config') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      return sendJson(res, 400, { ok: false, message: 'bad json: ' + e.message });
    }
    if (!Array.isArray(body.providers)) {
      return sendJson(res, 400, { ok: false, message: 'providers 数组缺失' });
    }
    if (!body.global) body.global = {};
    // 合入：前端对已保存(脱敏)的 apiKey 剔除该字段；对缺失 apiKey 的 provider 沿用内存旧 key，避免脱敏占位写盘破坏凭证
    const prev = (inMemory.config && inMemory.config.providers) || [];
    for (const nb of body.providers) {
      if (nb && !('apiKey' in nb)) {
        const old = prev.find((x) => x && x.id === nb.id);
        if (old && old.apiKey) nb.apiKey = old.apiKey;
      }
    }
    // 写盘前轮转备份（覆盖式，1 份）
    try {
      if (fs.existsSync(CONFIG_PATH)) fs.copyFileSync(CONFIG_PATH, BACKUP_PATH);
    } catch (e) {
      log('备份 config 失败:', e.message);
    }
    try {
      writeConfigAtomic(body);
    } catch (e) {
      return sendJson(res, 500, { ok: false, message: '写入失败: ' + e.message });
    }
    // 立即重载内存态 -> 面板保存即生效
    inMemory.config = body;
    inMemory.port = body.global.port || inMemory.port;
    refreshActiveProvider();
    log('config 已保存并热更新');
    return sendJson(res, 200, { ok: true, message: 'saved' });
  }

  // GET /api/status
  if (req.method === 'GET' && pathname === '/api/status') {
    const act = activeProvider();
    const cfg = currentConfig() || inMemory.config;
    return sendJson(res, 200, {
      running: true,
      port: inMemory.port,
      version: (cfg && cfg.version) || 1,
      activeProvider: act ? { id: act.id, name: act.name, model: act.model, baseUrl: act.baseUrl } : null,
      enabledProviders: (cfg && cfg.providers || []).filter((p) => p.enabled).map((p) => ({ id: p.id, name: p.name, model: p.model })),
      uptimeMs: Date.now() - startupMs,
    });
  }

  // POST /api/test —— 隔离测试某 provider，不影响运行态
  if (req.method === 'POST' && pathname === '/api/test') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { body = {}; }
    const cfg = currentConfig() || inMemory.config;
    const p = (cfg.providers || []).find((x) => x.id === body.providerId);
    if (!p) return sendJson(res, 404, { ok: false, message: 'provider not found: ' + body.providerId });
    const prov = normalizeProvider(p);
    // 直接对提交的 provider 测试，用其 baseUrl
    const t0 = Date.now();
    let result;
    if (!prov.baseUrl) {
      result = { ok: false, status: 0, latencyMs: 0, message: 'baseUrl 为空，请先填写' };
    } else {
      result = await testProvider(prov);
    }
    return sendJson(res, 200, result);
  }

  // POST /api/write-claude-settings —— 把选定 provider 写回 ~/.claude/settings.json（仅回环监听可用，避免外网覆盖他人 settings.json）
  if (req.method === 'POST' && pathname === '/api/write-claude-settings') {
    const lh = (inMemory.config && inMemory.config.global && inMemory.config.global.host) || '127.0.0.1';
    if (!isLoopbackHost(lh)) {
    return sendJson(res, 404, { ok: false, message: 'not_available: /api/write-claude-settings 仅回环监听可用' });
    }
  if (req.method === 'POST' && pathname === '/api/write-claude-settings') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { body = {}; }
    const cfg = currentConfig() || inMemory.config;
    const p = (cfg.providers || []).find((x) => x.id === body.providerId);
    if (!p) return sendJson(res, 404, { ok: false, message: 'provider not found: ' + body.providerId });
    const prov = normalizeProvider(p);
    try {
      const written = await writeClaudeSettings(prov, inMemory.port);
      return sendJson(res, 200, { ok: true, ...written });
    } catch (e) {
      return sendJson(res, 500, { ok: false, message: e.message });
    }
  }
}

  return sendJson(res, 404, { ok: false, message: 'unknown api: ' + req.method + ' ' + pathname });
}

async function testProvider(provider) {
  const t0 = Date.now();
  // 1. Try GET {baseUrl}/models
  try {
    const r = await fetch(`${provider.baseUrl}/models`, {
      headers: upstreamHeaders(provider, ''),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = await r.json();
      const ids = (j.data || []).slice(0, 5).map((m) => m.id);
      return { ok: true, status: r.status, latencyMs: Date.now() - t0, message: 'models OK', models: ids };
    }
    // fall through to chat test if not ok (some servers 404 /models)
  } catch { /* ignore, try chat */ }

  // 2. Minimal chat call
  const body = {
    model: provider.model || 'gpt-3.5-turbo',
    max_tokens: 8,
    stream: false,
    messages: [{ role: 'user', content: 'ping' }],
  };
  try {
    const r = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: upstreamHeaders(provider, ''),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await r.text();
    const ok = r.ok;
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    return {
      ok,
      status: r.status,
      latencyMs: Date.now() - t0,
      message: ok
        ? (parsed?.choices?.[0]?.message?.content?.slice(0, 80) || 'ok')
        : (parsed?.error?.message || text.slice(0, 300)),
    };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - t0, message: e.message };
  }
}

// 写入 ~/.claude/settings.json 的 env 块
function resolveClaudeSettingsPath() {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return path.join(process.env.CLAUDE_CONFIG_DIR, 'settings.json');
  }
  return path.join(os.homedir(), '.claude', 'settings.json');
}

async function writeClaudeSettings(provider, port) {
  const settingsPath = resolveClaudeSettingsPath();
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      // 损坏视为空，但仍先备份
    }
  }
  // 备份（覆盖式，1 份）
  const bakPath = settingsPath + '.bak';
  try {
    if (fs.existsSync(settingsPath)) fs.copyFileSync(settingsPath, bakPath);
  } catch (e) { /* ignore */ }

  const model = provider.model || 'big-pickle';
  const extraHeadersStr = JSON.stringify(provider.extraHeaders || {});
  const baseUrl = `http://127.0.0.1:${port}`;

  if (!settings.env) settings.env = {};
  settings.env.ANTHROPIC_BASE_URL = baseUrl;
  settings.env.ANTHROPIC_AUTH_TOKEN = provider.apiKey || '';
  settings.env.ANTHROPIC_MODEL = model;
  settings.env.ANTHROPIC_SMALL_FAST_MODEL = model;
  settings.env.ANTHROPIC_DEFAULT_HEADERS = extraHeadersStr;
  settings.env.CLAUDE_CODE_BG_CLASSIFIER_MODEL = model;
  settings.env.CLAUDE_CODE_AUTO_MODE_MODEL = model;
  settings.env.DISABLE_PROMPT_CACHING = '1';

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return {
    path: settingsPath,
    providerId: provider.id,
    model,
    baseUrl,
    backupPath: bakPath,
    written: settings.env,
  };
}

// ---------------------------------------------------------------------------
// HTTP 服务器：admin 分支优先，其次 /v1/*
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const rawUrl = req.url || '/';
  const pathname = rawUrl.split('?')[0];
  const apiKey = clientAuthOf(req);
  const rip = clientIp(req);

  // 防爆破：被封禁 IP 一律 429
  if (isAuthBlocked(rip)) {
    return sendJson(res, 429, { type: 'error', error: { type: 'rate_limit_error', message: 'too many requests; retry later' } });
  }
  // 统一登录鉴权：若设置了 global.authToken，所有端点都需携带该令牌
  if (!requireAuth(req)) {
    noteAuthFail(rip);
    return sendJson(res, 401, { type: 'error', error: { type: 'auth_error', message: '需要 Authorization: Bearer <global.authToken> 或 x-api-key 访问' } });
  }

  // Admin 分支
  if (pathname === '/console' || pathname === '/console/') {
    try {
      const html = fs.readFileSync(CONSOLE_INDEX, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(html);
    } catch (e) {
      sendJson(res, 500, { type: 'error', error: { type: 'api_error', message: 'console/index.html not found: ' + e.message } });
    }
    return;
  }
  if (pathname === '/' || pathname === '/console/index.html') {
    // 友好落地页：跳到控制台
    res.writeHead(302, { Location: '/console' });
    res.end();
    return;
  }
  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname);
    } catch (e) {
      log('api error:', e.message);
      if (!res.headersSent) sendJson(res, 500, { ok: false, message: e.message });
      else res.end();
    }
    return;
  }

  // Anthropic 侧（日志只记 pathname，不带 query，避免泄露 URL 中的敏感参数）
  log(`REQ ${req.method} ${pathname} | ip=${rip} x-api-key=${req.headers['x-api-key'] ? 'present' : 'none'} auth=${req.headers['authorization'] ? 'present' : 'none'} ua=${req.headers['user-agent']} xoc=${req.headers['x-opencode-client']}`);

  if (req.method === 'GET' && pathname === '/v1/models') {
    const act = activeProvider();
    return sendJson(res, 200, { data: [{ id: act ? act.model : 'big-pickle', object: 'model', owned_by: act ? act.id : 'opencode' }] });
  }
  if (req.method === 'POST' && pathname === '/v1/messages/count_tokens') {
    return sendJson(res, 200, { input_tokens: 0 });
  }
  if (req.method === 'POST' && pathname === '/v1/messages') {
    if (noteRequest(rip)) {
      return sendJson(res, 429, { type: 'error', error: { type: 'rate_limit_error', message: 'request rate limit exceeded' } });
    }
    let body = '';
    let tooLarge = false;
    req.on('data', (c) => {
      body += c;
      if (!tooLarge && body.length > MAX_BODY_BYTES) {
        tooLarge = true;
        sendJson(res, 413, { type: 'error', error: { type: 'request_too_large', message: `request body exceeds ${MAX_BODY_BYTES} bytes` } });
        req.destroy();
      }
    });
    req.on('end', () => { if (!tooLarge) handleMessages(req, res, body, apiKey); });
    return;
  }
  sendJson(res, 404, { type: 'error', error: { type: 'not_found_error', message: `not found: ${req.method} ${rawUrl}` } });
});

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
function start() {
  inMemory.config = loadConfig();
  inMemory.port = inMemory.config.global.port || 18101;
  refreshActiveProvider();
  const act = activeProvider();
  assertListenSecurity();

  server.listen(inMemory.port, inMemory.config.global.host || '127.0.0.1', () => {
    const addr = server.address();
    log(`[green-proxy] 监听 http://127.0.0.1:${addr.port}`);
    log(`[green-proxy] 控制台: http://127.0.0.1:${addr.port}/console`);
    log(`[green-proxy] 当前供应商: ${act ? act.name + ' (' + act.id + ')' : '未启用任何供应商'}`);
    if (inMemory.config.global.autoOpenBrowser !== false) {
      // 提示打开控制台（启动脚本负责 open）
    }
  });
  server.on('error', (e) => {
    console.error('[green-proxy] 启动失败:', e.message);
    if (e.code === 'EADDRINUSE') {
      console.error(`端口 ${inMemory.port} 已被占用，请改用其他端口或在配置里修改 global.port。`);
    }
    process.exit(1);
  });
}

start();
