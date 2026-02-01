/**
 * ============================================================
 * SMART REFORÇO - WhatsApp Service via Supabase Edge Functions
 * 100% na nuvem - sem necessidade de servidor local
 * ============================================================
 */

import { supabase } from '../lib/supabase';

// URL base das Edge Functions do Supabase
const SUPABASE_URL = 'https://dcieravtcvoprktjgvry.supabase.co';
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// ============================================================
// TIPOS
// ============================================================

export interface Message {
  id?: number;
  wamid?: string;
  telefone: string;
  tipo: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'template';
  conteudo: string;
  caption?: string;
  direcao: 'incoming' | 'outgoing';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  media_id?: string;
  media_url?: string;
  media_mime?: string;
  media_filename?: string;
  lead_id?: number;
  created_at: string;
  timestamp_whatsapp?: string;
}

export interface Conversation {
  telefone: string;
  ultima_mensagem: string;
  tipo: string;
  direcao: string;
  status: string;
  timestamp: string;
  lead_id?: number;
  total_mensagens: number;
  nao_lidas: number;
}

export interface SendMessageParams {
  to: string;
  type?: 'text' | 'template' | 'image' | 'audio' | 'video' | 'document' | 'interactive' | 'video_buttons';
  content: string;
  caption?: string;
  filename?: string;
  template_name?: string;
  language?: string;
  media_url?: string;
  buttons?: Array<{ id?: string; text?: string; title?: string }>;
  footer?: string;
  header?: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message_id?: string;
}

// ============================================================
// EDGE FUNCTION CLIENT
// ============================================================

class WhatsAppEdgeService {
  /**
   * Chama uma Edge Function do Supabase
   */
  private async callFunction<T>(
    functionName: string,
    options: {
      method?: string;
      body?: Record<string, unknown>;
      path?: string;
    } = {}
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${FUNCTIONS_URL}/${functionName}${options.path || ''}`;
      
      // Pegar o token de sessão (se houver usuário autenticado)
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(url, {
        method: options.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec'
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`
        };
      }
      
      return {
        success: true,
        data: data,
        message_id: data.message_id
      };
    } catch (error) {
      console.error('Edge Function Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ============================================================
  // STATUS
  // ============================================================

  /**
   * Verifica status da API (via Edge Function)
   */
  async getStatus(): Promise<ApiResponse<{
    status: string;
    supabase: string;
    timestamp: string;
  }>> {
    return this.callFunction('whatsapp-api', {
      method: 'GET',
      path: '/status'
    });
  }

  // ============================================================
  // MENSAGENS - via Edge Functions
  // ============================================================

  /**
   * Envia mensagem via Edge Function whatsapp-send
   */
  async sendMessage(params: SendMessageParams): Promise<ApiResponse<{ message_id: string }>> {
    return this.callFunction('whatsapp-send', {
      method: 'POST',
      body: {
        to: params.to,
        type: params.type || 'text',
        content: params.content,
        caption: params.caption,
        filename: params.filename,
        template_name: params.template_name,
        language: params.language,
        media_url: params.media_url,
        buttons: params.buttons,
        footer: params.footer,
        header: params.header
      }
    });
  }

  /**
   * Envia mensagem de texto simples
   */
  async sendText(to: string, message: string): Promise<ApiResponse<{ message_id: string }>> {
    return this.sendMessage({
      to,
      type: 'text',
      content: message
    });
  }

  /**
   * Envia template
   */
  async sendTemplate(
    to: string,
    templateName: string = 'hello_world',
    language: string = 'en_US'
  ): Promise<ApiResponse<{ message_id: string }>> {
    return this.sendMessage({
      to,
      type: 'template',
      content: templateName,
      template_name: templateName,
      language
    });
  }

  /**
   * Envia imagem
   */
  async sendImage(
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<ApiResponse<{ message_id: string }>> {
    return this.sendMessage({
      to,
      type: 'image',
      content: imageUrl,
      caption
    });
  }

  /**
   * Envia vídeo
   */
  async sendVideo(
    to: string,
    videoUrl: string,
    caption?: string
  ): Promise<ApiResponse<{ message_id: string }>> {
    return this.sendMessage({
      to,
      type: 'video',
      content: videoUrl,
      media_url: videoUrl,
      caption
    });
  }

  /**
   * Envia áudio
   */
  async sendAudio(
    to: string,
    audioUrl: string
  ): Promise<ApiResponse<{ message_id: string }>> {
    return this.sendMessage({
      to,
      type: 'audio',
      content: audioUrl
    });
  }

  /**
   * Envia documento
   */
  async sendDocument(
    to: string,
    documentUrl: string,
    filename?: string,
    caption?: string
  ): Promise<ApiResponse<{ message_id: string }>> {
    return this.sendMessage({
      to,
      type: 'document',
      content: documentUrl,
      filename,
      caption
    });
  }

  /**
   * Envia vídeo com botões interativos
   */
  async sendVideoWithButtons(
    to: string,
    videoUrl: string,
    message: string,
    buttons: Array<{ id?: string; text?: string; title?: string }>,
    footer?: string
  ): Promise<ApiResponse<{ message_id: string }>> {
    return this.sendMessage({
      to,
      type: 'video_buttons',
      content: message,
      media_url: videoUrl,
      buttons,
      footer,
      header: true
    });
  }

  // ============================================================
  // MENSAGENS - via Supabase direto (leitura)
  // ============================================================

  /**
   * Busca mensagens de um telefone (direto do Supabase)
   */
  async getMessages(telefone: string, limit: number = 50): Promise<ApiResponse<Message[]>> {
    const telefoneLimpo = telefone.replace(/\D/g, '');
    
    const { data, error } = await supabase
      .from('mensagens')
      .select('*')
      .eq('telefone', telefoneLimpo)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as Message[] };
  }

  /**
   * Lista todas as conversas (direto do Supabase)
   */
  async getConversations(): Promise<ApiResponse<Conversation[]>> {
    // Buscar últimas mensagens agrupadas por telefone
    const { data, error } = await supabase
      .from('mensagens')
      .select('telefone, conteudo, tipo, direcao, status, created_at, lead_id')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      return { success: false, error: error.message };
    }

    // Agrupar por telefone
    const conversations: Record<string, Conversation> = {};

    for (const msg of data || []) {
      const tel = msg.telefone;
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
        };
      }
      conversations[tel].total_mensagens++;
      if (msg.direcao === 'incoming' && msg.status === 'received') {
        conversations[tel].nao_lidas++;
      }
    }

    return { 
      success: true, 
      data: Object.values(conversations).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
    };
  }

  // ============================================================
  // LEADS - via Supabase direto
  // ============================================================

  /**
   * Lista leads
   */
  async getLeads(params?: {
    limit?: number;
    lote_id?: number;
    etapa?: string;
  }): Promise<ApiResponse<Lead[]>> {
    let query = supabase
      .from('leads')
      .select('*')
      .eq('arquivado', false)
      .order('created_at', { ascending: false });

    if (params?.limit) {
      query = query.limit(params.limit);
    }
    if (params?.lote_id) {
      query = query.eq('lote_id', params.lote_id);
    }
    if (params?.etapa) {
      query = query.eq('etapa', params.etapa);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as Lead[] };
  }

  /**
   * Busca lead por ID
   */
  async getLead(id: number): Promise<ApiResponse<Lead>> {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as Lead };
  }

  /**
   * Atualiza lead
   */
  async updateLead(id: number, updateData: Partial<Lead>): Promise<ApiResponse<Lead>> {
    const { data, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as Lead };
  }

  // ============================================================
  // LOTES - via Supabase direto
  // ============================================================

  /**
   * Lista lotes
   */
  async getLotes(): Promise<ApiResponse<Lote[]>> {
    const { data, error } = await supabase
      .from('lotes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as Lote[] };
  }

  /**
   * Cria lote
   */
  async createLote(loteData: { nome: string; descricao?: string; cor?: string }): Promise<ApiResponse<Lote>> {
    const { data, error } = await supabase
      .from('lotes')
      .insert(loteData)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as Lote };
  }
}

// ============================================================
// TIPOS ADICIONAIS
// ============================================================

export interface Lead {
  id: number;
  nome: string;
  telefone: string;
  email?: string;
  etapa: string;
  origem?: string;
  notas?: string;
  tags?: string;
  lote_id?: number;
  arquivado: boolean;
  interesse?: string;
  responsavel?: string;
  ultimo_contato?: string;
  created_at: string;
  updated_at?: string;
}

export interface Lote {
  id: number;
  nome: string;
  descricao?: string;
  cor: string;
  created_at: string;
}

// ============================================================
// EXPORT SINGLETON
// ============================================================

export const whatsappEdgeService = new WhatsAppEdgeService();
export default whatsappEdgeService;
