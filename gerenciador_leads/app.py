from flask import Flask, render_template, request, jsonify, send_file
import pandas as pd
import os
import json
import re
from datetime import datetime
import sqlite3
import threading
import time
from werkzeug.utils import secure_filename

# Importar cliente Z-API
from whatsapp.zapi_client import ZAPIClient
from whatsapp.templates import TEMPLATES, formatar_mensagem, listar_templates

app = Flask(__name__)

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
app.secret_key = 'sua_chave_secreta_aqui'
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

# Criar pasta de uploads se não existir
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def normalizar_telefone(telefone):
    """Remove todos os caracteres não numéricos do telefone para comparação"""
    if not telefone:
        return ''
    # Remove tudo que não é dígito
    apenas_numeros = re.sub(r'\D', '', str(telefone))
    # Se começar com 55 e tiver mais de 11 dígitos, remove o 55
    if apenas_numeros.startswith('55') and len(apenas_numeros) > 11:
        apenas_numeros = apenas_numeros[2:]
    # Se tiver 11 dígitos e o primeiro for 0, remove o 0
    if len(apenas_numeros) == 11 and apenas_numeros.startswith('0'):
        apenas_numeros = apenas_numeros[1:]
    return apenas_numeros

# Caminho para os arquivos Excel
EXCEL_FOLDER = r"C:\Users\kaleb\Desktop\CONTATOS SMART REFORÇO"
DB_PATH = os.path.join(os.path.dirname(__file__), 'leads.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Tabela de leads
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            telefone TEXT UNIQUE,
            endereco TEXT,
            cidade TEXT,
            tipo_servico TEXT,
            avaliacao TEXT,
            link_maps TEXT,
            status TEXT DEFAULT 'novo',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
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
    
    # Tabela de configuração WhatsApp
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS whatsapp_config (
            id INTEGER PRIMARY KEY,
            instance_id TEXT,
            token TEXT,
            client_token TEXT,
            nome_instancia TEXT,
            ativo INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Adicionar coluna client_token se não existir (migração)
    try:
        cursor.execute('ALTER TABLE whatsapp_config ADD COLUMN client_token TEXT')
    except:
        pass  # Coluna já existe
    
    # Tabela de mensagens WhatsApp enviadas
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS whatsapp_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER,
            telefone TEXT,
            mensagem TEXT,
            template_usado TEXT,
            status TEXT DEFAULT 'enviado',
            message_id TEXT,
            erro TEXT,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lead_id) REFERENCES leads (id)
        )
    ''')
    
    # Tabela de templates personalizados
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS message_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            descricao TEXT,
            mensagem TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Inserir configuração padrão Z-API se não existir
    cursor.execute('SELECT COUNT(*) FROM whatsapp_config')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO whatsapp_config (id, instance_id, token, nome_instancia)
            VALUES (1, '3EDE74BAC5F9D2E689C61ADC408F7263', 'C8EE7E0AAA9C0222BAA018AB', 'PS-smart')
        ''')
    
    conn.commit()
    conn.close()

def importar_excel():
    """Importa todos os arquivos Excel para o banco de dados"""
    conn = get_db()
    cursor = conn.cursor()
    
    total_importados = 0
    
    for arquivo in os.listdir(EXCEL_FOLDER):
        if arquivo.endswith('.xlsx'):
            cidade = arquivo.replace('.xlsx', '')
            caminho = os.path.join(EXCEL_FOLDER, arquivo)
            
            try:
                df = pd.read_excel(caminho)
                
                # Mapear colunas
                colunas_map = {
                    'qBF1Pd': 'nome',
                    'UsdlK': 'telefone',
                    'W4Efsd 3': 'endereco',
                    'W4Efsd': 'tipo_servico',
                    'MW4etd': 'avaliacao',
                    'hfpxzc href': 'link_maps'
                }
                
                for _, row in df.iterrows():
                    nome = str(row.get('qBF1Pd', '')) if pd.notna(row.get('qBF1Pd')) else ''
                    telefone = str(row.get('UsdlK', '')) if pd.notna(row.get('UsdlK')) else ''
                    endereco = str(row.get('W4Efsd 3', '')) if pd.notna(row.get('W4Efsd 3')) else ''
                    tipo_servico = str(row.get('W4Efsd', '')) if pd.notna(row.get('W4Efsd')) else ''
                    avaliacao = str(row.get('MW4etd', '')) if pd.notna(row.get('MW4etd')) else ''
                    link_maps = str(row.get('hfpxzc href', '')) if pd.notna(row.get('hfpxzc href')) else ''
                    
                    if telefone and telefone != 'nan':
                        try:
                            cursor.execute('''
                                INSERT OR IGNORE INTO leads 
                                (nome, telefone, endereco, cidade, tipo_servico, avaliacao, link_maps)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            ''', (nome, telefone, endereco, cidade, tipo_servico, avaliacao, link_maps))
                            total_importados += cursor.rowcount
                        except:
                            pass
            except Exception as e:
                print(f"Erro ao importar {arquivo}: {e}")
    
    conn.commit()
    conn.close()
    return total_importados

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/stats')
def get_stats():
    conn = get_db()
    cursor = conn.cursor()
    
    # Total de leads
    cursor.execute('SELECT COUNT(*) as total FROM leads')
    total = cursor.fetchone()['total']
    
    # Por status
    cursor.execute('SELECT status, COUNT(*) as count FROM leads GROUP BY status')
    status_counts = {row['status']: row['count'] for row in cursor.fetchall()}
    
    # Por cidade (top 10)
    cursor.execute('SELECT cidade, COUNT(*) as count FROM leads GROUP BY cidade ORDER BY count DESC LIMIT 10')
    por_cidade = [{'cidade': row['cidade'], 'count': row['count']} for row in cursor.fetchall()]
    
    # Total de cidades
    cursor.execute('SELECT COUNT(DISTINCT cidade) as total FROM leads')
    total_cidades = cursor.fetchone()['total']
    
    conn.close()
    
    return jsonify({
        'total': total,
        'novo': status_counts.get('novo', 0),
        'em_contato': status_counts.get('em_contato', 0),
        'convertido': status_counts.get('convertido', 0),
        'perdido': status_counts.get('perdido', 0),
        'por_cidade': por_cidade,
        'total_cidades': total_cidades
    })

@app.route('/api/leads')
def get_leads():
    conn = get_db()
    cursor = conn.cursor()
    
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 50))
    search = request.args.get('search', '')
    cidade = request.args.get('cidade', '')
    status = request.args.get('status', '')
    
    offset = (page - 1) * per_page
    
    query = 'SELECT * FROM leads WHERE 1=1'
    params = []
    
    if search:
        query += ' AND (nome LIKE ? OR telefone LIKE ? OR endereco LIKE ?)'
        search_param = f'%{search}%'
        params.extend([search_param, search_param, search_param])
    
    if cidade:
        query += ' AND cidade = ?'
        params.append(cidade)
    
    if status:
        query += ' AND status = ?'
        params.append(status)
    
    # Contar total
    count_query = query.replace('SELECT *', 'SELECT COUNT(*) as total')
    cursor.execute(count_query, params)
    total = cursor.fetchone()['total']
    
    # Buscar leads
    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    params.extend([per_page, offset])
    
    cursor.execute(query, params)
    leads = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return jsonify({
        'leads': leads,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page
    })

@app.route('/api/leads/<int:lead_id>')
def get_lead(lead_id):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM leads WHERE id = ?', (lead_id,))
    lead = dict(cursor.fetchone())
    
    cursor.execute('SELECT * FROM anotacoes WHERE lead_id = ? ORDER BY created_at DESC', (lead_id,))
    anotacoes = [dict(row) for row in cursor.fetchall()]
    
    cursor.execute('SELECT * FROM historico WHERE lead_id = ? ORDER BY created_at DESC', (lead_id,))
    historico = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return jsonify({
        'lead': lead,
        'anotacoes': anotacoes,
        'historico': historico
    })

@app.route('/api/leads/<int:lead_id>/status', methods=['POST'])
def update_status(lead_id):
    data = request.json
    novo_status = data.get('status')
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT status FROM leads WHERE id = ?', (lead_id,))
    status_anterior = cursor.fetchone()['status']
    
    cursor.execute('''
        UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    ''', (novo_status, lead_id))
    
    cursor.execute('''
        INSERT INTO historico (lead_id, acao, descricao)
        VALUES (?, 'status_change', ?)
    ''', (lead_id, f'Status alterado de "{status_anterior}" para "{novo_status}"'))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/leads/<int:lead_id>/anotacao', methods=['POST'])
def add_anotacao(lead_id):
    data = request.json
    texto = data.get('texto')
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO anotacoes (lead_id, texto) VALUES (?, ?)
    ''', (lead_id, texto))
    
    cursor.execute('''
        INSERT INTO historico (lead_id, acao, descricao)
        VALUES (?, 'anotacao', ?)
    ''', (lead_id, 'Nova anotação adicionada'))
    
    cursor.execute('''
        UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    ''', (lead_id,))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/cidades')
def get_cidades():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT DISTINCT cidade FROM leads ORDER BY cidade')
    cidades = [row['cidade'] for row in cursor.fetchall()]
    
    conn.close()
    
    return jsonify(cidades)

@app.route('/api/importar', methods=['POST'])
def importar():
    total = importar_excel()
    return jsonify({'success': True, 'total_importados': total})

@app.route('/api/exportar')
def exportar():
    conn = get_db()
    
    cidade = request.args.get('cidade', '')
    status = request.args.get('status', '')
    
    query = 'SELECT * FROM leads WHERE 1=1'
    params = []
    
    if cidade:
        query += ' AND cidade = ?'
        params.append(cidade)
    
    if status:
        query += ' AND status = ?'
        params.append(status)
    
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    
    # Salvar como CSV
    export_path = os.path.join(os.path.dirname(__file__), 'export_leads.csv')
    df.to_csv(export_path, index=False, encoding='utf-8-sig')
    
    return send_file(export_path, as_attachment=True, download_name='leads_exportados.csv')

@app.route('/api/atualizar-em-massa', methods=['POST'])
def atualizar_em_massa():
    """Atualiza o status de múltiplos leads baseado em uma planilha"""
    
    if 'arquivo' not in request.files:
        return jsonify({'success': False, 'error': 'Nenhum arquivo enviado'}), 400
    
    arquivo = request.files['arquivo']
    novo_status = request.form.get('status', 'em_contato')
    coluna_telefone = request.form.get('coluna_telefone', '')
    
    if arquivo.filename == '':
        return jsonify({'success': False, 'error': 'Nenhum arquivo selecionado'}), 400
    
    # Salvar arquivo temporariamente
    filename = secure_filename(arquivo.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    arquivo.save(filepath)
    
    try:
        # Ler o arquivo (CSV ou Excel)
        if filename.endswith('.csv'):
            df = pd.read_csv(filepath, dtype=str)
        elif filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(filepath, dtype=str)
        else:
            return jsonify({'success': False, 'error': 'Formato de arquivo não suportado. Use CSV ou Excel.'}), 400
        
        # Encontrar a coluna de telefone
        telefone_col = None
        
        if coluna_telefone and coluna_telefone in df.columns:
            telefone_col = coluna_telefone
        else:
            # Tentar encontrar automaticamente
            possiveis_nomes = ['telefone', 'phone', 'numero', 'número', 'celular', 'whatsapp', 'tel', 'fone', 'contato']
            for col in df.columns:
                if any(nome in col.lower() for nome in possiveis_nomes):
                    telefone_col = col
                    break
            
            # Se não encontrou, usar a primeira coluna
            if telefone_col is None:
                telefone_col = df.columns[0]
        
        # Extrair telefones da planilha e normalizar
        telefones_planilha = {}
        for idx, row in df.iterrows():
            tel_original = str(row[telefone_col]) if pd.notna(row[telefone_col]) else ''
            tel_normalizado = normalizar_telefone(tel_original)
            if tel_normalizado:
                telefones_planilha[tel_normalizado] = tel_original
        
        # Buscar todos os leads e criar índice normalizado
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id, telefone, status FROM leads')
        leads = cursor.fetchall()
        
        # Criar mapeamento de telefone normalizado -> lead_id
        leads_por_telefone = {}
        for lead in leads:
            tel_normalizado = normalizar_telefone(lead['telefone'])
            if tel_normalizado:
                leads_por_telefone[tel_normalizado] = {
                    'id': lead['id'],
                    'telefone_original': lead['telefone'],
                    'status_anterior': lead['status']
                }
        
        # Fazer o match e atualizar
        atualizados = []
        nao_encontrados = []
        
        for tel_normalizado, tel_original in telefones_planilha.items():
            if tel_normalizado in leads_por_telefone:
                lead_info = leads_por_telefone[tel_normalizado]
                
                # Atualizar status
                cursor.execute('''
                    UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
                ''', (novo_status, lead_info['id']))
                
                # Registrar no histórico
                cursor.execute('''
                    INSERT INTO historico (lead_id, acao, descricao)
                    VALUES (?, 'status_change', ?)
                ''', (lead_info['id'], f'Status alterado de "{lead_info["status_anterior"]}" para "{novo_status}" (atualização em massa)'))
                
                atualizados.append({
                    'telefone_planilha': tel_original,
                    'telefone_sistema': lead_info['telefone_original']
                })
            else:
                nao_encontrados.append(tel_original)
        
        conn.commit()
        conn.close()
        
        # Remover arquivo temporário
        os.remove(filepath)
        
        return jsonify({
            'success': True,
            'total_planilha': len(telefones_planilha),
            'total_atualizados': len(atualizados),
            'total_nao_encontrados': len(nao_encontrados),
            'atualizados': atualizados[:50],  # Limitar para não sobrecarregar
            'nao_encontrados': nao_encontrados[:50],
            'novo_status': novo_status,
            'coluna_usada': telefone_col
        })
        
    except Exception as e:
        # Remover arquivo temporário em caso de erro
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/preview-colunas', methods=['POST'])
def preview_colunas():
    """Retorna as colunas de um arquivo para o usuário escolher qual é o telefone"""
    
    if 'arquivo' not in request.files:
        return jsonify({'success': False, 'error': 'Nenhum arquivo enviado'}), 400
    
    arquivo = request.files['arquivo']
    
    if arquivo.filename == '':
        return jsonify({'success': False, 'error': 'Nenhum arquivo selecionado'}), 400
    
    # Salvar arquivo temporariamente
    filename = secure_filename(arquivo.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    arquivo.save(filepath)
    
    try:
        # Ler o arquivo (CSV ou Excel)
        if filename.endswith('.csv'):
            df = pd.read_csv(filepath, dtype=str, nrows=5)
        elif filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(filepath, dtype=str, nrows=5)
        else:
            return jsonify({'success': False, 'error': 'Formato não suportado'}), 400
        
        # Preparar preview
        colunas = df.columns.tolist()
        preview = df.head(3).to_dict('records')
        
        # Sugerir coluna de telefone
        sugestao = None
        possiveis_nomes = ['telefone', 'phone', 'numero', 'número', 'celular', 'whatsapp', 'tel', 'fone', 'contato']
        for col in colunas:
            if any(nome in col.lower() for nome in possiveis_nomes):
                sugestao = col
                break
        
        # Remover arquivo temporário
        os.remove(filepath)
        
        return jsonify({
            'success': True,
            'colunas': colunas,
            'preview': preview,
            'sugestao': sugestao,
            'filename': filename
        })
        
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== ROTAS WHATSAPP Z-API ====================

def get_zapi_client():
    """Retorna cliente Z-API configurado"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT instance_id, token, client_token FROM whatsapp_config WHERE id = 1')
    config = cursor.fetchone()
    conn.close()
    
    if config and config['instance_id'] and config['token']:
        client_token = config['client_token'] if 'client_token' in config.keys() else None
        return ZAPIClient(config['instance_id'], config['token'], client_token)
    return None


@app.route('/api/whatsapp/config', methods=['GET'])
def get_whatsapp_config():
    """Retorna configuração atual do WhatsApp"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM whatsapp_config WHERE id = 1')
    config = cursor.fetchone()
    conn.close()
    
    if config:
        result = {
            'instance_id': config['instance_id'],
            'token': config['token'],
            'nome_instancia': config['nome_instancia'],
            'ativo': config['ativo']
        }
        # Adicionar client_token se existir
        try:
            result['client_token'] = config['client_token']
        except:
            result['client_token'] = ''
        return jsonify(result)
    return jsonify({})


@app.route('/api/whatsapp/config', methods=['POST'])
def save_whatsapp_config():
    """Salva configuração do WhatsApp"""
    data = request.json
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE whatsapp_config 
        SET instance_id = ?, token = ?, client_token = ?, nome_instancia = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
    ''', (data.get('instance_id'), data.get('token'), data.get('client_token'), data.get('nome_instancia')))
    
    if cursor.rowcount == 0:
        cursor.execute('''
            INSERT INTO whatsapp_config (id, instance_id, token, client_token, nome_instancia)
            VALUES (1, ?, ?, ?, ?)
        ''', (data.get('instance_id'), data.get('token'), data.get('client_token'), data.get('nome_instancia')))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})


@app.route('/api/whatsapp/status')
def whatsapp_status():
    """Verifica status da conexão WhatsApp"""
    client = get_zapi_client()
    
    if not client:
        return jsonify({
            'connected': False,
            'error': 'WhatsApp não configurado'
        })
    
    status = client.verificar_conexao()
    return jsonify(status)


@app.route('/api/whatsapp/templates')
def get_templates():
    """Retorna lista de templates disponíveis"""
    templates = listar_templates()
    return jsonify(templates)


@app.route('/api/whatsapp/send', methods=['POST'])
def send_whatsapp_message():
    """Envia mensagem individual para um lead"""
    data = request.json
    lead_id = data.get('lead_id')
    telefone = data.get('telefone')
    mensagem = data.get('mensagem')
    template_usado = data.get('template', 'personalizada')
    
    client = get_zapi_client()
    
    if not client:
        return jsonify({
            'success': False,
            'error': 'WhatsApp não configurado'
        })
    
    # Enviar mensagem
    resultado = client.enviar_texto(telefone, mensagem)
    
    # Salvar no histórico
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO whatsapp_messages (lead_id, telefone, mensagem, template_usado, status, message_id, erro)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        lead_id,
        telefone,
        mensagem,
        template_usado,
        'enviado' if resultado.success else 'falhou',
        resultado.message_id,
        resultado.error
    ))
    
    # Atualizar status do lead para "em_contato"
    if resultado.success and lead_id:
        cursor.execute('''
            UPDATE leads SET status = 'em_contato', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        ''', (lead_id,))
        
        cursor.execute('''
            INSERT INTO historico (lead_id, acao, descricao)
            VALUES (?, 'whatsapp', ?)
        ''', (lead_id, 'Mensagem WhatsApp enviada'))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': resultado.success,
        'message_id': resultado.message_id,
        'error': resultado.error
    })


@app.route('/api/whatsapp/send-image', methods=['POST'])
def send_whatsapp_image():
    """Envia imagem com legenda para um número"""
    data = request.json
    lead_id = data.get('lead_id')
    telefone = data.get('telefone')
    url_imagem = data.get('url_imagem')
    caption = data.get('caption', '')
    
    client = get_zapi_client()
    
    if not client:
        return jsonify({
            'success': False,
            'error': 'WhatsApp não configurado'
        })
    
    # Enviar imagem
    resultado = client.enviar_imagem(telefone, url_imagem, caption)
    
    # Salvar no histórico
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO whatsapp_messages (lead_id, telefone, mensagem, template_usado, status, message_id, erro)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        lead_id,
        telefone,
        f"[IMAGEM] {caption}",
        'imagem',
        'enviado' if resultado.success else 'falhou',
        resultado.message_id,
        resultado.error
    ))
    
    if resultado.success and lead_id:
        cursor.execute('''
            UPDATE leads SET status = 'em_contato', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        ''', (lead_id,))
        
        cursor.execute('''
            INSERT INTO historico (lead_id, acao, descricao)
            VALUES (?, 'whatsapp', ?)
        ''', (lead_id, 'Imagem enviada via WhatsApp'))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': resultado.success,
        'message_id': resultado.message_id,
        'error': resultado.error
    })


@app.route('/api/whatsapp/send-video', methods=['POST'])
def send_whatsapp_video():
    """Envia vídeo com legenda para um número"""
    data = request.json
    lead_id = data.get('lead_id')
    telefone = data.get('telefone')
    url_video = data.get('url_video')
    caption = data.get('caption', '')
    
    client = get_zapi_client()
    
    if not client:
        return jsonify({
            'success': False,
            'error': 'WhatsApp não configurado'
        })
    
    # Enviar vídeo
    resultado = client.enviar_video(telefone, url_video, caption)
    
    # Salvar no histórico
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO whatsapp_messages (lead_id, telefone, mensagem, template_usado, status, message_id, erro)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        lead_id,
        telefone,
        f"[VÍDEO] {caption}",
        'video',
        'enviado' if resultado.success else 'falhou',
        resultado.message_id,
        resultado.error
    ))
    
    if resultado.success and lead_id:
        cursor.execute('''
            UPDATE leads SET status = 'em_contato', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        ''', (lead_id,))
        
        cursor.execute('''
            INSERT INTO historico (lead_id, acao, descricao)
            VALUES (?, 'whatsapp', ?)
        ''', (lead_id, 'Vídeo enviado via WhatsApp'))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': resultado.success,
        'message_id': resultado.message_id,
        'error': resultado.error
    })


@app.route('/api/whatsapp/verificar-numero', methods=['POST'])
def verificar_numero_whatsapp():
    """Verifica se um número tem WhatsApp"""
    data = request.json
    telefone = data.get('telefone')
    
    client = get_zapi_client()
    
    if not client:
        return jsonify({
            'success': False,
            'error': 'WhatsApp não configurado'
        })
    
    existe, numero = client.verificar_numero(telefone)
    
    return jsonify({
        'existe': existe,
        'numero_formatado': numero
    })


@app.route('/api/whatsapp/send-bulk', methods=['POST'])
def send_bulk_whatsapp():
    """Inicia envio em massa de mensagens"""
    global envio_em_andamento
    
    if envio_em_andamento['ativo']:
        return jsonify({
            'success': False,
            'error': 'Já existe um envio em andamento'
        })
    
    data = request.json
    lead_ids = data.get('lead_ids', [])
    mensagem_template = data.get('mensagem')
    intervalo_min = data.get('intervalo_min', 30)
    intervalo_max = data.get('intervalo_max', 60)
    template_usado = data.get('template', 'personalizada')
    
    if not lead_ids:
        return jsonify({
            'success': False,
            'error': 'Nenhum lead selecionado'
        })
    
    client = get_zapi_client()
    
    if not client:
        return jsonify({
            'success': False,
            'error': 'WhatsApp não configurado'
        })
    
    # Buscar dados dos leads
    conn = get_db()
    cursor = conn.cursor()
    
    placeholders = ','.join('?' * len(lead_ids))
    cursor.execute(f'SELECT * FROM leads WHERE id IN ({placeholders})', lead_ids)
    leads = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    # Resetar estado
    envio_em_andamento = {
        'ativo': True,
        'total': len(leads),
        'enviados': 0,
        'sucesso': 0,
        'falha': 0,
        'cancelado': False,
        'resultados': []
    }
    
    # Iniciar thread de envio
    def enviar_em_background():
        global envio_em_andamento
        import random
        
        conn = get_db()
        cursor = conn.cursor()
        
        for lead in leads:
            if envio_em_andamento['cancelado']:
                break
            
            # Formatar mensagem
            try:
                mensagem = mensagem_template.format(
                    nome=lead.get('nome', 'Cliente'),
                    cidade=lead.get('cidade', ''),
                    telefone=lead.get('telefone', ''),
                    endereco=lead.get('endereco', ''),
                    tipo_servico=lead.get('tipo_servico', '')
                )
            except:
                mensagem = mensagem_template
            
            # Enviar
            resultado = client.enviar_texto(lead['telefone'], mensagem)
            
            envio_em_andamento['enviados'] += 1
            
            if resultado.success:
                envio_em_andamento['sucesso'] += 1
            else:
                envio_em_andamento['falha'] += 1
            
            envio_em_andamento['resultados'].append({
                'lead_id': lead['id'],
                'nome': lead['nome'],
                'telefone': lead['telefone'],
                'sucesso': resultado.success,
                'erro': resultado.error
            })
            
            # Salvar no banco
            cursor.execute('''
                INSERT INTO whatsapp_messages (lead_id, telefone, mensagem, template_usado, status, message_id, erro)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                lead['id'],
                lead['telefone'],
                mensagem,
                template_usado,
                'enviado' if resultado.success else 'falhou',
                resultado.message_id,
                resultado.error
            ))
            
            if resultado.success:
                cursor.execute('''
                    UPDATE leads SET status = 'em_contato', updated_at = CURRENT_TIMESTAMP WHERE id = ?
                ''', (lead['id'],))
            
            conn.commit()
            
            # Aguardar intervalo
            if lead != leads[-1] and not envio_em_andamento['cancelado']:
                intervalo = random.randint(intervalo_min, intervalo_max)
                time.sleep(intervalo)
        
        conn.close()
        envio_em_andamento['ativo'] = False
    
    thread = threading.Thread(target=enviar_em_background)
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': f'Envio iniciado para {len(leads)} leads'
    })


@app.route('/api/whatsapp/send-bulk/status')
def get_bulk_status():
    """Retorna status do envio em massa"""
    return jsonify(envio_em_andamento)


@app.route('/api/whatsapp/send-bulk/cancel', methods=['POST'])
def cancel_bulk_send():
    """Cancela envio em massa"""
    global envio_em_andamento
    envio_em_andamento['cancelado'] = True
    return jsonify({'success': True})


@app.route('/api/whatsapp/history')
def get_whatsapp_history():
    """Retorna histórico de mensagens enviadas"""
    conn = get_db()
    cursor = conn.cursor()
    
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 50))
    offset = (page - 1) * per_page
    
    cursor.execute('''
        SELECT wm.*, l.nome as lead_nome, l.cidade as lead_cidade
        FROM whatsapp_messages wm
        LEFT JOIN leads l ON wm.lead_id = l.id
        ORDER BY wm.sent_at DESC
        LIMIT ? OFFSET ?
    ''', (per_page, offset))
    
    messages = [dict(row) for row in cursor.fetchall()]
    
    cursor.execute('SELECT COUNT(*) as total FROM whatsapp_messages')
    total = cursor.fetchone()['total']
    
    conn.close()
    
    return jsonify({
        'messages': messages,
        'total': total,
        'page': page,
        'per_page': per_page
    })


@app.route('/api/whatsapp/stats')
def get_whatsapp_stats():
    """Retorna estatísticas de envio"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) as total FROM whatsapp_messages')
    total = cursor.fetchone()['total']
    
    cursor.execute("SELECT COUNT(*) as count FROM whatsapp_messages WHERE status = 'enviado'")
    enviados = cursor.fetchone()['count']
    
    cursor.execute("SELECT COUNT(*) as count FROM whatsapp_messages WHERE status = 'falhou'")
    falhou = cursor.fetchone()['count']
    
    cursor.execute("SELECT COUNT(*) as count FROM whatsapp_messages WHERE DATE(sent_at) = DATE('now')")
    hoje = cursor.fetchone()['count']
    
    conn.close()
    
    return jsonify({
        'total': total,
        'enviados': enviados,
        'falhou': falhou,
        'hoje': hoje
    })


if __name__ == '__main__':
    init_db()
    print("Banco de dados inicializado!")
    print("Acesse: http://localhost:5000")
    app.run(debug=True, port=5000)
