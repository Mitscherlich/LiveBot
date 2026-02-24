/**
 * 角色配置页（任务 8.5）
 * - 名称输入、人设文本域
 * - Live2D 模型文件上传（zip 或多文件）
 */
import { useEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { Save, Upload, Loader2, CheckCircle, XCircle, FolderOpen } from 'lucide-react'

interface CharForm {
  name: string
  persona: string
  live2d_model: string
}

type SaveState = 'idle' | 'saving' | 'success' | 'error'
type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export default function Character() {
  const { register, handleSubmit, reset } = useForm<CharForm>()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadMsg, setUploadMsg] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  // 加载配置
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        reset({
          name: cfg.character?.name ?? '',
          persona: cfg.character?.persona ?? '',
          live2d_model: cfg.character?.live2d_model ?? '',
        })
      })
      .finally(() => setLoading(false))

    // 加载已上传的模型列表
    fetchModels()
  }, [reset])

  const fetchModels = () => {
    fetch('/api/models')
      .then(r => r.json())
      .then((data: { models: string[] }) => setModels(data.models ?? []))
      .catch(() => {})
  }

  // 保存角色配置
  const onSubmit = async (data: CharForm) => {
    setSaveState('saving')
    setSaveError('')

    // 先拉取完整配置再合并，避免覆盖其他配置项
    try {
      const cfgRes = await fetch('/api/config')
      const current = await cfgRes.json()

      const payload = {
        ...current,
        character: {
          name: data.name,
          persona: data.persona,
          live2d_model: data.live2d_model,
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

  // 上传 Live2D 模型文件
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploadState('uploading')
    setUploadMsg('')

    const formData = new FormData()
    for (const file of files) {
      formData.append('files', file)
    }

    try {
      const r = await fetch('/api/models/upload', { method: 'POST', body: formData })
      const data = await r.json()
      if (r.ok) {
        setUploadState('success')
        setUploadMsg(`模型 "${data.model_name}" 上传成功`)
        fetchModels()
      } else {
        throw new Error(data.detail ?? r.statusText)
      }
    } catch (e) {
      setUploadState('error')
      setUploadMsg(String(e))
    }

    // 清空文件选择器
    if (fileRef.current) fileRef.current.value = ''
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-primary-400" size={32} />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">角色配置</h1>
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
          {saveState === 'saving' ? '保存中...' : saveState === 'success' ? '已保存' : '保存角色'}
        </button>
      </div>

      {saveState === 'error' && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <XCircle size={16} className="flex-none" />
          {saveError}
        </div>
      )}

      {/* 基本信息 */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-gray-200">角色基本信息</h2>

        <div>
          <label className="form-label">角色名称</label>
          <input
            type="text"
            className="form-input"
            placeholder="小零"
            {...register('name', { required: true })}
          />
        </div>

        <div>
          <label className="form-label">人设描述</label>
          <textarea
            className="form-input resize-none"
            rows={6}
            placeholder="你是一个活泼开朗的虚拟主播，说话风格轻松有趣..."
            {...register('persona')}
          />
          <p className="text-xs text-gray-500 mt-1">
            这段描述将作为 system prompt 的一部分注入到 LLM 中
          </p>
        </div>

        <div>
          <label className="form-label">当前使用的 Live2D 模型</label>
          <select className="form-select" {...register('live2d_model')}>
            <option value="">（未选择）</option>
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {models.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">还没有上传任何模型，请在下方上传</p>
          )}
        </div>
      </section>

      {/* Live2D 模型上传（任务 8.5） */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-gray-200">Live2D 模型上传</h2>
        <p className="text-sm text-gray-400">
          支持上传 <code className="text-gray-300">.zip</code> 压缩包或直接选择多个模型文件（
          <code className="text-gray-300">.model3.json</code>、
          <code className="text-gray-300">.moc3</code>、纹理等）。
        </p>

        <div
          className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-primary-600 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="mx-auto mb-3 text-gray-500" size={32} />
          <p className="text-gray-400 text-sm">点击选择文件 或 拖拽到此处</p>
          <p className="text-gray-600 text-xs mt-1">支持 .zip / .model3.json / .moc3 / .png 等</p>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".zip,.json,.moc3,.png,.jpg,.physics3.json,.motion3.json"
            className="hidden"
            onChange={handleUpload}
          />
        </div>

        {uploadState === 'uploading' && (
          <div className="flex items-center gap-2 text-sm text-primary-400">
            <Loader2 size={14} className="animate-spin" />
            上传中...
          </div>
        )}
        {uploadState === 'success' && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle size={14} />
            {uploadMsg}
          </div>
        )}
        {uploadState === 'error' && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <XCircle size={14} />
            {uploadMsg}
          </div>
        )}

        {/* 已上传模型列表 */}
        {models.length > 0 && (
          <div>
            <p className="text-sm text-gray-400 mb-2 flex items-center gap-2">
              <FolderOpen size={14} /> 已上传的模型
            </p>
            <div className="space-y-1">
              {models.map(m => (
                <div key={m} className="flex items-center gap-2 text-sm text-gray-300 bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-lg">🎭</span>
                  {m}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="h-4" />
    </form>
  )
}
