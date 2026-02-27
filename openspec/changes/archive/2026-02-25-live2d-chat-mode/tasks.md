## 1. 后端：新增 Chat 发送接口

- [x] 1.1 创建 `backend/api/chat_api.py`，定义 `POST /api/chat/send` 路由，接收 `{"text": str}` 请求体，校验非空后触发 `Event.INTERRUPT` 并调用 `bot.llm.generate(text, user_emotion="neutral")`，返回 `{"status": "ok"}`
- [x] 1.2 在 `backend/main.py` 中注册 `chat_api.router`（参照 `config_api`、`models_api` 的挂载方式）

## 2. 前端：ChatInputBar 组件

- [x] 2.1 创建 `frontend/src/components/ChatInputBar.tsx`，包含文本输入框（`<textarea>` 或 `<input>`）和发送按钮，支持 Enter 键发送、空内容时禁用按钮
- [x] 2.2 组件发送逻辑：调用 `POST /api/chat/send`，成功后清空输入框；失败时通过回调传递错误信息

## 3. 前端：Live2DView 集成

- [x] 3.1 在 `Live2DView.tsx` 中添加模式状态（`chatMode: 'voice' | 'chat'`），初始值从 `localStorage.getItem('chatMode')` 读取（默认 `'voice'`），切换时同步写入 localStorage
- [x] 3.2 在消息窗口顶部添加 Voice / Chat 模式切换按钮组（参照现有 Tailwind 样式风格）
- [x] 3.3 Chat 模式下在消息窗口底部渲染 `<ChatInputBar>`，并传入发送回调
- [x] 3.4 用户发送文本时，立即向消息列表追加一条用户气泡（复用现有 `asr_result` 消息的渲染格式，`role: 'user'`），并触发自动滚动到底部
- [x] 3.5 接口调用失败时，向消息列表追加错误提示条目（可用简单的红色文字气泡区分）

## 4. 验收测试

- [x] 4.1 Voice 模式下麦克风功能与切换前行为完全一致，Chat 输入栏不可见
- [x] 4.2 切换到 Chat 模式 → 刷新页面 → 验证 Chat 模式被恢复
- [x] 4.3 Chat 模式下发送文字 → 用户气泡即时出现 → LLM 回复 + 口型同步正常触发
- [x] 4.4 发送文字时若 Live2D 正在播放上一轮回复，验证自动打断并开始新一轮
- [x] 4.5 后端未运行时发送消息，验证前端显示错误提示而非静默失败
