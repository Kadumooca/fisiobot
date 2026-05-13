const { enviarMensagem } = require('../services/whatsapp');
const { buscarLeadsParaReativar, incrementarTentativaReativacao } = require('../utils/clienteCache');

const MENSAGENS = {
  1: (nome, especialidade) =>
    `Olá${nome ? ', ' + nome.split(' ')[0] : ''}! 😊 Notei que você se interessou por *${especialidade || 'nossos serviços'}* na Clínica Lituânia.\n\nAinda posso te ajudar a agendar? Temos horários disponíveis esta semana!`,
  2: (nome, especialidade) =>
    `Oi${nome ? ', ' + nome.split(' ')[0] : ''}! 👋 Passando para lembrar que na *Clínica Lituânia* temos ótimos profissionais prontos para te atender em *${especialidade || 'fisioterapia'}*.\n\nQue tal garantir seu horário agora?`,
  3: (nome, especialidade) =>
    `${nome ? nome.split(' ')[0] + ', ' : ''}queremos muito te receber na *Clínica Lituânia*! 😊\n\nEsta é nossa última mensagem automática. Se quiser agendar sua consulta de *${especialidade || 'fisioterapia'}*, é só responder *Olá* quando estiver pronto!\n\nEsperamos por você! 🙏`,
};

async function executarRemarketing() {
  try {
    const leads = await buscarLeadsParaReativar();
    if (!leads || leads.length === 0) return;

    console.log(`Remarketing: ${leads.length} leads para reativar`);

    for (const lead of leads) {
      const mensagem = MENSAGENS[lead.tentativa];
      if (!mensagem) continue;

      await enviarMensagem(lead.telefone, mensagem(lead.nome, lead.especialidade));
      await incrementarTentativaReativacao(lead.telefone);

      console.log(`Remarketing enviado para ${lead.telefone} — tentativa ${lead.tentativa}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (err) {
    console.error('Erro no remarketing:', err.message);
  }
}

module.exports = { executarRemarketing };
