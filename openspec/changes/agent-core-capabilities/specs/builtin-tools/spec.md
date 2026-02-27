## ADDED Requirements

### Requirement: 文件读取工具
系统 SHALL 提供 `read_file(path: str, encoding: str = "utf-8") -> str` 工具，读取指定路径文件内容并返回字符串，路径 SHALL 限制在工作区根目录（`PROJECT_ROOT`）内。

#### Scenario: 正常读取文件
- **WHEN** LLM 调用 `read_file` 且路径合法（工作区内存在的文件）
- **THEN** 返回文件完整内容字符串

#### Scenario: 路径越出工作区被拒绝
- **WHEN** LLM 调用 `read_file(path="../../../etc/passwd")`
- **THEN** 返回错误字符串 `"错误：路径越出工作区限制"`，不读取文件，记录 WARNING 日志

#### Scenario: 文件不存在
- **WHEN** LLM 调用 `read_file` 且文件不存在
- **THEN** 返回 `"错误：文件不存在: <path>"`

#### Scenario: 编码错误自动降级
- **WHEN** 读取文件时发生 `UnicodeDecodeError`
- **THEN** 以 `latin-1` 重试，若仍失败返回 `"错误：文件编码无法识别"`

---

### Requirement: 文件写入工具
系统 SHALL 提供 `write_file(path: str, content: str) -> str` 工具，将内容写入指定路径文件（自动创建中间目录），路径 SHALL 限制在工作区根目录内。

#### Scenario: 正常写入文件
- **WHEN** LLM 调用 `write_file` 且路径合法
- **THEN** 文件内容被写入，返回 `"成功：已写入 <path>"`

#### Scenario: 自动创建父目录
- **WHEN** 目标文件的父目录不存在
- **THEN** 系统自动创建所需目录层级（`mkdir -p` 等效），再写入文件

#### Scenario: 路径越出工作区被拒绝
- **WHEN** LLM 调用 `write_file(path="../../outside.txt", ...)`
- **THEN** 返回 `"错误：路径越出工作区限制"`，不写入文件

---

### Requirement: 目录列表工具
系统 SHALL 提供 `list_directory(path: str) -> str` 工具，列出指定路径下的文件和子目录，路径 SHALL 限制在工作区根目录内。

#### Scenario: 正常列出目录
- **WHEN** LLM 调用 `list_directory` 且路径为工作区内合法目录
- **THEN** 返回目录内容的格式化字符串，区分文件（`[F]`）和目录（`[D]`），按名称排序

#### Scenario: 路径为文件而非目录
- **WHEN** LLM 调用 `list_directory` 且路径指向文件
- **THEN** 返回 `"错误：<path> 不是目录"`

---

### Requirement: 网页内容抓取工具
系统 SHALL 提供 `web_fetch(url: str, timeout: int = 10) -> str` 工具，使用 `httpx` 发起 HTTP GET 请求，通过 `BeautifulSoup` 提取正文文本（去除 `<script>`、`<style>` 标签），截断到 5000 字符后返回。

#### Scenario: 正常抓取网页
- **WHEN** LLM 调用 `web_fetch(url="https://example.com")`
- **THEN** 返回网页正文文本（已去除 HTML 标签），长度不超过 5000 字符

#### Scenario: 超时处理
- **WHEN** 目标 URL 在 `timeout` 秒内无响应
- **THEN** 返回 `"错误：请求超时（{timeout}s）: <url>"`

#### Scenario: 非 HTML 内容
- **WHEN** 响应 Content-Type 为 `application/json` 或 `text/plain`
- **THEN** 直接返回响应文本（截断到 5000 字符），不做 HTML 解析

#### Scenario: HTTP 错误状态码
- **WHEN** 服务器返回 4xx 或 5xx 状态码
- **THEN** 返回 `"错误：HTTP {status_code}: <url>"`

---

### Requirement: 工具路径安全检查
所有文件系统工具 SHALL 通过统一的 `_assert_safe_path(path)` 函数校验路径，该函数 SHALL 将输入路径解析为绝对路径后，验证其以 `PROJECT_ROOT` 开头（`Path(abs_path).is_relative_to(PROJECT_ROOT)`），不满足时抛出 `PermissionError`。

#### Scenario: 符号链接穿越被阻止
- **WHEN** 路径包含指向工作区外的符号链接
- **THEN** 解析后路径不以 `PROJECT_ROOT` 开头，被 `_assert_safe_path` 拒绝

#### Scenario: 相对路径正常解析
- **WHEN** 传入相对路径如 `"./data/file.txt"`
- **THEN** 相对于 `PROJECT_ROOT` 解析为绝对路径后通过安全检查
