
-- ==================================================
-- SCHEMA COMPLETO DO SISTEMA - COPIE E COLE NO SQL EDITOR DO SUPABASE
-- Dashboard > Database > SQL Editor > New Query
-- ==================================================

-- Tabela de Leads (principal)
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    nome TEXT,
    telefone TEXT,
    email TEXT,
    origem TEXT,
    interesse TEXT,
    observacoes TEXT,
    status TEXT DEFAULT 'novo',
    prioridade TEXT DEFAULT 'media',
    data_criacao TIMESTAMP DEFAULT NOW(),
    data_atualizacao TIMESTAMP DEFAULT NOW(),
    ultimo_contato TIMESTAMP,
    proximo_contato TIMESTAMP,
    responsavel TEXT,
    valor_potencial DECIMAL(10,2),
    tags TEXT,
    fonte_arquivo TEXT,
    cidade TEXT,
    estado TEXT,
    empresa TEXT,
    cargo TEXT,
    whatsapp_status TEXT DEFAULT 'pendente'
);

-- Tabela de Unidades (pastas)
CREATE TABLE IF NOT EXISTS unidades (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    cor TEXT DEFAULT '#3498db',
    icone TEXT DEFAULT 'folder',
    data_criacao TIMESTAMP DEFAULT NOW()
);

-- Relação Lead-Unidade
CREATE TABLE IF NOT EXISTS lead_unidades (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    unidade_id INTEGER REFERENCES unidades(id) ON DELETE CASCADE,
    data_vinculo TIMESTAMP DEFAULT NOW()
);

-- Anotações dos Leads
CREATE TABLE IF NOT EXISTS anotacoes (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    texto TEXT,
    tipo TEXT DEFAULT 'nota',
    data_criacao TIMESTAMP DEFAULT NOW(),
    autor TEXT
);

-- Histórico de ações
CREATE TABLE IF NOT EXISTS historico (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    acao TEXT,
    detalhes TEXT,
    data_acao TIMESTAMP DEFAULT NOW(),
    usuario TEXT
);

-- Configuração WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_config (
    id SERIAL PRIMARY KEY,
    provider TEXT DEFAULT 'meta',
    api_url TEXT,
    api_token TEXT,
    instance_id TEXT,
    phone_number_id TEXT,
    access_token TEXT,
    verify_token TEXT,
    webhook_url TEXT,
    ativo BOOLEAN DEFAULT false,
    data_atualizacao TIMESTAMP DEFAULT NOW()
);

-- Contatos WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    phone TEXT NOT NULL,
    name TEXT,
    profile_pic TEXT,
    last_message TIMESTAMP,
    unread_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    data_criacao TIMESTAMP DEFAULT NOW()
);

-- Conversas WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'open',
    last_message_at TIMESTAMP,
    unread_count INTEGER DEFAULT 0,
    assigned_to TEXT,
    tags TEXT,
    data_criacao TIMESTAMP DEFAULT NOW()
);

-- Mensagens WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
    direction TEXT DEFAULT 'outgoing',
    message_type TEXT DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    status TEXT DEFAULT 'sent',
    wa_message_id TEXT,
    timestamp TIMESTAMP DEFAULT NOW(),
    read_at TIMESTAMP,
    delivered_at TIMESTAMP
);

-- Templates de Mensagens
CREATE TABLE IF NOT EXISTS message_templates (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    categoria TEXT,
    conteudo TEXT NOT NULL,
    variaveis TEXT,
    ativo BOOLEAN DEFAULT true,
    data_criacao TIMESTAMP DEFAULT NOW()
);

-- Configuração do Bot IA
CREATE TABLE IF NOT EXISTS bot_config (
    id SERIAL PRIMARY KEY,
    ativo BOOLEAN DEFAULT false,
    provider TEXT DEFAULT 'ollama',
    ollama_url TEXT DEFAULT 'http://localhost:11434',
    modelo TEXT DEFAULT 'mistral',
    temperatura DECIMAL(2,1) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 500,
    cloud_provider TEXT DEFAULT 'gemini',
    cloud_api_key TEXT,
    cloud_model TEXT DEFAULT 'gemini-2.5-flash',
    usar_cloud BOOLEAN DEFAULT true,
    auto_responder BOOLEAN DEFAULT false,
    horario_inicio TIME,
    horario_fim TIME,
    dias_semana TEXT DEFAULT '1,2,3,4,5',
    delay_resposta INTEGER DEFAULT 2,
    data_atualizacao TIMESTAMP DEFAULT NOW()
);

-- Personalidades do Bot
CREATE TABLE IF NOT EXISTS bot_personalidade (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    system_prompt TEXT NOT NULL,
    tom TEXT DEFAULT 'profissional',
    idioma TEXT DEFAULT 'pt-BR',
    ativo BOOLEAN DEFAULT false,
    data_criacao TIMESTAMP DEFAULT NOW()
);

-- Base de Conhecimento do Bot
CREATE TABLE IF NOT EXISTS bot_conhecimento (
    id SERIAL PRIMARY KEY,
    categoria TEXT,
    pergunta TEXT,
    resposta TEXT,
    palavras_chave TEXT,
    prioridade INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT true,
    data_criacao TIMESTAMP DEFAULT NOW()
);

-- Histórico do Bot
CREATE TABLE IF NOT EXISTS bot_historico (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER,
    lead_id INTEGER,
    mensagem_usuario TEXT,
    resposta_bot TEXT,
    modelo_usado TEXT,
    tokens_usados INTEGER,
    tempo_resposta DECIMAL(5,2),
    avaliacao INTEGER,
    data_interacao TIMESTAMP DEFAULT NOW()
);

-- Respostas Rápidas do Bot
CREATE TABLE IF NOT EXISTS bot_respostas_rapidas (
    id SERIAL PRIMARY KEY,
    gatilho TEXT NOT NULL,
    resposta TEXT NOT NULL,
    categoria TEXT,
    ordem INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT true
);

-- Pipelines CRM
CREATE TABLE IF NOT EXISTS crm_pipelines (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    cor TEXT DEFAULT '#3498db',
    ordem INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT true,
    data_criacao TIMESTAMP DEFAULT NOW()
);

-- Estágios do Pipeline
CREATE TABLE IF NOT EXISTS crm_estagios (
    id SERIAL PRIMARY KEY,
    pipeline_id INTEGER REFERENCES crm_pipelines(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cor TEXT DEFAULT '#95a5a6',
    ordem INTEGER DEFAULT 0,
    probabilidade INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT true
);

-- Negócios/Deals CRM
CREATE TABLE IF NOT EXISTS crm_negocios (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    pipeline_id INTEGER REFERENCES crm_pipelines(id) ON DELETE SET NULL,
    estagio_id INTEGER REFERENCES crm_estagios(id) ON DELETE SET NULL,
    titulo TEXT NOT NULL,
    valor DECIMAL(12,2),
    moeda TEXT DEFAULT 'BRL',
    probabilidade INTEGER DEFAULT 0,
    data_fechamento_prevista DATE,
    data_fechamento_real DATE,
    status TEXT DEFAULT 'aberto',
    responsavel TEXT,
    notas TEXT,
    data_criacao TIMESTAMP DEFAULT NOW(),
    data_atualizacao TIMESTAMP DEFAULT NOW()
);

-- Atividades CRM
CREATE TABLE IF NOT EXISTS crm_atividades (
    id SERIAL PRIMARY KEY,
    negocio_id INTEGER REFERENCES crm_negocios(id) ON DELETE CASCADE,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    tipo TEXT DEFAULT 'tarefa',
    titulo TEXT NOT NULL,
    descricao TEXT,
    data_agendada TIMESTAMP,
    data_conclusao TIMESTAMP,
    status TEXT DEFAULT 'pendente',
    prioridade TEXT DEFAULT 'media',
    responsavel TEXT,
    data_criacao TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_leads_telefone ON leads(telefone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON whatsapp_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_crm_negocios_pipeline ON crm_negocios(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_negocios_estagio ON crm_negocios(estagio_id);

-- Habilitar RLS (Row Level Security) para segurança
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_negocios ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (permite tudo para desenvolvimento)
DROP POLICY IF EXISTS "Allow all for leads" ON leads;
CREATE POLICY "Allow all for leads" ON leads FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for whatsapp_contacts" ON whatsapp_contacts;
CREATE POLICY "Allow all for whatsapp_contacts" ON whatsapp_contacts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for whatsapp_messages" ON whatsapp_messages;
CREATE POLICY "Allow all for whatsapp_messages" ON whatsapp_messages FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for crm_negocios" ON crm_negocios;
CREATE POLICY "Allow all for crm_negocios" ON crm_negocios FOR ALL USING (true) WITH CHECK (true);

-- Confirmar criação
SELECT 'Tabelas criadas com sucesso!' as status;
