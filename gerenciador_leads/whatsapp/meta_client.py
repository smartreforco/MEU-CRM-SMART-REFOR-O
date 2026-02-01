"""
Cliente WhatsApp Business Cloud API (Meta)
Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api

Limites importantes:
- Taxa de transferência: 80 mensagens/segundo por padrão
- Rate limit por usuário: 1 mensagem a cada 6 segundos para o mesmo destinatário
- Pico permitido: até 45 mensagens em 6 segundos (usa cota futura)
- Erro 131056: rate limit excedido
"""

import requests
import json
import time
import re
import os
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime


# Códigos de erro comuns da API
class ErrorCodes:
    """Códigos de erro da API WhatsApp"""
    RATE_LIMIT = 131056          # Rate limit excedido
    INVALID_PHONE = 131026       # Número de telefone inválido
    NOT_WHATSAPP_USER = 131005   # Usuário não está no WhatsApp
    MESSAGE_BLOCKED = 131047     # Mensagem bloqueada pelo usuário
    TEMPLATE_NOT_FOUND = 132000  # Template não encontrado
    MEDIA_DOWNLOAD_ERROR = 131053 # Erro ao baixar mídia
    ACCESS_TOKEN_ERROR = 190     # Token de acesso inválido


class MessageStatus(Enum):
    """Status das mensagens"""
    PENDING = "pending"      # Aguardando envio
    SENT = "sent"           # Enviada para o servidor
    DELIVERED = "delivered"  # Entregue ao destinatário
    READ = "read"           # Lida pelo destinatário
    FAILED = "failed"       # Falha no envio


class MessageType(Enum):
    """Tipos de mensagem"""
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    DOCUMENT = "document"
    STICKER = "sticker"
    LOCATION = "location"
    CONTACTS = "contacts"
    TEMPLATE = "template"
    INTERACTIVE = "interactive"


@dataclass
class SendResult:
    """Resultado do envio de mensagem"""
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None
    error_code: Optional[int] = None
    phone: Optional[str] = None
    timestamp: Optional[str] = None


@dataclass
class MessageData:
    """Dados de uma mensagem"""
    id: str
    phone: str
    type: MessageType
    content: str
    timestamp: datetime
    status: MessageStatus
    direction: str  # 'incoming' ou 'outgoing'
    media_url: Optional[str] = None
    media_mime: Optional[str] = None


class WhatsAppCloudAPI:
    """Cliente para WhatsApp Business Cloud API"""
    
    BASE_URL = "https://graph.facebook.com/v18.0"
    
    def __init__(self, phone_number_id: str, access_token: str, business_account_id: str = None):
        """
        Inicializa o cliente da API.
        
        Args:
            phone_number_id: ID do número de telefone do WhatsApp Business
            access_token: Token de acesso da API (permanente)
            business_account_id: ID da conta WhatsApp Business (opcional)
        """
        self.phone_number_id = phone_number_id
        self.access_token = access_token
        self.business_account_id = business_account_id
        
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        self.messages_url = f"{self.BASE_URL}/{phone_number_id}/messages"
        self.media_url = f"{self.BASE_URL}/{phone_number_id}/media"
    
    def _format_phone(self, phone: str) -> str:
        """
        Formata o telefone para o padrão internacional.
        Remove caracteres especiais e adiciona código do país se necessário.
        """
        # Remove tudo que não é dígito
        numbers = re.sub(r'\D', '', str(phone))
        
        # Remove zeros à esquerda
        numbers = numbers.lstrip('0')
        
        # Se começar com 55 e tiver mais de 11 dígitos, já está formatado
        if numbers.startswith('55') and len(numbers) >= 12:
            return numbers
        
        # Se tiver 10 ou 11 dígitos (DDD + número), adiciona 55
        if len(numbers) >= 10:
            return f"55{numbers}"
        
        return numbers
    
    def _make_request(self, method: str, url: str, data: dict = None, 
                      max_retries: int = 3) -> Tuple[bool, dict]:
        """
        Faz uma requisição à API com retry e backoff exponencial.
        
        Conforme documentação:
        - Se falhar por rate limit (131056), retry após 4^X segundos
        """
        last_error = None
        
        for attempt in range(max_retries):
            try:
                if method == "GET":
                    response = requests.get(url, headers=self.headers, timeout=30)
                elif method == "POST":
                    response = requests.post(url, headers=self.headers, json=data, timeout=30)
                elif method == "DELETE":
                    response = requests.delete(url, headers=self.headers, timeout=30)
                else:
                    return False, {"error": f"Método {method} não suportado"}
                
                result = response.json() if response.text else {}
                
                if response.status_code in [200, 201]:
                    return True, result
                else:
                    error_data = result.get('error', {})
                    error_code = error_data.get('code', 0)
                    error_msg = error_data.get('message', response.text[:200])
                    
                    # Rate limit - aplicar backoff exponencial
                    if error_code == ErrorCodes.RATE_LIMIT:
                        wait_time = 4 ** attempt  # 1, 4, 16 segundos
                        print(f"[API] Rate limit atingido. Aguardando {wait_time}s...")
                        time.sleep(wait_time)
                        continue
                    
                    return False, {
                        "error": error_msg, 
                        "error_code": error_code,
                        "status_code": response.status_code
                    }
                    
            except requests.exceptions.Timeout:
                last_error = {"error": "Timeout na requisição", "error_code": -1}
                time.sleep(2 ** attempt)
            except requests.exceptions.RequestException as e:
                last_error = {"error": str(e), "error_code": -2}
                time.sleep(2 ** attempt)
            except Exception as e:
                last_error = {"error": str(e), "error_code": -3}
                break
        
        return False, last_error or {"error": "Falha após várias tentativas"}
    
    # ==================== ENVIO DE MENSAGENS ====================
    
    def send_text(self, to: str, message: str, preview_url: bool = False) -> SendResult:
        """
        Envia uma mensagem de texto.
        
        Args:
            to: Número de telefone do destinatário
            message: Texto da mensagem
            preview_url: Se True, gera preview de links na mensagem
        """
        phone = self._format_phone(to)
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": {
                "preview_url": preview_url,
                "body": message
            }
        }
        
        success, result = self._make_request("POST", self.messages_url, payload)
        
        if success:
            msg_id = result.get('messages', [{}])[0].get('id')
            return SendResult(
                success=True,
                message_id=msg_id,
                phone=phone,
                timestamp=datetime.now().isoformat()
            )
        else:
            return SendResult(
                success=False,
                error=result.get('error', 'Erro desconhecido'),
                error_code=result.get('error_code'),
                phone=phone
            )
    
    def send_image(self, to: str, image_url: str = None, image_id: str = None, 
                   caption: str = None) -> SendResult:
        """
        Envia uma imagem.
        
        Args:
            to: Número do destinatário
            image_url: URL pública da imagem (ou)
            image_id: ID de mídia já enviada para a API
            caption: Legenda opcional
        """
        phone = self._format_phone(to)
        
        image_data = {}
        if image_id:
            image_data["id"] = image_id
        elif image_url:
            image_data["link"] = image_url
        else:
            return SendResult(success=False, error="Forneça image_url ou image_id", phone=phone)
        
        if caption:
            image_data["caption"] = caption
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "image",
            "image": image_data
        }
        
        success, result = self._make_request("POST", self.messages_url, payload)
        
        if success:
            msg_id = result.get('messages', [{}])[0].get('id')
            return SendResult(success=True, message_id=msg_id, phone=phone, 
                            timestamp=datetime.now().isoformat())
        else:
            return SendResult(success=False, error=result.get('error'), phone=phone)
    
    def send_video(self, to: str, video_url: str = None, video_id: str = None,
                   caption: str = None) -> SendResult:
        """Envia um vídeo."""
        phone = self._format_phone(to)
        
        video_data = {}
        if video_id:
            video_data["id"] = video_id
        elif video_url:
            video_data["link"] = video_url
        else:
            return SendResult(success=False, error="Forneça video_url ou video_id", phone=phone)
        
        if caption:
            video_data["caption"] = caption
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "video",
            "video": video_data
        }
        
        success, result = self._make_request("POST", self.messages_url, payload)
        
        if success:
            msg_id = result.get('messages', [{}])[0].get('id')
            return SendResult(success=True, message_id=msg_id, phone=phone,
                            timestamp=datetime.now().isoformat())
        else:
            return SendResult(success=False, error=result.get('error'), phone=phone)
    
    def send_audio(self, to: str, audio_url: str = None, audio_id: str = None) -> SendResult:
        """Envia um áudio."""
        phone = self._format_phone(to)
        
        audio_data = {}
        if audio_id:
            audio_data["id"] = audio_id
        elif audio_url:
            audio_data["link"] = audio_url
        else:
            return SendResult(success=False, error="Forneça audio_url ou audio_id", phone=phone)
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "audio",
            "audio": audio_data
        }
        
        success, result = self._make_request("POST", self.messages_url, payload)
        
        if success:
            msg_id = result.get('messages', [{}])[0].get('id')
            return SendResult(success=True, message_id=msg_id, phone=phone,
                            timestamp=datetime.now().isoformat())
        else:
            return SendResult(success=False, error=result.get('error'), phone=phone)
    
    def send_document(self, to: str, document_url: str = None, document_id: str = None,
                      filename: str = None, caption: str = None) -> SendResult:
        """Envia um documento."""
        phone = self._format_phone(to)
        
        doc_data = {}
        if document_id:
            doc_data["id"] = document_id
        elif document_url:
            doc_data["link"] = document_url
        else:
            return SendResult(success=False, error="Forneça document_url ou document_id", phone=phone)
        
        if filename:
            doc_data["filename"] = filename
        if caption:
            doc_data["caption"] = caption
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "document",
            "document": doc_data
        }
        
        success, result = self._make_request("POST", self.messages_url, payload)
        
        if success:
            msg_id = result.get('messages', [{}])[0].get('id')
            return SendResult(success=True, message_id=msg_id, phone=phone,
                            timestamp=datetime.now().isoformat())
        else:
            return SendResult(success=False, error=result.get('error'), phone=phone)
    
    def send_location(self, to: str, latitude: float, longitude: float,
                      name: str = None, address: str = None) -> SendResult:
        """Envia uma localização."""
        phone = self._format_phone(to)
        
        location_data = {
            "latitude": latitude,
            "longitude": longitude
        }
        if name:
            location_data["name"] = name
        if address:
            location_data["address"] = address
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "location",
            "location": location_data
        }
        
        success, result = self._make_request("POST", self.messages_url, payload)
        
        if success:
            msg_id = result.get('messages', [{}])[0].get('id')
            return SendResult(success=True, message_id=msg_id, phone=phone,
                            timestamp=datetime.now().isoformat())
        else:
            return SendResult(success=False, error=result.get('error'), phone=phone)
    
    def send_template(self, to: str, template_name: str, language_code: str = "pt_BR",
                      components: List[dict] = None) -> SendResult:
        """
        Envia uma mensagem de template (necessário para iniciar conversas).
        
        Args:
            to: Número do destinatário
            template_name: Nome do template aprovado
            language_code: Código do idioma (pt_BR, en_US, etc.)
            components: Componentes do template (header, body, button variables)
        """
        phone = self._format_phone(to)
        
        template_data = {
            "name": template_name,
            "language": {
                "code": language_code
            }
        }
        
        if components:
            template_data["components"] = components
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "template",
            "template": template_data
        }
        
        success, result = self._make_request("POST", self.messages_url, payload)
        
        if success:
            msg_id = result.get('messages', [{}])[0].get('id')
            return SendResult(success=True, message_id=msg_id, phone=phone,
                            timestamp=datetime.now().isoformat())
        else:
            return SendResult(success=False, error=result.get('error'), phone=phone)
    
    def send_interactive_buttons(self, to: str, body_text: str, buttons: List[dict],
                                  header: str = None, footer: str = None) -> SendResult:
        """
        Envia mensagem interativa com botões.
        
        Args:
            to: Número do destinatário
            body_text: Texto principal
            buttons: Lista de botões [{"id": "btn1", "title": "Opção 1"}, ...]
            header: Texto do cabeçalho (opcional)
            footer: Texto do rodapé (opcional)
        """
        phone = self._format_phone(to)
        
        interactive_data = {
            "type": "button",
            "body": {"text": body_text},
            "action": {
                "buttons": [
                    {"type": "reply", "reply": {"id": btn["id"], "title": btn["title"]}}
                    for btn in buttons[:3]  # Máximo 3 botões
                ]
            }
        }
        
        if header:
            interactive_data["header"] = {"type": "text", "text": header}
        if footer:
            interactive_data["footer"] = {"text": footer}
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "interactive",
            "interactive": interactive_data
        }
        
        success, result = self._make_request("POST", self.messages_url, payload)
        
        if success:
            msg_id = result.get('messages', [{}])[0].get('id')
            return SendResult(success=True, message_id=msg_id, phone=phone,
                            timestamp=datetime.now().isoformat())
        else:
            return SendResult(success=False, error=result.get('error'), phone=phone)
    
    def send_interactive_list(self, to: str, body_text: str, button_text: str,
                               sections: List[dict], header: str = None, 
                               footer: str = None) -> SendResult:
        """
        Envia mensagem interativa com lista.
        
        Args:
            to: Número do destinatário
            body_text: Texto principal
            button_text: Texto do botão que abre a lista
            sections: Seções da lista [{"title": "Seção", "rows": [{"id": "1", "title": "Item", "description": "Desc"}]}]
        """
        phone = self._format_phone(to)
        
        interactive_data = {
            "type": "list",
            "body": {"text": body_text},
            "action": {
                "button": button_text,
                "sections": sections
            }
        }
        
        if header:
            interactive_data["header"] = {"type": "text", "text": header}
        if footer:
            interactive_data["footer"] = {"text": footer}
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "interactive",
            "interactive": interactive_data
        }
        
        success, result = self._make_request("POST", self.messages_url, payload)
        
        if success:
            msg_id = result.get('messages', [{}])[0].get('id')
            return SendResult(success=True, message_id=msg_id, phone=phone,
                            timestamp=datetime.now().isoformat())
        else:
            return SendResult(success=False, error=result.get('error'), phone=phone)
    
    def mark_as_read(self, message_id: str) -> bool:
        """Marca uma mensagem como lida."""
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id
        }
        
        success, _ = self._make_request("POST", self.messages_url, payload)
        return success
    
    # ==================== MÍDIA ====================
    
    def upload_media(self, file_path: str, mime_type: str) -> Optional[str]:
        """
        Faz upload de um arquivo de mídia para a API.
        Retorna o media_id para usar no envio.
        """
        try:
            with open(file_path, 'rb') as f:
                files = {
                    'file': (os.path.basename(file_path), f, mime_type),
                    'messaging_product': (None, 'whatsapp'),
                    'type': (None, mime_type)
                }
                
                headers = {"Authorization": f"Bearer {self.access_token}"}
                response = requests.post(self.media_url, headers=headers, files=files, timeout=60)
                
                if response.status_code == 200:
                    return response.json().get('id')
                else:
                    return None
        except Exception as e:
            print(f"Erro no upload: {e}")
            return None
    
    def get_media_url(self, media_id: str) -> Optional[str]:
        """Obtém a URL de download de uma mídia."""
        url = f"{self.BASE_URL}/{media_id}"
        success, result = self._make_request("GET", url)
        
        if success:
            return result.get('url')
        return None
    
    def download_media(self, media_url: str, save_path: str) -> bool:
        """Baixa uma mídia da API."""
        try:
            response = requests.get(
                media_url,
                headers={"Authorization": f"Bearer {self.access_token}"},
                timeout=60
            )
            
            if response.status_code == 200:
                with open(save_path, 'wb') as f:
                    f.write(response.content)
                return True
            return False
        except Exception as e:
            print(f"Erro no download: {e}")
            return False
    
    # ==================== INFORMAÇÕES ====================
    
    def get_phone_info(self) -> dict:
        """
        Obtém informações do número de telefone.
        
        Retorna campos como:
        - verified_name: Nome verificado
        - code_verification_status: Status da verificação
        - display_phone_number: Número de exibição
        - quality_rating: GREEN, YELLOW, RED
        - platform_type: CLOUD_API
        - throughput: Nível de taxa de transferência
        """
        url = f"{self.BASE_URL}/{self.phone_number_id}"
        params = "?fields=verified_name,code_verification_status,display_phone_number,quality_rating,platform_type,throughput,id"
        success, result = self._make_request("GET", url + params)
        
        if success:
            return result
        return {}
    
    def check_connection(self) -> dict:
        """
        Verifica a conexão com a API.
        Útil para testar se as credenciais estão corretas.
        
        Returns:
            dict com 'connected', 'phone_number', 'quality_rating', 'error'
        """
        try:
            info = self.get_phone_info()
            if info.get('id'):
                return {
                    'connected': True,
                    'phone_number_id': info.get('id'),
                    'display_phone_number': info.get('display_phone_number'),
                    'verified_name': info.get('verified_name'),
                    'quality_rating': info.get('quality_rating'),
                    'platform_type': info.get('platform_type'),
                    'throughput': info.get('throughput', {}).get('level', 'UNKNOWN'),
                    'error': None
                }
            else:
                return {
                    'connected': False,
                    'error': 'Não foi possível obter informações do número'
                }
        except Exception as e:
            return {
                'connected': False,
                'error': str(e)
            }
    
    def get_business_profile(self) -> dict:
        """Obtém o perfil comercial."""
        url = f"{self.BASE_URL}/{self.phone_number_id}/whatsapp_business_profile"
        params = "?fields=about,address,description,email,profile_picture_url,websites,vertical"
        success, result = self._make_request("GET", url + params)
        
        if success:
            return result.get('data', [{}])[0]
        return {}
    
    def update_business_profile(self, about: str = None, address: str = None,
                                 description: str = None, email: str = None,
                                 websites: List[str] = None, vertical: str = None) -> bool:
        """Atualiza o perfil comercial."""
        url = f"{self.BASE_URL}/{self.phone_number_id}/whatsapp_business_profile"
        
        payload = {"messaging_product": "whatsapp"}
        if about:
            payload["about"] = about
        if address:
            payload["address"] = address
        if description:
            payload["description"] = description
        if email:
            payload["email"] = email
        if websites:
            payload["websites"] = websites
        if vertical:
            payload["vertical"] = vertical
        
        success, _ = self._make_request("POST", url, payload)
        return success
    
    # ==================== TEMPLATES ====================
    
    def get_templates(self) -> List[dict]:
        """Lista os templates de mensagem aprovados."""
        if not self.business_account_id:
            return []
        
        url = f"{self.BASE_URL}/{self.business_account_id}/message_templates"
        success, result = self._make_request("GET", url)
        
        if success:
            return result.get('data', [])
        return []
    
    # ==================== WEBHOOK PROCESSING ====================
    
    @staticmethod
    def parse_webhook(data: dict) -> List[dict]:
        """
        Processa dados recebidos via webhook.
        Retorna lista de mensagens/eventos processados.
        """
        events = []
        
        try:
            entry = data.get('entry', [])
            for e in entry:
                changes = e.get('changes', [])
                for change in changes:
                    value = change.get('value', {})
                    
                    # Mensagens recebidas
                    messages = value.get('messages', [])
                    for msg in messages:
                        event = {
                            'type': 'message',
                            'message_id': msg.get('id'),
                            'from': msg.get('from'),
                            'timestamp': msg.get('timestamp'),
                            'message_type': msg.get('type'),
                        }
                        
                        # Extrair conteúdo baseado no tipo
                        msg_type = msg.get('type')
                        if msg_type == 'text':
                            event['content'] = msg.get('text', {}).get('body', '')
                        elif msg_type == 'image':
                            event['media_id'] = msg.get('image', {}).get('id')
                            event['caption'] = msg.get('image', {}).get('caption', '')
                            event['mime_type'] = msg.get('image', {}).get('mime_type')
                        elif msg_type == 'video':
                            event['media_id'] = msg.get('video', {}).get('id')
                            event['caption'] = msg.get('video', {}).get('caption', '')
                            event['mime_type'] = msg.get('video', {}).get('mime_type')
                        elif msg_type == 'audio':
                            event['media_id'] = msg.get('audio', {}).get('id')
                            event['mime_type'] = msg.get('audio', {}).get('mime_type')
                        elif msg_type == 'document':
                            event['media_id'] = msg.get('document', {}).get('id')
                            event['filename'] = msg.get('document', {}).get('filename')
                            event['mime_type'] = msg.get('document', {}).get('mime_type')
                        elif msg_type == 'location':
                            loc = msg.get('location', {})
                            event['latitude'] = loc.get('latitude')
                            event['longitude'] = loc.get('longitude')
                            event['name'] = loc.get('name')
                            event['address'] = loc.get('address')
                        elif msg_type == 'interactive':
                            interactive = msg.get('interactive', {})
                            int_type = interactive.get('type')
                            if int_type == 'button_reply':
                                event['button_id'] = interactive.get('button_reply', {}).get('id')
                                event['button_title'] = interactive.get('button_reply', {}).get('title')
                            elif int_type == 'list_reply':
                                event['list_id'] = interactive.get('list_reply', {}).get('id')
                                event['list_title'] = interactive.get('list_reply', {}).get('title')
                        
                        # Contato do remetente
                        contacts = value.get('contacts', [])
                        if contacts:
                            event['contact_name'] = contacts[0].get('profile', {}).get('name', '')
                            event['wa_id'] = contacts[0].get('wa_id', '')
                        
                        events.append(event)
                    
                    # Status de mensagens enviadas
                    statuses = value.get('statuses', [])
                    for status in statuses:
                        event = {
                            'type': 'status',
                            'message_id': status.get('id'),
                            'status': status.get('status'),  # sent, delivered, read, failed
                            'timestamp': status.get('timestamp'),
                            'recipient': status.get('recipient_id'),
                        }
                        
                        # Erros
                        errors = status.get('errors', [])
                        if errors:
                            event['error_code'] = errors[0].get('code')
                            event['error_message'] = errors[0].get('message')
                        
                        events.append(event)
        
        except Exception as e:
            print(f"Erro ao processar webhook: {e}")
        
        return events
    
    @staticmethod
    def verify_webhook(mode: str, token: str, challenge: str, verify_token: str) -> Optional[str]:
        """
        Verifica a inscrição do webhook.
        
        Args:
            mode: hub.mode do request
            token: hub.verify_token do request
            challenge: hub.challenge do request
            verify_token: Seu token de verificação configurado
        
        Returns:
            O challenge se válido, None caso contrário
        """
        if mode == "subscribe" and token == verify_token:
            return challenge
        return None
