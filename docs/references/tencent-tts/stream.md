# 腾讯云流式文本语音合成 WebSocket API v2

文档来源：https://cloud.tencent.com/document/product/1073/108595
SDK 参考：https://github.com/TencentCloud/tencentcloud-speech-sdk-python/blob/master/tts/flowing_speech_synthesizer.py

---

## 接口概述

- **协议**：WSS
- **地址**：`wss://tts.cloud.tencent.com/stream_wsv2`
- **Action**：`TextToStreamAudioWSv2`
- 支持流式文本输入，适配 LLM 逐字输出场景
- 单次会话最多 10,000 字；超过 10 分钟无文本发送时服务端关闭连接

---

## 三阶段调用流程

```
握手阶段  →  合成阶段  →  结束阶段
```

1. **握手**：发起 WebSocket 连接（URL 含签名参数）
2. **等待 READY**：收到 `ready=1` 消息后才可发送文本
3. **发送文本**：发送 `ACTION_SYNTHESIS` 指令
4. **通知完成**：发送 `ACTION_COMPLETE` 指令
5. **等待 FINAL**：收到 `final=1` 后主动关闭连接

---

## 签名算法

```python
# 1. 构造签名原文（所有参数按 key 字典序排列，不含 Signature）
sign_str = "GET" + "tts.cloud.tencent.com" + "/stream_wsv2" + "?"
for key in sorted(params.keys()):
    sign_str += key + "=" + str(params[key]) + "&"
sign_str = sign_str[:-1]

# 2. HMAC-SHA1 + Base64
signature = base64.b64encode(
    hmac.new(secret_key.encode("utf-8"), sign_str.encode("utf-8"), hashlib.sha1).digest()
).decode("utf-8")

# 3. 对 Signature 进行 URL 编码后追加到 URL
url += "&Signature=" + urllib.parse.quote(signature)
```

**关键注意点**：
- 签名原文格式：`GET{host}{path}?{sorted_params}`（无斜杠前缀，无空格）
- 值不做 URL 编码，直接用 `str()` 转换
- 只对最终的 **Signature** 值做 URL 编码（`urllib.parse.quote`）
- `Expired` 建议设为 `Timestamp + 86400`（24小时）

---

## 连接参数

| 参数 | 必填 | 类型 | 说明 |
|------|------|------|------|
| Action | 是 | string | 固定：`TextToStreamAudioWSv2` |
| AppId | 是 | int | 账号 AppId（整型） |
| SecretId | 是 | string | 密钥 ID |
| SessionId | 是 | string | 连接唯一标识（UUID） |
| ModelType | 否 | int | 模型类型，建议填 `1` |
| VoiceType | 否 | int | 音色 ID |
| Codec | 是 | string | `pcm` 或 `mp3` |
| SampleRate | 否 | int | 采样率，默认 16000 |
| Speed | 否 | float | 语速 [-2, 6]，默认 0 |
| Volume | 否 | int | 音量 [-10, 10]，默认 0 |
| EmotionCategory | 否 | string | 情感类别（happy/sad/angry/neutral/fear） |
| EmotionIntensity | 否 | int | 情感强度 [0, 200] |
| EnableSubtitle | 否 | int | 是否返回时间戳，0或1 |
| Timestamp | 是 | int | Unix 时间戳 |
| Expired | 是 | int | 签名过期时间（Unix 时间戳） |
| Signature | 是 | string | URL 编码后的签名 |

---

## 客户端消息格式

```json
{
    "session_id": "<SessionId（与连接参数一致）>",
    "message_id": "<每条消息的唯一 UUID>",
    "action": "<ACTION_SYNTHESIS | ACTION_COMPLETE | ACTION_RESET>",
    "data": "<文本内容，ACTION_COMPLETE 时为空字符串>"
}
```

| action | data | 用途 |
|--------|------|------|
| `ACTION_SYNTHESIS` | 合成文本 | 发送待合成文本（可多次调用） |
| `ACTION_COMPLETE` | `""` | 通知文本输入完毕 |
| `ACTION_RESET` | `""` | 清空未合成的缓存文本 |

---

## 服务端响应格式

**文本消息（JSON）**：

```json
{
    "code": 0,
    "message": "success",
    "session_id": "...",
    "request_id": "...",
    "message_id": "...",
    "final": 0,
    "ready": 0,
    "heartbeat": 0,
    "reset": 0,
    "result": {
        "subtitles": [
            { "Text": "你", "BeginTime": 0, "EndTime": 200, ... }
        ]
    }
}
```

| 字段 | 值 | 含义 |
|------|-----|------|
| `ready` | 1 | READY 事件，可开始发送文本 |
| `final` | 1 | FINAL 事件，合成完成 |
| `heartbeat` | 1 | 心跳保活 |
| `reset` | 1 | RESET 确认 |
| `code` | 非0 | 错误，需中断 |

**二进制消息**：PCM 或 MP3 音频帧。

---

## 错误码

| code | 含义 |
|------|------|
| 10003 | 鉴权失败（检查 SecretId/SecretKey 及签名格式） |

---

## 典型调用示例（Python asyncio）

```python
async with websockets.connect(url) as ws:
    # 1. 等待 READY
    async for msg in ws:
        if isinstance(msg, str):
            data = json.loads(msg)
            if data.get("ready") == 1:
                break
            if data.get("code") != 0:
                raise RuntimeError(f"TTS error: {data}")

    # 2. 发送文本
    await ws.send(json.dumps({
        "session_id": session_id,
        "message_id": str(uuid.uuid4()),
        "action": "ACTION_SYNTHESIS",
        "data": text,
    }))

    # 3. 发送完成信号
    await ws.send(json.dumps({
        "session_id": session_id,
        "message_id": str(uuid.uuid4()),
        "action": "ACTION_COMPLETE",
        "data": "",
    }))

    # 4. 接收结果直到 FINAL
    async for msg in ws:
        if isinstance(msg, bytes):
            # 音频帧
            pass
        else:
            data = json.loads(msg)
            if data.get("code") != 0:
                raise RuntimeError(f"TTS error: {data}")
            if data.get("final") == 1:
                break
            # 处理字幕 data["result"]["subtitles"]
```
