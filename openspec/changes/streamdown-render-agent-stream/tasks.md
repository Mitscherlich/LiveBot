# Tasks: Streamdown 流式 Markdown 渲染

## Phase 1: 基础设置

- [x] **T1.1** 安装 streamdown 依赖
  - 运行 `npm install streamdown` 
  - 验证安装成功

- [x] **T1.2** 创建基础类型定义
  - 创建 `frontend/src/types/streamdown.ts`
  - 定义 StreamMessageProps 和相关类型

## Phase 2: 核心组件开发

- [x] **T2.1** 实现 useStreamdown Hook
  - 文件: `frontend/src/hooks/useStreamdown.ts`
  - 功能: 处理 SSE 流式数据，逐 token 更新
  - 接受参数: 初始内容、打字速度
  - 返回值: 渲染内容、是否完成、追加方法

- [x] **T2.2** 实现 StreamMessage 组件
  - 文件: `frontend/src/components/StreamMessage.tsx`
  - 功能: 使用 streamdown 渲染 Markdown
  - 支持流式打字效果
  - 集成光标闪烁动画

- [x] **T2.3** 添加 CSS 样式
  - 文件: `frontend/src/styles/streamdown.css`
  - 代码块样式（暗色主题）
  - 表格样式
  - 列表样式
  - 引用块样式
  - 打字光标动画

## Phase 3: 集成与测试

- [x] **T3.1** 修改 ChatMessage 组件
  - 集成 StreamMessage 替换纯文本
  - 保持现有消息气泡样式
  - 适配流式状态传递

- [x] **T3.2** 更新 Chat 页面
  - 修改 `frontend/src/pages/Chat.tsx`
  - 适配流式消息状态管理
  - 测试 SSE 数据流

- [ ] **T3.3** 端到端测试
  - 测试代码块渲染
  - 测试表格渲染
  - 测试列表渲染
  - 测试流式打字效果
  - 测试长消息性能

## Phase 4: 优化与完善

- [x] **T4.1** 代码高亮集成
  - 集成 highlight.js 或 prism.js
  - 支持常见编程语言

- [x] **T4.2** 性能优化
  - 添加渲染频率控制
  - 大消息虚拟滚动（如需要）

- [x] **T4.3** 错误处理
  - 处理不完整的 Markdown
  - XSS 防护

## 依赖

- `streamdown` - Markdown 渲染库
- `dompurify` - XSS 防护（如 streamdown 未内置）
- `highlight.js` - 代码高亮（可选）

## 验收标准

1. ✅ Agent 返回的 Markdown 消息正确渲染
2. ✅ 代码块显示语法高亮
3. ✅ 表格、列表、引用块格式正确
4. ✅ 消息以流式方式逐字/逐句出现
5. ✅ 打字效果流畅，无卡顿
6. ✅ 长消息渲染性能可接受
