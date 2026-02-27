from config import OpenClawConfig


def create_llm_pipeline(config: OpenClawConfig):
    """根据配置创建 LLM Pipeline 实例。"""
    from pipeline.llm.openclaw_llm import OpenClawLLMPipeline
    return OpenClawLLMPipeline(config)
