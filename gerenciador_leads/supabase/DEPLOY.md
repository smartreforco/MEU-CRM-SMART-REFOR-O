# 🚀 Deploy WhatsApp Edge Functions no Supabase

## 📋 Pré-requisitos

1. Conta no Supabase com projeto criado
2. Supabase CLI instalado
3. Token de acesso do WhatsApp Business API

## 🔧 Instalação do Supabase CLI

### Windows (PowerShell)
```powershell
# Via Scoop
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Ou via NPM
npm install -g supabase
```

### Verificar instalação
```bash
supabase --version
```

## 🔐 Login no Supabase

```bash
supabase login
```

## 📦 Deploy das Edge Functions

### 1. Configurar projeto
```bash
cd gerenciador_leads/supabase
supabase link --project-ref dcieravtcvoprktjgvry
```

### 2. Configurar variáveis de ambiente
Vá para o Supabase Dashboard:
- **Project Settings** > **Edge Functions** > **Secrets**

Adicione estas variáveis:
```
WHATSAPP_PHONE_NUMBER_ID = 883348054872888
WHATSAPP_ACCESS_TOKEN = EAAQspa3XEo4BQnYHQCxs4lbTjuMN02PkZBKrYbUKZC43x2UXFhgL6g5wrAH1yc2U1mrLZB6ao2NXYn7E8db5Bf0xD1lUSxQrAFemhOOcN8nEOlZAkpNMxOZAJNLQExCqAt29rZAyPFOJDrfsscfyD8HmTCmY3IfWN0aXk7hTOrCJPyi5l0mJ8uuZAmmEuLvhGCXQgZDZD
WHATSAPP_VERIFY_TOKEN = smart_reforco_verify_2024
WHATSAPP_BUSINESS_ACCOUNT_ID = 1222595496507293
```

### 3. Deploy das funções
```bash
# Deploy webhook (receber mensagens)
supabase functions deploy whatsapp-webhook --no-verify-jwt

# Deploy send (enviar mensagens)
supabase functions deploy whatsapp-send --no-verify-jwt

# Deploy API (endpoints gerais)
supabase functions deploy whatsapp-api --no-verify-jwt
```

### 4. Verificar deploy
```bash
supabase functions list
```

## 🌐 URLs das Edge Functions

Após o deploy, suas funções estarão disponíveis em:

```
https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-webhook
https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-send
https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-api
```

## 📱 Configurar Webhook no Meta Business Suite

1. Acesse [Meta for Developers](https://developers.facebook.com/)
2. Vá para seu App > WhatsApp > Configuration
3. Configure o Webhook:
   - **Callback URL**: `https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-webhook`
   - **Verify Token**: `smart_reforco_verify_2024`
4. Inscreva-se nos campos:
   - `messages`
   - `message_status`

## 🧪 Testar

### Verificar webhook
```bash
curl "https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=smart_reforco_verify_2024&hub.challenge=test123"
```

### Enviar mensagem
```bash
curl -X POST "https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"to": "5511999999999", "type": "text", "content": "Olá!"}'
```

### Verificar API
```bash
curl "https://dcieravtcvoprktjgvry.supabase.co/functions/v1/whatsapp-api/status"
```

## 📊 Criar Tabelas no Supabase

Execute o SQL do arquivo `setup_whatsapp_supabase.sql` no SQL Editor do Supabase Dashboard.

## ✅ Checklist Final

- [ ] Supabase CLI instalado
- [ ] Login realizado (`supabase login`)
- [ ] Projeto linkado
- [ ] Variáveis de ambiente configuradas
- [ ] Edge Functions deployadas
- [ ] Tabelas criadas no banco
- [ ] Webhook configurado no Meta
- [ ] Teste de envio funcionando
