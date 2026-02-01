/**
 * ============================================================
 * ChatWindow - Enterprise SaaS Style
 * Clean WhatsApp-like chat with proper spacing
 * ============================================================
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { 
  Send, Smile, Paperclip, Mic, MoreVertical,
  Image as ImageIcon, FileText, MapPin, Video, User,
  Check, CheckCheck, Clock, X, Zap, Calendar, StickyNote,
  Info, Pencil, Loader2, Plus, Trash2, MessageSquare, Cloud, RefreshCw
} from 'lucide-react'
import { useWhatsApp } from '../hooks/useWhatsApp'
import { supabase } from '../lib/supabase'
import { Mp3Encoder } from '@breezystack/lamejs'

// ============================================================
// FUNÇÃO DE CONVERSÃO WEBM PARA MP3
// ============================================================

async function convertWebmToMp3(webmBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const audioContext = new AudioContext()
        const arrayBuffer = reader.result as ArrayBuffer
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        
        // Converter para PCM
        const channels = audioBuffer.numberOfChannels
        const sampleRate = audioBuffer.sampleRate
        const samples = audioBuffer.length
        
        // Pegar dados do canal esquerdo (ou mono)
        const leftChannel = audioBuffer.getChannelData(0)
        const rightChannel = channels > 1 ? audioBuffer.getChannelData(1) : leftChannel
        
        // Converter float32 para int16
        const leftInt16 = new Int16Array(samples)
        const rightInt16 = new Int16Array(samples)
        
        for (let i = 0; i < samples; i++) {
          leftInt16[i] = Math.max(-32768, Math.min(32767, Math.round(leftChannel[i] * 32767)))
          rightInt16[i] = Math.max(-32768, Math.min(32767, Math.round(rightChannel[i] * 32767)))
        }
        
        // Criar encoder MP3
        const mp3Encoder = new Mp3Encoder(channels, sampleRate, 128)
        const mp3Data: ArrayBuffer[] = []
        const blockSize = 1152
        
        for (let i = 0; i < samples; i += blockSize) {
          const leftChunk = leftInt16.subarray(i, i + blockSize)
          const rightChunk = rightInt16.subarray(i, i + blockSize)
          const mp3buf = channels > 1 
            ? mp3Encoder.encodeBuffer(leftChunk, rightChunk)
            : mp3Encoder.encodeBuffer(leftChunk)
          if (mp3buf.length > 0) {
            mp3Data.push(new Uint8Array(mp3buf).buffer)
          }
        }
        
        // Finalizar
        const mp3End = mp3Encoder.flush()
        if (mp3End.length > 0) {
          mp3Data.push(new Uint8Array(mp3End).buffer)
        }
        
        // Criar blob MP3
        const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' })
        await audioContext.close()
        resolve(mp3Blob)
      } catch (error) {
        console.error('Erro na conversão para MP3:', error)
        reject(error)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(webmBlob)
  })
}

// ============================================================
// TYPES
// ============================================================

interface MessageUI {
  id: number
  wamid?: string
  content: string
  timestamp: string
  sent: boolean
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  type?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location'
  mediaUrl?: string
  mediaId?: string
  caption?: string
}

interface Lead {
  id: number | string
  nome: string | null
  telefone: string | null
  whatsapp_number_id?: string
  status?: string
  cidade?: string | null
  [key: string]: unknown
}

interface ChatWindowProps {
  selectedLead: Lead | null
  toggleRightPanel: () => void
  isRightPanelOpen: boolean
}

// ============================================================
// QUICK REPLIES DATA - Gerenciável via Supabase (nuvem)
// ============================================================

interface QuickReply {
  id: number
  command: string
  title: string
  content: string
  category: 'custom' | 'template'
}

const defaultQuickReplies: QuickReply[] = [
  // Templates padrão (fallback se não tiver conexão)
  { id: 1, command: '/oi', title: 'Saudação Inicial', content: 'Olá! 👋 Tudo bem? Sou da Smart Reforço, como posso ajudar você hoje?', category: 'template' },
  { id: 2, command: '/preco', title: 'Informar Preços', content: 'Nossos preços variam conforme o tipo de serviço. Posso enviar nossa tabela completa para você?', category: 'template' },
  { id: 3, command: '/demo', title: 'Agendar Demo', content: '📅 Gostaria de agendar uma demonstração gratuita? Tenho horários disponíveis esta semana!', category: 'template' },
  { id: 4, command: '/obrigado', title: 'Agradecimento', content: 'Muito obrigado pelo contato! 😊 Qualquer dúvida, estou à disposição.', category: 'template' },
  { id: 5, command: '/pix', title: 'Enviar PIX', content: '💰 Segue nossa chave PIX para pagamento:\n\nChave: contato@empresa.com.br\nNome: Empresa LTDA\nBanco: Banco X', category: 'template' },
  { id: 6, command: '/horario', title: 'Horário de Atendimento', content: '🕐 Nosso horário de atendimento:\n\n📆 Segunda a Sexta: 8h às 18h\n📆 Sábado: 9h às 13h\n🚫 Domingo: Fechado', category: 'template' },
  { id: 7, command: '/localizacao', title: 'Endereço', content: '📍 Nosso endereço:\n\nRua Exemplo, 123 - Centro\nCidade - Estado\nCEP: 00000-000\n\n🗺️ Link do Maps: [inserir link]', category: 'template' },
  { id: 8, command: '/aguarde', title: 'Pedir para Aguardar', content: 'Por favor, aguarde um momento enquanto verifico essa informação para você! ⏳', category: 'template' },
  { id: 9, command: '/fechou', title: 'Fechar Venda', content: '🎉 Excelente escolha! Estou finalizando seu pedido agora mesmo. Em breve você receberá a confirmação!', category: 'template' },
  { id: 10, command: '/voltar', title: 'Cliente Sumiu', content: 'Oi! 👋 Percebi que ficamos sem falar... Ainda está interessado? Posso ajudar em algo?', category: 'template' },
]

// ============================================================
// AUDIO PLAYER COMPONENT - WhatsApp Style
// ============================================================

interface AudioPlayerProps {
  src: string
  sent: boolean
}

function AudioPlayer({ src, sent }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [waveform] = useState(() => 
    Array.from({ length: 28 }, () => Math.random() * 0.7 + 0.3)
  )
  const audioRef = useRef<HTMLAudioElement>(null)

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
    if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const newTime = percentage * duration
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex items-center gap-3 p-3 min-w-[260px] max-w-[300px]">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />
      
      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
          sent 
            ? 'bg-white/20 hover:bg-white/30 text-white' 
            : 'bg-indigo-500 hover:bg-indigo-600 text-white'
        }`}
      >
        {isPlaying ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Waveform + Progress */}
      <div className="flex-1 flex flex-col gap-1">
        <div 
          className="flex items-center gap-[2px] h-8 cursor-pointer"
          onClick={handleSeek}
        >
          {waveform.map((height, i) => {
            const barProgress = (i / waveform.length) * 100
            const isActive = barProgress <= progress
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-all ${
                  sent
                    ? isActive ? 'bg-white' : 'bg-white/40'
                    : isActive ? 'bg-indigo-500' : 'bg-gray-300'
                }`}
                style={{ height: `${height * 100}%` }}
              />
            )
          })}
        </div>
        
        {/* Time */}
        <div className={`text-[10px] ${sent ? 'text-white/70' : 'text-gray-500'}`}>
          {formatTime(currentTime)} / {formatTime(duration || 0)}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// MESSAGE STATUS ICON
// ============================================================

function MessageStatus({ status }: { status?: string }) {
  switch (status) {
    case 'sending':
      return <Clock className="w-3.5 h-3.5 text-gray-400" />
    case 'sent':
      return <Check className="w-3.5 h-3.5 text-gray-400" />
    case 'delivered':
      return <CheckCheck className="w-3.5 h-3.5 text-gray-400" />
    case 'read':
      return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
    case 'failed':
      return <X className="w-3.5 h-3.5 text-red-500" />
    default:
      return null
  }
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ChatWindow({ selectedLead, toggleRightPanel, isRightPanelOpen }: ChatWindowProps) {
  // WhatsApp Hook - get sendText and messages
  const { 
    sendText, 
    messages: whatsappMessages, 
    loadMessages, 
    isLoading: isLoadingMessages,
    error 
  } = useWhatsApp()

  // Local state for UI messages
  const [messages, setMessages] = useState<MessageUI[]>([])
  
  const [inputValue, setInputValue] = useState('')
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [showQuickRepliesManager, setShowQuickRepliesManager] = useState(false)
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(defaultQuickReplies)
  const [quickRepliesLoading, setQuickRepliesLoading] = useState(false)
  const [quickReplyFilter, setQuickReplyFilter] = useState<'all' | 'custom' | 'template'>('all')
  const [newReplyTitle, setNewReplyTitle] = useState('')
  const [newReplyCommand, setNewReplyCommand] = useState('')
  const [newReplyContent, setNewReplyContent] = useState('')
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [tempName, setTempName] = useState('')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [previewMedia, setPreviewMedia] = useState<{ file: File; type: string; url: string } | null>(null)
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(20).fill(0))
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioMimeTypeRef = useRef<string>('audio/webm')

  // ============================================================
  // CARREGAR RESPOSTAS RÁPIDAS DO SUPABASE
  // ============================================================
  
  const loadQuickRepliesFromCloud = useCallback(async () => {
    try {
      setQuickRepliesLoading(true)
      const { data, error } = await supabase
        .from('quick_replies')
        .select('*')
        .order('category', { ascending: false })
        .order('created_at', { ascending: true })
      
      if (error) {
        console.error('Erro ao carregar respostas rápidas:', error)
        // Fallback para defaults se tabela não existir
        return
      }
      
      if (data && data.length > 0) {
        setQuickReplies(data.map(r => ({
          id: r.id,
          command: r.command,
          title: r.title,
          content: r.content,
          category: r.category as 'custom' | 'template'
        })))
      }
    } catch (err) {
      console.error('Erro ao carregar respostas rápidas:', err)
    } finally {
      setQuickRepliesLoading(false)
    }
  }, [])
  
  // Carregar respostas rápidas ao montar o componente
  useEffect(() => {
    loadQuickRepliesFromCloud()
  }, [loadQuickRepliesFromCloud])

  // Load messages when lead changes
  useEffect(() => {
    if (selectedLead?.telefone) {
      setMessages([]) // Clear previous messages
      loadMessages(selectedLead.telefone)
    } else {
      setMessages([])
    }
  }, [selectedLead?.telefone, loadMessages])

  // Sync whatsapp messages to local state - OTIMIZADO
  useEffect(() => {
    if (whatsappMessages && whatsappMessages.length > 0) {
      const uiMessages: MessageUI[] = whatsappMessages.map((msg, index) => {
        // Detectar tipo de mídia pela URL se não tiver tipo definido
        let messageType = msg.tipo as MessageUI['type']
        let mediaUrl = msg.media_url
        
        // Se o conteúdo é uma URL de imagem/vídeo/áudio, detectar automaticamente
        const content = msg.conteudo || ''
        const isMediaUrl = content.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|ogg|wav|pdf|doc|docx)(\?|$)/i) ||
                           content.includes('supabase.co/storage') ||
                           content.includes('/media/')
        
        if (isMediaUrl && !mediaUrl) {
          mediaUrl = content
          
          // Detectar tipo pela extensão
          if (content.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
            messageType = 'image'
          } else if (content.match(/\.(mp4|webm)/i)) {
            messageType = 'video'
          } else if (content.match(/\.(mp3|ogg|wav|webm)/i) && !content.match(/\.mp4/i)) {
            messageType = 'audio'
          } else if (content.match(/\.(pdf|doc|docx)/i)) {
            messageType = 'document'
          }
        }
        
        return {
          id: msg.id || index,
          wamid: msg.wamid,
          content: msg.conteudo || '',
          timestamp: msg.created_at 
            ? new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '',
          sent: msg.direcao === 'outgoing',
          status: msg.status as MessageUI['status'],
          type: messageType,
          mediaUrl: mediaUrl,
          mediaId: msg.media_id,
          caption: msg.caption
        }
      })
      
      // Mesclar mensagens do servidor com mensagens locais otimistas
      // Preservar mensagens locais com mediaUrl que ainda não foram sincronizadas
      setMessages(prev => {
        // Identificar mensagens locais otimistas (com ID numérico grande - timestamp)
        const localOptimisticMessages = prev.filter(m => 
          m.id > 1000000000000 && // IDs gerados com Date.now()
          !uiMessages.some(um => um.wamid === m.wamid)
        )
        
        // Combinar: mensagens do servidor + mensagens locais não sincronizadas
        return [...uiMessages, ...localOptimisticMessages]
      })
    }
  }, [whatsappMessages])

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Check for quick reply commands
  useEffect(() => {
    if (inputValue.startsWith('/')) {
      setShowQuickReplies(true)
    } else {
      setShowQuickReplies(false)
    }
  }, [inputValue])

  // ============================================================
  // GERENCIAMENTO DE RESPOSTAS RÁPIDAS (SUPABASE)
  // ============================================================
  
  const addQuickReply = async () => {
    if (!newReplyTitle.trim() || !newReplyContent.trim()) return
    
    const command = newReplyCommand.trim() || `/${newReplyTitle.toLowerCase().replace(/\s+/g, '')}`
    
    try {
      const { data, error } = await supabase
        .from('quick_replies')
        .insert({
          command,
          title: newReplyTitle.trim(),
          content: newReplyContent.trim(),
          category: 'custom'
        })
        .select()
        .single()
      
      if (error) {
        console.error('Erro ao adicionar resposta rápida:', error)
        return
      }
      
      if (data) {
        setQuickReplies(prev => [...prev, {
          id: data.id,
          command: data.command,
          title: data.title,
          content: data.content,
          category: data.category as 'custom' | 'template'
        }])
      }
      
      setNewReplyTitle('')
      setNewReplyCommand('')
      setNewReplyContent('')
    } catch (err) {
      console.error('Erro ao adicionar resposta rápida:', err)
    }
  }
  
  const deleteQuickReply = async (id: number) => {
    try {
      const { error } = await supabase
        .from('quick_replies')
        .delete()
        .eq('id', id)
      
      if (error) {
        console.error('Erro ao deletar resposta rápida:', error)
        return
      }
      
      setQuickReplies(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      console.error('Erro ao deletar resposta rápida:', err)
    }
  }
  
  const useQuickReply = (reply: QuickReply) => {
    setInputValue(reply.content)
    setShowQuickReplies(false)
    setShowQuickRepliesManager(false)
    inputRef.current?.focus()
  }
  
  const resetToDefaultReplies = async () => {
    try {
      // Deletar apenas as respostas custom do usuário
      const { error } = await supabase
        .from('quick_replies')
        .delete()
        .eq('category', 'custom')
      
      if (error) {
        console.error('Erro ao resetar respostas:', error)
        return
      }
      
      // Recarregar do cloud (vai manter só os templates)
      await loadQuickRepliesFromCloud()
    } catch (err) {
      console.error('Erro ao resetar respostas:', err)
    }
  }
  
  const filteredQuickReplies = quickReplies.filter(r => {
    if (quickReplyFilter === 'all') return true
    return r.category === quickReplyFilter
  }).filter(r => {
    if (!inputValue.startsWith('/')) return true
    const search = inputValue.slice(1).toLowerCase()
    return r.command.toLowerCase().includes(search) || r.title.toLowerCase().includes(search)
  })

  // ============================================================
  // UPLOAD DE ARQUIVO PARA SUPABASE STORAGE
  // ============================================================
  
  const uploadFileToStorage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop() || 'bin'
      const contentType = file.type || 'application/octet-stream'
      
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `chat-media/${fileName}`
      
      console.log('📤 Upload:', fileName, 'tipo:', contentType)
      
      const { error } = await supabase.storage
        .from('media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: contentType
        })
      
      if (error) {
        console.error('Erro no upload:', error)
        
        // Se erro de mime type, tentar como application/octet-stream
        if (error.message.includes('mime type')) {
          console.log('🔄 Tentando upload como octet-stream...')
          const { error: retryError } = await supabase.storage
            .from('media')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: false,
              contentType: 'application/octet-stream'
            })
          if (retryError) throw retryError
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(filePath)
          return urlData.publicUrl
        }
        
        // Tentar criar o bucket se não existir
        if (error.message.includes('bucket')) {
          const { error: createError } = await supabase.storage.createBucket('media', { public: true })
          if (!createError) {
            const { error: retryError } = await supabase.storage
              .from('media')
              .upload(filePath, file, { contentType })
            if (retryError) throw retryError
            const { data: urlData } = supabase.storage.from('media').getPublicUrl(filePath)
            return urlData.publicUrl
          }
        }
        throw error
      }
      
      // Obter URL pública
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(filePath)
      console.log('✅ Upload concluído:', urlData.publicUrl)
      return urlData.publicUrl
    } catch (error) {
      console.error('Erro no upload de arquivo:', error)
      return null
    }
  }

  // ============================================================
  // HANDLERS DE MÍDIA
  // ============================================================

  // Abrir seletor de arquivo
  const handleFileSelect = (acceptType: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = acceptType
      fileInputRef.current.click()
    }
    setShowAttachMenu(false)
  }

  // Processar arquivo selecionado
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedLead) return
    
    // Determinar tipo de mídia
    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document'
    if (file.type.startsWith('image/')) mediaType = 'image'
    else if (file.type.startsWith('video/')) mediaType = 'video'
    else if (file.type.startsWith('audio/')) mediaType = 'audio'
    
    // Criar preview
    const previewUrl = URL.createObjectURL(file)
    setPreviewMedia({ file, type: mediaType, url: previewUrl })
    
    // Limpar input
    e.target.value = ''
  }

  // Enviar mídia
  const handleSendMedia = async () => {
    if (!previewMedia || !selectedLead) return
    
    setIsUploading(true)
    setUploadProgress(0)
    
    try {
      // Simular progresso
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)
      
      // Upload para Supabase Storage
      const mediaUrl = await uploadFileToStorage(previewMedia.file)
      
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      if (!mediaUrl) {
        throw new Error('Falha no upload')
      }
      
      if (!selectedLead.telefone) return
      
      // Enviar via Edge Function
      const response = await fetch('https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec'
        },
        body: JSON.stringify({
          to: selectedLead.telefone!.replace(/\D/g, ''),
          type: previewMedia.type,
          content: mediaUrl,
          mediaUrl: mediaUrl,
          caption: inputValue.trim() || undefined,
          filename: previewMedia.file.name
        })
      })
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao enviar')
      }
      
      // Limpar preview e recarregar mensagens
      setPreviewMedia(null)
      setInputValue('')
      if (selectedLead.telefone) loadMessages(selectedLead.telefone)
      
    } catch (error) {
      console.error('Erro ao enviar mídia:', error)
      alert('Erro ao enviar mídia. Tente novamente.')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  // Cancelar envio de mídia
  const cancelMediaSend = () => {
    if (previewMedia) {
      URL.revokeObjectURL(previewMedia.url)
      setPreviewMedia(null)
    }
  }

  // ============================================================
  // GRAVAÇÃO DE ÁUDIO COM VISUALIZAÇÃO
  // ============================================================

  // Formatar tempo de gravação
  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Atualizar níveis de áudio para visualização
  const updateAudioLevels = () => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(dataArray)
      
      // Pegar amostras para as barras
      const levels: number[] = []
      const step = Math.floor(dataArray.length / 20)
      for (let i = 0; i < 20; i++) {
        const value = dataArray[i * step] / 255
        levels.push(value)
      }
      setAudioLevels(levels)
    }
    animationFrameRef.current = requestAnimationFrame(updateAudioLevels)
  }

  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      
      // Configurar AudioContext para visualização
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      
      // WhatsApp aceita: audio/ogg com codec opus, audio/mp4, audio/mpeg
      // Tentar opus primeiro (compatível com WhatsApp)
      let mimeType = 'audio/webm'
      if (MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')) {
        mimeType = 'audio/ogg; codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/webm; codecs=opus')) {
        mimeType = 'audio/webm; codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4'
      }
      console.log('🎤 Gravando áudio com formato:', mimeType)
      audioMimeTypeRef.current = mimeType
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        // Parar timer e animação
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
        setRecordingTime(0)
        setAudioLevels(new Array(20).fill(0))
        
        // Determinar extensão baseado no mimeType usado
        const usedMimeType = audioMimeTypeRef.current
        let audioBlob = new Blob(audioChunksRef.current, { type: usedMimeType })
        let finalBlob: Blob
        let ext: string
        let finalMimeType: string
        
        // Supabase Storage não aceita audio/ogg nem audio/webm
        // WhatsApp aceita: audio/mpeg (MP3), audio/mp4, audio/aac
        // Converter QUALQUER formato webm/ogg para MP3 para garantir compatibilidade
        if (usedMimeType.includes('webm') || usedMimeType.includes('ogg')) {
          console.log('🔄 Convertendo áudio para MP3 para compatibilidade...')
          try {
            finalBlob = await convertWebmToMp3(audioBlob)
            ext = 'mp3'
            finalMimeType = 'audio/mpeg'
            console.log('✅ Conversão para MP3 concluída! Tamanho:', finalBlob.size)
          } catch (convError) {
            console.warn('⚠️ Falha na conversão, tentando upload direto:', convError)
            finalBlob = audioBlob
            ext = 'mp3' // Usar mp3 mesmo assim para o Supabase aceitar
            finalMimeType = 'audio/mpeg'
          }
        } else if (usedMimeType.includes('mp4')) {
          finalBlob = audioBlob
          ext = 'mp4'
          finalMimeType = usedMimeType
        } else {
          // Fallback para MP3
          finalBlob = audioBlob
          ext = 'mp3'
          finalMimeType = 'audio/mpeg'
        }
        
        const audioFile = new File([finalBlob], `audio-${Date.now()}.${ext}`, { type: finalMimeType })
        
        // Limpar recursos
        audioContextRef.current?.close()
        stream.getTracks().forEach(track => track.stop())
        
        // Enviar áudio automaticamente
        if (!selectedLead) return
        
        setIsUploading(true)
        try {
          const publicUrl = await uploadFileToStorage(audioFile)
          if (!publicUrl) throw new Error('Falha no upload do áudio')
          
          // Adicionar mensagem otimisticamente
          const tempMsg: MessageUI = {
            id: Date.now(),
            content: '',
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            sent: true,
            status: 'sending',
            type: 'audio',
            mediaUrl: publicUrl
          }
          setMessages(prev => [...prev, tempMsg])
          
          // Enviar via Edge Function
          console.log('📤 Enviando áudio para:', selectedLead.telefone)
          console.log('📤 URL do áudio:', publicUrl)
          
          if (!selectedLead.telefone) return
          
          const response = await fetch('https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec'
            },
            body: JSON.stringify({
              to: selectedLead.telefone!.replace(/\D/g, ''),
              type: 'audio',
              content: publicUrl,
              sendType: 'audio',
              media_url: publicUrl
            })
          })

          const result = await response.json()
          console.log('📥 Resposta da Edge Function:', result)
          
          if (response.ok && result.success) {
            console.log('✅ Áudio enviado com sucesso!')
            setMessages(prev => prev.map(msg => 
              msg.id === tempMsg.id ? { ...msg, status: 'sent' } : msg
            ))
          } else {
            console.error('❌ Erro no envio:', result.error, result.error_data)
            throw new Error(result.error || 'Falha ao enviar áudio')
          }
        } catch (error) {
          console.error('Erro ao enviar áudio:', error)
          setMessages(prev => prev.map(msg => 
            msg.status === 'sending' ? { ...msg, status: 'failed' } : msg
          ))
        } finally {
          setIsUploading(false)
        }
      }
      
      mediaRecorder.start(100) // Coletar dados a cada 100ms
      setIsRecordingAudio(true)
      setRecordingTime(0)
      
      // Iniciar timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
      // Iniciar visualização
      updateAudioLevels()
      
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error)
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.')
    }
  }

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop()
      setIsRecordingAudio(false)
    }
  }

  const cancelAudioRecording = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop()
      setIsRecordingAudio(false)
      
      // Limpar sem criar preview
      setTimeout(() => {
        if (previewMedia?.type === 'audio') {
          URL.revokeObjectURL(previewMedia.url)
          setPreviewMedia(null)
        }
      }, 100)
    }
    
    // Limpar recursos
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop())
    audioContextRef.current?.close()
    
    setRecordingTime(0)
    setAudioLevels(new Array(20).fill(0))
  }

  // Send message handler
  const handleSend = async () => {
    if (!inputValue.trim() || !selectedLead || !selectedLead.telefone) return

    const messageContent = inputValue.trim()
    setInputValue('')
    inputRef.current?.focus()

    // Enviar via WhatsApp API - mensagem otimista é adicionada pelo hook
    try {
      await sendText(selectedLead.telefone!, messageContent)
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err)
    }
  }

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Apply quick reply
  const applyQuickReply = (reply: typeof quickReplies[0]) => {
    setInputValue(reply.content)
    setShowQuickReplies(false)
    inputRef.current?.focus()
  }

  // Common emojis
  const commonEmojis = ['😊', '👍', '❤️', '🙏', '😂', '🎉', '✅', '👏', '🔥', '💪', '📞', '📧']

  // No lead selected
  if (!selectedLead) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F8FAFC]">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-6">
            <Zap className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Selecione uma conversa</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            Escolha um contato na lista ao lado para iniciar ou continuar uma conversa.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC] h-full overflow-hidden">
      {/* Chat Header - FIXO */}
      <header className="h-[72px] min-h-[72px] px-6 flex items-center justify-between bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
            {selectedLead.nome?.charAt(0)?.toUpperCase() || '?'}
          </div>
          
          {/* Name & Status */}
          <div>
            {editingName ? (
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingName(false)
                  if (e.key === 'Escape') {
                    setTempName(selectedLead.nome || '')
                    setEditingName(false)
                  }
                }}
                autoFocus
                className="text-base font-semibold text-gray-900 bg-gray-50 px-2 py-1 rounded border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <button 
                onClick={() => {
                  setTempName(selectedLead.nome || '')
                  setEditingName(true)
                }}
                className="flex items-center gap-2 group"
              >
                <span className="text-base font-semibold text-gray-900">
                  {selectedLead.nome || 'Sem nome'}
                </span>
                <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{selectedLead.telefone}</span>
              {selectedLead.cidade && (
                <>
                  <span className="text-gray-300">•</span>
                  <span>{selectedLead.cidade}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1">
          <button 
            onClick={toggleRightPanel}
            className={`p-2.5 rounded-lg transition-colors ${
              isRightPanelOpen 
                ? 'bg-indigo-50 text-indigo-600' 
                : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <Info className="w-5 h-5" />
          </button>
          <button className="p-2.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Messages Area - COM SCROLL */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-sm text-gray-500">Carregando mensagens...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                <X className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Erro ao carregar mensagens</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">
                {error}
              </p>
              <button
                onClick={() => selectedLead?.telefone && loadMessages(selectedLead.telefone)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhuma mensagem ainda</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Seja o primeiro a enviar uma mensagem para {selectedLead.nome}!
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sent ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl shadow-sm overflow-hidden ${
                    message.sent
                      ? 'bg-indigo-600 text-white rounded-br-md'
                      : 'bg-white text-gray-900 border border-gray-100 rounded-bl-md'
                  }`}
                >
                  {/* Media Content */}
                  {message.type === 'image' && message.mediaUrl && (
                    <div className="relative">
                      <img 
                        src={message.mediaUrl} 
                        alt="Imagem" 
                        className="max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(message.mediaUrl, '_blank')}
                      />
                      {/* Legenda da imagem */}
                      {message.caption && (
                        <div className={`px-3 py-2 text-sm ${message.sent ? 'text-white/90' : 'text-gray-700'}`}>
                          {message.caption}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {message.type === 'video' && message.mediaUrl && (
                    <div className="relative">
                      <video 
                        src={message.mediaUrl} 
                        controls 
                        className="max-w-full max-h-64 rounded-t-2xl"
                        preload="metadata"
                      />
                    </div>
                  )}
                  
                  {message.type === 'audio' && message.mediaUrl && (
                    <AudioPlayer 
                      src={message.mediaUrl} 
                      sent={message.sent}
                    />
                  )}
                  
                  {message.type === 'document' && (
                    <div className="p-3 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        message.sent ? 'bg-indigo-500' : 'bg-gray-100'
                      }`}>
                        <FileText className={`w-5 h-5 ${message.sent ? 'text-white' : 'text-gray-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${message.sent ? 'text-white' : 'text-gray-900'}`}>
                          {message.content || 'Documento'}
                        </p>
                        {message.mediaUrl && (
                          <a 
                            href={message.mediaUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={`text-xs ${message.sent ? 'text-indigo-200 hover:text-white' : 'text-indigo-600 hover:underline'}`}
                          >
                            Baixar
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {message.type === 'sticker' && message.mediaUrl && (
                    <div className="p-2">
                      <img 
                        src={message.mediaUrl} 
                        alt="Sticker" 
                        className="w-32 h-32 object-contain"
                      />
                    </div>
                  )}
                  
                  {message.type === 'location' && (
                    <div className="p-3 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        message.sent ? 'bg-indigo-500' : 'bg-red-100'
                      }`}>
                        <MapPin className={`w-5 h-5 ${message.sent ? 'text-white' : 'text-red-600'}`} />
                      </div>
                      <p className={`text-sm ${message.sent ? 'text-white' : 'text-gray-900'}`}>
                        {message.content || 'Localização'}
                      </p>
                    </div>
                  )}
                  
                  {/* Text Content - mostrar apenas se for texto ou legenda (não URL de mídia) */}
                  {message.content && 
                   message.type !== 'document' && 
                   message.type !== 'location' && 
                   message.type !== 'image' && 
                   message.type !== 'video' && 
                   message.type !== 'audio' && 
                   message.type !== 'sticker' &&
                   !message.content.match(/^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|ogg|wav|pdf|doc)/i) && (
                    <div className="px-4 py-3">
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                  )}
                  
                  {/* Se não tem mídia e não tem texto específico */}
                  {!message.mediaUrl && !message.content && (
                    <div className="px-4 py-3">
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-gray-400 italic">
                        [{message.type || 'mensagem'}]
                      </p>
                    </div>
                  )}
                  
                  {/* Timestamp & Status */}
                  <div className={`flex items-center justify-end gap-1.5 px-4 pb-2 ${
                    message.sent ? 'text-indigo-200' : 'text-gray-400'
                  }`}>
                    <span className="text-xs">{message.timestamp}</span>
                    {message.sent && <MessageStatus status={message.status} />}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Quick Replies Dropdown - aparece quando digita / */}
      {showQuickReplies && filteredQuickReplies.length > 0 && (
        <div className="mx-6 mb-2 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-semibold text-indigo-700">Respostas Rápidas</span>
            </div>
            <span className="text-xs text-gray-500">{filteredQuickReplies.length} encontrada(s)</span>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {filteredQuickReplies.map((reply) => (
              <button
                key={reply.id}
                onClick={() => applyQuickReply(reply)}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md font-semibold">
                    {reply.command}
                  </span>
                  <span className="text-sm font-medium text-gray-900 group-hover:text-indigo-700">{reply.title}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    reply.category === 'custom' 
                      ? 'bg-green-100 text-green-600' 
                      : 'bg-purple-100 text-purple-600'
                  }`}>
                    {reply.category === 'custom' ? '✨' : '📋'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 truncate pl-0.5">{reply.content}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div className="mx-6 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 p-3">
          <div className="flex flex-wrap gap-2">
            {commonEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  setInputValue(prev => prev + emoji)
                  setShowEmojiPicker(false)
                  inputRef.current?.focus()
                }}
                className="w-10 h-10 text-xl hover:bg-gray-100 rounded-lg transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Attachment Menu */}
      {showAttachMenu && (
        <div className="mx-6 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 p-2">
          <div className="grid grid-cols-4 gap-1">
            <button
              onClick={() => handleFileSelect('image/*')}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-full text-green-600 bg-green-50 flex items-center justify-center">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-xs text-gray-600">Imagem</span>
            </button>
            
            <button
              onClick={() => handleFileSelect('video/*')}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-full text-blue-600 bg-blue-50 flex items-center justify-center">
                <Video className="w-5 h-5" />
              </div>
              <span className="text-xs text-gray-600">Vídeo</span>
            </button>
            
            <button
              onClick={() => handleFileSelect('audio/*')}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-full text-orange-600 bg-orange-50 flex items-center justify-center">
                <Mic className="w-5 h-5" />
              </div>
              <span className="text-xs text-gray-600">Áudio</span>
            </button>
            
            <button
              onClick={() => handleFileSelect('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt')}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-full text-purple-600 bg-purple-50 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-xs text-gray-600">Documento</span>
            </button>
          </div>
        </div>
      )}

      {/* Input de arquivo oculto */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Preview de Mídia */}
      {previewMedia && (
        <div className="mx-6 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 p-4">
          <div className="flex items-start gap-4">
            {/* Preview */}
            <div className="flex-shrink-0">
              {previewMedia.type === 'image' && (
                <img 
                  src={previewMedia.url} 
                  alt="Preview" 
                  className="w-24 h-24 object-cover rounded-lg"
                />
              )}
              {previewMedia.type === 'video' && (
                <video 
                  src={previewMedia.url} 
                  className="w-24 h-24 object-cover rounded-lg"
                />
              )}
              {previewMedia.type === 'audio' && (
                <div className="w-24 h-24 bg-orange-50 rounded-lg flex items-center justify-center">
                  <Mic className="w-10 h-10 text-orange-500" />
                </div>
              )}
              {previewMedia.type === 'document' && (
                <div className="w-24 h-24 bg-purple-50 rounded-lg flex items-center justify-center">
                  <FileText className="w-10 h-10 text-purple-500" />
                </div>
              )}
            </div>
            
            {/* Info e Ações */}
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 truncate mb-1">
                {previewMedia.file.name}
              </p>
              <p className="text-xs text-gray-500 mb-3">
                {(previewMedia.file.size / 1024 / 1024).toFixed(2)} MB
              </p>
              
              {/* Caption input */}
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Adicionar legenda..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              
              {/* Progress bar */}
              {isUploading && (
                <div className="mt-3">
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Enviando... {uploadProgress}%</p>
                </div>
              )}
            </div>
            
            {/* Botões */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSendMedia}
                disabled={isUploading}
                className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {isUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={cancelMediaSend}
                disabled={isUploading}
                className="w-10 h-10 bg-gray-100 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input Area - FIXO */}
      <div className="p-4 bg-white border-t border-gray-100 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-3">
          
          {/* Recording UI - Mostrar quando gravando */}
          {isRecordingAudio ? (
            <>
              {/* Cancel Recording Button */}
              <button
                onClick={cancelAudioRecording}
                className="w-12 h-12 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-200 transition-colors"
                title="Cancelar gravação"
              >
                <X className="w-5 h-5" />
              </button>
              
              {/* Recording Visualizer */}
              <div className="flex-1 h-12 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 px-4 overflow-hidden">
                {/* Timer */}
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-red-600 font-mono font-medium text-sm min-w-[40px]">
                    {formatRecordingTime(recordingTime)}
                  </span>
                </div>
                
                {/* Spectrum Bars */}
                <div className="flex-1 flex items-center justify-center gap-[3px] h-8">
                  {audioLevels.map((level, i) => (
                    <div
                      key={i}
                      className="w-[4px] bg-red-500 rounded-full transition-all duration-75"
                      style={{ 
                        height: `${Math.max(4, level * 28)}px`,
                        opacity: 0.5 + level * 0.5
                      }}
                    />
                  ))}
                </div>
                
                {/* Recording Label */}
                <span className="text-red-600 text-xs font-medium">
                  Gravando...
                </span>
              </div>
              
              {/* Stop Recording Button */}
              <button
                onClick={stopAudioRecording}
                className="w-12 h-12 bg-red-500 text-white rounded-xl flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg shadow-red-200"
                title="Parar e enviar"
              >
                <Check className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              {/* Attachment Button */}
              <button
                onClick={() => {
                  setShowAttachMenu(!showAttachMenu)
                  setShowEmojiPicker(false)
                }}
                className={`p-2.5 rounded-lg transition-colors ${
                  showAttachMenu 
                    ? 'bg-indigo-50 text-indigo-600' 
                    : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Emoji Button */}
              <button
                onClick={() => {
                  setShowEmojiPicker(!showEmojiPicker)
                  setShowAttachMenu(false)
                }}
                className={`p-2.5 rounded-lg transition-colors ${
                  showEmojiPicker 
                    ? 'bg-indigo-50 text-indigo-600' 
                    : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <Smile className="w-5 h-5" />
              </button>

              {/* Text Input */}
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite uma mensagem..."
                  rows={1}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                  style={{ 
                    minHeight: '48px', 
                    maxHeight: '120px',
                    lineHeight: '1.5',
                    overflow: 'auto'
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = '48px'
                    target.style.height = Math.min(target.scrollHeight, 120) + 'px'
                  }}
                />
              </div>

              {/* Send / Record Button */}
              {inputValue.trim() ? (
                <button
                  onClick={handleSend}
                  className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                  <Send className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={startAudioRecording}
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-all bg-gray-100 text-gray-500 hover:bg-gray-200"
                  title="Gravar áudio"
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="max-w-3xl mx-auto mt-3 flex items-center gap-2">
          <button 
            onClick={() => setShowQuickRepliesManager(true)}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-medium hover:opacity-90 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Respostas rápidas
          </button>
          <button className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Agendar
          </button>
          <button className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" />
            Nota
          </button>
        </div>
      </div>

      {/* Quick Replies Manager Modal */}
      {showQuickRepliesManager && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      Respostas Rápidas
                      <span className="flex items-center gap-1 text-xs font-normal bg-white/20 px-2 py-0.5 rounded-full">
                        <Cloud className="w-3 h-3" />
                        Sincronizado
                      </span>
                    </h2>
                    <p className="text-indigo-100 text-sm">Crie templates para agilizar seu atendimento</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowQuickRepliesManager(false)}
                  className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="px-6 pt-4 flex gap-2">
              {[
                { id: 'all' as const, label: 'Todas', icon: Zap },
                { id: 'custom' as const, label: 'Minhas', icon: User },
                { id: 'template' as const, label: 'Templates', icon: FileText }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setQuickReplyFilter(tab.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                    quickReplyFilter === tab.id
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
              <button
                onClick={loadQuickRepliesFromCloud}
                disabled={quickRepliesLoading}
                className="ml-auto px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-gray-500 hover:bg-gray-100 transition-all disabled:opacity-50"
                title="Atualizar da nuvem"
              >
                <RefreshCw className={`w-4 h-4 ${quickRepliesLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {quickRepliesLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 mx-auto text-indigo-600 animate-spin mb-3" />
                  <p className="text-sm text-gray-500">Carregando respostas...</p>
                </div>
              ) : (
              <>
              {/* New Reply Form */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 mb-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-indigo-600" />
                  Criar nova resposta
                </h3>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Título (ex: Saudação)"
                      value={newReplyTitle}
                      onChange={(e) => setNewReplyTitle(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Comando (ex: /oi)"
                      value={newReplyCommand}
                      onChange={(e) => setNewReplyCommand(e.target.value)}
                      className="w-32 px-3 py-2 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm font-mono"
                    />
                  </div>
                  <textarea
                    placeholder="Conteúdo da mensagem... Use {nome} para inserir o nome do contato"
                    value={newReplyContent}
                    onChange={(e) => setNewReplyContent(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm resize-none"
                  />
                  <button
                    onClick={addQuickReply}
                    disabled={!newReplyTitle.trim() || !newReplyContent.trim()}
                    className="w-full py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar Resposta
                  </button>
                </div>
              </div>

              {/* Replies List */}
              <div className="space-y-2">
                {filteredQuickReplies.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
                      <MessageSquare className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 text-sm">Nenhuma resposta rápida encontrada</p>
                    <p className="text-gray-400 text-xs mt-1">Crie sua primeira resposta acima!</p>
                  </div>
                ) : (
                  filteredQuickReplies.map((reply) => (
                    <div
                      key={reply.id}
                      className="group bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                              {reply.command}
                            </span>
                            <span className="font-medium text-gray-900">{reply.title}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              reply.category === 'custom' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-purple-100 text-purple-700'
                            }`}>
                              {reply.category === 'custom' ? 'Minha' : 'Template'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">{reply.content}</p>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => useQuickReply(reply)}
                            className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                            title="Usar esta resposta"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          {reply.category === 'custom' && (
                            <button
                              onClick={() => deleteQuickReply(reply.id)}
                              className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={resetToDefaultReplies}
                className="text-xs text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Excluir minhas respostas
              </button>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Cloud className="w-3 h-3" />
                Salvo automaticamente na nuvem
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
