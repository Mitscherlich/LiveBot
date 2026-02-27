import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { LayoutDashboard, Settings, User, MonitorPlay, Server, MessageSquare } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import SettingsPage from './pages/Settings'
import Character from './pages/Character'
import Live2DView from './pages/Live2DView'
import SystemSettings from './pages/SystemSettings'
import Chat from './pages/Chat'
import { useStandaloneMode } from './hooks/useStandaloneMode'

function Sidebar() {
  return (
    <aside className="w-56 flex-none bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">AI VTuber Bot</h1>
        <p className="text-xs text-gray-500 mt-0.5">虚拟主播控制台</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={18} />
          <span>仪表盘</span>
        </NavLink>
        <NavLink to="/chat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <MessageSquare size={18} />
          <span>对话记录</span>
        </NavLink>
        <NavLink to="/live2d" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <MonitorPlay size={18} />
          <span>Live2D 渲染</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Settings size={18} />
          <span>配置</span>
        </NavLink>
        <NavLink to="/system" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Server size={18} />
          <span>系统</span>
        </NavLink>
        <NavLink to="/character" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <User size={18} />
          <span>角色配置</span>
        </NavLink>
      </nav>
    </aside>
  )
}

export default function App() {
  const standalone = useStandaloneMode()
  return (
    <BrowserRouter>
      <div className={standalone ? 'w-screen h-screen' : 'flex h-screen overflow-hidden'}>
        {!standalone && <Sidebar />}
        <main className={standalone ? 'w-full h-full' : 'flex-1 overflow-auto'}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/live2d" element={<Live2DView />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/system" element={<SystemSettings />} />
            <Route path="/character" element={<Character />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
