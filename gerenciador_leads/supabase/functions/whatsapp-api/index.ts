// ============================================================
// SUPABASE EDGE FUNCTION - API WhatsApp
// Endpoints: /messages, /conversations, /leads
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  const url = new URL(req.url)
  const path = url.pathname.replace('/whatsapp-api', '')
  
  try {
    // ========================================
    // GET /status - Status da API
    // ========================================
    if (path === '/status' || path === '') {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'online',
          timestamp: new Date().toISOString(),
          supabase: 'connected'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ========================================
    // GET /messages/:telefone - Buscar mensagens
    // ========================================
    if (path.startsWith('/messages/')) {
      const telefone = path.replace('/messages/', '').replace(/\D/g, '')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      
      const { data, error } = await supabase
        .from('mensagens')
        .select('*')
        .eq('telefone', telefone)
        .order('created_at', { ascending: true })
        .limit(limit)
      
      if (error) throw error
      
      return new Response(
        JSON.stringify({ success: true, messages: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ========================================
    // GET /conversations - Listar conversas
    // ========================================
    if (path === '/conversations') {
      const { data, error } = await supabase
        .from('mensagens')
        .select('telefone, conteudo, tipo, direcao, status, created_at, lead_id')
        .order('created_at', { ascending: false })
        .limit(500)
      
      if (error) throw error
      
      // Agrupar por telefone
      const conversations: Record<string, any> = {}
      
      for (const msg of data || []) {
        const tel = msg.telefone
        if (!conversations[tel]) {
          conversations[tel] = {
            telefone: tel,
            ultima_mensagem: msg.conteudo,
            tipo: msg.tipo,
            direcao: msg.direcao,
            status: msg.status,
            timestamp: msg.created_at,
            lead_id: msg.lead_id,
            total_mensagens: 0,
            nao_lidas: 0
          }
        }
        
        conversations[tel].total_mensagens++
        if (msg.direcao === 'incoming' && msg.status === 'received') {
          conversations[tel].nao_lidas++
        }
      }
      
      return new Response(
        JSON.stringify({ success: true, conversations: Object.values(conversations) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ========================================
    // GET /leads - Listar leads
    // ========================================
    if (path === '/leads' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '100')
      const loteId = url.searchParams.get('lote_id')
      const etapa = url.searchParams.get('etapa')
      
      let query = supabase
        .from('leads')
        .select('*')
        .eq('arquivado', false)
        .order('created_at', { ascending: false })
        .limit(limit)
      
      if (loteId) query = query.eq('lote_id', parseInt(loteId))
      if (etapa) query = query.eq('etapa', etapa)
      
      const { data, error } = await query
      
      if (error) throw error
      
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ========================================
    // GET /leads/:id - Buscar lead
    // ========================================
    if (path.match(/^\/leads\/\d+$/) && req.method === 'GET') {
      const id = parseInt(path.split('/')[2])
      
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) throw error
      
      return new Response(
        JSON.stringify({ success: true, lead: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ========================================
    // PATCH /leads/:id - Atualizar lead
    // ========================================
    if (path.match(/^\/leads\/\d+$/) && req.method === 'PATCH') {
      const id = parseInt(path.split('/')[2])
      const body = await req.json()
      
      const allowed = ['nome', 'telefone', 'email', 'etapa', 'origem', 'notas', 'tags', 
                       'lote_id', 'arquivado', 'interesse', 'responsavel']
      
      const updateData: Record<string, any> = {}
      for (const key of allowed) {
        if (key in body) updateData[key] = body[key]
      }
      
      const { data, error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ========================================
    // GET /lotes - Listar lotes
    // ========================================
    if (path === '/lotes' && req.method === 'GET') {
      const { data, error } = await supabase
        .from('lotes')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ========================================
    // POST /lotes - Criar lote
    // ========================================
    if (path === '/lotes' && req.method === 'POST') {
      const body = await req.json()
      
      const { data, error } = await supabase
        .from('lotes')
        .insert({
          nome: body.nome || `Lote ${new Date().toLocaleString('pt-BR')}`,
          descricao: body.descricao || '',
          cor: body.cor || '#3B82F6'
        })
        .select()
        .single()
      
      if (error) throw error
      
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ========================================
    // 404 - Rota não encontrada
    // ========================================
    return new Response(
      JSON.stringify({ success: false, error: 'Not found', path }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('API error:', error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
