const { getSessao, setSessao, resetarSessao } = require('../utils/sessao');
const { enviarMensagem } = require('../services/whatsapp');
const fisiosoft = require('../services/fisiosoft');
const { consultarIA } = require('../services/ia');
const { validarCPF, limparCPF, formatarCPF } = require('../utils/formatters');
const { listarFAQs, buscarResposta } = require('../utils/faq');
const { buscarClientePorTelefone, salvarClientePorTelefone, registrarLead, marcarAgendou, marcarRespondeuRemarketing } = require('../utils/clienteCache');
const TELEFONE_CLINICA = 'tel:+551122683195';
const CONTATO_HUMANO = `Caso prefira falar diretamente com nossa equipe:\n📞 (11) 2268-3195\n\nHorário: Segunda a Sexta, 7h às 20h 😊`;

const MENU_PRINCIPAL = `👋 Olá! Bem-vindo(a) à *Clínica Lituânia*!

Como posso te ajudar hoje?

*1.* 💬 Falar com a Lissa (tire dúvidas, conheça nossos serviços)
*2.* 📅 Agendar consulta
*3.* ❌ Cancelar agendamento
*4.* 🔄 Reagendar consulta
*5.* 🗓️ Ver meus agendamentos
*6.* ❓ Dúvidas frequentes
*7.* 📞 Falar com a equipe
*0.* 🔚 Encerrar atendimento

Digite o número da opção desejada.`;

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Mapeamento especialidade → períodos → agenda + procedimento
const AGENDAS_POR_ESPECIALIDADE = {
  '1': {
    nome: 'Fisioterapia',
    periodos: [
      { label: '🌅 Manhã (7h às 11h)', agendaId: 1, procedimentoId: 5, idProfissional: 1, agendaNome: 'Fisioterapia - Manhã' },
      { label: '🌆 Tarde (15h às 18h)', agendaId: 29, procedimentoId: 5, idProfissional: 28, agendaNome: 'Fisioterapia - Tarde' },
    ]
  },
  '2': {
    nome: 'Hidroterapia',
    periodos: [
      { label: '🌅 Manhã (7h às 13h)', agendaId: 20, procedimentoId: 6, idProfissional: 19, agendaNome: 'Hidroterapia - Manhã' },
      { label: '🌆 Tarde (13h às 20h)', agendaId: 4, procedimentoId: 6, idProfissional: 2, agendaNome: 'Hidroterapia - Tarde' },
    ]
  },
  '3': {
    nome: 'Pilates',
    periodos: [
      { label: '🌅 Manhã (7h às 12h)', agendaId: 28, procedimentoId: 57, idProfissional: 27, agendaNome: 'Pilates - Manhã' },
      { label: '🌆 Tarde (15h às 19h)', agendaId: 7, procedimentoId: 57, idProfissional: 6, agendaNome: 'Pilates - Tarde' },
    ]
  },
  '4': {
    nome: 'RPG',
    periodos: [
      { label: '🌅 Quinta manhã (8h às 11h)', agendaId: 6, procedimentoId: 9, idProfissional: 7, agendaNome: 'RPG - Manhã quinta' },
      { label: '🌆 Tarde seg-quinta (15h às 19h)', agendaId: 6, procedimentoId: 9, idProfissional: 7, agendaNome: 'RPG - Tarde' },
    ]
  },
  '5': {
    nome: 'Acupuntura',
    periodos: [
      { label: '📋 Ver horários disponíveis', agendaId: 8, procedimentoId: 1, idProfissional: 8, agendaNome: 'Acupuntura' },
    ]
  },
  '6': {
    nome: 'Consulta Vascular',
    diasBusca: 30,
    periodos: [
      { label: '📋 Ver horários disponíveis', agendaId: 11, procedimentoId: 22, idProfissional: 9, agendaNome: 'Consulta Vascular' },
    ]
  },
  '7': {
    nome: 'Drenagem / Massagem Relaxante',
    periodos: [
      { label: '🌆 Tarde (15h às 19h)', agendaId: 7, procedimentoId: 84, idProfissional: 6, agendaNome: 'Drenagem / Massagem' },
    ]
  },
};
// Formata data Date para dd/mm/aaaa
function formatarData(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const a = date.getFullYear();
  return `${d}/${m}/${a}`;
}

// Busca horários disponíveis nos próximos N dias
async function buscarProximosHorarios(agendaId, procedimentoId, diasBusca = 7) {
  const horariosEncontrados = [];
  const hoje = new Date();

  for (let i = 1; i <= diasBusca; i++) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + i);

    // Pula sábados e domingos
if (data.getDay() === 0 || data.getDay() === 6) continue;

    const dataStr = formatarData(data);
    const horarios = await fisiosoft.buscarHorariosDisponiveis(agendaId, procedimentoId, dataStr);

    if (horarios && horarios.length > 0) {
      for (const hora of horarios) {
        horariosEncontrados.push({
          data: dataStr,
          diaSemana: DIAS_SEMANA[data.getDay()],
          hora: hora,
          agendaId,
          procedimentoId,
        });
      }
    }

    // Limita a 10 opções para não sobrecarregar a mensagem
    if (horariosEncontrados.length >= 10) break;
  }

  return horariosEncontrados;
}

async function processarMensagem(telefone, mensagem) {
  const texto = mensagem.trim();
  const sessao = getSessao(telefone);

  // Se respondeu qualquer mensagem, marca que respondeu ao remarketing
  await marcarRespondeuRemarketing(telefone);

  if (['menu', 'voltar', '0', 'sair'].includes(texto.toLowerCase())) {
    resetarSessao(telefone);
    return enviarMensagem(telefone, MENU_PRINCIPAL);
  }

  if (texto.toUpperCase() === 'AGENDAR' && sessao.etapa === 'conversando_com_lissa') {
    setSessao(telefone, { etapa: 'aguardando_tipo_cliente', acao: 'agendar' });
    return enviarMensagem(telefone, `Ótimo! Vamos agendar! 😊\n\nVocê já é nosso paciente?\n\n*1.* ✅ Sim, já sou paciente\n*2.* 🆕 Não, sou novo paciente`);
  }

  switch (sessao.etapa) {
    case 'menu':                               return handleMenu(telefone, texto);
    case 'conversando_com_lissa':              return handleLissa(telefone, texto, sessao);
    case 'aguardando_tipo_cliente':            return handleTipoCliente(telefone, texto, sessao);
    case 'aguardando_cpf':                     return handleCPF(telefone, texto, sessao);
    case 'aguardando_nome_novo':               return handleNomeNovo(telefone, texto, sessao);
    case 'aguardando_celular_novo':            return handleCelularNovo(telefone, texto, sessao);
    case 'aguardando_email_novo':              return handleEmailNovo(telefone, texto, sessao);
    case 'aguardando_especialidade':           return handleEspecialidade(telefone, texto, sessao);
    case 'aguardando_periodo':                 return handlePeriodo(telefone, texto, sessao);
    case 'aguardando_horario':                 return handleHorario(telefone, texto, sessao);
    case 'aguardando_confirmacao_agendamento': return handleConfirmacaoAgendamento(telefone, texto, sessao);
    case 'aguardando_cancelamento':            return handleCancelamento(telefone, texto, sessao);
    case 'aguardando_confirmacao_cancel':      return handleConfirmacaoCancel(telefone, texto, sessao);
    case 'aguardando_reagendamento':           return handleReagendamento(telefone, texto, sessao);
    case 'aguardando_faq':                     return handleFAQ(telefone, texto);
    default:
      resetarSessao(telefone);
      return enviarMensagem(telefone, MENU_PRINCIPAL);
  }
}

async function handleMenu(telefone, texto) {
  switch (texto) {
    case '1':
      setSessao(telefone, { etapa: 'conversando_com_lissa', historicoLissa: [] });
      return enviarMensagem(telefone, `Oi! Eu sou a *Lissa*, assistente virtual da Clínica Lituânia! 😊\n\nEstou aqui para te ajudar a entender nossos serviços e encontrar o melhor tratamento para você.\n\nMe conta: qual é a sua dor ou queixa hoje?`);
    case '2':
    case '3':
    case '4':
    case '5': {
      const acoes = { '2': 'agendar', '3': 'cancelar', '4': 'reagendar', '5': 'listar' };
      setSessao(telefone, { etapa: 'aguardando_tipo_cliente', acao: acoes[texto] });
      return enviarMensagem(telefone, `Você já é nosso paciente?\n\n*1.* ✅ Sim, já sou paciente\n*2.* 🆕 Não, sou novo paciente`);
    }
    case '6':
      setSessao(telefone, { etapa: 'aguardando_faq' });
      return enviarMensagem(telefone, `❓ *Dúvidas Frequentes*\n\n${listarFAQs()}\n\nDigite o número ou *0* para voltar.`);
    case '7':
      resetarSessao(telefone);
      return enviarMensagem(telefone, `📞 *Falar com a equipe*\n\nClique no número abaixo para ligar:\n\n${TELEFONE_CLINICA}\n\nHorário: Segunda a Sexta, 7h às 20h 😊`);
    default:
      return enviarMensagem(telefone, `Opção inválida.\n\n${MENU_PRINCIPAL}`);
  }
}

async function handleLissa(telefone, texto, sessao) {
  const historico = sessao.historicoLissa || [];
  historico.push({ role: 'user', content: texto });
  await enviarMensagem(telefone, '...');
  const resposta = await consultarIA(historico);
  if (!resposta) {
    return enviarMensagem(telefone, `Desculpe, tive um probleminha técnico. 😅\n\n${CONTATO_HUMANO}\n\n*0* para voltar ao menu.`);
  }
  historico.push({ role: 'assistant', content: resposta });
  setSessao(telefone, { historicoLissa: historico });
  if (historico.length >= 12) {
    await enviarMensagem(telefone, resposta);
    return enviarMensagem(telefone, `💬 Para um atendimento mais personalizado:\n\n${CONTATO_HUMANO}\n\nOu *0* para voltar ao menu.`);
  }
  return enviarMensagem(telefone, resposta);
}

async function handleTipoCliente(telefone, texto, sessao) {
  // Verifica se já conhecemos esse paciente pelo telefone
 const clienteSalvo = await buscarClientePorTelefone(telefone);
  if (clienteSalvo) {
    setSessao(telefone, { cliente: clienteSalvo });
    await enviarMensagem(telefone, `Olá de novo, *${clienteSalvo.Nome}*! 😊`);
    switch (sessao.acao) {
      case 'agendar':  return iniciarFluxoAgendamento(telefone, clienteSalvo);
      case 'cancelar': return mostrarAgendamentos(telefone, clienteSalvo, 'cancelar');
      case 'reagendar':return mostrarAgendamentos(telefone, clienteSalvo, 'reagendar');
      case 'listar':   return mostrarAgendamentos(telefone, clienteSalvo, 'listar');
    }
  }

  if (texto === '1') {
    setSessao(telefone, { etapa: 'aguardando_cpf' });
    return enviarMensagem(telefone, `Por favor, informe seu *CPF* (somente números):\n\nExemplo: 12345678901`);
  }
  if (texto === '2') {
    setSessao(telefone, { etapa: 'aguardando_nome_novo' });
    return enviarMensagem(telefone, `Ótimo! Vamos criar seu cadastro. 😊\n\nQual é o seu *nome completo*?`);
  }
  return enviarMensagem(telefone, `Opção inválida. Digite *1* para paciente existente ou *2* para novo paciente.`);
}


async function handleCPF(telefone, texto, sessao) {
  if (!validarCPF(texto)) return enviarMensagem(telefone, `CPF inválido. Informe apenas os *11 números*.\n\nExemplo: 12345678901`);
  const cpf = limparCPF(texto);
  await enviarMensagem(telefone, '🔍 Buscando seus dados...');
  const cliente = await fisiosoft.buscarClientePorCPF(cpf);
  if (!cliente) return enviarMensagem(telefone,
    `❌ CPF *${formatarCPF(cpf)}* não encontrado.\n\nVerifique o CPF ou *0* para voltar ao menu.\n\n${CONTATO_HUMANO}`
  );
  // Salva cliente no cache vinculado ao telefone
  salvarClientePorTelefone(telefone, cliente);
  setSessao(telefone, { cliente });
  switch (sessao.acao) {
    case 'agendar':  return iniciarFluxoAgendamento(telefone, cliente);
    case 'cancelar': return mostrarAgendamentos(telefone, cliente, 'cancelar');
    case 'reagendar':return mostrarAgendamentos(telefone, cliente, 'reagendar');
    case 'listar':   return mostrarAgendamentos(telefone, cliente, 'listar');
  }
}

async function handleNomeNovo(telefone, texto, sessao) {
  if (texto.length < 3) return enviarMensagem(telefone, `Nome muito curto. Informe seu *nome completo*:`);
  setSessao(telefone, { etapa: 'aguardando_celular_novo', nomeNovo: texto });
  return enviarMensagem(telefone, `Olá, *${texto}*! 😊\n\nQual é o seu *celular* com DDD?\n\nExemplo: 11999999999`);
}

async function handleCelularNovo(telefone, texto, sessao) {
  const celular = texto.replace(/\D/g, '');
  if (celular.length < 10) return enviarMensagem(telefone, `Celular inválido. Informe com DDD.\n\nExemplo: 11999999999`);
  setSessao(telefone, { etapa: 'aguardando_email_novo', celularNovo: celular });
  return enviarMensagem(telefone, `Qual é o seu *e-mail*?\n\n_Digite *pular* se preferir não informar._`);
}

async function handleEmailNovo(telefone, texto, sessao) {
  const email = texto.toLowerCase() === 'pular' ? '' : texto;
  await enviarMensagem(telefone, '⏳ Criando seu cadastro...');
  const novoCliente = await fisiosoft.incluirCliente({ Nome: sessao.nomeNovo, Celular: sessao.celularNovo, Email: email });
  if (!novoCliente) {
    resetarSessao(telefone);
    return enviarMensagem(telefone, `❌ Erro ao criar cadastro.\n\n${CONTATO_HUMANO}\n\n*0* para voltar ao menu.`);
  }
  const cliente = { Id: novoCliente, Nome: sessao.nomeNovo };
  salvarClientePorTelefone(telefone, cliente);
  setSessao(telefone, { cliente });
  await enviarMensagem(telefone, `✅ Cadastro criado com sucesso, *${sessao.nomeNovo}*! 🎉`);
  return iniciarFluxoAgendamento(telefone, cliente);
}

// ─── Fluxo de Agendamento ─────────────────────────────────────────────────────

async function iniciarFluxoAgendamento(telefone, cliente) {
  setSessao(telefone, { etapa: 'aguardando_especialidade', cliente });
  return enviarMensagem(telefone,
    `✅ Olá, *${cliente.Nome}*!\n\nQual especialidade deseja agendar?\n\n` +
    `*1.* 🦴 Fisioterapia\n` +
    `*2.* 🏊 Hidroterapia\n` +
    `*3.* 🧘 Pilates\n` +
    `*4.* 📐 RPG\n` +
    `*5.* 🪡 Acupuntura\n` +
    `*6.* 🩺 Consulta Vascular\n` +
    `*7.* 💆 Drenagem / Massagem Relaxante\n\n` +
    `*0* para voltar ao menu`
  );
}

async function handleEspecialidade(telefone, texto, sessao) {
  const especialidade = AGENDAS_POR_ESPECIALIDADE[texto];
  if (!especialidade) return enviarMensagem(telefone, `Opção inválida. Digite um número entre 1 e 7.`);

  // Registra lead com especialidade de interesse
  await registrarLead(telefone, sessao.cliente?.Nome, especialidade.nome);

  if (especialidade.periodos.length === 1) {
    const agenda = especialidade.periodos[0];
    const dias = especialidade.diasBusca || 7;
    return buscarEMostrarHorarios(telefone, sessao.cliente, agenda, dias);
  }

  const lista = especialidade.periodos.map((p, i) => `*${i+1}.* ${p.label}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_periodo', especialidade });
  return enviarMensagem(telefone, `✅ *${especialidade.nome}*\n\nQual período prefere?\n\n${lista}\n\nDigite o número:`);
}

async function handlePeriodo(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  const periodos = sessao.especialidade.periodos;
  if (isNaN(index) || index < 0 || index >= periodos.length) {
    return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${periodos.length}.`);
  }
  const agenda = periodos[index];
  const dias = sessao.especialidade.diasBusca || 7;
  return buscarEMostrarHorarios(telefone, sessao.cliente, agenda, dias);
}

async function buscarEMostrarHorarios(telefone, cliente, agenda, dias) {
  await enviarMensagem(telefone, `🔍 Buscando horários disponíveis nos próximos ${dias} dias...`);
  
  const horarios = await buscarProximosHorarios(agenda.agendaId, agenda.procedimentoId, dias);

  if (!horarios || horarios.length === 0) {
    return enviarMensagem(telefone,
      `😔 Não encontrei horários disponíveis nos próximos ${dias} dias para *${agenda.agendaNome}*.\n\n${CONTATO_HUMANO}\n\n*0* para voltar ao menu.`
    );
  }

  const lista = horarios.map((h, i) =>
    `*${i+1}.* ${h.diaSemana} ${h.data} às ${h.hora}`
  ).join('\n');

  setSessao(telefone, { etapa: 'aguardando_horario', agendaSelecionada: agenda, horariosDisponiveis: horarios, cliente });
  return enviarMensagem(telefone,
    `✅ *Horários disponíveis — ${agenda.agendaNome}:*\n\n${lista}\n\nDigite o número do horário desejado ou *0* para voltar.`
  );
}

async function handleHorario(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.horariosDisponiveis.length) {
    return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.horariosDisponiveis.length}.`);
  }
  const horarioEscolhido = sessao.horariosDisponiveis[index];
  setSessao(telefone, { etapa: 'aguardando_confirmacao_agendamento', horarioEscolhido });
  return enviarMensagem(telefone,
    `📋 *Confirme o agendamento:*\n\n` +
    `👤 ${sessao.cliente.Nome}\n` +
    `💆 ${sessao.agendaSelecionada.agendaNome}\n` +
    `📅 ${horarioEscolhido.diaSemana} ${horarioEscolhido.data}\n` +
    `🕐 ${horarioEscolhido.hora}\n\n` +
    `*1* confirmar | *2* cancelar`
  );
}

async function handleConfirmacaoAgendamento(telefone, texto, sessao) {
  if (texto === '2') { resetarSessao(telefone); return enviarMensagem(telefone, `Cancelado.\n\n${MENU_PRINCIPAL}`); }
  if (texto !== '1') return enviarMensagem(telefone, 'Digite *1* para confirmar ou *2* para cancelar.');
  await enviarMensagem(telefone, '⏳ Realizando agendamento...');
  const resultado = await fisiosoft.incluirAgendamento({
    IdCliente:      sessao.cliente.Id,
    IdAgenda:       sessao.agendaSelecionada.agendaId,
    IdProcedimento: sessao.agendaSelecionada.procedimentoId,
    IdProfissional: sessao.agendaSelecionada.idProfissional,
    Data:           sessao.horarioEscolhido.data,
    Hora:           sessao.horarioEscolhido.hora,
  });
  resetarSessao(telefone);
  if (!resultado) return enviarMensagem(telefone, `❌ Erro ao agendar.\n\n${CONTATO_HUMANO}`);
  
  // Marca que o paciente agendou — remove do remarketing
  await marcarAgendou(telefone);

  return enviarMensagem(telefone,
    `✅ *Agendamento confirmado!*\n\n`
    `👤 ${sessao.cliente.Nome}\n` +
    `💆 ${sessao.agendaSelecionada.agendaNome}\n` +
    `📅 ${sessao.horarioEscolhido.diaSemana} ${sessao.horarioEscolhido.data} às ${sessao.horarioEscolhido.hora}\n\n` +
    `Até lá! 😊\n\n_Clínica Lituânia — (11) 2268-3195_`
  );
}

// ─── Agendamentos ─────────────────────────────────────────────────────────────

async function mostrarAgendamentos(telefone, cliente, acao) {
  await enviarMensagem(telefone, '🔍 Buscando agendamentos...');
  const agendamentos = await fisiosoft.listarAgendamentosCliente(cliente.Id);
  if (!agendamentos || agendamentos.length === 0) {
    resetarSessao(telefone);
    return enviarMensagem(telefone, `📭 Sem agendamentos futuros, *${cliente.Nome}*.\n\n*2* para agendar | *0* para voltar.`);
  }
  const lista = agendamentos.map((a, i) => {
  const dataHora = a.DataHoraInicio ? a.DataHoraInicio.split(' ') : ['', ''];
  const data = dataHora[0] || '';
  const hora = dataHora[1] ? dataHora[1].substring(0, 5) : '';
  return `*${i+1}.* ${data} às ${hora} - ${a.Procedimento || 'Consulta'}`;
}).join('\n');
  if (acao === 'listar') { resetarSessao(telefone); return enviarMensagem(telefone, `📅 *Seus agendamentos:*\n\n${lista}\n\n*0* para voltar.`); }
  const emoji = acao === 'cancelar' ? '❌' : '🔄';
  const textoAcao = acao === 'cancelar' ? 'cancelar' : 'reagendar';
  setSessao(telefone, { etapa: acao === 'cancelar' ? 'aguardando_cancelamento' : 'aguardando_reagendamento', agendamentos });
  return enviarMensagem(telefone, `${emoji} Qual deseja *${textoAcao}*?\n\n${lista}\n\nDigite o número ou *0* para voltar.`);
}

async function handleCancelamento(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.agendamentos.length) {
    return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.agendamentos.length}.`);
  }
  const ag = sessao.agendamentos[index];
  setSessao(telefone, { etapa: 'aguardando_confirmacao_cancel', agendamentoParaCancelar: ag });
  
  // Extrai data e hora do DataHoraInicio
  const dataHora = ag.DataHoraInicio ? ag.DataHoraInicio.split(' ') : ['', ''];
  const data = dataHora[0] || '';
  const hora = dataHora[1] ? dataHora[1].substring(0, 5) : '';

  return enviarMensagem(telefone,
    `⚠️ Cancelar este agendamento?\n\n` +
    `👤 ${ag.Cliente || sessao.cliente.Nome}\n` +
    `📅 ${data} às ${hora}\n` +
    `💆 ${ag.Procedimento || 'Consulta'}\n\n` +
    `*1* confirmar | *2* manter`
  );
}

async function handleConfirmacaoCancel(telefone, texto, sessao) {
  if (texto === '2') { resetarSessao(telefone); return enviarMensagem(telefone, `Mantido!\n\n${MENU_PRINCIPAL}`); }
  if (texto !== '1') return enviarMensagem(telefone, 'Digite *1* para confirmar ou *2* para manter.');
  await enviarMensagem(telefone, '⏳ Cancelando...');
  const resultado = await fisiosoft.desmarcarAgendamento(sessao.agendamentoParaCancelar.IdAgendamento);
  resetarSessao(telefone);
  if (!resultado) return enviarMensagem(telefone, `❌ Erro ao cancelar.\n\n${CONTATO_HUMANO}`);
  return enviarMensagem(telefone, `✅ Cancelado com sucesso!\n\n${MENU_PRINCIPAL}`);
}
async function handleReagendamento(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.agendamentos.length) {
    return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.agendamentos.length}.`);
  }
  const ag = sessao.agendamentos[index];
  await fisiosoft.desmarcarAgendamento(ag.IdAgendamento);

  // Busca agenda correspondente
 const agendaSelecionada = { agendaId: ag.IdAgenda, procedimentoId: ag.IdProcedimento, idProfissional: ag.IdProfissional, agendaNome: ag.Procedimento };
  return buscarEMostrarHorarios(telefone, sessao.cliente, agendaSelecionada, 7);
}

async function handleFAQ(telefone, texto) {
  const resposta = buscarResposta(texto);
  if (!resposta) return enviarMensagem(telefone, `Opção inválida.\n\n${listarFAQs()}\n\n*0* para voltar.`);
  return enviarMensagem(telefone, `${resposta}\n\n_Outra dúvida? Digite o número ou *0* para voltar._`);
}

module.exports = { processarMensagem };
