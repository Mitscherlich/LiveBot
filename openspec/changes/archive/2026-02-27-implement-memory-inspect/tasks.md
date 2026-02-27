## 1. 后端：记忆 API

- [x] 1.1 新建 `backend/api/memory_api.py`，创建 `router = APIRouter(prefix="/api/memory")` 并导入 bot 单例获取 `short_term`、`long_term` 实例
- [x] 1.2 实现 `GET /api/memory/short-term`：查询 SQLite 全量 conversations，按 id 升序返回 JSON 数组（含 id/role/content/emotion/timestamp/promoted）
- [x] 1.3 实现 `DELETE /api/memory/short-term/{id}`：按 id 删除 SQLite 行，不存在时返回 404
- [x] 1.4 实现 `GET /api/memory/long-term`：调用 `collection.get(include=["documents","metadatas"])` 返回所有长期记忆（id + document）
- [x] 1.5 实现 `DELETE /api/memory/long-term/{doc_id}`：调用 `collection.delete(ids=[doc_id])`，不存在时返回 404
- [x] 1.6 实现 `GET /api/memory/export`：聚合短期和长期数据，返回 `{short_term: [...], long_term: [...]}` JSON
- [x] 1.7 在 `backend/main.py` 中 `include_router(memory_router)`

## 2. 前端：记忆调试页面

- [x] 2.1 新建 `frontend/src/pages/MemoryDebug.tsx`，实现标签页组件（短期记忆 / 长期记忆）
- [x] 2.2 页面加载时并行请求 `/api/memory/short-term` 和 `/api/memory/long-term`，展示 loading 状态
- [x] 2.3 短期记忆标签页：以表格展示 id/role/content（截断 100 字）/emotion/时间/promoted，每行有「删除」按钮
- [x] 2.4 长期记忆标签页：以表格展示 id/document 内容（截断 150 字），每行有「删除」按钮
- [x] 2.5 删除操作：点击删除弹出 `window.confirm` 确认，确认后调用 DELETE API，成功则从本地 state 移除该行
- [x] 2.6 实现「导出 JSON」按钮：请求 `/api/memory/export`，用 `URL.createObjectURL(blob)` 触发下载，文件名 `memory-export-{Date.now()}.json`
- [x] 2.7 实现「刷新」按钮：重新请求两个列表接口，更新 state

## 3. 前端：路由与导航

- [x] 3.1 在 `frontend/src/App.tsx` 中添加 `<Route path="/memory" element={<MemoryDebug />} />`
- [x] 3.2 在侧边栏组件中添加「记忆」导航项（使用 `Brain` 或 `Database` lucide 图标），链接到 `/memory`
