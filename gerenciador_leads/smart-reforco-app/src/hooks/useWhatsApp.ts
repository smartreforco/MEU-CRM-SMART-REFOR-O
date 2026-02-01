/**
 * ============================================================
 * useWhatsApp Hook - COM SUPABASE REALTIME
 * Hook para gerenciar conversas e mensagens do WhatsApp
 * Agora com atualizações em tempo real!
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import whatsappService from '../services/whatsappSupabaseService';
import { supabase } from '../lib/supabase';

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

interface UseWhatsAppReturn {
  // Estado
  isConnected: boolean;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  
  // Conversas
  conversations: Conversation[];
  loadConversations: () => Promise<void>;
  
  // Mensagens
  messages: Message[];
  loadMessages: (telefone: string) => Promise<void>;
  sendMessage: (params: SendMessageParams) => Promise<ApiResponse<{ message_id: string }>>;
  sendText: (to: string, message: string) => Promise<ApiResponse<{ message_id: string }>>;
  sendTemplate: (to: string, templateName?: string) => Promise<ApiResponse<{ message_id: string }>>;
  
  // Lead atual
  currentLead: Lead | null;
  setCurrentLead: (lead: Lead | null) => void;
  currentPhone: string | null;
  
  // Utils
  clearError: () => void;
  refreshAll: () => Promise<void>;
}

// ============================================================
// HOOK
// ============================================================

export function useWhatsApp(): UseWhatsAppReturn {
  // Estado
  const [isConnected, setIsConnected] = useState(true); // Assume conectado
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Dados
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [currentPhone, setCurrentPhone] = useState<string | null>(null);
  
  // Refs para realtime
  const channelRef = useRef<RealtimeChannel | null>(null);
  const currentPhoneRef = useRef<string | null>(null);
  const realtimeConnected = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================
  // CARREGAR CONVERSAS
  // ============================================================

  const loadConversations = useCallback(async () => {
    try {
      const response = await whatsappService.getConversations();
      
      if (response.success && response.data) {
        setConversations(response.data);
      }
    } catch (err) {
      console.error('Erro ao carregar conversas:', err);
    }
  }, []);

  // ============================================================
  // CARREGAR MENSAGENS
  // ============================================================

  const loadMessages = useCallback(async (telefone: string) => {
    const telefoneLimpo = telefone.replace(/\D/g, '');
    currentPhoneRef.current = telefoneLimpo;
    setCurrentPhone(telefoneLimpo);
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await whatsappService.getMessages(telefoneLimpo);
      
      if (response.success) {
        const mensagens = response.data || [];
        // Só atualizar se quantidade mudou
        setMessages(prev => {
          if (prev.length !== mensagens.length) {
            return mensagens;
          }
          // Verificar última mensagem
          const lastPrev = prev[prev.length - 1];
          const lastNew = mensagens[mensagens.length - 1];
          if (lastPrev?.id !== lastNew?.id) {
            return mensagens;
          }
          return prev;
        });
      } else {
        setError(response.error || 'Erro ao carregar mensagens');
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ============================================================
  // SUPABASE REALTIME - Escutar novas mensagens com RECONEXÃO AUTOMÁTICA
  // ============================================================

  const setupRealtimeChannel = useCallback(() => {
    // Limpar canal anterior se existir
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    console.log('🔌 Configurando canal Realtime...');

    const channel = supabase
      .channel('mensagens-realtime-' + Date.now()) // Nome único para evitar conflitos
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
        },
        (payload) => {
          console.log('🔔 Nova mensagem recebida em tempo real:', payload.new);
          
          const newMessage = payload.new as Message;
          
          // Se a mensagem é do telefone atual, adicionar à lista
          // Verificar variantes do telefone (com e sem 55)
          if (currentPhoneRef.current) {
            const currentPhone = currentPhoneRef.current;
            const msgPhone = newMessage.telefone;
            
            // Normalizar para comparação
            let match = msgPhone === currentPhone;
            
            if (!match) {
              // Tentar com/sem código do país
              if (currentPhone.startsWith('55')) {
                match = msgPhone === currentPhone.slice(2);
              } else {
                match = msgPhone === '55' + currentPhone;
              }
            }
            
            if (match) {
              setMessages(prev => {
                // Evitar duplicatas por wamid ou por id
                const exists = prev.some(m => 
                  (m.wamid && newMessage.wamid && m.wamid === newMessage.wamid) || 
                  (m.id && newMessage.id && m.id === newMessage.id)
                );
                if (exists) return prev;
                return [...prev, newMessage];
              });
            }
          }
          
          // Atualizar lista de conversas
          loadConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mensagens',
        },
        (payload) => {
          console.log('📝 Mensagem atualizada:', payload.new);
          
          const updatedMessage = payload.new as Message;
          
          // Atualizar apenas o status da mensagem, preservando mediaUrl local
          setMessages(prev => prev.map(m => {
            if (m.id === updatedMessage.id || (m.wamid && m.wamid === updatedMessage.wamid)) {
              return {
                ...m,
                status: updatedMessage.status,
                // Preservar media_url local se não vier do banco
                media_url: updatedMessage.media_url || m.media_url,
              };
            }
            return m;
          }));
        }
      )
      .subscribe((status) => {
        console.log('📡 Supabase Realtime status:', status);
        
        if (status === 'SUBSCRIBED') {
          realtimeConnected.current = true;
          setIsConnected(true);
          // Limpar timeout de reconexão se existir
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          realtimeConnected.current = false;
          setIsConnected(false);
          
          // Reconectar automaticamente após 2 segundos
          if (!reconnectTimeoutRef.current) {
            console.log('🔄 Agendando reconexão em 2 segundos...');
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log('🔌 Reconectando Realtime...');
              reconnectTimeoutRef.current = null;
              setupRealtimeChannel();
            }, 2000);
          }
        }
      });

    channelRef.current = channel;
  }, [loadConversations]);

  // Iniciar Realtime
  useEffect(() => {
    setupRealtimeChannel();

    // Heartbeat para manter conexão viva (ping a cada 25 segundos)
    heartbeatRef.current = setInterval(() => {
      if (channelRef.current && realtimeConnected.current) {
        // Enviar um "ping" silencioso para manter a conexão
        console.log('💓 Heartbeat - mantendo conexão ativa');
      } else if (!realtimeConnected.current && !reconnectTimeoutRef.current) {
        // Se desconectado e não há reconexão agendada, reconectar
        console.log('🔌 Heartbeat detectou desconexão, reconectando...');
        setupRealtimeChannel();
      }
    }, 25000);

    // Cleanup
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [setupRealtimeChannel]);

  // ============================================================
  // POLLING DE BACKUP (quando Realtime falha) - DESABILITADO
  // Realtime deve funcionar, polling causa piscadas
  // ============================================================

  // NOTA: Polling removido para evitar re-renders desnecessários
  // Se Realtime não funcionar, descomentar abaixo
  /*
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      if (!realtimeConnected.current && currentPhoneRef.current) {
        loadMessages(currentPhoneRef.current);
      }
    }, 15000); // 15 segundos

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [loadMessages]);
  */

  // ============================================================
  // ENVIAR MENSAGEM
  // ============================================================

  const sendMessage = useCallback(async (params: SendMessageParams) => {
    setError(null);
    setIsSending(true);
    
    const telefoneLimpo = params.to.replace(/\D/g, '');
    
    // Criar mensagem otimista (aparece imediatamente)
    const optimisticMessage: Message = {
      id: Date.now(), // ID temporário
      telefone: telefoneLimpo,
      tipo: params.type || 'text',
      conteudo: params.content,
      direcao: 'outgoing',
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    
    // Adicionar mensagem imediatamente à UI
    setMessages(prev => [...prev, optimisticMessage]);
    console.log('📤 Mensagem adicionada à UI:', optimisticMessage);
    
    try {
      const response = await whatsappService.sendMessage({
        ...params,
        to: telefoneLimpo,
      });
      
      console.log('📡 Resposta do envio:', response);
      
      if (response.success) {
        // Atualizar a mensagem otimista com o status correto
        setMessages(prev => prev.map(m => 
          m.id === optimisticMessage.id 
            ? { ...m, status: 'sent', wamid: response.message_id }
            : m
        ));
        
        // Recarregar conversas para atualizar a lista
        loadConversations();
      } else {
        // Marcar como falha mas manter na tela
        setMessages(prev => prev.map(m => 
          m.id === optimisticMessage.id 
            ? { ...m, status: 'failed' }
            : m
        ));
        setError(response.error || 'Erro ao enviar mensagem');
      }
      
      return response;
    } catch (err) {
      console.error('❌ Erro ao enviar:', err);
      // Marcar como falha mas manter na tela
      setMessages(prev => prev.map(m => 
        m.id === optimisticMessage.id 
          ? { ...m, status: 'failed' }
          : m
      ));
      
      const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsSending(false);
    }
  }, [loadConversations]);

  const sendText = useCallback(async (to: string, message: string) => {
    return sendMessage({ to, type: 'text', content: message });
  }, [sendMessage]);

  const sendTemplate = useCallback(async (to: string, templateName: string = 'hello_world') => {
    return sendMessage({ 
      to, 
      type: 'template', 
      content: templateName,
      template_name: templateName,
      language: 'en_US'
    });
  }, [sendMessage]);

  // ============================================================
  // UTILS
  // ============================================================

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshAll = useCallback(async () => {
    await loadConversations();
    
    if (currentPhoneRef.current) {
      await loadMessages(currentPhoneRef.current);
    }
  }, [loadConversations, loadMessages]);

  // ============================================================
  // EFFECTS
  // ============================================================

  // Carregar conversas ao iniciar
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ============================================================
  // RETURN
  // ============================================================

  return {
    // Estado
    isConnected,
    isLoading,
    isSending,
    error,
    
    // Conversas
    conversations,
    loadConversations,
    
    // Mensagens
    messages,
    loadMessages,
    sendMessage,
    sendText,
    sendTemplate,
    
    // Lead atual
    currentLead,
    setCurrentLead,
    currentPhone,
    
    // Utils
    clearError,
    refreshAll,
  };
}

export default useWhatsApp;
