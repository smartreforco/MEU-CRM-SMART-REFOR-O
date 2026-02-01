"""
Script de Migração Completa para Supabase
=========================================
Cria tabelas via SQL Editor e migra dados via API REST
"""

import sqlite3
import requests
import json
from datetime import datetime

# ==================== CONFIGURAÇÕES SUPABASE ====================
SUPABASE_URL = "https://dcieravtcvoprktjgvry.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY1Njk4MywiZXhwIjoyMDg1MjMyOTgzfQ.rXssYaxuJxOhFffBFK8xh0d80Hyw33aIFqQepLLtGV0"

# SQLite local
SQLITE_PATH = "leads.db"

# Schema SQL para criar no Dashboard
SCHEMA_SQL = '''
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
'''

def get_headers():
    """Headers para API REST do Supabase"""
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

def get_sqlite_connection():
    """Conecta ao SQLite local"""
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def supabase_insert_batch(table, data_list, batch_size=50):
    """Insere múltiplos registros em lotes"""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = get_headers()
    
    total = 0
    errors = 0
    
    for i in range(0, len(data_list), batch_size):
        batch = data_list[i:i+batch_size]
        response = requests.post(url, headers=headers, json=batch)
        
        if response.status_code in [200, 201]:
            total += len(batch)
            print(f"  ✅ Lote {i//batch_size + 1}: {len(batch)} registros")
        else:
            errors += len(batch)
            error_msg = response.text[:200] if response.text else f"Status {response.status_code}"
            print(f"  ⚠️ Erro no lote {i//batch_size + 1}: {error_msg}")
    
    return total, errors

def test_connection():
    """Testa conexão com Supabase"""
    print("🔌 Testando conexão com Supabase...")
    
    # Tenta acessar a tabela leads
    url = f"{SUPABASE_URL}/rest/v1/leads?select=count"
    headers = get_headers()
    headers["Prefer"] = "count=exact"
    
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        print("✅ Conectado ao Supabase!")
        count = response.headers.get('content-range', '0').split('/')[1] if '/' in response.headers.get('content-range', '') else '0'
        print(f"   Leads existentes no Supabase: {count}")
        return True
    elif response.status_code == 404 or "does not exist" in response.text:
        print("⚠️ Tabela 'leads' não encontrada!")
        print("\n" + "=" * 60)
        print("📋 EXECUTE O SCHEMA SQL NO SUPABASE:")
        print("=" * 60)
        print("\n1. Acesse: https://supabase.com/dashboard/project/dcieravtcvoprktjgvry/sql")
        print("2. Clique em 'New Query'")
        print("3. Cole o conteúdo do arquivo: schema_supabase.sql")
        print("4. Clique em 'Run'")
        print("\nO arquivo schema_supabase.sql foi criado na pasta atual.")
        
        # Salvar schema em arquivo
        with open("schema_supabase.sql", "w", encoding="utf-8") as f:
            f.write(SCHEMA_SQL)
        
        return False
    else:
        print(f"❌ Erro: {response.status_code} - {response.text[:200]}")
        return False

def migrate_leads(sqlite_conn):
    """Migra todos os leads"""
    print("\n🚀 Migrando leads...")
    
    cursor = sqlite_conn.cursor()
    cursor.execute("SELECT * FROM leads")
    leads = cursor.fetchall()
    
    if not leads:
        print("⚠️ Nenhum lead encontrado")
        return 0
    
    print(f"   Encontrados {len(leads)} leads no SQLite")
    
    # Colunas permitidas no PostgreSQL
    allowed_columns = [
        'nome', 'telefone', 'email', 'origem', 'interesse', 'observacoes',
        'status', 'prioridade', 'data_criacao', 'data_atualizacao',
        'ultimo_contato', 'proximo_contato', 'responsavel', 'valor_potencial',
        'tags', 'fonte_arquivo', 'cidade', 'estado', 'empresa', 'cargo', 'whatsapp_status'
    ]
    
    # Converter para lista de dicts
    data_list = []
    for lead in leads:
        lead_dict = dict(lead)
        clean_dict = {}
        for key, value in lead_dict.items():
            if key != 'id' and key in allowed_columns and value is not None:
                clean_dict[key] = value
        
        if clean_dict:
            data_list.append(clean_dict)
    
    total, errors = supabase_insert_batch('leads', data_list)
    print(f"\n✅ {total} leads migrados! ({errors} erros)")
    return total

def migrate_table(sqlite_conn, table_name, allowed_columns=None):
    """Migra uma tabela genérica"""
    print(f"\n📦 Migrando {table_name}...")
    
    cursor = sqlite_conn.cursor()
    
    try:
        cursor.execute(f"SELECT * FROM {table_name}")
        rows = cursor.fetchall()
    except Exception as e:
        print(f"  ⚠️ Tabela não existe no SQLite")
        return 0
    
    if not rows:
        print(f"  ℹ️ Nenhum registro")
        return 0
    
    # Converter para lista de dicts
    data_list = []
    for row in rows:
        row_dict = dict(row)
        if 'id' in row_dict:
            del row_dict['id']
        
        if allowed_columns:
            row_dict = {k: v for k, v in row_dict.items() if k in allowed_columns and v is not None}
        else:
            row_dict = {k: v for k, v in row_dict.items() if v is not None}
        
        if row_dict:
            data_list.append(row_dict)
    
    if not data_list:
        print(f"  ℹ️ Nenhum registro válido")
        return 0
    
    total, errors = supabase_insert_batch(table_name, data_list)
    return total

def migrate_all():
    """Executa migração completa"""
    print("=" * 60)
    print("🚀 MIGRAÇÃO PARA SUPABASE")
    print("=" * 60)
    
    # Testar conexão e verificar tabelas
    if not test_connection():
        return False
    
    # Conectar SQLite
    print("\n🔌 Conectando ao SQLite local...")
    sqlite_conn = get_sqlite_connection()
    print("✅ Conectado ao SQLite!")
    
    total = 0
    
    # Migrar leads
    total += migrate_leads(sqlite_conn)
    
    # Tabelas e suas colunas
    tables_config = {
        'unidades': ['nome', 'descricao', 'cor', 'icone', 'data_criacao'],
        'whatsapp_config': ['provider', 'api_url', 'api_token', 'instance_id', 
                           'phone_number_id', 'access_token', 'verify_token', 
                           'webhook_url', 'ativo', 'data_atualizacao'],
        'whatsapp_contacts': ['phone', 'name', 'profile_pic', 'last_message', 
                              'unread_count', 'status', 'data_criacao'],
        'message_templates': ['nome', 'categoria', 'conteudo', 'variaveis', 'ativo', 'data_criacao'],
        'bot_config': ['ativo', 'provider', 'ollama_url', 'modelo', 'temperatura',
                       'max_tokens', 'cloud_provider', 'cloud_api_key', 'cloud_model',
                       'usar_cloud', 'auto_responder', 'horario_inicio', 'horario_fim',
                       'dias_semana', 'delay_resposta', 'data_atualizacao'],
        'bot_personalidade': ['nome', 'descricao', 'system_prompt', 'tom', 'idioma', 
                              'ativo', 'data_criacao'],
        'bot_conhecimento': ['categoria', 'pergunta', 'resposta', 'palavras_chave',
                             'prioridade', 'ativo', 'data_criacao'],
        'bot_respostas_rapidas': ['gatilho', 'resposta', 'categoria', 'ordem', 'ativo'],
        'crm_pipelines': ['nome', 'descricao', 'cor', 'ordem', 'ativo', 'data_criacao'],
        'crm_estagios': ['pipeline_id', 'nome', 'cor', 'ordem', 'probabilidade', 'ativo'],
    }
    
    for table, columns in tables_config.items():
        total += migrate_table(sqlite_conn, table, columns)
    
    sqlite_conn.close()
    
    print("\n" + "=" * 60)
    print(f"✅ MIGRAÇÃO CONCLUÍDA! Total: {total} registros")
    print("=" * 60)
    
    # Salvar configuração
    config = {
        "supabase_url": SUPABASE_URL,
        "supabase_anon_key": SUPABASE_ANON_KEY,
        "migrated_at": datetime.now().isoformat(),
        "total_records": total
    }
    
    with open("supabase_config.json", "w") as f:
        json.dump(config, f, indent=2)
    
    print("\n📁 Configuração salva em supabase_config.json")
    
    return True

if __name__ == "__main__":
    migrate_all()
