#!/usr/bin/env bash
# ============================================
# Green Proxy - Linux 停止脚本
# 用法: ./stop.sh
# ============================================
cd "$(dirname "$(readlink -f "$0")")"

PORT=$(node -e "try{const c=require('./config.json');console.log((c.global&&c.global.port)||18101)}catch(e){console.log('18101')}")
PORT="${PROXY_PORT:-$PORT}"

echo "============================================"
echo "  Green Proxy - 停止代理 (端口 $PORT)"
echo "============================================"
echo ""

# 查找并杀掉监听该端口的进程
PID=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP '(?<=pid=)\d+' | head -1)
if [ -z "$PID" ]; then
  echo "[INFO] 端口 $PORT 无监听进程，代理可能未运行。"
  exit 0
fi

echo "  找到进程 PID=$PID"
kill "$PID" 2>/dev/null && echo "  已终止 PID=$PID" || echo "  终止失败（可能需要 sudo）"

echo ""
echo "代理已停止。"
