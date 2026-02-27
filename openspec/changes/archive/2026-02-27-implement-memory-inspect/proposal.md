## Why

调试记忆系统目前需要直连 SQLite 或 ChromaDB 才能查看已存储的对话内容，缺乏可视化工具。开发者无法快速判断短期记忆是否正确写入、长期记忆的晋升是否触发、以及具体存储了哪些内容，严重影响调试体验和系统可观测性。

## What Changes

- 新增前端路由 `/memory`，展示记忆调试页面
- 后端新增 `/api/memory` REST API，支持读取、删除短期和长期记忆条目
- 支持将当前记忆数据导出为 JSON 文件
- 侧边栏导航新增「记忆调试」入口

## Capabilities

### New Capabilities
- `memory-debug-page`: 记忆系统可视化调试界面，展示短期（SQLite）和长期（ChromaDB）记忆条目，支持按条件过滤、单条或批量删除、以及导出全量数据为 JSON

### Modified Capabilities
（无需求层面变更）

## Impact

- **前端**: 新增 `frontend/src/pages/MemoryDebug.tsx` 页面；修改 `App.tsx` 添加路由；修改 `Sidebar` 组件添加导航项
- **后端**: 新增 `backend/api/memory_api.py`，挂载到 FastAPI 主应用；只读访问 `ShortTermMemory` 和 `LongTermMemory` 实例（需从 bot 实例获取）
- **依赖**: 无新增外部依赖；ChromaDB 的 `.get()` 和 `.delete()` 方法已有支持
