-- =====================================================
-- EXECUTAR NO SQL EDITOR DO SUPABASE
-- https://supabase.com/dashboard/project/dcieravtcvoprktjgvry/sql
-- =====================================================

-- 1. Criar tabela de lotes
CREATE TABLE IF NOT EXISTS lotes (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    quantidade INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'arquivado', 'pausado')),
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_arquivado TIMESTAMP WITH TIME ZONE,
    motivo_arquivo TEXT
);

-- 2. Adicionar colunas na tabela leads
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS lote_id INTEGER,
ADD COLUMN IF NOT EXISTS arquivado BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS data_arquivado TIMESTAMP WITH TIME ZONE;

-- 3. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_leads_lote_id ON leads(lote_id);
CREATE INDEX IF NOT EXISTS idx_leads_arquivado ON leads(arquivado);
CREATE INDEX IF NOT EXISTS idx_lotes_status ON lotes(status);

-- 4. Habilitar RLS (Row Level Security) para lotes
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;

-- 5. Criar política de acesso público para lotes (para dev)
CREATE POLICY "Enable all access for lotes" ON lotes
    FOR ALL USING (true) WITH CHECK (true);

-- 6. Verificar se funcionou
SELECT 'Tabela lotes criada!' as resultado;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leads' AND column_name IN ('lote_id', 'arquivado', 'data_arquivado');
