const { buscarLeadsParaRemarketing, atualizarTentativaRemarketing } = require('../utils/clienteCache');
const { enviarMensagem } = require('../services/whatsapp');

const VANTAGENS = {
  'Fisioterapia': '✨ Na Clínica Lituânia oferecemos *avaliação gratuita* e atendimento individualizado com fisioterapeutas especializados!',
  'Hidroterapia': '✨ Nossa piscina aquecida a 34°C com atendimento *individual* é ideal para reabilitação e alívio de dores crônicas!',
  'Pilates': '✨ Nosso Pilates tem turmas com no máximo 3 alunos, conduzido por fisioterapeutas, e você pode fazer uma *aula experimental gratuita*!',
  'RPG': '✨ O RPG é excelente para correção postural e alívio de dores crônicas, com resultados visíveis já nas primeiras sessões!',
  'Acupuntura': '✨ Nossa acupuntura é realizada por profissional especializada e atende diversas condições com resultados comprovados!',
  'Consulta Vascular': '✨ O Dr. Carlos é especialista vascular e realiza consultas e procedimentos com alta qualidade e atenção individualizada!',
  'Drenagem / Massagem Relaxante': '✨ Nossa drenagem linfática e massagem relaxante são realizadas por fisioterapeutas especializados!',
};

function gerarMensagem1(nome, especialidade) {
  const vantagem = VANTAGENS[especialidade] || '✨ Na Clínica Lituânia oferecemos atendimento especializado e individualizado!';
  const primeiroNome = nome ? nome.split(' ')[0] : 'olá';
  return (
    `Olá, *${primeiroNome}*! 😊 Aqui é a Lissa da *Clínica Lituânia*.\n\n` +
    `Vi que você se interessou por *${especialidade}* e queria saber se ficou alguma dúvida ou posso te ajudar com algo!\n\n` +
    `${vantagem}\n\n` +
    `Que tal agendarmos um horário? É rapidinho e sem compromisso! 🗓️\n\n` +
    `_Responda esta mensagem ou digite *AGENDAR* para verificar os horários disponíveis._`
  );
}

function gerarMensagem2(nome, especialidade) {
  const primeiroNome = nome ? nome.split(' ')[0] : 'olá';
  return (
    `Oi, *${primeiroNome}*! 😊 Passando novamente pela Clínica Lituânia.\n\n` +
    `Entendo que a vida é corrida e às vezes fica difícil de encaixar tudo! Mas cuidar da saúde é sempre uma prioridade que vale a pena. 💙\n\n` +
    `Posso te perguntar: teve algum motivo que impediu de agendar sua *${especialidade}*? Talvez eu possa te ajudar a encontrar uma solução!\n\n` +
    `Estamos aqui de *segunda a sexta, das 7h às 20h* e temos horários flexíveis para se adaptar à sua rotina. 🗓️\n\n` +
    `_Qualquer dúvida é só responder aqui! Será um prazer te atender na Clínica Lituânia._ 😊`
  );
}

async function executarRemarketing() {
  const agora = new Date();
  const hora = agora.getHours();
  if (hora < 9 || hora >= 18) { console.log('Fora do horário de remarketing.'); return; }
  console.log('Iniciando remarketing...');
  const leads = await buscarLeadsParaRemarketing();
  console.log(`${leads.length} leads para remarketing.`);
  for (const lead of leads) {
    try {
      const mensagem = lead.tentativas_remarketing === 0
        ? gerarMensagem1(lead.nome, lead.especialidade)
        : gerarMensagem2(lead.nome, lead.especialidade);
      await enviarMensagem(lead.telefone, mensagem);
      await atualizarTentativaRemarketing(lead.telefone);
      console.log(`Remarketing enviado para ${lead.telefone} (tentativa ${lead.tentativas_remarketing + 1})`);
      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      console.error(`Erro remarketing para ${lead.telefone}:`, err.message);
    }
  }
  console.log('Remarketing concluído!');
}

module.exports = { executarRemarketing };
