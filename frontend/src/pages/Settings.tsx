/**
 * 系统设置页
 * - OpenClaw Gateway 配置（URL、Token、SessionKey）
 * - ASR 配置（模型规格、VAD 灵敏度滑块、麦克风设备）
 * - TTS 配置（SecretId/SecretKey、VoiceType 选择、试听）
 * - 配置读取（GET /api/config）和保存（POST /api/config）
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  Play,
} from "lucide-react";

// OpenClaw 配置接口（与后端 OpenClawConfig 对应）
interface OpenClawConfig {
  url: string;
  token: string;
  session_key: string;
  agent_id: string;
  timeout_ms: number;
}

// 音色选项（★ 表示支持多情感风格，适合虚拟主播场景）
const VOICE_TYPES = [
  // 超自然大模型音色（推荐，音质最佳）
  { value: 603004, label: "温柔小柠 - 聊天女声（推荐）" },
  { value: 603001, label: "潇湘妹妹 - 特色女声" },
  { value: 602003, label: "爱小悠 - 聊天女声" },
  { value: 502001, label: "智小柔 - 聊天女声" },
  { value: 502003, label: "智小敏 - 聊天女声" },
  { value: 603003, label: "随和老李 - 聊天男声" },
  { value: 603005, label: "知心大林 - 聊天男声" },
  { value: 603000, label: "懂事少年 - 特色男声" },
  { value: 502006, label: "智小悟 - 聊天男声" },
  // 大模型音色（多情感）
  { value: 601008, label: "爱小豪 - 聊天男声 ★多情感" },
  { value: 601009, label: "爱小芊 - 聊天女声 ★多情感" },
  { value: 601010, label: "爱小娇 - 聊天女声 ★多情感" },
  // 大模型音色
  { value: 501004, label: "月华 - 聊天女声" },
  { value: 601012, label: "爱小璟 - 特色女声" },
  { value: 501005, label: "飞镜 - 聊天男声" },
  { value: 601011, label: "爱小川 - 聊天男声" },
  // 精品音色
  { value: 101001, label: "智瑜 - 情感女声" },
  { value: 101004, label: "智云 - 通用男声" },
  { value: 101019, label: "智彤 - 粤语女声" },
];

const MIC_OPTIONS = [{ value: -1, label: "默认设备" }];

interface ConfigForm {
  openclaw_url: string;
  openclaw_token: string;
  openclaw_session_key: string;
  openclaw_agent_id: string;
  openclaw_timeout_ms: number;
  asr_model_size: string;
  asr_vad_sensitivity: number;
  asr_min_speech_duration_ms: number;
  asr_vad_rms_threshold: number;
  asr_vad_pre_roll_frames: number;
  asr_microphone_device_index: number;
  tts_enabled: boolean;
  tts_app_id: number;
  tts_secret_id: string;
  tts_secret_key: string;
  tts_voice_type: number;
}

type SaveState = "idle" | "saving" | "success" | "error";

export default function SettingsPage() {
  const { register, handleSubmit, watch, setValue, reset, getValues } =
    useForm<ConfigForm>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);

  // 加载配置
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        reset({
          openclaw_url: cfg.openclaw?.url ?? "http://localhost:18789",
          openclaw_token: cfg.openclaw?.token ?? "",
          openclaw_session_key: cfg.openclaw?.session_key ?? "main",
          openclaw_agent_id: cfg.openclaw?.agent_id ?? "",
          openclaw_timeout_ms: cfg.openclaw?.timeout_ms ?? 120000,
          asr_model_size: cfg.asr?.model_size ?? "small",
          asr_vad_sensitivity: cfg.asr?.vad_sensitivity ?? 3,
          asr_min_speech_duration_ms: cfg.asr?.min_speech_duration_ms ?? 300,
          asr_vad_rms_threshold: cfg.asr?.vad_rms_threshold ?? 2200,
          asr_vad_pre_roll_frames: cfg.asr?.vad_pre_roll_frames ?? 3,
          asr_microphone_device_index: cfg.asr?.microphone_device_index ?? -1,
          tts_enabled: cfg.tts?.enabled ?? true,
          tts_app_id: cfg.tts?.app_id ?? 0,
          tts_secret_id: cfg.tts?.secret_id ?? "",
          tts_secret_key: cfg.tts?.secret_key ?? "",
          tts_voice_type: cfg.tts?.voice_type ?? 603004,
        });
      })
      .finally(() => setLoading(false));
  }, [reset]);

  // 保存配置
  const onSubmit = async (data: ConfigForm) => {
    setSaveState("saving");
    setSaveError("");
    try {
      const current = await fetch("/api/config").then((r) => r.json());
      const payload = {
        ...current,
        openclaw: {
          url: data.openclaw_url,
          token: data.openclaw_token,
          session_key: data.openclaw_session_key,
          agent_id: data.openclaw_agent_id,
          timeout_ms: Number(data.openclaw_timeout_ms),
        } satisfies OpenClawConfig,
        asr: {
          model_size: data.asr_model_size,
          vad_sensitivity: data.asr_vad_sensitivity,
          min_speech_duration_ms: data.asr_min_speech_duration_ms,
          vad_rms_threshold: data.asr_vad_rms_threshold,
          vad_pre_roll_frames: data.asr_vad_pre_roll_frames,
          microphone_device_index:
            data.asr_microphone_device_index === -1
              ? null
              : data.asr_microphone_device_index,
        },
        tts: {
          enabled: data.tts_enabled,
          app_id: Number(data.tts_app_id),
          secret_id: data.tts_secret_id,
          secret_key: data.tts_secret_key,
          voice_type: Number(data.tts_voice_type),
        },
      };
      const r = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.detail ?? r.statusText);
      }
      setSaveState("success");
      setTimeout(() => setSaveState("idle"), 3000);
    } catch (e) {
      setSaveState("error");
      setSaveError(String(e));
    }
  };

  // TTS 试听
  const previewTts = async () => {
    const v = getValues();
    try {
      const r = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: Number(v.tts_app_id),
          secret_id: v.tts_secret_id,
          secret_key: v.tts_secret_key,
          voice_type: Number(v.tts_voice_type),
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        console.error("TTS 试听失败:", err.detail);
      }
    } catch (e) {
      console.error("TTS 试听失败:", e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-primary-400" size={32} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">系统设置</h1>
        <button
          type="submit"
          disabled={saveState === "saving"}
          className="btn-primary"
        >
          {saveState === "saving" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saveState === "success" ? (
            <CheckCircle size={16} />
          ) : (
            <Save size={16} />
          )}
          {saveState === "saving"
            ? "保存中..."
            : saveState === "success"
              ? "已保存"
              : "保存配置"}
        </button>
      </div>

      {saveState === "error" && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <XCircle size={16} className="flex-none" />
          {saveError}
        </div>
      )}

      {/* 左右双栏：左=AI模型，右=音频管道 */}
      <div className="grid grid-cols-2 gap-6 items-start">
        {/* ── 左栏：OpenClaw 配置 ── */}
        <div className="space-y-6">
          <section className="card space-y-4">
            <div>
              <h2 className="font-semibold text-gray-200">OpenClaw Gateway 配置</h2>
              <p className="text-xs text-gray-500 mt-1">
                LLM、记忆、工具能力均由 OpenClaw Gateway 提供
              </p>
            </div>

            <div>
              <label className="form-label">Gateway URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="http://localhost:18789"
                {...register("openclaw_url")}
              />
              <p className="text-xs text-gray-500 mt-1">
                OpenClaw Gateway 的 HTTP 地址，默认 http://localhost:18789
              </p>
            </div>

            <div>
              <label className="form-label">Token</label>
              <input
                type="password"
                className="form-input"
                placeholder="Bearer token（可在 ~/.openclaw/openclaw.json 中查看）"
                {...register("openclaw_token")}
              />
            </div>

            <div>
              <label className="form-label">Session Key</label>
              <input
                type="text"
                className="form-input"
                placeholder="main"
                {...register("openclaw_session_key")}
              />
              <p className="text-xs text-gray-500 mt-1">
                对话 session 标识，固定值可保留跨重启的对话上下文
              </p>
            </div>

            <div>
              <label className="form-label">Agent ID（可选）</label>
              <input
                type="text"
                className="form-input"
                placeholder="留空使用 Gateway 默认 Agent"
                {...register("openclaw_agent_id")}
              />
            </div>

            <div>
              <label className="form-label">
                超时时间（{watch("openclaw_timeout_ms")} ms）
              </label>
              <input
                type="number"
                className="form-input"
                min={5000}
                step={1000}
                {...register("openclaw_timeout_ms", { valueAsNumber: true })}
              />
            </div>
          </section>
        </div>
        {/* end 左栏 */}

        {/* ── 右栏：音频管道配置 ── */}
        <div className="space-y-6">
          {/* ASR 配置 */}
          <section className="card space-y-4">
            <h2 className="font-semibold text-gray-200">ASR 语音识别配置</h2>

            <div>
              <label className="form-label">模型规格</label>
              <select className="form-select" {...register("asr_model_size")}>
                <option value="tiny">Tiny（最快，精度低）</option>
                <option value="base">Base（平衡）</option>
                <option value="small">Small（推荐）</option>
                <option value="medium">Medium（最准，较慢）</option>
              </select>
            </div>

            <div>
              <label className="form-label">
                噪音过滤强度（{watch("asr_vad_sensitivity")}）
                <span className="text-gray-500 font-normal ml-2">
                  值越高越严格，环境音越不易触发
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                className="w-full accent-primary-500"
                {...register("asr_vad_sensitivity", { valueAsNumber: true })}
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>0（宽松，易误触噪音）</span>
                <span>3（严格，仅清晰人声）</span>
              </div>
            </div>

            <div>
              <label className="form-label">
                最短触发时长（{watch("asr_min_speech_duration_ms")} ms）
                <span className="text-gray-500 font-normal ml-2">
                  短于此时长的声音直接忽略
                </span>
              </label>
              <input
                type="range"
                min={100}
                max={800}
                step={50}
                className="w-full accent-primary-500"
                {...register("asr_min_speech_duration_ms", {
                  valueAsNumber: true,
                })}
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>100ms（响应快）</span>
                <span>800ms（过滤强）</span>
              </div>
            </div>

            <div>
              <label className="form-label">
                环境音能量阈值（{watch("asr_vad_rms_threshold")}）
                <span className="text-gray-500 font-normal ml-2">
                  低于此能量的音频直接忽略
                </span>
              </label>
              <input
                type="range"
                min={500}
                max={5000}
                step={100}
                className="w-full accent-primary-500"
                {...register("asr_vad_rms_threshold", { valueAsNumber: true })}
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>500（灵敏）</span>
                <span>5000（需大声说话）</span>
              </div>
            </div>

            <div>
              <label className="form-label">
                语音前置缓冲（{watch("asr_vad_pre_roll_frames")} 帧 /{" "}
                {watch("asr_vad_pre_roll_frames") * 30} ms）
                <span className="text-gray-500 font-normal ml-2">
                  防止截断词语开头
                </span>
              </label>
              <input
                type="range"
                min={1}
                max={6}
                step={1}
                className="w-full accent-primary-500"
                {...register("asr_vad_pre_roll_frames", {
                  valueAsNumber: true,
                })}
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>1帧（30ms）</span>
                <span>6帧（180ms）</span>
              </div>
            </div>

            <div>
              <label className="form-label">麦克风设备</label>
              <select
                className="form-select"
                {...register("asr_microphone_device_index", {
                  valueAsNumber: true,
                })}
              >
                {MIC_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* TTS 配置 */}
          <section className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-200">
                TTS 语音合成配置（腾讯云）
              </h2>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-sm text-gray-400">
                  {watch("tts_enabled") ? "已开启" : "已关闭"}
                </span>
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    {...register("tts_enabled")}
                  />
                  <div
                    onClick={() =>
                      setValue("tts_enabled", !watch("tts_enabled"))
                    }
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${
                      watch("tts_enabled") ? "bg-primary-500" : "bg-gray-600"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        watch("tts_enabled")
                          ? "translate-x-5"
                          : "translate-x-0.5"
                      }`}
                    />
                  </div>
                </div>
              </label>
            </div>

            <div>
              <label className="form-label">AppId</label>
              <input
                type="number"
                className="form-input"
                placeholder="1400xxxxxx"
                {...register("tts_app_id", { valueAsNumber: true })}
              />
              <p className="text-xs text-gray-500 mt-1">
                在腾讯云「访问管理 → API 密钥管理」页面查看
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">SecretId</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="AKIDxxxxxxx"
                  {...register("tts_secret_id")}
                />
              </div>
              <div>
                <label className="form-label">SecretKey</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="xxxxxxxxxx"
                  {...register("tts_secret_key")}
                />
              </div>
            </div>

            <div>
              <label className="form-label">音色选择</label>
              <select
                className="form-select"
                {...register("tts_voice_type", { valueAsNumber: true })}
              >
                {VOICE_TYPES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
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
        </div>
        {/* end 右栏 */}
      </div>
      {/* end grid */}
    </form>
  );
}
