## Context

当前 `/live2d` 路由渲染 `Live2DView.tsx`，该组件包含：顶部状态栏、调试抽屉、左右分栏布局（Live2D Canvas + 对话信息流）。整个应用由 `App.tsx` 的 Shell 布局包裹（左侧 `Sidebar` + 右侧 `<main>`）。

WebGL Canvas 已配置透明背景（`alpha: true` + `gl.clearColor(0,0,0,0)`），CSS 也设为 `background: transparent`，OBS Browser Source 可直接穿透至绿幕。

## Goals / Non-Goals

**Goals:**
- 通过 `?standalone=1` URL 参数进入独立渲染模式
- 独立模式下隐藏 Sidebar、状态栏、调试面板、聊天面板、字幕层
- Canvas 全屏覆盖整个视口，完整保留模型渲染和 WebSocket 驱动逻辑
- 无需改动后端代码

**Non-Goals:**
- 不新增独立路由（`/standalone` 等），复用 `/live2d` 路径
- 不修改 WebGL 透明逻辑（已就绪）
- 不支持独立模式下的 chat/voice 交互

## Decisions

### 决策 1：URL 参数检测位置

**选择**：在 `App.tsx` 和 `Live2DView.tsx` 中各自检测 URL 参数，使用共享的 `useStandaloneMode()` hook。

**理由**：参数需要在两层组件中生效（Shell 层隐藏 Sidebar，页面层隐藏内部 UI）。提取为 hook 避免重复逻辑，且无需 Context 或状态提升。

**替代方案**：新建 `/standalone` 路由——增加路由配置复杂度，且 OBS 用户需要记住不同的 URL。

### 决策 2：隐藏方式

**选择**：CSS 条件渲染（`standalone && ...`），不使用 `.standalone` body class。

**理由**：React 条件渲染更直观，不污染全局 CSS，且不依赖 DOM class 命名约定。Standalone 模式是启动时确定的静态状态，无需运行时切换。

### 决策 3：Canvas 铺满方式

**选择**：独立模式下，`App.tsx` 跳过 Sidebar，`<main>` 全屏。`Live2DView.tsx` 直接返回 `<Live2DCanvas>` 全屏 div，不包含状态栏/聊天面板。

**理由**：最小改动路径，无需新组件，复用现有 Canvas 生命周期。

## Risks / Trade-offs

- **WebSocket 重连影响**：独立模式仍保留 WebSocket 连接，若后端未启动则一直重连；OBS 场景下用户无感，风险可接受。
- **无模型提示**：独立模式不显示"未配置模型"的占位提示；可接受，用户应先在管理界面配置。

## Migration Plan

1. 纯前端改动，无数据库/API 变更
2. 发布后，OBS Browser Source 填入 `http://localhost:5173/live2d?standalone=1` 即可使用
3. 不影响现有 `/live2d` 正常访问

## Open Questions

（无）
