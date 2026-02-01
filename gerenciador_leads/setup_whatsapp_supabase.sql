-- ============================================================
-- SCHEMA WHATSAPP - Smart Reforço
-- Tabelas para integração com WhatsApp Business Cloud API
-- ============================================================

-- Configuração do WhatsApp (credenciais seguras)
CREATE TABLE IF NOT EXISTS whatsapp_config (
    id SERIAL PRIMARY KEY,
    phone_number_id TEXT NOT NULL,
    business_account_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    verify_token TEXT NOT NULL,
    webhook_url TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Mensagens do WhatsApp
CREATE TABLE IF NOT EXISTS mensagens (
    id SERIAL PRIMARY KEY,
    -- Identificadores
    wamid TEXT UNIQUE,  -- ID da mensagem no WhatsApp
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    telefone TEXT NOT NULL,
    
    -- Conteúdo
    tipo TEXT NOT NULL DEFAULT 'text',  -- text, image, audio, video, document, sticker, location, template
    conteudo TEXT,
    caption TEXT,
    
    -- Mídia
    media_id TEXT,
    media_url TEXT,
    media_mime TEXT,
    media_filename TEXT,
    
    -- Direção e status
    direcao TEXT NOT NULL,  -- 'incoming' ou 'outgoing'
    status TEXT DEFAULT 'sent',  -- pending, sent, delivered, read, failed
    
    -- Resposta/Reply
    reply_to_wamid TEXT,
    
    -- Metadados
    metadata JSONB,
    erro TEXT,
    
    -- Timestamps
    timestamp_whatsapp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Templates de mensagem aprovados pela Meta
CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    language TEXT DEFAULT 'pt_BR',
    category TEXT,  -- MARKETING, UTILITY, AUTHENTICATION
    status TEXT DEFAULT 'APPROVED',  -- APPROVED, PENDING, REJECTED
    components JSONB,  -- Estrutura do template
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Log de webhooks recebidos (para debug)
CREATE TABLE IF NOT EXISTS webhook_logs (
    id SERIAL PRIMARY KEY,
    tipo TEXT,  -- message, status, error
    payload JSONB,
    processado BOOLEAN DEFAULT false,
    erro TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fila de envio em massa
CREATE TABLE IF NOT EXISTS envio_massa (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    template_name TEXT,
    mensagem TEXT,
    tipo TEXT DEFAULT 'text',
    
    -- Status
    status TEXT DEFAULT 'pendente',  -- pendente, em_andamento, concluido, cancelado
    total INTEGER DEFAULT 0,
    enviados INTEGER DEFAULT 0,
    sucesso INTEGER DEFAULT 0,
    falha INTEGER DEFAULT 0,
    
    -- Lista de telefones (JSON array)
    telefones JSONB,
    resultados JSONB,
    
    -- Timestamps
    iniciado_em TIMESTAMP WITH TIME ZONE,
    concluido_em TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Configuração do Bot IA
CREATE TABLE IF NOT EXISTS bot_config (
    id SERIAL PRIMARY KEY,
    ativo BOOLEAN DEFAULT true,
    modelo TEXT DEFAULT 'gemini-2.5-flash',
    api_key TEXT,
    system_prompt TEXT,
    temperatura DECIMAL(2,1) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 500,
    horario_inicio TIME DEFAULT '08:00',
    horario_fim TIME DEFAULT '22:00',
    dias_semana TEXT DEFAULT '1,2,3,4,5,6',  -- 0=dom, 6=sab
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- INDEXES para performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_mensagens_telefone ON mensagens(telefone);
CREATE INDEX IF NOT EXISTS idx_mensagens_lead_id ON mensagens(lead_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_direcao ON mensagens(direcao);
CREATE INDEX IF NOT EXISTS idx_mensagens_status ON mensagens(status);
CREATE INDEX IF NOT EXISTS idx_mensagens_created_at ON mensagens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_wamid ON mensagens(wamid);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_tipo ON webhook_logs(tipo);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- ============================================================
-- TRIGGERS para updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_mensagens_updated_at ON mensagens;
CREATE TRIGGER update_mensagens_updated_at
    BEFORE UPDATE ON mensagens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_config_updated_at ON whatsapp_config;
CREATE TRIGGER update_whatsapp_config_updated_at
    BEFORE UPDATE ON whatsapp_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS
ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE envio_massa ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

-- Políticas para service_role (backend)
CREATE POLICY "Service role full access whatsapp_config" ON whatsapp_config
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access mensagens" ON mensagens
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access whatsapp_templates" ON whatsapp_templates
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access webhook_logs" ON webhook_logs
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access envio_massa" ON envio_massa
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access bot_config" ON bot_config
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- INSERIR CONFIGURAÇÃO INICIAL
-- ============================================================

-- Inserir config do WhatsApp (será atualizada pelo backend)
INSERT INTO whatsapp_config (phone_number_id, business_account_id, access_token, verify_token)
VALUES ('', '', '', 'smart_reforco_verify_2024')
ON CONFLICT DO NOTHING;

-- Inserir config do bot
INSERT INTO bot_config (ativo, modelo, system_prompt)
VALUES (true, 'gemini-2.5-flash', 'Você é um assistente virtual da Smart Reforço, uma escola de reforço escolar. Seja educado, prestativo e objetivo. Foque em ajudar pais e alunos a entenderem nossos serviços de reforço escolar para fundamental e médio.')
ON CONFLICT DO NOTHING;

-- Template hello_world padrão da Meta
INSERT INTO whatsapp_templates (name, language, category, status, components)
VALUES ('hello_world', 'en_US', 'UTILITY', 'APPROVED', '{"header": null, "body": {"text": "Hello World"}, "footer": null, "buttons": null}')
ON CONFLICT (name) DO NOTHING;
