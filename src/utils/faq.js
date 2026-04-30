const faqs = [
  {
    id: '1',
    pergunta: 'Qual o endereço da clínica?',
    resposta: '📍 *Endereço:*\nRua Lituânia, 209 - Mooca\nSão Paulo - SP\n\n🗺️ Como chegar: https://maps.google.com/?q=Rua+Lituânia,+209,+Mooca,+São+Paulo',
  },
  {
    id: '2',
    pergunta: 'Quais os horários de funcionamento?',
    resposta: '🕐 *Horários de funcionamento:*\n\nSegunda a Sexta: 7h às 20h\nSábado: consulte disponibilidade\nDomingo: Fechado',
  },
  {
    id: '3',
    pergunta: 'A clínica aceita convênios?',
    resposta: '💳 *Convênios:*\n\nA Clínica Lituânia não aceita convênios.\nAtendemos somente por meio de pagamento particular.\n\nConsulte nossos valores pelo telefone ou WhatsApp.',
  },
  {
    id: '4',
    pergunta: 'Qual o telefone da clínica?',
    resposta: '📞 *Telefone:* (11) 2268-3195\n📱 *WhatsApp:* (11) 2268-3195\n\nHorário de atendimento: 7h às 20h',
  },
  {
    id: '5',
    pergunta: 'Como funciona o agendamento?',
    resposta: '📅 *Agendamento:*\n\nVocê pode agendar diretamente por este WhatsApp!\n\nDigite *1* no menu principal para agendar sua consulta de forma rápida e fácil. 😊',
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
