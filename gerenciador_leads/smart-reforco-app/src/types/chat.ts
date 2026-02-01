/**
 * ============================================================
 * SMART REFORÇO - Tipos do Chat
 * ============================================================
 */

// Contato (Lead estendido para chat)
export interface Contact {
  id: number;
  phone: string; // Com DDI, ex: 5511999998888
  name: string | null;
  profile_pic_url?: string;
  tags: string[];
  custom_fields?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

// Mensagem
export interface Message {
  id: number;
  contact_id?: number;
  telefone: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'template';
  status: 'pending' | 'scheduled' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  direction: 'incoming' | 'outgoing';
  is_scheduled: boolean;
  scheduled_for?: string; // ISO datetime
  media_url?: string;
  media_id?: string;
  media_mime?: string;
  media_filename?: string;
  wamid?: string;
  reply_to_id?: number;
  created_at: string;
  timestamp_whatsapp?: string;
}

// Resposta Rápida
export interface QuickReply {
  id: number;
  shortcut: string; // Ex: "/precos", "/horarios"
  title: string; // Título curto para exibir no menu
  content: string; // Conteúdo completo da mensagem
  category?: string; // Ex: "vendas", "suporte"
  created_at: string;
}

// Nota Interna (invisível ao cliente)
export interface InternalNote {
  id: number;
  contact_id: number;
  content: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

// Tag
export interface Tag {
  id: number;
  name: string;
  color: string; // Cor hex ou classe Tailwind
  created_at: string;
}

// Mensagem Agendada
export interface ScheduledMessage {
  id: number;
  contact_id: number;
  content: string;
  type: 'text' | 'template';
  scheduled_for: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  created_at: string;
}

// Para UI do Chat
export interface MessageUI {
  id: number;
  content: string;
  timestamp: string;
  sent: boolean;
  status: 'pending' | 'scheduled' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'template';
  mediaUrl?: string;
  mediaDuration?: number;
  fileName?: string;
  replyTo?: MessageUI;
  starred?: boolean;
  wamid?: string;
  isScheduled?: boolean;
  scheduledFor?: string;
}

// Aba ativa do chat
export type ChatTab = 'conversa' | 'notas';

// Quick Reply para menu
export interface QuickReplyOption {
  shortcut: string;
  title: string;
  content: string;
}

// Dados de higienização de telefone
export interface PhoneSearchResult {
  original: string;
  cleaned: string; // Apenas números
  formatted: string; // Formatado para exibição
  isValid: boolean;
  exists: boolean; // Se existe no banco
  contact?: Contact;
}
