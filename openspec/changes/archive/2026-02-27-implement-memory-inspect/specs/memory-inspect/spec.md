# Memory Debug Page

## Purpose

Memory Debug Page 为开发者提供可视化的记忆系统调试界面，展示 AI VTuber 当前存储的短期（SQLite）和长期（ChromaDB）记忆条目，支持单条删除和全量导出 JSON，帮助快速定位记忆写入和检索问题。

## Requirements

### Requirement: 读取短期记忆列表（分页）
系统 SHALL 提供 HTTP API 返回分页短期记忆条目，包含 id、role、content、emotion、timestamp、promoted 字段。

支持 `page` 和 `page_size` 查询参数，默认 `page=1`, `page_size=20`。

#### Scenario: 成功获取短期记忆（第一页）
- **WHEN** 客户端发送 `GET /api/memory/short-term?page=1&page_size=20`
- **THEN** 系统返回分页对象 `{items: [{id, role, content, emotion, timestamp, promoted}, ...], total: N, page: 1, page_size: 20}`，items 按 id 升序排列

##### Scenario: 分页查询短期记忆
- **WHEN** 客户端发送 `GET /api/memory/short-term?page=1&page_size=20`
- **THEN** 系统返回分页对象 `{items: [...], total: N, page: 1, page_size: 20}`，items 为当前页数据

##### Scenario: 记忆为空时返回空数组
- **WHEN** SQLite 中无任何对话记录，客户端发送 `GET /api/memory/short-term`
- **THEN** 系统返回 `{items: [], total: 0, page: 1, page_size: 20}`，HTTP 200
---

### Requirement: 读取长期记忆列表（分页）
系统 SHALL 提供 HTTP API 返回分页长期记忆条目，包含 id、document 字段。

支持 `page` 和 `page_size` 查询参数，默认 `page=1`, `page_size=20`。

#### Scenario: 成功获取长期记忆（第一页）
- **WHEN** 客户端发送 `GET /api/memory/long-term?page=1&page_size=20`
- **THEN** 系统返回分页对象 `{items: [{id, document}, ...], total: N, page: 1, page_size: 20}`

#### Scenario: 长期记忆为空时返回空对象
- **WHEN** ChromaDB collection 中无任何文档，客户端发送 `GET /api/memory/long-term`
- **THEN** 系统返回 `{items: [], total: 0, page: 1, page_size: 20}`，HTTP 200
---

### Requirement: 删除短期记忆条目
系统 SHALL 提供 HTTP API 按 id 删除指定短期记忆条目。

#### Scenario: 成功删除短期记忆
- **WHEN** 客户端发送 `DELETE /api/memory/short-term/{id}`，且该 id 存在
- **THEN** 系统从 SQLite 中删除该行，返回 `{"deleted": true}`，HTTP 200

#### Scenario: 删除不存在的短期记忆
- **WHEN** 客户端发送 `DELETE /api/memory/short-term/{id}`，且该 id 不存在
- **THEN** 系统返回 HTTP 404，body 含 `{"detail": "not found"}`

---

### Requirement: 删除长期记忆条目
系统 SHALL 提供 HTTP API 按文档 id 删除指定长期记忆条目。

#### Scenario: 成功删除长期记忆
- **WHEN** 客户端发送 `DELETE /api/memory/long-term/{doc_id}`，且该文档存在
- **THEN** 系统从 ChromaDB 中删除该文档，返回 `{"deleted": true}`，HTTP 200

#### Scenario: 删除不存在的长期记忆
- **WHEN** 客户端发送 `DELETE /api/memory/long-term/{doc_id}`，且该文档不存在
- **THEN** 系统返回 HTTP 404，body 含 `{"detail": "not found"}`

---

### Requirement: 导出全量记忆数据
系统 SHALL 提供 HTTP API 以 JSON 格式返回全部短期和长期记忆数据，供用户下载存档。

#### Scenario: 成功导出记忆数据
- **WHEN** 客户端发送 `GET /api/memory/export`
- **THEN** 系统返回包含 `short_term` 和 `long_term` 两个键的 JSON 对象，HTTP 200，Content-Type 为 `application/json`

---

### Requirement: 清空记忆（可选扩展）
系统 SHALL 提供 API 清空短期或长期记忆。

#### Scenario: 清空短期记忆
- **WHEN** 客户端发送 `POST /api/memory/clear/short-term`
- **THEN** 系统删除 SQLite 中所有 conversation 记录，返回 `{cleared: true}`

#### Scenario: 清空长期记忆
- **WHEN** 客户端发送 `POST /api/memory/clear/long-term`
- **THEN** 系统删除 ChromaDB 中所有文档，返回 `{cleared: true, deleted_count: N}`

### Requirement: 前端记忆调试页面
系统 SHALL 提供 `/memory` 路由页面，使用标签页分别展示短期和长期记忆，支持删除和导出操作。

#### Scenario: 页面加载时自动获取数据
- **WHEN** 用户导航到 `/memory` 页面
- **THEN** 页面自动请求短期和长期记忆列表，并在各自标签页内以表格形式展示

#### Scenario: 切换标签页
- **WHEN** 用户点击「短期记忆」或「长期记忆」标签
- **THEN** 对应内容区域切换显示，另一标签内容隐藏

#### Scenario: 删除单条记忆
- **WHEN** 用户点击某条记忆行上的「删除」按钮并确认
- **THEN** 前端调用对应删除 API，成功后从列表中移除该条目，无需整页刷新

#### Scenario: 导出记忆数据
- **WHEN** 用户点击「导出 JSON」按钮
- **THEN** 浏览器触发文件下载，文件名为 `memory-export-{timestamp}.json`，内容包含全量短期和长期记忆

#### Scenario: 手动刷新列表
- **WHEN** 用户点击「刷新」按钮
- **THEN** 前端重新请求短期和长期记忆列表，更新展示内容

#### Scenario: 侧边栏导航
- **WHEN** 用户点击侧边栏「记忆」导航项
- **THEN** 页面跳转到 `/memory` 路由，导航项高亮显示
