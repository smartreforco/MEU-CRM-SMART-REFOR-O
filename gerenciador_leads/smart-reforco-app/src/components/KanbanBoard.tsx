/**
 * ============================================================
 * KanbanBoard - Enterprise SaaS Style
 * Gray page background, white cards, clean design
 * Mostra APENAS leads de lotes (não conversas gerais)
 * ============================================================
 */

import { useState, useEffect } from 'react'
import { 
  Plus, MoreHorizontal, MessageSquare, Phone,
  MapPin, GripVertical, Check, X, ChevronDown
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lead } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { ChatModal } from './ChatModal'

// ============================================================
// TYPES
// ============================================================

interface Column {
  id: string
  title: string
  color: string
  bgColor: string
  borderColor: string
}

interface Lote {
  id: number
  nome: string
  status?: string
}

// ============================================================
// DEFAULT COLUMNS CONFIG
// ============================================================

const defaultColumns: Column[] = [
  { 
    id: 'novo', 
    title: 'Novo', 
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200'
  },
  { 
    id: 'em_contato', 
    title: 'Em Contato', 
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200'
  },
  { 
    id: 'negociando', 
    title: 'Negociando', 
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200'
  },
  { 
    id: 'fechado', 
    title: 'Fechado', 
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200'
  },
  { 
    id: 'perdido', 
    title: 'Perdido', 
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200'
  },
]

// ============================================================
// LEAD CARD COMPONENT
// ============================================================

interface LeadCardProps {
  lead: Lead
  onOpenChat: (lead: Lead) => void
  onDragStart: (e: React.DragEvent, lead: Lead) => void
}

function LeadCard({ lead, onOpenChat, onDragStart }: LeadCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group"
    >
      {/* Drag Handle */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
            {lead.nome?.charAt(0)?.toUpperCase() || '?'}
          </div>
        </div>
        <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Name */}
      <h4 className="font-medium text-gray-900 text-sm mb-1 truncate">
        {lead.nome || 'Sem nome'}
      </h4>

      {/* Phone */}
      <p className="text-sm text-gray-500 mb-3">{lead.telefone}</p>

      {/* Meta Info */}
      {lead.cidade && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
          <MapPin className="w-3.5 h-3.5" />
          <span>{lead.cidade}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        <button
          onClick={() => onOpenChat(lead)}
          className="flex-1 h-8 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1.5"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </button>
        <button className="w-8 h-8 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center">
          <Phone className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ============================================================
// KANBAN COLUMN COMPONENT
// ============================================================

interface KanbanColumnProps {
  column: Column
  leads: Lead[]
  onOpenChat: (lead: Lead) => void
  onDragStart: (e: React.DragEvent, lead: Lead) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, columnId: string) => void
  onEditTitle: (columnId: string, newTitle: string) => void
  isEditingTitle: string | null
  setIsEditingTitle: (id: string | null) => void
  editTitleValue: string
  setEditTitleValue: (value: string) => void
}

function KanbanColumn({ 
  column, 
  leads, 
  onOpenChat, 
  onDragStart, 
  onDragOver, 
  onDrop,
  onEditTitle,
  isEditingTitle,
  setIsEditingTitle,
  editTitleValue,
  setEditTitleValue
}: KanbanColumnProps) {
  return (
    <div
      className="flex-shrink-0 w-[300px] flex flex-col"
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, column.id)}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${column.bgColor} border-2 ${column.borderColor}`} />
          {isEditingTitle === column.id ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                className="px-2 py-0.5 text-sm font-semibold border rounded w-24"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onEditTitle(column.id, editTitleValue)
                  if (e.key === 'Escape') setIsEditingTitle(null)
                }}
              />
              <button onClick={() => onEditTitle(column.id, editTitleValue)} className="p-1 hover:bg-green-100 rounded">
                <Check className="w-3 h-3 text-green-600" />
              </button>
              <button onClick={() => setIsEditingTitle(null)} className="p-1 hover:bg-red-100 rounded">
                <X className="w-3 h-3 text-red-600" />
              </button>
            </div>
          ) : (
            <h3 
              className={`font-semibold text-sm ${column.color} cursor-pointer hover:underline`}
              onClick={() => {
                setEditTitleValue(column.title)
                setIsEditingTitle(column.id)
              }}
              title="Clique para editar"
            >
              {column.title}
            </h3>
          )}
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
            {leads.length}
          </span>
        </div>
        <button className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Cards Container */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-4 pr-2 min-h-[200px]">
        {leads.length === 0 ? (
          <div className="h-32 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
            <p className="text-sm text-gray-400">Arraste leads aqui</p>
          </div>
        ) : (
          leads.map((lead) => (
            <LeadCard 
              key={lead.id} 
              lead={lead} 
              onOpenChat={onOpenChat}
              onDragStart={onDragStart}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================
// MAIN KANBAN COMPONENT
// ============================================================

export function KanbanBoard() {
  const { selectLead, setActiveModule } = useApp()
  const [leads, setLeads] = useState<Lead[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [selectedLoteId, setSelectedLoteId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null)
  const [chatModalLead, setChatModalLead] = useState<Lead | null>(null)
  const [showLoteDropdown, setShowLoteDropdown] = useState(false)
  
  // Edição de colunas
  const [columns, setColumns] = useState<Column[]>(defaultColumns)
  const [isEditingTitle, setIsEditingTitle] = useState<string | null>(null)
  const [editTitleValue, setEditTitleValue] = useState('')

  // Load lotes
  useEffect(() => {
    async function loadLotes() {
      const { data } = await supabase
        .from('lotes')
        .select('*')
        .order('data_criacao', { ascending: false })
      
      if (data) {
        setLotes(data)
        // Se tem lotes, selecionar o primeiro ativo por padrão
        const ativo = data.find(l => l.status === 'ativo') || data[0]
        if (ativo && !selectedLoteId) {
          setSelectedLoteId(ativo.id)
        }
      }
    }
    loadLotes()
  }, [])

  // Load leads do lote selecionado + conversas manuais
  useEffect(() => {
    async function loadLeads() {
      setIsLoading(true)
      
      try {
        let allLeads: Lead[] = []
        
        // 1. Carregar leads do lote selecionado (se houver)
        if (selectedLoteId) {
          const { data: loteLeads } = await supabase
            .from('leads')
            .select('*')
            .eq('lote_id', selectedLoteId)
            .eq('arquivado', false)
            .order('data_criacao', { ascending: false })
          
          if (loteLeads) {
            allLeads = [...loteLeads]
          }
        }
        
        // 2. Buscar telefones que têm mensagens (conversas manuais)
        const { data: mensagens } = await supabase
          .from('mensagens')
          .select('telefone')
          .order('created_at', { ascending: false })
        
        if (mensagens && mensagens.length > 0) {
          // Pegar telefones únicos
          const telefonesComMensagens = [...new Set(mensagens.map(m => m.telefone?.replace(/\D/g, '')).filter(Boolean))]
          
          // Buscar leads que têm esses telefones mas NÃO estão em um lote
          // Ou seja, conversas iniciadas manualmente
          for (const tel of telefonesComMensagens) {
            // Normalizar para buscar
            const variants = [tel]
            if (tel.startsWith('55')) variants.push(tel.slice(2))
            else variants.push('55' + tel)
            
            // Verificar se já não temos esse lead na lista
            const jaExiste = allLeads.some(l => {
              const lTel = l.telefone?.replace(/\D/g, '')
              return variants.includes(lTel)
            })
            
            if (!jaExiste) {
              // Buscar no banco de leads
              const { data: leadData } = await supabase
                .from('leads')
                .select('*')
                .in('telefone', variants.map(v => v.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '+$1 ($2) $3-$4')).concat(variants))
                .eq('arquivado', false)
                .limit(1)
              
              if (leadData && leadData.length > 0) {
                // Lead existe no banco, adicionar se não tem lote
                if (!leadData[0].lote_id || leadData[0].lote_id === selectedLoteId) {
                  allLeads.push(leadData[0])
                }
              } else {
                // Criar lead virtual para conversa manual
                const { data: ultimaMensagem } = await supabase
                  .from('mensagens')
                  .select('*')
                  .in('telefone', variants)
                  .order('created_at', { ascending: false })
                  .limit(1)
                
                if (ultimaMensagem && ultimaMensagem.length > 0) {
                  allLeads.push({
                    id: Date.now() + Math.random(), // ID numérico único
                    nome: ultimaMensagem[0].nome_contato || tel,
                    telefone: tel,
                    status: 'Em Contato',
                    cidade: null,
                    estado: null,
                    email: null,
                    origem: 'whatsapp',
                    interesse: null,
                    observacoes: null,
                    prioridade: 'media',
                    data_atualizacao: null,
                    ultimo_contato: null,
                    proximo_contato: null,
                    responsavel: null,
                    valor_potencial: null,
                    tags: null,
                    fonte_arquivo: null,
                    empresa: null,
                    cargo: null,
                    whatsapp_status: 'active',
                    arquivado: false,
                    lote_id: null,
                    data_criacao: ultimaMensagem[0].created_at,
                    data_arquivado: null
                  } as Lead)
                }
              }
            }
          }
        }
        
        setLeads(allLeads)
      } catch (error) {
        console.error('Error loading leads:', error)
        setLeads([])
      }
      
      setIsLoading(false)
    }

    loadLeads()
  }, [selectedLoteId])

  // Salvar título da coluna editada
  const handleEditTitle = (columnId: string, newTitle: string) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, title: newTitle } : col
    ))
    setIsEditingTitle(null)
    // Salvar no localStorage para persistir
    const updated = columns.map(col => 
      col.id === columnId ? { ...col, title: newTitle } : col
    )
    localStorage.setItem('kanban_columns', JSON.stringify(updated))
  }

  // Carregar colunas do localStorage
  useEffect(() => {
    const saved = localStorage.getItem('kanban_columns')
    if (saved) {
      try {
        setColumns(JSON.parse(saved))
      } catch (e) {
        console.error('Error parsing saved columns')
      }
    }
  }, [])

  // Group leads by status
  const getLeadsByStatus = (statusId: string) => {
    const statusMap: Record<string, string[]> = {
      'novo': ['novo', 'Novo', 'NOVO', null as unknown as string, undefined as unknown as string, ''],
      'em_contato': ['em_contato', 'Em Contato', 'em contato', 'EM CONTATO'],
      'negociando': ['negociando', 'Negociando', 'NEGOCIANDO'],
      'fechado': ['fechado', 'Fechado', 'FECHADO', 'ganho', 'Ganho'],
      'perdido': ['perdido', 'Perdido', 'PERDIDO'],
    }
    
    const validStatuses = statusMap[statusId] || []
    return leads.filter(lead => validStatuses.includes(lead.status || ''))
  }

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    
    if (!draggedLead) return

    // Map column ID to status name
    const statusMap: Record<string, string> = {
      'novo': 'Novo',
      'em_contato': 'Em Contato',
      'negociando': 'Negociando',
      'fechado': 'Fechado',
      'perdido': 'Perdido',
    }

    const newStatus = statusMap[columnId]

    // Update local state
    setLeads(prev => prev.map(lead => 
      lead.id === draggedLead.id ? { ...lead, status: newStatus } : lead
    ))

    // Update in database
    await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', draggedLead.id)

    setDraggedLead(null)
  }

  // Open chat
  const handleOpenChat = (lead: Lead) => {
    setChatModalLead(lead)
  }

  // Go to full chat
  const handleGoToFullChat = (lead: Lead) => {
    selectLead(lead)
    setActiveModule('chat')
    setChatModalLead(null)
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Carregando pipeline...</p>
        </div>
      </div>
    )
  }

  const selectedLote = lotes.find(l => l.id === selectedLoteId)

  return (
    <>
      {/* Header com seletor de lote */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Pipeline</h2>
          
          {/* Seletor de Lote */}
          <div className="relative">
            <button
              onClick={() => setShowLoteDropdown(!showLoteDropdown)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-700">
                {selectedLote?.nome || '📨 Conversas manuais'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            
            {showLoteDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="p-2">
                  <p className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">Lotes</p>
                  
                  {/* Opção: Só conversas manuais */}
                  <button
                    onClick={() => {
                      setSelectedLoteId(null)
                      setShowLoteDropdown(false)
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedLoteId === null 
                        ? 'bg-indigo-50 text-indigo-700' 
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    📨 Só conversas manuais
                  </button>
                  
                  <div className="border-t border-gray-100 my-1"></div>
                  
                  {lotes.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-500">Nenhum lote encontrado</p>
                  ) : (
                    lotes.map(lote => (
                      <button
                        key={lote.id}
                        onClick={() => {
                          setSelectedLoteId(lote.id)
                          setShowLoteDropdown(false)
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedLoteId === lote.id 
                            ? 'bg-indigo-50 text-indigo-700' 
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        {lote.nome}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <p className="text-sm text-gray-500">
          {leads.length} leads no lote • Clique no título da coluna para editar
        </p>
      </div>

      {/* Kanban Container */}
      <div className="h-full flex gap-6 overflow-x-auto pb-4">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            leads={getLeadsByStatus(column.id)}
            onOpenChat={handleOpenChat}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onEditTitle={handleEditTitle}
            isEditingTitle={isEditingTitle}
            setIsEditingTitle={setIsEditingTitle}
            editTitleValue={editTitleValue}
            setEditTitleValue={setEditTitleValue}
          />
        ))}
      </div>

      {/* Chat Modal */}
      {chatModalLead && (
        <ChatModal
          lead={chatModalLead}
          onClose={() => setChatModalLead(null)}
          onGoToFullChat={() => handleGoToFullChat(chatModalLead)}
        />
      )}
    </>
  )
}
