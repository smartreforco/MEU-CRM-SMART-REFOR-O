import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import { 
  type Lead, 
  type Lote,
  getAllLeads, 
  getLeadsDoLoteAtivo,
  getLeadsDisponiveis,
  getLotes,
  getLoteAtivo,
  criarLote,
  arquivarLote,
  arquivarLeads,
  searchLeads, 
  updateLeadStatus as apiUpdateLeadStatus 
} from '../lib/supabase'

interface AppState {
  // Leads disponíveis (sem lote) - para Smart Leads
  leadsDisponiveis: Lead[]
  // Leads do lote ativo - para Conversas e Kanban
  leadsDoLote: Lead[]
  // Lote ativo
  loteAtivo: Lote | null
  // Todos os lotes
  lotes: Lote[]
  // Lead selecionado
  selectedLead: Lead | null
  activeModule: 'chat' | 'kanban' | 'leads' | 'settings' | 'dashboard' | 'bot'
  isRightPanelOpen: boolean
  isLoading: boolean
  stats: {
    total: number
    disponiveis: number
    noLote: number
    novos: number
    contato: number
    negociacao: number
    convertidos: number
    perdidos: number
  }
}

interface AppContextType extends AppState {
  selectLead: (lead: Lead | null) => void
  setActiveModule: (module: AppState['activeModule']) => void
  toggleRightPanel: () => void
  refreshLeads: () => Promise<void>
  refreshLotes: () => Promise<void>
  updateLeadStatus: (id: number, status: string) => Promise<void>
  searchContacts: (term: string) => Promise<void>
  criarNovoLote: (nome: string, leadIds: number[], descricao?: string) => Promise<Lote>
  arquivarLoteAtual: (motivo: string) => Promise<void>
  arquivarLeadsSelecionados: (leadIds: number[], motivo: string) => Promise<void>
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    leadsDisponiveis: [],
    leadsDoLote: [],
    loteAtivo: null,
    lotes: [],
    selectedLead: null,
    activeModule: 'chat', // Começa nas Conversas
    isRightPanelOpen: false,
    isLoading: true,
    stats: { 
      total: 0, 
      disponiveis: 0,
      noLote: 0,
      novos: 0, 
      contato: 0, 
      negociacao: 0, 
      convertidos: 0, 
      perdidos: 0 
    }
  })

  // Carregar leads disponíveis (sem lote)
  const refreshLeads = async () => {
    setState(s => ({ ...s, isLoading: true }))
    try {
      // Carregar leads disponíveis
      const { data: disponiveis, count: totalDisponiveis } = await getLeadsDisponiveis()
      
      // Carregar leads do lote ativo
      const { data: doLote, lote } = await getLeadsDoLoteAtivo()
      
      // Carregar total geral
      const { count: totalGeral } = await getAllLeads()
      
      setState(s => ({
        ...s,
        leadsDisponiveis: disponiveis || [],
        leadsDoLote: doLote || [],
        loteAtivo: lote,
        isLoading: false,
        stats: {
          total: totalGeral || 0,
          disponiveis: totalDisponiveis || 0,
          noLote: doLote?.length || 0,
          novos: doLote?.filter(l => l.status === 'novo').length || 0,
          contato: doLote?.filter(l => l.status === 'contato').length || 0,
          negociacao: doLote?.filter(l => l.status === 'negociacao').length || 0,
          convertidos: doLote?.filter(l => l.status === 'convertido').length || 0,
          perdidos: doLote?.filter(l => l.status === 'perdido').length || 0,
        }
      }))
    } catch (error) {
      console.error('Erro ao carregar leads:', error)
      setState(s => ({ ...s, isLoading: false }))
    }
  }

  // Carregar lotes
  const refreshLotes = async () => {
    try {
      const lotes = await getLotes()
      const loteAtivo = await getLoteAtivo()
      setState(s => ({ ...s, lotes: lotes || [], loteAtivo }))
    } catch (error) {
      console.error('Erro ao carregar lotes:', error)
    }
  }

  const selectLead = (lead: Lead | null) => {
    setState(s => ({ ...s, selectedLead: lead, isRightPanelOpen: lead !== null }))
  }

  const setActiveModule = (module: AppState['activeModule']) => {
    setState(s => ({ ...s, activeModule: module }))
  }

  const toggleRightPanel = () => {
    setState(s => ({ ...s, isRightPanelOpen: !s.isRightPanelOpen }))
  }

  const updateLeadStatus = async (id: number, status: string) => {
    try {
      await apiUpdateLeadStatus(id, status)
      setState(s => ({
        ...s,
        leadsDoLote: s.leadsDoLote.map(l => l.id === id ? { ...l, status } : l),
        leadsDisponiveis: s.leadsDisponiveis.map(l => l.id === id ? { ...l, status } : l),
        selectedLead: s.selectedLead?.id === id ? { ...s.selectedLead, status } : s.selectedLead
      }))
    } catch (error) {
      console.error('Erro ao atualizar status:', error)
    }
  }

  const searchContacts = async (term: string) => {
    if (!term.trim()) {
      await refreshLeads()
      return
    }
    
    try {
      const data = await searchLeads(term)
      // Busca nos leads do lote
      setState(s => ({ ...s, leadsDoLote: data || [] }))
    } catch (error) {
      console.error('Erro na busca:', error)
    }
  }

  // Criar novo lote
  const criarNovoLote = async (nome: string, leadIds: number[], descricao?: string) => {
    const lote = await criarLote(nome, leadIds, descricao)
    await refreshLeads()
    await refreshLotes()
    return lote
  }

  // Arquivar lote atual
  const arquivarLoteAtual = async (motivo: string) => {
    if (!state.loteAtivo) throw new Error('Nenhum lote ativo')
    await arquivarLote(state.loteAtivo.id, motivo)
    await refreshLeads()
    await refreshLotes()
  }

  // Arquivar leads selecionados
  const arquivarLeadsSelecionados = async (leadIds: number[], motivo: string) => {
    await arquivarLeads(leadIds, motivo)
    await refreshLeads()
  }

  useEffect(() => {
    refreshLeads()
    refreshLotes()
  }, [])

  return (
    <AppContext.Provider value={{
      ...state,
      selectLead,
      setActiveModule,
      toggleRightPanel,
      refreshLeads,
      refreshLotes,
      updateLeadStatus,
      searchContacts,
      criarNovoLote,
      arquivarLoteAtual,
      arquivarLeadsSelecionados
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}
