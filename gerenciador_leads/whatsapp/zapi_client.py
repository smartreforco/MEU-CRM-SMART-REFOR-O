"""
Cliente Z-API para envio de mensagens WhatsApp
Documentação: https://developer.z-api.io/
"""

import requests
import time
import re
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass
from enum import Enum


class MessageStatus(Enum):
    PENDING = "pendente"
    SENT = "enviado"
    DELIVERED = "entregue"
    READ = "lido"
    FAILED = "falhou"


@dataclass
class SendResult:
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None
    phone: Optional[str] = None


class ZAPIClient:
    """Cliente para interagir com a Z-API"""
    
    def __init__(self, instance_id: str, token: str, client_token: str = None):
        self.instance_id = instance_id
        self.token = token
        self.client_token = client_token
        self.base_url = f"https://api.z-api.io/instances/{instance_id}/token/{token}"
        
        # Headers - Client-Token é opcional mas recomendado para segurança
        self.headers = {
            "Content-Type": "application/json"
        }
        if client_token:
            self.headers["Client-Token"] = client_token
    
    def _formatar_telefone(self, telefone: str) -> str:
        """
        Formata o telefone para o padrão internacional brasileiro.
        Remove caracteres especiais e adiciona código do país se necessário.
        """
        # Remove tudo que não é dígito
        numeros = re.sub(r'\D', '', str(telefone))
        
        # Remove zeros à esquerda
        numeros = numeros.lstrip('0')
        
        # Se começar com 55 e tiver mais de 11 dígitos, já está no formato internacional
        if numeros.startswith('55') and len(numeros) >= 12:
            return numeros
        
        # Se tiver 10 ou 11 dígitos (DDD + número), adiciona 55
        if len(numeros) >= 10:
            return f"55{numeros}"
        
        return numeros
    
    def verificar_conexao(self) -> Dict:
        """
        Verifica se a instância está conectada ao WhatsApp.
        Endpoint: GET /status
        Documentação: https://developer.z-api.io/instance/status
        """
        try:
            url = f"{self.base_url}/status"
            response = requests.get(url, headers=self.headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                # Campos retornados: connected, smartphoneConnected, error
                connected = data.get('connected', False)
                smartphone_connected = data.get('smartphoneConnected', False)
                error_msg = data.get('error', '')
                
                return {
                    "connected": connected,
                    "smartphoneConnected": smartphone_connected,
                    "error": error_msg if error_msg else None,
                    "raw": data
                }
            else:
                # Tentar extrair mensagem de erro
                try:
                    error_data = response.json()
                    error_msg = error_data.get('error', error_data.get('message', response.text[:200]))
                except:
                    error_msg = response.text[:200] if response.text else f"HTTP {response.status_code}"
                
                return {
                    "connected": False,
                    "error": error_msg
                }
            
        except Exception as e:
            return {
                "connected": False,
                "error": str(e)
            }
    
    def verificar_numero(self, telefone: str) -> Tuple[bool, str]:
        """
        Verifica se um número tem WhatsApp.
        Retorna (tem_whatsapp, numero_formatado)
        """
        try:
            numero = self._formatar_telefone(telefone)
            url = f"{self.base_url}/phone-exists/{numero}"
            response = requests.get(url, headers=self.headers, timeout=10)
            data = response.json()
            
            exists = data.get("exists", False)
            return exists, numero
        except Exception as e:
            return False, str(e)
    
    def enviar_texto(self, telefone: str, mensagem: str) -> SendResult:
        """Envia uma mensagem de texto simples"""
        try:
            numero = self._formatar_telefone(telefone)
            url = f"{self.base_url}/send-text"
            
            payload = {
                "phone": numero,
                "message": mensagem
            }
            
            response = requests.post(url, json=payload, headers=self.headers, timeout=30)
            data = response.json()
            
            if response.status_code == 200 and data.get("zapiMessageId"):
                return SendResult(
                    success=True,
                    message_id=data.get("zapiMessageId"),
                    phone=numero
                )
            else:
                return SendResult(
                    success=False,
                    error=data.get("message", "Erro desconhecido"),
                    phone=numero
                )
                
        except Exception as e:
            return SendResult(
                success=False,
                error=str(e),
                phone=telefone
            )
    
    def enviar_imagem(self, telefone: str, url_imagem: str, caption: str = "") -> SendResult:
        """Envia uma imagem com legenda opcional"""
        try:
            numero = self._formatar_telefone(telefone)
            url = f"{self.base_url}/send-image"
            
            payload = {
                "phone": numero,
                "image": url_imagem,
                "caption": caption
            }
            
            response = requests.post(url, json=payload, headers=self.headers, timeout=30)
            data = response.json()
            
            if response.status_code == 200 and data.get("zapiMessageId"):
                return SendResult(
                    success=True,
                    message_id=data.get("zapiMessageId"),
                    phone=numero
                )
            else:
                return SendResult(
                    success=False,
                    error=data.get("message", "Erro desconhecido"),
                    phone=numero
                )
                
        except Exception as e:
            return SendResult(
                success=False,
                error=str(e),
                phone=telefone
            )
    
    def enviar_video(self, telefone: str, url_video: str, caption: str = "") -> SendResult:
        """Envia um vídeo com legenda opcional"""
        try:
            numero = self._formatar_telefone(telefone)
            url = f"{self.base_url}/send-video"
            
            payload = {
                "phone": numero,
                "video": url_video,
                "caption": caption
            }
            
            response = requests.post(url, json=payload, headers=self.headers, timeout=60)
            data = response.json()
            
            if response.status_code == 200 and data.get("zapiMessageId"):
                return SendResult(
                    success=True,
                    message_id=data.get("zapiMessageId"),
                    phone=numero
                )
            else:
                return SendResult(
                    success=False,
                    error=data.get("message", "Erro desconhecido"),
                    phone=numero
                )
                
        except Exception as e:
            return SendResult(
                success=False,
                error=str(e),
                phone=telefone
            )
    
    def enviar_documento(self, telefone: str, url_documento: str, nome_arquivo: str) -> SendResult:
        """Envia um documento/arquivo"""
        try:
            numero = self._formatar_telefone(telefone)
            url = f"{self.base_url}/send-document/{numero}"
            
            payload = {
                "document": url_documento,
                "fileName": nome_arquivo
            }
            
            response = requests.post(url, json=payload, headers=self.headers, timeout=30)
            data = response.json()
            
            if response.status_code == 200 and data.get("zapiMessageId"):
                return SendResult(
                    success=True,
                    message_id=data.get("zapiMessageId"),
                    phone=numero
                )
            else:
                return SendResult(
                    success=False,
                    error=data.get("message", "Erro desconhecido"),
                    phone=numero
                )
                
        except Exception as e:
            return SendResult(
                success=False,
                error=str(e),
                phone=telefone
            )
    
    def enviar_link(self, telefone: str, mensagem: str, url_link: str, titulo: str = "", descricao: str = "", imagem: str = "") -> SendResult:
        """Envia uma mensagem com link e preview"""
        try:
            numero = self._formatar_telefone(telefone)
            url = f"{self.base_url}/send-link"
            
            payload = {
                "phone": numero,
                "message": mensagem,
                "image": imagem,
                "linkUrl": url_link,
                "title": titulo,
                "linkDescription": descricao
            }
            
            response = requests.post(url, json=payload, headers=self.headers, timeout=30)
            data = response.json()
            
            if response.status_code == 200 and data.get("zapiMessageId"):
                return SendResult(
                    success=True,
                    message_id=data.get("zapiMessageId"),
                    phone=numero
                )
            else:
                return SendResult(
                    success=False,
                    error=data.get("message", "Erro desconhecido"),
                    phone=numero
                )
                
        except Exception as e:
            return SendResult(
                success=False,
                error=str(e),
                phone=telefone
            )
    
    def enviar_em_massa(self, contatos: List[Dict], mensagem_template: str, 
                         intervalo_min: int = 30, intervalo_max: int = 60,
                         callback=None) -> List[SendResult]:
        """
        Envia mensagens em massa para uma lista de contatos.
        
        Args:
            contatos: Lista de dicts com 'telefone', 'nome', 'cidade', etc.
            mensagem_template: Template da mensagem com variáveis {nome}, {cidade}
            intervalo_min: Intervalo mínimo entre mensagens (segundos)
            intervalo_max: Intervalo máximo entre mensagens (segundos)
            callback: Função chamada após cada envio (progress, total, result)
        
        Returns:
            Lista de SendResult com resultado de cada envio
        """
        import random
        
        resultados = []
        total = len(contatos)
        
        for i, contato in enumerate(contatos):
            # Formatar mensagem com dados do contato
            try:
                mensagem = mensagem_template.format(
                    nome=contato.get('nome', 'Cliente'),
                    cidade=contato.get('cidade', ''),
                    telefone=contato.get('telefone', ''),
                    endereco=contato.get('endereco', ''),
                    tipo_servico=contato.get('tipo_servico', '')
                )
            except KeyError:
                mensagem = mensagem_template
            
            # Enviar mensagem
            resultado = self.enviar_texto(contato.get('telefone', ''), mensagem)
            resultado.phone = contato.get('telefone', '')
            resultados.append(resultado)
            
            # Callback de progresso
            if callback:
                callback(i + 1, total, resultado)
            
            # Aguardar intervalo aleatório (exceto no último)
            if i < total - 1:
                intervalo = random.randint(intervalo_min, intervalo_max)
                time.sleep(intervalo)
        
        return resultados
    
    def obter_qrcode(self) -> Dict:
        """Obtém o QR Code para conexão (se desconectado)"""
        try:
            url = f"{self.base_url}/qr-code/image"
            response = requests.get(url, headers=self.headers, timeout=10)
            
            if response.status_code == 200:
                return {
                    "success": True,
                    "qrcode": response.json().get("value")
                }
            else:
                return {
                    "success": False,
                    "error": "Não foi possível obter o QR Code"
                }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def desconectar(self) -> Dict:
        """Desconecta a sessão do WhatsApp"""
        try:
            url = f"{self.base_url}/disconnect"
            response = requests.get(url, headers=self.headers, timeout=10)
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def reiniciar(self) -> Dict:
        """Reinicia a instância"""
        try:
            url = f"{self.base_url}/restart"
            response = requests.get(url, headers=self.headers, timeout=10)
            return response.json()
        except Exception as e:
            return {"error": str(e)}
