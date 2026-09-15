# 启动 Claude Code -> 三方模型 桥接代理（多供应商版）
# 用法：双击运行，或在 PowerShell 中执行 .\start-proxy.ps1
# 代理监听 http://127.0.0.1:18101，供应商配置见 config.json / 控制台 /console

$ErrorActionPreference = "Stop"

$ProxyDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script = Join-Path $ProxyDir "proxy.mjs"

# 可选：端口覆盖（默认 18101）
$Port = if ($env:PROXY_PORT) { $env:PROXY_PORT } else { "18101" }

# 检查脚本是否存在
if (-not (Test-Path -LiteralPath $Script)) {
    Write-Host "[错误] 找不到代理脚本: $Script" -ForegroundColor Red
    exit 1
}

# 检查端口是否已被占用（已运行则提示，不重复启动）
$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[提示] 端口 $Port 已被占用，代理可能已在运行。" -ForegroundColor Yellow
    Write-Host "       curl http://127.0.0.1:$Port/v1/models 可验证。" -ForegroundColor Yellow
    exit 0
}

Write-Host "启动代理 on http://127.0.0.1:$Port (供应商配置见 config.json) ..." -ForegroundColor Cyan

# 后台静默启动（日志写入 proxy.log / proxy.err.log）
Start-Process -FilePath "node.exe" -ArgumentList @($Script) -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $ProxyDir "proxy.log") `
    -RedirectStandardError (Join-Path $ProxyDir "proxy.err.log")

Start-Sleep -Seconds 2

# 验证
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/v1/models" -Method GET -TimeoutSec 10 -UseBasicParsing
    Write-Host "代理已就绪 (HTTP $($r.StatusCode)): $($r.Content)" -ForegroundColor Green
} catch {
    Write-Host "[错误] 代理启动后验证失败: $($_.Exception.Message)" -ForegroundColor Red
}