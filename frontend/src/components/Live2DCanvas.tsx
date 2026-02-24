/**
 * Live2DCanvas 组件（任务 7.2-7.6）
 * - 封装 Cubism SDK 初始化和渲染循环（任务 7.2）
 * - 从后端 /models/{name}/ 加载模型（任务 7.3）
 * - 自动待机动画 CubismBreath + CubismEyeBlink（任务 7.4）
 * - 口型同步（任务 7.5）
 * - 情感动作（任务 7.6）
 */
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { CubismRenderer } from '../lib/cubism/CubismRenderer'
import { AlertTriangle, Loader2 } from 'lucide-react'

export interface Live2DCanvasHandle {
  /** 设置口型张开程度（0.0 ~ 1.0），用于口型同步 */
  setMouthOpen(value: number): void
  /** 根据情感 key 触发对应动作（"开心" | "悲伤" | "愤怒" | "平静" | "惊讶"） */
  triggerEmotion(emotion: string): void
}

interface Props {
  /** 后端模型名称，对应 /models/{name}/*.model3.json */
  modelName?: string
  /** 模型渲染缩放比例（0.1 ~ 3.0，默认 1.0） */
  scale?: number
  className?: string
}

// 情感 → Motion Group 映射
const EMOTION_MOTION_MAP: Record<string, string> = {
  开心: 'happy',
  悲伤: 'sad',
  愤怒: 'angry',
  平静: 'idle',
  惊讶: 'surprised',
}


const Live2DCanvas = forwardRef<Live2DCanvasHandle, Props>(({ modelName, scale = 1.0, className = '' }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CubismRenderer | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'no-sdk' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const mouthOpenRef = useRef(0)
  const rafRef = useRef(0)

  // 同步 canvas 内部分辨率与 CSS 显示尺寸，乘以 DPR 实现高清渲染
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // 检测 SDK 是否已加载
  const isSdkLoaded = () =>
    typeof window !== 'undefined' &&
    !window.__cubismCoreError &&
    typeof window.Live2DCubismCore !== 'undefined'

  // 口型参数平滑插值（每帧更新）
  const startMouthLoop = useCallback((renderer: CubismRenderer) => {
    let current = 0
    const update = () => {
      const target = mouthOpenRef.current
      current += (target - current) * 0.3
      renderer.setMouthOpen(current)
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)
  }, [])

  // 加载模型
  useEffect(() => {
    if (!modelName) {
      setStatus('idle')
      return
    }
    if (!isSdkLoaded()) {
      setStatus('no-sdk')
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return

    setStatus('loading')
    let renderer: CubismRenderer
    try {
      renderer = new CubismRenderer(canvas)
      rendererRef.current = renderer
    } catch (e) {
      setStatus('error')
      setErrorMsg(String(e))
      return
    }

    // 从后端查询模型目录内的文件列表，找到 .model3.json
    fetch(`/api/models/list?name=${encodeURIComponent(modelName)}`)
      .then(r => {
        if (!r.ok) throw new Error(`模型 "${modelName}" 不存在`)
        return r.json()
      })
      .then((files: string[]) => {
        const model3 = files.find(f => f.endsWith('.model3.json'))
        if (!model3) throw new Error('模型目录中未找到 .model3.json 文件')
        const url = `/models/${encodeURIComponent(modelName)}/${model3}`
        return renderer.loadModel(url)
      })
      .then(() => {
        setStatus('ready')
        startMouthLoop(renderer)
      })
      .catch(e => {
        setStatus('error')
        setErrorMsg(String(e))
      })

    return () => {
      cancelAnimationFrame(rafRef.current)
      renderer.dispose()
      rendererRef.current = null
    }
  }, [modelName, startMouthLoop])

  // 缩放变化时实时更新 renderer
  useEffect(() => {
    rendererRef.current?.setScale(scale)
  }, [scale])

  // 暴露给父组件的控制接口
  useImperativeHandle(ref, () => ({
    setMouthOpen(value: number) {
      mouthOpenRef.current = Math.max(0, Math.min(1, value))
    },
    triggerEmotion(emotion: string) {
      const motionGroup = EMOTION_MOTION_MAP[emotion] ?? 'idle'
      rendererRef.current?.triggerMotion(motionGroup)
    },
  }), [])

  return (
    <div className={`relative ${className}`}>
      {/* WebGL 渲染 Canvas */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${status === 'ready' ? '' : 'hidden'}`}
        style={{ background: 'transparent' }}
      />

      {/* 无 SDK 提示 */}
      {status === 'no-sdk' && (
        <PlaceholderCard
          icon={<AlertTriangle className="text-yellow-400" size={40} />}
          title="Cubism SDK 未安装"
          desc={
            <>
              请参考{' '}
              <code className="text-yellow-300 text-xs">frontend/public/live2d/SETUP.md</code>{' '}
              安装 CubismSdkForWeb
            </>
          }
        />
      )}

      {/* 未配置模型 */}
      {status === 'idle' && (
        <PlaceholderCard
          icon={<span className="text-4xl">🎭</span>}
          title="未配置 Live2D 模型"
          desc="请在「角色配置」页面上传模型文件"
        />
      )}

      {/* 加载中 */}
      {status === 'loading' && (
        <PlaceholderCard
          icon={<Loader2 className="text-primary-400 animate-spin" size={40} />}
          title="模型加载中..."
          desc={`正在加载 ${modelName}`}
        />
      )}

      {/* 错误 */}
      {status === 'error' && (
        <PlaceholderCard
          icon={<AlertTriangle className="text-red-400" size={40} />}
          title="模型加载失败"
          desc={<span className="text-red-300 text-xs break-all">{errorMsg}</span>}
        />
      )}
    </div>
  )
})

function PlaceholderCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: React.ReactNode
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-900/80 rounded-xl">
      {icon}
      <p className="text-gray-200 font-medium">{title}</p>
      <p className="text-gray-400 text-sm text-center max-w-xs">{desc}</p>
    </div>
  )
}

Live2DCanvas.displayName = 'Live2DCanvas'
export default Live2DCanvas
