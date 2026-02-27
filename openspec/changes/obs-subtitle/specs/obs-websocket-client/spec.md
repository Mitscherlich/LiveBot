## ADDED Requirements

### Requirement: 建立 OBS WebSocket 连接
系统 SHALL 能够连接到指定地址的 OBS WebSocket 服务（默认 `ws://127.0.0.1:4455`），连接参数（host、port、password）SHALL 可通过配置文件设置。

#### Scenario: 成功连接无密码 OBS
- **WHEN** OBS WebSocket 服务已启动且未设置密码
- **THEN** 客户端 SHALL 完成握手（op=0/op=1）并进入已连接状态

#### Scenario: 成功连接有密码 OBS
- **WHEN** OBS WebSocket 服务已启动且设置了密码
- **THEN** 客户端 SHALL 使用 `Base64(SHA256(Base64(SHA256(password + salt)) + challenge))` 计算认证字符串，发送 op=1 完成认证

#### Scenario: 连接失败时降级
- **WHEN** OBS WebSocket 服务未运行或地址不可达
- **THEN** 客户端 SHALL 捕获连接异常，记录 warning 日志，并允许主流程继续运行

### Requirement: 发送 SetInputSettings 请求
系统 SHALL 能够向 OBS 发送 `SetInputSettings` 请求（op=6），远程修改指定文字组件的 `text` 属性。

#### Scenario: 成功设置文字内容
- **WHEN** 客户端已连接，且指定 inputName 的 Text (GDI+) 组件存在于当前场景
- **THEN** 系统 SHALL 发送包含 requestType、requestId（UUID）和 requestData 的 op=6 消息，OBS 返回成功响应

#### Scenario: 组件不存在时记录错误
- **WHEN** 指定 inputName 的组件在 OBS 当前场景中不存在
- **THEN** 系统 SHALL 记录 error 日志，不抛出异常，不中断调用方流程

#### Scenario: 连接断开时静默跳过
- **WHEN** WebSocket 连接已断开后调用 SetInputSettings
- **THEN** 系统 SHALL 捕获异常，记录 warning 日志，返回而不重试
