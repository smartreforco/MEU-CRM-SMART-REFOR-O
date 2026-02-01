-- ============================================================
-- TABELAS PARA BOT CONFIG
-- Execute no Supabase SQL Editor
-- ============================================================

-- Tabela de respostas automáticas do bot
CREATE TABLE IF NOT EXISTS bot_responses (
    id SERIAL PRIMARY KEY,
    trigger TEXT NOT NULL,
    response TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dropar tabela antiga se existir com schema diferente
DROP TABLE IF EXISTS bot_config CASCADE;

-- Tabela de configurações do bot IA
CREATE TABLE bot_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    ia_enabled BOOLEAN DEFAULT false,
    ia_provider TEXT DEFAULT 'gemini',
    ia_api_key TEXT,
    ia_prompt TEXT,
    ia_restrictions TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir config padrão
INSERT INTO bot_config (id, ia_enabled, ia_provider, ia_prompt)
VALUES (1, false, 'gemini', 'Você é o assistente virtual do Smart Reforço.');

-- RLS Policies
ALTER TABLE bot_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

-- Dropar policies antigas se existirem
DROP POLICY IF EXISTS "anon_select_bot_responses" ON bot_responses;
DROP POLICY IF EXISTS "anon_insert_bot_responses" ON bot_responses;
DROP POLICY IF EXISTS "anon_update_bot_responses" ON bot_responses;
DROP POLICY IF EXISTS "anon_delete_bot_responses" ON bot_responses;
DROP POLICY IF EXISTS "anon_select_bot_config" ON bot_config;
DROP POLICY IF EXISTS "anon_insert_bot_config" ON bot_config;
DROP POLICY IF EXISTS "anon_update_bot_config" ON bot_config;

-- Permitir acesso anon (para desenvolvimento)
CREATE POLICY "anon_select_bot_responses" ON bot_responses FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_bot_responses" ON bot_responses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_bot_responses" ON bot_responses FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_bot_responses" ON bot_responses FOR DELETE TO anon USING (true);

CREATE POLICY "anon_select_bot_config" ON bot_config FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_bot_config" ON bot_config FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_bot_config" ON bot_config FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Criar tabela de templates se não existir
CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    language TEXT DEFAULT 'pt_BR',
    category TEXT DEFAULT 'MARKETING',
    status TEXT DEFAULT 'APPROVED',
    components JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS para templates
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Permitir acesso às templates (dropar antes se existir)
DROP POLICY IF EXISTS "anon_select_templates" ON whatsapp_templates;
DROP POLICY IF EXISTS "anon_insert_templates" ON whatsapp_templates;
DROP POLICY IF EXISTS "anon_update_templates" ON whatsapp_templates;
DROP POLICY IF EXISTS "anon_delete_templates" ON whatsapp_templates;

CREATE POLICY "anon_select_templates" ON whatsapp_templates FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_templates" ON whatsapp_templates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_templates" ON whatsapp_templates FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_templates" ON whatsapp_templates FOR DELETE TO anon USING (true);

-- Criar bucket de mídia se não existir (via dashboard)
-- Storage > New bucket > Nome: media > Public: true

-- ============================================================
-- CRIAR BUCKET DE STORAGE PARA MÍDIA
-- ============================================================

-- Criar bucket 'media' se não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'media', 
    'media', 
    true, 
    52428800, -- 50MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET 
    public = true,
    file_size_limit = 52428800;

-- Políticas de Storage para o bucket media
DROP POLICY IF EXISTS "Acesso publico leitura media" ON storage.objects;
DROP POLICY IF EXISTS "Acesso anon upload media" ON storage.objects;
DROP POLICY IF EXISTS "Acesso anon delete media" ON storage.objects;

-- Permitir leitura pública
CREATE POLICY "Acesso publico leitura media" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'media');

-- Permitir upload anônimo
CREATE POLICY "Acesso anon upload media" ON storage.objects
    FOR INSERT TO anon
    WITH CHECK (bucket_id = 'media');

-- Permitir delete anônimo
CREATE POLICY "Acesso anon delete media" ON storage.objects
    FOR DELETE TO anon
    USING (bucket_id = 'media');

COMMENT ON TABLE bot_responses IS 'Respostas automáticas baseadas em palavras-chave';
COMMENT ON TABLE bot_config IS 'Configurações do bot IA';
