"""
Gerenciador de Leads + WhatsApp Chat Completo
Usando WhatsApp Business Cloud API (Meta)
"""

from flask import Flask, render_template, request, jsonify, send_file, Response
import pandas as pd
import os
import json
import re
from datetime import datetime
import sqlite3
import threading
import time
from werkzeug.utils import secure_filename

# Importar cliente Meta WhatsApp API
from whatsapp.meta_client import WhatsAppCloudAPI, MessageStatus, MessageType, ErrorCodes

app = Flask(__name__)
app.secret_key = 'sua_chave_secreta_leads_whatsapp_2024'
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
app.config['MEDIA_FOLDER'] = os.path.join(os.path.dirname(__file__), 'media')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max

# Criar pastas necessárias
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['MEDIA_FOLDER'], exist_ok=True)

# Variável global para controle de envio em massa
envio_em_andamento = {
    'ativo': False,
    'total': 0,
    'enviados': 0,
    'sucesso': 0,
    'falha': 0,
    'cancelado': False,
    'resultados': []
}

# Cache do cliente WhatsApp
whatsapp_client = None

# =============================================================================
# BANCO DE DADOS
# =============================================================================

DB_PATH = os.path.join(os.path.dirname(__file__), 'leads.db')
EXCEL_FOLDER = r"C:\Users\kaleb\Desktop\CONTATOS SMART REFORÇO"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Inicializa todas as tabelas do banco de dados"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Tabela de leads
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            telefone TEXT UNIQUE,
            email TEXT,
            endereco TEXT,
            cidade TEXT,
            tipo_servico TEXT,
            avaliacao TEXT,
            link_maps TEXT,
            status TEXT DEFAULT 'novo',
            estagio_funil TEXT DEFAULT 'novo',
            origem TEXT DEFAULT 'WhatsApp',
            observacoes TEXT,
            bot_ativo INTEGER DEFAULT 1,
            nao_lidas INTEGER DEFAULT 0,
            ultima_mensagem TEXT,
            ultima_msg TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Adicionar colunas se não existirem (para DBs existentes)
    try:
        cursor.execute('ALTER TABLE leads ADD COLUMN email TEXT')
    except: pass
    try:
        cursor.execute('ALTER TABLE leads ADD COLUMN estagio_funil TEXT DEFAULT "novo"')
    except: pass
    try:
        cursor.execute('ALTER TABLE leads ADD COLUMN origem TEXT DEFAULT "WhatsApp"')
    except: pass
    try:
        cursor.execute('ALTER TABLE leads ADD COLUMN observacoes TEXT')
    except: pass
    try:
        cursor.execute('ALTER TABLE leads ADD COLUMN bot_ativo INTEGER DEFAULT 1')
    except: pass
    try:
        cursor.execute('ALTER TABLE leads ADD COLUMN nao_lidas INTEGER DEFAULT 0')
    except: pass
    try:
        cursor.execute('ALTER TABLE leads ADD COLUMN ultima_mensagem TEXT')
    except: pass
    try:
        cursor.execute('ALTER TABLE leads ADD COLUMN ultima_msg TIMESTAMP')
    except: pass
    
    # Tabela de anotações
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS anotacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER,
            texto TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lead_id) REFERENCES leads (id)
        )
    ''')
    
    # Tabela de histórico
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER,
            acao TEXT,
            descricao TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lead_id) REFERENCES leads (id)
        )
    ''')
    
    # =========================================================================
    # TABELAS WHATSAPP - META API
    # =========================================================================
    
    # Configuração da API WhatsApp (Meta)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS whatsapp_config (
            id INTEGER PRIMARY KEY,
            phone_number_id TEXT,
            access_token TEXT,
            business_account_id TEXT,
            verify_token TEXT,
            webhook_url TEXT,
            ativo INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Contatos do WhatsApp
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS whatsapp_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE,
            name TEXT,
            profile_picture TEXT,
            lead_id INTEGER,
            last_message_at TIMESTAMP,
            unread_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lead_id) REFERENCES leads (id)
        )
    ''')
    
    # Conversas (agrupamento de mensagens por contato)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS whatsapp_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER UNIQUE,
            last_message TEXT,
            last_message_type TEXT,
            last_message_time TIMESTAMP,
            is_archived INTEGER DEFAULT 0,
            is_pinned INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts (id)
        )
    ''')
    
    # Mensagens do WhatsApp
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS whatsapp_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wa_message_id TEXT UNIQUE,
            contact_id INTEGER,
            conversation_id INTEGER,
            direction TEXT,
            type TEXT,
            content TEXT,
            media_url TEXT,
            media_mime TEXT,
            media_filename TEXT,
            caption TEXT,
            status TEXT DEFAULT 'pending',
            error_message TEXT,
            timestamp TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts (id),
            FOREIGN KEY (conversation_id) REFERENCES whatsapp_conversations (id)
        )
    ''')
    
    # Templates do WhatsApp (aprovados pela Meta)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS whatsapp_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id TEXT,
            name TEXT,
            language TEXT,
            category TEXT,
            status TEXT,
            components TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Templates locais (rascunhos)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS message_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            descricao TEXT,
            mensagem TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # =========================================================================
    # TABELAS CRM - PIPELINE E ESTÁGIOS
    # =========================================================================
    
    # Unidades/Pastas para organização
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS unidades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            descricao TEXT,
            cor TEXT DEFAULT '#4f46e5',
            ordem INTEGER DEFAULT 0,
            ativo INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Pipelines do CRM (ex: Vendas, Suporte, etc)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS crm_pipelines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            descricao TEXT,
            unidade_id INTEGER,
            ativo INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (unidade_id) REFERENCES unidades (id)
        )
    ''')
    
    # Estágios do Pipeline (Kanban columns)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS crm_estagios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pipeline_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            cor TEXT DEFAULT '#6b7280',
            ordem INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pipeline_id) REFERENCES crm_pipelines (id)
        )
    ''')
    
    # Negócios/Oportunidades (Cards do Kanban)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS crm_negocios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER,
            contact_id INTEGER,
            pipeline_id INTEGER NOT NULL,
            estagio_id INTEGER NOT NULL,
            unidade_id INTEGER,
            titulo TEXT NOT NULL,
            valor REAL DEFAULT 0,
            probabilidade INTEGER DEFAULT 50,
            data_previsao DATE,
            responsavel TEXT,
            descricao TEXT,
            tags TEXT,
            ordem INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lead_id) REFERENCES leads (id),
            FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts (id),
            FOREIGN KEY (pipeline_id) REFERENCES crm_pipelines (id),
            FOREIGN KEY (estagio_id) REFERENCES crm_estagios (id),
            FOREIGN KEY (unidade_id) REFERENCES unidades (id)
        )
    ''')
    
    # Atividades do CRM (tarefas, ligações, reuniões)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS crm_atividades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            negocio_id INTEGER,
            lead_id INTEGER,
            tipo TEXT NOT NULL,
            titulo TEXT NOT NULL,
            descricao TEXT,
            data_agendada TIMESTAMP,
            data_conclusao TIMESTAMP,
            concluida INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (negocio_id) REFERENCES crm_negocios (id),
            FOREIGN KEY (lead_id) REFERENCES leads (id)
        )
    ''')
    
    # Vincular leads a unidades
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS lead_unidades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL,
            unidade_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(lead_id, unidade_id),
            FOREIGN KEY (lead_id) REFERENCES leads (id),
            FOREIGN KEY (unidade_id) REFERENCES unidades (id)
        )
    ''')
    
    # =========================================================================
    # TABELAS BOT IA - OLLAMA + CLOUD AI
    # =========================================================================
    
    # Configuração do Bot IA
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bot_config (
            id INTEGER PRIMARY KEY,
            ativo INTEGER DEFAULT 0,
            modelo TEXT DEFAULT 'mistral',
            ollama_url TEXT DEFAULT 'http://localhost:11434',
            temperatura REAL DEFAULT 0.7,
            max_tokens INTEGER DEFAULT 500,
            resposta_automatica INTEGER DEFAULT 0,
            horario_inicio TEXT DEFAULT '08:00',
            horario_fim TEXT DEFAULT '18:00',
            dias_semana TEXT DEFAULT '1,2,3,4,5',
            usar_cloud INTEGER DEFAULT 0,
            cloud_provider TEXT DEFAULT 'gemini',
            cloud_api_key TEXT,
            cloud_model TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Personalidade e Contexto do Bot
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bot_personalidade (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            descricao TEXT,
            system_prompt TEXT NOT NULL,
            exemplos_conversa TEXT,
            ativo INTEGER DEFAULT 1,
            unidade_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (unidade_id) REFERENCES unidades (id)
        )
    ''')
    
    # Base de conhecimento do Bot
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bot_conhecimento (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            personalidade_id INTEGER,
            titulo TEXT NOT NULL,
            conteudo TEXT NOT NULL,
            categoria TEXT,
            embedding TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (personalidade_id) REFERENCES bot_personalidade (id)
        )
    ''')
    
    # Histórico de conversas do Bot (para contexto)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bot_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            tokens_usado INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts (id)
        )
    ''')
    
    # Respostas rápidas/FAQ
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bot_respostas_rapidas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gatilho TEXT NOT NULL,
            resposta TEXT NOT NULL,
            tipo TEXT DEFAULT 'contem',
            prioridade INTEGER DEFAULT 0,
            ativo INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Inserir unidades padrão se não existirem
    cursor.execute('SELECT COUNT(*) FROM unidades')
    if cursor.fetchone()[0] == 0:
        cursor.executemany('''
            INSERT INTO unidades (nome, descricao, cor, ordem) VALUES (?, ?, ?, ?)
        ''', [
            ('Unidade 1', 'Primeira unidade', '#4f46e5', 1),
            ('Unidade 2', 'Segunda unidade', '#10b981', 2),
            ('Geral', 'Contatos gerais', '#6b7280', 0)
        ])
    
    # Inserir pipeline padrão se não existir
    cursor.execute('SELECT COUNT(*) FROM crm_pipelines')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO crm_pipelines (nome, descricao) VALUES (?, ?)
        ''', ('Pipeline Vendas', 'Pipeline principal de vendas'))
        
        # Inserir estágios padrão
        cursor.executemany('''
            INSERT INTO crm_estagios (pipeline_id, nome, cor, ordem) VALUES (?, ?, ?, ?)
        ''', [
            (1, 'Novo Lead', '#3b82f6', 1),
            (1, 'Qualificação', '#8b5cf6', 2),
            (1, 'Proposta', '#f59e0b', 3),
            (1, 'Negociação', '#ef4444', 4),
            (1, 'Fechado Ganho', '#10b981', 5),
            (1, 'Fechado Perdido', '#6b7280', 6)
        ])
    
    # Inserir config do bot se não existir
    cursor.execute('SELECT COUNT(*) FROM bot_config')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO bot_config (id, ativo, modelo) VALUES (1, 0, 'mistral')
        ''')
    
    # Inserir personalidade padrão se não existir
    cursor.execute('SELECT COUNT(*) FROM bot_personalidade')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO bot_personalidade (nome, descricao, system_prompt, ativo)
            VALUES (?, ?, ?, ?)
        ''', (
            'Assistente Smart Reforço',
            'Assistente virtual da Smart Reforço',
            '''Você é um assistente virtual profissional da Smart Reforço, uma empresa especializada em reforço estrutural.

PERSONALIDADE:
- Seja cordial, profissional e prestativo
- Use linguagem clara e objetiva
- Responda em português brasileiro

CONHECIMENTO:
- A Smart Reforço oferece serviços de reforço estrutural
- Trabalhamos com fibra de carbono, protensão e recuperação estrutural
- Atendemos em todo o Brasil

INSTRUÇÕES:
- Sempre cumprimente o cliente pelo nome quando disponível
- Ofereça ajuda de forma proativa
- Se não souber algo, diga que vai verificar com a equipe
- Tente agendar uma visita técnica quando apropriado
- Colete informações: nome, telefone, cidade, tipo de serviço necessário''',
            1
        ))

    # Inserir configuração padrão se não existir
    cursor.execute('SELECT COUNT(*) FROM whatsapp_config')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO whatsapp_config (id, phone_number_id, access_token, verify_token)
            VALUES (1, '', '', 'meu_token_verificacao_123')
        ''')
    
    conn.commit()
    conn.close()
    print("Banco de dados inicializado!")

def get_whatsapp_client():
    """Obtém ou cria o cliente WhatsApp"""
    global whatsapp_client
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM whatsapp_config WHERE id = 1')
    config = cursor.fetchone()
    conn.close()
    
    if config and config['phone_number_id'] and config['access_token']:
        whatsapp_client = WhatsAppCloudAPI(
            phone_number_id=config['phone_number_id'],
            access_token=config['access_token'],
            business_account_id=config['business_account_id'] or None
        )
        return whatsapp_client
    return None

def normalizar_telefone(telefone):
    """Remove caracteres não numéricos do telefone"""
    if not telefone:
        return ''
    apenas_numeros = re.sub(r'\D', '', str(telefone))
    if apenas_numeros.startswith('55') and len(apenas_numeros) > 11:
        apenas_numeros = apenas_numeros[2:]
    if len(apenas_numeros) == 11 and apenas_numeros.startswith('0'):
        apenas_numeros = apenas_numeros[1:]
    return apenas_numeros

# =============================================================================
# ROTAS PRINCIPAIS - SISTEMA UNIFICADO
# =============================================================================

@app.route('/')
def index():
    """Página principal - WhatsApp Pro unificado"""
    return render_template('whatsapp_pro.html')

@app.route('/leads')
def leads_page():
    return render_template('index.html')

@app.route('/chat')
def chat_page():
    """Chat antigo (legacy)"""
    return render_template('chat.html')

# =============================================================================
# API - ESTATÍSTICAS
# =============================================================================

@app.route('/api/stats')
def get_stats():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) as total FROM leads')
    total = cursor.fetchone()['total']
    
    cursor.execute('SELECT status, COUNT(*) as count FROM leads GROUP BY status')
    status_counts = {row['status']: row['count'] for row in cursor.fetchall()}
    
    cursor.execute('SELECT cidade, COUNT(*) as count FROM leads GROUP BY cidade ORDER BY count DESC LIMIT 10')
    por_cidade = [{'cidade': row['cidade'], 'count': row['count']} for row in cursor.fetchall()]
    
    cursor.execute('SELECT COUNT(DISTINCT cidade) as total FROM leads')
    total_cidades = cursor.fetchone()['total']
    
    conn.close()
    
    return jsonify({
        'total': total,
        'novo': status_counts.get('novo', 0),
        'em_contato': status_counts.get('em_contato', 0),
        'em_trial': status_counts.get('em_trial', 0),
        'ativo': status_counts.get('ativo', 0),
        'convertido': status_counts.get('convertido', 0),
        'perdido': status_counts.get('perdido', 0),
        'por_cidade': por_cidade,
        'total_cidades': total_cidades
    })

# =============================================================================
# API - LEADS
# =============================================================================

@app.route('/api/leads')
def get_leads():
    """Lista leads com informações de mensagens integradas"""
    conn = get_db()
    cursor = conn.cursor()
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 200, type=int)
    search = request.args.get('search', '')
    status = request.args.get('status', '')
    cidade = request.args.get('cidade', '')
    format_type = request.args.get('format', 'list')  # 'list' ou 'paginated'
    
    query = 'SELECT * FROM leads WHERE 1=1'
    params = []
    
    if search:
        query += ' AND (nome LIKE ? OR telefone LIKE ? OR endereco LIKE ?)'
        search_term = f'%{search}%'
        params.extend([search_term, search_term, search_term])
    
    if status:
        query += ' AND status = ?'
        params.append(status)
    
    if cidade:
        query += ' AND cidade = ?'
        params.append(cidade)
    
    # Contar total
    count_query = query.replace('SELECT *', 'SELECT COUNT(*)')
    cursor.execute(count_query, params)
    total = cursor.fetchone()[0]
    
    # Ordenar por última mensagem ou criação
    query += ' ORDER BY COALESCE(ultima_msg, created_at) DESC LIMIT ? OFFSET ?'
    params.extend([per_page, (page - 1) * per_page])
    
    cursor.execute(query, params)
    leads_raw = cursor.fetchall()
    
    # Enriquecer com dados de contato/mensagens
    leads = []
    for lead_row in leads_raw:
        lead = dict(lead_row)
        
        # Buscar contato associado
        try:
            cursor.execute('''
                SELECT wc.id as contact_id, wc.unread_count
                FROM whatsapp_contacts wc
                WHERE wc.lead_id = ? OR wc.phone = ?
            ''', (lead['id'], lead.get('telefone', '')))
            
            contact = cursor.fetchone()
            if contact:
                lead['contact_id'] = contact['contact_id']
                lead['nao_lidas'] = contact['unread_count'] or 0
            else:
                lead['nao_lidas'] = lead.get('nao_lidas', 0)
        except:
            lead['nao_lidas'] = 0
        
        leads.append(lead)
    
    conn.close()
    
    # Retornar formato simples (lista) por padrão para o frontend unificado
    if format_type == 'paginated':
        return jsonify({
            'leads': leads,
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': (total + per_page - 1) // per_page
        })
    
    # Formato lista simples
    return jsonify(leads)

@app.route('/api/leads/<int:lead_id>')
def get_lead(lead_id):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM leads WHERE id = ?', (lead_id,))
    lead = cursor.fetchone()
    
    if not lead:
        conn.close()
        return jsonify({'error': 'Lead não encontrado'}), 404
    
    lead_dict = dict(lead)
    
    # Buscar anotações
    cursor.execute('SELECT * FROM anotacoes WHERE lead_id = ? ORDER BY created_at DESC', (lead_id,))
    lead_dict['anotacoes'] = [dict(row) for row in cursor.fetchall()]
    
    # Buscar histórico
    cursor.execute('SELECT * FROM historico WHERE lead_id = ? ORDER BY created_at DESC', (lead_id,))
    lead_dict['historico'] = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return jsonify(lead_dict)

@app.route('/api/leads/<int:lead_id>/status', methods=['PUT'])
def update_lead_status(lead_id):
    data = request.get_json()
    novo_status = data.get('status')
    
    if not novo_status:
        return jsonify({'error': 'Status não informado'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?',
                   (novo_status, datetime.now(), lead_id))
    
    cursor.execute('INSERT INTO historico (lead_id, acao, descricao) VALUES (?, ?, ?)',
                   (lead_id, 'status', f'Status alterado para: {novo_status}'))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/leads/<int:lead_id>/anotacao', methods=['POST'])
def add_anotacao(lead_id):
    data = request.get_json()
    texto = data.get('texto')
    
    if not texto:
        return jsonify({'error': 'Texto não informado'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('INSERT INTO anotacoes (lead_id, texto) VALUES (?, ?)', (lead_id, texto))
    cursor.execute('INSERT INTO historico (lead_id, acao, descricao) VALUES (?, ?, ?)',
                   (lead_id, 'anotacao', f'Anotação adicionada'))
    
    conn.commit()
    anotacao_id = cursor.lastrowid
    conn.close()
    
    return jsonify({'success': True, 'id': anotacao_id})

@app.route('/api/cidades')
def get_cidades():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT DISTINCT cidade FROM leads WHERE cidade IS NOT NULL AND cidade != "" ORDER BY cidade')
    cidades = [row['cidade'] for row in cursor.fetchall()]
    conn.close()
    return jsonify(cidades)

# =============================================================================
# API - WHATSAPP CONFIGURAÇÃO
# =============================================================================

@app.route('/api/whatsapp/config', methods=['GET'])
def get_whatsapp_config():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT phone_number_id, business_account_id, verify_token, webhook_url, ativo FROM whatsapp_config WHERE id = 1')
    config = cursor.fetchone()
    conn.close()
    
    if config:
        return jsonify({
            'phone_number_id': config['phone_number_id'] or '',
            'business_account_id': config['business_account_id'] or '',
            'verify_token': config['verify_token'] or '',
            'webhook_url': config['webhook_url'] or '',
            'ativo': bool(config['ativo']),
            'configured': bool(config['phone_number_id'])
        })
    return jsonify({'configured': False})

@app.route('/api/whatsapp/config', methods=['POST'])
def save_whatsapp_config():
    data = request.get_json()
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE whatsapp_config 
        SET phone_number_id = ?, access_token = ?, business_account_id = ?,
            verify_token = ?, webhook_url = ?, updated_at = ?
        WHERE id = 1
    ''', (
        data.get('phone_number_id', ''),
        data.get('access_token', ''),
        data.get('business_account_id', ''),
        data.get('verify_token', 'meu_token_verificacao_123'),
        data.get('webhook_url', ''),
        datetime.now()
    ))
    
    conn.commit()
    conn.close()
    
    # Recriar cliente
    global whatsapp_client
    whatsapp_client = None
    get_whatsapp_client()
    
    return jsonify({'success': True})

@app.route('/api/whatsapp/status')
def get_whatsapp_status():
    """
    Verifica status da conexão com a API WhatsApp Business.
    
    Retorna informações como:
    - connected: se está conectado
    - display_phone_number: número de telefone
    - verified_name: nome verificado
    - quality_rating: GREEN, YELLOW, RED
    - throughput: nível de taxa de transferência
    """
    client = get_whatsapp_client()
    
    if not client:
        return jsonify({
            'connected': False,
            'error': 'API não configurada. Informe Phone Number ID e Access Token.'
        })
    
    try:
        status = client.check_connection()
        return jsonify(status)
    except Exception as e:
        return jsonify({
            'connected': False,
            'error': str(e)
        })

# =============================================================================
# API - WHATSAPP CONTATOS E CONVERSAS
# =============================================================================

@app.route('/api/whatsapp/contacts')
def get_contacts():
    """Lista todos os contatos do WhatsApp"""
    conn = get_db()
    cursor = conn.cursor()
    
    search = request.args.get('search', '')
    
    query = '''
        SELECT c.*, conv.last_message, conv.last_message_time, conv.is_pinned
        FROM whatsapp_contacts c
        LEFT JOIN whatsapp_conversations conv ON c.id = conv.contact_id
        WHERE 1=1
    '''
    params = []
    
    if search:
        query += ' AND (c.name LIKE ? OR c.phone LIKE ?)'
        params.extend([f'%{search}%', f'%{search}%'])
    
    query += ' ORDER BY conv.is_pinned DESC, conv.last_message_time DESC NULLS LAST'
    
    cursor.execute(query, params)
    contacts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify(contacts)

@app.route('/api/whatsapp/contacts', methods=['POST'])
def create_contact():
    """Cria um novo contato"""
    data = request.get_json()
    phone = data.get('phone')
    name = data.get('name', '')
    lead_id = data.get('lead_id')
    
    if not phone:
        return jsonify({'error': 'Telefone obrigatório'}), 400
    
    # Formatar telefone
    phone = re.sub(r'\D', '', phone)
    if not phone.startswith('55'):
        phone = '55' + phone
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            INSERT INTO whatsapp_contacts (phone, name, lead_id)
            VALUES (?, ?, ?)
        ''', (phone, name, lead_id))
        
        contact_id = cursor.lastrowid
        
        # Criar conversa
        cursor.execute('''
            INSERT INTO whatsapp_conversations (contact_id)
            VALUES (?)
        ''', (contact_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'contact_id': contact_id})
    except sqlite3.IntegrityError:
        # Contato já existe
        cursor.execute('SELECT id FROM whatsapp_contacts WHERE phone = ?', (phone,))
        existing = cursor.fetchone()
        conn.close()
        return jsonify({'success': True, 'contact_id': existing['id'], 'existing': True})

@app.route('/api/whatsapp/conversations')
def get_conversations():
    """Lista todas as conversas com última mensagem"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT 
            conv.*,
            c.phone,
            c.name,
            c.profile_picture,
            c.unread_count
        FROM whatsapp_conversations conv
        JOIN whatsapp_contacts c ON conv.contact_id = c.id
        ORDER BY conv.is_pinned DESC, conv.last_message_time DESC
    ''')
    
    conversations = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify(conversations)

@app.route('/api/whatsapp/conversations/<int:contact_id>/messages')
def get_messages(contact_id):
    """Obtém mensagens de uma conversa"""
    conn = get_db()
    cursor = conn.cursor()
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    
    # Buscar contato
    cursor.execute('SELECT * FROM whatsapp_contacts WHERE id = ?', (contact_id,))
    contact = cursor.fetchone()
    
    if not contact:
        conn.close()
        return jsonify({'error': 'Contato não encontrado'}), 404
    
    # Buscar mensagens
    cursor.execute('''
        SELECT * FROM whatsapp_messages 
        WHERE contact_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
    ''', (contact_id, per_page, (page - 1) * per_page))
    
    messages = [dict(row) for row in cursor.fetchall()]
    messages.reverse()  # Ordem cronológica
    
    # Marcar como lidas
    cursor.execute('''
        UPDATE whatsapp_contacts SET unread_count = 0 WHERE id = ?
    ''', (contact_id,))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'contact': dict(contact),
        'messages': messages
    })

# =============================================================================
# API - WHATSAPP ENVIO DE MENSAGENS
# =============================================================================

@app.route('/api/whatsapp/send', methods=['POST'])
def send_message():
    """Envia uma mensagem de texto"""
    data = request.get_json()
    contact_id = data.get('contact_id')
    phone = data.get('phone')
    message = data.get('message')
    
    if not message:
        return jsonify({'error': 'Mensagem obrigatória'}), 400
    
    if not contact_id and not phone:
        return jsonify({'error': 'Informe contact_id ou phone'}), 400
    
    client = get_whatsapp_client()
    if not client:
        return jsonify({'error': 'WhatsApp não configurado'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Se não tiver contact_id, buscar ou criar pelo phone
    if not contact_id:
        phone_formatted = re.sub(r'\D', '', phone)
        if not phone_formatted.startswith('55'):
            phone_formatted = '55' + phone_formatted
        
        cursor.execute('SELECT id FROM whatsapp_contacts WHERE phone = ?', (phone_formatted,))
        existing = cursor.fetchone()
        
        if existing:
            contact_id = existing['id']
        else:
            cursor.execute('INSERT INTO whatsapp_contacts (phone, name) VALUES (?, ?)', 
                          (phone_formatted, ''))
            contact_id = cursor.lastrowid
            cursor.execute('INSERT INTO whatsapp_conversations (contact_id) VALUES (?)', 
                          (contact_id,))
            conn.commit()
        
        phone = phone_formatted
    else:
        cursor.execute('SELECT phone FROM whatsapp_contacts WHERE id = ?', (contact_id,))
        contact = cursor.fetchone()
        if not contact:
            conn.close()
            return jsonify({'error': 'Contato não encontrado'}), 404
        phone = contact['phone']
    
    # Enviar via API
    result = client.send_text(phone, message)
    
    if result.success:
        # Salvar mensagem
        now = datetime.now()
        cursor.execute('''
            INSERT INTO whatsapp_messages 
            (wa_message_id, contact_id, direction, type, content, status, timestamp)
            VALUES (?, ?, 'outgoing', 'text', ?, 'sent', ?)
        ''', (result.message_id, contact_id, message, now))
        
        # Atualizar conversa
        cursor.execute('''
            UPDATE whatsapp_conversations 
            SET last_message = ?, last_message_type = 'text', last_message_time = ?
            WHERE contact_id = ?
        ''', (message[:100], now, contact_id))
        
        cursor.execute('''
            UPDATE whatsapp_contacts SET last_message_at = ? WHERE id = ?
        ''', (now, contact_id))
        
        # Atualizar status do lead para "em_contato" se ainda for "novo"
        cursor.execute('SELECT lead_id FROM whatsapp_contacts WHERE id = ?', (contact_id,))
        contact_data = cursor.fetchone()
        if contact_data and contact_data['lead_id']:
            cursor.execute('''
                UPDATE leads SET status = 'em_contato', updated_at = ? 
                WHERE id = ? AND status = 'novo'
            ''', (now, contact_data['lead_id']))
        else:
            # Tentar encontrar lead pelo telefone
            cursor.execute('SELECT phone FROM whatsapp_contacts WHERE id = ?', (contact_id,))
            phone_data = cursor.fetchone()
            if phone_data:
                # Buscar lead com esse telefone
                phone_clean = re.sub(r'\D', '', phone_data['phone'])
                cursor.execute('''
                    SELECT id FROM leads 
                    WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?
                ''', (f'%{phone_clean[-9:]}%',))
                lead_found = cursor.fetchone()
                if lead_found:
                    cursor.execute('''
                        UPDATE leads SET status = 'em_contato', updated_at = ? 
                        WHERE id = ? AND status = 'novo'
                    ''', (now, lead_found['id']))
                    # Vincular contato ao lead
                    cursor.execute('UPDATE whatsapp_contacts SET lead_id = ? WHERE id = ?', 
                                  (lead_found['id'], contact_id))
        
        conn.commit()
        message_id = cursor.lastrowid
        conn.close()
        
        return jsonify({
            'success': True,
            'message_id': message_id,
            'wa_message_id': result.message_id
        })
    else:
        conn.close()
        return jsonify({'error': result.error}), 400

@app.route('/api/whatsapp/send-media', methods=['POST'])
def send_media():
    """Envia uma mensagem com mídia (imagem, vídeo, documento, áudio)"""
    data = request.get_json()
    contact_id = data.get('contact_id')
    phone = data.get('phone')
    media_type = data.get('type')  # image, video, document, audio
    media_url = data.get('url')
    caption = data.get('caption', '')
    filename = data.get('filename', '')
    
    if not media_type or not media_url:
        return jsonify({'error': 'Tipo e URL da mídia obrigatórios'}), 400
    
    client = get_whatsapp_client()
    if not client:
        return jsonify({'error': 'WhatsApp não configurado'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Resolver contato
    if not contact_id:
        phone_formatted = re.sub(r'\D', '', phone)
        if not phone_formatted.startswith('55'):
            phone_formatted = '55' + phone_formatted
        
        cursor.execute('SELECT id FROM whatsapp_contacts WHERE phone = ?', (phone_formatted,))
        existing = cursor.fetchone()
        
        if existing:
            contact_id = existing['id']
        else:
            cursor.execute('INSERT INTO whatsapp_contacts (phone, name) VALUES (?, ?)', 
                          (phone_formatted, ''))
            contact_id = cursor.lastrowid
            cursor.execute('INSERT INTO whatsapp_conversations (contact_id) VALUES (?)', 
                          (contact_id,))
            conn.commit()
        
        phone = phone_formatted
    else:
        cursor.execute('SELECT phone FROM whatsapp_contacts WHERE id = ?', (contact_id,))
        contact = cursor.fetchone()
        phone = contact['phone']
    
    # Enviar conforme tipo
    if media_type == 'image':
        result = client.send_image(phone, image_url=media_url, caption=caption)
    elif media_type == 'video':
        result = client.send_video(phone, video_url=media_url, caption=caption)
    elif media_type == 'audio':
        result = client.send_audio(phone, audio_url=media_url)
    elif media_type == 'document':
        result = client.send_document(phone, document_url=media_url, filename=filename, caption=caption)
    else:
        conn.close()
        return jsonify({'error': 'Tipo de mídia inválido'}), 400
    
    if result.success:
        now = datetime.now()
        display_msg = caption if caption else f'[{media_type}]'
        
        cursor.execute('''
            INSERT INTO whatsapp_messages 
            (wa_message_id, contact_id, direction, type, content, media_url, caption, status, timestamp)
            VALUES (?, ?, 'outgoing', ?, ?, ?, ?, 'sent', ?)
        ''', (result.message_id, contact_id, media_type, display_msg, media_url, caption, now))
        
        cursor.execute('''
            UPDATE whatsapp_conversations 
            SET last_message = ?, last_message_type = ?, last_message_time = ?
            WHERE contact_id = ?
        ''', (display_msg[:100], media_type, now, contact_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'wa_message_id': result.message_id})
    else:
        conn.close()
        return jsonify({'error': result.error}), 400

@app.route('/api/whatsapp/send-template', methods=['POST'])
def send_template():
    """Envia um template aprovado"""
    data = request.get_json()
    contact_id = data.get('contact_id')
    phone = data.get('phone')
    template_name = data.get('template_name')
    language = data.get('language', 'pt_BR')
    components = data.get('components', [])
    
    if not template_name:
        return jsonify({'error': 'Nome do template obrigatório'}), 400
    
    client = get_whatsapp_client()
    if not client:
        return jsonify({'error': 'WhatsApp não configurado'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Resolver telefone
    if contact_id:
        cursor.execute('SELECT phone FROM whatsapp_contacts WHERE id = ?', (contact_id,))
        contact = cursor.fetchone()
        phone = contact['phone']
    else:
        phone = re.sub(r'\D', '', phone)
        if not phone.startswith('55'):
            phone = '55' + phone
    
    result = client.send_template(phone, template_name, language, components)
    
    conn.close()
    
    if result.success:
        return jsonify({'success': True, 'wa_message_id': result.message_id})
    else:
        return jsonify({'error': result.error}), 400

# =============================================================================
# API - WEBHOOK (receber mensagens)
# =============================================================================

@app.route('/webhook', methods=['GET'])
def verify_webhook():
    """Verificação do webhook pelo Facebook"""
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT verify_token FROM whatsapp_config WHERE id = 1')
    config = cursor.fetchone()
    conn.close()
    
    verify_token = config['verify_token'] if config else 'meu_token_verificacao_123'
    
    result = WhatsAppCloudAPI.verify_webhook(mode, token, challenge, verify_token)
    
    if result:
        return Response(result, status=200)
    else:
        return Response('Verification failed', status=403)

@app.route('/webhook', methods=['POST'])
def receive_webhook():
    """
    Recebe notificações do WhatsApp (mensagens, status, etc.)
    Documentação: https://developers.facebook.com/docs/whatsapp/webhooks
    
    Campos suportados:
    - messages: mensagens recebidas e status de mensagens enviadas
    - account_alerts: alterações no limite de mensagens, perfil, status da conta
    - message_template_status_update: alterações no status de templates
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'status': 'ok'})
    
    # Log do webhook recebido (para debug)
    print(f"[WEBHOOK] Recebido: {data.get('object', 'unknown')}")
    
    # Verificar se é do WhatsApp Business
    if data.get('object') != 'whatsapp_business_account':
        return jsonify({'status': 'ok'})
    
    events = WhatsAppCloudAPI.parse_webhook(data)
    
    conn = get_db()
    cursor = conn.cursor()
    
    for event in events:
        if event['type'] == 'message':
            # Mensagem recebida
            phone = event.get('from', '')
            msg_id = event.get('message_id')
            msg_type = event.get('message_type', 'text')
            content = event.get('content', '')
            contact_name = event.get('contact_name', '')
            timestamp = datetime.fromtimestamp(int(event.get('timestamp', 0)))
            
            # Para mídia, usar caption ou indicador do tipo
            if msg_type in ['image', 'video', 'audio', 'document']:
                content = event.get('caption', '') or f'[{msg_type.upper()}]'
            
            # Buscar ou criar contato
            cursor.execute('SELECT id, lead_id FROM whatsapp_contacts WHERE phone = ?', (phone,))
            contact = cursor.fetchone()
            
            if contact:
                contact_id = contact['id']
                lead_id = contact['lead_id']
                # Atualizar nome se veio
                if contact_name:
                    cursor.execute('UPDATE whatsapp_contacts SET name = ? WHERE id = ?', 
                                  (contact_name, contact_id))
            else:
                # Tentar vincular a um lead existente pelo telefone
                phone_clean = re.sub(r'\D', '', phone)
                cursor.execute('''
                    SELECT id FROM leads 
                    WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?
                ''', (f'%{phone_clean[-9:]}%',))
                lead_found = cursor.fetchone()
                lead_id = lead_found['id'] if lead_found else None
                
                cursor.execute('''
                    INSERT INTO whatsapp_contacts (phone, name, lead_id) VALUES (?, ?, ?)
                ''', (phone, contact_name, lead_id))
                contact_id = cursor.lastrowid
                cursor.execute('INSERT INTO whatsapp_conversations (contact_id) VALUES (?)', 
                              (contact_id,))
            
            # Verificar duplicada
            cursor.execute('SELECT id FROM whatsapp_messages WHERE wa_message_id = ?', (msg_id,))
            if not cursor.fetchone():
                # Salvar mensagem
                cursor.execute('''
                    INSERT INTO whatsapp_messages 
                    (wa_message_id, contact_id, direction, type, content, status, timestamp)
                    VALUES (?, ?, 'incoming', ?, ?, 'received', ?)
                ''', (msg_id, contact_id, msg_type, content, timestamp))
                
                # Atualizar conversa
                cursor.execute('''
                    UPDATE whatsapp_conversations 
                    SET last_message = ?, last_message_type = ?, last_message_time = ?
                    WHERE contact_id = ?
                ''', (content[:100] if content else f'[{msg_type}]', msg_type, timestamp, contact_id))
                
                # Incrementar não lidas
                cursor.execute('''
                    UPDATE whatsapp_contacts 
                    SET unread_count = unread_count + 1, last_message_at = ?
                    WHERE id = ?
                ''', (timestamp, contact_id))
                
                # Se tiver lead vinculado e estiver como "novo", atualizar para "em_contato"
                if lead_id:
                    cursor.execute('''
                        UPDATE leads SET status = 'em_contato', updated_at = ? 
                        WHERE id = ? AND status = 'novo'
                    ''', (timestamp, lead_id))
                
                print(f"[WEBHOOK] Mensagem recebida de {phone}: {content[:50]}...")
            
            # Marcar como lida na API
            client = get_whatsapp_client()
            if client and msg_id:
                try:
                    client.mark_as_read(msg_id)
                except Exception as e:
                    print(f"[WEBHOOK] Erro ao marcar como lida: {e}")
        
        elif event['type'] == 'status':
            # Atualização de status de mensagem enviada
            msg_id = event.get('message_id')
            status = event.get('status')  # sent, delivered, read, failed
            error_message = event.get('error_message', '')
            
            if msg_id:
                cursor.execute('''
                    UPDATE whatsapp_messages 
                    SET status = ?, error_message = ?
                    WHERE wa_message_id = ?
                ''', (status, error_message if status == 'failed' else None, msg_id))
                
                print(f"[WEBHOOK] Status atualizado: {msg_id} -> {status}")
    
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'ok'})

# =============================================================================
# API - IMPORTAÇÃO CSV
# =============================================================================

@app.route('/api/import-csv', methods=['POST'])
def import_csv():
    """Importa leads de arquivo CSV"""
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nenhum arquivo selecionado'}), 400
    
    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'Arquivo deve ser CSV'}), 400
    
    try:
        df = pd.read_csv(file, encoding='utf-8')
    except:
        try:
            file.seek(0)
            df = pd.read_csv(file, encoding='latin-1')
        except Exception as e:
            return jsonify({'error': f'Erro ao ler arquivo: {str(e)}'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    importados = 0
    duplicados = 0
    
    # Mapear colunas
    col_map = {
        'nome': ['nome', 'name', 'empresa', 'company', 'qBF1Pd'],
        'telefone': ['telefone', 'phone', 'tel', 'celular', 'whatsapp', 'UsdlK'],
        'cidade': ['cidade', 'city', 'municipio'],
        'endereco': ['endereco', 'address', 'endereço', 'W4Efsd 3'],
        'tipo_servico': ['tipo_servico', 'categoria', 'category', 'W4Efsd'],
    }
    
    def find_column(df, options):
        for opt in options:
            for col in df.columns:
                if opt.lower() in col.lower():
                    return col
        return None
    
    mapped = {k: find_column(df, v) for k, v in col_map.items()}
    
    for _, row in df.iterrows():
        telefone = str(row.get(mapped['telefone'], '')) if mapped['telefone'] else ''
        telefone = re.sub(r'\D', '', telefone)
        
        if not telefone or len(telefone) < 10:
            continue
        
        nome = str(row.get(mapped['nome'], '')) if mapped['nome'] else ''
        cidade = str(row.get(mapped['cidade'], '')) if mapped['cidade'] else ''
        endereco = str(row.get(mapped['endereco'], '')) if mapped['endereco'] else ''
        tipo = str(row.get(mapped['tipo_servico'], '')) if mapped['tipo_servico'] else ''
        
        try:
            cursor.execute('''
                INSERT INTO leads (nome, telefone, cidade, endereco, tipo_servico)
                VALUES (?, ?, ?, ?, ?)
            ''', (nome, telefone, cidade, endereco, tipo))
            importados += 1
        except sqlite3.IntegrityError:
            duplicados += 1
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'importados': importados,
        'duplicados': duplicados,
        'total': len(df)
    })

# =============================================================================
# API - LEADS PARA WHATSAPP
# =============================================================================

@app.route('/api/leads/<int:lead_id>/start-chat', methods=['POST'])
def start_chat_from_lead(lead_id):
    """Inicia uma conversa WhatsApp a partir de um lead"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM leads WHERE id = ?', (lead_id,))
    lead = cursor.fetchone()
    
    if not lead:
        conn.close()
        return jsonify({'error': 'Lead não encontrado'}), 404
    
    phone = re.sub(r'\D', '', lead['telefone'])
    if not phone.startswith('55'):
        phone = '55' + phone
    
    # Verificar se já existe contato
    cursor.execute('SELECT id FROM whatsapp_contacts WHERE phone = ?', (phone,))
    existing = cursor.fetchone()
    
    if existing:
        contact_id = existing['id']
    else:
        cursor.execute('''
            INSERT INTO whatsapp_contacts (phone, name, lead_id)
            VALUES (?, ?, ?)
        ''', (phone, lead['nome'], lead_id))
        contact_id = cursor.lastrowid
        
        cursor.execute('INSERT INTO whatsapp_conversations (contact_id) VALUES (?)', (contact_id,))
    
    # Atualizar status do lead
    cursor.execute('UPDATE leads SET status = "em_contato" WHERE id = ?', (lead_id,))
    cursor.execute('INSERT INTO historico (lead_id, acao, descricao) VALUES (?, ?, ?)',
                  (lead_id, 'whatsapp', 'Conversa iniciada no WhatsApp'))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'contact_id': contact_id})

# =============================================================================
# API - ENVIO EM MASSA
# =============================================================================

@app.route('/api/whatsapp/leads-for-bulk')
def get_leads_for_bulk():
    """Lista leads disponíveis para envio em massa"""
    conn = get_db()
    cursor = conn.cursor()
    
    search = request.args.get('search', '')
    cidade = request.args.get('cidade', '')
    status = request.args.get('status', '')
    limit = request.args.get('limit', 100, type=int)
    
    query = 'SELECT id, nome, telefone, cidade, status, tipo_servico FROM leads WHERE telefone IS NOT NULL AND telefone != ""'
    params = []
    
    if search:
        query += ' AND (nome LIKE ? OR telefone LIKE ?)'
        params.extend([f'%{search}%', f'%{search}%'])
    
    if cidade:
        query += ' AND cidade = ?'
        params.append(cidade)
    
    if status:
        query += ' AND status = ?'
        params.append(status)
    
    query += ' ORDER BY nome LIMIT ?'
    params.append(limit)
    
    cursor.execute(query, params)
    leads = [dict(row) for row in cursor.fetchall()]
    
    # Contar total
    count_query = 'SELECT COUNT(*) FROM leads WHERE telefone IS NOT NULL AND telefone != ""'
    cursor.execute(count_query)
    total = cursor.fetchone()[0]
    
    conn.close()
    
    return jsonify({
        'leads': leads,
        'total': total,
        'showing': len(leads)
    })

@app.route('/api/whatsapp/send-bulk', methods=['POST'])
def send_bulk_messages():
    """Envia mensagens em massa para múltiplos leads"""
    global envio_em_andamento
    
    data = request.get_json()
    lead_ids = data.get('lead_ids', [])
    message = data.get('message', '')
    template_name = data.get('template_name')  # Para usar template da Meta
    delay_seconds = data.get('delay', 3)  # Delay entre mensagens
    
    if not lead_ids:
        return jsonify({'error': 'Nenhum lead selecionado'}), 400
    
    if not message and not template_name:
        return jsonify({'error': 'Mensagem ou template obrigatório'}), 400
    
    client = get_whatsapp_client()
    if not client:
        return jsonify({'error': 'WhatsApp não configurado'}), 400
    
    # Iniciar envio em background
    envio_em_andamento = {
        'ativo': True,
        'total': len(lead_ids),
        'enviados': 0,
        'sucesso': 0,
        'falha': 0,
        'cancelado': False,
        'resultados': []
    }
    
    def enviar_em_massa():
        global envio_em_andamento
        conn = get_db()
        cursor = conn.cursor()
        
        for lead_id in lead_ids:
            if envio_em_andamento['cancelado']:
                break
            
            # Buscar lead
            cursor.execute('SELECT * FROM leads WHERE id = ?', (lead_id,))
            lead = cursor.fetchone()
            
            if not lead or not lead['telefone']:
                envio_em_andamento['falha'] += 1
                envio_em_andamento['resultados'].append({
                    'lead_id': lead_id,
                    'success': False,
                    'error': 'Lead não encontrado ou sem telefone'
                })
                envio_em_andamento['enviados'] += 1
                continue
            
            # Formatar telefone
            phone = re.sub(r'\D', '', lead['telefone'])
            if not phone.startswith('55'):
                phone = '55' + phone
            
            # Personalizar mensagem
            msg_personalizada = message
            if '{nome}' in msg_personalizada:
                msg_personalizada = msg_personalizada.replace('{nome}', lead['nome'] or '')
            if '{cidade}' in msg_personalizada:
                msg_personalizada = msg_personalizada.replace('{cidade}', lead['cidade'] or '')
            if '{tipo}' in msg_personalizada:
                msg_personalizada = msg_personalizada.replace('{tipo}', lead['tipo_servico'] or '')
            
            try:
                # Enviar mensagem
                if template_name:
                    result = client.send_template(phone, template_name)
                else:
                    result = client.send_text(phone, msg_personalizada)
                
                if result.success:
                    envio_em_andamento['sucesso'] += 1
                    
                    # Criar/atualizar contato
                    cursor.execute('SELECT id FROM whatsapp_contacts WHERE phone = ?', (phone,))
                    existing = cursor.fetchone()
                    
                    if existing:
                        contact_id = existing['id']
                    else:
                        cursor.execute('''
                            INSERT INTO whatsapp_contacts (phone, name, lead_id)
                            VALUES (?, ?, ?)
                        ''', (phone, lead['nome'], lead_id))
                        contact_id = cursor.lastrowid
                        cursor.execute('INSERT INTO whatsapp_conversations (contact_id) VALUES (?)', (contact_id,))
                    
                    # Salvar mensagem
                    now = datetime.now()
                    cursor.execute('''
                        INSERT INTO whatsapp_messages 
                        (wa_message_id, contact_id, direction, type, content, status, timestamp)
                        VALUES (?, ?, 'outgoing', 'text', ?, 'sent', ?)
                    ''', (result.message_id, contact_id, msg_personalizada, now))
                    
                    # Atualizar conversa
                    cursor.execute('''
                        UPDATE whatsapp_conversations 
                        SET last_message = ?, last_message_type = 'text', last_message_time = ?
                        WHERE contact_id = ?
                    ''', (msg_personalizada[:100], now, contact_id))
                    
                    # Atualizar status do lead
                    cursor.execute('UPDATE leads SET status = "em_contato" WHERE id = ?', (lead_id,))
                    
                    conn.commit()
                    
                    envio_em_andamento['resultados'].append({
                        'lead_id': lead_id,
                        'nome': lead['nome'],
                        'success': True
                    })
                else:
                    envio_em_andamento['falha'] += 1
                    envio_em_andamento['resultados'].append({
                        'lead_id': lead_id,
                        'nome': lead['nome'],
                        'success': False,
                        'error': result.error
                    })
            except Exception as e:
                envio_em_andamento['falha'] += 1
                envio_em_andamento['resultados'].append({
                    'lead_id': lead_id,
                    'success': False,
                    'error': str(e)
                })
            
            envio_em_andamento['enviados'] += 1
            
            # Delay entre mensagens
            if not envio_em_andamento['cancelado']:
                time.sleep(delay_seconds)
        
        conn.close()
        envio_em_andamento['ativo'] = False
    
    # Iniciar thread de envio
    thread = threading.Thread(target=enviar_em_massa)
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': f'Envio iniciado para {len(lead_ids)} leads'
    })

@app.route('/api/whatsapp/send-bulk/status')
def get_bulk_status():
    """Retorna o status do envio em massa"""
    return jsonify(envio_em_andamento)

@app.route('/api/whatsapp/send-bulk/cancel', methods=['POST'])
def cancel_bulk_send():
    """Cancela o envio em massa"""
    global envio_em_andamento
    envio_em_andamento['cancelado'] = True
    return jsonify({'success': True})

@app.route('/api/whatsapp/import-leads-as-contacts', methods=['POST'])
def import_leads_as_contacts():
    """Importa leads selecionados como contatos do WhatsApp"""
    data = request.get_json()
    lead_ids = data.get('lead_ids', [])
    
    if not lead_ids:
        return jsonify({'error': 'Nenhum lead selecionado'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    imported = 0
    duplicates = 0
    
    for lead_id in lead_ids:
        cursor.execute('SELECT * FROM leads WHERE id = ?', (lead_id,))
        lead = cursor.fetchone()
        
        if not lead or not lead['telefone']:
            continue
        
        phone = re.sub(r'\D', '', lead['telefone'])
        if not phone.startswith('55'):
            phone = '55' + phone
        
        # Verificar se já existe
        cursor.execute('SELECT id FROM whatsapp_contacts WHERE phone = ?', (phone,))
        existing = cursor.fetchone()
        
        if existing:
            duplicates += 1
        else:
            cursor.execute('''
                INSERT INTO whatsapp_contacts (phone, name, lead_id)
                VALUES (?, ?, ?)
            ''', (phone, lead['nome'], lead_id))
            contact_id = cursor.lastrowid
            cursor.execute('INSERT INTO whatsapp_conversations (contact_id) VALUES (?)', (contact_id,))
            imported += 1
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'imported': imported,
        'duplicates': duplicates
    })

# =============================================================================
# API - CRM: UNIDADES
# =============================================================================

@app.route('/api/unidades')
def get_unidades():
    """Lista todas as unidades"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM unidades WHERE ativo = 1 ORDER BY ordem, nome')
    unidades = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(unidades)

@app.route('/api/unidades', methods=['POST'])
def create_unidade():
    """Cria uma nova unidade"""
    data = request.get_json()
    nome = data.get('nome')
    descricao = data.get('descricao', '')
    cor = data.get('cor', '#4f46e5')
    
    if not nome:
        return jsonify({'error': 'Nome obrigatório'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO unidades (nome, descricao, cor) VALUES (?, ?, ?)
    ''', (nome, descricao, cor))
    unidade_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'id': unidade_id})

@app.route('/api/unidades/<int:unidade_id>', methods=['PUT'])
def update_unidade(unidade_id):
    """Atualiza uma unidade"""
    data = request.get_json()
    
    conn = get_db()
    cursor = conn.cursor()
    
    updates = []
    params = []
    for field in ['nome', 'descricao', 'cor', 'ordem', 'ativo']:
        if field in data:
            updates.append(f'{field} = ?')
            params.append(data[field])
    
    if updates:
        params.append(unidade_id)
        cursor.execute(f'UPDATE unidades SET {", ".join(updates)} WHERE id = ?', params)
        conn.commit()
    
    conn.close()
    return jsonify({'success': True})

@app.route('/api/unidades/<int:unidade_id>/leads')
def get_leads_by_unidade(unidade_id):
    """Lista leads de uma unidade"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT l.* FROM leads l
        INNER JOIN lead_unidades lu ON l.id = lu.lead_id
        WHERE lu.unidade_id = ?
        ORDER BY l.nome
    ''', (unidade_id,))
    leads = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(leads)

@app.route('/api/leads/<int:lead_id>/unidades', methods=['POST'])
def add_lead_to_unidade(lead_id):
    """Adiciona lead a uma unidade"""
    data = request.get_json()
    unidade_id = data.get('unidade_id')
    
    if not unidade_id:
        return jsonify({'error': 'unidade_id obrigatório'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO lead_unidades (lead_id, unidade_id) VALUES (?, ?)
        ''', (lead_id, unidade_id))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Lead já está nesta unidade'}), 400
    
    conn.close()
    return jsonify({'success': True})

@app.route('/api/leads/<int:lead_id>/unidades/<int:unidade_id>', methods=['DELETE'])
def remove_lead_from_unidade(lead_id, unidade_id):
    """Remove lead de uma unidade"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM lead_unidades WHERE lead_id = ? AND unidade_id = ?', 
                   (lead_id, unidade_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# =============================================================================
# API - CRM: PIPELINES E ESTÁGIOS
# =============================================================================

@app.route('/api/crm/pipelines')
def get_pipelines():
    """Lista todos os pipelines"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT p.*, u.nome as unidade_nome
        FROM crm_pipelines p
        LEFT JOIN unidades u ON p.unidade_id = u.id
        WHERE p.ativo = 1
        ORDER BY p.nome
    ''')
    pipelines = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(pipelines)

@app.route('/api/crm/pipelines', methods=['POST'])
def create_pipeline():
    """Cria um novo pipeline"""
    data = request.get_json()
    nome = data.get('nome')
    descricao = data.get('descricao', '')
    unidade_id = data.get('unidade_id')
    
    if not nome:
        return jsonify({'error': 'Nome obrigatório'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO crm_pipelines (nome, descricao, unidade_id) VALUES (?, ?, ?)
    ''', (nome, descricao, unidade_id))
    pipeline_id = cursor.lastrowid
    
    # Criar estágios padrão
    cursor.executemany('''
        INSERT INTO crm_estagios (pipeline_id, nome, cor, ordem) VALUES (?, ?, ?, ?)
    ''', [
        (pipeline_id, 'Novo', '#3b82f6', 1),
        (pipeline_id, 'Em Andamento', '#f59e0b', 2),
        (pipeline_id, 'Concluído', '#10b981', 3)
    ])
    
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'id': pipeline_id})

@app.route('/api/crm/pipelines/<int:pipeline_id>/estagios')
def get_estagios(pipeline_id):
    """Lista estágios de um pipeline"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM crm_estagios WHERE pipeline_id = ? ORDER BY ordem
    ''', (pipeline_id,))
    estagios = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(estagios)

@app.route('/api/crm/estagios', methods=['POST'])
def create_estagio():
    """Cria um novo estágio"""
    data = request.get_json()
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO crm_estagios (pipeline_id, nome, cor, ordem) VALUES (?, ?, ?, ?)
    ''', (data.get('pipeline_id'), data.get('nome'), data.get('cor', '#6b7280'), data.get('ordem', 0)))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# =============================================================================
# API - CRM: NEGÓCIOS (KANBAN CARDS)
# =============================================================================

@app.route('/api/crm/negocios')
def get_negocios():
    """Lista negócios com filtros"""
    conn = get_db()
    cursor = conn.cursor()
    
    pipeline_id = request.args.get('pipeline_id', 1, type=int)
    unidade_id = request.args.get('unidade_id', type=int)
    
    query = '''
        SELECT n.*, l.nome as lead_nome, l.telefone as lead_telefone,
               e.nome as estagio_nome, e.cor as estagio_cor,
               u.nome as unidade_nome
        FROM crm_negocios n
        LEFT JOIN leads l ON n.lead_id = l.id
        LEFT JOIN crm_estagios e ON n.estagio_id = e.id
        LEFT JOIN unidades u ON n.unidade_id = u.id
        WHERE n.pipeline_id = ?
    '''
    params = [pipeline_id]
    
    if unidade_id:
        query += ' AND n.unidade_id = ?'
        params.append(unidade_id)
    
    query += ' ORDER BY n.ordem, n.created_at DESC'
    
    cursor.execute(query, params)
    negocios = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(negocios)

@app.route('/api/crm/negocios', methods=['POST'])
def create_negocio():
    """Cria um novo negócio"""
    data = request.get_json()
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Se tiver lead_id, pegar informações do lead
    lead_id = data.get('lead_id')
    titulo = data.get('titulo')
    
    if lead_id and not titulo:
        cursor.execute('SELECT nome FROM leads WHERE id = ?', (lead_id,))
        lead = cursor.fetchone()
        if lead:
            titulo = lead['nome']
    
    cursor.execute('''
        INSERT INTO crm_negocios 
        (lead_id, contact_id, pipeline_id, estagio_id, unidade_id, titulo, valor, 
         probabilidade, data_previsao, responsavel, descricao, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        lead_id,
        data.get('contact_id'),
        data.get('pipeline_id', 1),
        data.get('estagio_id', 1),
        data.get('unidade_id'),
        titulo or 'Novo Negócio',
        data.get('valor', 0),
        data.get('probabilidade', 50),
        data.get('data_previsao'),
        data.get('responsavel'),
        data.get('descricao'),
        data.get('tags')
    ))
    
    negocio_id = cursor.lastrowid
    
    # Atualizar status do lead para em_contato
    if lead_id:
        cursor.execute('UPDATE leads SET status = "em_contato" WHERE id = ?', (lead_id,))
    
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'id': negocio_id})

@app.route('/api/crm/negocios/<int:negocio_id>', methods=['PUT'])
def update_negocio(negocio_id):
    """Atualiza um negócio"""
    data = request.get_json()
    
    conn = get_db()
    cursor = conn.cursor()
    
    updates = []
    params = []
    for field in ['titulo', 'valor', 'probabilidade', 'data_previsao', 'responsavel', 
                  'descricao', 'tags', 'estagio_id', 'unidade_id', 'ordem']:
        if field in data:
            updates.append(f'{field} = ?')
            params.append(data[field])
    
    if updates:
        updates.append('updated_at = ?')
        params.append(datetime.now())
        params.append(negocio_id)
        cursor.execute(f'UPDATE crm_negocios SET {", ".join(updates)} WHERE id = ?', params)
        conn.commit()
    
    conn.close()
    return jsonify({'success': True})

@app.route('/api/crm/negocios/<int:negocio_id>/mover', methods=['POST'])
def mover_negocio(negocio_id):
    """Move negócio para outro estágio (drag & drop)"""
    data = request.get_json()
    estagio_id = data.get('estagio_id')
    ordem = data.get('ordem', 0)
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE crm_negocios SET estagio_id = ?, ordem = ?, updated_at = ? WHERE id = ?
    ''', (estagio_id, ordem, datetime.now(), negocio_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/crm/lead-to-negocio', methods=['POST'])
def convert_lead_to_negocio():
    """Converte um lead em negócio no CRM"""
    data = request.get_json()
    lead_id = data.get('lead_id')
    pipeline_id = data.get('pipeline_id', 1)
    unidade_id = data.get('unidade_id')
    
    if not lead_id:
        return jsonify({'error': 'lead_id obrigatório'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Buscar lead
    cursor.execute('SELECT * FROM leads WHERE id = ?', (lead_id,))
    lead = cursor.fetchone()
    
    if not lead:
        conn.close()
        return jsonify({'error': 'Lead não encontrado'}), 404
    
    # Buscar primeiro estágio do pipeline
    cursor.execute('SELECT id FROM crm_estagios WHERE pipeline_id = ? ORDER BY ordem LIMIT 1', (pipeline_id,))
    estagio = cursor.fetchone()
    estagio_id = estagio['id'] if estagio else 1
    
    # Criar negócio
    cursor.execute('''
        INSERT INTO crm_negocios 
        (lead_id, pipeline_id, estagio_id, unidade_id, titulo, descricao)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (
        lead_id, 
        pipeline_id, 
        estagio_id, 
        unidade_id,
        lead['nome'] or 'Novo Negócio',
        f"Lead convertido de: {lead['cidade']} - {lead['tipo_servico']}"
    ))
    
    negocio_id = cursor.lastrowid
    
    # Atualizar status do lead
    cursor.execute('UPDATE leads SET status = "em_contato" WHERE id = ?', (lead_id,))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'negocio_id': negocio_id})

# =============================================================================
# API - BOT IA
# =============================================================================

# Importar cliente Ollama
try:
    from bot.ollama_client import OllamaClient, SmartBot, MODELOS_RECOMENDADOS, get_install_instructions
    ollama_available = True
except ImportError:
    ollama_available = False
    MODELOS_RECOMENDADOS = {}

# Importar cliente Cloud AI
try:
    from bot.cloud_ai_client import CloudAIClient, GeminiClient, OpenAIClient, ClaudeClient, AIResponse
    cloud_ai_available = True
except ImportError:
    cloud_ai_available = False

# Cache do bot
smart_bot = None
cloud_bot = None

def get_smart_bot():
    """Obtém ou cria instância do bot (Ollama ou Cloud)"""
    global smart_bot, cloud_bot
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM bot_config WHERE id = 1')
    config = cursor.fetchone()
    
    cursor.execute('SELECT * FROM bot_personalidade WHERE ativo = 1 LIMIT 1')
    personalidade = cursor.fetchone()
    conn.close()
    
    if not config:
        return None
    
    # Verificar se deve usar Cloud AI
    usar_cloud = config['usar_cloud'] if 'usar_cloud' in config.keys() else 0
    
    if usar_cloud and cloud_ai_available:
        # Usar API de nuvem (Gemini, OpenAI, Claude)
        provider = config['cloud_provider'] if 'cloud_provider' in config.keys() else 'gemini'
        api_key = config['cloud_api_key'] if 'cloud_api_key' in config.keys() else ''
        cloud_model = config['cloud_model'] if 'cloud_model' in config.keys() else None
        
        if api_key:
            cloud_bot = CloudAIClient(provider=provider, api_key=api_key)
            cloud_bot.set_config(
                temperature=config['temperatura'] or 0.7,
                max_tokens=config['max_tokens'] or 500,
                model=cloud_model
            )
            
            if personalidade:
                cloud_bot.set_personality(personalidade['system_prompt'])
            
            return cloud_bot
    
    # Usar Ollama local
    if not ollama_available:
        return None
    
    ollama = OllamaClient(config['ollama_url'] or 'http://localhost:11434')
    smart_bot = SmartBot(ollama)
    smart_bot.set_model(
        config['modelo'] or 'mistral',
        config['temperatura'] or 0.7,
        config['max_tokens'] or 500
    )
    
    if personalidade:
        smart_bot.set_personality(personalidade['system_prompt'])
    
    return smart_bot

@app.route('/api/bot/status')
def get_bot_status():
    """Verifica status do bot (Ollama ou Cloud)"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM bot_config WHERE id = 1')
    config = cursor.fetchone()
    conn.close()
    
    config_dict = dict(config) if config else {}
    usar_cloud = config_dict.get('usar_cloud', 0)
    
    # Se usando Cloud AI
    if usar_cloud and cloud_ai_available:
        provider = config_dict.get('cloud_provider', 'gemini')
        api_key = config_dict.get('cloud_api_key', '')
        
        cloud_online = False
        if api_key:
            try:
                client = CloudAIClient(provider=provider, api_key=api_key)
                cloud_online = client.is_available()
            except:
                pass
        
        return jsonify({
            'available': True,
            'mode': 'cloud',
            'cloud_provider': provider,
            'cloud_online': cloud_online,
            'cloud_configured': bool(api_key),
            'ollama_running': False,
            'bot_ativo': config_dict.get('ativo', False),
            'modelo_configurado': config_dict.get('cloud_model') or 'gemini-1.5-flash',
            'resposta_automatica': config_dict.get('resposta_automatica', False),
            'providers': CloudAIClient.get_provider_info() if cloud_ai_available else {}
        })
    
    # Ollama local
    if not ollama_available:
        return jsonify({
            'available': cloud_ai_available,
            'mode': 'none',
            'error': 'Nenhum provedor de IA configurado',
            'cloud_available': cloud_ai_available,
            'providers': CloudAIClient.get_provider_info() if cloud_ai_available else {}
        })
    
    ollama_url = config_dict.get('ollama_url', 'http://localhost:11434')
    ollama = OllamaClient(ollama_url)
    
    is_running = ollama.is_available()
    models = ollama.list_models() if is_running else []
    
    return jsonify({
        'available': True,
        'mode': 'ollama',
        'ollama_running': is_running,
        'models_installed': [m.get('name') for m in models],
        'bot_ativo': config_dict.get('ativo', False),
        'modelo_configurado': config_dict.get('modelo', 'mistral'),
        'resposta_automatica': config_dict.get('resposta_automatica', False),
        'cloud_available': cloud_ai_available,
        'providers': CloudAIClient.get_provider_info() if cloud_ai_available else {},
        'install_instructions': get_install_instructions() if not is_running else None
    })

@app.route('/api/bot/config', methods=['GET'])
def get_bot_config():
    """Obtém configuração do bot"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM bot_config WHERE id = 1')
    config = cursor.fetchone()
    conn.close()
    return jsonify(dict(config) if config else {})

@app.route('/api/bot/config', methods=['POST', 'PUT'])
def update_bot_config():
    """Atualiza configuração do bot"""
    data = request.get_json()
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Campos do Ollama + Cloud AI
    fields = ['ativo', 'modelo', 'ollama_url', 'temperatura', 'max_tokens',
              'resposta_automatica', 'horario_inicio', 'horario_fim', 'dias_semana',
              'usar_cloud', 'cloud_provider', 'cloud_api_key', 'cloud_model']
    
    updates = []
    params = []
    for field in fields:
        if field in data:
            updates.append(f'{field} = ?')
            params.append(data[field])
    
    if updates:
        updates.append('updated_at = ?')
        params.append(datetime.now().isoformat())
        cursor.execute(f'UPDATE bot_config SET {", ".join(updates)} WHERE id = 1', params)
        conn.commit()
    
    conn.close()
    
    # Resetar bot para pegar novas configurações
    global smart_bot
    smart_bot = None
    
    return jsonify({'success': True})

@app.route('/api/bot/modelos')
def get_modelos_recomendados():
    """Lista modelos recomendados"""
    return jsonify(MODELOS_RECOMENDADOS)

@app.route('/api/bot/personalidades')
def get_personalidades():
    """Lista personalidades do bot"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT p.*, u.nome as unidade_nome
        FROM bot_personalidade p
        LEFT JOIN unidades u ON p.unidade_id = u.id
        ORDER BY p.ativo DESC, p.nome
    ''')
    personalidades = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(personalidades)

@app.route('/api/bot/personalidades', methods=['POST'])
def create_personalidade():
    """Cria uma nova personalidade"""
    data = request.get_json()
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO bot_personalidade (nome, descricao, system_prompt, exemplos_conversa, unidade_id)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        data.get('nome'),
        data.get('descricao'),
        data.get('system_prompt'),
        data.get('exemplos_conversa'),
        data.get('unidade_id')
    ))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/bot/personalidades/<int:id>', methods=['PUT'])
def update_personalidade(id):
    """Atualiza uma personalidade"""
    data = request.get_json()
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Se ativando esta personalidade, desativar outras
    if data.get('ativo'):
        cursor.execute('UPDATE bot_personalidade SET ativo = 0')
    
    updates = []
    params = []
    for field in ['nome', 'descricao', 'system_prompt', 'exemplos_conversa', 'ativo', 'unidade_id']:
        if field in data:
            updates.append(f'{field} = ?')
            params.append(data[field])
    
    if updates:
        params.append(id)
        cursor.execute(f'UPDATE bot_personalidade SET {", ".join(updates)} WHERE id = ?', params)
        conn.commit()
    
    conn.close()
    
    # Resetar bot
    global smart_bot
    smart_bot = None
    
    return jsonify({'success': True})

@app.route('/api/bot/respostas-rapidas')
def get_respostas_rapidas():
    """Lista respostas rápidas"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM bot_respostas_rapidas ORDER BY prioridade DESC, gatilho')
    respostas = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(respostas)

@app.route('/api/bot/respostas-rapidas', methods=['POST'])
def create_resposta_rapida():
    """Cria resposta rápida"""
    data = request.get_json()
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO bot_respostas_rapidas (gatilho, resposta, tipo, prioridade)
        VALUES (?, ?, ?, ?)
    ''', (
        data.get('gatilho'),
        data.get('resposta'),
        data.get('tipo', 'contem'),
        data.get('prioridade', 0)
    ))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/bot/testar', methods=['POST'])
def testar_bot():
    """Testa o bot com uma mensagem"""
    data = request.get_json()
    mensagem = data.get('mensagem')
    
    if not mensagem:
        return jsonify({'error': 'Mensagem obrigatória'}), 400
    
    bot = get_smart_bot()
    if not bot:
        return jsonify({'error': 'Bot não configurado ou Ollama não está rodando'}), 400
    
    # Verificar respostas rápidas primeiro
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM bot_respostas_rapidas WHERE ativo = 1 ORDER BY prioridade DESC')
    respostas_rapidas = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    resposta_rapida = bot.check_quick_response(mensagem, respostas_rapidas)
    if resposta_rapida:
        return jsonify({
            'success': True,
            'resposta': resposta_rapida,
            'tipo': 'resposta_rapida',
            'tempo': 0
        })
    
    # Gerar resposta com IA
    response = bot.get_response(mensagem)
    
    if response.success:
        return jsonify({
            'success': True,
            'resposta': response.message,
            'tipo': 'ia',
            'modelo': response.model,
            'tokens': response.tokens_used,
            'tempo': response.response_time
        })
    else:
        return jsonify({
            'success': False,
            'error': response.error
        }), 400

@app.route('/api/bot/processar-mensagem', methods=['POST'])
def processar_mensagem_bot():
    """
    Processa uma mensagem recebida e gera resposta automática.
    Chamado pelo webhook quando resposta_automatica está ativa.
    """
    data = request.get_json()
    contact_id = data.get('contact_id')
    mensagem = data.get('mensagem')
    
    if not contact_id or not mensagem:
        return jsonify({'error': 'contact_id e mensagem obrigatórios'}), 400
    
    # Verificar se bot está ativo
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM bot_config WHERE id = 1')
    config = cursor.fetchone()
    
    if not config or not config['ativo'] or not config['resposta_automatica']:
        conn.close()
        return jsonify({'error': 'Bot não está ativo'}), 400
    
    # Verificar horário de funcionamento
    agora = datetime.now()
    hora_atual = agora.strftime('%H:%M')
    dia_semana = str(agora.weekday())
    
    if config['dias_semana'] and dia_semana not in config['dias_semana'].split(','):
        conn.close()
        return jsonify({'error': 'Fora do horário de atendimento (dia)'}), 400
    
    if config['horario_inicio'] and config['horario_fim']:
        if not (config['horario_inicio'] <= hora_atual <= config['horario_fim']):
            conn.close()
            return jsonify({'error': 'Fora do horário de atendimento (hora)'}), 400
    
    # Buscar contato e histórico
    cursor.execute('SELECT * FROM whatsapp_contacts WHERE id = ?', (contact_id,))
    contact = cursor.fetchone()
    
    cursor.execute('''
        SELECT role, content FROM bot_historico 
        WHERE contact_id = ? 
        ORDER BY created_at DESC LIMIT 10
    ''', (contact_id,))
    historico = [dict(row) for row in cursor.fetchall()]
    historico.reverse()  # Ordem cronológica
    
    # Verificar respostas rápidas
    cursor.execute('SELECT * FROM bot_respostas_rapidas WHERE ativo = 1 ORDER BY prioridade DESC')
    respostas_rapidas = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    bot = get_smart_bot()
    if not bot:
        return jsonify({'error': 'Bot não disponível'}), 400
    
    # Verificar resposta rápida
    resposta_rapida = bot.check_quick_response(mensagem, respostas_rapidas)
    if resposta_rapida:
        resposta = resposta_rapida
        tipo = 'resposta_rapida'
    else:
        # Gerar com IA
        response = bot.get_response(
            mensagem, 
            historico, 
            contact['name'] if contact else None
        )
        
        if not response.success:
            return jsonify({'error': response.error}), 400
        
        resposta = response.message
        tipo = 'ia'
    
    # Salvar no histórico
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO bot_historico (contact_id, role, content) VALUES (?, 'user', ?)
    ''', (contact_id, mensagem))
    cursor.execute('''
        INSERT INTO bot_historico (contact_id, role, content) VALUES (?, 'assistant', ?)
    ''', (contact_id, resposta))
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'resposta': resposta,
        'tipo': tipo
    })

# =============================================================================
# PÁGINAS CRM
# =============================================================================

@app.route('/crm')
def crm_page():
    """Página do CRM (Kanban)"""
    return render_template('crm.html')

@app.route('/bot')
def bot_page():
    """Página de configuração do Bot"""
    return render_template('bot.html')

# =============================================================================
# API UNIFICADA - LEADS COM MENSAGENS INTEGRADAS
# =============================================================================

@app.route('/api/leads', methods=['POST'])
def create_lead():
    """Cria um novo lead"""
    data = request.get_json()
    telefone = data.get('telefone', '')
    nome = data.get('nome', '')
    origem = data.get('origem', 'Manual')
    
    if not telefone:
        return jsonify({'error': 'Telefone obrigatório'}), 400
    
    # Normalizar telefone
    telefone = re.sub(r'\D', '', telefone)
    if not telefone.startswith('55'):
        telefone = '55' + telefone
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # Inserir lead
        cursor.execute('''
            INSERT INTO leads (nome, telefone, status, origem)
            VALUES (?, ?, 'novo', ?)
        ''', (nome, telefone, origem))
        lead_id = cursor.lastrowid
        
        # Criar contato WhatsApp vinculado
        cursor.execute('''
            INSERT OR IGNORE INTO whatsapp_contacts (phone, name, lead_id)
            VALUES (?, ?, ?)
        ''', (telefone, nome, lead_id))
        
        contact_id = cursor.lastrowid
        if contact_id == 0:
            cursor.execute('SELECT id FROM whatsapp_contacts WHERE phone = ?', (telefone,))
            contact_id = cursor.fetchone()['id']
        
        # Criar conversa
        cursor.execute('''
            INSERT OR IGNORE INTO whatsapp_conversations (contact_id)
            VALUES (?)
        ''', (contact_id,))
        
        conn.commit()
        
        # Retornar lead criado
        cursor.execute('SELECT * FROM leads WHERE id = ?', (lead_id,))
        lead = dict(cursor.fetchone())
        lead['contact_id'] = contact_id
        
        conn.close()
        return jsonify(lead)
        
    except sqlite3.IntegrityError:
        # Lead já existe
        cursor.execute('SELECT * FROM leads WHERE telefone = ?', (telefone,))
        lead = cursor.fetchone()
        conn.close()
        if lead:
            return jsonify(dict(lead))
        return jsonify({'error': 'Erro ao criar lead'}), 400

@app.route('/api/leads/<int:lead_id>', methods=['PUT'])
def update_lead(lead_id):
    """Atualiza um lead"""
    data = request.get_json()
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Campos atualizáveis
    updates = []
    params = []
    
    if 'nome' in data:
        updates.append('nome = ?')
        params.append(data['nome'])
    if 'status' in data:
        updates.append('status = ?')
        params.append(data['status'])
    if 'estagio_funil' in data:
        updates.append('estagio_funil = ?')
        params.append(data['estagio_funil'])
    if 'observacoes' in data:
        updates.append('observacoes = ?')
        params.append(data['observacoes'])
    if 'bot_ativo' in data:
        updates.append('bot_ativo = ?')
        params.append(1 if data['bot_ativo'] else 0)
    if 'email' in data:
        updates.append('email = ?')
        params.append(data['email'])
    
    if updates:
        updates.append('updated_at = ?')
        params.append(datetime.now())
        params.append(lead_id)
        
        cursor.execute(f'''
            UPDATE leads SET {', '.join(updates)} WHERE id = ?
        ''', params)
        
        conn.commit()
    
    conn.close()
    return jsonify({'success': True})

@app.route('/api/leads/<int:lead_id>', methods=['DELETE'])
def delete_lead(lead_id):
    """Exclui um lead"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Buscar contato associado
    cursor.execute('SELECT id FROM whatsapp_contacts WHERE lead_id = ?', (lead_id,))
    contact = cursor.fetchone()
    
    if contact:
        # Excluir mensagens
        cursor.execute('DELETE FROM whatsapp_messages WHERE contact_id = ?', (contact['id'],))
        # Excluir conversas
        cursor.execute('DELETE FROM whatsapp_conversations WHERE contact_id = ?', (contact['id'],))
        # Excluir contato
        cursor.execute('DELETE FROM whatsapp_contacts WHERE id = ?', (contact['id'],))
    
    # Excluir anotações e histórico
    cursor.execute('DELETE FROM anotacoes WHERE lead_id = ?', (lead_id,))
    cursor.execute('DELETE FROM historico WHERE lead_id = ?', (lead_id,))
    
    # Excluir lead
    cursor.execute('DELETE FROM leads WHERE id = ?', (lead_id,))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/leads/<int:lead_id>/mensagens')
def get_lead_mensagens(lead_id):
    """Obtém mensagens de um lead"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Buscar lead e contato associado
    cursor.execute('''
        SELECT wc.id as contact_id
        FROM leads l
        LEFT JOIN whatsapp_contacts wc ON wc.lead_id = l.id OR wc.phone = l.telefone
        WHERE l.id = ?
    ''', (lead_id,))
    
    result = cursor.fetchone()
    
    if not result or not result['contact_id']:
        conn.close()
        return jsonify([])
    
    contact_id = result['contact_id']
    
    # Buscar mensagens
    cursor.execute('''
        SELECT id, content as conteudo, direction as direcao, 
               CASE WHEN direction = 'outgoing' THEN 'enviada' ELSE 'recebida' END as tipo,
               timestamp as created_at
        FROM whatsapp_messages 
        WHERE contact_id = ?
        ORDER BY timestamp ASC
    ''', (contact_id,))
    
    messages = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify(messages)

@app.route('/api/leads/<int:lead_id>/mensagens', methods=['POST'])
def send_lead_mensagem(lead_id):
    """Envia mensagem para um lead"""
    data = request.get_json()
    mensagem = data.get('mensagem', '')
    
    if not mensagem:
        return jsonify({'error': 'Mensagem vazia'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Buscar lead
    cursor.execute('SELECT * FROM leads WHERE id = ?', (lead_id,))
    lead = cursor.fetchone()
    
    if not lead:
        conn.close()
        return jsonify({'error': 'Lead não encontrado'}), 404
    
    telefone = lead['telefone']
    
    # Buscar ou criar contato
    cursor.execute('SELECT id FROM whatsapp_contacts WHERE phone = ? OR lead_id = ?', 
                   (telefone, lead_id))
    contact = cursor.fetchone()
    
    if not contact:
        cursor.execute('''
            INSERT INTO whatsapp_contacts (phone, name, lead_id)
            VALUES (?, ?, ?)
        ''', (telefone, lead['nome'], lead_id))
        contact_id = cursor.lastrowid
    else:
        contact_id = contact['id']
    
    # Salvar mensagem localmente
    msg_id = f"local_{datetime.now().timestamp()}"
    cursor.execute('''
        INSERT INTO whatsapp_messages (wa_message_id, contact_id, direction, type, content, status, timestamp)
        VALUES (?, ?, 'outgoing', 'text', ?, 'sent', ?)
    ''', (msg_id, contact_id, mensagem, datetime.now()))
    
    # Atualizar conversa
    cursor.execute('''
        INSERT OR REPLACE INTO whatsapp_conversations (contact_id, last_message, last_message_type, last_message_time)
        VALUES (?, ?, 'text', ?)
    ''', (contact_id, mensagem[:100], datetime.now()))
    
    conn.commit()
    
    # Tentar enviar pelo WhatsApp
    client = get_whatsapp_client()
    if client:
        try:
            result = client.send_text(telefone, mensagem)
            if result.success:
                cursor.execute('''
                    UPDATE whatsapp_messages SET wa_message_id = ?, status = 'sent' 
                    WHERE wa_message_id = ?
                ''', (result.message_id, msg_id))
                conn.commit()
        except Exception as e:
            print(f"Erro ao enviar WhatsApp: {e}")
    
    conn.close()
    return jsonify({'success': True, 'message_id': msg_id})

@app.route('/api/leads/<int:lead_id>/marcar-lida', methods=['POST'])
def marcar_lead_lida(lead_id):
    """Marca mensagens do lead como lidas"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Buscar contato do lead
    cursor.execute('''
        SELECT wc.id FROM whatsapp_contacts wc
        JOIN leads l ON wc.lead_id = l.id OR wc.phone = l.telefone
        WHERE l.id = ?
    ''', (lead_id,))
    
    result = cursor.fetchone()
    if result:
        cursor.execute('UPDATE whatsapp_contacts SET unread_count = 0 WHERE id = ?', 
                       (result['id'],))
        conn.commit()
    
    conn.close()
    return jsonify({'success': True})

# =============================================================================
# INICIALIZAÇÃO
# =============================================================================

if __name__ == '__main__':
    init_db()
    print("Acesse: http://localhost:5000")
    app.run(debug=True, port=5000)
