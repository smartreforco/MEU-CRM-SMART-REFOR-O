import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://dcieravtcvoprktjgvry.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Types
export interface Lead {
  id: number
  nome: string | null
  telefone: string | null
  email: string | null
  origem: string | null
  interesse: string | null
  observacoes: string | null
  status: string
  prioridade: string
  data_criacao: string
  data_atualizacao: string | null
  ultimo_contato: string | null
  proximo_contato: string | null
  responsavel: string | null
  valor_potencial: number | null
  tags: string | null
  fonte_arquivo: string | null
  cidade: string | null
  estado: string | null
  empresa: string | null
  cargo: string | null
  whatsapp_status: string
  lote_id: number | null
  arquivado: boolean
  data_arquivado: string | null
  // Campos opcionais para UI
  unread_count?: number
  last_message?: string
  // Index signature for compatibility
  [key: string]: unknown
}

export interface Lote {
  id: number
  nome: string
  descricao: string | null
  quantidade: number
  status: 'ativo' | 'arquivado' | 'pausado'
  data_criacao: string
  data_arquivado: string | null
  motivo_arquivo: string | null
}

export interface CRMEstagio {
  id: number
  pipeline_id: number
  nome: string
  cor: string
  ordem: number
  probabilidade: number
  ativo: boolean
}

export interface CRMPipeline {
  id: number
  nome: string
  descricao: string | null
  cor: string
  ordem: number
  ativo: boolean
}

// Funções de API
export async function getLeads(limit = 100, offset = 0) {
  const { data, error, count } = await supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .order('data_criacao', { ascending: false })
    .range(offset, offset + limit - 1)
  
  if (error) throw error
  return { data, count }
}

// Carrega TODOS os leads (sem limite de 1000 do Supabase)
export async function getAllLeads() {
  const allLeads: Lead[] = []
  const batchSize = 1000
  let offset = 0
  let totalCount = 0

  // Primeira query para pegar o count total
  const { count } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
  
  totalCount = count || 0

  // Carregar em lotes de 1000
  while (offset < totalCount) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('data_criacao', { ascending: false })
      .range(offset, offset + batchSize - 1)
    
    if (error) throw error
    if (data) allLeads.push(...data)
    offset += batchSize
  }

  return { data: allLeads, count: totalCount }
}

export async function getLeadsByStatus(status: string) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('status', status)
    .order('data_criacao', { ascending: false })
  
  if (error) throw error
  return data
}

export async function updateLeadStatus(id: number, status: string) {
  const { error } = await supabase
    .from('leads')
    .update({ status, data_atualizacao: new Date().toISOString() })
    .eq('id', id)
  
  if (error) throw error
}

export async function getEstagios() {
  const { data, error } = await supabase
    .from('crm_estagios')
    .select('*')
    .order('ordem', { ascending: true })
  
  if (error) throw error
  return data
}

export async function searchLeads(term: string) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .or(`nome.ilike.%${term}%,telefone.ilike.%${term}%,email.ilike.%${term}%`)
    .limit(50)
  
  if (error) throw error
  return data
}

export interface LeadImport {
  nome?: string
  telefone?: string
  email?: string
  cidade?: string
  estado?: string
  origem?: string
  observacoes?: string
}

export async function importLeads(leads: LeadImport[]) {
  const leadsToInsert = leads.map(lead => ({
    nome: lead.nome || null,
    telefone: lead.telefone || null,
    email: lead.email || null,
    cidade: lead.cidade || null,
    estado: lead.estado || null,
    origem: lead.origem || 'Importação CSV',
    observacoes: lead.observacoes || null,
    status: 'novo',
    prioridade: 'media',
    data_criacao: new Date().toISOString(),
    whatsapp_status: 'pendente'
  }))

  const { data, error } = await supabase
    .from('leads')
    .insert(leadsToInsert)
    .select()

  if (error) throw error
  return { inserted: data?.length || 0, data }
}

export async function exportLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('data_criacao', { ascending: false })
  
  if (error) throw error
  return data
}

// ============ FUNÇÕES DE LOTES ============

// Buscar todos os lotes
export async function getLotes() {
  const { data, error } = await supabase
    .from('lotes')
    .select('*')
    .order('data_criacao', { ascending: false })
  
  if (error) throw error
  return data as Lote[]
}

// Buscar lote ativo (mais recente)
export async function getLoteAtivo() {
  const { data, error } = await supabase
    .from('lotes')
    .select('*')
    .order('data_criacao', { ascending: false })
    .limit(1)
  
  if (error) {
    console.error('Erro ao buscar lote ativo:', error)
    return null
  }
  return data && data.length > 0 ? data[0] as Lote : null
}

// Criar novo lote com leads selecionados
export async function criarLote(nome: string, leadIds: number[], descricao?: string) {
  // 1. Criar o lote
  const { data: lote, error: loteError } = await supabase
    .from('lotes')
    .insert({
      nome,
      descricao: descricao || null,
      quantidade: leadIds.length,
      status: 'ativo'
    })
    .select()
    .single()
  
  if (loteError) throw loteError

  // 2. Associar leads ao lote
  const { error: leadsError } = await supabase
    .from('leads')
    .update({ 
      lote_id: lote.id,
      status: 'contato' // Muda status para "em contato"
    })
    .in('id', leadIds)
  
  if (leadsError) throw leadsError
  
  return lote as Lote
}

// Buscar leads do lote ativo (não arquivados)
export async function getLeadsDoLoteAtivo() {
  const loteAtivo = await getLoteAtivo()
  if (!loteAtivo) return { data: [], lote: null }

  const allLeads: Lead[] = []
  const batchSize = 1000
  let offset = 0

  const { count } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('lote_id', loteAtivo.id)
    .eq('arquivado', false)

  const totalCount = count || 0

  while (offset < totalCount) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('lote_id', loteAtivo.id)
      .eq('arquivado', false)
      .order('data_criacao', { ascending: false })
      .range(offset, offset + batchSize - 1)
    
    if (error) throw error
    if (data) allLeads.push(...data)
    offset += batchSize
  }

  return { data: allLeads, lote: loteAtivo }
}

// Arquivar leads selecionados
export async function arquivarLeads(leadIds: number[], motivo: string) {
  const { error } = await supabase
    .from('leads')
    .update({ 
      arquivado: true,
      data_arquivado: new Date().toISOString(),
      observacoes: motivo
    })
    .in('id', leadIds)
  
  if (error) throw error
  return { arquivados: leadIds.length }
}

// Arquivar lote inteiro
export async function arquivarLote(loteId: number, motivo: string) {
  // 1. Arquivar todos os leads não-convertidos do lote
  const { error: leadsError } = await supabase
    .from('leads')
    .update({ 
      arquivado: true,
      data_arquivado: new Date().toISOString()
    })
    .eq('lote_id', loteId)
    .neq('status', 'convertido')
  
  if (leadsError) throw leadsError

  // 2. Marcar lote como arquivado
  const { error: loteError } = await supabase
    .from('lotes')
    .update({ 
      status: 'arquivado',
      data_arquivado: new Date().toISOString(),
      motivo_arquivo: motivo
    })
    .eq('id', loteId)
  
  if (loteError) throw loteError
}

// Buscar leads disponíveis (sem lote e não arquivados)
export async function getLeadsDisponiveis() {
  const allLeads: Lead[] = []
  const batchSize = 1000
  let offset = 0

  const { count } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .is('lote_id', null)
    .eq('arquivado', false)

  const totalCount = count || 0

  while (offset < totalCount) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .is('lote_id', null)
      .eq('arquivado', false)
      .order('data_criacao', { ascending: false })
      .range(offset, offset + batchSize - 1)
    
    if (error) throw error
    if (data) allLeads.push(...data)
    offset += batchSize
  }

  return { data: allLeads, count: totalCount }
}
