#!/usr/bin/env bash
# ============================================
# Green Proxy - Linux 启动脚本
# 多供应商 Claude Code 桥接代理
# 用法: ./start.sh
# ============================================
set -e
cd "$(dirname "$(readlink -f "$0")")"

PORT=$(node -e "try{const c=require('./config.json');console.log((c.global&&c.global.port)||18101)}catch(e){console.log('18101')}")
PORT="${PROXY_PORT:-$PORT}"

# 检查 Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] 未找到 Node.js，请先安装 Node v18+（https://nodejs.org/）"
  exit 1
fi

# 检查端口是否被占用
if ss -tlnp 2>/dev/null | grep -q ":$PORT " ; then
  echo "[INFO] 端口 $PORT 已被占用，代理可能已在运行。"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://127.0.0.1:$PORT/console" 2>/dev/null || true
  fi
  echo "       控制台: http://127.0.0.1:$PORT/console"
  exit 0
fi

mkdir -p ./logs

echo "============================================"
echo "  Green Proxy - 多供应商 Claude Code 代理"
echo "============================================"
echo ""
echo "启动代理 on http://127.0.0.1:$PORT ..."
echo ""

# 后台启动 (nohup)
nohup node ./proxy.mjs >> ./logs/proxy.log 2>&1 &
PID=$!
echo "PID: $PID"

# 等待就绪
for i in $(seq 1 15); do
  if curl -s "http://127.0.0.1:$PORT/v1/models" >/dev/null 2>&1; then
    echo "[OK] 代理已就绪!"
    echo ""
    echo "  控制台: http://127.0.0.1:$PORT/console"
    echo "  Claude Code base: http://127.0.0.1:$PORT"
    echo ""
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "http://127.0.0.1:$PORT/console" 2>/dev/null || true
    fi
    echo "启动成功。关闭此窗口不会停止代理。"
    exit 0
  fi
  sleep 1
done

echo "[ERROR] 代理 15 秒内未能启动，请检查 logs/proxy.log"
cat ./logs/proxy.log 2>/dev/null | tail -20 || true
exit 1
