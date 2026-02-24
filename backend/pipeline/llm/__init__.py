from config import LLMConfig, CharacterConfig


def create_llm_pipeline(config: LLMConfig, character: CharacterConfig, memory_short, memory_long):
    """根据 provider 创建对应的 LLM Pipeline 实例。"""
    if config.provider == "anthropic":
        from pipeline.llm.anthropic_llm import AnthropicLLMPipeline
        return AnthropicLLMPipeline(config, character, memory_short, memory_long)
    else:
        from pipeline.llm.openai_llm import LLMPipeline
        return LLMPipeline(config, character, memory_short, memory_long)
