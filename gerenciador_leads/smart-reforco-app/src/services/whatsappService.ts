/**
 * ============================================================
 * SMART REFORÇO - WhatsApp API Service
 * Conexão com o backend Flask + WhatsApp Business Cloud API
 * ============================================================
 */

// Configuração da API
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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
// API CLIENT
// ============================================================

class WhatsAppService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Faz requisição para a API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================
  // STATUS
  // ============================================================

  /**
   * Verifica status da API
   */
  async getStatus(): Promise<ApiResponse<{
    status: string;
    whatsapp_configured: boolean;
    supabase_configured: boolean;
    timestamp: string;
  }>> {
    return this.request('/api/status');
  }

  // ============================================================
  // MENSAGENS
  // ============================================================

  /**
   * Envia mensagem
   */
  async sendMessage(params: SendMessageParams): Promise<ApiResponse<{ message_id: string }>> {
    return this.request('/api/send', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Envia mensagem de texto simples
   */
  async sendText(to: string, message: string): Promise<ApiResponse<{ message_id: string }>> {
    return this.sendMessage({
      to,
      type: 'text',
      content: message,
    });
  }

  /**
   * Envia template (para iniciar conversa ou marketing)
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
   * Busca mensagens de um telefone
   */
  async getMessages(telefone: string, limit: number = 50): Promise<ApiResponse<Message[]>> {
    const response = await this.request<{ messages: Message[] }>(
      `/api/messages/${telefone}?limit=${limit}`
    );
    
    if (response.success && response.data) {
      return { success: true, data: (response as any).messages || response.data };
    }
    return { success: false, error: response.error };
  }

  /**
   * Lista todas as conversas
   */
  async getConversations(): Promise<ApiResponse<Conversation[]>> {
    const response = await this.request<{ conversations: Conversation[] }>('/api/conversations');
    
    if (response.success) {
      return { success: true, data: (response as any).conversations || [] };
    }
    return { success: false, error: response.error };
  }

  // ============================================================
  // LEADS
  // ============================================================

  /**
   * Lista leads
   */
  async getLeads(params?: {
    limit?: number;
    lote_id?: number;
    etapa?: string;
  }): Promise<ApiResponse<Lead[]>> {
    const query = new URLSearchParams();
    
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.lote_id) query.set('lote_id', params.lote_id.toString());
    if (params?.etapa) query.set('etapa', params.etapa);
    
    return this.request(`/api/leads?${query.toString()}`);
  }

  /**
   * Busca lead por ID
   */
  async getLead(id: number): Promise<ApiResponse<Lead>> {
    const response = await this.request<{ lead: Lead }>(`/api/leads/${id}`);
    
    if (response.success && response.data) {
      return { success: true, data: (response as any).lead || response.data };
    }
    return { success: false, error: response.error };
  }

  /**
   * Atualiza lead
   */
  async updateLead(id: number, data: Partial<Lead>): Promise<ApiResponse<Lead>> {
    return this.request(`/api/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ============================================================
  // LOTES
  // ============================================================

  /**
   * Lista lotes
   */
  async getLotes(): Promise<ApiResponse<Lote[]>> {
    return this.request('/api/lotes');
  }

  /**
   * Cria lote
   */
  async createLote(data: { nome: string; descricao?: string; cor?: string }): Promise<ApiResponse<Lote>> {
    return this.request('/api/lotes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
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

export const whatsappService = new WhatsAppService();
export default whatsappService;
