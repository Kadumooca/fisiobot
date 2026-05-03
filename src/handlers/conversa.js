const { getSessao, setSessao, resetarSessao } = require('../utils/sessao');
const { enviarMensagem } = require('../services/whatsapp');
const fisiosoft = require('../services/fisiosoft');
const { consultarIA } = require('../services/ia');
const { validarCPF, limparCPF, formatarCPF, validarData } = require('../utils/formatters');
const { listarFAQs, buscarResposta } = require('../utils/faq');

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

// Mapeamento de especialidades → períodos → agendas
const AGENDAS_POR_ESPECIALIDADE = {
  '1': { // Fisioterapia
    nome: 'Fisioterapia',
    periodos: [
      { label: '🌅 Manhã (7h às 11h)', agendaId: 1, agendaNome: 'EDUARDO - FISIOTERAPIA' },
      { label: '🌆 Tarde (15h às 18h)', agendaId: 29, agendaNome: 'EDSON - FISIOTERAPIA' },
    ]
  },
  '2': { // Hidroterapia
    nome: 'Hidroterapia',
    periodos: [
      { label: '🌅 Manhã (7h às 13h)', agendaId: 20, agendaNome: 'ELAINE - HIDROTERAPIA' },
      { label: '🌆 Tarde (13h às 20h)', agendaId: 4, agendaNome: 'FABIOLA - HIDROTERAPIA' },
    ]
  },
  '3': { // Pilates
    nome: 'Pilates',
    periodos: [
      { label: '🌅 Manhã (7h às 12h)', agendaId: 28, agendaNome: 'CARINA - PILATES' },
      { label: '🌆 Tarde (15h às 19h)', agendaId: 7, agendaNome: 'ALDINE - PILATES' },
    ]
  },
  '4': { // RPG
    nome: 'RPG',
    periodos: [
      { label: '🌅 Manhã quinta-feira (8h às 11h)', agendaId: 6, agendaNome: 'MELINA - RPG' },
      { label: '🌆 Tarde seg-quinta (15h às 19h)', agendaId: 6, agendaNome: 'MELINA - RPG' },
    ]
  },
  '5': { // Acupuntura
    nome: 'Acupuntura',
    periodos: [
      { label: '📋 Ver horários disponíveis', agendaId: 8, agendaNome: 'RITA - ACUPUNTURA' },
    ]
  },
  '6': { // Vascular
    nome: 'Consulta Vascular',
    periodos: [
      { label: '📋 Ver horários disponíveis', agendaId: 11, agendaNome: 'DR CARLOS - VASCULAR' },
    ]
  },
  '7': { // Drenagem
    nome: 'Drenagem / Massagem',
    periodos: [
      { label: '📋 Ver horários disponíveis', agendaId: 1, agendaNome: 'DRENAGEM' },
    ]
  },
};

async function processarMensagem(telefone, mensagem) {
  const texto = mensagem.trim();
  const sessao = getSessao(telefone);

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
    case 'aguardando_data':                    return handleData(telefone, texto, sessao);
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
    `❌ CPF *${formatarCPF(cpf)}* não encontrado.\n\nVerifique o CPF ou digite *2* para se cadastrar.\n\n${CONTATO_HUMANO}\n\n*0* para voltar ao menu.`
  );
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
    `*7.* 💆 Drenagem / Massagem\n\n` +
    `*0* para voltar ao menu`
  );
}

async function handleEspecialidade(telefone, texto, sessao) {
  const especialidade = AGENDAS_POR_ESPECIALIDADE[texto];
  if (!especialidade) return enviarMensagem(telefone, `Opção inválida. Digite um número entre 1 e 7.`);

  // Se só tem um período, vai direto para data
  if (especialidade.periodos.length === 1) {
    const agenda = especialidade.periodos[0];
    setSessao(telefone, { etapa: 'aguardando_data', agendaSelecionada: agenda });
    return enviarMensagem(telefone, `✅ *${especialidade.nome}*\n\n📅 Para qual data deseja agendar?\n\nFormato *DD/MM/AAAA*:`);
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
  const agendaSelecionada = periodos[index];
  setSessao(telefone, { etapa: 'aguardando_data', agendaSelecionada });
  return enviarMensagem(telefone, `✅ *${agendaSelecionada.label}*\n\n📅 Para qual data deseja agendar?\n\nFormato *DD/MM/AAAA*:`);
}

async function handleData(telefone, texto, sessao) {
  if (!validarData(texto)) return enviarMensagem(telefone, `Data inválida. Use o formato *DD/MM/AAAA*.\n\nExemplo: 15/05/2025`);
  await enviarMensagem(telefone, '🔍 Buscando horários...');
  const horarios = await fisiosoft.buscarHorariosDisponiveis(sessao.agendaSelecionada.agendaId, texto);
  if (!horarios || horarios.length === 0) {
    return enviarMensagem(telefone, `😔 Sem horários disponíveis para *${texto}*.\n\nTente outra data ou *0* para voltar.\n\n${CONTATO_HUMANO}`);
  }
  const lista = horarios.map((h, i) => `*${i+1}.* ${h.Hora}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_horario', dataSelecionada: texto, horarios });
  return enviarMensagem(telefone, `✅ Horários disponíveis para *${texto}*:\n\n${lista}\n\nDigite o número:`);
}

async function handleHorario(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.horarios.length) {
    return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.horarios.length}.`);
  }
  const horarioEscolhido = sessao.horarios[index];
  setSessao(telefone, { etapa: 'aguardando_confirmacao_agendamento', horarioEscolhido });
  return enviarMensagem(telefone,
    `📋 *Confirme o agendamento:*\n\n` +
    `👤 ${sessao.cliente.Nome}\n` +
    `💆 ${sessao.agendaSelecionada.agendaNome}\n` +
    `📅 ${sessao.dataSelecionada}\n` +
    `🕐 ${horarioEscolhido.Hora}\n\n` +
    `*1* confirmar | *2* cancelar`
  );
}

async function handleConfirmacaoAgendamento(telefone, texto, sessao) {
  if (texto === '2') { resetarSessao(telefone); return enviarMensagem(telefone, `Cancelado.\n\n${MENU_PRINCIPAL}`); }
  if (texto !== '1') return enviarMensagem(telefone, 'Digite *1* para confirmar ou *2* para cancelar.');
  await enviarMensagem(telefone, '⏳ Realizando agendamento...');
  const resultado = await fisiosoft.incluirAgendamento({
    ClienteId: sessao.cliente.Id,
    AgendaId:  sessao.agendaSelecionada.agendaId,
    Data:      sessao.dataSelecionada,
    Hora:      sessao.horarioEscolhido.Hora,
  });
  resetarSessao(telefone);
  if (!resultado) return enviarMensagem(telefone, `❌ Erro ao agendar.\n\n${CONTATO_HUMANO}`);
  return enviarMensagem(telefone,
    `✅ *Agendamento confirmado!*\n\n` +
    `👤 ${sessao.cliente.Nome}\n` +
    `💆 ${sessao.agendaSelecionada.agendaNome}\n` +
    `📅 ${sessao.dataSelecionada} às ${sessao.horarioEscolhido.Hora}\n\n` +
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
  const lista = agendamentos.map((a, i) => `*${i+1}.* ${a.Data} às ${a.Hora} - ${a.Procedimento || 'Consulta'} com ${a.Profissional || ''}`).join('\n');
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
  return enviarMensagem(telefone, `⚠️ Cancelar este agendamento?\n\n📅 *${ag.Data}* às *${ag.Hora}*\n👨‍⚕️ ${ag.Profissional || 'Profissional'}\n\n*1* confirmar | *2* manter`);
}

async function handleConfirmacaoCancel(telefone, texto, sessao) {
  if (texto === '2') { resetarSessao(telefone); return enviarMensagem(telefone, `Mantido!\n\n${MENU_PRINCIPAL}`); }
  if (texto !== '1') return enviarMensagem(telefone, 'Digite *1* para confirmar ou *2* para manter.');
  await enviarMensagem(telefone, '⏳ Cancelando...');
  const resultado = await fisiosoft.desmarcarAgendamento(sessao.agendamentoParaCancelar.Id);
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
  await fisiosoft.desmarcarAgendamento(ag.Id);
  setSessao(telefone, {
    etapa: 'aguardando_data',
    cliente: sessao.cliente,
    agendaSelecionada: { agendaId: ag.AgendaId, agendaNome: ag.Profissional },
  });
  return enviarMensagem(telefone, `🔄 Agendamento de *${ag.Data}* removido.\n\nInforme a *nova data* (DD/MM/AAAA):`);
}

async function handleFAQ(telefone, texto) {
  const resposta = buscarResposta(texto);
  if (!resposta) return enviarMensagem(telefone, `Opção inválida.\n\n${listarFAQs()}\n\n*0* para voltar.`);
  return enviarMensagem(telefone, `${resposta}\n\n_Outra dúvida? Digite o número ou *0* para voltar._`);
}

module.exports = { processarMensagem };
