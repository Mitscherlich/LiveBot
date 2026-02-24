from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException

from config import AppConfig, LLMConfig, TTSConfig, MemoryScoringConfig, get_config, save_config, reload_config

router = APIRouter(prefix="/api")

# 模型定价参考表（¥/M tokens，仅供参考，实际以官方最新定价为准）
# input: 输入价格，output: 输出价格
_PRICING_CNY: list[tuple[str, dict]] = [
    # DeepSeek
    ("deepseek-chat",       {"input": 2.0,   "output": 8.0}),
    ("deepseek-v3",         {"input": 2.0,   "output": 8.0}),
    ("deepseek-reasoner",   {"input": 4.0,   "output": 16.0}),
    ("deepseek-r1",         {"input": 4.0,   "output": 16.0}),
    ("deepseek-v2.5",       {"input": 1.33,  "output": 1.33}),
    # Moonshot / Kimi
    ("moonshot-v1-8k",      {"input": 12.0,  "output": 12.0}),
    ("moonshot-v1-32k",     {"input": 24.0,  "output": 24.0}),
    ("moonshot-v1-128k",    {"input": 60.0,  "output": 60.0}),
    ("kimi-latest",         {"input": 12.0,  "output": 12.0}),
    # 豆包（火山引擎），部分常用模型
    ("doubao-lite",         {"input": 0.3,   "output": 0.6}),
    ("doubao-pro",          {"input": 0.8,   "output": 2.0}),
    # Anthropic（按 ¥7/$1 折算，仅估算）
    ("claude-haiku",        {"input": 5.6,   "output": 28.0,  "note": "≈$0.8/$4 per M"}),
    ("claude-sonnet",       {"input": 21.0,  "output": 105.0, "note": "≈$3/$15 per M"}),
    ("claude-opus",         {"input": 105.0, "output": 525.0, "note": "≈$15/$75 per M"}),
]


def _get_pricing(model: str) -> dict | None:
    """根据模型名模糊匹配价格表，返回 {input, output, note?} 或 None。"""
    model_lower = model.lower()
    for key, price in _PRICING_CNY:
        if key in model_lower:
            return price
    return None


@router.get("/config", response_model=AppConfig)
async def read_config():
    return get_config()


@router.post("/config", response_model=AppConfig)
async def write_config(new_config: AppConfig):
    try:
        save_config(new_config)
        cfg = reload_config()
        # 热重载各模块（任务 9.2）
        try:
            import main as app_module
            if hasattr(app_module, 'bot'):
                app_module.bot.reload_config()
        except Exception as e:
            from loguru import logger
            logger.warning(f"热重载模块时出错（非致命）: {e}")
        return cfg
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/status")
async def status():
    return {"status": "running"}


@router.post("/llm/test")
async def test_llm_connection(body: Optional[LLMConfig] = None):
    """测试 LLM 连通性，发送一条简单请求。body 有值时使用前端当前表单配置，否则使用已保存配置。"""
    from openai import AsyncOpenAI, APIConnectionError, AuthenticationError
    cfg = body if (body and body.api_key) else get_config().llm
    if not cfg.api_key:
        raise HTTPException(status_code=422, detail="API Key 未配置")
    try:
        client = AsyncOpenAI(api_key=cfg.api_key, base_url=cfg.base_url or None)
        resp = await client.chat.completions.create(
            model=cfg.model,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=5,
        )
        usage = resp.usage
        return {
            "message": f"连接成功，模型回复: {resp.choices[0].message.content!r}",
            "usage": {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
            } if usage else None,
            "pricing": _get_pricing(cfg.model),
        }
    except AuthenticationError:
        raise HTTPException(status_code=422, detail="API Key 无效或权限不足")
    except APIConnectionError as e:
        raise HTTPException(status_code=422, detail=f"连接失败: {e}")
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/scoring/test")
async def test_scoring_connection(body: Optional[MemoryScoringConfig] = None):
    """测试记忆打分模型连通性。body 有值时使用前端当前表单配置，否则使用已保存配置。"""
    from openai import AsyncOpenAI, APIConnectionError, AuthenticationError
    cfg = body if (body and body.api_key) else get_config().memory.scoring
    if not cfg.api_key:
        raise HTTPException(status_code=422, detail="API Key 未配置")
    try:
        client = AsyncOpenAI(api_key=cfg.api_key, base_url=cfg.base_url or None)
        resp = await client.chat.completions.create(
            model=cfg.model,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=5,
        )
        usage = resp.usage
        return {
            "message": f"连接成功，模型回复: {resp.choices[0].message.content!r}",
            "usage": {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
            } if usage else None,
            "pricing": _get_pricing(cfg.model),
        }
    except AuthenticationError:
        raise HTTPException(status_code=422, detail="API Key 无效或权限不足")
    except APIConnectionError as e:
        raise HTTPException(status_code=422, detail=f"连接失败: {e}")
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/asr/status")
async def asr_status():
    """返回麦克风/VAD 是否正在采集。"""
    try:
        import main as app_module
        running = app_module.bot.is_mic_running if hasattr(app_module, 'bot') else False
    except Exception:
        running = False
    return {"running": running}


@router.post("/asr/start")
async def asr_start():
    """启动麦克风 + VAD 采集。"""
    try:
        import main as app_module
        if hasattr(app_module, 'bot'):
            await app_module.bot.start_mic()
        return {"running": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/asr/stop")
async def asr_stop():
    """停止麦克风 + VAD 采集。"""
    try:
        import main as app_module
        if hasattr(app_module, 'bot'):
            app_module.bot.stop_mic()
        return {"running": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tts/preview")
async def preview_tts(body: Optional[TTSConfig] = None):
    """合成示例语音并通过 pygame 播放。body 有值时使用前端当前表单配置，否则使用已保存配置。"""
    from pipeline.tts.tencent_tts import TencentTTSPipeline
    tts_cfg = body if (body and body.secret_id and body.app_id) else get_config().tts
    if not tts_cfg.secret_id or not tts_cfg.secret_key or not tts_cfg.app_id:
        raise HTTPException(status_code=422, detail="TTS 凭证未配置（需填写 AppId、SecretId、SecretKey）")
    try:
        tts = TencentTTSPipeline(tts_cfg)
        await tts.synthesize("你好，我是你的虚拟主播助手！", "平静")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
