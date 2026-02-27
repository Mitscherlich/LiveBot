## Why

当前 HTTP server 默认绑定到 0.0.0.0，允许任意网络访问，这在生产环境或公共网络中存在安全隐患。需要将默认绑定地址改为 127.0.0.1 以限制仅本机访问，同时提供配置界面让用户根据需求自定义监听地址。

## What Changes

- **BREAKING**: HTTP server 默认绑定地址从 `0.0.0.0` 改为 `127.0.0.1`
- 新增后端配置项 `server.host` 用于控制监听地址
- 前端新增【系统配置】页面，支持查看和修改监听地址
- 配置变更后需要重启服务生效

## Capabilities

### New Capabilities
- `server-config`: 服务器监听地址配置管理，支持读取和保存 host 配置
- `system-settings-page`: 前端系统配置页面，提供 UI 界面配置监听地址

### Modified Capabilities
- 无现有 spec 需要修改（配置系统尚不属于已有 spec 范围）

## Impact

- **backend/config.yaml**: 新增 `server.host` 配置项
- **backend/config.py**: 配置模型添加 host 字段
- **backend/main.py**: 使用配置的 host 地址启动 server
- **frontend/src/pages/**: 新增 SystemSettings 页面
- **frontend/src/App.tsx**: 添加系统配置路由
