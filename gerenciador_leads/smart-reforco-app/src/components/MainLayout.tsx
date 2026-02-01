/**
 * ============================================================
 * MainLayout - Enterprise SaaS Pattern
 * Gray Background + White Cards (Stripe/ContaAzul Style)
 * ============================================================
 */

import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { ContactList } from './ContactList'
import { ChatWindow } from './ChatWindow'
import { CRMRightPanel } from './CRMRightPanel'
import { KanbanBoard } from './KanbanBoard'
import { SmartLeads } from './SmartLeads'
import { BotConfig } from './BotConfig'
import { 
  MessageSquare, 
  Users, 
  Kanban, 
  Bot, 
  BarChart3, 
  Settings,
  ChevronRight,
  Bell,
  Search,
  HelpCircle,
  LogOut,
  Sparkles
} from 'lucide-react'

// ============================================================
// SIDEBAR COMPONENT - Clean White Sidebar
// ============================================================

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  badge?: number
}

const navItems: NavItem[] = [
  { id: 'chat', label: 'Conversas', icon: <MessageSquare className="w-5 h-5" />, badge: 12 },
  { id: 'kanban', label: 'Pipeline', icon: <Kanban className="w-5 h-5" /> },
  { id: 'leads', label: 'Meus Leads', icon: <Users className="w-5 h-5" /> },
  { id: 'bot', label: 'Automações', icon: <Bot className="w-5 h-5" /> },
  { id: 'dashboard', label: 'Relatórios', icon: <BarChart3 className="w-5 h-5" /> },
]

function Sidebar({ 
  currentView, 
  onNavigate 
}: { 
  currentView: string
  onNavigate: (view: string) => void 
}) {
  return (
    <aside className="w-[280px] h-screen bg-white border-r border-gray-200 flex flex-col">
      {/* Logo Area */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Smart Reforço</h1>
            <p className="text-xs text-gray-500">CRM WhatsApp</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = currentView === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group ${
                isActive 
                  ? 'bg-indigo-50 text-indigo-700' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-indigo-600'
              }`}
            >
              <span className={`${isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-indigo-500'}`}>
                {item.icon}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  isActive 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {item.badge}
                </span>
              )}
              <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity ${
                isActive ? 'text-indigo-400' : 'text-gray-400'
              }`} />
            </button>
          )
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-gray-100 space-y-1">
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
          <Settings className="w-5 h-5 text-gray-400" />
          <span>Configurações</span>
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
          <HelpCircle className="w-5 h-5 text-gray-400" />
          <span>Ajuda</span>
        </button>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
            KR
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">Kaleb Reis</p>
            <p className="text-xs text-gray-500 truncate">Admin</p>
          </div>
          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

// ============================================================
// PAGE HEADER COMPONENT
// ============================================================

function PageHeader({ 
  title, 
  subtitle,
  actions 
}: { 
  title: string
  subtitle?: string
  actions?: React.ReactNode 
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  )
}

// ============================================================
// TOP BAR COMPONENT
// ============================================================

function TopBar() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between">
      {/* Search */}
      <div className="relative w-96">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar leads, conversas..."
          className="w-full h-10 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
        />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        <button className="relative p-2.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
      </div>
    </header>
  )
}

// ============================================================
// PLACEHOLDER PAGES
// ============================================================

function DashboardPage() {
  return (
    <div className="p-8">
      <PageHeader 
        title="Relatórios" 
        subtitle="Acompanhe o desempenho das suas vendas"
      />
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Dashboard em Desenvolvimento</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Em breve você terá acesso a relatórios detalhados sobre conversas, conversões e desempenho da equipe.
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// CHAT PAGE - WhatsApp Style Clean
// ============================================================

function ChatPage() {
  const { selectedLead } = useApp()
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false)

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Bar inside chat */}
      <TopBar />
      
      {/* Chat Container - Full Height Card */}
      <div className="flex-1 min-h-0 p-4 bg-[#F3F4F6]">
        <div className="h-full bg-white rounded-xl shadow-sm border border-gray-200 flex overflow-hidden">
          {/* Contact List */}
          <div className="w-[340px] border-r border-gray-100 flex flex-col">
            <ContactList />
          </div>
          
          {/* Chat Window */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ChatWindow 
              selectedLead={selectedLead}
              toggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
              isRightPanelOpen={isRightPanelOpen}
            />
          </div>
          
          {/* Right Panel */}
          {isRightPanelOpen && selectedLead && (
            <div className="w-[380px] border-l border-gray-100">
              <CRMRightPanel 
                lead={selectedLead}
                onClose={() => setIsRightPanelOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PIPELINE PAGE - Kanban
// ============================================================

function PipelinePage() {
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 p-8 bg-[#F3F4F6] overflow-hidden">
        <PageHeader 
          title="Pipeline de Vendas" 
          subtitle="Arraste os cards para mover leads entre as etapas"
          actions={
            <button className="h-10 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2">
              <Users className="w-4 h-4" />
              Adicionar Lead
            </button>
          }
        />
        
        {/* Kanban Container */}
        <div className="h-[calc(100%-80px)]">
          <KanbanBoard />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// LEADS PAGE - Table
// ============================================================

function LeadsPage() {
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 p-8 bg-[#F3F4F6] overflow-auto">
        <SmartLeads />
      </div>
    </div>
  )
}

// ============================================================
// BOT PAGE
// ============================================================

function BotPage() {
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 p-8 bg-[#F3F4F6] overflow-auto">
        <PageHeader 
          title="Automações" 
          subtitle="Configure bots e respostas automáticas"
        />
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <BotConfig />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// MAIN LAYOUT COMPONENT
// ============================================================

export function MainLayout() {
  const { activeModule, setActiveModule } = useApp()

  const renderContent = () => {
    switch (activeModule) {
      case 'chat':
        return <ChatPage />
      case 'kanban':
        return <PipelinePage />
      case 'leads':
        return <LeadsPage />
      case 'bot':
        return <BotPage />
      case 'dashboard':
        return <DashboardPage />
      default:
        return <ChatPage />
    }
  }

  return (
    <div className="flex h-screen bg-[#F3F4F6]">
      {/* Sidebar */}
      <Sidebar 
        currentView={activeModule} 
        onNavigate={(view) => setActiveModule(view as typeof activeModule)} 
      />
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden">
        {renderContent()}
      </main>
    </div>
  )
}
