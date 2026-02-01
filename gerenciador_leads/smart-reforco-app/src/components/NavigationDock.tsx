/**
 * NavigationDock - Clean Enterprise Light Theme
 * Menu lateral esquerdo
 */

import { 
  MessageCircle, 
  LayoutGrid, 
  Users, 
  Settings, 
  Zap,
  Bot,
  BarChart3
} from 'lucide-react'
import { useApp } from '../context/AppContext'

const appItems = [
  { id: 'chat', icon: MessageCircle, label: 'Conversas' },
  { id: 'kanban', icon: LayoutGrid, label: 'Pipeline' },
  { id: 'leads', icon: Users, label: 'Banco de Leads' },
  { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
]

const systemItems = [
  { id: 'bot', icon: Bot, label: 'Automações' },
  { id: 'settings', icon: Settings, label: 'Configurações' },
]

export function NavigationDock() {
  const { activeModule, setActiveModule, stats } = useApp()

  return (
    <div className="w-full h-full flex flex-col items-center py-4">
      {/* Logo */}
      <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center mb-6 shadow-sm">
        <Zap className="w-5 h-5 text-white" />
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-1 w-full px-3">
        {appItems.map((item) => {
          const Icon = item.icon
          const isActive = activeModule === item.id
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id as any)}
              className="relative group w-full"
              title={item.label}
            >
              <div className={`
                w-full h-10 rounded-lg flex items-center justify-center transition-all duration-200
                ${isActive 
                  ? 'bg-indigo-50 text-indigo-600' 
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                }
              `}>
                <Icon className="w-5 h-5" />
              </div>
              
              {/* Active Indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-600 rounded-r-full" />
              )}
              
              {/* Badge */}
              {item.id === 'leads' && stats.novos > 0 && (
                <span className="absolute -top-0.5 right-1.5 min-w-[18px] h-[18px] px-1 text-[10px] font-semibold bg-red-500 text-white rounded-full flex items-center justify-center">
                  {stats.novos > 99 ? '99+' : stats.novos}
                </span>
              )}

              {/* Tooltip */}
              <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg">
                {item.label}
                <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45" />
              </div>
            </button>
          )
        })}
      </nav>

      {/* Divider */}
      <div className="w-8 h-px bg-slate-200 my-2" />

      {/* System Items */}
      <nav className="flex flex-col items-center gap-1 w-full px-3 pb-2">
        {systemItems.map((item) => {
          const Icon = item.icon
          const isActive = activeModule === item.id
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id as any)}
              className="relative group w-full"
              title={item.label}
            >
              <div className={`
                w-full h-10 rounded-lg flex items-center justify-center transition-all duration-200
                ${isActive 
                  ? 'bg-indigo-50 text-indigo-600' 
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                }
              `}>
                <Icon className="w-5 h-5" />
              </div>

              {/* Tooltip */}
              <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg">
                {item.label}
                <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45" />
              </div>
            </button>
          )
        })}
      </nav>

      {/* User Avatar */}
      <div className="mt-2 px-3 w-full">
        <button className="w-full h-10 rounded-lg flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition-colors group">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
            KS
          </div>
        </button>
      </div>
    </div>
  )
}
