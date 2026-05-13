const { enviarMensagem } = require('../services/whatsapp');
const { buscarLeadsParaReativar, incrementarTentativaReativacao } = require('../utils/clienteCache');
const fisiosoft = require('../services/fisiosoft');

const MENSAGENS = {
  1: (nome, especialidade) =>
    `Olá${nome ? ', ' + nome.split(' ')[0] : ''}! 😊 Notei que você se interessou por *${especialidade || 'nossos serviços'}* na Clínica Lituânia.\n\nAinda posso te ajudar a agendar? Temos horários disponíveis esta semana!`,
  2: (nome, especialidade) =>
    `Oi${nome ? ', ' + nome.split(' ')[0] : ''}! 👋 Passando para lembrar que na *Clínica Lituânia* temos ótimos profissionais prontos para te atender em *${especialidade || 'fisioterapia'}*.\n\nQue tal garantir seu horário agora?`,
  3: (nome, especialidade) =>
    `${nome ? nome.split(' ')[0] + ', ' : ''}queremos muito te receber na *Clínica Lituânia*! 😊\n\nEsta é nossa última mensagem automática. Se quiser agendar sua consulta de *${especialidade || 'fisioterapia'}*, é só responder *Olá* quando estiver pronto!\n\nEsperamos por você! 🙏`,
};

async function clienteTemAgendamentoFuturo(telefone) {
  try {
    // Busca cliente pelo telefone no cache
    const { buscarClientePorTelefone } = require('../utils/clienteCache');
    const cliente = await buscarClientePorTelefone(telefone);
    if (!cliente || !cliente.Id) return false;

    // Consulta agendamentos futuros no Fisiosoft
    const agendamentos = await fisiosoft.listarAgendamentosCliente(cliente.Id);
    if (agendamentos && agendamentos.length > 0) return true;

    return false;
  } catch (err) {
    console.error('Erro ao verificar agendamentos:', err.message);
    return false;
  }
}

async function executarRemarketing() {
  try {
    const leads = await buscarLeadsParaReativar();
    if (!leads || leads.length === 0) return;

    console.log(`Remarketing: ${leads.length} leads para verificar`);

    for (const lead of leads) {
      const mensagem = MENSAGENS[lead.tentativa];
      if (!mensagem) continue;

      // Verifica se cliente já tem agendamento futuro
      const temAgendamento = await clienteTemAgendamentoFuturo(lead.telefone);
      if (temAgendamento) {
        console.log(`Remarketing ignorado para ${lead.telefone} — já tem agendamento futuro`);
        // Marca como agendou para não reativar mais
        const { marcarAgendou } = require('../utils/clienteCache');
        await marcarAgendou(lead.telefone);
        continue;
      }

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
