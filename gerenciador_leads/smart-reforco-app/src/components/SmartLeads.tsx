/**
 * ============================================================
 * SmartLeads - Enterprise SaaS Style Table
 * White card container, gray header, spaced rows
 * ============================================================
 */

import { useState, useEffect } from 'react'
import { 
  Search, Download, Upload, Plus, MoreHorizontal,
  Phone, MessageSquare, ChevronLeft, ChevronRight, 
  Users
} from 'lucide-react'
import { supabase, getAllLeads as fetchAllLeads } from '../lib/supabase'
import type { Lead } from '../lib/supabase'
import { useApp } from '../context/AppContext'

// ============================================================
// TYPES
// ============================================================

interface Lote {
  id: number
  nome: string
}

// ============================================================
// STATUS BADGE
// ============================================================

function StatusBadge({ status }: { status?: string }) {
  const getStyles = () => {
    switch (status?.toLowerCase()) {
      case 'novo':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'em contato':
      case 'em_contato':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      case 'negociando':
        return 'bg-purple-50 text-purple-700 border-purple-200'
      case 'fechado':
      case 'ganho':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'perdido':
        return 'bg-red-50 text-red-700 border-red-200'
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200'
    }
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStyles()}`}>
      {status || 'Novo'}
    </span>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function SmartLeads() {
  const { selectLead, setActiveModule } = useApp()
  const [leads, setLeads] = useState<Lead[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [cidades, setCidades] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLoteId, setSelectedLoteId] = useState<number | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [selectedCidade, setSelectedCidade] = useState<string | null>(null)
  const [hideSent, setHideSent] = useState(false) // Esconder leads já enviados (que têm lote_id)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedLeads, setSelectedLeads] = useState<Set<string | number>>(new Set())
  
  const itemsPerPage = 20

  // Load data
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)

      // Load lotes
      const { data: lotesData } = await supabase
        .from('lotes')
        .select('*')
        .order('data_criacao', { ascending: false })
      
      if (lotesData) setLotes(lotesData)

      // Load ALL leads using batch function to bypass 1000 limit
      try {
        if (selectedLoteId || selectedStatus || selectedCidade || hideSent) {
          // If filtering, use direct query
          let query = supabase
            .from('leads')
            .select('*')
            .order('data_criacao', { ascending: false })

          if (selectedLoteId) {
            query = query.eq('lote_id', selectedLoteId)
          }
          
          if (selectedStatus) {
            query = query.eq('status', selectedStatus)
          }

          if (selectedCidade) {
            query = query.eq('cidade', selectedCidade)
          }

          // Esconder leads que já foram enviados (têm lote_id)
          if (hideSent) {
            query = query.is('lote_id', null)
          }

          const { data: leadsData, error } = await query
          if (error) throw error
          setLeads(leadsData || [])
        } else {
          // No filters - load ALL leads
          const { data: allLeadsData } = await fetchAllLeads()
          setLeads(allLeadsData || [])
        }
      } catch (error) {
        console.error('Error loading leads:', error)
        setLeads([])
      }

      // Load unique cities for filter
      const { data: cidadesData } = await supabase
        .from('leads')
        .select('cidade')
        .not('cidade', 'is', null)
        .not('cidade', 'eq', '')
      
      if (cidadesData) {
        const uniqueCidades = [...new Set(cidadesData.map(l => l.cidade).filter(Boolean))] as string[]
        setCidades(uniqueCidades.sort())
      }

      setIsLoading(false)
    }

    loadData()
  }, [selectedLoteId, selectedStatus, selectedCidade, hideSent])

  // Filter leads
  const filteredLeads = leads.filter(lead => {
    const searchLower = searchTerm.toLowerCase()
    return (
      lead.nome?.toLowerCase().includes(searchLower) ||
      lead.telefone?.includes(searchTerm) ||
      lead.cidade?.toLowerCase().includes(searchLower) ||
      lead.email?.toLowerCase().includes(searchLower)
    )
  })

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / itemsPerPage)
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // Toggle lead selection
  const toggleLeadSelection = (leadId: string | number) => {
    setSelectedLeads(prev => {
      const next = new Set(prev)
      if (next.has(leadId)) {
        next.delete(leadId)
      } else {
        next.add(leadId)
      }
      return next
    })
  }

  // Toggle all
  const toggleAllLeads = () => {
    if (selectedLeads.size === paginatedLeads.length) {
      setSelectedLeads(new Set())
    } else {
      setSelectedLeads(new Set(paginatedLeads.map(l => l.id)))
    }
  }

  // Open chat
  const openChat = (lead: Lead) => {
    selectLead(lead)
    setActiveModule('chat')
  }

  // Export CSV
  const exportCSV = () => {
    const headers = ['Nome', 'Telefone', 'Cidade', 'Status', 'Email']
    const rows = filteredLeads.map(lead => [
      lead.nome || '',
      lead.telefone || '',
      lead.cidade || '',
      lead.status || '',
      lead.email || ''
    ])
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `leads_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Leads</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filteredLeads.length} leads encontrados
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            className="h-10 px-4 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
          <button className="h-10 px-4 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Importar
          </button>
          <button className="h-10 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Novo Lead
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, telefone, cidade..."
              className="w-full h-10 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Lote Filter */}
          <select
            value={selectedLoteId || ''}
            onChange={(e) => setSelectedLoteId(e.target.value ? Number(e.target.value) : null)}
            className="h-10 px-4 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todos os lotes</option>
            {lotes.map(lote => (
              <option key={lote.id} value={lote.id}>{lote.nome}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus || ''}
            onChange={(e) => setSelectedStatus(e.target.value || null)}
            className="h-10 px-4 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todos os status</option>
            <option value="Novo">Novo</option>
            <option value="Em Contato">Em Contato</option>
            <option value="Negociando">Negociando</option>
            <option value="Fechado">Fechado</option>
            <option value="Perdido">Perdido</option>
          </select>

          {/* Cidade Filter */}
          <select
            value={selectedCidade || ''}
            onChange={(e) => setSelectedCidade(e.target.value || null)}
            className="h-10 px-4 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todas as cidades</option>
            {cidades.map(cidade => (
              <option key={cidade} value={cidade}>{cidade}</option>
            ))}
          </select>

          {/* Hide Sent Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hideSent}
              onChange={(e) => setHideSent(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Esconder já enviados</span>
          </label>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-sm text-gray-500">Carregando leads...</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhum lead encontrado</h3>
            <p className="text-sm text-gray-500">Importe um CSV ou adicione leads manualmente.</p>
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                {/* Header */}
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-12 px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedLeads.size === paginatedLeads.length && paginatedLeads.length > 0}
                        onChange={toggleAllLeads}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Nome
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Telefone
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Cidade
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Data
                    </th>
                    <th className="w-32 px-4 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Ações
                    </th>
                  </tr>
                </thead>

                {/* Body */}
                <tbody className="divide-y divide-gray-100">
                  {paginatedLeads.map((lead) => (
                    <tr 
                      key={lead.id} 
                      className="hover:bg-gray-50 transition-colors"
                      style={{ minHeight: '60px' }}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedLeads.has(lead.id)}
                          onChange={() => toggleLeadSelection(lead.id)}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                            {lead.nome?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {lead.nome || 'Sem nome'}
                            </p>
                            {lead.email && (
                              <p className="text-xs text-gray-500">{lead.email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-700">{lead.telefone}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-500">{lead.cidade || '-'}</span>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={lead.status} />
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-500">
                          {lead.data_criacao 
                            ? new Date(lead.data_criacao).toLocaleDateString('pt-BR')
                            : '-'
                          }
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openChat(lead)}
                            className="p-2 rounded-lg hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 transition-colors"
                            title="Abrir Chat"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 rounded-lg hover:bg-green-50 text-gray-500 hover:text-green-600 transition-colors"
                            title="Ligar"
                          >
                            <Phone className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                            title="Mais opções"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredLeads.length)} de {filteredLeads.length} resultados
              </p>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1
                    if (totalPages > 5) {
                      if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === pageNum
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
