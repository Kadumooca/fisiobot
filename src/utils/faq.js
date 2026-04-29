const faqs = [
  {
    id: '1',
    pergunta: 'Qual o endereço da clínica?',
    resposta: '📍 *Endereço:*\nRua Exemplo, 123 - Bairro\nCidade - UF',
  },
  {
    id: '2',
    pergunta: 'Quais os horários de funcionamento?',
    resposta: '🕐 *Horários:*\n\nSegunda a Sexta: 8h às 18h\nSábado: 8h às 12h\nDomingo: Fechado',
  },
  {
    id: '3',
    pergunta: 'Quais convênios são aceitos?',
    resposta: '💳 *Convênios aceitos:*\n\n• Unimed\n• Bradesco Saúde\n• SulAmérica\n• Amil',
  },
  {
    id: '4',
    pergunta: 'Qual o telefone da clínica?',
    resposta: '📞 *Telefone:* (XX) XXXX-XXXX\n📱 *WhatsApp:* (XX) XXXXX-XXXX',
  },
];

function listarFAQs() {
  return faqs.map((f) => `*${f.id}.* ${f.pergunta}`).join('\n');
}

function buscarResposta(numero) {
  const faq = faqs.find((f) => f.id === String(numero));
  return faq ? faq.resposta : null;
}

module.exports = { listarFAQs, buscarResposta };
