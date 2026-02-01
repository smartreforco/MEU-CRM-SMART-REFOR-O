/**
 * ============================================================
 * ChatModal - Enterprise SaaS Style
 * Modal chat for Kanban board - REAL MESSAGES
 * ============================================================
 */

import { useState, useRef, useEffect } from 'react'
import { 
  X, Send, Smile, Paperclip, 
  Check, CheckCheck, Clock, Maximize2,
  FileText, Mic, Image as ImageIcon, Video, Loader2
} from 'lucide-react'
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
        
        const channels = audioBuffer.numberOfChannels
        const sampleRate = audioBuffer.sampleRate
        const samples = audioBuffer.length
        
        const leftChannel = audioBuffer.getChannelData(0)
        const rightChannel = channels > 1 ? audioBuffer.getChannelData(1) : leftChannel
        
        const leftInt16 = new Int16Array(samples)
        const rightInt16 = new Int16Array(samples)
        
        for (let i = 0; i < samples; i++) {
          leftInt16[i] = Math.max(-32768, Math.min(32767, Math.round(leftChannel[i] * 32767)))
          rightInt16[i] = Math.max(-32768, Math.min(32767, Math.round(rightChannel[i] * 32767)))
        }
        
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
        
        const mp3End = mp3Encoder.flush()
        if (mp3End.length > 0) {
          mp3Data.push(new Uint8Array(mp3End).buffer)
        }
        
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

interface Lead {
  id: number | string
  nome: string | null
  telefone: string | null
  whatsapp_number_id?: string
  [key: string]: unknown
}

interface Message {
  id: number | string
  content: string
  timestamp: string
  sent: boolean
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  type?: 'text' | 'image' | 'video' | 'audio' | 'document'
  mediaUrl?: string
  caption?: string
}

interface ChatModalProps {
  lead: Lead
  onClose: () => void
  onGoToFullChat: () => void
}

// ============================================================
// QUICK REPLIES
// ============================================================

// ============================================================
// AUDIO PLAYER COMPONENT - WhatsApp Style (Mini)
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
    Array.from({ length: 20 }, () => Math.random() * 0.7 + 0.3)
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
    <div className="flex items-center gap-2 p-2 min-w-[200px] max-w-[240px]">
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
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
          sent 
            ? 'bg-white/20 hover:bg-white/30 text-white' 
            : 'bg-indigo-500 hover:bg-indigo-600 text-white'
        }`}
      >
        {isPlaying ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Waveform + Progress */}
      <div className="flex-1 flex flex-col gap-0.5">
        <div 
          className="flex items-center gap-[2px] h-6 cursor-pointer"
          onClick={handleSeek}
        >
          {waveform.map((height, i) => {
            const barProgress = (i / waveform.length) * 100
            const isActive = barProgress <= progress
            return (
              <div
                key={i}
                className={`w-[2px] rounded-full transition-all ${
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
        <div className={`text-[9px] ${sent ? 'text-white/70' : 'text-gray-500'}`}>
          {formatTime(currentTime)} / {formatTime(duration || 0)}
        </div>
      </div>
    </div>
  )
}

const quickReplies = [
  { id: 1, text: 'Olá! Como posso ajudar?' },
  { id: 2, text: 'Vou verificar e retorno em instantes.' },
  { id: 3, text: 'Muito obrigado pelo contato!' },
]

// ============================================================
// MESSAGE STATUS
// ============================================================

function MessageStatus({ status }: { status?: string }) {
  switch (status) {
    case 'sending':
      return <Clock className="w-3 h-3 text-gray-400" />
    case 'sent':
      return <Check className="w-3 h-3 text-gray-400" />
    case 'delivered':
      return <CheckCheck className="w-3 h-3 text-gray-400" />
    case 'read':
      return <CheckCheck className="w-3 h-3 text-blue-500" />
    default:
      return <Check className="w-3 h-3 text-gray-400" />
  }
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ChatModal({ lead, onClose, onGoToFullChat }: ChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [previewMedia, setPreviewMedia] = useState<{ file: File; type: string; url: string } | null>(null)
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(15).fill(0))
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioMimeTypeRef = useRef<string>('audio/webm')

  // Normalizar telefone para buscar variantes
  const normalizePhone = (phone: string) => {
    const clean = phone.replace(/\D/g, '')
    const variants = [clean]
    if (clean.startsWith('55')) {
      variants.push(clean.slice(2))
    } else {
      variants.push('55' + clean)
    }
    return variants
  }

  // Carregar mensagens reais do Supabase
  const loadMessages = async () => {
    if (!lead.telefone) return
    
    try {
      const phoneVariants = normalizePhone(lead.telefone)
      
      const { data, error } = await supabase
        .from('mensagens')
        .select('*')
        .in('telefone', phoneVariants)
        .order('created_at', { ascending: true })
      
      if (error) throw error
      
      const formattedMessages: Message[] = (data || []).map(msg => {
        const content = msg.conteudo || msg.mensagem || ''
        
        // Detectar tipo de mídia pela URL
        let messageType: Message['type'] = msg.tipo as Message['type'] || 'text'
        let mediaUrl = msg.media_url
        
        const isMediaUrl = content.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|ogg|wav|pdf|doc|docx)(\?|$)/i) ||
                           content.includes('supabase.co/storage') ||
                           content.includes('/media/')
        
        if (isMediaUrl && !mediaUrl) {
          mediaUrl = content
          if (content.match(/\.(jpg|jpeg|png|gif|webp)/i)) messageType = 'image'
          else if (content.match(/\.(mp4|webm)/i)) messageType = 'video'
          else if (content.match(/\.(mp3|ogg|wav)/i)) messageType = 'audio'
          else if (content.match(/\.(pdf|doc|docx)/i)) messageType = 'document'
        }
        
        return {
          id: msg.id,
          content: content,
          timestamp: new Date(msg.created_at).toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          sent: msg.direcao === 'saida' || msg.direcao === 'outgoing' || msg.remetente === 'bot' || msg.remetente === 'atendente',
          status: msg.status || 'sent',
          type: messageType,
          mediaUrl: mediaUrl,
          caption: msg.caption
        }
      })
      
      setMessages(formattedMessages)
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Carregar mensagens ao abrir
  useEffect(() => {
    if (!lead.telefone) return
    
    loadMessages()
    
    // Subscrição para novas mensagens em tempo real
    const phoneVariants = normalizePhone(lead.telefone)
    
    const channel = supabase
      .channel(`chat-modal-${lead.telefone}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens'
        },
        (payload) => {
          const newMsg = payload.new as any
          if (phoneVariants.includes(newMsg.telefone?.replace(/\D/g, ''))) {
            const content = newMsg.conteudo || newMsg.mensagem || ''
            let messageType: Message['type'] = newMsg.tipo as Message['type'] || 'text'
            let mediaUrl = newMsg.media_url
            
            const isMediaUrl = content.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|ogg|wav|pdf|doc|docx)(\?|$)/i) ||
                               content.includes('supabase.co/storage')
            
            if (isMediaUrl && !mediaUrl) {
              mediaUrl = content
              if (content.match(/\.(jpg|jpeg|png|gif|webp)/i)) messageType = 'image'
              else if (content.match(/\.(mp4|webm)/i)) messageType = 'video'
              else if (content.match(/\.(mp3|ogg|wav)/i)) messageType = 'audio'
              else if (content.match(/\.(pdf|doc|docx)/i)) messageType = 'document'
            }
            
            const formattedMsg: Message = {
              id: newMsg.id,
              content: content,
              timestamp: new Date(newMsg.created_at).toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit' 
              }),
              sent: newMsg.direcao === 'saida' || newMsg.direcao === 'outgoing' || newMsg.remetente === 'bot' || newMsg.remetente === 'atendente',
              status: newMsg.status || 'sent',
              type: messageType,
              mediaUrl: mediaUrl,
              caption: newMsg.caption
            }
            setMessages(prev => [...prev, formattedMsg])
          }
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [lead.telefone])

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        throw error
      }
      
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

  const handleFileSelect = (acceptType: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = acceptType
      fileInputRef.current.click()
    }
    setShowAttachMenu(false)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document'
    if (file.type.startsWith('image/')) mediaType = 'image'
    else if (file.type.startsWith('video/')) mediaType = 'video'
    else if (file.type.startsWith('audio/')) mediaType = 'audio'
    
    const previewUrl = URL.createObjectURL(file)
    setPreviewMedia({ file, type: mediaType, url: previewUrl })
    
    // Limpar input
    e.target.value = ''
  }

  const handleSendMedia = async () => {
    if (!previewMedia) return
    
    setIsUploading(true)
    
    try {
      // Upload do arquivo
      const publicUrl = await uploadFileToStorage(previewMedia.file)
      if (!publicUrl) throw new Error('Falha no upload')
      
      // Adicionar mensagem otimisticamente
      const tempId = `temp-${Date.now()}`
      const newMessage: Message = {
        id: tempId,
        content: '',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        sent: true,
        status: 'sending',
        type: previewMedia.type as Message['type'],
        mediaUrl: publicUrl
      }
      setMessages(prev => [...prev, newMessage])
      
      // Limpar preview
      URL.revokeObjectURL(previewMedia.url)
      setPreviewMedia(null)
      
      if (!lead.telefone) return
      
      // Enviar via Edge Function
      const response = await fetch('https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec'
        },
        body: JSON.stringify({
          to: lead.telefone!.replace(/\D/g, ''),
          type: previewMedia.type,
          content: publicUrl,
          sendType: previewMedia.type,
          media_url: publicUrl
        })
      })

      const result = await response.json()
      
      if (response.ok && result.success) {
        setMessages(prev => prev.map(msg => 
          msg.id === tempId ? { ...msg, status: 'sent' } : msg
        ))
      } else {
        throw new Error(result.error || 'Falha ao enviar')
      }
    } catch (error) {
      console.error('Erro ao enviar mídia:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const cancelMediaSend = () => {
    if (previewMedia) {
      URL.revokeObjectURL(previewMedia.url)
      setPreviewMedia(null)
    }
  }

  // ============================================================
  // GRAVAÇÃO DE ÁUDIO
  // ============================================================

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const updateAudioLevels = () => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(dataArray)
      
      const levels: number[] = []
      const step = Math.floor(dataArray.length / 15)
      for (let i = 0; i < 15; i++) {
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
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
        setRecordingTime(0)
        setAudioLevels(new Array(15).fill(0))
        
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
            ext = 'mp3'
            finalMimeType = 'audio/mpeg'
          }
        } else if (usedMimeType.includes('mp4')) {
          finalBlob = audioBlob
          ext = 'mp4'
          finalMimeType = usedMimeType
        } else {
          finalBlob = audioBlob
          ext = 'mp3'
          finalMimeType = 'audio/mpeg'
        }
        
        const audioFile = new File([finalBlob], `audio-${Date.now()}.${ext}`, { type: finalMimeType })
        
        audioContextRef.current?.close()
        stream.getTracks().forEach(track => track.stop())
        
        // Enviar áudio automaticamente
        setIsUploading(true)
        try {
          // Upload do arquivo
          const publicUrl = await uploadFileToStorage(audioFile)
          if (!publicUrl) throw new Error('Falha no upload do áudio')
          
          // Adicionar mensagem otimisticamente
          const tempId = `temp-${Date.now()}`
          const newMessage: Message = {
            id: tempId,
            content: '',
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            sent: true,
            status: 'sending',
            type: 'audio',
            mediaUrl: publicUrl
          }
          setMessages(prev => [...prev, newMessage])
          
          if (!lead.telefone) return
          
          // Enviar via Edge Function
          const response = await fetch('https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec'
            },
            body: JSON.stringify({
              to: lead.telefone!.replace(/\D/g, ''),
              type: 'audio',
              content: publicUrl,
              sendType: 'audio',
              media_url: publicUrl
            })
          })

          const result = await response.json()
          
          if (response.ok && result.success) {
            setMessages(prev => prev.map(msg => 
              msg.id === tempId ? { ...msg, status: 'sent' } : msg
            ))
          } else {
            throw new Error(result.error || 'Falha ao enviar áudio')
          }
        } catch (error) {
          console.error('Erro ao enviar áudio:', error)
          // Mensagem já foi adicionada, marcar como falha
          setMessages(prev => prev.map(msg => 
            msg.status === 'sending' ? { ...msg, status: 'failed' } : msg
          ))
        } finally {
          setIsUploading(false)
        }
      }
      
      mediaRecorder.start(100)
      setIsRecordingAudio(true)
      setRecordingTime(0)
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
      updateAudioLevels()
      
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error)
      alert('Não foi possível acessar o microfone.')
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
      
      setTimeout(() => {
        if (previewMedia?.type === 'audio') {
          URL.revokeObjectURL(previewMedia.url)
          setPreviewMedia(null)
        }
      }, 100)
    }
    
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop())
    audioContextRef.current?.close()
    
    setRecordingTime(0)
    setAudioLevels(new Array(15).fill(0))
  }

  // Enviar mensagem real via WhatsApp API
  const handleSend = async () => {
    if (!inputValue.trim() || isSending) return

    const messageContent = inputValue.trim()
    setInputValue('')
    setIsSending(true)

    // Adicionar mensagem otimisticamente
    const tempId = `temp-${Date.now()}`
    const newMessage: Message = {
      id: tempId,
      content: messageContent,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      sent: true,
      status: 'sending'
    }
    setMessages(prev => [...prev, newMessage])

    if (!lead.telefone) return
    
    try {
      // Enviar via Edge Function
      const response = await fetch('https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec'
        },
        body: JSON.stringify({
          to: lead.telefone!.replace(/\D/g, ''),
          type: 'text',
          content: messageContent,
          sendType: 'text'
        })
      })

      const result = await response.json()
      
      if (response.ok && result.success) {
        // Atualizar status para enviado
        setMessages(prev => prev.map(msg => 
          msg.id === tempId ? { ...msg, status: 'sent' } : msg
        ))
      } else {
        throw new Error(result.error || 'Falha ao enviar')
      }
    } catch (error) {
      console.error('Erro ao enviar:', error)
      // Marcar como falha
      setMessages(prev => prev.map(msg => 
        msg.id === tempId ? { ...msg, status: 'failed' } : msg
      ))
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden" style={{ height: '600px' }}>
        {/* Header */}
        <header className="h-16 px-5 flex items-center justify-between border-b border-gray-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold">
              {lead.nome?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{lead.nome || 'Sem nome'}</h3>
              <p className="text-xs text-gray-500">{lead.telefone}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={onGoToFullChat}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              title="Abrir chat completo"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 bg-gray-50">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Carregando mensagens...</p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm text-gray-500">Nenhuma mensagem ainda</p>
                <p className="text-xs text-gray-400 mt-1">Envie a primeira mensagem!</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sent ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl shadow-sm overflow-hidden ${
                      message.sent
                        ? message.status === 'failed' 
                          ? 'bg-red-500 text-white rounded-br-md'
                          : 'bg-indigo-600 text-white rounded-br-md'
                        : 'bg-white text-gray-900 border border-gray-100 rounded-bl-md'
                    }`}
                  >
                    {/* Imagem */}
                    {message.type === 'image' && message.mediaUrl && (
                      <div className="relative">
                        <img 
                          src={message.mediaUrl} 
                          alt="Imagem" 
                          className="max-w-full max-h-48 object-cover cursor-pointer hover:opacity-90"
                          onClick={() => window.open(message.mediaUrl, '_blank')}
                        />
                        {message.caption && (
                          <div className={`px-3 py-2 text-sm ${message.sent ? 'text-white/90' : 'text-gray-700'}`}>
                            {message.caption}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Vídeo */}
                    {message.type === 'video' && message.mediaUrl && (
                      <div className="relative">
                        <video 
                          src={message.mediaUrl} 
                          controls 
                          className="max-w-full max-h-48 rounded-t-2xl"
                          preload="metadata"
                        />
                      </div>
                    )}
                    
                    {/* Áudio */}
                    {message.type === 'audio' && message.mediaUrl && (
                      <AudioPlayer 
                        src={message.mediaUrl} 
                        sent={message.sent}
                      />
                    )}
                    
                    {/* Documento */}
                    {message.type === 'document' && message.mediaUrl && (
                      <div className="p-3">
                        <a 
                          href={message.mediaUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2 ${message.sent ? 'text-white hover:text-indigo-100' : 'text-indigo-600 hover:text-indigo-800'}`}
                        >
                          <FileText className="w-5 h-5" />
                          <span className="text-sm underline">Abrir documento</span>
                        </a>
                      </div>
                    )}
                    
                    {/* Texto - só mostrar se não for mídia ou se for legenda */}
                    {message.content && 
                     message.type !== 'image' && 
                     message.type !== 'video' && 
                     message.type !== 'audio' && 
                     message.type !== 'document' &&
                     !message.content.match(/^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|ogg|wav|pdf|doc)/i) && (
                      <div className="px-4 py-2.5">
                        <p className="text-sm leading-relaxed">{message.content}</p>
                      </div>
                    )}
                    
                    <div className={`flex items-center justify-end gap-1 px-3 pb-2 ${
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

        {/* Quick Replies */}
        <div className="px-4 py-2 bg-white border-t border-gray-100">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {quickReplies.map((reply) => (
              <button
                key={reply.id}
                onClick={() => setInputValue(reply.text)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-medium whitespace-nowrap transition-colors"
              >
                {reply.text}
              </button>
            ))}
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Attach Menu */}
        {showAttachMenu && (
          <div className="absolute bottom-20 left-4 bg-white rounded-xl shadow-xl border border-gray-200 p-2 z-10">
            <button
              onClick={() => handleFileSelect('image/*')}
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 rounded-lg w-full text-left"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-sm text-gray-700">Imagem</span>
            </button>
            <button
              onClick={() => handleFileSelect('video/*')}
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 rounded-lg w-full text-left"
            >
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <Video className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-sm text-gray-700">Vídeo</span>
            </button>
            <button
              onClick={() => handleFileSelect('.pdf,.doc,.docx,.xls,.xlsx')}
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 rounded-lg w-full text-left"
            >
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                <FileText className="w-4 h-4 text-orange-600" />
              </div>
              <span className="text-sm text-gray-700">Documento</span>
            </button>
          </div>
        )}

        {/* Media Preview */}
        {previewMedia && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white rounded-lg p-2 border border-gray-200">
                {previewMedia.type === 'image' && (
                  <img src={previewMedia.url} alt="Preview" className="max-h-24 rounded-lg object-cover" />
                )}
                {previewMedia.type === 'video' && (
                  <video src={previewMedia.url} className="max-h-24 rounded-lg" controls />
                )}
                {previewMedia.type === 'audio' && (
                  <audio src={previewMedia.url} controls className="w-full h-10" />
                )}
                {previewMedia.type === 'document' && (
                  <div className="flex items-center gap-2 p-2">
                    <FileText className="w-6 h-6 text-orange-500" />
                    <span className="text-sm text-gray-700 truncate">{previewMedia.file.name}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={handleSendMedia}
                  disabled={isUploading}
                  className="w-9 h-9 bg-indigo-600 text-white rounded-lg flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
                <button
                  onClick={cancelMediaSend}
                  disabled={isUploading}
                  className="w-9 h-9 bg-gray-100 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-200 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-3 bg-white border-t border-gray-100 relative">
          <div className="flex items-center gap-2">
            {isRecordingAudio ? (
              <>
                {/* Cancel Recording */}
                <button
                  onClick={cancelAudioRecording}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                
                {/* Recording Visualizer */}
                <div className="flex-1 h-10 bg-red-50 border border-red-200 rounded-full flex items-center gap-2 px-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-red-600 font-mono text-xs min-w-[35px]">
                    {formatRecordingTime(recordingTime)}
                  </span>
                  <div className="flex-1 flex items-center justify-center gap-[2px] h-6">
                    {audioLevels.map((level, i) => (
                      <div
                        key={i}
                        className="w-[3px] bg-red-500 rounded-full transition-all duration-75"
                        style={{ height: `${Math.max(3, level * 20)}px`, opacity: 0.5 + level * 0.5 }}
                      />
                    ))}
                  </div>
                </div>
                
                {/* Stop Recording */}
                <button
                  onClick={stopAudioRecording}
                  className="w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                >
                  <Check className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                  <Smile className="w-5 h-5" />
                </button>
                
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 h-10 px-4 bg-gray-50 border border-gray-200 rounded-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                
                {inputValue.trim() ? (
                  <button
                    onClick={handleSend}
                    className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={startAudioRecording}
                    className="w-10 h-10 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
