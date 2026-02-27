## Context

记忆系统由后端两个模块构成：`ShortTermMemory`（aiosqlite/SQLite）和 `LongTermMemory`（ChromaDB）。两者均在 `VTuberBot` 启动时初始化并作为实例属性持有。目前没有任何 HTTP 接口暴露记忆内容，调试只能通过直接读取数据库文件完成。

前端已有 4 个页面（Dashboard / Live2D / Settings / Character），使用 React Router v6 + Tailwind CSS 暗色主题，侧边栏固定导航。

## Goals / Non-Goals

**Goals:**
- 提供 HTTP API 读取短期（SQLite）和长期（ChromaDB）记忆内容
- 前端新增 `/memory` 页面，可视化展示两类记忆
- 支持单条删除（短期和长期）
- 支持导出全量记忆数据为 JSON 文件
- 侧边栏新增入口

**Non-Goals:**
- 不支持在页面中创建/编辑记忆条目
- 不支持长期记忆的重新评分或重新向量化
- 不支持记忆配置的页面化修改（已有 Settings 页面覆盖）
- 不引入 WebSocket 实时推送（轮询或手动刷新足够）

## Decisions

### 决策 1：后端 API 直接访问 bot 实例的 memory 属性

**选择**: 在 `memory_api.py` 中通过导入 `bot` 单例获取 `bot.short_term` 和 `bot.long_term`。

**理由**: 与现有 `chat_api.py`、`config_api.py` 保持一致的模式（均从 bot 实例获取资源），避免重复初始化数据库连接。

**备选**: 在 API 层独立初始化数据库连接。缺点是可能与 bot 的连接产生文件锁争用（SQLite WAL 模式下概率低，但 ChromaDB 不支持多进程写入）。

---

### 决策 2：长期记忆通过 ChromaDB `.get()` 读取所有条目

**选择**: 调用 `collection.get(include=["documents", "metadatas"])` 获取全量长期记忆。

**理由**: ChromaDB 目前无分页 API，且预期长期记忆条目数较少（每次评分写入概率约 20-30%，总量通常 < 100 条），全量读取性能可接受。

**备选**: 使用 `collection.query()` 按向量检索。不适合"展示所有记忆"的调试场景。

---

### 决策 3：前端不做实时轮询，用户手动刷新

**选择**: 页面加载时请求一次，提供"刷新"按钮触发重新加载。

**理由**: 调试页面不需要实时性，避免增加后端轮询开销，实现简单。

---

### 决策 4：导出格式为 JSON，前端直接 `Blob` 下载

**选择**: 后端返回结构化 JSON（含短期和长期两部分），前端通过 `URL.createObjectURL(blob)` 触发浏览器下载。

**理由**: 与项目现有 API 风格一致，无需新增文件系统操作。

## Risks / Trade-offs

- **[风险] SQLite 并发读取** → bot 使用 aiosqlite，API 也用 aiosqlite 读取同一文件；SQLite 默认 WAL 模式下只读并发安全，风险极低
- **[风险] ChromaDB 长期记忆数量过大** → 使用全量 `.get()` 读取；现阶段数据量有限，可接受；未来若需要分页再添加
- **[Trade-off] 不引入实时推送** → 调试时需手动刷新，但降低了实现复杂度

## Migration Plan

1. 添加 `backend/api/memory_api.py`
2. 在 `backend/main.py` 挂载新路由
3. 添加 `frontend/src/pages/MemoryDebug.tsx`
4. 修改 `frontend/src/App.tsx` 注册路由
5. 修改侧边栏添加导航项

无数据迁移，无破坏性变更，回滚只需移除对应文件和路由注册。

## Open Questions

（无）
