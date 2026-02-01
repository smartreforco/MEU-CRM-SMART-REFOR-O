/**
 * ============================================================
 * BotConfig - FUNCIONAL
 * Templates, Respostas Automáticas e Bot IA
 * Totalmente funcional com Supabase
 * ============================================================
 */

import { useState, useEffect, useRef } from 'react'
import { 
  Bot, Zap, Video, Save, Settings,
  Plus, Trash2, Edit3, FileText, CheckCircle, 
  XCircle, Sparkles, Copy, X, Upload,
  Image as ImageIcon, Check, AlertCircle, Send, Loader2
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ============================================================
// TYPES
// ============================================================

interface Template {
  id: number
  name: string
  language: string
  category: string
  status: string
  components: {
    type: string
    message?: string
    buttons?: TemplateButton[]
    mediaUrl?: string
    footer?: string
  }
  created_at: string
}

interface TemplateButton {
  id: string
  text: string
  action: 'positive' | 'negative' | 'link'
  response?: string
  linkUrl?: string
}

interface BotResponse {
  id: number
  trigger: string
  response: string
  active: boolean
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function BotConfig() {
  const [activeTab, setActiveTab] = useState<'templates' | 'bot' | 'ia'>('templates')
  
  // Templates state
  const [templates, setTemplates] = useState<Template[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  
  // Template form state
  const [templateForm, setTemplateForm] = useState({
    name: '',
    category: 'MARKETING',
    message: '',
    footer: '',
    mediaUrl: '',
    mediaType: 'video' as 'video' | 'image',
    buttons: [] as TemplateButton[]
  })
  
  // Test modal
  const [showTestModal, setShowTestModal] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testTemplate, setTestTemplate] = useState<Template | null>(null)
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  
  // Bot responses state
  const [botResponses, setBotResponses] = useState<BotResponse[]>([
    { id: 1, trigger: 'oi', response: 'Olá! 👋 Seja bem-vindo ao Smart Reforço!', active: true },
    { id: 2, trigger: 'preço', response: 'Nossos planos começam em R$ 97/mês.', active: true },
    { id: 3, trigger: 'horário', response: 'Atendemos de segunda a sexta, 8h às 18h.', active: true },
  ])
  const [savingResponses, setSavingResponses] = useState(false)
  
  // Bot IA settings
  const [iaEnabled, setIaEnabled] = useState(false)
  const [iaProvider, setIaProvider] = useState('gemini')
  const [iaApiKey, setIaApiKey] = useState('')
  const [iaPrompt, setIaPrompt] = useState(`Você é o assistente virtual do Smart Reforço.

Objetivo:
1. Apresentar os benefícios do sistema
2. Responder dúvidas sobre funcionalidades
3. Direcionar para o site: smartreforco.com.br

Seja amigável e profissional.`)
  const [iaRestrictions, setIaRestrictions] = useState({
    horarioComercial: true,
    transferirHumano: true,
    limiteMensagens: true
  })
  const [savingIA, setSavingIA] = useState(false)

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // ============================================================
  // LOAD DATA
  // ============================================================

  useEffect(() => {
    loadTemplates()
    loadBotResponses()
    loadBotConfig()
  }, [])

  const loadTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTemplates(data || [])
    } catch (err) {
      console.error('Erro ao carregar templates:', err)
    } finally {
      setLoadingTemplates(false)
    }
  }

  const loadBotResponses = async () => {
    try {
      const { data, error } = await supabase
        .from('bot_responses')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        setBotResponses(data)
      }
    } catch (err) {
      console.error('Erro ao carregar respostas:', err)
    }
  }

  const loadBotConfig = async () => {
    try {
      const { data } = await supabase
        .from('bot_config')
        .select('*')
        .single()

      if (data) {
        setIaEnabled(data.ia_enabled || false)
        setIaProvider(data.ia_provider || 'gemini')
        setIaApiKey(data.ia_api_key || '')
        if (data.ia_prompt) setIaPrompt(data.ia_prompt)
      }
    } catch (err) {
      console.log('Config não existe ainda')
    }
  }

  // ============================================================
  // TEMPLATE FUNCTIONS
  // ============================================================

  const handleSaveTemplate = async () => {
    if (!templateForm.name || !templateForm.message) {
      alert('Preencha nome e mensagem do template')
      return
    }

    setSavingTemplate(true)
    try {
      const templateData = {
        name: templateForm.name.toLowerCase().replace(/\s+/g, '_'),
        language: 'pt_BR',
        category: templateForm.category,
        status: 'APPROVED',
        components: {
          type: templateForm.mediaUrl ? templateForm.mediaType : 'text',
          message: templateForm.message,
          footer: templateForm.footer,
          mediaUrl: templateForm.mediaUrl,
          buttons: templateForm.buttons
        }
      }

      if (editingTemplate) {
        const { error } = await supabase
          .from('whatsapp_templates')
          .update(templateData)
          .eq('id', editingTemplate.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('whatsapp_templates')
          .insert(templateData)
        if (error) throw error
      }

      // ============================================================
      // SALVAR RESPOSTAS DOS BOTÕES NA TABELA bot_responses
      // ============================================================
      for (const button of templateForm.buttons) {
        if (button.text && button.response) {
          // Verificar se já existe uma resposta para esse gatilho
          const { data: existing } = await supabase
            .from('bot_responses')
            .select('id')
            .eq('trigger', button.text)
            .single()
          
          if (existing) {
            // Atualizar resposta existente
            await supabase
              .from('bot_responses')
              .update({ response: button.response, active: true })
              .eq('id', existing.id)
          } else {
            // Inserir nova resposta
            await supabase
              .from('bot_responses')
              .insert({
                trigger: button.text,
                response: button.response,
                active: true
              })
          }
          console.log(`✅ Resposta do bot salva para gatilho: "${button.text}"`)
        }
      }

      await loadTemplates()
      await loadBotResponses() // Recarregar respostas também
      setShowTemplateEditor(false)
      resetTemplateForm()
    } catch (err) {
      console.error('Erro ao salvar template:', err)
      alert('Erro ao salvar template')
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return

    try {
      const { error } = await supabase
        .from('whatsapp_templates')
        .delete()
        .eq('id', id)
      if (error) throw error
      await loadTemplates()
    } catch (err) {
      console.error('Erro ao excluir template:', err)
    }
  }

  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      category: template.category,
      message: template.components?.message || '',
      footer: template.components?.footer || '',
      mediaUrl: template.components?.mediaUrl || '',
      mediaType: (template.components?.type as 'video' | 'image') || 'video',
      buttons: template.components?.buttons || []
    })
    setShowTemplateEditor(true)
  }

  const resetTemplateForm = () => {
    setEditingTemplate(null)
    setTemplateForm({
      name: '',
      category: 'MARKETING',
      message: '',
      footer: '',
      mediaUrl: '',
      mediaType: 'video',
      buttons: []
    })
  }

  const addButton = () => {
    if (templateForm.buttons.length >= 3) {
      alert('Máximo de 3 botões por template')
      return
    }
    setTemplateForm(prev => ({
      ...prev,
      buttons: [...prev.buttons, {
        id: Date.now().toString(),
        text: '',
        action: 'positive',
        response: ''
      }]
    }))
  }

  const removeButton = (id: string) => {
    setTemplateForm(prev => ({
      ...prev,
      buttons: prev.buttons.filter(b => b.id !== id)
    }))
  }

  const updateButton = (id: string, field: string, value: string) => {
    setTemplateForm(prev => ({
      ...prev,
      buttons: prev.buttons.map(b => 
        b.id === id ? { ...b, [field]: value } : b
      )
    }))
  }

  // ============================================================
  // FILE UPLOAD
  // ============================================================

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const filePath = `templates/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath)

      setTemplateForm(prev => ({
        ...prev,
        mediaUrl: urlData.publicUrl,
        mediaType: file.type.startsWith('video') ? 'video' : 'image'
      }))
    } catch (err) {
      console.error('Erro ao fazer upload:', err)
      alert('Erro ao fazer upload. Verifique se o bucket "media" existe.')
    } finally {
      setUploading(false)
    }
  }

  // ============================================================
  // TEST TEMPLATE
  // ============================================================

  const handleTestTemplate = async () => {
    if (!testPhone || !testTemplate) return

    setSendingTest(true)
    setTestResult(null)

    try {
      const phoneClean = testPhone.replace(/\D/g, '')
      const hasMedia = testTemplate.components?.mediaUrl
      const hasButtons = testTemplate.components?.buttons && testTemplate.components.buttons.length > 0
      
      // Determinar o tipo de envio
      let sendType = 'text'
      if (hasMedia && hasButtons) {
        sendType = 'video_buttons'
      } else if (hasButtons) {
        sendType = 'interactive_buttons'
      } else if (hasMedia) {
        sendType = testTemplate.components?.type === 'video' ? 'video' : 'image'
      }
      
      const response = await fetch('https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: phoneClean,
          type: sendType,
          content: testTemplate.components?.message || '',
          mediaUrl: testTemplate.components?.mediaUrl || '',
          buttons: testTemplate.components?.buttons || [],
          footer: testTemplate.components?.footer || '',
          caption: testTemplate.components?.message || ''
        })
      })

      const data = await response.json()

      if (data.success) {
        setTestResult({ success: true, message: 'Mensagem enviada com sucesso!' })
      } else {
        setTestResult({ success: false, message: data.error || 'Erro ao enviar' })
      }
    } catch (err) {
      setTestResult({ success: false, message: 'Erro de conexão' })
    } finally {
      setSendingTest(false)
    }
  }

  const copyJsonPayload = (template: Template) => {
    const payload = {
      messaging_product: "whatsapp",
      to: "{{PHONE}}",
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language || "pt_BR" },
        components: template.components
      }
    }
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    alert('JSON copiado!')
  }

  // ============================================================
  // BOT RESPONSES
  // ============================================================

  const handleSaveResponses = async () => {
    setSavingResponses(true)
    try {
      // Salvar cada resposta
      for (const response of botResponses) {
        if (response.id > 1000000) {
          await supabase.from('bot_responses').insert({
            trigger: response.trigger,
            response: response.response,
            active: response.active
          })
        } else {
          await supabase.from('bot_responses').update({
            trigger: response.trigger,
            response: response.response,
            active: response.active
          }).eq('id', response.id)
        }
      }
      alert('Respostas salvas!')
    } catch (err) {
      console.error('Erro ao salvar:', err)
      alert('Erro ao salvar')
    } finally {
      setSavingResponses(false)
    }
  }

  const addBotResponse = () => {
    setBotResponses(prev => [...prev, {
      id: Date.now(),
      trigger: '',
      response: '',
      active: true
    }])
  }

  const deleteBotResponse = async (id: number) => {
    if (id < 1000000) {
      await supabase.from('bot_responses').delete().eq('id', id)
    }
    setBotResponses(prev => prev.filter(r => r.id !== id))
  }

  // ============================================================
  // BOT IA CONFIG
  // ============================================================

  const handleSaveIAConfig = async () => {
    setSavingIA(true)
    try {
      const restrictions = []
      if (iaRestrictions.horarioComercial) restrictions.push('horario')
      if (iaRestrictions.transferirHumano) restrictions.push('transferir')
      if (iaRestrictions.limiteMensagens) restrictions.push('limite')

      const { error } = await supabase
        .from('bot_config')
        .upsert({
          id: 1,
          ia_enabled: iaEnabled,
          ia_provider: iaProvider,
          ia_api_key: iaApiKey,
          ia_prompt: iaPrompt,
          ia_restrictions: restrictions
        })

      if (error) throw error
      alert('Configurações salvas!')
    } catch (err) {
      console.error('Erro:', err)
      alert('Erro ao salvar')
    } finally {
      setSavingIA(false)
    }
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Tabs */}
      <div className="border-b border-gray-200 flex-shrink-0">
        <div className="flex gap-1 px-6 pt-4">
          {[
            { id: 'templates', label: 'Templates', icon: Video },
            { id: 'bot', label: 'Respostas Automáticas', icon: Zap },
            { id: 'ia', label: 'Bot IA', icon: Sparkles }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`px-4 py-3 text-sm font-medium rounded-t-lg flex items-center gap-2 transition-colors ${
                activeTab === id
                  ? 'bg-white text-indigo-600 border-t-2 border-x border-indigo-500 border-x-gray-200 -mb-px'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        
        {/* TEMPLATES TAB */}
        {activeTab === 'templates' && (
          <div className="space-y-6 max-w-4xl">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-blue-800 mb-1 flex items-center gap-2">
                <Video className="w-4 h-4" />
                Templates de Mídia
              </h3>
              <p className="text-xs text-blue-600">
                Crie templates com vídeos/imagens e botões para prospecção em massa.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Seus Templates ({templates.length})
              </h3>
              <button 
                onClick={() => { resetTemplateForm(); setShowTemplateEditor(true) }}
                className="h-10 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Novo Template
              </button>
            </div>

            {loadingTemplates ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
                <Video className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h4 className="text-gray-900 font-medium mb-2">Nenhum template</h4>
                <p className="text-sm text-gray-500 mb-4">Crie seu primeiro template</p>
                <button 
                  onClick={() => setShowTemplateEditor(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm"
                >
                  Criar Template
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {templates.map((template) => (
                  <div key={template.id} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          template.components?.type === 'video' ? 'bg-red-50 text-red-500' 
                          : template.components?.type === 'image' ? 'bg-blue-50 text-blue-500'
                          : 'bg-gray-50 text-gray-500'
                        }`}>
                          {template.components?.type === 'video' ? <Video className="w-5 h-5" /> 
                           : template.components?.type === 'image' ? <ImageIcon className="w-5 h-5" />
                           : <FileText className="w-5 h-5" />}
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900">{template.name}</h4>
                          <p className="text-xs text-gray-500">{template.category} • {template.language}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        template.status === 'APPROVED' ? 'bg-green-50 text-green-700 border border-green-200' 
                        : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                      }`}>
                        {template.status}
                      </span>
                    </div>

                    {template.components?.mediaUrl && (
                      <div className="mb-4 rounded-lg overflow-hidden bg-gray-100">
                        {template.components.type === 'video' ? (
                          <video src={template.components.mediaUrl} className="w-full max-h-48 object-cover" controls />
                        ) : (
                          <img src={template.components.mediaUrl} className="w-full max-h-48 object-cover" alt="Media" />
                        )}
                      </div>
                    )}

                    <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-100">
                      <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">
                        {template.components?.message || 'Sem mensagem'}
                      </p>
                      {template.components?.footer && (
                        <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-200">
                          {template.components.footer}
                        </p>
                      )}
                    </div>

                    {template.components?.buttons && template.components.buttons.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {template.components.buttons.map((btn) => (
                          <span key={btn.id} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                            btn.action === 'positive' ? 'bg-green-50 text-green-700 border-green-200' 
                            : btn.action === 'link' ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-red-50 text-red-600 border-red-200'
                          }`}>
                            {btn.text}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                      <button 
                        onClick={() => { setTestTemplate(template); setShowTestModal(true) }}
                        className="h-9 px-3 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg text-xs font-medium flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Testar
                      </button>
                      <button 
                        onClick={() => handleEditTemplate(template)}
                        className="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Editar
                      </button>
                      <button 
                        onClick={() => copyJsonPayload(template)}
                        className="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium flex items-center gap-1.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        JSON
                      </button>
                      <button 
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="h-9 px-3 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs font-medium flex items-center gap-1.5 ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BOT RESPONSES TAB */}
        {activeTab === 'bot' && (
          <div className="space-y-6 max-w-4xl">
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-yellow-800 mb-1 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Respostas Automáticas
              </h3>
              <p className="text-xs text-yellow-700">
                Configure respostas automáticas baseadas em palavras-chave.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Palavras-chave</h3>
              <button 
                onClick={addBotResponse}
                className="h-10 px-4 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Nova Resposta
              </button>
            </div>

            <div className="space-y-4">
              {botResponses.map((response) => (
                <div key={response.id} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-4">
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                          Palavra-chave (ou múltiplas separadas por vírgula)
                        </label>
                        <input
                          type="text"
                          value={response.trigger}
                          onChange={(e) => setBotResponses(prev => 
                            prev.map(r => r.id === response.id ? { ...r, trigger: e.target.value } : r)
                          )}
                          placeholder="Ex: oi, olá, bom dia..."
                          className="w-full h-10 px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1.5 block">Resposta automática</label>
                        <textarea
                          value={response.response}
                          onChange={(e) => setBotResponses(prev => 
                            prev.map(r => r.id === response.id ? { ...r, response: e.target.value } : r)
                          )}
                          placeholder="Mensagem que será enviada automaticamente..."
                          rows={3}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none"
                        />
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center gap-2 pt-6">
                      <button
                        onClick={() => setBotResponses(prev => 
                          prev.map(r => r.id === response.id ? { ...r, active: !r.active } : r)
                        )}
                        className={`p-2 rounded-lg ${response.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}
                        title={response.active ? 'Ativo' : 'Inativo'}
                      >
                        {response.active ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => deleteBotResponse(response.id)}
                        className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={handleSaveResponses}
              disabled={savingResponses}
              className="w-full h-11 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-300 text-white font-medium rounded-xl flex items-center justify-center gap-2"
            >
              {savingResponses ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingResponses ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        )}

        {/* BOT IA TAB */}
        {activeTab === 'ia' && (
          <div className="space-y-6 max-w-4xl">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-purple-800 mb-1 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Bot com Inteligência Artificial
              </h3>
              <p className="text-xs text-purple-600">
                Use IA (Gemini/GPT/Claude) para responder mensagens automaticamente.
              </p>
            </div>

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    iaEnabled ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Bot IA</h4>
                    <p className="text-sm text-gray-500">
                      {iaEnabled ? 'Respondendo automaticamente com IA' : 'Desativado'}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => setIaEnabled(!iaEnabled)}
                  className={`relative w-14 h-7 rounded-full transition-colors ${iaEnabled ? 'bg-purple-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${iaEnabled ? 'left-8' : 'left-1'}`} />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-400" />
                Configuração da API
              </h4>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Provedor de IA</label>
                  <select 
                    value={iaProvider}
                    onChange={(e) => setIaProvider(e.target.value)}
                    className="w-full h-10 px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI GPT-4</option>
                    <option value="anthropic">Anthropic Claude</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">API Key</label>
                  <input
                    type="password"
                    value={iaApiKey}
                    onChange={(e) => setIaApiKey(e.target.value)}
                    placeholder="Sua chave de API..."
                    className="w-full h-10 px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                Prompt do Sistema
              </h4>
              
              <textarea
                value={iaPrompt}
                onChange={(e) => setIaPrompt(e.target.value)}
                rows={10}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-mono"
              />
            </div>

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <h4 className="font-semibold text-gray-900 mb-4">Restrições</h4>
              
              <div className="space-y-3">
                <label className="flex items-center gap-3 text-sm text-gray-600 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={iaRestrictions.horarioComercial}
                    onChange={(e) => setIaRestrictions(prev => ({ ...prev, horarioComercial: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600" 
                  />
                  Não responder fora do horário comercial (8h-18h)
                </label>
                <label className="flex items-center gap-3 text-sm text-gray-600 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={iaRestrictions.transferirHumano}
                    onChange={(e) => setIaRestrictions(prev => ({ ...prev, transferirHumano: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600" 
                  />
                  Transferir para humano se detectar insatisfação
                </label>
                <label className="flex items-center gap-3 text-sm text-gray-600 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={iaRestrictions.limiteMensagens}
                    onChange={(e) => setIaRestrictions(prev => ({ ...prev, limiteMensagens: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600" 
                  />
                  Limitar a 10 mensagens automáticas por conversa
                </label>
              </div>
            </div>

            <button 
              onClick={handleSaveIAConfig}
              disabled={savingIA}
              className="w-full h-11 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-medium rounded-xl flex items-center justify-center gap-2"
            >
              {savingIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingIA ? 'Salvando...' : 'Salvar Configurações de IA'}
            </button>
          </div>
        )}
      </div>

      {/* TEMPLATE EDITOR MODAL */}
      {showTemplateEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingTemplate ? 'Editar Template' : 'Novo Template'}
              </h3>
              <button onClick={() => { setShowTemplateEditor(false); resetTemplateForm() }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Nome do Template</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: apresentacao_produto"
                  className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Categoria</label>
                <select
                  value={templateForm.category}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utilitário</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Mídia (Vídeo ou Imagem)</label>
                
                {templateForm.mediaUrl ? (
                  <div className="relative rounded-lg overflow-hidden bg-gray-100">
                    {templateForm.mediaType === 'video' ? (
                      <video src={templateForm.mediaUrl} className="w-full max-h-48 object-cover" controls />
                    ) : (
                      <img src={templateForm.mediaUrl} className="w-full max-h-48 object-cover" alt="Preview" />
                    )}
                    <button
                      onClick={() => setTemplateForm(prev => ({ ...prev, mediaUrl: '', mediaType: 'video' }))}
                      className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 mb-3">Selecione um arquivo ou cole a URL</p>
                    <input ref={fileInputRef} type="file" accept="video/*,image/*" onChange={handleFileUpload} className="hidden" />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:bg-indigo-300"
                    >
                      {uploading ? 'Enviando...' : 'Selecionar Arquivo'}
                    </button>
                    
                    <div className="mt-4 text-left">
                      <label className="text-xs text-gray-500 mb-1 block">Ou cole a URL:</label>
                      <input
                        type="url"
                        placeholder="https://exemplo.com/video.mp4"
                        onChange={(e) => {
                          const url = e.target.value
                          if (url) {
                            setTemplateForm(prev => ({
                              ...prev,
                              mediaUrl: url,
                              mediaType: url.match(/\.(mp4|webm|mov)/i) ? 'video' : 'image'
                            }))
                          }
                        }}
                        className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Mensagem</label>
                <textarea
                  value={templateForm.message}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Digite a mensagem do template..."
                  rows={6}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Rodapé (opcional)</label>
                <input
                  type="text"
                  value={templateForm.footer}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, footer: e.target.value }))}
                  placeholder="Ex: Smart Reforço - Gestão Escolar"
                  className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Botões de Resposta</label>
                  <button onClick={addButton} disabled={templateForm.buttons.length >= 3} className="text-xs text-indigo-600 font-medium flex items-center gap-1 disabled:text-gray-400">
                    <Plus className="w-3 h-3" />
                    Adicionar
                  </button>
                </div>

                <div className="space-y-3">
                  {templateForm.buttons.map((btn, idx) => (
                    <div key={btn.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500">Botão {idx + 1}</span>
                        <button onClick={() => removeButton(btn.id)} className="ml-auto p-1 text-red-500 hover:bg-red-50 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      
                      <input
                        type="text"
                        value={btn.text}
                        onChange={(e) => updateButton(btn.id, 'text', e.target.value)}
                        placeholder="Texto do botão"
                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-lg text-sm"
                      />
                      
                      <div className="flex gap-2">
                        <select
                          value={btn.action}
                          onChange={(e) => updateButton(btn.id, 'action', e.target.value)}
                          className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-sm"
                        >
                          <option value="positive">✅ Positivo</option>
                          <option value="negative">❌ Negativo</option>
                          <option value="link">🔗 Link</option>
                        </select>
                        
                        {btn.action === 'link' ? (
                          <input type="url" value={btn.linkUrl || ''} onChange={(e) => updateButton(btn.id, 'linkUrl', e.target.value)} placeholder="URL" className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-lg text-sm" />
                        ) : (
                          <input type="text" value={btn.response || ''} onChange={(e) => updateButton(btn.id, 'response', e.target.value)} placeholder="Resposta automática" className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-lg text-sm" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 flex-shrink-0">
              <button onClick={() => { setShowTemplateEditor(false); resetTemplateForm() }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">
                Cancelar
              </button>
              <button onClick={handleSaveTemplate} disabled={savingTemplate} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-indigo-300 flex items-center gap-2">
                {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingTemplate ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEST MODAL */}
      {showTestModal && testTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Testar Template</h3>
              <button onClick={() => { setShowTestModal(false); setTestResult(null) }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-1">{testTemplate.name}</p>
                <p className="text-xs text-gray-500 line-clamp-2">{testTemplate.components?.message}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Número do WhatsApp</label>
                <div className="flex gap-2">
                  <span className="h-11 px-3 bg-gray-100 border border-gray-200 rounded-lg flex items-center text-sm text-gray-500">+55</span>
                  <input
                    type="tel"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="11999999999"
                    className="flex-1 h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {testResult && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${testResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                  {testResult.success ? <Check className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
                  <p className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>{testResult.message}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button onClick={() => setShowTestModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">
                Cancelar
              </button>
              <button
                onClick={handleTestTemplate}
                disabled={!testPhone || sendingTest}
                className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-green-300 flex items-center gap-2"
              >
                {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sendingTest ? 'Enviando...' : 'Enviar Teste'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
