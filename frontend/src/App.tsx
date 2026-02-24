import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { LayoutDashboard, Settings, User, MonitorPlay } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import SettingsPage from './pages/Settings'
import Character from './pages/Character'
import Live2DView from './pages/Live2DView'

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
        <NavLink to="/live2d" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <MonitorPlay size={18} />
          <span>Live2D 渲染</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Settings size={18} />
          <span>系统设置</span>
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
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/live2d" element={<Live2DView />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/character" element={<Character />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
