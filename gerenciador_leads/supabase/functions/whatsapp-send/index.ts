// ============================================================
// SUPABASE EDGE FUNCTION - Enviar Mensagem WhatsApp
// Envia mensagens via WhatsApp Business Cloud API
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Configuração
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN')!
const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================
// FORMATAR TELEFONE
// ============================================================

function formatPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  
  // Adiciona código do Brasil se necessário
  if (digits.length === 11) {
    digits = '55' + digits
  } else if (digits.length === 10) {
    digits = '55' + digits
  }
  
  return digits
}

// ============================================================
// BUSCAR/CRIAR LEAD
// ============================================================

async function getOrCreateLead(telefone: string): Promise<number | null> {
  const telefoneLimpo = telefone.replace(/\D/g, '')
  
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('telefone', telefoneLimpo)
    .single()
  
  if (existingLead) return existingLead.id
  
  const { data: newLead } = await supabase
    .from('leads')
    .insert({
      telefone: telefoneLimpo,
      nome: `Lead ${telefoneLimpo.slice(-4)}`,
      origem: 'whatsapp',
      etapa: 'novo'
    })
    .select('id')
    .single()
  
  return newLead?.id || null
}

// ============================================================
// SALVAR MENSAGEM
// ============================================================

async function saveMessage(data: {
  telefone: string
  tipo: string
  conteudo: string
  wamid?: string
  lead_id?: number
  media_url?: string
  caption?: string
}) {
  await supabase
    .from('mensagens')
    .insert({
      telefone: data.telefone.replace(/\D/g, ''),
      tipo: data.tipo,
      conteudo: data.conteudo,
      direcao: 'outgoing',
      status: 'sent',
      wamid: data.wamid,
      lead_id: data.lead_id,
      media_url: data.media_url,
      caption: data.caption,
      timestamp_whatsapp: new Date().toISOString()
    })
}

// ============================================================
// ENVIAR MENSAGEM VIA WHATSAPP API
// ============================================================

async function sendWhatsAppMessage(data: any): Promise<any> {
  console.log('📤 Enviando para WhatsApp API:', JSON.stringify(data, null, 2))
  
  const response = await fetch(
    `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...data
      })
    }
  )
  
  const result = await response.json()
  console.log('📥 Resposta WhatsApp:', JSON.stringify(result, null, 2))
  
  if (!response.ok) {
    console.error('❌ Erro WhatsApp:', result.error)
    return {
      success: false,
      error: result.error?.message || 'Unknown error',
      error_code: result.error?.code,
      error_data: result.error
    }
  }
  
  return {
    success: true,
    message_id: result.messages?.[0]?.id,
    data: result
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
  
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }
  
  try {
    const body = await req.json()
    const { to, type = 'text', content, message, caption, filename, template_name, language, mediaUrl, media_url, buttons, footer, header } = body
    
    const messageContent = content || message
    // Usar mediaUrl ou media_url (snake_case do frontend)
    const mediaUrlFinal = mediaUrl || media_url
    
    if (!to || !messageContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing "to" or "content"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const formattedPhone = formatPhone(to)
    let requestData: any = { to: formattedPhone }
    let result: any
    
    // ========================================
    // Construir payload baseado no tipo
    // ========================================
    
    switch (type) {
      case 'text':
        requestData = {
          ...requestData,
          type: 'text',
          text: { body: messageContent }
        }
        break
      
      case 'template':
        requestData = {
          ...requestData,
          type: 'template',
          template: {
            name: template_name || messageContent,
            language: { code: language || 'en_US' }
          }
        }
        break
      
      case 'image':
        requestData = {
          ...requestData,
          type: 'image',
          image: {
            link: messageContent,
            ...(caption && { caption })
          }
        }
        break
      
      case 'audio':
        // WhatsApp suporta: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg (opus)
        console.log('📢 Enviando áudio nativo:', messageContent)
        requestData = {
          ...requestData,
          type: 'audio',
          audio: { link: messageContent }
        }
        break
      
      case 'video':
        requestData = {
          ...requestData,
          type: 'video',
          video: {
            link: mediaUrlFinal || messageContent,
            ...(caption && { caption })
          }
        }
        break
      
      // Mensagem interativa com botões
      case 'interactive':
      case 'interactive_buttons':
        const interactiveButtons = (buttons || []).slice(0, 3).map((btn: any, idx: number) => ({
          type: 'reply',
          reply: {
            id: btn.id || `btn_${idx}`,
            title: (btn.text || btn.title || '').substring(0, 20) // Max 20 chars
          }
        }))
        
        requestData = {
          ...requestData,
          type: 'interactive',
          interactive: {
            type: 'button',
            ...(header && mediaUrlFinal && {
              header: {
                type: 'video',
                video: { link: mediaUrlFinal }
              }
            }),
            body: {
              text: messageContent
            },
            ...(footer && {
              footer: { text: footer }
            }),
            action: {
              buttons: interactiveButtons
            }
          }
        }
        break
      
      // Mensagem interativa com vídeo + botões
      case 'video_buttons':
        const videoButtons = (buttons || []).slice(0, 3).map((btn: any, idx: number) => ({
          type: 'reply',
          reply: {
            id: btn.id || `btn_${idx}`,
            title: (btn.text || btn.title || '').substring(0, 20)
          }
        }))
        
        requestData = {
          ...requestData,
          type: 'interactive',
          interactive: {
            type: 'button',
            header: {
              type: 'video',
              video: { link: mediaUrlFinal }
            },
            body: {
              text: messageContent
            },
            ...(footer && {
              footer: { text: footer }
            }),
            action: {
              buttons: videoButtons
            }
          }
        }
        break
      
      case 'document':
        requestData = {
          ...requestData,
          type: 'document',
          document: {
            link: messageContent,
            ...(filename && { filename }),
            ...(caption && { caption })
          }
        }
        break
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
    
    // Enviar mensagem
    console.log('📤 Enviando para WhatsApp:', JSON.stringify(requestData, null, 2))
    result = await sendWhatsAppMessage(requestData)
    console.log('📥 Resposta do WhatsApp:', JSON.stringify(result, null, 2))
    
    // Se áudio falhou, tentar enviar como texto com link
    if (!result.success && type === 'audio') {
      console.log('⚠️ Áudio falhou, tentando enviar como link de texto...')
      const fallbackData = {
        to: formattedPhone,
        type: 'text',
        text: { body: `🎵 Áudio: ${messageContent}` }
      }
      result = await sendWhatsAppMessage(fallbackData)
    }
    
    // Salvar mensagem enviada
    if (result.success) {
      const leadId = await getOrCreateLead(to)
      
      // Para mídia, salvar a URL
      const isMedia = ['image', 'video', 'audio', 'document'].includes(type)
      
      await saveMessage({
        telefone: to,
        tipo: type,
        conteudo: caption || messageContent,
        wamid: result.message_id,
        lead_id: leadId || undefined,
        media_url: isMedia ? (mediaUrlFinal || messageContent) : undefined,
        caption: caption
      })
    }
    
    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
    
  } catch (error) {
    console.error('Send error:', error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
