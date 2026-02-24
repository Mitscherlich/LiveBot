from __future__ import annotations

import asyncio
from loguru import logger

from config import ASRConfig
from core.event_bus import bus, Event

SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_WIDTH = 2       # 16-bit
FRAME_DURATION_MS = 30 # webrtcvad 要求 10/20/30ms
FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000)  # 480 samples


class MicrophoneDevice:
    def __init__(self, config: ASRConfig):
        self.config = config
        self._running = False

    async def start(self):
        import pyaudio
        from pipeline.asr.vad import VADProcessor

        pa = pyaudio.PyAudio()
        device_index = self.config.microphone_device_index

        try:
            stream = pa.open(
                rate=SAMPLE_RATE,
                channels=CHANNELS,
                format=pyaudio.paInt16,
                input=True,
                input_device_index=device_index,
                frames_per_buffer=FRAME_SIZE,
            )
        except OSError as e:
            logger.warning(f"指定麦克风设备不可用（{e}），回退到默认设备")
            stream = pa.open(
                rate=SAMPLE_RATE,
                channels=CHANNELS,
                format=pyaudio.paInt16,
                input=True,
                frames_per_buffer=FRAME_SIZE,
            )

        self.vad = VADProcessor(self.config)
        self._running = True
        logger.info("麦克风采集已启动")

        loop = asyncio.get_event_loop()
        try:
            while self._running:
                frame = await loop.run_in_executor(
                    None, lambda: stream.read(FRAME_SIZE, exception_on_overflow=False)
                )
                result = self.vad.process(frame)
                if result is not None:
                    # VAD 返回完整语音段，触发 ASR
                    bus.emit(Event.MIC_VAD, {"pcm": result})
        finally:
            stream.stop_stream()
            stream.close()
            pa.terminate()

    def stop(self):
        self._running = False
