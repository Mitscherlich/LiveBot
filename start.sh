#!/usr/bin/env bash
# 生产启动：构建前端，然后由后端统一服务
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$REPO_ROOT/backend/.venv"

# ── 检查环境 ─────────────────────────────────────────────────────────────────
[ -d "$VENV_DIR" ] || { echo "[✘] 未找到虚拟环境，请先运行 ./bootstrap.sh" >&2; exit 1; }
[ -d "$REPO_ROOT/frontend/node_modules" ] || { echo "[✘] 未安装前端依赖，请先运行 ./bootstrap.sh" >&2; exit 1; }

# ── 构建前端 ──────────────────────────────────────────────────────────────────
echo "[构建] 正在构建前端..."
(
  cd "$REPO_ROOT/frontend"
  pnpm build
)
echo "[构建] 完成，产物输出到 backend/static/"

# ── 启动后端（同时服务前端静态文件） ─────────────────────────────────────────
echo "[启动] 启动后端服务（端口 8000）..."
echo "  访问地址：http://localhost:8000"
echo ""

source "$VENV_DIR/bin/activate"
cd "$REPO_ROOT/backend"
exec python main.py
