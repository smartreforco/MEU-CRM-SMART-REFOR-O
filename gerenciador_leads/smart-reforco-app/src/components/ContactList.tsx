/**
 * ============================================================
 * ContactList - Enterprise SaaS Style
 * Com separação: Conversas Gerais vs Contatos do Lote
 * Com envio em massa e excluir chat
 * ============================================================
 */

import { useState, useEffect } from 'react'
import { Search, Filter, Plus, ChevronDown, RefreshCw, Users, Inbox, Trash2, Send, X, CheckSquare, Square, MoreHorizontal } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import type { Lead } from '../lib/supabase'

interface Lote {
  id: number
  nome: string
  leads_count?: number
}

interface Template {
  id: number
  name: string
  components?: {
    message?: string
  }
}

type TabType = 'conversas' | 'lote'

export function ContactList() {
  const { selectedLead, selectLead } = useApp()
  const [activeTab, setActiveTab] = useState<TabType>('conversas')
  const [conversasLeads, setConversasLeads] = useState<Lead[]>([]) // Leads com mensagens
  const [loteLeads, setLoteLeads] = useState<Lead[]>([]) // Leads do lote ativo
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loteAtivo, setLoteAtivo] = useState<Lote | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLoteId, setSelectedLoteId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  
  // Estados para envio em massa
  const [showMassModal, setShowMassModal] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [isSendingMass, setIsSendingMass] = useState(false)
  const [massProgress, setMassProgress] = useState({ sent: 0, total: 0 })
  
  // Estados para seleção múltipla
  const [selectedContacts, setSelectedContacts] = useState<Set<number | string>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [showBulkActions, setShowBulkActions] = useState(false)

  // Load lotes
  useEffect(() => {
    async function loadLotes() {
      try {
        const { data: lotesData } = await supabase
          .from('lotes')
          .select('*')
          .order('data_criacao', { ascending: false })
        
        if (lotesData) {
          const lotesComContagem = await Promise.all(
            lotesData.map(async (lote) => {
              const { count } = await supabase
                .from('leads')
                .select('id', { count: 'exact', head: true })
                .eq('lote_id', lote.id)
                .eq('arquivado', false)
              
              return { ...lote, leads_count: count || 0 }
            })
          )
          setLotes(lotesComContagem)
          
          // Definir lote ativo (o mais recente com status ativo)
          const ativo = lotesData.find(l => l.status === 'ativo') || lotesData[0]
          if (ativo) {
            setLoteAtivo(ativo)
            setSelectedLoteId(ativo.id)
          }
        }
      } catch (error) {
        console.error('Error loading lotes:', error)
      }
    }
    loadLotes()
  }, [])

  // Load conversas (leads que tem mensagens ou interação)
  const loadConversas = async () => {
    try {
      // Buscar telefones únicos da tabela mensagens
      const { data: mensagens, error: msgError } = await supabase
        .from('mensagens')
        .select('telefone, conteudo, created_at, direcao')
        .order('created_at', { ascending: false })
      
      console.log('📨 Mensagens encontradas:', mensagens?.length || 0, 'Erro:', msgError)
      
      if (mensagens && mensagens.length > 0) {
        // ============================================================
        // NORMALIZAR TELEFONES - Agrupar com/sem código 55
        // ============================================================
        const normalizarTelefone = (tel: string): string => {
          // Remove 55 do início se tiver (código do Brasil)
          if (tel.startsWith('55') && tel.length > 11) {
            return tel.slice(2)
          }
          return tel
        }
        
        // Criar mapa de telefones normalizados -> telefone original (preferir com 55)
        const telefoneMap = new Map<string, string>()
        for (const m of mensagens) {
          const normalizado = normalizarTelefone(m.telefone)
          // Se ainda não tem, ou se o atual tem 55 (preferir versão com código)
          if (!telefoneMap.has(normalizado) || m.telefone.startsWith('55')) {
            telefoneMap.set(normalizado, m.telefone)
          }
        }
        
        const telefonesUnicos = [...telefoneMap.values()]
        console.log('📞 Telefones únicos (normalizados):', telefonesUnicos)
        
        // Buscar leads que correspondem a esses telefones (com e sem 55)
        const telefonesParaBuscar = [...new Set([
          ...telefonesUnicos,
          ...telefonesUnicos.map(t => t.startsWith('55') ? t.slice(2) : '55' + t)
        ])]
        
        const { data: leadsExistentes } = await supabase
          .from('leads')
          .select('*')
          .in('telefone', telefonesParaBuscar)
          .eq('arquivado', false)
        
        console.log('👥 Leads existentes:', leadsExistentes?.length || 0)
        
        // Criar mapa de leads por telefone normalizado
        const leadsMap = new Map<string, Lead>()
        for (const lead of (leadsExistentes || []) as Lead[]) {
          if (!lead.telefone) continue
          const normalizado = normalizarTelefone(lead.telefone)
          if (!leadsMap.has(normalizado)) {
            leadsMap.set(normalizado, lead)
          }
        }
        
        // Para cada telefone único normalizado, usar lead existente ou criar "virtual"
        const conversasCompletas: Lead[] = telefonesUnicos.map((telefone, index) => {
          const normalizado = normalizarTelefone(telefone)
          const leadExistente = leadsMap.get(normalizado)
          
          if (leadExistente) {
            return {
              ...leadExistente,
              telefone: telefone // Usar telefone com 55 se disponível
            }
          }
          
          // Criar lead "virtual" para conversas sem cadastro
          const ultimaMensagem = mensagens.find(m => 
            normalizarTelefone(m.telefone) === normalizado
          )
          return {
            id: -(index + 1) * 1000 - Date.now() % 1000, // ID único negativo
            nome: `+${telefone}`,
            telefone: telefone,
            email: null,
            status: 'novo',
            cidade: null,
            estado: null,
            origem: 'WhatsApp',
            interesse: null,
            observacoes: null,
            prioridade: 'media',
            data_criacao: ultimaMensagem?.created_at || new Date().toISOString(),
            data_atualizacao: null,
            ultimo_contato: null,
            proximo_contato: null,
            responsavel: null,
            valor_potencial: null,
            tags: null,
            fonte_arquivo: null,
            empresa: null,
            cargo: null,
            whatsapp_status: 'none',
            arquivado: false,
            lote_id: null,
            data_arquivado: null,
          } as Lead
        })
        
        console.log('✅ Conversas totais:', conversasCompletas.length)
        setConversasLeads(conversasCompletas)
      } else {
        console.log('⚠️ Nenhuma mensagem na tabela')
        setConversasLeads([])
      }
    } catch (error) {
      console.error('Error loading conversas:', error)
      setConversasLeads([])
    }
  }

  // Load leads do lote
  const loadLoteLeads = async () => {
    if (!selectedLoteId) {
      setLoteLeads([])
      return
    }
    
    try {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('lote_id', selectedLoteId)
        .eq('arquivado', false)
        .order('data_criacao', { ascending: false })
      
      setLoteLeads(data || [])
    } catch (error) {
      console.error('Error loading lote leads:', error)
      setLoteLeads([])
    }
  }

  // Carregar dados
  const loadAll = async () => {
    setIsLoading(true)
    await Promise.all([loadConversas(), loadLoteLeads()])
    setIsLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [selectedLoteId])

  // Leads atuais baseado na aba
  const currentLeads = activeTab === 'conversas' ? conversasLeads : loteLeads

  // Filter leads by search
  const filteredLeads = currentLeads.filter(lead => {
    const searchLower = searchTerm.toLowerCase()
    return (
      lead.nome?.toLowerCase().includes(searchLower) ||
      lead.telefone?.includes(searchTerm) ||
      lead.cidade?.toLowerCase().includes(searchLower)
    )
  })

  // Get status badge style
  const getStatusBadge = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'novo':
        return 'bg-blue-50 text-blue-700 border-blue-100'
      case 'em contato':
        return 'bg-yellow-50 text-yellow-700 border-yellow-100'
      case 'negociando':
        return 'bg-purple-50 text-purple-700 border-purple-100'
      case 'fechado':
        return 'bg-green-50 text-green-700 border-green-100'
      case 'perdido':
        return 'bg-red-50 text-red-700 border-red-100'
      default:
        return 'bg-gray-50 text-gray-600 border-gray-100'
    }
  }

  // Excluir chat (mensagens de um número)
  const handleDeleteChat = async (telefone: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!confirm(`Tem certeza que deseja excluir todas as mensagens de ${telefone}?`)) {
      return
    }
    
    try {
      // Normalizar telefone para buscar variantes
      const telLimpo = telefone.replace(/\D/g, '')
      const variantes = [telLimpo]
      if (telLimpo.startsWith('55')) {
        variantes.push(telLimpo.slice(2))
      } else {
        variantes.push('55' + telLimpo)
      }
      
      const { error } = await supabase
        .from('mensagens')
        .delete()
        .in('telefone', variantes)
      
      if (error) throw error
      
      // Recarregar conversas
      loadConversas()
      
      // Se era o lead selecionado, deselecionar
      if (selectedLead?.telefone === telefone) {
        selectLead(null)
      }
    } catch (error) {
      console.error('Erro ao excluir chat:', error)
      alert('Erro ao excluir chat')
    }
  }

  // Carregar templates para envio em massa
  const loadTemplates = async () => {
    const { data } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (data) setTemplates(data)
  }

  // Abrir modal de envio em massa
  const openMassModal = async () => {
    await loadTemplates()
    setShowMassModal(true)
  }

  // Enviar template em massa para o lote
  const handleMassSend = async () => {
    if (!selectedLoteId || !selectedTemplateId) {
      alert('Selecione um template')
      return
    }
    
    const template = templates.find(t => t.id === selectedTemplateId)
    if (!template) return
    
    setIsSendingMass(true)
    setMassProgress({ sent: 0, total: loteLeads.length })
    
    try {
      for (let i = 0; i < loteLeads.length; i++) {
        const lead = loteLeads[i]
        
        // Verificar se telefone existe
        if (!lead.telefone) continue
        
        // Enviar via Edge Function
        await fetch('https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec'
          },
          body: JSON.stringify({
            to: lead.telefone.replace(/\D/g, ''),
            type: 'text',
            content: template.components?.message || template.name,
            sendType: 'text'
          })
        })
        
        // Atualizar status do lead para "Em Contato"
        await supabase
          .from('leads')
          .update({ status: 'Em Contato', ultimo_contato: new Date().toISOString() })
          .eq('id', lead.id)
        
        setMassProgress({ sent: i + 1, total: loteLeads.length })
        
        // Delay de 1s entre envios para não sobrecarregar
        if (i < loteLeads.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
      
      alert(`✅ Enviado para ${loteLeads.length} contatos!`)
      setShowMassModal(false)
      loadLoteLeads() // Recarregar para atualizar status
    } catch (error) {
      console.error('Erro no envio em massa:', error)
      alert('Erro ao enviar')
    } finally {
      setIsSendingMass(false)
      setMassProgress({ sent: 0, total: 0 })
    }
  }

  // ============================================================
  // SELEÇÃO MÚLTIPLA E AÇÕES EM MASSA
  // ============================================================
  
  // Toggle seleção de um contato
  const toggleContactSelection = (leadId: number | string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedContacts(prev => {
      const next = new Set(prev)
      if (next.has(leadId)) {
        next.delete(leadId)
      } else {
        next.add(leadId)
      }
      return next
    })
  }

  // Selecionar todos os contatos visíveis
  const selectAllContacts = () => {
    if (selectedContacts.size === filteredLeads.length) {
      setSelectedContacts(new Set())
    } else {
      setSelectedContacts(new Set(filteredLeads.map(l => l.id)))
    }
  }

  // Limpar seleção e sair do modo
  const clearSelection = () => {
    setSelectedContacts(new Set())
    setIsSelectionMode(false)
    setShowBulkActions(false)
  }

  // Alterar status em massa
  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedContacts.size === 0) return
    
    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus, ultimo_contato: new Date().toISOString() })
        .in('id', Array.from(selectedContacts))
      
      if (error) throw error
      
      alert(`✅ Status de ${selectedContacts.size} contatos alterado para "${newStatus}"!`)
      clearSelection()
      loadAll()
    } catch (error) {
      console.error('Erro ao alterar status:', error)
      alert('Erro ao alterar status')
    }
  }

  // Excluir contatos em massa
  const handleBulkDelete = async () => {
    if (selectedContacts.size === 0) return
    
    if (!confirm(`Tem certeza que deseja excluir ${selectedContacts.size} contatos?`)) {
      return
    }
    
    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .in('id', Array.from(selectedContacts))
      
      if (error) throw error
      
      alert(`✅ ${selectedContacts.size} contatos excluídos!`)
      clearSelection()
      loadAll()
    } catch (error) {
      console.error('Erro ao excluir contatos:', error)
      alert('Erro ao excluir')
    }
  }

  // Arquivar contatos em massa
  const handleBulkArchive = async () => {
    if (selectedContacts.size === 0) return
    
    try {
      const { error } = await supabase
        .from('leads')
        .update({ arquivado: true })
        .in('id', Array.from(selectedContacts))
      
      if (error) throw error
      
      alert(`✅ ${selectedContacts.size} contatos arquivados!`)
      clearSelection()
      loadAll()
    } catch (error) {
      console.error('Erro ao arquivar:', error)
      alert('Erro ao arquivar')
    }
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        {/* Barra de ações em massa quando há seleção */}
        {isSelectionMode && selectedContacts.size > 0 ? (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={clearSelection}
                  className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200"
                  title="Cancelar seleção"
                >
                  <X className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium text-gray-900">
                  {selectedContacts.size} selecionado{selectedContacts.size > 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={selectAllContacts}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                {selectedContacts.size === filteredLeads.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
            
            {/* Ações em massa */}
            <div className="flex flex-wrap gap-2">
              {/* Dropdown de Status */}
              <div className="relative">
                <button
                  onClick={() => setShowBulkActions(!showBulkActions)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                  <span>Alterar Status</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                
                {showBulkActions && (
                  <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
                    {['Novo', 'Em Contato', 'Negociando', 'Fechado', 'Perdido'].map(status => (
                      <button
                        key={status}
                        onClick={() => {
                          handleBulkStatusChange(status)
                          setShowBulkActions(false)
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleBulkArchive}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 text-white text-xs font-medium rounded-lg hover:bg-yellow-600 transition-colors"
              >
                <Inbox className="w-3.5 h-3.5" />
                <span>Arquivar</span>
              </button>

              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Contatos</h2>
              <p className="text-xs text-gray-500">{filteredLeads.length} contatos</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Botão ativar modo seleção */}
              <button 
                onClick={() => setIsSelectionMode(!isSelectionMode)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isSelectionMode 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Selecionar múltiplos"
              >
                <CheckSquare className="w-4 h-4" />
              </button>
              <button 
                onClick={loadAll}
                disabled={isLoading}
                className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors disabled:opacity-50"
                title="Atualizar lista"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tabs - Conversas vs Lote */}
        <div className="flex bg-gray-100 rounded-lg p-1 mb-3">
          <button
            onClick={() => setActiveTab('conversas')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              activeTab === 'conversas'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Conversas</span>
            {conversasLeads.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === 'conversas' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-600'
              }`}>
                {conversasLeads.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('lote')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              activeTab === 'lote'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Lote</span>
            {loteLeads.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === 'lote' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-600'
              }`}>
                {loteLeads.length}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full h-10 pl-9 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
        </div>

        {/* Filters Toggle - só aparece na aba Lote */}
        {activeTab === 'lote' && (
          <>
            <div className="flex items-center justify-between mt-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Selecionar lote</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
              
              {/* Botão Envio em Massa */}
              <button
                onClick={openMassModal}
                disabled={loteLeads.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar em Massa</span>
              </button>
            </div>

            {showFilters && (
              <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                <select
                  value={selectedLoteId || ''}
                  onChange={(e) => setSelectedLoteId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-9 px-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {lotes.map(lote => (
                    <option key={lote.id} value={lote.id}>
                      {lote.nome} ({lote.leads_count || 0} leads)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">Carregando contatos...</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              {activeTab === 'conversas' ? (
                <Inbox className="w-6 h-6 text-gray-400" />
              ) : (
                <Users className="w-6 h-6 text-gray-400" />
              )}
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              {activeTab === 'conversas' ? 'Nenhuma conversa' : 'Nenhum lead no lote'}
            </p>
            <p className="text-xs text-gray-500">
              {activeTab === 'conversas' 
                ? 'As conversas aparecerão aqui quando houver mensagens'
                : 'Selecione um lote ou importe leads'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredLeads.map((lead, index) => {
              const isSelected = selectedLead?.id === lead.id
              const hasUnread = lead.unread_count && lead.unread_count > 0
              
              // Usar combinação de id + telefone + index para key única
              const uniqueKey = `${lead.id}-${lead.telefone}-${index}`
              const isChecked = selectedContacts.has(lead.id)
              
              return (
                <div
                  key={uniqueKey}
                  onClick={() => {
                    if (isSelectionMode) {
                      toggleContactSelection(lead.id, { stopPropagation: () => {} } as React.MouseEvent)
                    } else {
                      selectLead(lead)
                    }
                  }}
                  className={`group w-full flex items-center gap-3 p-3 text-left transition-all hover:bg-gray-50 cursor-pointer ${
                    isSelected && !isSelectionMode ? 'bg-indigo-50 border-l-3 border-l-indigo-600' : ''
                  } ${isChecked ? 'bg-indigo-50' : ''}`}
                >
                  {/* Checkbox quando em modo seleção */}
                  {isSelectionMode && (
                    <button
                      onClick={(e) => toggleContactSelection(lead.id, e)}
                      className="flex-shrink-0"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-5 h-5 text-indigo-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  )}
                  
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm ${
                    isSelected || isChecked
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600' 
                      : 'bg-gradient-to-br from-gray-400 to-gray-500'
                  }`}>
                    {lead.nome?.charAt(0)?.toUpperCase() || '?'}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`font-medium truncate text-sm ${
                        isSelected ? 'text-indigo-900' : 'text-gray-900'
                      }`}>
                        {lead.nome || 'Sem nome'}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        {hasUnread && (
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-medium">
                            {lead.unread_count}
                          </span>
                        )}
                        {/* Botão excluir chat */}
                        {!isSelectionMode && lead.telefone && (
                          <button
                            onClick={(e) => handleDeleteChat(lead.telefone!, e)}
                            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                            title="Excluir conversa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-500 truncate">
                      {lead.telefone}
                    </div>

                    {/* Status & City */}
                    <div className="flex items-center gap-2 mt-1">
                      {lead.status && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${getStatusBadge(lead.status)}`}>
                          {lead.status}
                        </span>
                      )}
                      {lead.cidade && (
                        <span className="text-[10px] text-gray-400 truncate">{lead.cidade}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="p-3 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            {activeTab === 'conversas' ? 'Conversas ativas' : `Lote: ${loteAtivo?.nome || 'Nenhum'}`}
          </span>
          <span className="font-semibold text-gray-700">{filteredLeads.length}</span>
        </div>
      </div>

      {/* Modal Envio em Massa */}
      {showMassModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header do Modal */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Envio em Massa</h3>
                <p className="text-sm text-gray-500">Enviar para {loteLeads.length} contatos do lote</p>
              </div>
              <button
                onClick={() => setShowMassModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Corpo do Modal */}
            <div className="p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Selecione o Template
              </label>
              <select
                value={selectedTemplateId ?? ''}
                onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
                className="w-full h-11 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={isSendingMass}
              >
                <option value="">Escolha um template...</option>
                {templates.map(tpl => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>

              {/* Progresso */}
              {isSendingMass && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-600">Enviando...</span>
                    <span className="font-medium text-indigo-600">
                      {massProgress.sent} / {massProgress.total}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                      style={{ width: `${(massProgress.sent / massProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800">
                  ⚠️ O envio será feito com intervalo de 1 segundo entre cada mensagem para evitar bloqueios.
                </p>
              </div>
            </div>

            {/* Footer do Modal */}
            <div className="flex items-center gap-3 p-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setShowMassModal(false)}
                disabled={isSendingMass}
                className="flex-1 h-11 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleMassSend}
                disabled={!selectedTemplateId || isSendingMass}
                className="flex-1 h-11 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSendingMass ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Iniciar Envio</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
