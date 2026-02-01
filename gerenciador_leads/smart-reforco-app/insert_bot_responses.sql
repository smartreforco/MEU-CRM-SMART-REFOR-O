-- ============================================================
-- INSERIR RESPOSTAS DO BOT DE EXEMPLO
-- Execute no Supabase SQL Editor
-- ============================================================

-- Primeiro, limpar respostas de exemplo anteriores (opcional)
-- DELETE FROM bot_responses WHERE trigger IN ('Quero conhecer!', 'No momento não tenho', 'Sim', 'Não');

-- Inserir respostas para os botões do seu template
INSERT INTO bot_responses (trigger, response, active) VALUES
('Quero conhecer!', 'Que ótimo! 🎉 Fico muito feliz com seu interesse!

Nosso sistema Smart Reforço oferece:
✅ Portal dos Pais
✅ Matrícula Online
✅ Gestão de Turmas e Horários
✅ Controle Financeiro

Posso agendar uma demonstração gratuita para você! Qual o melhor horário?', true),

('No momento não tenho', 'Sem problemas! 😊

Quando você estiver pronto para organizar melhor seu espaço de reforço escolar, é só me chamar!

Vou te enviar algumas dicas gratuitas por aqui de vez em quando, pode ser?', true);

-- Verificar se foram inseridas
SELECT * FROM bot_responses WHERE active = true;
