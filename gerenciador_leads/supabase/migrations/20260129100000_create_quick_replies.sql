-- ============================================================
-- Tabela de Respostas Rápidas (Quick Replies)
-- Salva templates de mensagens para agilizar atendimento
-- ============================================================

CREATE TABLE IF NOT EXISTS quick_replies (
  id BIGSERIAL PRIMARY KEY,
  command VARCHAR(50) NOT NULL,
  title VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(20) DEFAULT 'custom' CHECK (category IN ('custom', 'template')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca rápida por usuário
CREATE INDEX IF NOT EXISTS idx_quick_replies_user ON quick_replies(user_id);

-- Índice para busca por comando
CREATE INDEX IF NOT EXISTS idx_quick_replies_command ON quick_replies(command);

-- RLS (Row Level Security)
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

-- Política: usuários podem ver suas próprias respostas + templates globais
CREATE POLICY "Users can view own replies and global templates" ON quick_replies
  FOR SELECT USING (
    user_id = auth.uid() OR user_id IS NULL
  );

-- Política: usuários podem criar suas próprias respostas
CREATE POLICY "Users can create own replies" ON quick_replies
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND category = 'custom'
  );

-- Política: usuários podem atualizar suas próprias respostas
CREATE POLICY "Users can update own replies" ON quick_replies
  FOR UPDATE USING (
    user_id = auth.uid() AND category = 'custom'
  );

-- Política: usuários podem deletar suas próprias respostas
CREATE POLICY "Users can delete own replies" ON quick_replies
  FOR DELETE USING (
    user_id = auth.uid() AND category = 'custom'
  );

-- Templates globais (sem user_id = disponível para todos)
INSERT INTO quick_replies (command, title, content, category, user_id) VALUES
  ('/oi', 'Saudação Inicial', 'Olá! 👋 Tudo bem? Sou da Smart Reforço, como posso ajudar você hoje?', 'template', NULL),
  ('/preco', 'Informar Preços', 'Nossos preços variam conforme o tipo de serviço. Posso enviar nossa tabela completa para você?', 'template', NULL),
  ('/demo', 'Agendar Demo', '📅 Gostaria de agendar uma demonstração gratuita? Tenho horários disponíveis esta semana!', 'template', NULL),
  ('/obrigado', 'Agradecimento', 'Muito obrigado pelo contato! 😊 Qualquer dúvida, estou à disposição.', 'template', NULL),
  ('/pix', 'Enviar PIX', '💰 Segue nossa chave PIX para pagamento:

Chave: contato@empresa.com.br
Nome: Empresa LTDA
Banco: Banco X', 'template', NULL),
  ('/horario', 'Horário de Atendimento', '🕐 Nosso horário de atendimento:

📆 Segunda a Sexta: 8h às 18h
📆 Sábado: 9h às 13h
🚫 Domingo: Fechado', 'template', NULL),
  ('/localizacao', 'Endereço', '📍 Nosso endereço:

Rua Exemplo, 123 - Centro
Cidade - Estado
CEP: 00000-000

🗺️ Link do Maps: [inserir link]', 'template', NULL),
  ('/aguarde', 'Pedir para Aguardar', 'Por favor, aguarde um momento enquanto verifico essa informação para você! ⏳', 'template', NULL),
  ('/fechou', 'Fechar Venda', '🎉 Excelente escolha! Estou finalizando seu pedido agora mesmo. Em breve você receberá a confirmação!', 'template', NULL),
  ('/voltar', 'Cliente Sumiu', 'Oi! 👋 Percebi que ficamos sem falar... Ainda está interessado? Posso ajudar em algo?', 'template', NULL)
ON CONFLICT DO NOTHING;
