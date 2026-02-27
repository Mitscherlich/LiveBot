## ADDED Requirements

### Requirement: Standalone 独立渲染模式
系统 SHALL 支持通过 URL 参数 `standalone=1` 进入独立渲染模式，仅展示 Live2D 模型 Canvas，隐藏所有非渲染 UI 元素。

#### Scenario: 进入独立模式
- **WHEN** 用户访问 `/live2d?standalone=1`
- **THEN** 页面不渲染侧边导航栏（Sidebar）、顶部状态栏、调试面板、聊天面板及字幕叠加层，Live2D Canvas 铺满整个视口

#### Scenario: 独立模式下字幕不显示
- **WHEN** standalone 模式已激活，WebSocket 收到 `{type: "subtitle", text: "..."}` 消息
- **THEN** `SubtitleDisplay` 组件不渲染（模型口型动画正常执行，字幕文字不显示）

#### Scenario: 独立模式下 WebSocket 正常工作
- **WHEN** 用户以 `?standalone=1` 打开页面
- **THEN** WebSocket 连接、口型同步、情感动作触发逻辑与普通模式完全一致

#### Scenario: 独立模式下 Canvas 背景透明
- **WHEN** standalone 模式已激活
- **THEN** Canvas 背景为透明（WebGL alpha: true，clearColor(0,0,0,0)），OBS Browser Source 可穿透背景实现绿幕合成

#### Scenario: 普通模式不受影响
- **WHEN** 用户访问 `/live2d`（无 standalone 参数）
- **THEN** 页面渲染完整 UI（侧边栏、状态栏、聊天面板、字幕），行为与变更前完全一致
