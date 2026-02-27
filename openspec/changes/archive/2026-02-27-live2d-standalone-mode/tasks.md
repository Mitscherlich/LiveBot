## 1. 创建 useStandaloneMode Hook

- [x] 1.1 新建 `frontend/src/hooks/useStandaloneMode.ts`，读取 `window.location.search` 中的 `standalone` 参数，返回 boolean

## 2. 修改 App.tsx Shell 布局

- [x] 2.1 在 `App.tsx` 中引入 `useStandaloneMode`，当 standalone=true 时跳过 `<Sidebar>` 渲染，`<main>` 铺满全屏（`w-screen h-screen`）

## 3. 修改 Live2DView.tsx 页面内容

- [x] 3.1 引入 `useStandaloneMode`，standalone 模式下跳过顶部状态栏渲染
- [x] 3.2 standalone 模式下跳过调试抽屉渲染
- [x] 3.3 standalone 模式下跳过右侧聊天面板和拖拽分隔条渲染
- [x] 3.4 standalone 模式下 Live2D Canvas 容器铺满整个可用空间（`w-full h-full`，无 padding）
- [x] 3.5 standalone 模式下不渲染 `<SubtitleDisplay>`（字幕叠加层）

## 4. 验证透明背景

- [x] 4.1 确认 `CubismRenderer.ts` 已有 `getContext('webgl', { alpha: true })` 和 `gl.clearColor(0,0,0,0)`（只读确认，无需修改）
- [x] 4.2 确认 `Live2DCanvas.tsx` canvas 元素有 `style={{ background: 'transparent' }}`（只读确认）
