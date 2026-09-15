# Green Proxy 使用说明

> **Green Proxy** 是一个零依赖的 Claude Code 桥接代理工具，支持在多个 AI 模型供应商之间一键切换。

---

## 目录

1. [环境要求](#1-环境要求)
2. [快速开始](#2-快速开始)
3. [控制台操作指南](#3-控制台操作指南)
4. [各供应商接入配置](#4-各供应商接入配置)
5. [一键写入 Claude Code 配置](#5-一键写入-claude-code-配置)
6. [手动配置 Claude Code](#6-手动配置-claude-code)
7. [常见问题](#7-常见问题)
8. [安全说明](#8-安全说明)
9. [故障排查](#9-故障排查)
10. [高级选项](#10-高级选项)

---

## 1. 环境要求

| 要求 | 版本 | 说明 |
|------|------|------|
| **Node.js** | v18 或更高 | 运行代理核心（下载：https://nodejs.org/） |
| **浏览器** | Chrome / Edge / Firefox | 打开控制台界面（自动调用） |
| **Claude Code** | 任意版本 | Claude Code CLI 客户端 |
| **操作系统** | Windows / macOS / Linux | 主要测试 Windows，其他系统理论可用 |

**无需安装：** 不需要 npm install，不需要额外依赖包。绿色文件夹，拷贝即用。

---

## 2. 快速开始

### 第一步：双击启动

```
双击 start.cmd（Windows）
```

启动后会自动：
- 在后台运行代理服务
- 打开浏览器到控制台 `http://127.0.0.1:18101/console`

### 第二步：在控制台配置供应商

1. 浏览器自动打开控制台页面
2. 点击要使用的**供应商卡片**（如 opencode/big-pickle）
3. 在编辑区填入 **API Key**（必需）
4. 如使用 DeepSeek/ARK，还需要填入 **Base URL**
5. 点击 **「🔌 测试连接」** 验证配置是否正确
6. 点击 **「💾 保存配置」**
7. 点击 **「⚡ 设为当前使用」**

### 第三步：写入 Claude Code 配置

在控制台点击 **「📝 写入 Claude settings.json」** 按钮，自动将 `~/.claude/settings.json` 更新为指向本代理。

### 第四步：使用 Claude Code

正常启动 Claude Code 即可，底层模型走你选定的供应商。

```
claude   # 正常使用，自动走代理
```

### 停止代理

```
双击 stop.cmd
```

---

## 3. 控制台操作指南

打开 `http://127.0.0.1:18101/console`，界面分以下几个区域：

### 🔀 供应商卡片区
- 显示所有已配置的供应商，点击卡片选中
- 「预设」= 预置地址；「通用」= 用户自填
- 「当前使用」标签 = 当前活跃的供应商

### ✏️ 编辑区
选中某张卡片后，下方出现编辑表单：

| 字段 | 说明 |
|------|------|
| **名称** | 显示名称，随意填写 |
| **ID** | 唯一标识符，切换时使用 |
| **Base URL** | 上游 API 地址（见各供应商说明） |
| **API Key** | 对应供应商的 API 密钥 |
| **模型 / Endpoint ID** | 模型名（如 big-pickle、deepseek-chat）或 ARK 的 Endpoint ID（ep-xxxx） |
| **认证方式** | Bearer Token（必填Key）或 无认证（转发客户端Key） |

### 功能按钮
| 按钮 | 功能 |
|------|------|
| **🔌 测试连接** | 测试该供应商上游是否可用（不影响运行中的服务） |
| **💾 保存配置** | 保存当前编辑的配置，**立即生效**（无需重启） |
| **⚡ 设为当前使用** | 将该供应商设为活跃状态（= 保存 + 设为当前） |
| **📝 写入 Claude settings.json** | 自动更新 Claude Code 的环境变量指向当前代理 |

### 📋 供应商管理
- **编辑** — 点击对应供应商的「编辑」按钮
- **复制** — 复制一份相同的供应商配置，方便微调
- **删除** — 删除供应商（至少保留一个）
- **新增** — 添加新的空白供应商配置

---

## 4. 各供应商接入配置

### 4.1 Codex Zen (big-pickle) — 内置预设

> opencode 提供的免费/低价大模型，代理内置默认使用此供应商

| 配置项 | 值 |
|--------|-----|
| Base URL | `https://opencode.ai/zen/v1` |
| API Key | 你的 opencode API Key（sk-xxx...） |
| 模型 | `big-pickle` |
| 额外请求头 | 已内置（User-Agent + x-opencode-client，控制台自动处理） |

**操作：** 打开控制台 → 点击第一张卡片 → 填入 API Key → 保存 → 设为当前 → 完成

---

### 4.2 DeepSeek V4 Flash（自建/自托管）

> 适用于自建 DeepSeek 推理服务，或 DeepSeek 官方 API

| 配置项 | 值 |
|--------|-----|
| Base URL | **自建：** `http://你的服务器:端口/v1`<br>**官方：** `https://api.deepseek.com/v1` |
| API Key | 你的 DeepSeek API Key |
| 模型 | `deepseek-chat` 或 `deepseek-v4-flash` |
| 额外请求头 | 无（留空） |

**操作：**
1. 点击 DeepSeek 卡片
2. 填入 Base URL（你的自建网关地址）
3. 填入 API Key
4. 核对模型名（与你的部署一致）
5. 测试连接 → 保存 → 设为当前

---

### 4.3 火山方舟 ARK（火山引擎）

> 字节跳动商业 API，支持 doubao 系列模型

| 配置项 | 值 |
|--------|-----|
| Base URL | `https://ark.cn-beijing.volces.com/api/v3` |
| API Key | 你的 ARK API Key（在火山方舟控制台获取） |
| 模型 | **Endpoint ID**，格式如 `ep-202401011234567890abcdef`（不是模型名） |
| 额外请求头 | 无（留空） |

**获取 Endpoint ID：**
1. 登录 [火山方舟控制台](https://console.volcengine.com/ark)
2. 创建推理接入点（Endpoint）
3. 复制 Endpoint ID（以 `ep-` 开头）

**操作：**
1. 点击「火山方舟 ARK」卡片
2. Base URL 一般已预填，无需修改
3. 填入 API Key
4. 模型处填入 Endpoint ID（`ep-xxxx`）
5. 测试连接 → 保存 → 设为当前

---

### 4.4 通用 OpenAI 兼容

> 接入任意提供 OpenAI `/v1/chat/completions` 接口的服务

| 配置项 | 值 |
|--------|-----|
| Base URL | 你的 API 地址（如 `https://your-api.com/v1`） |
| API Key | 对应服务的 API Key |
| 模型 | 该服务支持的模型名（如 `gpt-4o`、`qwen-plus` 等） |
| 额外请求头 | 根据服务要求填写（JSON 格式） |

---

## 5. 一键写入 Claude Code 配置

在控制台点击「📝 写入 Claude settings.json」后，代理自动修改 `~/.claude/settings.json`，内容如下：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:18101",
    "ANTHROPIC_AUTH_TOKEN": "你的 API Key",
    "ANTHROPIC_MODEL": "big-pickle",
    "ANTHROPIC_SMALL_FAST_MODEL": "big-pickle",
    "ANTHROPIC_DEFAULT_HEADERS": "{\"User-Agent\":\"opencode/...\",\"x-opencode-client\":\"cli\"}",
    "CLAUDE_CODE_BG_CLASSIFIER_MODEL": "big-pickle",
    "CLAUDE_CODE_AUTO_MODE_MODEL": "big-pickle",
    "DISABLE_PROMPT_CACHING": "1"
  }
}
```

- 写入前会自动备份原文件到 `~/.claude/settings.json.bak`
- 切换供应商后，再次点击此按钮即可更新

---

## 6. 手动配置 Claude Code

如不使用控制台，也可手动编辑 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:18101",
    "ANTHROPIC_AUTH_TOKEN": "任意值（代理使用自身配置的 Key，此值不影响）",
    "ANTHROPIC_MODEL": "big-pickle",
    "ANTHROPIC_SMALL_FAST_MODEL": "big-pickle",
    "ANTHROPIC_DEFAULT_HEADERS": "{\"User-Agent\":\"opencode/latest/1.18.18/cli\",\"x-opencode-client\":\"cli\"}",
    "DISABLE_PROMPT_CACHING": "1"
  }
}
```

> `ANTHROPIC_DEFAULT_HEADERS` 的内容需根据供应商调整。例如 DeepSeek/ARK 可填 `{}` 或省略此项。

---

## 7. 常见问题

### Q：双击 start.cmd 后浏览器没打开？

手动访问 `http://127.0.0.1:18101/console` 即可。start.cmd 应该会自动打开，若未打开请检查代理是否正常运行（见下方排查）。

### Q：Claude Code 报 "model may not exist"？

1. 检查代理是否在运行：`curl http://127.0.0.1:18101/v1/models`
2. 检查 `~/.claude/settings.json` 中 `ANTHROPIC_BASE_URL` 是否为 `http://127.0.0.1:18101`
3. 在控制台检查当前激活供应商是否配置正确

### Q：切换供应商后 Claude Code 没有变化？

- 确认已在控制台点击「⚡ 设为当前使用」或「💾 保存配置」
- 如未执行「📝 写入 Claude settings.json」，Claude Code 的 settings.json 可能未更新（需要手动改或点击此按钮）
- 重启 Claude Code CLI 以确保新配置生效

### Q：如何更换端口？

在控制台全局设置中修改端口（或直接编辑 `config.json` 中的 `global.port`），然后：
1. 双击 `stop.cmd` 停止旧代理
2. 双击 `start.cmd` 启动新代理
3. 更新 `~/.claude/settings.json` 中 `ANTHROPIC_BASE_URL` 的端口号

### Q：config.json 和控制台有什么区别？

- `config.json` 是代理的运行时配置文件，控制台读取它来显示信息
- 在控制台修改并保存后，`config.json` 会同步更新
- 也可以直接文本编辑 `config.json`（但需重启代理才生效）

---

## 8. 安全说明

- ✅ API Key 明文存储在本地 `config.json`，**请勿将此文件泄露或提交至公开仓库**
- ✅ 代理仅监听 `127.0.0.1`（仅本机可访问），外部网络无法访问
- ✅ 切换供应商前建议先点击「🔌 测试连接」验证连通性
- ✅ 如需清除所有 Key，删除 `config.json` 并重启代理，会自动生成无 Key 的默认配置

---

## 9. 故障排查

### 查看代理日志
```
# 查看最近日志
type proxy.log

# 查看错误日志
type proxy.err.log
```

### 检查代理状态
```
curl http://127.0.0.1:18101/api/status
```

### 检查端口占用
```
netstat -ano | findstr 18101
```

### 杀掉占用端口的进程
```
双击 stop.cmd
```

### 手动重启
```
双击 stop.cmd
双击 start.cmd
```

### 上游返回 401（认证失败）

1. 在控制台检查 API Key 是否正确（注意区分测试 Key 和生产 Key）
2. 确认 API Key 有权限访问对应模型/服务
3. ARK 需要确认 Endpoint ID 正确，不是模型名称

### 上游返回 404（模型不存在）

- 检查模型名/Endpoint ID 是否与供应商实际支持的一致
- ARK：确认是 Endpoint ID（ep-xxxx），不是模型名

### Claude Code 连接超时

- 确认代理在运行：`http://127.0.0.1:18101/api/status`
- 检查 `~/.claude/settings.json` 的 `ANTHROPIC_BASE_URL` 是否正确
- 确认 18101 端口未被防火墙拦截

---

## 10. 高级选项

### 配置文件结构（config.json）

```jsonc
{
  "version": 1,
  "global": {
    "port": 18101,           // 监听端口（启动脚本会读取此项）
    "host": "127.0.0.1",     // 绑定地址（仅本机）
    "autoOpenBrowser": true   // 启动时是否提示打开浏览器
  },
  "activeProviderId": "opencode",  // 当前活跃供应商 ID
  "providers": [
    {
      "id": "opencode",           // 唯一标识（用于内部路由）
      "name": "Codex Zen (big-pickle)", // 控制台显示名
      "enabled": true,            // 是否启用（隐藏但不删除）
      "type": "predefined",       // 预设 或 通用
      "baseUrl": "https://opencode.ai/zen/v1",
      "authType": "bearer",       // bearer 或 none
      "apiKey": "sk-xxx",
      "model": "big-pickle",      // 发给上游的 model 字段
      "extraHeaders": {           // 额外请求头（JSON 对象）
        "User-Agent": "opencode/latest/1.18.18/cli",
        "x-opencode-client": "cli"
      }
    }
    // ... 更多供应商
  ]
}
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 18101 | 覆盖监听端口（优先于 config.json） |
| `RELOAD_MODE` | `cache` | `cache`=内存缓存（推荐）；`disk`=每请求读盘（防御手工改文件） |

### 自动备份机制

- 每次在控制台保存配置前，自动备份到 `config.backup.json`
- 损坏的 config.json 会自动备份为 `config.corrupt.<时间戳>.json` 并重新生成默认配置
- 写入 Claude settings.json 前自动备份到 `~/.claude/settings.json.bak`

### 多实例运行

如需同时使用不同端口运行多个代理（例如同时连 opencode 和 DeepSeek），可：

1. 复制整个绿色文件夹
2. 修改副本中 `config.json` 的 `global.port` 为不同端口（如 18102）
3. 分别启动两个实例
4. 根据需要切换 Claude Code 的 `ANTHROPIC_BASE_URL` 指向对应端口

---

## 文件清单

| 文件 | 作用 |
|------|------|
| `proxy.mjs` | 代理核心程序（零依赖 Node，供应商抽象层 + Anthropic↔OpenAI 转换） |
| `config.json` | 运行时配置（端口 + 供应商列表，保存 API Key） |
| `console/index.html` | Web 控制台界面（浏览器打开，零 CDN 离线可用） |
| `start.cmd` | Windows 双击启动（后台运行 + 自动开浏览器） |
| `stop.cmd` | Windows 双击停止（按端口杀进程） |
| `start-proxy.ps1` | PowerShell 启动脚本（高级参数支持） |
| `stop-proxy.ps1` | PowerShell 停止脚本 |
| `README.md` | 项目简介和快速参考 |
| `USAGE.md` | 本使用说明 |
| `legacy/` | 原始 claude-zen-proxy.mjs 备份（可删除） |

---

**Green Proxy v1** · 零依赖 Node · 内置 Web 控制台 · 多供应商实时切换
