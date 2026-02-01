/**
 * ============================================================
 * CRMRightPanel - Enterprise SaaS Style
 * Clean white panel with proper spacing
 * Com funcionalidade de salvar contato no Supabase
 * ============================================================
 */

import { useState, useEffect } from 'react'
import { 
  X, User, Phone, Mail, MapPin, Calendar, Tag, 
  MessageSquare, Edit3, ChevronDown, ChevronRight,
  Bot, FileText, Plus, Check, Save, UserPlus
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ============================================================
// TYPES
// ============================================================

interface Lead {
  id: number | string
  nome: string | null
  telefone: string | null
  email?: string | null
  cidade?: string | null
  status?: string
  data_criacao?: string
  notes?: string
  tags?: string | string[] | null
  [key: string]: unknown
}

interface CRMRightPanelProps {
  lead: Lead
  onClose: () => void
}

// ============================================================
// STATUS OPTIONS
// ============================================================

const statusOptions = [
  { value: 'Novo', label: 'Novo', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'Em Contato', label: 'Em Contato', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { value: 'Negociando', label: 'Negociando', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'Fechado', label: 'Fechado', color: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'Perdido', label: 'Perdido', color: 'bg-red-50 text-red-700 border-red-200' },
]

// ============================================================
// ACCORDION SECTION
// ============================================================

function AccordionSection({ 
  title, 
  icon: Icon,
  defaultOpen = true,
  children 
}: { 
  title: string
  icon: React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  children: React.ReactNode 
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">{title}</span>
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-6 pb-5">
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CRMRightPanel({ lead, onClose }: CRMRightPanelProps) {
  const [status, setStatus] = useState(lead.status || 'Novo')
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const [botEnabled, setBotEnabled] = useState(true)
  const [tags, setTags] = useState<string[]>(
    Array.isArray(lead.tags) ? lead.tags : (typeof lead.tags === 'string' ? [lead.tags] : ['Interessado', 'WhatsApp'])
  )
  const [newTag, setNewTag] = useState('')
  
  // Estados para edição de contato
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(lead.nome || '')
  const [editedEmail, setEditedEmail] = useState(lead.email || '')
  const [editedCidade, setEditedCidade] = useState(lead.cidade || '')
  const [notes, setNotes] = useState(lead.notes || '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  
  // Verificar se é lead "virtual" (não salvo no banco)
  const isVirtualLead = typeof lead.id === 'number' && lead.id < 0

  const currentStatusStyle = statusOptions.find(s => s.value === status)?.color || statusOptions[0].color

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag))
  }

  // Salvar contato no Supabase
  const saveContact = async () => {
    if (!lead.telefone) return
    
    setIsSaving(true)
    setSaveMessage('')
    
    try {
      const contactData = {
        nome: editedName || `Contato ${lead.telefone!.slice(-4)}`,
        telefone: lead.telefone!.replace(/\D/g, ''),
        email: editedEmail || null,
        cidade: editedCidade || null,
        status: status,
        origem: 'WhatsApp',
        observacoes: notes || null,
      }
      
      if (isVirtualLead) {
        // Inserir novo lead
        const { error } = await supabase
          .from('leads')
          .insert(contactData)
        
        if (error) throw error
        setSaveMessage('✅ Contato salvo com sucesso!')
      } else {
        // Atualizar lead existente
        const { error } = await supabase
          .from('leads')
          .update(contactData)
          .eq('id', lead.id)
        
        if (error) throw error
        setSaveMessage('✅ Contato atualizado!')
      }
      
      setIsEditing(false)
      
      // Limpar mensagem após 3s
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (error) {
      console.error('Erro ao salvar contato:', error)
      setSaveMessage('❌ Erro ao salvar')
    } finally {
      setIsSaving(false)
    }
  }

  // Atualizar status no banco
  useEffect(() => {
    if (!isVirtualLead && status !== lead.status) {
      supabase
        .from('leads')
        .update({ status })
        .eq('id', lead.id)
        .then(({ error }) => {
          if (error) console.error('Erro ao atualizar status:', error)
        })
    }
  }, [status, lead.id, lead.status, isVirtualLead])

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <header className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Detalhes do Lead</h3>
        <button 
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile Section */}
        <div className="px-6 py-6 text-center border-b border-gray-100">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
            {lead.nome?.charAt(0)?.toUpperCase() || '?'}
          </div>
          
          {/* Name */}
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            {lead.nome || 'Sem nome'}
          </h2>
          
          {/* Phone */}
          <p className="text-sm text-gray-500 mb-4">{lead.telefone}</p>
          
          {/* Status Selector */}
          <div className="relative inline-block">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className={`px-4 py-2 rounded-full text-sm font-medium border flex items-center gap-2 ${currentStatusStyle}`}
            >
              {status}
              <ChevronDown className="w-4 h-4" />
            </button>
            
            {showStatusDropdown && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-10">
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setStatus(option.value)
                      setShowStatusDropdown(false)
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                      status === option.value ? 'font-medium' : ''
                    }`}
                  >
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${option.color}`}>
                      {option.label}
                    </span>
                    {status === option.value && <Check className="w-4 h-4 text-indigo-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info Accordion */}
        <AccordionSection title="Informações" icon={User}>
          <div className="space-y-4">
            {/* Nome - Editável */}
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-500">Nome</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                    placeholder="Nome do contato"
                  />
                ) : (
                  <p className="text-sm text-gray-900">{lead.nome || 'Sem nome'}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Telefone</p>
                <p className="text-sm text-gray-900">{lead.telefone}</p>
              </div>
            </div>
            
            {/* Email - Editável */}
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-500">Email</p>
                {isEditing ? (
                  <input
                    type="email"
                    value={editedEmail}
                    onChange={(e) => setEditedEmail(e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                    placeholder="email@exemplo.com"
                  />
                ) : (
                  <p className="text-sm text-gray-900">{lead.email || '-'}</p>
                )}
              </div>
            </div>
            
            {/* Cidade - Editável */}
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-500">Cidade</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedCidade}
                    onChange={(e) => setEditedCidade(e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                    placeholder="Cidade"
                  />
                ) : (
                  <p className="text-sm text-gray-900">{lead.cidade || '-'}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Criado em</p>
                <p className="text-sm text-gray-900">
                  {lead.data_criacao 
                    ? new Date(lead.data_criacao).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })
                    : '-'
                  }
                </p>
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* Bot Toggle */}
        <AccordionSection title="Automação" icon={Bot}>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                botEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-400'
              }`}>
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Bot automático</p>
                <p className="text-xs text-gray-500">
                  {botEnabled ? 'Respondendo mensagens' : 'Desativado'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setBotEnabled(!botEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                botEnabled ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span 
                className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  botEnabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </AccordionSection>

        {/* Tags */}
        <AccordionSection title="Tags" icon={Tag}>
          <div className="space-y-3">
            {/* Current Tags */}
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span 
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium"
                >
                  {tag}
                  <button 
                    onClick={() => removeTag(tag)}
                    className="hover:text-indigo-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            
            {/* Add Tag */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                placeholder="Nova tag..."
                className="flex-1 h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={addTag}
                className="w-9 h-9 bg-indigo-600 text-white rounded-lg flex items-center justify-center hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </AccordionSection>

        {/* Notes */}
        <AccordionSection title="Notas" icon={FileText} defaultOpen={false}>
          <textarea
            placeholder="Adicione notas sobre este lead..."
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </AccordionSection>
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 border-t border-gray-100 space-y-2">
        {/* Mensagem de feedback */}
        {saveMessage && (
          <p className={`text-sm text-center mb-2 ${saveMessage.includes('✅') ? 'text-green-600' : 'text-red-600'}`}>
            {saveMessage}
          </p>
        )}
        
        {/* Botão para salvar contato (se for virtual) ou editar */}
        {isVirtualLead && !isEditing ? (
          <button 
            onClick={() => setIsEditing(true)}
            className="w-full h-10 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Salvar como Contato
          </button>
        ) : isEditing ? (
          <div className="flex gap-2">
            <button 
              onClick={() => setIsEditing(false)}
              className="flex-1 h-10 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={saveContact}
              disabled={isSaving}
              className="flex-1 h-10 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar
                </>
              )}
            </button>
          </div>
        ) : (
          <button 
            onClick={() => setIsEditing(true)}
            className="w-full h-10 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
          >
            <Edit3 className="w-4 h-4" />
            Editar Lead
          </button>
        )}
        
        <button className="w-full h-10 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Iniciar Conversa
        </button>
      </div>
    </div>
  )
}
