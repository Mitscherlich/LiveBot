# Design: Streamdown 流式 Markdown 渲染

## 概述

将 Livebot 前端的消息显示从纯文本升级为支持流式 Markdown 渲染，使用 streamdown 库实现。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     ChatMessage Component                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               StreamMessage Component                  │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              streamdown Renderer                 │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │         Markdown Tokens (typed)            │  │  │  │
│  │  │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │  │  │  │
│  │  │  │  │text │ │code │ │table│ │list │  ...   │  │  │  │
│  │  │  │  └─────┘ └─────┘ └─────┘ └─────┘        │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 组件设计

### StreamMessage 组件

```typescript
interface StreamMessageProps {
  content: string;          // 当前累积的完整内容
  isStreaming: boolean;     // 是否正在流式接收
  typingSpeed?: number;     // 打字速度 (ms/char)
}

function StreamMessage({ content, isStreaming, typingSpeed = 30 }: StreamMessageProps) {
  // 使用 streamdown 渲染 Markdown
  // 支持流式打字效果
}
```

### useStreamdown Hook

```typescript
interface UseStreamdownOptions {
  onToken?: (token: string) => void;
  onComplete?: () => void;
}

function useStreamdown(options?: UseStreamdownOptions) {
  const [rendered, setRendered] = useState<string>('');
  const [isComplete, setIsComplete] = useState(false);
  
  // 处理 SSE 流式数据
  // 逐字符/逐 token 更新渲染
  
  return { rendered, isComplete, appendChunk };
}
```

## 数据流

```
SSE Stream → useStreamdown Hook → StreamMessage → DOM
     ↓               ↓                  ↓
  chunks      processed tokens    rendered HTML
```

## 样式设计

### Markdown 样式

```css
/* 代码块 */
.streamdown pre {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
}

.streamdown code {
  font-family: 'Fira Code', monospace;
  font-size: 14px;
}

/* 表格 */
.streamdown table {
  border-collapse: collapse;
  width: 100%;
}

.streamdown th, .streamdown td {
  border: 1px solid #ddd;
  padding: 8px;
}

/* 引用块 */
.streamdown blockquote {
  border-left: 4px solid #42b883;
  padding-left: 16px;
  color: #666;
}

/* 打字光标 */
.streamdown .cursor {
  display: inline-block;
  width: 2px;
  height: 1.2em;
  background: #42b883;
  animation: blink 1s infinite;
}
```

## 流式渲染策略

1. **字符级流式**：逐字符显示，最流畅但计算开销大
2. **Token 级流式**：按词/句分割，平衡流畅度和性能 ✅ 推荐
3. **段落级流式**：按段落显示，性能最好但体验稍差

选择 **Token 级流式**，按句子边界分割，配合打字机动画效果。

## 错误处理

- 不完整的 Markdown 标签：streamdown 自动处理未闭合标签
- 代码块中断：保留已接收内容，等待后续数据
- XSS 防护：使用 DOMPurify 净化输出

## 性能优化

- 使用 `requestAnimationFrame` 控制渲染频率
- 大内容使用虚拟滚动
- 防抖处理快速输入
