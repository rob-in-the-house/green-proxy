# Green Proxy — 多供应商 Claude Code 桥接代理

让 Claude Code 通过本地代理，灵活切换不同上游模型供应商。代理在本地做 Anthropic ↔ OpenAI 协议翻译，并内置 Web 控制台支持实时切换、增删供应商。

## 为什么需要代理

Claude Code 只讲 **Anthropic Messages API**（`POST {base}/v1/messages` + `x-api-key` + `anthropic-version`），而多数第三方模型走 **OpenAI Chat Completions 兼容端点**。两者协议不匹配，本代理在本地完成双向翻译：

- 入站：Anthropic `messages` / `tools` / `tool_use` / `tool_result` → OpenAI `chat/completions`
- 出站：OpenAI SSE / `tool_calls` → Anthropic SSE / `content_block`

## 支持的供应商

| 供应商 | Base URL | 模型/Endpoint | 说明 |
|--------|----------|---------------|------|
| **Codex Zen (big-pickle)** | `https://opencode.ai/zen/v1` | `big-pickle` | ⚠️ **免费档已被上游封锁**：Zen 现在只对官方 OpenCode 客户端开放免费模型，第三方代理会收到 403 `FreeTierError`（详见「已知坑 #1」）。该 Key 仍可用于付费模型 |
| **DeepSeek 官方** | `https://api.deepseek.com/v1` | `deepseek-v4-flash` / `deepseek-v4-pro` / `deepseek-chat` / `deepseek-reasoner` | 官方 API，OpenAI 兼容 |
| **火山方舟 ARK** | `https://ark.cn-beijing.volces.com/api/v3` | 填 Endpoint ID (ep-xxxx) | 商业多模型 |
| **火山 Coding (v4 系列)** | `https://ark.cn-beijing.volces.com/api/coding/v3` | `deepseek-v4-flash` / `deepseek-v4-pro` | 火山 Coding 计划网关 |
| **Anthropic 原生** | 自填（如 `https://open.bigmodel.cn/api/anthropic`） | 自填（如 `glm-5.3-flash`） | Anthropic Messages 协议直通，保留 thinking 块。baseUrl 含 `/anthropic` 时自动识别 |
| **通用 OpenAI 兼容** | 用户自填 | 用户自填 | 任意 OpenAI 兼容端点 / 中转网关 |

## 快速开始

### 启动

```
双击 start.cmd   （或 PowerShell 执行 .\start-proxy.ps1）
```

- 后台静默启动 Node 代理，自动打开浏览器控制台 `http://127.0.0.1:18101/console`
- 首次启动无 `config.json` 时自动播种默认供应商

### 停止

```
双击 stop.cmd    （或 PowerShell 执行 .\stop-proxy.ps1）
```

### 无需安装

- 仅依赖 Node.js v18+（零 npm 依赖，内置模块 + 全局 fetch）
- 绿色文件夹，拷到任意电脑双击即用

## 目录结构

```
claude代理/
├── proxy.mjs             # 多供应商桥接代理（核心，唯一入口）
├── config.json           # 运行时配置（端口 + 供应商列表，控制台写入）
├── console/index.html    # Web 控制台界面（代理实时读盘伺服，改完刷新即生效）
├── start.cmd             # 双击启动（后台 + 打开浏览器）
├── stop.cmd              # 双击停止
├── start-proxy.ps1       # PowerShell 启动脚本
├── stop-proxy.ps1        # PowerShell 停止脚本
├── bubble-test.py        # Claude 风格请求冒泡排序测试脚本（走本地代理）
├── README.md             # 本文件
├── USAGE.md              # 控制台详细操作手册
└── legacy/               # 原始单供应商版 claude-zen-proxy.mjs 归档
    ├── claude-zen-proxy.mjs
    ├── start-proxy.ps1 / stop-proxy.ps1   # legacy 启停（默认独立端口 18102）
    ├── env-backup.json
    └── proxy.log
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
    "host": "127.0.0.1",    // 仅本地访问
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
      "protocol": "openai",           // openai（默认）| anthropic（原生直通）| 留空=按 baseUrl 自动识别
      "extraHeaders": {},             // 附加请求头，如 opencode 需 User-Agent / x-opencode-client
      "notes": "备注"
    }
  ]
}
```

## 已知坑与内置处理（重要）

### 1. opencode/zen 免费档 403 `FreeTierError`（big-pickle 等免费模型，当前无法绕过）

现象：走 opencode/zen 的免费模型（`big-pickle`、`*-free`）时，上游返回

```
403 {"type":"error","error":{"type":"FreeTierError","message":"OpenCode's free tier can only be used from within OpenCode"}}
```

根因（2026-10 上游策略变更）：Zen 免费档从过去的"缺会话头即 400 MissingSessionID"升级为**客户端来源校验**，只服务官方 OpenCode 客户端。实测结论：

- **不是 Key / 账号被封**：同一个 API Key 请求付费模型会通过鉴权并返回 `402 Insufficient account funds`（Key 有效，仅账号无余额），免费模型则一律 403。
- **官方客户端仍可用**：`opencode-cli.exe run -m opencode/big-pickle --standalone` 当前返回正常（PONG）。
- **请求头伪造无效**：代理即使注入完整官方请求头——`x-opencode-session-id`（`ses_`+64 位 hex）、`x-session-affinity`、`X-Session-Id`、`x-opencode-session`、`x-opencode-project`、`x-opencode-client`、`User-Agent: opencode/latest/2.0.26/cli`——并改走 HTTP/2，仍然 403。说明差异在**传输层客户端指纹 / 来源校验**，不是应用层请求头。

处理：**此类免费档无法通过转售代理绕过**（属上游反转售策略）。请改用其他供应商（DeepSeek、火山方舟、Anthropic 原生等），或为 Zen 账号充值后使用付费模型。

> 历史备注：早期版本注入 `x-opencode-session` 头即可放行，该做法现已失效。

### 2. 上游报 "tool_calls must be followed by tool messages"

根因：历史 user 消息含 `tool_result` 时，旧转换会先 push 一条空 `user` 消息再 push `tool`，插入 tool_calls 与 tool 之间违反 OpenAI 约束。

处理：已改为 **tool 消息紧跟、文本放后**，多轮工具历史正确。

### 3. 模型名不匹配 400（"The supported API model names are ..."）

根因：客户端(Claude)请求体带 `model` 优先于 provider.model，曾导致上游收到 `big-pickle` 之类不存在的模型名。

处理：代理改为 **provider.model 权威**，忽略客户端 model。控制台配置的 model 必须与上游实际支持的模型名一致。

### 4. 不要用 PowerShell 手改 config.json

PowerShell 5.1 `Set-Content -Encoding UTF8` 写**带 BOM 的 UTF-8**，Node `JSON.parse` 直接抛错 → 代理会备份后重新播种默认配置（可能覆盖你手动写的内容）。请一律通过控制台保存（走 Node 原生原子写）。

### 5. Claude Code 报 "Streaming response ended before any complete data was received"

现象：Claude Code 卡住后报上面这句，提示检查代理/网关。

根因（两种）：

1. **供应商用了 Anthropic 原生端点，但被当成 OpenAI 端点调用**。例如 `https://open.bigmodel.cn/api/anthropic` 是 Anthropic Messages 协议，代理却拼成 `/chat/completions`，上游返回 HTTP 200 + `{"code":500,"msg":"404 NOT_FOUND"}`（非 SSE）。旧版代理无条件按 SSE 解析 → 只发出 `message_start`/`message_stop`，没有任何内容块 → Claude 判定"没收到完整数据"。
2. **上游对 `stream:true` 却返回非 SSE 的 JSON**（错误体或完整回复）。

处理（已内置）：

- 代理会**自动识别** baseUrl 含 `/anthropic` 的供应商为 **Anthropic 原生协议**，走 `/v1/messages` 直通转发（逐字节透传 SSE，保留 `thinking`/`ping` 等事件）；也可在控制台「上游协议」下拉显式选择。
- OpenAI 路径新增加固：上游返回非 SSE 时，若是错误体则回 502 并带上游原文；若是完整 JSON 回复则自动转成合规 Anthropic SSE，不再产生空流。
- 控制台「🔌 测试连接」会按协议选择 `/chat/completions` 或 `/v1/messages` 探测。


## 环境变量

| 变量 | 说明 |
|------|------|
| `PROXY_PORT` / `PORT` | 覆盖监听端口（默认 18101，优先于 config.json） |
| `RELOAD_MODE` | `cache`（默认，控制台保存即生效）/ `disk`（每请求读盘，防御手改文件） |
| `PROXY_BASE` | bubble-test.py 用的代理地址（默认 `http://127.0.0.1:18101`） |
| `MODEL` | bubble-test.py 覆盖 model（默认 `deepseek-v4-flash`） |

## 已验证功能

| 场景 | 结果 |
|------|------|
| 非流式对话 | ✅ Anthropic → OpenAI → Anthropic |
| 流式对话 | ✅ SSE 分块 + message_stop |
| Anthropic 原生上游 | ✅ baseUrl 含 `/anthropic` 自动直通 `/v1/messages`（保留 thinking 块） |
| 上游返回非 SSE | ✅ 错误体回 502；完整 JSON 自动转 Anthropic SSE，不再空流 |
| 工具调用（单轮/多轮历史） | ✅ tool_use / tool_result 双向转换，含修复后的空 user 问题 |
| ~~opencode/zen 会话头~~ | ⚠️ 已失效：上游改为客户端来源校验，免费档无法经代理使用（见已知坑 #1） |
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

## legacy 归档目录

`legacy/` 保留原始单供应商版（仅转发到 `opencode.ai/zen/v1`）。如需临时回退：

```
legacy\start-proxy.ps1   # 默认独立端口 18102，避免与主代理 18101 冲突
legacy\stop-proxy.ps1
```

legacy 的 start 脚本会自动从父目录 `config.json` 读取 opencode API Key 作为 `FIXED_KEY`（读不到则需手动设 `$env:FIXED_KEY`）。

## 安全注意

- API Key 明文存储在本地 `config.json`，请勿分享该文件
- 代理仅监听 `127.0.0.1`，外部无法访问
- 切换供应商前建议先在控制台「测试连接」验证
- 不用 PowerShell 手改 config.json（见上文坑 #4）
