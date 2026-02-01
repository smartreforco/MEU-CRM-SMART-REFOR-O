-- Criar tabela mensagens
CREATE TABLE IF NOT EXISTS mensagens (
    id SERIAL PRIMARY KEY,
    wamid TEXT UNIQUE,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    telefone TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'text',
    conteudo TEXT,
    caption TEXT,
    media_id TEXT,
    media_url TEXT,
    media_mime TEXT,
    media_filename TEXT,
    direcao TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    reply_to_wamid TEXT,
    metadata JSONB,
    erro TEXT,
    timestamp_whatsapp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela webhook_logs
CREATE TABLE IF NOT EXISTS webhook_logs (
    id SERIAL PRIMARY KEY,
    tipo TEXT,
    payload JSONB,
    processado BOOLEAN DEFAULT false,
    erro TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mensagens_telefone ON mensagens(telefone);
CREATE INDEX IF NOT EXISTS idx_mensagens_lead_id ON mensagens(lead_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_created_at ON mensagens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_wamid ON mensagens(wamid);
