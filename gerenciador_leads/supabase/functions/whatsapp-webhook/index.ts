// ============================================================
// SUPABASE EDGE FUNCTION - WhatsApp Webhook
// Recebe mensagens do WhatsApp Business Cloud API
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Configuração
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'smart_reforco_verify_2024'
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Cliente Supabase com service role
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ============================================================
// CORS Headers
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================
// HELPERS
// ============================================================

async function getOrCreateLead(telefone: string, nome?: string): Promise<number | null> {
  // Normalizar telefone
  const telefoneLimpo = telefone.replace(/\D/g, '')
  
  // Buscar lead existente
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('telefone', telefoneLimpo)
    .single()
  
  if (existingLead) {
    return existingLead.id
  }
  
  // Criar novo lead
  const { data: newLead, error } = await supabase
    .from('leads')
    .insert({
      telefone: telefoneLimpo,
      nome: nome || `Lead ${telefoneLimpo.slice(-4)}`,
      origem: 'whatsapp',
      etapa: 'novo'
    })
    .select('id')
    .single()
  
  if (error) {
    console.error('Error creating lead:', error)
    return null
  }
  
  return newLead?.id || null
}

async function saveMessage(data: {
  telefone: string
  tipo: string
  conteudo: string
  direcao: 'incoming' | 'outgoing'
  wamid?: string
  lead_id?: number
  media_data?: Record<string, any>
  status?: string
}) {
  const insertData = {
    telefone: data.telefone.replace(/\D/g, ''),
    tipo: data.tipo,
    conteudo: data.conteudo,
    direcao: data.direcao,
    status: data.status || 'received',
    wamid: data.wamid,
    lead_id: data.lead_id,
    timestamp_whatsapp: new Date().toISOString(),
    ...data.media_data
  }
  
  const { error } = await supabase
    .from('mensagens')
    .insert(insertData)
  
  if (error) {
    console.error('Error saving message:', error)
  }
}

async function updateMessageStatus(wamid: string, status: string) {
  const { error } = await supabase
    .from('mensagens')
    .update({ status })
    .eq('wamid', wamid)
  
  if (error) {
    console.error('Error updating status:', error)
  }
}

async function logWebhook(tipo: string, payload: any) {
  await supabase
    .from('webhook_logs')
    .insert({
      tipo,
      payload,
      processado: true
    })
}

// ============================================================
// BUSCAR RESPOSTA AUTOMÁTICA DO BOT
// ============================================================

async function findBotResponse(triggerText: string): Promise<string | null> {
  console.log(`🤖 Buscando resposta para gatilho: "${triggerText}"`)
  
  const normalizedTrigger = triggerText.toLowerCase().trim()
  
  // ============================================================
  // 1. BUSCAR NA TABELA bot_responses
  // ============================================================
  const { data: responses, error } = await supabase
    .from('bot_responses')
    .select('response, trigger')
    .eq('active', true)
  
  if (error) {
    console.error('Erro ao buscar bot_responses:', error)
  }
  
  console.log(`📋 Encontradas ${responses?.length || 0} respostas ativas em bot_responses`)
  
  if (responses && responses.length > 0) {
    // Busca exata
    for (const r of responses) {
      const triggerLower = r.trigger.toLowerCase().trim()
      if (triggerLower === normalizedTrigger) {
        console.log(`✅ Match exato encontrado em bot_responses!`)
        return r.response
      }
    }
    
    // Busca parcial
    for (const r of responses) {
      const triggerLower = r.trigger.toLowerCase().trim()
      if (normalizedTrigger.includes(triggerLower) || triggerLower.includes(normalizedTrigger)) {
        console.log(`✅ Match parcial encontrado em bot_responses: "${triggerLower}"`)
        return r.response
      }
    }
  }
  
  // ============================================================
  // 2. BUSCAR NOS TEMPLATES (botões com response)
  // ============================================================
  console.log('🔍 Buscando nos templates...')
  const { data: templates } = await supabase
    .from('whatsapp_templates')
    .select('components')
  
  if (templates && templates.length > 0) {
    for (const template of templates) {
      const buttons = template.components?.buttons || []
      for (const button of buttons) {
        if (button.text && button.response) {
          const buttonText = button.text.toLowerCase().trim()
          if (buttonText === normalizedTrigger || normalizedTrigger.includes(buttonText) || buttonText.includes(normalizedTrigger)) {
            console.log(`✅ Match encontrado no template, botão: "${button.text}"`)
            return button.response
          }
        }
      }
    }
  }
  
  console.log(`❌ Nenhuma resposta encontrada para: "${triggerText}"`)
  return null
}

// ============================================================
// ENVIAR RESPOSTA AUTOMÁTICA
// ============================================================

async function sendAutoReply(telefone: string, resposta: string, leadId?: number) {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  
  if (!WHATSAPP_TOKEN || !phoneNumberId) {
    console.error('WhatsApp config missing for auto-reply')
    return
  }
  
  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefone,
        type: 'text',
        text: { body: resposta }
      })
    })
    
    const result = await response.json()
    
    if (result.messages?.[0]?.id) {
      // Salvar mensagem enviada pelo bot
      await saveMessage({
        telefone,
        tipo: 'text',
        conteudo: resposta,
        direcao: 'outgoing',
        wamid: result.messages[0].id,
        lead_id: leadId,
        status: 'sent'
      })
      console.log(`Auto-reply sent to ${telefone}: ${resposta.substring(0, 50)}...`)
    }
  } catch (error) {
    console.error('Error sending auto-reply:', error)
  }
}

// ============================================================
// PROCESSAR MENSAGEM RECEBIDA
// ============================================================

async function processIncomingMessage(message: any, contact: any) {
  try {
    const wamid = message.id
    const telefone = message.from
    const msgType = message.type
    const nome = contact?.profile?.name || ''
    
    // Buscar ou criar lead
    const leadId = await getOrCreateLead(telefone, nome)
    
    // Extrair conteúdo baseado no tipo
    let conteudo = ''
    let mediaData: Record<string, any> = {}
    
    switch (msgType) {
      case 'text':
        conteudo = message.text?.body || ''
        break
      
      case 'image':
        conteudo = message.image?.caption || '[Imagem]'
        mediaData = {
          media_id: message.image?.id,
          media_mime: message.image?.mime_type
        }
        break
      
      case 'audio':
        conteudo = '[Áudio]'
        mediaData = {
          media_id: message.audio?.id,
          media_mime: message.audio?.mime_type
        }
        break
      
      case 'video':
        conteudo = message.video?.caption || '[Vídeo]'
        mediaData = {
          media_id: message.video?.id,
          media_mime: message.video?.mime_type
        }
        break
      
      case 'document':
        conteudo = message.document?.caption || '[Documento]'
        mediaData = {
          media_id: message.document?.id,
          media_mime: message.document?.mime_type,
          media_filename: message.document?.filename
        }
        break
      
      case 'sticker':
        conteudo = '[Sticker]'
        mediaData = {
          media_id: message.sticker?.id,
          media_mime: message.sticker?.mime_type
        }
        break
      
      case 'location':
        const loc = message.location
        conteudo = `📍 ${loc?.name || 'Localização'}`
        mediaData = {
          metadata: JSON.stringify({
            latitude: loc?.latitude,
            longitude: loc?.longitude,
            address: loc?.address
          })
        }
        break
      
      case 'button':
        conteudo = message.button?.text || '[Botão]'
        break
      
      case 'interactive':
        if (message.interactive?.type === 'button_reply') {
          conteudo = message.interactive.button_reply?.title || '[Resposta]'
        } else if (message.interactive?.type === 'list_reply') {
          conteudo = message.interactive.list_reply?.title || '[Lista]'
        }
        break
      
      default:
        conteudo = `[${msgType}]`
    }
    
    // Salvar mensagem
    await saveMessage({
      telefone,
      tipo: msgType,
      conteudo,
      direcao: 'incoming',
      wamid,
      lead_id: leadId || undefined,
      media_data: mediaData,
      status: 'received'
    })
    
    // Atualizar último contato do lead
    if (leadId) {
      await supabase
        .from('leads')
        .update({ ultimo_contato: new Date().toISOString() })
        .eq('id', leadId)
    }
    
    // Marcar como lida via API do WhatsApp
    if (WHATSAPP_TOKEN) {
      const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
      await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: wamid
        })
      })
    }
    
    console.log(`Message received from ${telefone}: ${conteudo.substring(0, 50)}...`)
    
    // ============================================================
    // RESPOSTA AUTOMÁTICA DO BOT
    // ============================================================
    
    // Verifica se há resposta automática para essa mensagem
    // Funciona para: texto, botão, interactive (clique em botões)
    if (conteudo && (msgType === 'text' || msgType === 'button' || msgType === 'interactive')) {
      const autoResponse = await findBotResponse(conteudo)
      
      if (autoResponse) {
        console.log(`Auto-response found for trigger: "${conteudo}"`)
        // Pequeno delay para parecer mais natural
        await new Promise(resolve => setTimeout(resolve, 500))
        await sendAutoReply(telefone, autoResponse, leadId || undefined)
      } else {
        console.log(`No auto-response for: "${conteudo}"`)
      }
    }
    
  } catch (error) {
    console.error('Error processing message:', error)
  }
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  const url = new URL(req.url)
  
  // ========================================
  // GET - Verificação do Webhook pela Meta
  // ========================================
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    
    console.log('Webhook verification:', { mode, token, challenge })
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified successfully!')
      return new Response(challenge, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      })
    }
    
    console.log('Webhook verification failed')
    return new Response('Forbidden', { status: 403, headers: corsHeaders })
  }
  
  // ========================================
  // POST - Receber Mensagens
  // ========================================
  if (req.method === 'POST') {
    try {
      const payload = await req.json()
      
      // Log do webhook
      await logWebhook('incoming', payload)
      
      // Processar entries
      if (payload.entry) {
        for (const entry of payload.entry) {
          for (const change of entry.changes || []) {
            if (change.field === 'messages') {
              const value = change.value || {}
              
              // Processar status updates
              for (const status of value.statuses || []) {
                await updateMessageStatus(status.id, status.status)
              }
              
              // Processar mensagens recebidas
              for (const message of value.messages || []) {
                const contact = (value.contacts || [])[0]
                await processIncomingMessage(message, contact)
              }
            }
          }
        }
      }
      
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
      
    } catch (error) {
      console.error('Webhook error:', error)
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }
  
  return new Response('Method not allowed', { status: 405, headers: corsHeaders })
})
