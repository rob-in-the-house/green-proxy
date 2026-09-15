# 停止 Claude Code -> opencode/big-pickle 桥接代理
# 用法：在 PowerShell 中执行 .\stop-proxy.ps1

$Port = if ($env:PROXY_PORT) { $env:PROXY_PORT } else { "18101" }

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
    Write-Host "端口 $Port 没有监听中的代理进程。" -ForegroundColor Yellow
    exit 0
}

foreach ($c in $conns) {
    $pid0 = $c.OwningProcess
    Write-Host "正在终止进程 PID=$pid0 (端口 $Port)..." -ForegroundColor Cyan
    Stop-Process -Id $pid0 -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1
$left = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($left) {
    Write-Host "仍有进程占用端口 $Port，请手动检查。" -ForegroundColor Red
} else {
    Write-Host "代理已停止。" -ForegroundColor Green
}
