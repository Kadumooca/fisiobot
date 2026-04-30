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

async function processarMensagem(telefone, mensagem) {
  const texto = mensagem.trim();
  const sessao = getSessao(telefone);
  if (['menu','voltar','0','sair'].includes(texto.toLowerCase())) {
    resetarSessao(telefone);
    return enviarMensagem(telefone, MENU_PRINCIPAL);
  }
  switch (sessao.etapa) {
    case 'menu': return handleMenu(telefone, texto);
    case 'aguardando_cpf': return handleCPF(telefone, texto, sessao);
    case 'aguardando_agenda': return handleAgenda(telefone, texto, sessao);
    case 'aguardando_profissional': return handleProfissional(telefone, texto, sessao);
    case 'aguardando_procedimento': return handleProcedimento(telefone, texto, sessao);
    case 'aguardando_data': return handleData(telefone, texto, sessao);
    case 'aguardando_horario': return handleHorario(telefone, texto, sessao);
    case 'aguardando_confirmacao_agendamento': return handleConfirmacaoAgendamento(telefone, texto, sessao);
    case 'aguardando_cancelamento': return handleCancelamento(telefone, texto, sessao);
    case 'aguardando_confirmacao_cancel': return handleConfirmacaoCancel(telefone, texto, sessao);
    case 'aguardando_reagendamento': return handleReagendamento(telefone, texto, sessao);
    case 'aguardando_faq': return handleFAQ(telefone, texto);
    default: resetarSessao(telefone); return enviarMensagem(telefone, MENU_PRINCIPAL);
  }
}

async function handleMenu(telefone, texto) {
  switch (texto) {
    case '1': setSessao(telefone, { etapa: 'aguardando_cpf', acao: 'agendar' }); return enviarMensagem(telefone, PEDIR_CPF);
    case '2': setSessao(telefone, { etapa: 'aguardando_cpf', acao: 'cancelar' }); return enviarMensagem(telefone, PEDIR_CPF);
    case '3': setSessao(telefone, { etapa: 'aguardando_cpf', acao: 'reagendar' }); return enviarMensagem(telefone, PEDIR_CPF);
    case '4': setSessao(telefone, { etapa: 'aguardando_cpf', acao: 'listar' }); return enviarMensagem(telefone, PEDIR_CPF);
    case '5': setSessao(telefone, { etapa: 'aguardando_faq' }); return enviarMensagem(telefone, `❓ *Dúvidas Frequentes*\n\n${listarFAQs()}\n\nDigite o número ou *0* para voltar.`);
    default: return enviarMensagem(telefone, `Opção inválida.\n\n${MENU_PRINCIPAL}`);
  }
}

async function handleCPF(telefone, texto, sessao) {
  if (!validarCPF(texto)) return enviarMensagem(telefone, `CPF inválido. Informe apenas os *11 números*.\n\nExemplo: 12345678901`);
  const cpf = limparCPF(texto);
  await enviarMensagem(telefone, '🔍 Buscando seus dados...');
  const cliente = await fisiosoft.buscarClientePorCPF(cpf);
  if (!cliente) return enviarMensagem(telefone, `❌ CPF *${formatarCPF(cpf)}* não encontrado.\n\nVerifique ou entre em contato com a recepção.\n\n*0* para voltar ao menu.`);
  setSessao(telefone, { cliente });
  switch (sessao.acao) {
    case 'agendar': return iniciarFluxoAgendamento(telefone, cliente);
    case 'cancelar': return mostrarAgendamentos(telefone, cliente, 'cancelar');
    case 'reagendar': return mostrarAgendamentos(telefone, cliente, 'reagendar');
    case 'listar': return mostrarAgendamentos(telefone, cliente, 'listar');
  }
}

async function iniciarFluxoAgendamento(telefone, cliente) {
  await enviarMensagem(telefone, `✅ Olá, *${cliente.Nome}*!\n\n🔍 Buscando agendas...`);
  const agendas = await fisiosoft.listarAgendas();
  if (!agendas || agendas.length === 0) { resetarSessao(telefone); return enviarMensagem(telefone, `😔 Nenhuma agenda disponível.\n\n*0* para voltar.`); }
  if (agendas.length === 1) { setSessao(telefone, { agendaSelecionada: agendas[0] }); return selecionarProfissional(telefone); }
  const lista = agendas.map((a, i) => `*${i+1}.* ${a.Nome}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_agenda', agendas });
  return enviarMensagem(telefone, `📋 Selecione a agenda:\n\n${lista}\n\nDigite o número:`);
}

async function handleAgenda(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.agendas.length) return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.agendas.length}.`);
  setSessao(telefone, { agendaSelecionada: sessao.agendas[index] });
  return selecionarProfissional(telefone);
}

async function selecionarProfissional(telefone) {
  const profissionais = await fisiosoft.listarProfissionais();
  if (!profissionais || profissionais.length === 0) { resetarSessao(telefone); return enviarMensagem(telefone, `😔 Nenhum profissional disponível.\n\n*0* para voltar.`); }
  if (profissionais.length === 1) { setSessao(telefone, { profissionalSelecionado: profissionais[0] }); return selecionarProcedimento(telefone); }
  const lista = profissionais.map((p, i) => `*${i+1}.* ${p.Nome}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_profissional', profissionais });
  return enviarMensagem(telefone, `👨‍⚕️ Com qual profissional?\n\n${lista}\n\nDigite o número:`);
}

async function handleProfissional(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.profissionais.length) return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.profissionais.length}.`);
  setSessao(telefone, { profissionalSelecionado: sessao.profissionais[index] });
  return selecionarProcedimento(telefone);
}

async function selecionarProcedimento(telefone) {
  const procedimentos = await fisiosoft.listarProcedimentos();
  if (!procedimentos || procedimentos.length === 0) { resetarSessao(telefone); return enviarMensagem(telefone, `😔 Nenhum procedimento disponível.\n\n*0* para voltar.`); }
  if (procedimentos.length === 1) { setSessao(telefone, { etapa: 'aguardando_data', procedimentoSelecionado: procedimentos[0] }); return enviarMensagem(telefone, `📅 Para qual data?\n\nFormato *DD/MM/AAAA*:`); }
  const lista = procedimentos.map((p, i) => `*${i+1}.* ${p.Nome}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_procedimento', procedimentos });
  return enviarMensagem(telefone, `💆 Qual procedimento?\n\n${lista}\n\nDigite o número:`);
}

async function handleProcedimento(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.procedimentos.length) return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.procedimentos.length}.`);
  setSessao(telefone, { etapa: 'aguardando_data', procedimentoSelecionado: sessao.procedimentos[index] });
  return enviarMensagem(telefone, `📅 Para qual data?\n\nFormato *DD/MM/AAAA*:`);
}

async function handleData(telefone, texto, sessao) {
  if (!validarData(texto)) return enviarMensagem(telefone, `Data inválida. Use o formato *DD/MM/AAAA*.\n\nExemplo: 15/05/2025`);
  await enviarMensagem(telefone, '🔍 Buscando horários...');
  const horarios = await fisiosoft.buscarHorariosDisponiveis(sessao.agendaSelecionada.Id, texto);
  if (!horarios || horarios.length === 0) return enviarMensagem(telefone, `😔 Sem horários para *${texto}*.\n\nTente outra data ou *0* para voltar.`);
  const lista = horarios.map((h, i) => `*${i+1}.* ${h.Hora}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_horario', dataSelecionada: texto, horarios });
  return enviarMensagem(telefone, `✅ Horários disponíveis para *${texto}*:\n\n${lista}\n\nDigite o número:`);
}

async function handleHorario(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.horarios.length) return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.horarios.length}.`);
  const horarioEscolhido = sessao.horarios[index];
  setSessao(telefone, { etapa: 'aguardando_confirmacao_agendamento', horarioEscolhido });
  return enviarMensagem(telefone, `📋 *Confirme o agendamento:*\n\n👤 ${sessao.cliente.Nome}\n👨‍⚕️ ${sessao.profissionalSelecionado.Nome}\n💆 ${sessao.procedimentoSelecionado.Nome}\n📅 ${sessao.dataSelecionada}\n🕐 ${horarioEscolhido.Hora}\n\n*1* confirmar | *2* cancelar`);
}

async function handleConfirmacaoAgendamento(telefone, texto, sessao) {
  if (texto === '2') { resetarSessao(telefone); return enviarMensagem(telefone, `Cancelado.\n\n${MENU_PRINCIPAL}`); }
  if (texto !== '1') return enviarMensagem(telefone, 'Digite *1* para confirmar ou *2* para cancelar.');
  await enviarMensagem(telefone, '⏳ Realizando agendamento...');
  const resultado = await fisiosoft.incluirAgendamento({ ClienteId: sessao.cliente.Id, AgendaId: sessao.agendaSelecionada.Id, ProfissionalId: sessao.profissionalSelecionado.Id, ProcedimentoId: sessao.procedimentoSelecionado.Id, Data: sessao.dataSelecionada, Hora: sessao.horarioEscolhido.Hora });
  resetarSessao(telefone);
  if (!resultado) return enviarMensagem(telefone, `❌ Erro ao agendar. Tente novamente ou contate a recepção.\n\n*0* para voltar.`);
  return enviarMensagem(telefone, `✅ *Agendamento confirmado!*\n\n👤 ${sessao.cliente.Nome}\n📅 ${sessao.dataSelecionada} às ${sessao.horarioEscolhido.Hora}\n💆 ${sessao.procedimentoSelecionado.Nome}\n\nAté lá! 😊`);
}

async function mostrarAgendamentos(telefone, cliente, acao) {
  await enviarMensagem(telefone, '🔍 Buscando agendamentos...');
  const agendamentos = await fisiosoft.listarAgendamentosCliente(cliente.Id);
  if (!agendamentos || agendamentos.length === 0) { resetarSessao(telefone); return enviarMensagem(telefone, `📭 Sem agendamentos futuros, *${cliente.Nome}*.\n\n*1* para agendar | *0* para voltar.`); }
  const lista = agendamentos.map((a, i) => `*${i+1}.* ${a.Data} às ${a.Hora} - ${a.Procedimento || 'Fisioterapia'} com ${a.Profissional || ''}`).join('\n');
  if (acao === 'listar') { resetarSessao(telefone); return enviarMensagem(telefone, `📅 *Seus agendamentos:*\n\n${lista}\n\n*0* para voltar.`); }
  const emoji = acao === 'cancelar' ? '❌' : '🔄';
  const textoAcao = acao === 'cancelar' ? 'cancelar' : 'reagendar';
  setSessao(telefone, { etapa: acao === 'cancelar' ? 'aguardando_cancelamento' : 'aguardando_reagendamento', agendamentos });
  return enviarMensagem(telefone, `${emoji} Qual deseja *${textoAcao}*?\n\n${lista}\n\nDigite o número ou *0* para voltar.`);
}

async function handleCancelamento(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.agendamentos.length) return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.agendamentos.length}.`);
  const ag = sessao.agendamentos[index];
  setSessao(telefone, { etapa: 'aguardando_confirmacao_cancel', agendamentoParaCancelar: ag });
  return enviarMensagem(telefone, `⚠️ Cancelar este agendamento?\n\n📅 *${ag.Data}* às *${ag.Hora}*\n💆 ${ag.Procedimento || 'Fisioterapia'}\n\n*1* confirmar | *2* manter`);
}

async function handleConfirmacaoCancel(telefone, texto, sessao) {
  if (texto === '2') { resetarSessao(telefone); return enviarMensagem(telefone, `Mantido!\n\n${MENU_PRINCIPAL}`); }
  if (texto !== '1') return enviarMensagem(telefone, 'Digite *1* para confirmar ou *2* para manter.');
  await enviarMensagem(telefone, '⏳ Cancelando...');
  const resultado = await fisiosoft.desmarcarAgendamento(sessao.agendamentoParaCancelar.Id);
  resetarSessao(telefone);
  if (!resultado) return enviarMensagem(telefone, `❌ Erro ao cancelar. Contate a recepção.\n\n*0* para voltar.`);
  return enviarMensagem(telefone, `✅ Cancelado com sucesso!\n\n${MENU_PRINCIPAL}`);
}

async function handleReagendamento(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.agendamentos.length) return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.agendamentos.length}.`);
  const ag = sessao.agendamentos[index];
  await fisiosoft.desmarcarAgendamento(ag.Id);
  setSessao(telefone, { etapa: 'aguardando_data', cliente: sessao.cliente, agendaSelecionada: { Id: ag.AgendaId, Nome: ag.Agenda }, profissionalSelecionado: { Id: ag.ProfissionalId, Nome: ag.Profissional }, procedimentoSelecionado: { Id: ag.ProcedimentoId, Nome: ag.Procedimento } });
  return enviarMensagem(telefone, `🔄 Agendamento de *${ag.Data}* removido.\n\nInforme a *nova data* (DD/MM/AAAA):`);
}

async function handleFAQ(telefone, texto) {
  const resposta = buscarResposta(texto);
  if (!resposta) return enviarMensagem(telefone, `Opção inválida.\n\n${listarFAQs()}\n\n*0* para voltar.`);
  return enviarMensagem(telefone, `${resposta}\n\n_Outra dúvida? Digite o número ou *0* para voltar._`);
}

module.exports = { processarMensagem };
