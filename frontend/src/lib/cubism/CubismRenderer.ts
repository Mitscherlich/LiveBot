/**
 * CubismRenderer — 基于 CubismSdkForWeb 官方 Framework 的渲染封装
 *
 * 依赖：
 *   - public/live2d/core/live2dcubismcore.min.js（已在 index.html 加载）
 *   - src/live2d/framework/（官方 Framework TypeScript 源码）
 */

import { CubismFramework, LogLevel } from '@framework/live2dcubismframework'
import { CubismMatrix44 } from '@framework/math/cubismmatrix44'
import { CubismUserModel } from '@framework/model/cubismusermodel'
import { CubismModelSettingJson } from '@framework/cubismmodelsettingjson'
import { BreathParameterData, CubismBreath } from '@framework/effect/cubismbreath'
import { CubismEyeBlink } from '@framework/effect/cubismeyeblink'
import { CubismMotion } from '@framework/motion/cubismmotion'
import { CubismExpressionMotion } from '@framework/motion/cubismexpressionmotion'
import { csmVector } from '@framework/type/csmvector'

const Priority = { None: 0, Idle: 1, Normal: 2, Force: 3 } as const

// ── Framework を一度だけ初期化 ─────────────────────────────────────────────
let _frameworkInitialized = false
function ensureFramework() {
  if (_frameworkInitialized) return
  CubismFramework.startUp({
    logFunction: console.log,
    loggingLevel: LogLevel.LogLevel_Warning,
  })
  CubismFramework.initialize()
  _frameworkInitialized = true
}

// ── VTuberModel（CubismUserModel の具象クラス） ──────────────────────────────
class VTuberModel extends CubismUserModel {
  private _setting: CubismModelSettingJson | null = null
  private _preloadedMotions = new Map<string, CubismMotion>()
  private _expressionMap = new Map<string, CubismExpressionMotion>()
  private _projMatrix = new CubismMatrix44()
  private _mouthOpenValue: number = 0

  async initialize(
    gl: WebGLRenderingContext,
    modelDir: string,
    model3JsonFile: string
  ): Promise<void> {
    // ① model3.json
    const jsonBuf = await fetchBuffer(`${modelDir}${model3JsonFile}`)
    this._setting = new CubismModelSettingJson(jsonBuf, jsonBuf.byteLength)

    // ② .moc3 → モデルを生成（this._model が確定してからレンダラーを初期化する）
    const mocFile = this._setting.getModelFileName()
    const mocBuf = await fetchBuffer(`${modelDir}${mocFile}`)
    this.loadModel(mocBuf, false)

    // ③ レンダラーを生成・初期化（createRenderer は内部で initialize(this._model) を呼ぶため
    //    必ず loadModel の後に呼ぶこと）
    this.createRenderer()
    const renderer = this.getRenderer()
    renderer.startUp(gl)
    renderer.setIsPremultipliedAlpha(true)

    // ④ テクスチャを読み込んでレンダラーに登録
    const texCount = this._setting.getTextureCount()
    for (let i = 0; i < texCount; i++) {
      const texFile = this._setting.getTextureFileName(i)
      const tex = await loadTexture(gl, `${modelDir}${texFile}`)
      renderer.bindTexture(i, tex)
    }

    // ⑤ 物理演算（オプション）
    const physicsFile = this._setting.getPhysicsFileName()
    if (physicsFile) {
      const buf = await fetchBuffer(`${modelDir}${physicsFile}`)
      this.loadPhysics(buf, buf.byteLength)
    }

    // ⑤-b ポーズ（パーツの切り替え制御）
    const poseFile = this._setting.getPoseFileName()
    if (poseFile) {
      const buf = await fetchBuffer(`${modelDir}${poseFile}`)
      this.loadPose(buf, buf.byteLength)
    }

    // ⑥ 呼吸（CubismBreath）
    const breath = CubismBreath.create()
    const breathParams = new csmVector<BreathParameterData>()
    const idMgr = CubismFramework.getIdManager()
    const p = (name: string, offset: number, peak: number, cycle: number, weight: number) => {
      const d = new BreathParameterData()
      d.parameterId = idMgr.getId(name)
      d.offset = offset
      d.peak = peak
      d.cycle = cycle
      d.weight = weight
      return d
    }
    breathParams.pushBack(p('ParamAngleX', 0, 15, 6.5345, 0.5))
    breathParams.pushBack(p('ParamAngleY', 0, 8, 3.5345, 0.5))
    breathParams.pushBack(p('ParamBodyAngleX', 0, 4, 15.5345, 0.5))
    breathParams.pushBack(p('ParamBreath', 0, 0.5, 3.2345, 1.0))
    breath.setParameters(breathParams)
    this._breath = breath

    // ⑦ 自動まばたき（CubismEyeBlink）
    this._eyeBlink = CubismEyeBlink.create(this._setting)

    // ⑧ モーションをプリロード
    const groupCount = this._setting.getMotionGroupCount()
    const emptyVec = new csmVector<ReturnType<typeof idMgr.getId>>()
    for (let gi = 0; gi < groupCount; gi++) {
      const group = this._setting.getMotionGroupName(gi)
      const motionCount = this._setting.getMotionCount(group)
      for (let mi = 0; mi < motionCount; mi++) {
        const motionFile = this._setting.getMotionFileName(group, mi)
        if (!motionFile) continue
        const buf = await fetchBuffer(`${modelDir}${motionFile}`)
        const motion = this.loadMotion(buf, buf.byteLength, `${group}_${mi}`) as CubismMotion
        // eyeBlink / lipSync effect ids（空ベクトルで渡す）
        motion.setEffectIds(emptyVec, emptyVec)
        this._preloadedMotions.set(`${group}_${mi}`, motion)
      }
    }

    // ⑨ expression をプリロード（存在しない場合は静默スキップ）
    const exprCount = this._setting.getExpressionCount()
    if (exprCount === 0) {
      console.warn('[Live2D] No expressions found in model3.json')
    }
    for (let ei = 0; ei < exprCount; ei++) {
      const name = this._setting.getExpressionName(ei)
      const file = this._setting.getExpressionFileName(ei)
      if (!name || !file) continue
      const buf = await fetchBuffer(`${modelDir}${file}`)
      const expr = this.loadExpression(buf, buf.byteLength, name) as CubismExpressionMotion
      this._expressionMap.set(name, expr)
    }

    // ⑩ 待機モーションを再生
    this._startRandomMotion('Idle', Priority.Idle)
  }

  /** グループ名でランダムにモーションを再生 */
  private _startRandomMotion(group: string, priority: number): void {
    if (!this._setting) return
    const count = this._setting.getMotionCount(group)
    if (count === 0) return
    const no = Math.floor(Math.random() * count)
    const key = `${group}_${no}`
    const motion = this._preloadedMotions.get(key)
    if (!motion) return
    this._motionManager.startMotionPriority(motion, false, priority)
  }

  /** 指定グループのモーションを再生（外部から呼び出し） */
  playMotionGroup(group: string): void {
    this._startRandomMotion(group, Priority.Normal)
  }

  /** 表情を切り替える（CubismExpressionMotionManager 経由、fade-in/out 付き） */
  playExpression(name: string): void {
    const expr = this._expressionMap.get(name)
    if (!expr) {
      console.warn(`[Live2D] Expression "${name}" not found`)
      return
    }
    this._expressionManager.startMotion(expr, false)
  }

  /** 口型パラメータを直接設定（0.0〜1.0） */
  setMouthOpen(value: number): void {
    this._mouthOpenValue = value
  }

  /** 毎フレーム更新（deltaSeconds: 秒単位） */
  update(deltaSeconds: number): void {
    this._dragManager.update(deltaSeconds)
    const model = this._model

    model.loadParameters()
    if (this._motionManager.isFinished()) {
      this._startRandomMotion('Idle', Priority.Idle)
    } else {
      this._motionManager.updateMotion(model, deltaSeconds)
    }
    model.saveParameters()

    this._eyeBlink?.updateParameters(model, deltaSeconds)
    this._expressionManager?.updateMotion(model, deltaSeconds)
    this._physics?.evaluate(model, deltaSeconds)
    this._breath?.updateParameters(model, deltaSeconds)
    this._pose?.updateParameters(model, deltaSeconds)

    // 在 model.update() 之前写入口型值，确保不被 Motion 的 saveParameters() 覆盖
    const mouthId = CubismFramework.getIdManager().getId('ParamMouthOpenY')
    this._model.setParameterValueById(mouthId, this._mouthOpenValue)

    model.update()
  }

  private _scale = 1.0

  setScale(scale: number): void {
    this._scale = scale
  }

  /** モデルを描画 */
  draw(gl: WebGLRenderingContext, canvas: HTMLCanvasElement): void {
    const renderer = this.getRenderer()

    // ── 官方示例的投影矩阵设置方式 ───────────────────────────────────────
    this._projMatrix.loadIdentity()
    const { width, height } = canvas
    const s = this._scale

    if (this._model.getCanvasWidth() > 1.0 && width < height) {
      // 横长模型 × 竖长画布：以画布宽度为基准
      this._modelMatrix.setWidth(2.0)
      this._projMatrix.scale(1.0 * s, width / height * s)
    } else {
      // 其余情况：以画布高度为基准
      this._projMatrix.scale(height / width * s, 1.0 * s)
    }

    // ── 乘以模型矩阵（关键！官方示例在 model.draw() 中执行此步骤） ────────
    // _modelMatrix 由 CubismUserModel.loadModel() 根据 moc 画布尺寸
    // 自动计算正确的缩放和居中变换，缺少这步会导致模型极小或错位
    this._projMatrix.multiplyByMatrix(this._modelMatrix)

    renderer.setMvpMatrix(this._projMatrix)

    // 现在バインドされている FBO を取得して渡す
    const fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer
    renderer.setRenderState(fbo, [0, 0, canvas.width, canvas.height])
    renderer.drawModel()
  }
}

// ── ユーティリティ ─────────────────────────────────────────────────────────────
async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.arrayBuffer()
}

function loadTexture(gl: WebGLRenderingContext, url: string): Promise<WebGLTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.bindTexture(gl.TEXTURE_2D, null)
      resolve(tex)
    }
    img.onerror = () => reject(new Error(`Failed to load texture: ${url}`))
    img.src = url
  })
}

// ── 公開クラス（React コンポーネントから使用） ────────────────────────────────
export class CubismRenderer {
  private gl: WebGLRenderingContext
  private model: VTuberModel | null = null
  private rafId = 0
  private lastTime = 0
  private _scale = 1.0

  constructor(private canvas: HTMLCanvasElement) {
    ensureFramework()
    const gl = canvas.getContext('webgl', { alpha: true })
    if (!gl) throw new Error('WebGL not supported')
    this.gl = gl
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
  }

  async loadModel(modelJsonUrl: string): Promise<void> {
    this.unloadModel()
    const lastSlash = modelJsonUrl.lastIndexOf('/')
    const modelDir = modelJsonUrl.substring(0, lastSlash + 1)
    const model3JsonFile = modelJsonUrl.substring(lastSlash + 1)

    const model = new VTuberModel()
    await model.initialize(this.gl, modelDir, model3JsonFile)
    model.setScale(this._scale)
    this.model = model

    this.lastTime = performance.now()
    this._startLoop()
  }

  setMouthOpen(value: number): void {
    this.model?.setMouthOpen(value)
  }

  triggerMotion(group: string): void {
    this.model?.playMotionGroup(group)
  }

  setExpression(name: string): void {
    this.model?.playExpression(name)
  }

  setScale(scale: number): void {
    this._scale = scale
    this.model?.setScale(scale)
  }

  private _startLoop(): void {
    const loop = (now: number) => {
      const delta = Math.min((now - this.lastTime) / 1000, 0.033)
      this.lastTime = now
      const gl = this.gl
      gl.viewport(0, 0, this.canvas.width, this.canvas.height)
      gl.clear(gl.COLOR_BUFFER_BIT)
      this.model?.update(delta)
      this.model?.draw(gl, this.canvas)
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  unloadModel(): void {
    cancelAnimationFrame(this.rafId)
    this.model?.release()
    this.model = null
  }

  dispose(): void {
    this.unloadModel()
  }
}
