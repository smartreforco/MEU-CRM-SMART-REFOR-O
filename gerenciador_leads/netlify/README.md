# Smart Reforço - CRM WhatsApp

Sistema de gerenciamento de leads com integração WhatsApp e IA.

## 🚀 Deploy no Netlify

### Opção 1: Deploy Manual (Arrastar e Soltar)
1. Acesse [app.netlify.com](https://app.netlify.com)
2. Faça login ou crie uma conta
3. Arraste a pasta `netlify/` para a área de deploy

### Opção 2: Via Git
1. Faça push deste repositório para GitHub
2. Conecte o repo no Netlify
3. Configure:
   - **Build command:** (vazio)
   - **Publish directory:** `netlify`

## ⚙️ Configuração do Supabase

As credenciais já estão configuradas no `index.html`:
- **URL:** `https://dcieravtcvoprktjgvry.supabase.co`
- **Anon Key:** Já configurado

## 📊 Funcionalidades

- ✅ Dashboard com estatísticas
- ✅ Gerenciamento de 2235+ leads
- ✅ Busca e filtros
- ✅ CRUD completo
- ✅ Integração WhatsApp
- ✅ Interface estilo WhatsApp
- ✅ 100% Serverless

## 🔧 Tabelas no Supabase

- `leads` - Leads principais
- `unidades` - Pastas/categorias
- `whatsapp_config` - Configuração WhatsApp
- `bot_config` - Configuração do Bot IA
- `crm_pipelines` - Pipelines CRM
- `crm_estagios` - Estágios do funil

## 📱 Acessar

Após deploy, acesse: `https://seu-site.netlify.app`
