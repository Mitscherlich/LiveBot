# Spec: useStreamdown Hook

## 接口定义

```typescript
interface UseStreamdownOptions {
  initialContent?: string;
  typingSpeed?: number;        // ms per character, default: 30
  onToken?: (token: string) => void;
  onComplete?: () => void;
}

interface UseStreamdownReturn {
  displayedContent: string;    // 当前显示的内容（带打字效果）
  fullContent: string;         // 完整内容
  isTyping: boolean;          // 是否正在打字
  isComplete: boolean;        // 是否完成
  appendChunk: (chunk: string) => void;
  reset: () => void;
}

function useStreamdown(options?: UseStreamdownOptions): UseStreamdownReturn;
```

## 行为规格

### 初始状态

- `displayedContent` = `initialContent` || ''
- `fullContent` = `initialContent` || ''
- `isTyping` = false
- `isComplete` = true

### appendChunk 行为

1. 接收 chunk 字符串
2. 追加到 `fullContent`
3. 启动打字机效果，逐字符/逐 token 将内容从 `displayedContent` 同步到 `fullContent`
4. 每打一个字符触发 `onToken` 回调
5. 打完所有内容后设置 `isTyping = false`，触发 `onComplete`

### 打字速度控制

- 默认 30ms/字符
- 支持按 token（词组）批量显示以提高性能
- 使用 `requestAnimationFrame` 控制渲染频率

## 示例用法

```typescript
function ChatComponent() {
  const { displayedContent, isTyping, appendChunk } = useStreamdown({
    typingSpeed: 20,
    onToken: (token) => console.log('New token:', token),
  });

  useEffect(() => {
    const eventSource = new EventSource('/api/chat/stream');
    eventSource.onmessage = (e) => {
      appendChunk(e.data);
    };
    return () => eventSource.close();
  }, []);

  return <StreamMessage content={displayedContent} isTyping={isTyping} />;
}
```

## 边界条件

- 空 chunk：忽略
- 连续快速调用 appendChunk：内容追加到队列，顺序执行打字效果
- 组件卸载：清理定时器/animation frame
