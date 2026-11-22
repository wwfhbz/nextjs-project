#!/usr/bin/env bash
# 在你自己的电脑上运行：构建游戏并上传到轻量应用服务器
# 用法：SERVER=root@你的服务器IP bash deploy/deploy.sh
set -euo pipefail

SERVER="${SERVER:?请先设置 SERVER，例如 SERVER=root@1.2.3.4}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/ditie}"

cd "$(dirname "$0")/.."
yarn install --frozen-lockfile
yarn build                      # 生成 out/ 目录

ssh "$SERVER" "mkdir -p '$REMOTE_DIR'"
# --delete：删掉服务器上旧版本留下的文件
rsync -az --delete out/ "$SERVER:$REMOTE_DIR/"
echo "网站上传完成：$SERVER:$REMOTE_DIR"

# 排行榜服务：上传后重启（第一次部署请先按 deploy/README.md 第 6 步安装）
ssh "$SERVER" "mkdir -p /opt/ditie"
scp server/leaderboard.js "$SERVER:/opt/ditie/leaderboard.js"
ssh "$SERVER" "systemctl restart ditie-leaderboard 2>/dev/null && echo 排行榜服务已重启 || echo 排行榜服务还没安装，见 deploy/README.md 第 6 步"
