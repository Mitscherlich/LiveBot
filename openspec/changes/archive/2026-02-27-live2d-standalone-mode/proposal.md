## Why

使用 OBS 等直播软件进行虚拟主播场景时，需要单独捕获 Live2D 渲染层，而当前页面包含管理 UI、聊天框、字幕等元素，无法干净地采集。通过 `?standalone=1` 参数提供独立渲染模式，OBS 可直接访问纯模型画面，配合绿幕或透明背景无缝合成。

## What Changes

- 前端页面检测 URL 参数 `standalone=1`，进入独立渲染模式
- 独立模式下隐藏所有非 Live2D 渲染元素（管理框架、导航栏、聊天输入框、字幕层、控制面板等）
- 独立模式下 Live2D Canvas 全屏铺满，背景透明（支持 OBS 窗口捕获 + 绿幕抠图）
- 独立模式下字幕不显示（字幕为 Live2D 画面之外的叠加层）
- WebSocket 连接和模型渲染逻辑保持不变，仅影响 UI 展示层

## Capabilities

### New Capabilities

（无新增独立 capability，本次变更为 live2d-renderer 渲染页面的展示行为扩展）

### Modified Capabilities

- `live2d-renderer`：新增独立模式（standalone mode）需求——支持 `?standalone=1` URL 参数，进入后隐藏字幕层和所有非 Canvas UI，Canvas 背景透明全屏

## Impact

- **前端页面**：Live2D 渲染页面（`/live2d` 路由或对应 HTML 入口）的布局逻辑
- **字幕组件**：standalone 模式下不渲染字幕 DOM 元素
- **CSS/样式**：新增 `.standalone` body class，通过 CSS 控制元素显隐
- **无后端变更**：WebSocket、API 接口均不受影响
