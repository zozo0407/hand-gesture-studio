#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

STATUS_LOG="/tmp/hand-workshop-netlify-status.log"

finish() {
  local status=$?
  echo

  if [ "$status" -eq 0 ]; then
    echo "部署流程已结束。"
  else
    echo "部署失败，退出码：$status"
  fi

  echo "按回车键关闭窗口..."
  read -r _
  exit "$status"
}

trap finish EXIT

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm。请先安装 Node.js，然后重新运行这个部署程序。"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "未找到 node_modules，正在安装依赖..."
  npm install
fi

echo "检查 Netlify 登录状态和项目绑定..."
if ! npx netlify status >"$STATUS_LOG" 2>&1; then
  cat "$STATUS_LOG"
  echo
  echo "Netlify 尚未登录或当前目录尚未绑定站点。"
  echo "请先在终端运行以下命令完成配置："
  echo "  npx netlify login"
  echo "  npx netlify link"
  exit 1
fi

cat "$STATUS_LOG"
echo

echo "运行测试..."
npm test -- --run

echo
echo "构建生产版本..."
npm run build

echo
echo "部署到 Netlify 生产环境..."
npx netlify deploy --prod --dir=dist

echo
if [ -n "${PRODUCTION_URL:-}" ]; then
  echo "线上地址：$PRODUCTION_URL"

  if command -v open >/dev/null 2>&1; then
    open "$PRODUCTION_URL"
  fi
else
  echo "部署完成。请查看上方 Netlify 输出中的 Production URL。"
  echo "如需部署后自动打开地址，可这样运行："
  echo "  PRODUCTION_URL=https://your-site.netlify.app ./deploy.command"
fi
