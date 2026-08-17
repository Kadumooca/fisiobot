const { enviarMensagem } = require('../services/whatsapp');
const { buscarLeadsParaReativar, incrementarTentativaReativacao, marcarAgendou } = require('../utils/clienteCache');
const fisiosoft = require('../services/fisiosoft');

// Clínica funciona segunda a sexta, 7h às 20h (horário de São Paulo).
// Sem essa checagem o remarketing dispara em qualquer horário que o job/cron
// rodar, inclusive fim de semana e madrugada — usa o fuso de São Paulo
// explicitamente (não o do servidor, que no Railway roda em UTC).
function dentroDoHorarioComercial() {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(agora);

  const hora = parseInt(partes.find(p => p.type === 'hour').value, 10);
  const diaSemana = (partes.find(p => p.type === 'weekday').value || '').toLowerCase();
  const diasUteis = ['seg', 'ter', 'qua', 'qui', 'sex'];
  const ehDiaUtil = diasUteis.some(d => diaSemana.startsWith(d));

  return ehDiaUtil && hora >= 7 && hora < 20;
}

// Contatos sem cadastro no WhatsApp chegam com o placeholder "Desconhecido"
// como nome (definido no clienteCache) — sem esse filtro, as mensagens
// abaixo tratavam essa string como um nome real e mandavam "Oi, Desconhecido!".
function primeiroNome(nome) {
  if (!nome || nome.trim().toLowerCase() === 'desconhecido') return null;
  return nome.split(' ')[0];
}

const MENSAGENS = {
  1: (nome, especialidade) => {
    const primeiro = primeiroNome(nome);
    return `Olá${primeiro ? ', ' + primeiro : ''}! 😊 Notei que você se interessou por *${especialidade || 'nossos serviços'}* na Clínica Lituânia.\n\nAinda posso te ajudar a agendar? Temos horários disponíveis esta semana!`;
  },
  2: (nome, especialidade) => {
    const primeiro = primeiroNome(nome);
    return `Oi${primeiro ? ', ' + primeiro : ''}! 👋 Passando para lembrar que na *Clínica Lituânia* temos ótimos profissionais prontos para te atender em *${especialidade || 'fisioterapia'}*.\n\nQue tal garantir seu horário agora?`;
  },
  3: (nome, especialidade) => {
    const primeiro = primeiroNome(nome);
    return `${primeiro ? primeiro + ', ' : ''}queremos muito te receber na *Clínica Lituânia*! 😊\n\nEsta é nossa última mensagem automática. Se quiser agendar sua consulta de *${especialidade || 'fisioterapia'}*, é só responder *Olá* quando estiver pronto!\n\nEsperamos por você! 🙏`;
  },
};

async function clienteTemAgendamentoFuturo(telefone) {
  try {
    const { buscarClientePorTelefone } = require('../utils/clienteCache');
    const cliente = await buscarClientePorTelefone(telefone);
    if (!cliente || !cliente.Id) return false;
    const agendamentos = await fisiosoft.listarAgendamentosCliente(cliente.Id);
    if (agendamentos && agendamentos.length > 0) return true;
    return false;
  } catch (err) {
    console.error('Erro ao verificar agendamentos:', err.message);
    return false;
  }
}

async function executarRemarketing() {
  if (!dentroDoHorarioComercial()) {
    console.log('[REMARKETING] Fora do horário comercial (seg-sex, 7h-20h) — pulando execução.');
    return;
  }
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
        await marcarAgendou(lead.telefone);
        continue;
      }

      const idEnviado = await enviarMensagem(lead.telefone, mensagem(lead.nome, lead.especialidade));
      if (!idEnviado) {
        // enviarMensagem engole o próprio erro e retorna undefined em vez de
        // lançar exceção — sem essa checagem, um envio que falhou (número
        // inválido, Evolution fora do ar, etc.) era registrado como sucesso
        // e o lead avançava de tentativa sem nunca ter recebido nada.
        console.error(`[REMARKETING] Falha ao enviar para ${lead.telefone} — tentativa ${lead.tentativa} NÃO incrementada, será retentada.`);
        continue;
      }
      await incrementarTentativaReativacao(lead.telefone);

      console.log(`Remarketing enviado para ${lead.telefone} — tentativa ${lead.tentativa}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (err) {
    console.error('Erro no remarketing:', err.message);
  }
}

module.exports = { executarRemarketing };
