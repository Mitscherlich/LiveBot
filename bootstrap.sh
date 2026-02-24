#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
VENV_DIR="$BACKEND_DIR/.venv"

# ─── 颜色输出 ────────────────────────────────────────────────────────────────
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
RED=$'\033[0;31m'
BOLD=$'\033[1m'
NC=$'\033[0m'

info()    { echo -e "${GREEN}[✔]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✘]${NC} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}── $* ──────────────────────────────────────${NC}"; }

# ─── 工具检测 ────────────────────────────────────────────────────────────────
require() {
  command -v "$1" &>/dev/null || error "未找到 '$1'，请先安装后重试"
}

section "检查依赖工具"

require python3
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
PYTHON_MAJOR=$(python3 -c 'import sys; print(sys.version_info[0])')
PYTHON_MINOR=$(python3 -c 'import sys; print(sys.version_info[1])')

if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]; }; then
  error "需要 Python 3.10+，当前版本为 $PYTHON_VERSION"
fi
info "Python $PYTHON_VERSION"

# pnpm：未安装时提示通过 corepack 启用
if ! command -v pnpm &>/dev/null; then
  warn "未找到 pnpm，尝试通过 corepack 启用..."
  require node
  corepack enable pnpm 2>/dev/null || error "corepack 启用 pnpm 失败，请手动安装：npm install -g pnpm"
fi
PNPM_VERSION=$(pnpm --version)
info "pnpm $PNPM_VERSION"

NODE_VERSION=$(node --version)
info "Node.js $NODE_VERSION"

# ─── Python 虚拟环境 ──────────────────────────────────────────────────────────
section "初始化 Python 虚拟环境"

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
  info "已创建虚拟环境：$VENV_DIR"
else
  info "虚拟环境已存在，跳过创建"
fi

# 激活 venv
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"
info "虚拟环境已激活：$(python --version)"

# ─── 安装后端依赖 ──────────────────────────────────────────────────────────────
section "安装后端 Python 依赖"

pip install --upgrade pip --quiet
pip install -r "$BACKEND_DIR/requirements.txt"
info "后端依赖安装完成"

# ─── 安装前端依赖 ──────────────────────────────────────────────────────────────
section "安装前端依赖（pnpm）"

cd "$FRONTEND_DIR"

# 若 package.json 中 packageManager 未声明 pnpm，自动追加
if ! grep -q '"packageManager"' package.json 2>/dev/null; then
  PNPM_FULL_VERSION=$(pnpm --version)
  # 用 node 原地修改 JSON，避免 jq 依赖
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (!pkg.packageManager) {
      pkg.packageManager = 'pnpm@${PNPM_FULL_VERSION}';
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
      console.log('已写入 packageManager 字段');
    }
  "
fi

pnpm install
info "前端依赖安装完成"

cd "$REPO_ROOT"

# ─── 初始化配置文件 ────────────────────────────────────────────────────────────
section "初始化配置文件"

if [ ! -f "$BACKEND_DIR/config.yaml" ]; then
  # 生成默认 config.yaml（空配置，等待 Web UI 填写）
  cat > "$BACKEND_DIR/config.yaml" <<'YAML'
character:
  name: 小零
  persona: 你是一个活泼开朗的虚拟主播。
  live2d_model: ''
llm:
  provider: deepseek
  api_key: ''
  base_url: https://api.deepseek.com
  model: deepseek-chat
  temperature: 0.8
  max_tokens: 512
asr:
  model_size: small
  device: auto
  vad_sensitivity: 2
  silence_duration_ms: 800
  microphone_device_index: null
tts:
  secret_id: ''
  secret_key: ''
  voice_type: 101001
  codec: pcm
  sample_rate: 16000
memory:
  short_term_window: 10
  short_term_max: 50
  long_term_score_threshold: 7
  chroma_db_path: ./data/chroma
  sqlite_path: ./data/conversations.db
YAML
  info "已生成默认配置文件：$BACKEND_DIR/config.yaml"
else
  info "config.yaml 已存在，跳过生成"
fi

# ─── 完成提示 ─────────────────────────────────────────────────────────────────
section "安装完成"

cat <<EOF

${BOLD}下一步操作：${NC}

1. 编辑 API Key（或启动后在 Web 界面配置）：
   ${YELLOW}vim $BACKEND_DIR/config.yaml${NC}

2. 安装 Live2D SDK（可选）：
   ${YELLOW}cat $REPO_ROOT/frontend/public/live2d/SETUP.md${NC}

3. 启动后端：
   ${YELLOW}source $VENV_DIR/bin/activate && cd backend && python main.py${NC}

4. 启动前端（开发模式）：
   ${YELLOW}cd frontend && pnpm dev${NC}

   或构建生产版本：
   ${YELLOW}cd frontend && pnpm build${NC}
   ${YELLOW}cd backend && python main.py${NC}  # 同时服务前端

EOF
