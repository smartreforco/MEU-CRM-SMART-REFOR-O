"""
Cliente Ollama para Bot IA Local
Modelos recomendados para 8GB RAM:
- mistral (7B Q4) - ~4GB RAM - Melhor qualidade
- phi (2.7B) - ~3GB RAM - Rápido e eficiente
- gemma:2b - ~2GB RAM - Leve
- tinyllama (1.1B) - ~1GB RAM - Ultra leve
- llama2:7b-q4 - ~4GB RAM - Clássico

Instalação Ollama:
1. Baixar: https://ollama.ai/download
2. Instalar e executar
3. Baixar modelo: ollama pull mistral
"""

import requests
import json
from typing import Optional, List, Dict, Generator
from dataclasses import dataclass
from datetime import datetime


@dataclass
class ChatMessage:
    """Mensagem do chat"""
    role: str  # 'system', 'user', 'assistant'
    content: str


@dataclass
class BotResponse:
    """Resposta do Bot"""
    success: bool
    message: str
    tokens_used: int = 0
    model: str = ""
    error: Optional[str] = None
    response_time: float = 0


class OllamaClient:
    """Cliente para Ollama API local"""
    
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url.rstrip('/')
        self.timeout = 120  # 2 minutos para modelos grandes
    
    def is_available(self) -> bool:
        """Verifica se Ollama está rodando"""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except:
            return False
    
    def list_models(self) -> List[Dict]:
        """Lista modelos disponíveis localmente"""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=10)
            if response.status_code == 200:
                data = response.json()
                return data.get('models', [])
            return []
        except:
            return []
    
    def get_model_info(self, model: str) -> Dict:
        """Obtém informações de um modelo"""
        try:
            response = requests.post(
                f"{self.base_url}/api/show",
                json={"name": model},
                timeout=10
            )
            if response.status_code == 200:
                return response.json()
            return {}
        except:
            return {}
    
    def pull_model(self, model: str) -> bool:
        """Baixa um modelo (pode demorar)"""
        try:
            response = requests.post(
                f"{self.base_url}/api/pull",
                json={"name": model},
                timeout=3600,  # 1 hora para downloads grandes
                stream=True
            )
            return response.status_code == 200
        except:
            return False
    
    def generate(self, model: str, prompt: str, 
                 system: str = None,
                 temperature: float = 0.7,
                 max_tokens: int = 500,
                 context: List[int] = None) -> BotResponse:
        """
        Gera uma resposta simples (sem chat history).
        Útil para respostas rápidas.
        """
        start_time = datetime.now()
        
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        
        if system:
            payload["system"] = system
        
        if context:
            payload["context"] = context
        
        try:
            response = requests.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=self.timeout
            )
            
            response_time = (datetime.now() - start_time).total_seconds()
            
            if response.status_code == 200:
                data = response.json()
                return BotResponse(
                    success=True,
                    message=data.get('response', ''),
                    tokens_used=data.get('eval_count', 0),
                    model=model,
                    response_time=response_time
                )
            else:
                return BotResponse(
                    success=False,
                    message='',
                    error=f"Erro {response.status_code}: {response.text[:200]}"
                )
        
        except requests.exceptions.Timeout:
            return BotResponse(
                success=False,
                message='',
                error="Timeout - modelo demorou muito para responder"
            )
        except requests.exceptions.ConnectionError:
            return BotResponse(
                success=False,
                message='',
                error="Ollama não está rodando. Execute 'ollama serve'"
            )
        except Exception as e:
            return BotResponse(
                success=False,
                message='',
                error=str(e)
            )
    
    def chat(self, model: str, messages: List[ChatMessage],
             temperature: float = 0.7,
             max_tokens: int = 500) -> BotResponse:
        """
        Chat com histórico de mensagens.
        Mantém contexto da conversa.
        """
        start_time = datetime.now()
        
        # Converter para formato Ollama
        formatted_messages = [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]
        
        payload = {
            "model": model,
            "messages": formatted_messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=self.timeout
            )
            
            response_time = (datetime.now() - start_time).total_seconds()
            
            if response.status_code == 200:
                data = response.json()
                message = data.get('message', {})
                return BotResponse(
                    success=True,
                    message=message.get('content', ''),
                    tokens_used=data.get('eval_count', 0),
                    model=model,
                    response_time=response_time
                )
            else:
                return BotResponse(
                    success=False,
                    message='',
                    error=f"Erro {response.status_code}: {response.text[:200]}"
                )
        
        except requests.exceptions.Timeout:
            return BotResponse(
                success=False,
                message='',
                error="Timeout - modelo demorou muito para responder"
            )
        except requests.exceptions.ConnectionError:
            return BotResponse(
                success=False,
                message='',
                error="Ollama não está rodando. Execute 'ollama serve'"
            )
        except Exception as e:
            return BotResponse(
                success=False,
                message='',
                error=str(e)
            )
    
    def chat_stream(self, model: str, messages: List[ChatMessage],
                    temperature: float = 0.7,
                    max_tokens: int = 500) -> Generator[str, None, None]:
        """
        Chat com streaming (para UI em tempo real).
        Retorna um generator com pedaços da resposta.
        """
        formatted_messages = [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]
        
        payload = {
            "model": model,
            "messages": formatted_messages,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=self.timeout,
                stream=True
            )
            
            if response.status_code == 200:
                for line in response.iter_lines():
                    if line:
                        data = json.loads(line)
                        message = data.get('message', {})
                        content = message.get('content', '')
                        if content:
                            yield content
                        if data.get('done', False):
                            break
        except Exception as e:
            yield f"[ERRO: {str(e)}]"


class SmartBot:
    """Bot inteligente com personalidade e contexto"""
    
    def __init__(self, ollama_client: OllamaClient):
        self.client = ollama_client
        self.model = "mistral"
        self.temperature = 0.7
        self.max_tokens = 500
        self.system_prompt = ""
        self.max_history = 10  # Últimas N mensagens para contexto
    
    def set_personality(self, system_prompt: str):
        """Define a personalidade/contexto do bot"""
        self.system_prompt = system_prompt
    
    def set_model(self, model: str, temperature: float = 0.7, max_tokens: int = 500):
        """Configura o modelo"""
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
    
    def get_response(self, user_message: str, 
                     conversation_history: List[Dict] = None,
                     contact_name: str = None) -> BotResponse:
        """
        Gera uma resposta para a mensagem do usuário.
        
        Args:
            user_message: Mensagem do usuário
            conversation_history: Histórico de mensagens [{'role': 'user/assistant', 'content': '...'}]
            contact_name: Nome do contato (para personalização)
        """
        messages = []
        
        # Adicionar system prompt (personalidade)
        system = self.system_prompt
        if contact_name:
            system += f"\n\nO cliente se chama: {contact_name}"
        
        messages.append(ChatMessage(role="system", content=system))
        
        # Adicionar histórico de conversa (últimas N mensagens)
        if conversation_history:
            for msg in conversation_history[-self.max_history:]:
                messages.append(ChatMessage(
                    role=msg.get('role', 'user'),
                    content=msg.get('content', '')
                ))
        
        # Adicionar mensagem atual
        messages.append(ChatMessage(role="user", content=user_message))
        
        # Gerar resposta
        return self.client.chat(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens
        )
    
    def check_quick_response(self, message: str, quick_responses: List[Dict]) -> Optional[str]:
        """
        Verifica se há uma resposta rápida configurada para a mensagem.
        
        Args:
            message: Mensagem do usuário
            quick_responses: Lista de respostas rápidas do banco
                [{'gatilho': '...', 'resposta': '...', 'tipo': 'contem/exato/regex'}]
        """
        message_lower = message.lower().strip()
        
        for qr in quick_responses:
            gatilho = qr.get('gatilho', '').lower()
            tipo = qr.get('tipo', 'contem')
            
            if tipo == 'exato' and message_lower == gatilho:
                return qr.get('resposta')
            elif tipo == 'contem' and gatilho in message_lower:
                return qr.get('resposta')
            elif tipo == 'comeca' and message_lower.startswith(gatilho):
                return qr.get('resposta')
        
        return None


# Modelos recomendados por uso de RAM
MODELOS_RECOMENDADOS = {
    "ultra_leve": {
        "nome": "tinyllama",
        "ram": "~1GB",
        "descricao": "Ultra leve, respostas básicas"
    },
    "leve": {
        "nome": "gemma:2b",
        "ram": "~2GB", 
        "descricao": "Leve e rápido, bom para FAQs"
    },
    "medio": {
        "nome": "phi",
        "ram": "~3GB",
        "descricao": "Boa qualidade, eficiente"
    },
    "padrao": {
        "nome": "mistral",
        "ram": "~4GB",
        "descricao": "Melhor qualidade para 8GB RAM"
    },
    "avancado": {
        "nome": "llama2:7b-chat-q4_0",
        "ram": "~4GB",
        "descricao": "Alternativa ao Mistral"
    }
}


def get_install_instructions() -> str:
    """Retorna instruções de instalação do Ollama"""
    return """
🤖 INSTALAÇÃO DO BOT IA LOCAL (Ollama)

1. BAIXAR E INSTALAR OLLAMA:
   - Acesse: https://ollama.ai/download
   - Baixe a versão para Windows
   - Execute o instalador

2. BAIXAR MODELO (escolha um):
   Abra o PowerShell/CMD e execute:
   
   # Recomendado para 8GB RAM:
   ollama pull mistral
   
   # Alternativas:
   ollama pull phi          # Mais leve (3GB)
   ollama pull gemma:2b     # Ultra leve (2GB)
   ollama pull tinyllama    # Mínimo (1GB)

3. VERIFICAR SE ESTÁ FUNCIONANDO:
   ollama list              # Lista modelos instalados
   ollama run mistral       # Testa o modelo

4. O OLLAMA INICIA AUTOMATICAMENTE
   Ele roda em: http://localhost:11434

5. VOLTE AO SISTEMA E ATIVE O BOT
   Nas configurações, ative o Bot IA
"""
