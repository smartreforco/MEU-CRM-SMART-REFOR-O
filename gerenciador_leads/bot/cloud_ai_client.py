"""
Cliente para APIs de IA em Nuvem
Suporta: Google Gemini, OpenAI, Anthropic Claude

Para obter API Keys:
- Gemini (GRÁTIS): https://aistudio.google.com/app/apikey
- OpenAI: https://platform.openai.com/api-keys
- Claude: https://console.anthropic.com/
"""

import requests
import json
from dataclasses import dataclass
from typing import List, Dict, Optional, Generator
from datetime import datetime
import time


@dataclass
class AIResponse:
    """Resposta padronizada de qualquer API"""
    success: bool
    message: str
    tokens_used: int = 0
    model: str = ""
    response_time: float = 0
    error: str = ""
    provider: str = ""


# ==================== GOOGLE GEMINI ====================
class GeminiClient:
    """
    Cliente para Google Gemini API (GRÁTIS!)
    
    Modelos disponíveis:
    - gemini-2.0-flash: Mais rápido, grátis (recomendado)
    - gemini-2.5-flash: Mais novo
    - gemini-2.5-pro: Mais capaz
    
    Limites gratuitos:
    - 15 requisições/minuto
    - 1 milhão tokens/dia
    """
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        self.default_model = "gemini-2.0-flash"
        self.timeout = 60
    
    def is_available(self) -> bool:
        """Verifica se a API está funcionando"""
        if not self.api_key:
            return False
        try:
            response = requests.get(
                f"{self.base_url}/models?key={self.api_key}",
                timeout=10
            )
            return response.status_code == 200
        except:
            return False
    
    def list_models(self) -> List[str]:
        """Lista modelos disponíveis"""
        try:
            response = requests.get(
                f"{self.base_url}/models?key={self.api_key}",
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                return [m['name'].replace('models/', '') for m in data.get('models', [])
                        if 'generateContent' in m.get('supportedGenerationMethods', [])]
            return []
        except:
            return []
    
    def generate(self, prompt: str, 
                 system_prompt: str = None,
                 model: str = None,
                 temperature: float = 0.7,
                 max_tokens: int = 500) -> AIResponse:
        """Gera uma resposta"""
        start_time = datetime.now()
        model = model or self.default_model
        
        # Construir conteúdo
        contents = []
        
        # System prompt como primeira mensagem
        if system_prompt:
            contents.append({
                "role": "user",
                "parts": [{"text": f"Instruções do sistema: {system_prompt}"}]
            })
            contents.append({
                "role": "model", 
                "parts": [{"text": "Entendido. Vou seguir essas instruções."}]
            })
        
        # Mensagem do usuário
        contents.append({
            "role": "user",
            "parts": [{"text": prompt}]
        })
        
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
                "topP": 0.95,
                "topK": 40
            },
            "safetySettings": [
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
            ]
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/models/{model}:generateContent?key={self.api_key}",
                json=payload,
                timeout=self.timeout
            )
            
            response_time = (datetime.now() - start_time).total_seconds()
            
            if response.status_code == 200:
                data = response.json()
                
                # Extrair texto da resposta
                candidates = data.get('candidates', [])
                if candidates:
                    content = candidates[0].get('content', {})
                    parts = content.get('parts', [])
                    text = parts[0].get('text', '') if parts else ''
                    
                    # Tokens usados
                    usage = data.get('usageMetadata', {})
                    tokens = usage.get('totalTokenCount', 0)
                    
                    return AIResponse(
                        success=True,
                        message=text,
                        tokens_used=tokens,
                        model=model,
                        response_time=response_time,
                        provider="gemini"
                    )
                else:
                    # Pode ter sido bloqueado por segurança
                    return AIResponse(
                        success=False,
                        message='',
                        error="Resposta bloqueada ou vazia",
                        provider="gemini"
                    )
            else:
                error_msg = response.json().get('error', {}).get('message', response.text[:200])
                return AIResponse(
                    success=False,
                    message='',
                    error=f"Erro {response.status_code}: {error_msg}",
                    provider="gemini"
                )
        
        except requests.exceptions.Timeout:
            return AIResponse(
                success=False,
                message='',
                error="Timeout - API demorou muito para responder",
                provider="gemini"
            )
        except Exception as e:
            return AIResponse(
                success=False,
                message='',
                error=str(e),
                provider="gemini"
            )
    
    def chat(self, messages: List[Dict], 
             model: str = None,
             temperature: float = 0.7,
             max_tokens: int = 500) -> AIResponse:
        """
        Chat com histórico de mensagens.
        messages: [{'role': 'user/assistant', 'content': '...'}]
        """
        start_time = datetime.now()
        model = model or self.default_model
        
        # Converter formato para Gemini
        contents = []
        for msg in messages:
            role = "user" if msg.get('role') in ['user', 'system'] else "model"
            contents.append({
                "role": role,
                "parts": [{"text": msg.get('content', '')}]
            })
        
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens
            }
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/models/{model}:generateContent?key={self.api_key}",
                json=payload,
                timeout=self.timeout
            )
            
            response_time = (datetime.now() - start_time).total_seconds()
            
            if response.status_code == 200:
                data = response.json()
                candidates = data.get('candidates', [])
                if candidates:
                    text = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                    tokens = data.get('usageMetadata', {}).get('totalTokenCount', 0)
                    
                    return AIResponse(
                        success=True,
                        message=text,
                        tokens_used=tokens,
                        model=model,
                        response_time=response_time,
                        provider="gemini"
                    )
            
            return AIResponse(
                success=False,
                message='',
                error=f"Erro: {response.text[:200]}",
                provider="gemini"
            )
        except Exception as e:
            return AIResponse(
                success=False,
                message='',
                error=str(e),
                provider="gemini"
            )


# ==================== OPENAI ====================
class OpenAIClient:
    """
    Cliente para OpenAI API (ChatGPT)
    
    Modelos:
    - gpt-4o-mini: Mais barato, rápido
    - gpt-4o: Mais capaz
    - gpt-3.5-turbo: Legado, barato
    """
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openai.com/v1"
        self.default_model = "gpt-4o-mini"
        self.timeout = 60
    
    def is_available(self) -> bool:
        if not self.api_key:
            return False
        try:
            response = requests.get(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=10
            )
            return response.status_code == 200
        except:
            return False
    
    def generate(self, prompt: str,
                 system_prompt: str = None,
                 model: str = None,
                 temperature: float = 0.7,
                 max_tokens: int = 500) -> AIResponse:
        """Gera uma resposta"""
        start_time = datetime.now()
        model = model or self.default_model
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=self.timeout
            )
            
            response_time = (datetime.now() - start_time).total_seconds()
            
            if response.status_code == 200:
                data = response.json()
                text = data['choices'][0]['message']['content']
                tokens = data.get('usage', {}).get('total_tokens', 0)
                
                return AIResponse(
                    success=True,
                    message=text,
                    tokens_used=tokens,
                    model=model,
                    response_time=response_time,
                    provider="openai"
                )
            else:
                return AIResponse(
                    success=False,
                    message='',
                    error=f"Erro {response.status_code}: {response.text[:200]}",
                    provider="openai"
                )
        except Exception as e:
            return AIResponse(
                success=False,
                message='',
                error=str(e),
                provider="openai"
            )
    
    def chat(self, messages: List[Dict],
             model: str = None,
             temperature: float = 0.7,
             max_tokens: int = 500) -> AIResponse:
        """Chat com histórico"""
        start_time = datetime.now()
        model = model or self.default_model
        
        # OpenAI já usa o formato correto
        formatted = [
            {"role": m.get('role', 'user'), "content": m.get('content', '')}
            for m in messages
        ]
        
        payload = {
            "model": model,
            "messages": formatted,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=self.timeout
            )
            
            response_time = (datetime.now() - start_time).total_seconds()
            
            if response.status_code == 200:
                data = response.json()
                return AIResponse(
                    success=True,
                    message=data['choices'][0]['message']['content'],
                    tokens_used=data.get('usage', {}).get('total_tokens', 0),
                    model=model,
                    response_time=response_time,
                    provider="openai"
                )
            return AIResponse(
                success=False,
                message='',
                error=response.text[:200],
                provider="openai"
            )
        except Exception as e:
            return AIResponse(
                success=False,
                message='',
                error=str(e),
                provider="openai"
            )


# ==================== ANTHROPIC CLAUDE ====================
class ClaudeClient:
    """
    Cliente para Anthropic Claude API
    
    Modelos:
    - claude-3-5-sonnet-20241022: Mais recente
    - claude-3-haiku-20240307: Mais rápido e barato
    """
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.anthropic.com/v1"
        self.default_model = "claude-3-haiku-20240307"
        self.timeout = 60
    
    def is_available(self) -> bool:
        return bool(self.api_key)
    
    def generate(self, prompt: str,
                 system_prompt: str = None,
                 model: str = None,
                 temperature: float = 0.7,
                 max_tokens: int = 500) -> AIResponse:
        start_time = datetime.now()
        model = model or self.default_model
        
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}]
        }
        
        if system_prompt:
            payload["system"] = system_prompt
        
        try:
            response = requests.post(
                f"{self.base_url}/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=self.timeout
            )
            
            response_time = (datetime.now() - start_time).total_seconds()
            
            if response.status_code == 200:
                data = response.json()
                text = data['content'][0]['text']
                tokens = data.get('usage', {}).get('input_tokens', 0) + data.get('usage', {}).get('output_tokens', 0)
                
                return AIResponse(
                    success=True,
                    message=text,
                    tokens_used=tokens,
                    model=model,
                    response_time=response_time,
                    provider="claude"
                )
            return AIResponse(
                success=False,
                message='',
                error=response.text[:200],
                provider="claude"
            )
        except Exception as e:
            return AIResponse(
                success=False,
                message='',
                error=str(e),
                provider="claude"
            )


# ==================== CLIENTE UNIFICADO ====================
class CloudAIClient:
    """
    Cliente unificado que gerencia múltiplos provedores de IA.
    Escolha o provedor ao inicializar ou troque dinamicamente.
    """
    
    PROVIDERS = {
        'gemini': {
            'name': 'Google Gemini',
            'models': ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'],
            'default': 'gemini-1.5-flash',
            'free': True,
            'url': 'https://aistudio.google.com/app/apikey'
        },
        'openai': {
            'name': 'OpenAI (ChatGPT)',
            'models': ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
            'default': 'gpt-4o-mini',
            'free': False,
            'url': 'https://platform.openai.com/api-keys'
        },
        'claude': {
            'name': 'Anthropic Claude',
            'models': ['claude-3-haiku-20240307', 'claude-3-5-sonnet-20241022'],
            'default': 'claude-3-haiku-20240307',
            'free': False,
            'url': 'https://console.anthropic.com/'
        }
    }
    
    def __init__(self, provider: str = 'gemini', api_key: str = ''):
        self.provider = provider
        self.api_key = api_key
        self.client = self._create_client(provider, api_key)
        self.system_prompt = ""
        self.temperature = 0.7
        self.max_tokens = 500
        self.model = None
    
    def _create_client(self, provider: str, api_key: str):
        """Cria o cliente apropriado para o provedor"""
        if provider == 'gemini':
            return GeminiClient(api_key)
        elif provider == 'openai':
            return OpenAIClient(api_key)
        elif provider == 'claude':
            return ClaudeClient(api_key)
        else:
            raise ValueError(f"Provedor desconhecido: {provider}")
    
    def set_provider(self, provider: str, api_key: str):
        """Troca o provedor de IA"""
        self.provider = provider
        self.api_key = api_key
        self.client = self._create_client(provider, api_key)
    
    def set_personality(self, system_prompt: str):
        """Define a personalidade do bot"""
        self.system_prompt = system_prompt
    
    def set_config(self, temperature: float = None, max_tokens: int = None, model: str = None):
        """Configura parâmetros"""
        if temperature is not None:
            self.temperature = temperature
        if max_tokens is not None:
            self.max_tokens = max_tokens
        if model is not None:
            self.model = model
    
    def is_available(self) -> bool:
        """Verifica se a API está disponível"""
        return self.client.is_available() if self.client else False
    
    def get_response(self, message: str, 
                     conversation_history: List[Dict] = None,
                     contact_name: str = None) -> AIResponse:
        """
        Gera uma resposta para a mensagem.
        Compatível com SmartBot do ollama_client.
        """
        if not self.client:
            return AIResponse(
                success=False,
                message='',
                error='Cliente não configurado'
            )
        
        # Construir system prompt
        system = self.system_prompt
        if contact_name:
            system += f"\n\nO cliente se chama: {contact_name}"
        
        # Se tiver histórico, usar chat
        if conversation_history:
            messages = [{"role": "system", "content": system}] if system else []
            for msg in conversation_history[-10:]:  # Últimas 10 mensagens
                messages.append({
                    "role": msg.get('role', 'user'),
                    "content": msg.get('content', '')
                })
            messages.append({"role": "user", "content": message})
            
            return self.client.chat(
                messages=messages,
                model=self.model,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
        else:
            return self.client.generate(
                prompt=message,
                system_prompt=system,
                model=self.model,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
    
    def check_quick_response(self, message: str, quick_responses: List[Dict]) -> Optional[str]:
        """
        Verifica se há uma resposta rápida para a mensagem.
        Mesma assinatura do SmartBot.
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
    
    @classmethod
    def get_provider_info(cls) -> Dict:
        """Retorna informações sobre provedores disponíveis"""
        return cls.PROVIDERS
