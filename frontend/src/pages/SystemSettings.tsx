/**
 * 系统配置页面
 * - 服务器绑定地址配置
 */
import { useEffect, useState } from 'react'
import { Save, Loader2, AlertCircle, Server, RefreshCw } from 'lucide-react'

type BindOption = 'localhost' | 'all' | 'custom'

interface SystemConfig {
  bind_address: string
  port: number
  restart_required: boolean
  message: string
}

type SaveState = 'idle' | 'saving' | 'success' | 'error'

const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}$|^:(?::[0-9a-fA-F]{1,4}){1,7}$|^::$/

function isValidIP(ip: string): boolean {
  return IP_REGEX.test(ip)
}

export default function SystemSettings() {
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [bindOption, setBindOption] = useState<BindOption>('localhost')
  const [customAddress, setCustomAddress] = useState('')
  const [port, setPort] = useState(8000)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const [showRestartAlert, setShowRestartAlert] = useState(false)

  // Load configuration on mount
  useEffect(() => {
    fetch('/api/system/config')
      .then(res => res.json())
      .then((data: SystemConfig) => {
        setConfig(data)
        setPort(data.port)
        
        // Determine bind option based on address
        if (data.bind_address === '127.0.0.1' || data.bind_address === 'localhost') {
          setBindOption('localhost')
        } else if (data.bind_address === '0.0.0.0') {
          setBindOption('all')
        } else {
          setBindOption('custom')
          setCustomAddress(data.bind_address)
        }
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load config:', err)
        setSaveError('加载配置失败')
        setLoading(false)
      })
  }, [])

  const getBindAddress = (): string => {
    switch (bindOption) {
      case 'localhost':
        return '127.0.0.1'
      case 'all':
        return '0.0.0.0'
      case 'custom':
        return customAddress.trim()
      default:
        return '127.0.0.1'
    }
  }

  const isValid = (): boolean => {
    if (bindOption === 'custom') {
      return isValidIP(customAddress.trim())
    }
    return true
  }

  const handleSave = async () => {
    if (!isValid()) return

    setSaveState('saving')
    setSaveError('')
    setShowRestartAlert(false)

    const bindAddress = getBindAddress()

    try {
      const response = await fetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bind_address: bindAddress,
          port: port
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || '保存失败')
      }

      const result: SystemConfig = await response.json()
      setConfig(result)
      setSaveState('success')
      setShowRestartAlert(result.restart_required)
    } catch (err) {
      setSaveState('error')
      setSaveError(err instanceof Error ? err.message : '保存失败')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Server className="w-6 h-6 text-indigo-500" />
          系统配置
        </h1>
        <p className="text-gray-400 mt-2">
          配置服务器监听地址和端口。修改后需要重启服务才能生效。
        </p>
      </div>

      {/* Restart Alert */}
      {showRestartAlert && (
        <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-lg flex items-start gap-3">
          <RefreshCw className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-yellow-400 font-medium">需要重启服务</h3>
            <p className="text-yellow-200/70 text-sm mt-1">
              配置已保存，但需要重启服务才能生效。请重启后端服务以应用更改。
            </p>
          </div>
        </div>
      )}

      {/* Server Configuration Card */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">服务器配置</h2>
          <p className="text-gray-400 text-sm mt-1">
            控制 HTTP 服务器的监听地址和端口
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Bind Address Options */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              监听地址
            </label>
            
            <div className="space-y-3">
              {/* Localhost Option */}
              <label className={`flex items-center p-4 rounded-lg border cursor-pointer transition-colors ${
                bindOption === 'localhost' 
                  ? 'border-indigo-500 bg-indigo-500/10' 
                  : 'border-gray-600 hover:border-gray-500'
              }`}>
                <input
                  type="radio"
                  name="bindOption"
                  value="localhost"
                  checked={bindOption === 'localhost'}
                  onChange={(e) => setBindOption(e.target.value as BindOption)}
                  className="w-4 h-4 text-indigo-500 border-gray-500 focus:ring-indigo-500"
                />
                <div className="ml-3 flex-1">
                  <div className="text-white font-medium">仅本地访问 (127.0.0.1)</div>
                  <div className="text-gray-400 text-sm mt-0.5">
                    只允许本机访问，安全性最高
                  </div>
                </div>
              </label>

              {/* All Interfaces Option */}
              <label className={`flex items-center p-4 rounded-lg border cursor-pointer transition-colors ${
                bindOption === 'all' 
                  ? 'border-indigo-500 bg-indigo-500/10' 
                  : 'border-gray-600 hover:border-gray-500'
              }`}>
                <input
                  type="radio"
                  name="bindOption"
                  value="all"
                  checked={bindOption === 'all'}
                  onChange={(e) => setBindOption(e.target.value as BindOption)}
                  className="w-4 h-4 text-indigo-500 border-gray-500 focus:ring-indigo-500"
                />
                <div className="ml-3 flex-1">
                  <div className="text-white font-medium">允许所有网络接口 (0.0.0.0)</div>
                  <div className="text-gray-400 text-sm mt-0.5">
                    允许局域网内其他设备访问
                  </div>
                </div>
              </label>

              {/* Custom Address Option */}
              <label className={`flex items-start p-4 rounded-lg border cursor-pointer transition-colors ${
                bindOption === 'custom' 
                  ? 'border-indigo-500 bg-indigo-500/10' 
                  : 'border-gray-600 hover:border-gray-500'
              }`}>
                <input
                  type="radio"
                  name="bindOption"
                  value="custom"
                  checked={bindOption === 'custom'}
                  onChange={(e) => setBindOption(e.target.value as BindOption)}
                  className="w-4 h-4 text-indigo-500 border-gray-500 focus:ring-indigo-500 mt-1"
                />
                <div className="ml-3 flex-1">
                  <div className="text-white font-medium">自定义 IP 地址</div>
                  <div className="mt-2">
                    <input
                      type="text"
                      value={customAddress}
                      onChange={(e) => setCustomAddress(e.target.value)}
                      disabled={bindOption !== 'custom'}
                      placeholder="例如: 192.168.1.100"
                      className={`w-full px-3 py-2 bg-gray-700 border rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        bindOption === 'custom' && customAddress && !isValidIP(customAddress)
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-gray-600 focus:border-indigo-500'
                      }`}
                    />
                    {bindOption === 'custom' && customAddress && !isValidIP(customAddress) && (
                      <p className="text-red-400 text-sm mt-1 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        请输入有效的 IP 地址
                      </p>
                    )}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Port Configuration */}
          <div>
            <label htmlFor="port" className="block text-sm font-medium text-gray-300 mb-2">
              端口
            </label>
            <input
              type="number"
              id="port"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value) || 8000)}
              min={1}
              max={65535}
              className="w-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-gray-400 text-sm mt-1">
              服务监听端口（默认: 8000）
            </p>
          </div>

          {/* Current Configuration Info */}
          {config && (
            <div className="p-4 bg-gray-700/50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-300 mb-2">当前配置</h4>
              <div className="text-sm text-gray-400">
                <p>绑定地址: <span className="text-gray-200 font-mono">{config.bind_address}</span></p>
                <p>端口: <span className="text-gray-200 font-mono">{config.port}</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/50 flex items-center justify-between">
          <div>
            {saveState === 'error' && (
              <p className="text-red-400 text-sm flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {saveError}
              </p>
            )}
            {saveState === 'success' && (
              <p className="text-green-400 text-sm">保存成功</p>
            )}
          </div>
          
          <button
            onClick={handleSave}
            disabled={saveState === 'saving' || !isValid()}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
              saveState === 'saving' || !isValid()
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {saveState === 'saving' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存配置
              </>
            )}
          </button>
        </div>
      </div>

      {/* Security Notice */}
      <div className="mt-6 p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg">
        <h3 className="text-blue-400 font-medium text-sm">安全提示</h3>
        <ul className="text-blue-300/70 text-sm mt-2 space-y-1 list-disc list-inside">
          <li>默认仅监听本地地址 (127.0.0.1)，可防止外部网络访问</li>
          <li>如需允许外部访问，请选择"允许所有网络接口"或设置特定 IP</li>
          <li>开放到所有接口可能存在安全风险，请确保在受信任的网络环境中使用</li>
        </ul>
      </div>
    </div>
  )
}
