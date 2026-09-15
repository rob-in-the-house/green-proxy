# Green Proxy — 多供应商 Claude Code 桥接代理

让 Claude Code 通过本地代理，灵活切换不同上游模型供应商。代理在本地做 Anthropic ↔ OpenAI 协议翻译，并内置 Web 控制台支持实时切换、增删供应商。

## 为什么需要代理

Claude Code 只讲 **Anthropic Messages API**（`POST {base}/v1/messages` + `x-api-key` + `anthropic-version`），而多数第三方模型走 **OpenAI Chat Completions 兼容端点**。两者协议不匹配，本代理在本地完成双向翻译：

- 入站：Anthropic `messages` / `tools` / `tool_use` / `tool_result` → OpenAI `chat/completions`
- 出站：OpenAI SSE / `tool_calls` → Anthropic SSE / `content_block`

## 支持的供应商

| 供应商 | Base URL | 模型/Endpoint | 说明 |
|--------|----------|---------------|------|
| **Codex Zen (big-pickle)** | `https://opencode.ai/zen/v1` | `big-pickle` | opencode 内置免费模型；**必须带 `x-opencode-session` 头**（代理已自动注入） |
| **DeepSeek 官方** | `https://api.deepseek.com/v1` | `deepseek-v4-flash` / `deepseek-v4-pro` / `deepseek-chat` / `deepseek-reasoner` | 官方 API，OpenAI 兼容 |
| **火山方舟 ARK** | `https://ark.cn-beijing.volces.com/api/v3`（标准）<br>`https://ark.cn-beijing.volces.com/api/coding/v3`（Coding） | Endpoint ID (ep-xxxx) 或 `deepseek-v4-flash` / `deepseek-v4-pro` | 火山引擎网关：标准 v3 与 Coding 计划双端点，同一供应商 |
| **Agnes** | `https://apihub.agnes-ai.com/v1` | 如 `agnes-3.0-flash` | Agnes APIhub，OpenAI 兼容 |
| **腾讯混元** | `https://tokenhub.tencentmaas.com/v1` | 如 `hy3` | 腾讯混元 MaaS，OpenAI 兼容 |
| **硅基流动 SiliconFlow** | `https://api.siliconflow.cn/v1` | 如 `Qwen/Qwen3.5-4B` | 硅基流动，OpenAI 兼容 |
| **OpenRouter** | `https://openrouter.ai/api/v1` | 任意 OpenRouter 模型名 | 聚合网关，OpenAI 兼容 |
| **通用 OpenAI 兼容 / 自建** | 用户自填 | 用户自填 | 任意 OpenAI 兼容端点 / 中转网关 / 自托管网关 |

## 快速开始

### 启动

```
Windows：双击 start.cmd
Linux / macOS：./start.sh
```

- 后台静默启动 Node 代理，自动打开浏览器控制台 `http://127.0.0.1:18101/console`
- 首次启动无 `config.json` 时自动播种默认供应商

### 停止

```
Windows：双击 stop.cmd
Linux / macOS：./stop.sh
```

### 无需安装

- 仅依赖 Node.js v18+（零 npm 依赖，内置模块 + 全局 fetch）
- 绿色文件夹，拷到任意电脑双击即用

## 目录结构

```
claude代理/
├── proxy.mjs             # 多供应商桥接代理（核心，唯一入口）
├── config.json           # 运行时配置（端口 + 供应商列表，控制台写入；含真实 Key 不入库）
├── config.sample.json    # 脱敏配置模板（复制为 config.json 后填入真实 Key）
├── console/index.html    # Web 控制台界面（代理实时读盘伺服，改完刷新即生效）
├── start.cmd             # Windows 双击启动（后台 + 打开浏览器）
├── stop.cmd              # Windows 双击停止
├── start.sh              # Linux / macOS 启动脚本（nohup 后台，日志 logs/proxy.log）
├── stop.sh               # Linux / macOS 停止脚本
├── README.md             # 本文件
└── USAGE.md              # 控制台详细操作手册
```

## 使用步骤

### 1. 双击 `start.cmd`

### 2. 在控制台配置供应商

浏览器自动打开控制台。点击供应商卡片 → 填 Base URL / API Key / 模型 → 「🔌 测试连接」→ 「💾 保存配置」→ 「⚡ 设为当前使用」。

### 3. 正常使用 Claude Code（无需每次改配置）

**`~/.claude/settings.json` 只需配置一次**，指向本地代理即可，切换供应商一律在控制台完成：

```jsonc
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:18101",        // 固定指向本地代理
    "ANTHROPIC_AUTH_TOKEN": "sk-xxxx",                      // 占位即可，代理以自己的 key 转发
    "ANTHROPIC_MODEL": "deepseek-v4-flash",                 // 会被代理忽略（见下）
    "ANTHROPIC_DEFAULT_HEADERS": "{}",
    "DISABLE_PROMPT_CACHING": "1"
  }
}
```

> **关键机制：代理以「控制台配置的 provider.model」为权威，忽略客户端请求体里的 model。**
> 因此 settings.json 里的 `ANTHROPIC_MODEL` 填什么不影响实际使用的模型——真正生效的是控制台当前活跃供应商的 model 字段。切换供应商无需再改 `~/.claude/settings.json`。

## 控制台功能

- 🔀 **供应商卡片切换** — 点击选择当前编辑项
- ✏️ **供应商编辑** — 名称 / ID / Base URL / Key / 模型 / 认证方式 / 启用状态
- 🔌 **测试连接** — 轻量 chat 探测上游连通性
- 💾 **保存配置** — 原子写盘 + 内存热更新，即时生效
- ⚡ **设为当前使用** — 切换活跃供应商并落盘
- 📝 **写入 Claude settings.json** — 用当前供应商覆盖 `~/.claude/settings.json`
- 📋 **供应商管理** — 新增 / 复制 / 删除（删除即时落盘）

## config.json 配置

```jsonc
{
  "version": 1,
  "global": {
    "port": 18101,          // 监听端口
    "host": "127.0.0.1",    // 监听地址；开放公网请改为 0.0.0.0 + 设 authToken
    "authToken": "",         // ★ 公网访问令牌（登录鉴权）：设置后所有端点(console/api/v1)都需 Authorization: Bearer <authToken>；空 = 不鉴权（仅内网）
    "autoOpenBrowser": true
  },
  "activeProviderId": "deepseek-official",   // 当前活跃供应商 id
  "providers": [
    {
      "id": "deepseek-official",
      "name": "DeepSeek 官方",
      "enabled": true,
      "type": "generic",
      "baseUrl": "https://api.deepseek.com/v1",
      "authType": "bearer",           // bearer = 用本条目 apiKey；none = 透传客户端 key
      "apiKey": "sk-xxx",
      "model": "deepseek-v4-flash",   // ★ 权威模型名，控制台切换即改这里
      "extraHeaders": {},             // 附加请求头，如 opencode 需 User-Agent / x-opencode-client
      "notes": "备注"
    }
  ]
}
```

## 已知坑与内置处理（重要）

### 1. opencode/zen 免费档 `MissingSessionID` 400

现象：走 opencode/zen 时全部 `502 upstream 400: MissingSessionID: free tier can only be used in OpenCode`。

根因：**opencode/zen 免费档要求请求头 `x-opencode-session`（会话稳定 ID）**，缺失即拒绝。错误信息字面（"free tier only in OpenCode"）有误导性，实际加会话头即通。

处理：代理对 baseUrl 匹配 `opencode.ai/zen` 的上游**自动注入** `x-opencode-session` 头，无需手工配置。

### 2. 上游报 "tool_calls must be followed by tool messages"

根因：历史 user 消息含 `tool_result` 时，旧转换会先 push 一条空 `user` 消息再 push `tool`，插入 tool_calls 与 tool 之间违反 OpenAI 约束。

处理：已改为 **tool 消息紧跟、文本放后**，多轮工具历史正确。

### 3. 模型名不匹配 400（"The supported API model names are ..."）

根因：客户端(Claude)请求体带 `model` 优先于 provider.model，曾导致上游收到 `big-pickle` 之类不存在的模型名。

处理：代理改为 **provider.model 权威**，忽略客户端 model。控制台配置的 model 必须与上游实际支持的模型名一致。

### 4. 不要用 PowerShell 手改 config.json

PowerShell 5.1 `Set-Content -Encoding UTF8` 写**带 BOM 的 UTF-8**，Node `JSON.parse` 直接抛错 → 代理会备份后重新播种默认配置（可能覆盖你手动写的内容）。请一律通过控制台保存（走 Node 原生原子写）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `PROXY_PORT` / `PORT` | 覆盖监听端口（默认 18101，优先于 config.json） |
| `RELOAD_MODE` | `cache`（默认，控制台保存即生效）/ `disk`（每请求读盘，防御手改文件） |
| `PROXY_BASE` | bubble-test.py 用的代理地址（默认 `http://127.0.0.1:18101`） |
| `MODEL` | bubble-test.py 覆盖 model（默认 `deepseek-v4-flash`） |
| `PROXY_AUTH_TOKEN` | 环境变量形式的访问令牌，优先于 config.json 的 `global.authToken` |
| `PROXY_RATE_WINDOW_MS` | 鉴权失败统计窗口毫秒（默认 300000 = 5 分钟） |
| `PROXY_RATE_MAX_FAILS` | 窗口内最大鉴权失败次数，超过即封锁（默认 5） |
| `PROXY_RATE_BLOCK_MS` | 触发后封锁时长毫秒（默认 900000 = 15 分钟），封锁期一律 429 |
| `PROXY_RATE_MAX_REQ` | `/v1/messages` 每 IP 每分钟请求上限（默认 0 = 不限） |
| `PROXY_TRUST_PROXY` | `1` = 信任 `X-Forwarded-For` 取真实客户端 IP（置于反代之后时启用） |
| `PROXY_MAX_BODY` | `/v1/messages` 请求体上限字节（默认 10485760 = 10MB，超限 413） |
| `PROXY_UPSTREAM_TIMEOUT` | 非流式上游总超时毫秒（默认 120000） |
| `PROXY_STREAM_IDLE_TIMEOUT` | 流式空闲超时毫秒，超时无数据断开（默认 60000） |

## 公网部署鉴权（登录鉴权）

代理默认 `host: 127.0.0.1` 仅内网访问。若**开放到公网**，请：

1. 把 `global.host` 改为 `0.0.0.0`（监听所有网卡）。
2. 设置 `global.authToken` 为共享访问令牌（如 `sk-xxxx`）。
3. 开放端口（防火墙 / 安全组放行）。

**鉴权规则**：
- `global.authToken` **空** → 不鉴权（仅内网直连，行为与旧版一致）。
- `global.authToken` **非空** → **所有端点**（`/console`、`/api/*`、`/v1/*`）都需携带 `Authorization: Bearer <authToken>` 或 `x-api-key: <authToken>`，否则 `401`。
- Claude CLI 通过代理时把 `ANTHROPIC_AUTH_TOKEN` 设为该 authToken 即可。
- 控制台打开后若 401 → 页面显示登录框，输入 authToken 即可。

> 该令牌是「共享访问令牌」（公网访问代理的登录凭证），与各供应商的 `apiKey` 无关；代理转发上游时用**供应商自身的 apiKey**，二者互不影响。

## 已验证功能

| 场景 | 结果 |
|------|------|
| 非流式对话 | ✅ Anthropic → OpenAI → Anthropic |
| 流式对话 | ✅ SSE 分块 + message_stop |
| 工具调用（单轮/多轮历史） | ✅ tool_use / tool_result 双向转换，含修复后的空 user 问题 |
| opencode/zen 会话头 | ✅ 自动注入 `x-opencode-session` |
| provider.model 权威 | ✅ 客户端传任意 model 均被覆盖为上游真实模型 |
| 系统提示词 | ✅ 自动拆成 OpenAI system 消息 |
| 控制台离线渲染 | ✅ 无 CDN，断网可用 |
| 实时切换供应商 | ✅ 保存即生效，无需重启 |
| 配置自动播种/损坏自愈 | ✅ 首启播种；解析失败自动备份 `config.corrupt.*` 后重建 |

## 排查

1. **端口被占用** → `stop.cmd` 杀进程后重试，或改 `global.port`
2. **控制台打不开** → 确认代理在跑：`curl http://127.0.0.1:18101/api/status`
3. **上游 401** → 控制台「测试连接」确认 API Key / 端点正确
4. **上游 400 模型名** → 把控制台该供应商的 model 改成上游真实支持的模型名（v4 网关是 `deepseek-v4-flash` 等，见上表）
5. **Claude 仍报旧模型错误** → 在 Claude Code 里 `/clear` 或重启会话，让新配置生效
6. **后台进程莫名消失 / `ChildProcess.kill`** → opencode 等 shell 包装层会连带杀掉 Start-Process 的后台子进程；改用 `start.cmd` 双击启动，或确认 `node proxy.mjs` 进程存活
7. **ARK 模型填什么** → 火山方舟控制台创建 Endpoint，模型 ID 格式 `ep-20240101xxxxx`；v4 系列走 Coding 网关用模型名即可

## 安全注意

- API Key 明文存储在本地 `config.json`，请勿分享该文件
- 代理仅监听 `127.0.0.1`，外部无法访问
- 切换供应商前建议先在控制台「测试连接」验证
- 不用 PowerShell 手改 config.json（见上文坑 #4）

## 安全加固（公网部署）

### 内置安全机制

- **非回环监听强制鉴权**：`global.host` 设为非回环地址（如 `0.0.0.0`）且未配置 `global.authToken`（或环境变量 `PROXY_AUTH_TOKEN`）时，代理**拒绝启动**并给出明确提示（fail-closed）。
- **配置读取脱敏**：`GET /api/config` 返回的 `apiKey` 一律打码为 `前4位+****+后4位`；控制台保存时未改动的 key 自动沿用旧值，不会被脱敏占位覆盖。
- **settings.json 写入限制**：`POST /api/write-claude-settings` 仅在回环监听（`127.0.0.1` / `localhost` / `::1`）下可用，非回环监听一律返回 404。

### 公网部署建议

1. **必须**设置高强度 `global.authToken`（建议 ≥20 位随机串）。
2. **必须**前置 HTTPS 反向代理（Nginx / Caddy）做 TLS 终止，不要裸 HTTP 对公网。
3. 建议在反代层叠加 IP 白名单 / mTLS / 限流。
4. 用低权限账号运行代理进程；`config.json` 仅对运行账号可读。
5. 个人/小团队更优解：SSH 隧道 / Tailscale 内网穿透，而非直接开放公网端口。

### 反向代理示例（TLS 终止）

Caddy（自动 HTTPS，最简）：

```Caddyfile
gpt.example.com {
    reverse_proxy 127.0.0.1:18101 {
        flush_interval -1    # SSE 流式必需：关闭响应缓冲
    }
}
```

Nginx：

```nginx
server {
    listen 443 ssl;
    server_name gpt.example.com;
    # ssl_certificate / ssl_certificate_key 按需配置

    location / {
        proxy_pass http://127.0.0.1:18101;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Forwarded-For $remote_addr;   # 配合 PROXY_TRUST_PROXY=1
        proxy_buffering off;                             # SSE 流式必需：关闭缓冲
        proxy_read_timeout 300s;
    }
}
```

> 反代之后请设置环境变量 `PROXY_TRUST_PROXY=1`，限流/防爆破将按 `X-Forwarded-For` 的真实客户端 IP 统计（仅当反代正确设置该头时启用，否则保持默认以免伪造绕过）。
