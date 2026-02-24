/**
 * 系统设置页（任务 8.2, 8.3, 8.4, 8.6, 8.7）
 * - LLM 配置（Provider 下拉、API Key、Base URL、模型名、测试连接）
 * - ASR 配置（模型规格、VAD 灵敏度滑块、麦克风设备）
 * - TTS 配置（SecretId/SecretKey、VoiceType 选择、试听）
 * - 配置读取（GET /api/config）和保存（POST /api/config）
 */
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Save, Loader2, CheckCircle, XCircle, Play } from 'lucide-react'

// LLM Provider 预设
const LLM_PRESETS: Record<string, { base_url: string; model: string }> = {
  deepseek: { base_url: 'https://api.deepseek.com', model: 'deepseek-chat' },
  moonshot: { base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  doubao: { base_url: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
  anthropic: { base_url: '', model: 'claude-sonnet-4-6' },
  custom: { base_url: '', model: '' },
}

// 音色选项（★ 表示支持多情感风格，适合虚拟主播场景）
// 完整列表参见 docs/references/tencent-tts/voice_ids.md
const VOICE_TYPES = [
  // 超自然大模型音色（推荐，音质最佳）
  { value: 603004, label: '温柔小柠 - 聊天女声（推荐）' },
  { value: 603001, label: '潇湘妹妹 - 特色女声' },
  { value: 602003, label: '爱小悠 - 聊天女声' },
  { value: 502001, label: '智小柔 - 聊天女声' },
  { value: 502003, label: '智小敏 - 聊天女声' },
  { value: 603003, label: '随和老李 - 聊天男声' },
  { value: 603005, label: '知心大林 - 聊天男声' },
  { value: 603000, label: '懂事少年 - 特色男声' },
  { value: 502006, label: '智小悟 - 聊天男声' },
  // 大模型音色（多情感）
  { value: 601008, label: '爱小豪 - 聊天男声 ★多情感' },
  { value: 601009, label: '爱小芊 - 聊天女声 ★多情感' },
  { value: 601010, label: '爱小娇 - 聊天女声 ★多情感' },
  // 大模型音色
  { value: 501004, label: '月华 - 聊天女声' },
  { value: 601012, label: '爱小璟 - 特色女声' },
  { value: 501005, label: '飞镜 - 聊天男声' },
  { value: 601011, label: '爱小川 - 聊天男声' },
  // 精品音色
  { value: 101001, label: '智瑜 - 情感女声' },
  { value: 101004, label: '智云 - 通用男声' },
  { value: 101019, label: '智彤 - 粤语女声' },
]

// 麦克风设备（占位，实际通过 API 获取）
const MIC_OPTIONS = [
  { value: -1, label: '默认设备' },
]

interface ConfigForm {
  llm_provider: string
  llm_api_key: string
  llm_base_url: string
  llm_model: string
  llm_temperature: number
  llm_max_tokens: number
  asr_model_size: string
  asr_vad_sensitivity: number
  asr_min_speech_duration_ms: number
  asr_vad_rms_threshold: number
  asr_vad_pre_roll_frames: number
  asr_microphone_device_index: number
  tts_app_id: number
  tts_secret_id: string
  tts_secret_key: string
  tts_voice_type: number
  scoring_provider: string
  scoring_api_key: string
  scoring_base_url: string
  scoring_model: string
  scoring_threshold: number
}

type SaveState = 'idle' | 'saving' | 'success' | 'error'
type TestState = 'idle' | 'testing' | 'ok' | 'fail'

interface Pricing {
  input: number
  output: number
  note?: string
}

export default function SettingsPage() {
  const { register, handleSubmit, watch, setValue, reset, getValues } = useForm<ConfigForm>()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const [testState, setTestState] = useState<TestState>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [testPricing, setTestPricing] = useState<Pricing | null>(null)
  const [scoringTestState, setScoringTestState] = useState<TestState>('idle')
  const [scoringTestMsg, setScoringTestMsg] = useState('')
  const [scoringTestPricing, setScoringTestPricing] = useState<Pricing | null>(null)
  const [loading, setLoading] = useState(true)

  const llmProvider = watch('llm_provider', 'deepseek')
  const scoringProvider = watch('scoring_provider', 'deepseek')

  // 加载配置（任务 8.6）
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        reset({
          llm_provider: cfg.llm?.provider ?? 'deepseek',
          llm_api_key: cfg.llm?.api_key ?? '',
          llm_base_url: cfg.llm?.base_url ?? '',
          llm_model: cfg.llm?.model ?? '',
          llm_temperature: cfg.llm?.temperature ?? 0.8,
          llm_max_tokens: cfg.llm?.max_tokens ?? 512,
          asr_model_size: cfg.asr?.model_size ?? 'small',
          asr_vad_sensitivity: cfg.asr?.vad_sensitivity ?? 3,
          asr_min_speech_duration_ms: cfg.asr?.min_speech_duration_ms ?? 300,
          asr_vad_rms_threshold: cfg.asr?.vad_rms_threshold ?? 2200,
          asr_vad_pre_roll_frames: cfg.asr?.vad_pre_roll_frames ?? 3,
          asr_microphone_device_index: cfg.asr?.microphone_device_index ?? -1,
          tts_app_id: cfg.tts?.app_id ?? 0,
          tts_secret_id: cfg.tts?.secret_id ?? '',
          tts_secret_key: cfg.tts?.secret_key ?? '',
          tts_voice_type: cfg.tts?.voice_type ?? 603004,
          scoring_provider: cfg.memory?.scoring?.provider ?? 'deepseek',
          scoring_api_key: cfg.memory?.scoring?.api_key ?? '',
          scoring_base_url: cfg.memory?.scoring?.base_url ?? '',
          scoring_model: cfg.memory?.scoring?.model ?? 'deepseek-chat',
          scoring_threshold: cfg.memory?.long_term_score_threshold ?? 7,
        })
      })
      .finally(() => setLoading(false))
  }, [reset])

  // Provider 切换时自动填充 base_url 和 model（任务 8.2）
  useEffect(() => {
    const preset = LLM_PRESETS[llmProvider]
    if (preset && llmProvider !== 'custom') {
      setValue('llm_base_url', preset.base_url)
      if (preset.model) setValue('llm_model', preset.model)
    }
  }, [llmProvider, setValue])

  // 保存配置（任务 8.7）
  const onSubmit = async (data: ConfigForm) => {
    setSaveState('saving')
    setSaveError('')
    try {
      // 先拉取完整配置，保留 character 等未在本页编辑的字段
      const current = await fetch('/api/config').then(r => r.json())
      const payload = {
        ...current,
        llm: {
          provider: data.llm_provider,
          api_key: data.llm_api_key,
          base_url: data.llm_base_url,
          model: data.llm_model,
          temperature: data.llm_temperature,
          max_tokens: data.llm_max_tokens,
        },
        asr: {
          model_size: data.asr_model_size,
          vad_sensitivity: data.asr_vad_sensitivity,
          min_speech_duration_ms: data.asr_min_speech_duration_ms,
          vad_rms_threshold: data.asr_vad_rms_threshold,
          vad_pre_roll_frames: data.asr_vad_pre_roll_frames,
          microphone_device_index: data.asr_microphone_device_index === -1
            ? null
            : data.asr_microphone_device_index,
        },
        tts: {
          app_id: Number(data.tts_app_id),
          secret_id: data.tts_secret_id,
          secret_key: data.tts_secret_key,
          voice_type: Number(data.tts_voice_type),
        },
        memory: {
          ...current.memory,
          long_term_score_threshold: data.scoring_threshold,
          scoring: {
            provider: data.scoring_provider,
            api_key: data.scoring_api_key,
            base_url: data.scoring_base_url,
            model: data.scoring_model,
          },
        },
      }
      const r = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.detail ?? r.statusText)
      }
      setSaveState('success')
      setTimeout(() => setSaveState('idle'), 3000)
    } catch (e) {
      setSaveState('error')
      setSaveError(String(e))
    }
  }

  // 测试 LLM 连接（任务 8.2）—— 使用当前表单值，无需先保存
  const testLlmConnection = async () => {
    setTestState('testing')
    setTestMsg('')
    setTestPricing(null)
    const v = getValues()
    try {
      const r = await fetch('/api/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: v.llm_provider,
          api_key: v.llm_api_key,
          base_url: v.llm_base_url,
          model: v.llm_model,
          temperature: v.llm_temperature,
          max_tokens: v.llm_max_tokens,
        }),
      })
      const data = await r.json()
      if (r.ok) {
        setTestState('ok')
        setTestMsg(data.message ?? '连接成功')
        setTestPricing(data.pricing ?? null)
      } else {
        setTestState('fail')
        setTestMsg(data.detail ?? '连接失败')
      }
    } catch (e) {
      setTestState('fail')
      setTestMsg(String(e))
    }
  }

  // 测试打分模型连接
  const testScoringConnection = async () => {
    setScoringTestState('testing')
    setScoringTestMsg('')
    setScoringTestPricing(null)
    const v = getValues()
    try {
      const r = await fetch('/api/scoring/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: v.scoring_provider,
          api_key: v.scoring_api_key,
          base_url: v.scoring_base_url,
          model: v.scoring_model,
        }),
      })
      const data = await r.json()
      if (r.ok) {
        setScoringTestState('ok')
        setScoringTestMsg(data.message ?? '连接成功')
        setScoringTestPricing(data.pricing ?? null)
      } else {
        setScoringTestState('fail')
        setScoringTestMsg(data.detail ?? '连接失败')
      }
    } catch (e) {
      setScoringTestState('fail')
      setScoringTestMsg(String(e))
    }
  }

  // TTS 试听（任务 8.4）—— 使用当前表单值，无需先保存
  const previewTts = async () => {
    const v = getValues()
    try {
      const r = await fetch('/api/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: Number(v.tts_app_id),
          secret_id: v.tts_secret_id,
          secret_key: v.tts_secret_key,
          voice_type: Number(v.tts_voice_type),
        }),
      })
      if (!r.ok) {
        const err = await r.json()
        console.error('TTS 试听失败:', err.detail)
      }
    } catch (e) {
      console.error('TTS 试听失败:', e)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-primary-400" size={32} />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">系统设置</h1>
        <button
          type="submit"
          disabled={saveState === 'saving'}
          className="btn-primary"
        >
          {saveState === 'saving' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saveState === 'success' ? (
            <CheckCircle size={16} />
          ) : (
            <Save size={16} />
          )}
          {saveState === 'saving' ? '保存中...' : saveState === 'success' ? '已保存' : '保存配置'}
        </button>
      </div>

      {saveState === 'error' && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <XCircle size={16} className="flex-none" />
          {saveError}
        </div>
      )}

      {/* 左右双栏：左=AI模型，右=音频管道 */}
      <div className="grid grid-cols-2 gap-6 items-start">

        {/* ── 左栏：AI 模型配置 ── */}
        <div className="space-y-6">

          {/* LLM 配置（任务 8.2） */}
          <section className="card space-y-4">
            <h2 className="font-semibold text-gray-200">LLM 大模型配置</h2>

            <div>
              <label className="form-label">Provider</label>
              <select className="form-select" {...register('llm_provider')}>
                <option value="deepseek">DeepSeek</option>
                <option value="moonshot">Moonshot</option>
                <option value="doubao">豆包（火山引擎）</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="custom">自定义</option>
              </select>
            </div>

            <div>
              <label className="form-label">API Key</label>
              <input
                type="password"
                className="form-input"
                placeholder="sk-..."
                {...register('llm_api_key')}
              />
            </div>

            {(llmProvider === 'custom' || llmProvider === 'doubao') && (
              <div>
                <label className="form-label">Base URL</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://api.example.com/v1"
                  {...register('llm_base_url')}
                />
              </div>
            )}

            <div>
              <label className="form-label">模型名称</label>
              <input
                type="text"
                className="form-input"
                placeholder="deepseek-chat"
                {...register('llm_model')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Temperature ({watch('llm_temperature')})</label>
                <input
                  type="range"
                  min={0} max={1} step={0.1}
                  className="w-full accent-primary-500"
                  {...register('llm_temperature', { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="form-label">Max Tokens</label>
                <input
                  type="number"
                  className="form-input"
                  min={64} max={2048}
                  {...register('llm_max_tokens', { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={testLlmConnection}
                  disabled={testState === 'testing'}
                  className="btn-secondary"
                >
                  {testState === 'testing' ? <Loader2 size={14} className="animate-spin" /> : null}
                  测试连接
                </button>
                {testState === 'ok' && <span className="text-green-400 text-sm flex items-center gap-1"><CheckCircle size={14} /> {testMsg}</span>}
                {testState === 'fail' && <span className="text-red-400 text-sm flex items-center gap-1"><XCircle size={14} /> {testMsg}</span>}
              </div>
              {testState === 'ok' && testPricing && (
                <div className="text-xs text-gray-400 bg-gray-800/50 rounded px-3 py-2 space-y-0.5">
                  <div className="font-medium text-gray-300 mb-1">定价参考（¥/M tokens，仅供参考）</div>
                  <div className="flex gap-4">
                    <span>输入 <span className="text-yellow-400">¥{testPricing.input.toFixed(2)}</span></span>
                    <span>输出 <span className="text-yellow-400">¥{testPricing.output.toFixed(2)}</span></span>
                  </div>
                  {testPricing.note && <div className="text-gray-500">{testPricing.note}</div>}
                </div>
              )}
              {testState === 'ok' && !testPricing && (
                <p className="text-xs text-gray-500">暂无此模型定价数据，请参考官方文档</p>
              )}
            </div>
          </section>

          {/* 记忆打分模型配置 */}
          <section className="card space-y-4">
            <div>
              <h2 className="font-semibold text-gray-200">记忆打分模型配置</h2>
              <p className="text-xs text-gray-500 mt-1">对对话重要性打分（0-10），建议使用低成本小模型</p>
            </div>

            <div>
              <label className="form-label">Provider</label>
              <select className="form-select" {...register('scoring_provider')}>
                <option value="deepseek">DeepSeek</option>
                <option value="moonshot">Moonshot</option>
                <option value="doubao">豆包（火山引擎）</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="custom">自定义</option>
              </select>
            </div>

            <div>
              <label className="form-label">API Key</label>
              <input
                type="password"
                className="form-input"
                placeholder="sk-..."
                {...register('scoring_api_key')}
              />
            </div>

            {(scoringProvider === 'custom' || scoringProvider === 'doubao') && (
              <div>
                <label className="form-label">Base URL</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://api.example.com/v1"
                  {...register('scoring_base_url')}
                />
              </div>
            )}

            <div>
              <label className="form-label">模型名称</label>
              <input
                type="text"
                className="form-input"
                placeholder="deepseek-chat"
                {...register('scoring_model')}
              />
            </div>

            <div>
              <label className="form-label">
                写入阈值（{watch('scoring_threshold')}分）
                <span className="text-gray-500 font-normal ml-2">评分 ≥ 此值才写入长期记忆</span>
              </label>
              <input
                type="range"
                min={1} max={10} step={1}
                className="w-full accent-primary-500"
                {...register('scoring_threshold', { valueAsNumber: true })}
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>1（几乎全部保存）</span>
                <span>10（只保存最重要）</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={testScoringConnection}
                  disabled={scoringTestState === 'testing'}
                  className="btn-secondary"
                >
                  {scoringTestState === 'testing' ? <Loader2 size={14} className="animate-spin" /> : null}
                  测试连接
                </button>
                {scoringTestState === 'ok' && <span className="text-green-400 text-sm flex items-center gap-1"><CheckCircle size={14} /> {scoringTestMsg}</span>}
                {scoringTestState === 'fail' && <span className="text-red-400 text-sm flex items-center gap-1"><XCircle size={14} /> {scoringTestMsg}</span>}
              </div>
              {scoringTestState === 'ok' && scoringTestPricing && (
                <div className="text-xs text-gray-400 bg-gray-800/50 rounded px-3 py-2 space-y-0.5">
                  <div className="font-medium text-gray-300 mb-1">定价参考（¥/M tokens，仅供参考）</div>
                  <div className="flex gap-4">
                    <span>输入 <span className="text-yellow-400">¥{scoringTestPricing.input.toFixed(2)}</span></span>
                    <span>输出 <span className="text-yellow-400">¥{scoringTestPricing.output.toFixed(2)}</span></span>
                  </div>
                  {scoringTestPricing.note && <div className="text-gray-500">{scoringTestPricing.note}</div>}
                </div>
              )}
              {scoringTestState === 'ok' && !scoringTestPricing && (
                <p className="text-xs text-gray-500">暂无此模型定价数据，请参考官方文档</p>
              )}
            </div>
          </section>

        </div>{/* end 左栏 */}

        {/* ── 右栏：音频管道配置 ── */}
        <div className="space-y-6">

          {/* ASR 配置（任务 8.3） */}
          <section className="card space-y-4">
            <h2 className="font-semibold text-gray-200">ASR 语音识别配置</h2>

            <div>
              <label className="form-label">模型规格</label>
              <select className="form-select" {...register('asr_model_size')}>
                <option value="tiny">Tiny（最快，精度低）</option>
                <option value="base">Base（平衡）</option>
                <option value="small">Small（推荐）</option>
                <option value="medium">Medium（最准，较慢）</option>
              </select>
            </div>

            <div>
              <label className="form-label">
                噪音过滤强度（{watch('asr_vad_sensitivity')}）
                <span className="text-gray-500 font-normal ml-2">值越高越严格，环境音越不易触发</span>
              </label>
              <input
                type="range"
                min={0} max={3} step={1}
                className="w-full accent-primary-500"
                {...register('asr_vad_sensitivity', { valueAsNumber: true })}
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>0（宽松，易误触噪音）</span>
                <span>3（严格，仅清晰人声）</span>
              </div>
            </div>

            <div>
              <label className="form-label">
                最短触发时长（{watch('asr_min_speech_duration_ms')} ms）
                <span className="text-gray-500 font-normal ml-2">短于此时长的声音直接忽略</span>
              </label>
              <input
                type="range"
                min={100} max={800} step={50}
                className="w-full accent-primary-500"
                {...register('asr_min_speech_duration_ms', { valueAsNumber: true })}
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>100ms（响应快）</span>
                <span>800ms（过滤强）</span>
              </div>
            </div>

            <div>
              <label className="form-label">
                环境音能量阈值（{watch('asr_vad_rms_threshold')}）
                <span className="text-gray-500 font-normal ml-2">低于此能量的音频直接忽略</span>
              </label>
              <input type="range" min={500} max={5000} step={100}
                className="w-full accent-primary-500"
                {...register('asr_vad_rms_threshold', { valueAsNumber: true })} />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>500（灵敏）</span><span>5000（需大声说话）</span>
              </div>
            </div>

            <div>
              <label className="form-label">
                语音前置缓冲（{watch('asr_vad_pre_roll_frames')} 帧 / {watch('asr_vad_pre_roll_frames') * 30} ms）
                <span className="text-gray-500 font-normal ml-2">防止截断词语开头</span>
              </label>
              <input type="range" min={1} max={6} step={1}
                className="w-full accent-primary-500"
                {...register('asr_vad_pre_roll_frames', { valueAsNumber: true })} />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>1帧（30ms）</span><span>6帧（180ms）</span>
              </div>
            </div>

            <div>
              <label className="form-label">麦克风设备</label>
              <select className="form-select" {...register('asr_microphone_device_index', { valueAsNumber: true })}>
                {MIC_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">麦克风设备列表需要后端支持，当前显示默认选项</p>
            </div>
          </section>

          {/* TTS 配置（任务 8.4） */}
          <section className="card space-y-4">
            <h2 className="font-semibold text-gray-200">TTS 语音合成配置（腾讯云）</h2>

            <div>
              <label className="form-label">AppId</label>
              <input
                type="number"
                className="form-input"
                placeholder="1400xxxxxx"
                {...register('tts_app_id', { valueAsNumber: true })}
              />
              <p className="text-xs text-gray-500 mt-1">在腾讯云「访问管理 → API 密钥管理」页面查看</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">SecretId</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="AKIDxxxxxxx"
                  {...register('tts_secret_id')}
                />
              </div>
              <div>
                <label className="form-label">SecretKey</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="xxxxxxxxxx"
                  {...register('tts_secret_key')}
                />
              </div>
            </div>

            <div>
              <label className="form-label">音色选择</label>
              <select className="form-select" {...register('tts_voice_type', { valueAsNumber: true })}>
                {VOICE_TYPES.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={previewTts}
              className="btn-secondary"
            >
              <Play size={14} />
              试听音色
            </button>
          </section>

        </div>{/* end 右栏 */}

      </div>{/* end grid */}

    </form>
  )
}
