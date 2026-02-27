## 1. Frontend Changes

- [x] 1.1 Add `kimi-coding` preset to `LLM_PRESETS` in `frontend/src/pages/Settings.tsx`
  - base_url: `https://api.kimi.com/coding`
  - model: `kimi-for-coding`
- [x] 1.2 Add "Kimi Coding (编程专用)" option to LLM Provider dropdown
- [x] 1.3 Add "Kimi Coding (编程专用)" option to Scoring Provider dropdown (记忆打分模型)
- [x] 1.4 Update `LLM_PRESETS` for scoring provider section

## 2. Backend Changes

- [x] 2.1 Update `create_llm_pipeline` in `backend/pipeline/llm/__init__.py` to route `kimi-coding` to `AnthropicLLMPipeline`
- [x] 2.2 Verify `AnthropicLLMPipeline` accepts custom base_url correctly

## 3. Testing

- [x] 3.1 Test frontend provider selection auto-fills correct values
- [x] 3.2 Test backend routes `kimi-coding` provider to AnthropicLLMPipeline
- [x] 3.3 Verify backward compatibility: existing custom provider configs still work
- [x] 3.4 Test complete flow: select Kimi Coding → save → test connection

## 4. Verification

- [x] 4.1 Run frontend type check: `cd frontend && npm run build`
- [x] 4.2 Run backend diagnostics on changed files
- [x] 4.3 Check no lint errors introduced
