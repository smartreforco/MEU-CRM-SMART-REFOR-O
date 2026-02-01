/**
 * ============================================================
 * SMART REFORÇO - WhatsApp Service (Supabase Edge Functions)
 * Conexão com Edge Functions do Supabase para WhatsApp
 * ============================================================
 */

// URL das Edge Functions do Supabase
const SUPABASE_URL = 'https://dcieravtcvoprktjgvry.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec';

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

export interface SendMessageParams {
  to: string;
  type?: 'text' | 'template' | 'image' | 'audio' | 'video' | 'document';
  content: string;
  caption?: string;
  filename?: string;
  template_name?: string;
  language?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message_id?: string;
}

// ============================================================
// SUPABASE WHATSAPP SERVICE
// ============================================================

class WhatsAppSupabaseService {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor() {
    this.supabaseUrl = SUPABASE_URL;
    this.supabaseKey = SUPABASE_ANON_KEY;
  }

  /**
   * Faz requisição para Edge Function
   */
  private async callFunction<T>(
    functionName: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.supabaseUrl}/functions/v1/${functionName}`;
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Supabase Function Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Faz requisição direta para o Supabase REST API
   */
  private async supabaseRequest<T>(
    table: string,
    options: {
      method?: string;
      filters?: Record<string, string>;
      body?: any;
      select?: string;
      order?: string;
      limit?: number;
    } = {}
  ): Promise<ApiResponse<T>> {
    try {
      const { method = 'GET', filters = {}, body, select = '*', order, limit } = options;
      
      let url = `${this.supabaseUrl}/rest/v1/${table}?select=${select}`;
      
      // Adicionar filtros
      for (const [key, value] of Object.entries(filters)) {
        url += `&${key}=${encodeURIComponent(value)}`;
      }
      
      if (order) url += `&order=${order}`;
      if (limit) url += `&limit=${limit}`;
      
      const headers: Record<string, string> = {
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`,
        'Content-Type': 'application/json',
      };
      
      if (method !== 'GET') {
        headers['Prefer'] = 'return=representation';
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.message || 'Request failed' };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Supabase Request Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================
  // STATUS
  // ============================================================

  async getStatus(): Promise<ApiResponse<{ status: string }>> {
    return this.callFunction('whatsapp-api/status');
  }

  // ============================================================
  // MENSAGENS
  // ============================================================

  /**
   * Salva mensagem no banco de dados local
   */
  async saveMessageToDatabase(message: Partial<Message>): Promise<ApiResponse<Message>> {
    return this.supabaseRequest<Message>('mensagens', {
      method: 'POST',
      body: message,
    });
  }

  /**
   * Envia mensagem via Edge Function e salva no banco
   */
  async sendMessage(params: SendMessageParams): Promise<ApiResponse<{ message_id: string }>> {
    const telefoneLimpo = params.to.replace(/\D/g, '');
    
    // 1. Salvar mensagem no banco de dados primeiro (com status pending)
    const messageToSave: Partial<Message> = {
      telefone: telefoneLimpo,
      tipo: params.type || 'text',
      conteudo: params.content,
      caption: params.caption,
      direcao: 'outgoing',
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    
    const saveResult = await this.saveMessageToDatabase(messageToSave);
    console.log('💾 Mensagem salva no banco:', saveResult);
    
    // 2. Tentar enviar via Edge Function (se disponível)
    try {
      const sendResult = await this.callFunction<{ message_id: string }>('whatsapp-send', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      
      // 3. Atualizar status da mensagem se enviou com sucesso
      if (sendResult.success && sendResult.message_id && saveResult.data) {
        await this.supabaseRequest('mensagens', {
          method: 'PATCH',
          filters: { id: `eq.${(saveResult.data as any).id}` },
          body: { 
            status: 'sent',
            wamid: sendResult.message_id 
          },
        });
      }
      
      return sendResult;
    } catch (error) {
      console.log('⚠️ Edge Function não disponível, mensagem salva localmente');
      // Retorna sucesso parcial - mensagem foi salva localmente
      return { 
        success: true, 
        message_id: `local_${Date.now()}`,
        data: { message_id: `local_${Date.now()}` }
      };
    }
  }

  /**
   * Envia mensagem de texto
   */
  async sendText(to: string, message: string): Promise<ApiResponse<{ message_id: string }>> {
    return this.sendMessage({ to, type: 'text', content: message });
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
      language,
    });
  }

  /**
   * Busca mensagens de um telefone (direto do Supabase)
   * Busca tanto com código do país (55) quanto sem
   */
  async getMessages(telefone: string, limit: number = 200): Promise<ApiResponse<Message[]>> {
    let telefoneLimpo = telefone.replace(/\D/g, '');
    
    // Normalizar para buscar com e sem código do país
    // Se começa com 55, também buscar sem
    // Se não começa com 55, também buscar com
    let variants = [telefoneLimpo];
    
    if (telefoneLimpo.startsWith('55') && telefoneLimpo.length > 11) {
      variants.push(telefoneLimpo.slice(2)); // Sem código do país
    } else if (!telefoneLimpo.startsWith('55') && telefoneLimpo.length <= 11) {
      variants.push('55' + telefoneLimpo); // Com código do país
    }
    
    // Buscar com filtro OR usando in
    const variantsFilter = variants.join(',');
    
    return this.supabaseRequest<Message[]>('mensagens', {
      filters: { telefone: `in.(${variantsFilter})` },
      order: 'created_at.asc',
      limit,
    });
  }

  /**
   * Lista conversas (últimas mensagens agrupadas por telefone)
   */
  async getConversations(): Promise<ApiResponse<Conversation[]>> {
    // Buscar últimas mensagens
    const result = await this.supabaseRequest<Message[]>('mensagens', {
      select: 'telefone,conteudo,tipo,direcao,status,created_at,lead_id',
      order: 'created_at.desc',
      limit: 500,
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    // Agrupar por telefone
    const conversations: Record<string, Conversation> = {};
    
    for (const msg of result.data) {
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
          nao_lidas: 0,
        };
      }
      
      conversations[tel].total_mensagens++;
      // Contar não lidas: mensagens incoming com status pending ou sent (ainda não foram visualizadas)
      if (msg.direcao === 'incoming' && (msg.status === 'pending' || msg.status === 'sent')) {
        conversations[tel].nao_lidas++;
      }
    }

    return { success: true, data: Object.values(conversations) };
  }

  // ============================================================
  // LEADS
  // ============================================================

  async getLeads(params?: {
    limit?: number;
    lote_id?: number;
    etapa?: string;
  }): Promise<ApiResponse<Lead[]>> {
    const filters: Record<string, string> = { arquivado: 'eq.false' };
    
    if (params?.lote_id) filters.lote_id = `eq.${params.lote_id}`;
    if (params?.etapa) filters.etapa = `eq.${params.etapa}`;
    
    return this.supabaseRequest<Lead[]>('leads', {
      filters,
      order: 'created_at.desc',
      limit: params?.limit || 100,
    });
  }

  async getLead(id: number): Promise<ApiResponse<Lead>> {
    const result = await this.supabaseRequest<Lead[]>('leads', {
      filters: { id: `eq.${id}` },
      limit: 1,
    });

    if (result.success && result.data && result.data.length > 0) {
      return { success: true, data: result.data[0] };
    }
    return { success: false, error: 'Lead not found' };
  }

  async updateLead(id: number, data: Partial<Lead>): Promise<ApiResponse<Lead>> {
    const result = await this.supabaseRequest<Lead[]>('leads', {
      method: 'PATCH',
      filters: { id: `eq.${id}` },
      body: data,
    });

    if (result.success && result.data && result.data.length > 0) {
      return { success: true, data: result.data[0] };
    }
    return { success: false, error: result.error };
  }

  // ============================================================
  // LOTES
  // ============================================================

  async getLotes(): Promise<ApiResponse<Lote[]>> {
    return this.supabaseRequest<Lote[]>('lotes', {
      order: 'created_at.desc',
    });
  }

  async createLote(data: { nome: string; descricao?: string; cor?: string }): Promise<ApiResponse<Lote>> {
    const result = await this.supabaseRequest<Lote[]>('lotes', {
      method: 'POST',
      body: data,
    });

    if (result.success && result.data && result.data.length > 0) {
      return { success: true, data: result.data[0] };
    }
    return { success: false, error: result.error };
  }
}

// ============================================================
// EXPORT SINGLETON
// ============================================================

export const whatsappService = new WhatsAppSupabaseService();
export default whatsappService;
