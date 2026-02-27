# Spec: StreamMessage Component

## 接口定义

```typescript
interface StreamMessageProps {
  content: string;              // Markdown 内容
  isTyping?: boolean;          // 是否正在打字
  showCursor?: boolean;        // 是否显示光标，默认 true
  className?: string;          // 额外 CSS 类
}
```

## 渲染行为

### Markdown 渲染

使用 streamdown 将 Markdown 转换为 HTML：

```typescript
import { streamdown } from 'streamdown';

const html = streamdown.render(content);
```

### 流式光标

当 `isTyping = true` 且 `showCursor = true` 时：
- 在内容末尾显示闪烁光标
- 光标样式：垂直条，主题色

### XSS 防护

- 使用 DOMPurify 净化 HTML 输出
- 禁止脚本执行

## 支持的 Markdown 语法

### 基础格式
- **粗体** `**text**`
- *斜体* `*text*`
- ~~删除线~~ `~~text~~`
- `行内代码` `` `code` ``

### 代码块
```markdown
```typescript
const x = 1;
```
```

### 列表
- 无序列表 `- item`
- 有序列表 `1. item`
- 嵌套列表（2空格缩进）

### 表格
```markdown
| 列1 | 列2 |
|-----|-----|
| A   | B   |
```

### 引用
```markdown
> 引用内容
> 多行引用
```

### 链接和图片
- `[链接文本](url)`
- `![alt](image-url)`

### 分割线
`---`

## 样式规格

### 容器
```css
.stream-message {
  padding: 12px 16px;
  line-height: 1.6;
}
```

### 代码块
```css
.stream-message pre {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}

.stream-message code {
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 14px;
}

.stream-message pre code {
  color: #d4d4d4;
  background: transparent;
}

/* 行内代码 */
.stream-message :not(pre) > code {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  color: #e83e8c;
}
```

### 表格
```css
.stream-message table {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
}

.stream-message th,
.stream-message td {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.stream-message th {
  background: #f5f5f5;
  font-weight: 600;
}

.stream-message tr:nth-child(even) {
  background: #fafafa;
}
```

### 引用块
```css
.stream-message blockquote {
  border-left: 4px solid #42b883;
  margin: 12px 0;
  padding: 8px 16px;
  background: rgba(66, 184, 131, 0.05);
  color: #555;
}
```

### 列表
```css
.stream-message ul,
.stream-message ol {
  margin: 8px 0;
  padding-left: 24px;
}

.stream-message li {
  margin: 4px 0;
}

.stream-message li > ul,
.stream-message li > ol {
  margin: 4px 0;
}
```

### 光标
```css
.stream-message .cursor {
  display: inline-block;
  width: 2px;
  height: 1.2em;
  background: #42b883;
  animation: blink 1s infinite;
  vertical-align: text-bottom;
  margin-left: 2px;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
```

## 示例

```tsx
// 基础用法
<StreamMessage content={"Hello **world**"} />

// 流式显示
<StreamMessage 
  content={currentContent} 
  isTyping={isStreaming}
/>

// 自定义样式
<StreamMessage 
  content={markdownContent}
  className="my-custom-style"
/>
```
