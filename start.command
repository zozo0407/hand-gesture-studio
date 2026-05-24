#!/bin/bash
set -e

cd "$(dirname "$0")"

HOST="127.0.0.1"
PORT="${PORT:-5173}"
APP_MARKER="手势工坊"

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm。请先安装 Node.js，然后重新运行这个启动程序。"
  exit 1
fi

for ((candidate = PORT; candidate <= PORT + 30; candidate++)); do
  URL="http://${HOST}:${candidate}/"

  if curl -fsS "$URL" 2>/dev/null | grep -q "$APP_MARKER"; then
    echo "手势工坊已在运行：$URL"
    open "$URL"
    exit 0
  fi

  if ! curl -fsS "$URL" >/dev/null 2>&1; then
    PORT="$candidate"
    URL="http://${HOST}:${PORT}/"
    break
  fi
done

if [ ! -d "node_modules" ]; then
  echo "首次启动：正在安装依赖..."
  npm install
fi

echo "正在启动手势工坊：$URL"
(
  for ((attempt = 1; attempt <= 60; attempt++)); do
    if curl -fsS "$URL" 2>/dev/null | grep -q "$APP_MARKER"; then
      open "$URL"
      exit 0
    fi
    sleep 0.5
  done

  open "$URL"
) &

npm run dev -- --host "$HOST" --port "$PORT" --strictPort
