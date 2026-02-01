"""
============================================================
SMART REFORÇO - Backend API
WhatsApp Business Cloud API + Supabase
============================================================
"""

import os
import re
import json
import hmac
import hashlib
import logging
from datetime import datetime, timedelta
from functools import wraps
from typing import Optional, Dict, Any, List

import requests
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from dotenv import load_dotenv
from pathlib import Path

# Carregar variáveis de ambiente do diretório do app
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# ============================================================
# CONFIGURAÇÃO
# ============================================================

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key')

# CORS para o frontend React
CORS(app, origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(','))

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('smart-reforco')

# ============================================================
# SUPABASE CLIENT
# ============================================================

class SupabaseClient:
    """Cliente para Supabase com autenticação service_role"""
    
    def __init__(self):
        self.url = os.getenv('SUPABASE_URL')
        self.key = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_ANON_KEY')
        self.headers = {
            'apikey': self.key,
            'Authorization': f'Bearer {self.key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    
    def _request(self, method: str, table: str, data: dict = None, params: dict = None) -> dict:
        """Faz requisição para o Supabase"""
        url = f"{self.url}/rest/v1/{table}"
        
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                json=data,
                params=params,
                timeout=30
            )
            response.raise_for_status()
            return {'success': True, 'data': response.json() if response.text else None}
        except requests.exceptions.RequestException as e:
            logger.error(f"Supabase error: {e}")
            return {'success': False, 'error': str(e)}
    
    def select(self, table: str, columns: str = '*', filters: dict = None, 
               order: str = None, limit: int = None) -> dict:
        """SELECT com filtros"""
        params = {'select': columns}
        
        if filters:
            for key, value in filters.items():
                params[key] = value
        
        if order:
            params['order'] = order
        
        if limit:
            params['limit'] = limit
        
        return self._request('GET', table, params=params)
    
    def insert(self, table: str, data: dict) -> dict:
        """INSERT"""
        return self._request('POST', table, data=data)
    
    def update(self, table: str, data: dict, filters: dict) -> dict:
        """UPDATE com filtros"""
        params = {}
        for key, value in filters.items():
            params[key] = value
        
        return self._request('PATCH', table, data=data, params=params)
    
    def delete(self, table: str, filters: dict) -> dict:
        """DELETE com filtros"""
        params = {}
        for key, value in filters.items():
            params[key] = value
        
        return self._request('DELETE', table, params=params)
    
    def rpc(self, function_name: str, params: dict = None) -> dict:
        """Chamar função RPC"""
        url = f"{self.url}/rest/v1/rpc/{function_name}"
        
        try:
            response = requests.post(
                url=url,
                headers=self.headers,
                json=params or {},
                timeout=30
            )
            response.raise_for_status()
            return {'success': True, 'data': response.json() if response.text else None}
        except requests.exceptions.RequestException as e:
            logger.error(f"Supabase RPC error: {e}")
            return {'success': False, 'error': str(e)}


# Instância global
supabase = SupabaseClient()

# ============================================================
# WHATSAPP CLOUD API CLIENT
# ============================================================

class WhatsAppCloudAPI:
    """Cliente para WhatsApp Business Cloud API (Meta)"""
    
    BASE_URL = "https://graph.facebook.com/v22.0"
    
    def __init__(self):
        self.phone_number_id = os.getenv('WHATSAPP_PHONE_NUMBER_ID')
        self.access_token = os.getenv('WHATSAPP_ACCESS_TOKEN')
        self.verify_token = os.getenv('WHATSAPP_VERIFY_TOKEN')
        self.business_account_id = os.getenv('WHATSAPP_BUSINESS_ACCOUNT_ID')
        
        self.headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
    
    def _format_phone(self, phone: str) -> str:
        """Formata telefone para o padrão WhatsApp"""
        # Remove tudo que não é dígito
        digits = re.sub(r'\D', '', phone)
        
        # Adiciona código do Brasil se não tiver
        if len(digits) == 11:  # DDD + 9 dígitos
            digits = '55' + digits
        elif len(digits) == 10:  # DDD + 8 dígitos (fixo)
            digits = '55' + digits
        
        return digits
    
    def _make_request(self, endpoint: str, data: dict, method: str = 'POST') -> dict:
        """Faz requisição para a API do WhatsApp"""
        url = f"{self.BASE_URL}/{self.phone_number_id}/{endpoint}"
        
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                json=data,
                timeout=30
            )
            
            result = response.json()
            
            if response.ok:
                return {
                    'success': True,
                    'data': result,
                    'message_id': result.get('messages', [{}])[0].get('id')
                }
            else:
                error = result.get('error', {})
                return {
                    'success': False,
                    'error': error.get('message', 'Unknown error'),
                    'error_code': error.get('code'),
                    'error_data': error
                }
                
        except requests.exceptions.RequestException as e:
            logger.error(f"WhatsApp API error: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_text(self, to: str, message: str, preview_url: bool = False) -> dict:
        """Envia mensagem de texto"""
        data = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": self._format_phone(to),
            "type": "text",
            "text": {
                "preview_url": preview_url,
                "body": message
            }
        }
        return self._make_request('messages', data)
    
    def send_template(self, to: str, template_name: str, 
                      language: str = 'pt_BR', components: list = None) -> dict:
        """Envia mensagem usando template aprovado"""
        data = {
            "messaging_product": "whatsapp",
            "to": self._format_phone(to),
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language}
            }
        }
        
        if components:
            data['template']['components'] = components
        
        return self._make_request('messages', data)
    
    def send_image(self, to: str, image_url: str = None, 
                   image_id: str = None, caption: str = None) -> dict:
        """Envia imagem"""
        image_data = {}
        
        if image_url:
            image_data['link'] = image_url
        elif image_id:
            image_data['id'] = image_id
        
        if caption:
            image_data['caption'] = caption
        
        data = {
            "messaging_product": "whatsapp",
            "to": self._format_phone(to),
            "type": "image",
            "image": image_data
        }
        return self._make_request('messages', data)
    
    def send_audio(self, to: str, audio_url: str = None, audio_id: str = None) -> dict:
        """Envia áudio"""
        audio_data = {}
        
        if audio_url:
            audio_data['link'] = audio_url
        elif audio_id:
            audio_data['id'] = audio_id
        
        data = {
            "messaging_product": "whatsapp",
            "to": self._format_phone(to),
            "type": "audio",
            "audio": audio_data
        }
        return self._make_request('messages', data)
    
    def send_video(self, to: str, video_url: str = None, 
                   video_id: str = None, caption: str = None) -> dict:
        """Envia vídeo"""
        video_data = {}
        
        if video_url:
            video_data['link'] = video_url
        elif video_id:
            video_data['id'] = video_id
        
        if caption:
            video_data['caption'] = caption
        
        data = {
            "messaging_product": "whatsapp",
            "to": self._format_phone(to),
            "type": "video",
            "video": video_data
        }
        return self._make_request('messages', data)
    
    def send_document(self, to: str, document_url: str = None, 
                      document_id: str = None, filename: str = None, 
                      caption: str = None) -> dict:
        """Envia documento"""
        doc_data = {}
        
        if document_url:
            doc_data['link'] = document_url
        elif document_id:
            doc_data['id'] = document_id
        
        if filename:
            doc_data['filename'] = filename
        
        if caption:
            doc_data['caption'] = caption
        
        data = {
            "messaging_product": "whatsapp",
            "to": self._format_phone(to),
            "type": "document",
            "document": doc_data
        }
        return self._make_request('messages', data)
    
    def send_location(self, to: str, latitude: float, longitude: float,
                      name: str = None, address: str = None) -> dict:
        """Envia localização"""
        location_data = {
            "latitude": latitude,
            "longitude": longitude
        }
        
        if name:
            location_data['name'] = name
        if address:
            location_data['address'] = address
        
        data = {
            "messaging_product": "whatsapp",
            "to": self._format_phone(to),
            "type": "location",
            "location": location_data
        }
        return self._make_request('messages', data)
    
    def send_reaction(self, to: str, message_id: str, emoji: str) -> dict:
        """Envia reação a uma mensagem"""
        data = {
            "messaging_product": "whatsapp",
            "to": self._format_phone(to),
            "type": "reaction",
            "reaction": {
                "message_id": message_id,
                "emoji": emoji
            }
        }
        return self._make_request('messages', data)
    
    def mark_as_read(self, message_id: str) -> dict:
        """Marca mensagem como lida"""
        data = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id
        }
        return self._make_request('messages', data)
    
    def download_media(self, media_id: str) -> dict:
        """Obtém URL de download de mídia"""
        url = f"{self.BASE_URL}/{media_id}"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=30)
            
            if response.ok:
                data = response.json()
                return {'success': True, 'url': data.get('url')}
            else:
                return {'success': False, 'error': response.text}
                
        except requests.exceptions.RequestException as e:
            return {'success': False, 'error': str(e)}
    
    def get_media_content(self, media_url: str) -> bytes:
        """Baixa o conteúdo da mídia"""
        try:
            response = requests.get(
                media_url,
                headers={'Authorization': f'Bearer {self.access_token}'},
                timeout=60
            )
            if response.ok:
                return response.content
            return None
        except:
            return None


# Instância global
whatsapp = WhatsAppCloudAPI()

# ============================================================
# HELPERS
# ============================================================

def save_message(telefone: str, tipo: str, conteudo: str, direcao: str,
                 wamid: str = None, lead_id: int = None, media_data: dict = None,
                 status: str = 'sent') -> dict:
    """Salva mensagem no Supabase"""
    
    data = {
        'telefone': telefone,
        'tipo': tipo,
        'conteudo': conteudo,
        'direcao': direcao,
        'status': status,
        'timestamp_whatsapp': datetime.utcnow().isoformat()
    }
    
    if wamid:
        data['wamid'] = wamid
    
    if lead_id:
        data['lead_id'] = lead_id
    
    if media_data:
        data.update(media_data)
    
    result = supabase.insert('mensagens', data)
    return result


def get_or_create_lead(telefone: str, nome: str = None) -> Optional[int]:
    """Busca ou cria lead pelo telefone"""
    
    # Normalizar telefone
    telefone_limpo = re.sub(r'\D', '', telefone)
    
    # Buscar lead existente
    result = supabase.select('leads', filters={'telefone': f'eq.{telefone_limpo}'})
    
    if result['success'] and result['data']:
        return result['data'][0]['id']
    
    # Criar novo lead
    new_lead = {
        'telefone': telefone_limpo,
        'nome': nome or f'Lead {telefone_limpo[-4:]}',
        'origem': 'whatsapp',
        'etapa': 'novo'
    }
    
    result = supabase.insert('leads', new_lead)
    
    if result['success'] and result['data']:
        return result['data'][0]['id']
    
    return None


# ============================================================
# WEBHOOK WHATSAPP
# ============================================================

@app.route('/webhook', methods=['GET'])
def webhook_verify():
    """Verificação do webhook pela Meta"""
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    verify_token = os.getenv('WHATSAPP_VERIFY_TOKEN', 'smart_reforco_verify_2024')
    
    if mode == 'subscribe' and token == verify_token:
        logger.info('Webhook verificado com sucesso!')
        return challenge, 200
    else:
        logger.warning(f'Webhook verification failed. Token: {token}')
        return 'Forbidden', 403


@app.route('/webhook', methods=['POST'])
def webhook_receive():
    """Recebe mensagens do WhatsApp"""
    try:
        payload = request.get_json()
        
        # Log do webhook
        supabase.insert('webhook_logs', {
            'tipo': 'incoming',
            'payload': json.dumps(payload)
        })
        
        # Processar mensagens
        if 'entry' in payload:
            for entry in payload['entry']:
                for change in entry.get('changes', []):
                    if change.get('field') == 'messages':
                        value = change.get('value', {})
                        
                        # Processar status updates
                        for status in value.get('statuses', []):
                            process_status_update(status)
                        
                        # Processar mensagens recebidas
                        for message in value.get('messages', []):
                            contact = value.get('contacts', [{}])[0]
                            process_incoming_message(message, contact)
        
        return 'OK', 200
        
    except Exception as e:
        logger.error(f'Webhook error: {e}')
        return 'Error', 500


def process_status_update(status: dict):
    """Processa atualização de status de mensagem"""
    wamid = status.get('id')
    new_status = status.get('status')  # sent, delivered, read, failed
    
    if wamid and new_status:
        supabase.update('mensagens', 
                       {'status': new_status},
                       {'wamid': f'eq.{wamid}'})
        
        logger.info(f'Message {wamid} status: {new_status}')


def process_incoming_message(message: dict, contact: dict):
    """Processa mensagem recebida"""
    try:
        wamid = message.get('id')
        telefone = message.get('from')
        msg_type = message.get('type')
        timestamp = message.get('timestamp')
        
        nome = contact.get('profile', {}).get('name', '')
        
        # Buscar ou criar lead
        lead_id = get_or_create_lead(telefone, nome)
        
        # Extrair conteúdo baseado no tipo
        conteudo = ''
        media_data = {}
        
        if msg_type == 'text':
            conteudo = message.get('text', {}).get('body', '')
            
        elif msg_type == 'image':
            img = message.get('image', {})
            conteudo = img.get('caption', '[Imagem]')
            media_data = {
                'media_id': img.get('id'),
                'media_mime': img.get('mime_type')
            }
            
        elif msg_type == 'audio':
            audio = message.get('audio', {})
            conteudo = '[Áudio]'
            media_data = {
                'media_id': audio.get('id'),
                'media_mime': audio.get('mime_type')
            }
            
        elif msg_type == 'video':
            video = message.get('video', {})
            conteudo = video.get('caption', '[Vídeo]')
            media_data = {
                'media_id': video.get('id'),
                'media_mime': video.get('mime_type')
            }
            
        elif msg_type == 'document':
            doc = message.get('document', {})
            conteudo = doc.get('caption', '[Documento]')
            media_data = {
                'media_id': doc.get('id'),
                'media_mime': doc.get('mime_type'),
                'media_filename': doc.get('filename')
            }
            
        elif msg_type == 'sticker':
            sticker = message.get('sticker', {})
            conteudo = '[Sticker]'
            media_data = {
                'media_id': sticker.get('id'),
                'media_mime': sticker.get('mime_type')
            }
            
        elif msg_type == 'location':
            loc = message.get('location', {})
            conteudo = f"📍 {loc.get('name', 'Localização')}"
            media_data = {
                'metadata': json.dumps({
                    'latitude': loc.get('latitude'),
                    'longitude': loc.get('longitude'),
                    'address': loc.get('address')
                })
            }
            
        elif msg_type == 'contacts':
            conteudo = '[Contato compartilhado]'
            
        elif msg_type == 'button':
            conteudo = message.get('button', {}).get('text', '[Botão]')
            
        elif msg_type == 'interactive':
            interactive = message.get('interactive', {})
            if interactive.get('type') == 'button_reply':
                conteudo = interactive.get('button_reply', {}).get('title', '[Resposta]')
            elif interactive.get('type') == 'list_reply':
                conteudo = interactive.get('list_reply', {}).get('title', '[Lista]')
        
        # Salvar mensagem
        save_message(
            telefone=telefone,
            tipo=msg_type,
            conteudo=conteudo,
            direcao='incoming',
            wamid=wamid,
            lead_id=lead_id,
            media_data=media_data,
            status='received'
        )
        
        # Marcar como lida
        whatsapp.mark_as_read(wamid)
        
        # Atualizar último contato do lead
        if lead_id:
            supabase.update('leads',
                           {'ultimo_contato': datetime.utcnow().isoformat()},
                           {'id': f'eq.{lead_id}'})
        
        logger.info(f'Message received from {telefone}: {conteudo[:50]}...')
        
    except Exception as e:
        logger.error(f'Error processing message: {e}')


# ============================================================
# API ENDPOINTS
# ============================================================

@app.route('/api/status', methods=['GET'])
def api_status():
    """Status da API"""
    return jsonify({
        'success': True,
        'status': 'online',
        'whatsapp_configured': bool(whatsapp.phone_number_id and whatsapp.access_token),
        'supabase_configured': bool(supabase.url and supabase.key),
        'timestamp': datetime.utcnow().isoformat()
    })


@app.route('/api/send', methods=['POST'])
def api_send_message():
    """Envia mensagem"""
    try:
        data = request.get_json()
        
        to = data.get('to')
        message_type = data.get('type', 'text')
        content = data.get('content') or data.get('message')
        
        if not to or not content:
            return jsonify({'success': False, 'error': 'Missing "to" or "content"'}), 400
        
        # Enviar baseado no tipo
        if message_type == 'text':
            result = whatsapp.send_text(to, content)
        elif message_type == 'template':
            template_name = data.get('template_name', 'hello_world')
            language = data.get('language', 'en_US')
            result = whatsapp.send_template(to, template_name, language)
        elif message_type == 'image':
            result = whatsapp.send_image(to, image_url=content, caption=data.get('caption'))
        elif message_type == 'audio':
            result = whatsapp.send_audio(to, audio_url=content)
        elif message_type == 'video':
            result = whatsapp.send_video(to, video_url=content, caption=data.get('caption'))
        elif message_type == 'document':
            result = whatsapp.send_document(to, document_url=content, 
                                           filename=data.get('filename'),
                                           caption=data.get('caption'))
        else:
            return jsonify({'success': False, 'error': f'Unknown type: {message_type}'}), 400
        
        # Salvar mensagem enviada
        if result.get('success'):
            lead_id = get_or_create_lead(to)
            save_message(
                telefone=to,
                tipo=message_type,
                conteudo=content,
                direcao='outgoing',
                wamid=result.get('message_id'),
                lead_id=lead_id,
                status='sent'
            )
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f'Send error: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/messages/<telefone>', methods=['GET'])
def api_get_messages(telefone):
    """Busca mensagens de um telefone"""
    telefone_limpo = re.sub(r'\D', '', telefone)
    
    limit = request.args.get('limit', 50, type=int)
    
    result = supabase.select(
        'mensagens',
        filters={'telefone': f'eq.{telefone_limpo}'},
        order='created_at.desc',
        limit=limit
    )
    
    if result['success']:
        # Inverter para ordem cronológica
        messages = list(reversed(result['data'] or []))
        return jsonify({'success': True, 'messages': messages})
    
    return jsonify(result)


@app.route('/api/conversations', methods=['GET'])
def api_get_conversations():
    """Lista conversas (últimas mensagens por contato)"""
    # Usar SQL direta para agregação
    result = supabase.select(
        'mensagens',
        columns='telefone,conteudo,tipo,direcao,status,created_at,lead_id',
        order='created_at.desc',
        limit=500
    )
    
    if not result['success']:
        return jsonify(result)
    
    # Agrupar por telefone
    conversations = {}
    for msg in result['data'] or []:
        tel = msg['telefone']
        if tel not in conversations:
            conversations[tel] = {
                'telefone': tel,
                'ultima_mensagem': msg['conteudo'],
                'tipo': msg['tipo'],
                'direcao': msg['direcao'],
                'status': msg['status'],
                'timestamp': msg['created_at'],
                'lead_id': msg.get('lead_id'),
                'total_mensagens': 0,
                'nao_lidas': 0
            }
        
        conversations[tel]['total_mensagens'] += 1
        if msg['direcao'] == 'incoming' and msg['status'] == 'received':
            conversations[tel]['nao_lidas'] += 1
    
    return jsonify({
        'success': True,
        'conversations': list(conversations.values())
    })


# ============================================================
# API LEADS
# ============================================================

@app.route('/api/leads', methods=['GET'])
def api_get_leads():
    """Lista leads"""
    limit = request.args.get('limit', 100, type=int)
    lote_id = request.args.get('lote_id')
    etapa = request.args.get('etapa')
    
    filters = {}
    
    if lote_id:
        filters['lote_id'] = f'eq.{lote_id}'
    
    if etapa:
        filters['etapa'] = f'eq.{etapa}'
    
    filters['arquivado'] = 'eq.false'
    
    result = supabase.select('leads', filters=filters, order='created_at.desc', limit=limit)
    
    return jsonify(result)


@app.route('/api/leads/<int:lead_id>', methods=['GET'])
def api_get_lead(lead_id):
    """Busca lead por ID"""
    result = supabase.select('leads', filters={'id': f'eq.{lead_id}'})
    
    if result['success'] and result['data']:
        return jsonify({'success': True, 'lead': result['data'][0]})
    
    return jsonify({'success': False, 'error': 'Lead not found'}), 404


@app.route('/api/leads/<int:lead_id>', methods=['PATCH'])
def api_update_lead(lead_id):
    """Atualiza lead"""
    data = request.get_json()
    
    # Campos permitidos
    allowed = ['nome', 'telefone', 'email', 'etapa', 'origem', 'notas', 'tags', 
               'lote_id', 'arquivado', 'interesse', 'responsavel']
    
    update_data = {k: v for k, v in data.items() if k in allowed}
    
    if not update_data:
        return jsonify({'success': False, 'error': 'No valid fields to update'}), 400
    
    result = supabase.update('leads', update_data, {'id': f'eq.{lead_id}'})
    
    return jsonify(result)


# ============================================================
# API LOTES
# ============================================================

@app.route('/api/lotes', methods=['GET'])
def api_get_lotes():
    """Lista lotes"""
    result = supabase.select('lotes', order='created_at.desc')
    return jsonify(result)


@app.route('/api/lotes', methods=['POST'])
def api_create_lote():
    """Cria lote"""
    data = request.get_json()
    
    lote_data = {
        'nome': data.get('nome', f'Lote {datetime.now().strftime("%d/%m/%Y %H:%M")}'),
        'descricao': data.get('descricao', ''),
        'cor': data.get('cor', '#3B82F6')
    }
    
    result = supabase.insert('lotes', lote_data)
    return jsonify(result)


# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    host = os.getenv('HOST', '0.0.0.0')
    debug = os.getenv('FLASK_DEBUG', '0') == '1'
    
    logger.info(f'Starting Smart Reforço API on {host}:{port}')
    logger.info(f'WhatsApp Phone ID: {whatsapp.phone_number_id}')
    logger.info(f'Supabase URL: {supabase.url}')
    
    app.run(host=host, port=port, debug=debug, use_reloader=False)
