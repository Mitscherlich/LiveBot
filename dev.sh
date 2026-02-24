#!/usr/bin/env bash
# 调试启动：同时启动后端（uvicorn）和前端 dev server（pnpm dev）
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$REPO_ROOT/backend/.venv"

# ── 检查环境 ─────────────────────────────────────────────────────────────────
[ -d "$VENV_DIR" ] || { echo "[✘] 未找到虚拟环境，请先运行 ./bootstrap.sh" >&2; exit 1; }
[ -d "$REPO_ROOT/frontend/node_modules" ] || { echo "[✘] 未安装前端依赖，请先运行 ./bootstrap.sh" >&2; exit 1; }

# ── 清理函数（Ctrl+C 时终止所有子进程） ──────────────────────────────────────
_pids=()
cleanup() {
  echo ""
  echo "正在关闭所有进程..."
  for pid in "${_pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "已退出"
}
trap cleanup INT TERM

# ── 启动后端 ──────────────────────────────────────────────────────────────────
echo "[后端] 启动 uvicorn（端口 8000）..."
(
  source "$VENV_DIR/bin/activate"
  cd "$REPO_ROOT/backend"
  python main.py
) &
_pids+=($!)

# ── 启动前端 dev server ───────────────────────────────────────────────────────
echo "[前端] 启动 pnpm dev（端口 5173）..."
(
  cd "$REPO_ROOT/frontend"
  pnpm dev
) &
_pids+=($!)

echo ""
echo "  后端：http://localhost:8000"
echo "  前端：http://localhost:5173  ← 开发时访问此地址"
echo ""
echo "按 Ctrl+C 停止所有进程"

wait
