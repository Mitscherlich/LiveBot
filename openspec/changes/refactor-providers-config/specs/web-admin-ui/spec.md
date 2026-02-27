# Web Admin UI

## Purpose

Web Admin UI 提供可视化配置界面，允许用户配置 LLM Provider、ASR 参数、TTS 凭证和音色、角色人设及 Live2D 模型，并支持配置保存后后端热重载对应模块。

## Requirements

### Requirement: LLM Provider 配置

系统 SHALL 提供 LLM provider 的可视化配置界面，支持选择 provider 类型、填写 API Key、Base URL 和模型名称，并提供连通性测试。

#### Scenario: 选择预设 Provider
- **WHEN** 用户从下拉列表选择 DeepSeek / Moonshot / 豆包 / Anthropic
- **THEN** 界面自动填充对应的默认模型名（Anthropic 默认填入 `claude-sonnet-4-6`），用户只需填写 API Key

#### Scenario: 选择 Anthropic Provider
- **WHEN** 用户选择「Anthropic (Claude)」选项
- **THEN** 界面自动填充模型名 `claude-sonnet-4-6`，后端使用 anthropic SDK 的 Messages API 调用，API Key 格式为 `sk-ant-...`

#### Scenario: 自定义 Provider
- **WHEN** 用户选择「自定义」选项
- **THEN** 界面显示 Base URL 输入框，用户可填写任意 OpenAI 兼容服务地址

#### Scenario: 测试连接
- **WHEN** 用户点击「测试连接」按钮
- **THEN** 后端使用当前配置发送一条测试请求，界面显示成功或错误信息（含错误详情）

---

### Requirement: ASR 配置

系统 SHALL 提供 ASR 参数配置界面，包括模型规格选择、VAD 灵敏度、环境音能量阈值、语音前置缓冲帧数和麦克风设备选择。

#### Scenario: 模型规格选择
- **WHEN** 用户从 `tiny / base / small / medium` 中选择 SenseVoice 模型规格
- **THEN** 配置保存后，下次启动 ASR 时加载对应规格模型

#### Scenario: VAD 灵敏度调整
- **WHEN** 用户拖动 VAD 灵敏度滑块（0-3）
- **THEN** 配置实时保存，后端热重载 VAD 参数，无需重启

#### Scenario: 环境音能量阈值调整
- **WHEN** 用户拖动「环境音能量阈值」滑块（500-5000，步长 100，默认 2200）
- **THEN** 配置保存后，低于该 RMS 能量的音频帧直接被忽略，不触发 webrtcvad 判断

#### Scenario: 语音前置缓冲帧数调整
- **WHEN** 用户拖动「语音前置缓冲」滑块（1-6 帧，即 30-180ms，默认 3 帧）
- **THEN** 配置保存后，VAD 检测到语音时会前置对应帧数的音频，防止截断词语开头

#### Scenario: 麦克风设备选择
- **WHEN** 用户打开 ASR 配置页
- **THEN** 界面列出系统所有可用麦克风设备，用户可选择或使用「默认」

---

### Requirement: TTS 配置

系统 SHALL 提供腾讯云 TTS 配置界面，包括 SecretId / SecretKey 填写、音色选择和试听功能。

#### Scenario: 填写腾讯云凭证
- **WHEN** 用户填写 SecretId 和 SecretKey 并保存
- **THEN** 凭证加密存储到配置文件，后续 TTS 请求使用该凭证

#### Scenario: 试听音色
- **WHEN** 用户选择一个 VoiceType 并点击「试听」
- **THEN** 后端调用腾讯云 TTS 合成一段示例文字，前端播放音频

---

### Requirement: 角色人设配置

系统 SHALL 提供角色信息配置界面，包括名称、人设描述文本和 Live2D 模型文件上传。

#### Scenario: 编辑角色名称和人设
- **WHEN** 用户修改角色名称或人设描述并点击保存
- **THEN** 配置写入 YAML 文件，下一次 LLM 请求使用新的 system prompt

#### Scenario: 上传 Live2D 模型
- **WHEN** 用户上传 `.model3.json` 及配套资源（压缩包或多文件）
- **THEN** 系统解压到 `models/` 目录，前端渲染页面自动重新加载模型

---

### Requirement: 配置保存与热重载

系统 SHALL 在用户保存配置后，将配置写入 YAML 文件并通知后端热重载对应模块，无需重启进程。

#### Scenario: 保存配置
- **WHEN** 用户点击任意配置页的「保存」按钮
- **THEN** 前端 `POST /api/config` 将新配置发送后端，后端写入 `config.yaml` 并返回成功

#### Scenario: 热重载生效
- **WHEN** 后端收到配置更新
- **THEN** 对应模块（LLM / TTS / 角色）在下一次调用时使用新配置，ASR 模块重启采集线程

#### Scenario: 配置校验失败
- **WHEN** 用户提交的配置存在格式错误（如 API Key 为空）
- **THEN** 后端返回 422 错误，前端高亮显示错误字段，配置文件不被覆盖

---

## MODIFIED Requirements

### Requirement: LLM Provider 配置

**Original**: temperature、max_tokens 等高级参数与基础连接配置混排在一起

**Updated**: 新增【高级配置】折叠区域，将高级参数从主配置区移入折叠区

#### Scenario: 高级配置折叠区域
- **WHEN** 用户打开 LLM Provider 配置页
- **THEN** 基础配置（Provider 选择、API Key、Base URL、模型名称）显示在主区域；temperature、max_tokens 等高级参数位于【高级配置】折叠区域内，默认折叠

#### Scenario: 展开高级配置
- **WHEN** 用户点击【高级配置】展开折叠区域
- **THEN** 显示 temperature 滑块、max_tokens 输入框等高级参数

#### Scenario: 记忆打分 LLM 同样使用高级配置
- **WHEN** 用户配置记忆打分 LLM（用于长期记忆检索打分）
- **THEN** 高级参数同样放置在【高级配置】折叠区域内

---

### Requirement: 前端 LLM_PRESETS 与后端注册表同步

**Original**: 前端 LLM_PRESETS 独立定义，可能与后端不一致

**Updated**: 前端 LLM_PRESETS 使用与 builtin-providers 注册表一致的结构

#### Scenario: 前端 Provider 定义来源
- **WHEN** 前端渲染 Provider 下拉列表
- **THEN** 使用的预设数据（name、base_url、default_model）与后端 builtin-providers 注册表保持一致
