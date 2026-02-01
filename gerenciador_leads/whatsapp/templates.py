"""
Templates de mensagens para WhatsApp
Use {nome}, {cidade}, {tipo_servico}, {endereco} como variáveis
"""

TEMPLATES = {
    "primeiro_contato": {
        "nome": "Primeiro Contato",
        "descricao": "Mensagem inicial para novos leads",
        "mensagem": """Olá {nome}! 👋

Sou da *Smart Reforço* e encontrei seu contato.

Trabalhamos com soluções de qualidade para {tipo_servico}.

Gostaria de saber mais sobre nossos serviços?

Aguardo seu retorno! 😊"""
    },
    
    "apresentacao": {
        "nome": "Apresentação da Empresa",
        "descricao": "Apresentação completa dos serviços",
        "mensagem": """Olá {nome}! 👋

Sou da *Smart Reforço* e gostaria de me apresentar.

🏢 *Quem somos:*
Empresa especializada em soluções de qualidade.

✅ *O que oferecemos:*
• Produtos de alta qualidade
• Preços competitivos
• Atendimento personalizado
• Entrega rápida

📍 Atendemos em {cidade} e região!

Posso enviar mais informações? 📲"""
    },
    
    "follow_up": {
        "nome": "Follow-up",
        "descricao": "Mensagem de acompanhamento",
        "mensagem": """Olá {nome}! 

Tudo bem com você? 😊

Estou passando para saber se teve a oportunidade de avaliar nossa proposta.

Ficou com alguma dúvida? Estou à disposição para ajudar!

Aguardo seu retorno! 🙏"""
    },
    
    "promocao": {
        "nome": "Promoção",
        "descricao": "Mensagem promocional",
        "mensagem": """🎉 *PROMOÇÃO ESPECIAL* 🎉

Olá {nome}!

Temos uma oferta exclusiva para você de {cidade}! 

💰 *Condições especiais* por tempo limitado!

Entre em contato agora mesmo para saber mais detalhes!

📲 Responda essa mensagem!"""
    },
    
    "agradecimento": {
        "nome": "Agradecimento",
        "descricao": "Agradecer pelo contato/compra",
        "mensagem": """Olá {nome}! 🙏

Muito obrigado pelo seu contato!

Foi um prazer atendê-lo(a). 

Qualquer dúvida, estou à disposição!

Conte sempre conosco! 💪

*Smart Reforço*"""
    },
    
    "lembrete": {
        "nome": "Lembrete",
        "descricao": "Lembrete de orçamento/proposta",
        "mensagem": """Olá {nome}! 📋

Passando para lembrar sobre o orçamento que enviamos.

Ele ainda está válido e você pode aproveitar as condições especiais!

Posso ajudar com mais alguma informação?

Aguardo seu retorno! 😊"""
    },
    
    "personalizada": {
        "nome": "Mensagem Personalizada",
        "descricao": "Escreva sua própria mensagem",
        "mensagem": """"""
    }
}


def formatar_mensagem(template_key: str, dados: dict) -> str:
    """
    Formata uma mensagem de template com os dados do lead.
    
    Args:
        template_key: Chave do template (ex: 'primeiro_contato')
        dados: Dict com dados do lead (nome, cidade, telefone, etc)
    
    Returns:
        Mensagem formatada
    """
    template = TEMPLATES.get(template_key, TEMPLATES['personalizada'])
    mensagem = template['mensagem']
    
    # Substituir variáveis
    try:
        mensagem = mensagem.format(
            nome=dados.get('nome', 'Cliente'),
            cidade=dados.get('cidade', 'sua cidade'),
            telefone=dados.get('telefone', ''),
            endereco=dados.get('endereco', ''),
            tipo_servico=dados.get('tipo_servico', 'nossos serviços')
        )
    except KeyError:
        pass
    
    return mensagem


def listar_templates() -> list:
    """Retorna lista de templates disponíveis"""
    return [
        {
            "key": key,
            "nome": val["nome"],
            "descricao": val["descricao"],
            "mensagem": val["mensagem"]
        }
        for key, val in TEMPLATES.items()
    ]
