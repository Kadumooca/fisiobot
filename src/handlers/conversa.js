const { getSessao, setSessao, resetarSessao } = require('../utils/sessao');
const { enviarMensagem } = require('../services/whatsapp');
const fisiosoft = require('../services/fisiosoft');
const { validarCPF, limparCPF, formatarCPF, validarData } = require('../utils/formatters');
const { listarFAQs, buscarResposta } = require('../utils/faq');

const MENU_PRINCIPAL = `👋 Olá! Bem-vindo(a) à nossa clínica!

Como posso te ajudar hoje?

*1.* 📅 Agendar consulta
*2.* ❌ Cancelar agendamento
*3.* 🔄 Reagendar consulta
*4.* 🗓️ Ver meus agendamentos
*5.* ❓ Dúvidas frequentes
*0.* 🔚 Encerrar atendimento

Digite o número da opção desejada.`;

const PEDIR_CPF = `Para continuar, preciso te identificar.

Por favor, informe seu *CPF* (somente números):`;

const PALAVRAS_ATIVACAO = ['olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'oi', 'menu', 'voltar'];

async function processarMensagem(telefone, mensagem) {
  const texto = mensagem.trim();
  const textoLower = texto.toLowerCase();
  const sessao = getSessao(telefone);

  // Se o atendimento foi encerrado, só reativa com palavras de ativação
  if (sessao.etapa === 'encerrado') {
    const ativou = PALAVRAS_ATIVACAO.some(p => textoLower === p || textoLower.startsWith(p));
    if (ativou) {
      resetarSessao(telefone);
      return enviarMensagem(telefone, MENU_PRINCIPAL);
    }
    // Ignora silenciosamente qualquer outra mensagem
    return;
  }

  // Encerrar atendimento ao digitar 0
  if (texto === '0' || textoLower === 'sair') {
    setSessao(telefone, { etapa: 'encerrado' });
    return enviarMensagem(telefone, `✅ Atendimento encerrado. Até logo! 😊\n\nQuando quiser ser atendido novamente, é só nos enviar um *Olá*.`);
  }

  // Voltar ao menu sem encerrar (palavras de navegação, exceto 0)
  if (['menu', 'voltar'].includes(textoLower)) {
    resetarSessao(telefone);
    return enviarMensagem(telefone, MENU_PRINCIPAL);
  }

  switch (sessao.etapa) {
    case 'menu':                               return handleMenu(telefone, texto);
    case 'aguardando_cpf':                     return handleCPF(telefone, texto, sessao);
    case 'aguardando_agenda':                  return handleAgenda(telefone, texto, sessao);
    case 'aguardando_profissional':            return handleProfissional(telefone, texto, sessao);
    case 'aguardando_procedimento':            return handleProcedimento(telefone, texto, sessao);
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
    case '1': setSessao(telefone, { etapa: 'aguardando_cpf', acao: 'agendar' });  return enviarMensagem(telefone, PEDIR_CPF);
    case '2': setSessao(telefone, { etapa: 'aguardando_cpf', acao: 'cancelar' }); return enviarMensagem(telefone, PEDIR_CPF);
    case '3': setSessao(telefone, { etapa: 'aguardando_cpf', acao: 'reagendar' });return enviarMensagem(telefone, PEDIR_CPF);
    case '4': setSessao(telefone, { etapa: 'aguardando_cpf', acao: 'listar' });   return enviarMensagem(telefone, PEDIR_CPF);
    case '5':
      setSessao(telefone, { etapa: 'aguardando_faq' });
      return enviarMensagem(telefone, `❓ *Dúvidas Frequentes*\n\n${listarFAQs()}\n\nDigite o número da pergunta ou *0* para voltar ao menu.`);
    default:
      return enviarMensagem(telefone, `Opção inválida. Por favor escolha uma das opções:\n\n${MENU_PRINCIPAL}`);
  }
}

async function handleCPF(telefone, texto, sessao) {
  if (!validarCPF(texto)) {
    return enviarMensagem(telefone, `CPF inválido. Informe apenas os *11 números* do CPF.\n\nExemplo: 12345678901`);
  }

  const cpf = limparCPF(texto);
  await enviarMensagem(telefone, '🔍 Aguarde, buscando seus dados...');

  const cliente = await fisiosoft.buscarClientePorCPF(cpf);

  if (!cliente) {
    return enviarMensagem(telefone,
      `❌ Não encontrei cadastro com o CPF *${formatarCPF(cpf)}*.\n\nVerifique o CPF ou entre em contato com a recepção.\n\nDigite *0* para voltar ao menu.`
    );
  }

  setSessao(telefone, { cliente });

  switch (sessao.acao) {
    case 'agendar':  return iniciarFluxoAgendamento(telefone, cliente);
    case 'cancelar': return mostrarAgendamentos(telefone, cliente, 'cancelar');
    case 'reagendar':return mostrarAgendamentos(telefone, cliente, 'reagendar');
    case 'listar':   return mostrarAgendamentos(telefone, cliente, 'listar');
  }
}

async function iniciarFluxoAgendamento(telefone, cliente) {
  await enviarMensagem(telefone, `✅ Olá, *${cliente.Nome}*! Encontrei seu cadastro.\n\n🔍 Buscando agendas...`);

  const agendas = await fisiosoft.listarAgendas();
  if (!agendas || agendas.length === 0) {
    resetarSessao(telefone);
    return enviarMensagem(telefone, `😔 Nenhuma agenda disponível.\n\nEntre em contato com a recepção.\n\nDigite *0* para voltar ao menu.`);
  }

  if (agendas.length === 1) {
    setSessao(telefone, { agendaSelecionada: agendas[0] });
    return selecionarProfissional(telefone);
  }

  const lista = agendas.map((a, i) => `*${i + 1}.* ${a.Nome}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_agenda', agendas });
  return enviarMensagem(telefone, `📋 Selecione a agenda:\n\n${lista}\n\nDigite o número da opção:`);
}

async function handleAgenda(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.agendas.length) {
    return enviarMensagem(telefone, `Opção inválida. Digite um número entre 1 e ${sessao.agendas.length}.`);
  }
  setSessao(telefone, { agendaSelecionada: sessao.agendas[index] });
  return selecionarProfissional(telefone);
}

async function selecionarProfissional(telefone) {
  const profissionais = await fisiosoft.listarProfissionais();
  if (!profissionais || profissionais.length === 0) {
    resetarSessao(telefone);
    return enviarMensagem(telefone, `😔 Nenhum profissional disponível.\n\nDigite *0* para voltar ao menu.`);
  }

  if (profissionais.length === 1) {
    setSessao(telefone, { profissionalSelecionado: profissionais[0] });
    return selecionarProcedimento(telefone);
  }

  const lista = profissionais.map((p, i) => `*${i + 1}.* ${p.Nome}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_profissional', profissionais });
  return enviarMensagem(telefone, `👨‍⚕️ Com qual profissional deseja agendar?\n\n${lista}\n\nDigite o número da opção:`);
}

async function handleProfissional(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.profissionais.length) {
    return enviarMensagem(telefone, `Opção inválida. Digite um número entre 1 e ${sessao.profissionais.length}.`);
  }
  setSessao(telefone, { profissionalSelecionado: sessao.profissionais[index] });
  return selecionarProcedimento(telefone);
}

async function selecionarProcedimento(telefone) {
  const procedimentos = await fisiosoft.listarProcedimentos();
  if (!procedimentos || procedimentos.length === 0) {
    resetarSessao(telefone);
    return enviarMensagem(telefone, `😔 Nenhum procedimento disponível.\n\nDigite *0* para voltar ao menu.`);
  }

  if (procedimentos.length === 1) {
    setSessao(telefone, { etapa: 'aguardando_data', procedimentoSelecionado: procedimentos[0] });
    return enviarMensagem(telefone, `📅 Para qual data deseja agendar?\n\nDigite no formato *DD/MM/AAAA*:`);
  }

  const lista = procedimentos.map((p, i) => `*${i + 1}.* ${p.Nome}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_procedimento', procedimentos });
  return enviarMensagem(telefone, `💆 Qual procedimento deseja agendar?\n\n${lista}\n\nDigite o número da opção:`);
}

async function handleProcedimento(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.procedimentos.length) {
    return enviarMensagem(telefone, `Opção inválida. Digite um número entre 1 e ${sessao.procedimentos.length}.`);
  }
  setSessao(telefone, { etapa: 'aguardando_data', procedimentoSelecionado: sessao.procedimentos[index] });
  return enviarMensagem(telefone, `📅 Para qual data deseja agendar?\n\nDigite no formato *DD/MM/AAAA*:`);
}

async function handleData(telefone, texto, sessao) {
  if (!validarData(texto)) {
    return enviarMensagem(telefone, `Data inválida. Informe no formato *DD/MM/AAAA*.\n\nExemplo: 15/05/2025`);
  }

  await enviarMensagem(telefone, '🔍 Buscando horários disponíveis...');
  const horarios = await fisiosoft.buscarHorariosDisponiveis(sessao.agendaSelecionada.Id, texto);

  if (!horarios || horarios.length === 0) {
    return enviarMensagem(telefone, `😔 Sem horários disponíveis para *${texto}*.\n\nTente outra data ou *0* para voltar ao menu.`);
  }

  const lista = horarios.map((h, i) => `*${i + 1}.* ${h.Hora}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_horario', dataSelecionada: texto, horarios });
  return enviarMensagem(telefone, `✅ Horários disponíveis para *${texto}*:\n\n${lista}\n\nDigite o número do horário:`);
}

async function handleHorario(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.horarios.length) {
    return enviarMensagem(telefone, `Opção inválida. Digite um número entre 1 e ${sessao.horarios.length}.`);
  }

  const horarioEscolhido = sessao.horarios[index];
  setSessao(telefone, { etapa: 'aguardando_confirmacao_agendamento', horarioEscolhido });

  return enviarMensagem(telefone,
    `📋 *Confirme seu agendamento:*\n\n` +
    `👤 Paciente: *${sessao.cliente.Nome}*\n` +
    `👨‍⚕️ Profissional: *${sessao.profissionalSelecionado.Nome}*\n` +
    `💆 Procedimento: *${sessao.procedimentoSelecionado.Nome}*\n` +
    `📅 Data: *${sessao.dataSelecionada}*\n` +
    `🕐 Horário: *${horarioEscolhido.Hora}*\n\n` +
    `Digite *1* para confirmar ou *2* para cancelar.`
  );
}

async function handleConfirmacaoAgendamento(telefone, texto, sessao) {
  if (texto === '2') {
    resetarSessao(telefone);
    return enviarMensagem(telefone, `Agendamento cancelado.\n\n${MENU_PRINCIPAL}`);
  }
  if (texto !== '1') return enviarMensagem(telefone, 'Digite *1* para confirmar ou *2* para cancelar.');

  await enviarMensagem(telefone, '⏳ Realizando seu agendamento...');

  const resultado = await fisiosoft.incluirAgendamento({
    ClienteId:       sessao.cliente.Id,
    AgendaId:        sessao.agendaSelecionada.Id,
    ProfissionalId:  sessao.profissionalSelecionado.Id,
    ProcedimentoId:  sessao.procedimentoSelecionado.Id,
    Data:            sessao.dataSelecionada,
    Hora:            sessao.horarioEscolhido.Hora,
  });

  resetarSessao(telefone);

  if (!resultado) {
    return enviarMensagem(telefone, `❌ Erro ao realizar agendamento. Tente novamente ou entre em contato com a recepção.\n\nDigite *0* para voltar ao menu.`);
  }

  const procedimento = sessao.procedimentoSelecionado.Nome.toUpperCase();

  // Mensagem 1 — Confirmação
  await enviarMensagem(telefone,
    `✅ *Agendamento confirmado!*\n\n` +
    `👤 ${sessao.cliente.Nome}\n` +
    `📅 ${sessao.dataSelecionada} às ${sessao.horarioEscolhido.Hora}\n` +
    `💆 ${sessao.procedimentoSelecionado.Nome}\n\n` +
    `📍 *Clínica Lituânia*\n` +
    `Rua Lituânia, 209 - Mooca\n` +
    `CEP 03184-020 - São Paulo/SP\n\n` +
    `📞 (11) 2268-3195\n` +
    `📱 WhatsApp: (11) 98728-1427\n\n` +
    `Até lá! 😊`
  );

  // Mensagem 2 — Orientações gerais para todos
  let roupaEspecifica = '';
  if (procedimento.includes('JOELHO') || procedimento.includes('QUADRIL')) {
    roupaEspecifica = `\n✅ *Roupa:* Bermuda ou shorts confortável`;
  } else if (procedimento.includes('OMBRO')) {
    roupaEspecifica = `\n✅ *Roupa:* Regata ou blusa de alça`;
  } else if (procedimento.includes('PILATES')) {
    roupaEspecifica = `\n✅ *Roupa:* Roupa leve e sapatilha`;
  } else if (procedimento.includes('RPG')) {
    roupaEspecifica = `\n✅ *Roupa:* Roupa leve para ginástica`;
  } else {
    roupaEspecifica = `\n✅ *Roupa:* Roupa leve e adequada para o tratamento`;
  }

  await enviarMensagem(telefone,
    `📋 *Orientações para sua consulta:*\n\n` +
    `📁 Traga seus *exames* e *encaminhamento médico* (se houver)` +
    roupaEspecifica
  );

  // Mensagem 3 — Orientações específicas da Hidroterapia
  if (procedimento.includes('HIDROTERAPIA')) {
    await enviarMensagem(telefone,
      `🏊 *Orientações para Hidroterapia:*\n\n` +
      `✅ *Traje obrigatório:* Sunga ou maiô, touca, chinelo, roupão e toalha\n` +
      `❌ *Proibido adornos:* Brincos, correntes, pulseiras, anéis, etc\n` +
      `❌ *Proibido na piscina:* Cremes, óleos corporais e produtos de perfumaria\n` +
      `⚠️ *Atenção:* Ferimentos, uso de sondas ou alergias de pele impedem o uso da piscina`
    );
  }

  return enviarMensagem(telefone,
    `📌 *Informação importante:*\n\n` +
    `O horário agendado é *pontual e não fixo*. Para dar continuidade ao seu tratamento, as próximas sessões deverão ser agendadas diretamente na clínica, conforme a disponibilidade de agenda.\n\n` +
    `Nossa secretaria ficará feliz em te ajudar a garantir a sequência do seu tratamento! 🤝\n\n` +
    `📞 (11) 2268-3195\n` +
    `📱 WhatsApp: (11) 98728-1427\n\n` +
    `Digite *0* para encerrar.`
  );
}

async function mostrarAgendamentos(telefone, cliente, acao) {
  await enviarMensagem(telefone, `🔍 Buscando seus agendamentos...`);
  const agendamentos = await fisiosoft.listarAgendamentosCliente(cliente.Id);

  if (!agendamentos || agendamentos.length === 0) {
    resetarSessao(telefone);
    return enviarMensagem(telefone, `📭 Você não possui agendamentos futuros, *${cliente.Nome}*.\n\nDigite *1* para agendar ou *0* para voltar ao menu.`);
  }

  const lista = agendamentos
    .map((a, i) => `*${i + 1}.* ${a.Data} às ${a.Hora} - ${a.Procedimento || 'Fisioterapia'} com ${a.Profissional || ''}`)
    .join('\n');

  if (acao === 'listar') {
    resetarSessao(telefone);
    return enviarMensagem(telefone, `📅 *Seus próximos agendamentos, ${cliente.Nome}:*\n\n${lista}\n\nDigite *0* para voltar ao menu.`);
  }

  const emoji = acao === 'cancelar' ? '❌' : '🔄';
  const textoAcao = acao === 'cancelar' ? 'cancelar' : 'reagendar';
  const proximaEtapa = acao === 'cancelar' ? 'aguardando_cancelamento' : 'aguardando_reagendamento';

  setSessao(telefone, { etapa: proximaEtapa, agendamentos });
  return enviarMensagem(telefone, `${emoji} Qual agendamento deseja *${textoAcao}*?\n\n${lista}\n\nDigite o número ou *0* para voltar ao menu.`);
}

async function handleCancelamento(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.agendamentos.length) {
    return enviarMensagem(telefone, `Opção inválida. Digite um número entre 1 e ${sessao.agendamentos.length}.`);
  }
  const agendamento = sessao.agendamentos[index];
  setSessao(telefone, { etapa: 'aguardando_confirmacao_cancel', agendamentoParaCancelar: agendamento });
  return enviarMensagem(telefone,
    `⚠️ Tem certeza que deseja *cancelar*?\n\n📅 *${agendamento.Data}* às *${agendamento.Hora}*\n💆 ${agendamento.Procedimento || 'Fisioterapia'}\n\nDigite *1* para confirmar ou *2* para manter.`
  );
}

async function handleConfirmacaoCancel(telefone, texto, sessao) {
  if (texto === '2') {
    resetarSessao(telefone);
    return enviarMensagem(telefone, `Cancelamento desistido.\n\n${MENU_PRINCIPAL}`);
  }
  if (texto !== '1') return enviarMensagem(telefone, 'Digite *1* para confirmar ou *2* para manter.');

  await enviarMensagem(telefone, '⏳ Cancelando agendamento...');
  const resultado = await fisiosoft.desmarcarAgendamento(sessao.agendamentoParaCancelar.Id);
  resetarSessao(telefone);

  if (!resultado) {
    return enviarMensagem(telefone, `❌ Erro ao cancelar. Entre em contato com a recepção.\n\nDigite *0* para voltar ao menu.`);
  }
  return enviarMensagem(telefone, `✅ Agendamento cancelado com sucesso!\n\nDigite *1* para fazer novo agendamento.\n\n${MENU_PRINCIPAL}`);
}

async function handleReagendamento(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.agendamentos.length) {
    return enviarMensagem(telefone, `Opção inválida. Digite um número entre 1 e ${sessao.agendamentos.length}.`);
  }

  const agendamento = sessao.agendamentos[index];
  await fisiosoft.desmarcarAgendamento(agendamento.Id);

  setSessao(telefone, {
    etapa: 'aguardando_data',
    cliente: sessao.cliente,
    agendaSelecionada:     { Id: agendamento.AgendaId,       Nome: agendamento.Agenda },
    profissionalSelecionado: { Id: agendamento.ProfissionalId, Nome: agendamento.Profissional },
    procedimentoSelecionado: { Id: agendamento.ProcedimentoId, Nome: agendamento.Procedimento },
  });

  return enviarMensagem(telefone, `🔄 Agendamento de *${agendamento.Data}* às *${agendamento.Hora}* removido.\n\nInforme a *nova data* no formato *DD/MM/AAAA*:`);
}

async function handleFAQ(telefone, texto) {
  const resposta = buscarResposta(texto);
  if (!resposta) {
    return enviarMensagem(telefone, `Opção inválida. Escolha um número da lista ou *0* para voltar ao menu.\n\n${listarFAQs()}`);
  }
  return enviarMensagem(telefone, `${resposta}\n\n_Digite o número de outra dúvida ou *0* para voltar ao menu._`);
}

module.exports = { processarMensagem };
