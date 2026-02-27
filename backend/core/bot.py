from __future__ import annotations

import asyncio
from loguru import logger

from config import get_config
from core.event_bus import bus, Event
from pipeline.llm.base import BaseLLMPipeline


class VTuberBot:
    """主控制器，编排各模块启动和事件处理。"""

    llm: BaseLLMPipeline

    def __init__(self):
        self._tasks: list[asyncio.Task] = []
        self._mic_task: asyncio.Task | None = None
        self._tts_sentence_queue: asyncio.Queue[tuple[str, str] | None] = asyncio.Queue()
        self._current_chat_task: asyncio.Task | None = None

    @property
    def is_mic_running(self) -> bool:
        return (
            hasattr(self, 'mic') and
            self.mic._running and
            self._mic_task is not None and
            not self._mic_task.done()
        )

    async def start_mic(self) -> None:
        """启动麦克风 + VAD 采集（幂等）。"""
        if self.is_mic_running:
            return
        if hasattr(self, 'mic'):
            self.mic._running = False  # 确保旧 task 退出
        self._mic_task = asyncio.create_task(self.mic.start())
        logger.info("麦克风采集已开启")

    def stop_mic(self) -> None:
        """停止麦克风采集（幂等）。

        只置 _running=False，让 stream.read() 在当前帧（≤30ms）自然返回后
        由 finally 块安全释放 stream。不能 cancel task——task 被取消时
        finally 会立即调用 pa.terminate()，而此时 stream.read() 仍阻塞在
        PortAudio C 层，两者并发操作同一 stream 会导致段错误。
        """
        if hasattr(self, 'mic'):
            self.mic.stop()
        # 不 cancel，task 会在下一帧读完后自行退出 while 循环
        self._mic_task = None
        logger.info("麦克风采集已关闭")

    async def _probe_openclaw(self, url: str) -> None:
        """向 OpenClaw Gateway 发送连通性探针请求。"""
        import httpx
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{url}/probe")
                if r.status_code < 400:
                    logger.info("OpenClaw Gateway 连接正常")
                else:
                    logger.error(
                        f"OpenClaw Gateway /probe 返回 HTTP {r.status_code}，LLM 功能可能不可用"
                    )
        except Exception as e:
            logger.error(
                f"OpenClaw Gateway 不可达（{url}/probe）: {e}，LLM 功能不可用，ASR/TTS 仍正常运行"
            )

    async def start(self):
        logger.info("VTuberBot 启动中...")
        config = get_config()

        # 延迟导入，避免循环依赖
        from devices.microphone import MicrophoneDevice
        from pipeline.asr.vad import VADProcessor
        from pipeline.asr.sensevoice import SenseVoiceASR
        from pipeline.llm import create_llm_pipeline
        from pipeline.tts.tencent_tts import TencentTTSPipeline

        # OpenClaw Gateway 连通性探针
        await self._probe_openclaw(config.openclaw.url)

        # 初始化各模块
        self.asr = SenseVoiceASR(config.asr)
        self.llm = create_llm_pipeline(config.openclaw)
        self.tts = TencentTTSPipeline(config.tts)
        self.mic = MicrophoneDevice(config.asr)

        from pipeline.asr.sensevoice import init_asr_handler
        init_asr_handler(self.asr)

        asyncio.create_task(self.asr.preload())

        # 启动串行 TTS 合成 worker，保证句子按序播放
        worker = asyncio.create_task(self._tts_worker())
        self._tasks.append(worker)

        # 注册事件处理链
        self._register_handlers()

        logger.info("VTuberBot 已就绪（麦克风未启动，通过 /api/asr/start 开启）")

    async def _tts_worker(self):
        """串行消费 TTS 合成队列，保证句子按 LLM 生成顺序播放。"""
        while True:
            item = await self._tts_sentence_queue.get()
            if item is None:
                break
            text, emotion = item
            if get_config().tts.enabled:
                await self.tts.synthesize(text, emotion)

    def _register_handlers(self):
        @bus.on(Event.ASR_RESULT)
        async def on_asr_result(data: dict):
            text = data.get("text", "").strip()
            if not text:
                return
            logger.info(f"[ASR] {text}  情感={data.get('emotion', 'neutral')}")
            # 打断上一轮播放
            bus.emit(Event.INTERRUPT)
            await self.llm.generate(text, user_emotion=data.get("emotion", "neutral"))

        @bus.on(Event.LLM_SENTENCE)
        async def on_llm_sentence(data: dict):
            # 入队而非直接调用，由 _tts_worker 串行处理，保证合成顺序
            await self._tts_sentence_queue.put((data["text"], data.get("emotion", "平静")))

        @bus.on(Event.INTERRUPT)
        async def on_interrupt(_=None):
            self.tts.interrupt()
            # 清空待合成队列，丢弃当前轮次的剩余句子
            while not self._tts_sentence_queue.empty():
                try:
                    self._tts_sentence_queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
            # 取消正在进行的 Chat LLM 任务
            if self._current_chat_task and not self._current_chat_task.done():
                self._current_chat_task.cancel()
            self._current_chat_task = None
            if self.is_mic_running:
                pcm = self.mic.vad.force_commit()
                if pcm:
                    bus.emit(Event.MIC_VAD, {"pcm": pcm})

    def reload_config(self):
        """热重载：更新各模块配置，下次调用时生效。"""
        from config import get_config
        cfg = get_config()
        logger.info("热重载配置...")

        if hasattr(self, 'llm'):
            from pipeline.llm import create_llm_pipeline
            self.llm = create_llm_pipeline(cfg.openclaw)
            logger.info("LLM pipeline 已重建（OpenClaw 配置更新）")

        if hasattr(self, 'tts'):
            self.tts.config = cfg.tts

        if hasattr(self, 'asr'):
            if (self.asr.config.model_size != cfg.asr.model_size or
                    self.asr.config.device != cfg.asr.device):
                self.asr._model = None  # 触发下次推理时重新加载
                logger.info("ASR 模型配置变更，将在下次推理时重新加载")
            self.asr.config = cfg.asr

        if hasattr(self, 'mic'):
            was_running = self.is_mic_running
            if self.mic.config.microphone_device_index != cfg.asr.microphone_device_index:
                self.stop_mic()
                self.mic.config = cfg.asr
                if was_running:
                    asyncio.create_task(self.start_mic())
                    logger.info("麦克风设备变更，已重启采集线程")
            else:
                self.mic.config = cfg.asr
                # VAD 运行时参数同步（无需重启采集线程）
                if hasattr(self.mic, 'vad'):
                    vad = self.mic.vad
                    vad._rms_threshold = cfg.asr.vad_rms_threshold
                    vad._silence_frames = cfg.asr.silence_duration_ms // 30
                    vad._min_speech_frames = cfg.asr.min_speech_duration_ms // 30
                    vad.vad.set_mode(cfg.asr.vad_sensitivity)
                    vad._pre_roll = type(vad._pre_roll)(maxlen=cfg.asr.vad_pre_roll_frames)
                    logger.info("VAD 参数已热重载")

        logger.info("配置热重载完成")

    async def stop(self):
        for task in self._tasks:
            task.cancel()
        logger.info("VTuberBot 已停止")
