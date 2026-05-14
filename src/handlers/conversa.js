const { getSessao, setSessao, resetarSessao } = require('../utils/sessao');
const { enviarMensagem } = require('../services/whatsapp');
const fisiosoft = require('../services/fisiosoft');
const { consultarIA } = require('../services/ia');
const { validarCPF, limparCPF, formatarCPF } = require('../utils/formatters');
const { listarFAQs, buscarResposta } = require('../utils/faq');
const {
  buscarClientePorTelefone, salvarClientePorTelefone,
  registrarLead, registrarConversa, marcarAgendou,
  marcarRespondeuRemarketing, marcarNaoReativar
} = require('../utils/clienteCache');

const CONTATO_HUMANO = `Caso prefira falar diretamente com nossa equipe:\n📞 (11) 2268-3195\n💬 WhatsApp: (11) 98728-1427\n\nHorário: Segunda a Sexta, 7h às 20h 😊`;
const ENDERECO = `📍 *Clínica Lituânia*\nRua Lituânia, 209 - Mooca\nCEP 03184-020 - São Paulo/SP\n📞 (11) 2268-3195`;

const MENU_PRINCIPAL = `━━━━━━━━━━━━━━━━━━
🏥 *Clínica Lituânia*
━━━━━━━━━━━━━━━━━━

Como posso te ajudar? 😊

1️⃣  📅 Agendar consulta
2️⃣  ❌ Cancelar agendamento
3️⃣  ❓ Dúvidas frequentes
4️⃣  👤 Falar com a Recepção

0️⃣  🔚 Encerrar atendimento
━━━━━━━━━━━━━━━━━━
_Digite o número da opção_`;

const PALAVRAS_AGRADECIMENTO = [
  'obrigado', 'obrigada', 'brigado', 'brigada', 'valeu', 'thanks',
  'agradeço', 'agradeco', 'grato', 'grata', 'muito obrigado', 'muito obrigada'
];

const FRASES_NAO_REATIVAR = [
  'vou cancelar', 'preciso cancelar', 'quero cancelar', 'vou desmarcar',
  'preciso desmarcar', 'não posso ir', 'nao posso ir', 'não vou poder',
  'nao vou poder', 'vou remarcar', 'preciso remarcar', 'vou ligar depois',
  'ligo depois', 'entro em contato', 'quando puder eu ligo', 'depois eu volto',
  'depois eu chamo', 'vou pensar', 'deixa eu pensar', 'não preciso mais',
  'nao preciso mais', 'desisti', 'por enquanto não', 'por enquanto nao',
  'não quero mais', 'nao quero mais', 'outro momento', 'outra hora',
  'não tenho interesse', 'nao tenho interesse'
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const AGENDAS = {
  '1': { nome: 'Fisioterapia', periodos: [
    { label: '🌅 Manhã (7h às 11h)', agendaId: 1, procedimentoId: 5, idProfissional: 1, agendaNome: 'Fisioterapia - Manhã' },
    { label: '🌆 Tarde (15h às 18h)', agendaId: 29, procedimentoId: 5, idProfissional: 28, agendaNome: 'Fisioterapia - Tarde' },
  ]},
  '2': { nome: 'Hidroterapia', periodos: [
    { label: '🌅 Manhã (7h às 13h)', agendaId: 20, procedimentoId: 6, idProfissional: 19, agendaNome: 'Hidroterapia - Manhã' },
    { label: '🌆 Tarde (13h às 20h)', agendaId: 4, procedimentoId: 6, idProfissional: 2, agendaNome: 'Hidroterapia - Tarde' },
  ]},
  '3': { nome: 'Pilates', periodos: [
    { label: '🌅 Manhã (7h às 12h)', agendaId: 28, procedimentoId: 57, idProfissional: 27, agendaNome: 'Pilates - Manhã' },
    { label: '🌆 Tarde (15h às 19h)', agendaId: 7, procedimentoId: 57, idProfissional: 6, agendaNome: 'Pilates - Tarde' },
  ]},
  '4': { nome: 'RPG', periodos: [
    { label: '🌅 Quinta manhã (8h às 11h)', agendaId: 6, procedimentoId: 9, idProfissional: 7, agendaNome: 'RPG - Manhã quinta' },
    { label: '🌆 Tarde seg-quinta (15h às 19h)', agendaId: 6, procedimentoId: 9, idProfissional: 7, agendaNome: 'RPG - Tarde' },
  ]},
  '5': { nome: 'Acupuntura', periodos: [
    { label: '📋 Ver horários disponíveis', agendaId: 8, procedimentoId: 1, idProfissional: 8, agendaNome: 'Acupuntura' },
  ]},
  '6': { nome: 'Consulta Vascular', diasBusca: 30, periodos: [
    { label: '📋 Ver horários disponíveis', agendaId: 11, procedimentoId: 22, idProfissional: 9, agendaNome: 'Consulta Vascular' },
  ]},
  '7': { nome: 'Drenagem / Massagem', periodos: [
    { label: '🌆 Tarde (15h às 19h)', agendaId: 7, procedimentoId: 84, idProfissional: 6, agendaNome: 'Drenagem / Massagem' },
  ]},
};

function formatarData(date) {
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
}

async function buscarHorarios(agendaId, procedimentoId, diasBusca = 7) {
  const horarios = [];
  const hoje = new Date();
  for (let i = 1; i <= diasBusca && horarios.length < 10; i++) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + i);
    if (data.getDay() === 0 || data.getDay() === 6) continue;
    const dataStr = formatarData(data);
    const slots = await fisiosoft.buscarHorariosDisponiveis(agendaId, procedimentoId, dataStr);
    if (slots?.length) {
      slots.forEach(hora => horarios.push({
        data: dataStr, diaSemana: DIAS_SEMANA[data.getDay()], hora, agendaId, procedimentoId
      }));
    }
  }
  return horarios;
}

function limparIA(texto) {
  return texto
    .replace(/\[REGIAO\s*:\s*[^\]]*\]/gi, '')
    .replace(/\[OFERECER_AGENDAMENTO\]/gi, '')
    .replace(/\[ENCERRAR\]/gi, '')
    .replace(/\[ABRIR_MENU\]/gi, '')
    .trim();
}

function extrairRegiao(texto) {
  const m = texto.match(/\[REGIAO\s*:\s*([^\]]+)\]/i);
  return m ? m[1].toLowerCase().trim() : null;
}

function orientacaoRoupa(regiao) {
  if (!regiao) return '👕 Vista roupa leve e adequada para o tratamento.';
  const r = regiao.toLowerCase();
  if (r.includes('joelho') || r.includes('quadril')) return '👕 Venha de *bermuda ou shorts confortável*.';
  if (r.includes('ombro')) return '👕 Venha com *regata ou blusa de alça*.';
  if (r.includes('coluna')) return '👕 Venha com *roupa confortável* que permita movimentação.';
  if (r.includes('cotovelo') || r.includes('punho') || r.includes('mão')) return '👕 Venha com *manga curta ou camiseta*.';
  if (r.includes('tornozelo') || r.includes('pé')) return '👕 Venha de *bermuda ou calça que possa ser levantada*.';
  return '👕 Vista roupa leve e adequada para o tratamento.';
}

async function processarMensagem(telefone, mensagem) {
  const texto = mensagem.trim();
  const textoLower = texto.toLowerCase();
  const sessao = await getSessao(telefone);

  await marcarRespondeuRemarketing(telefone);
  await registrarConversa(telefone);

  if (FRASES_NAO_REATIVAR.some(f => textoLower.includes(f))) {
    await marcarNaoReativar(telefone);
  }

  if (textoLower === 'sair' || texto === '0') {
    await marcarNaoReativar(telefone);
    await setSessao(telefone, { etapa: 'encerrado' });
    return enviarMensagem(telefone, `Até logo! 😊 Quando precisar é só nos chamar.`);
  }

  switch (sessao.etapa) {
    case 'aguardando_menu':               return handleMenu(telefone, texto, sessao);
    case 'aguardando_tipo_cliente':       return handleTipoCliente(telefone, texto, sessao);
    case 'aguardando_para_quem':          return handleParaQuem(telefone, texto, sessao);
    case 'aguardando_cpf':                return handleCPF(telefone, texto, sessao);
    case 'aguardando_cpf_novo':           return handleCPFNovo(telefone, texto, sessao);
    case 'aguardando_nome_novo':          return handleNomeNovo(telefone, texto, sessao);
    case 'aguardando_celular_novo':       return handleCelularNovo(telefone, texto, sessao);
    case 'aguardando_cpf_terceiro':       return handleCPFTerceiro(telefone, texto, sessao);
    case 'aguardando_nome_terceiro':      return handleNomeTerceiro(telefone, texto, sessao);
    case 'aguardando_celular_terceiro':   return handleCelularTerceiro(telefone, texto, sessao);
    case 'aguardando_especialidade':      return handleEspecialidade(telefone, texto, sessao);
    case 'aguardando_periodo':            return handlePeriodo(telefone, texto, sessao);
    case 'aguardando_horario':            return handleHorario(telefone, texto, sessao);
    case 'aguardando_confirmacao':        return handleConfirmacao(telefone, texto, sessao);
    case 'aguardando_cancelamento':       return handleCancelamento(telefone, texto, sessao);
    case 'aguardando_confirmacao_cancel': return handleConfirmacaoCancel(telefone, texto, sessao);
    case 'aguardando_faq':                return handleFAQ(telefone, texto);
  }

  if (PALAVRAS_AGRADECIMENTO.some(p => textoLower === p || textoLower.includes(p))) {
    await marcarNaoReativar(telefone);
    await setSessao(telefone, { etapa: 'encerrado' });
    return enviarMensagem(telefone, `De nada! 😊 Foi um prazer te atender.\n\nEsperamos te ver em breve na *Clínica Lituânia*!\n\nQuando precisar, é só nos chamar. 👋`);
  }

  return handleLissa(telefone, texto, sessao);
}

async function handleLissa(telefone, texto, sessao) {
  const historico = sessao.historicoLissa || [];
  historico.push({ role: 'user', content: texto });

  const resposta = await consultarIA(historico);
  if (!resposta) return enviarMensagem(telefone, `Desculpe, tive um probleminha técnico. 😅\n\n${CONTATO_HUMANO}`);

  const regiao = extrairRegiao(resposta);
  const ofereceAgendamento = resposta.includes('[OFERECER_AGENDAMENTO]');
  const encerrar = resposta.includes('[ENCERRAR]');
  const abrirMenu = resposta.includes('[ABRIR_MENU]');
  const respostaLimpa = limparIA(resposta);

  historico.push({ role: 'assistant', content: resposta });

  await setSessao(telefone, {
    etapa: 'conversando_lissa',
    historicoLissa: historico,
    regiaoCorpo: regiao || sessao.regiaoCorpo || null
  });

  await enviarMensagem(telefone, respostaLimpa);

  if (encerrar) {
    await marcarNaoReativar(telefone);
    await setSessao(telefone, { etapa: 'encerrado' });
    return;
  }

  if (abrirMenu || ofereceAgendamento) {
    await setSessao(telefone, {
      etapa: 'aguardando_menu',
      historicoLissa: historico,
      regiaoCorpo: regiao || sessao.regiaoCorpo || null,
      menuAberto: true
    });
    return enviarMensagem(telefone, MENU_PRINCIPAL);
  }

  if (historico.length >= 14) {
    return enviarMensagem(telefone, `💬 Para continuar, fale diretamente com nossa equipe:\n\n${CONTATO_HUMANO}`);
  }
}

async function handleMenu(telefone, texto, sessao) {
  switch (texto) {
    case '1':
      await setSessao(telefone, { etapa: 'aguardando_tipo_cliente', acao: 'agendar', regiaoCorpo: sessao.regiaoCorpo });
      return enviarMensagem(telefone, `Você já é nosso paciente?\n\n*1.* ✅ Sim\n*2.* 🆕 Não, sou novo paciente\n\n_ou *0* para encerrar_`);
    case '2':
      await setSessao(telefone, { etapa: 'aguardando_tipo_cliente', acao: 'cancelar' });
      return enviarMensagem(telefone, `Você já é nosso paciente?\n\n*1.* ✅ Sim\n*2.* 🆕 Sou novo\n\n_ou *0* para encerrar_`);
    case '3':
      await setSessao(telefone, { etapa: 'aguardando_faq' });
      return enviarMensagem(telefone, `❓ *Dúvidas Frequentes*\n\n${listarFAQs()}\n\nDigite o número ou *0* para encerrar.`);
    case '4':
      await setSessao(telefone, { etapa: 'atendimento_humano' });
      return enviarMensagem(telefone, `Certo! 😊 Em breve um de nossos atendentes entrará em contato.\n\nAté logo! 👋`);
    default:
      return enviarMensagem(telefone, `Por favor, digite uma opção válida:\n\n${MENU_PRINCIPAL}`);
  }
}

async function handleTipoCliente(telefone, texto, sessao) {
  const clienteSalvo = await buscarClientePorTelefone(telefone);
  if (clienteSalvo) {
    if (sessao.acao === 'agendar') {
      await setSessao(telefone, { etapa: 'aguardando_para_quem', clienteResponsavel: clienteSalvo, regiaoCorpo: sessao.regiaoCorpo });
      return enviarMensagem(telefone, `Olá de novo, *${clienteSalvo.Nome}*! 😊\n\nEste agendamento é para você ou para outra pessoa?\n\n*1.* 👤 Para mim\n*2.* 👥 Para outra pessoa\n\n_ou *0* para encerrar_`);
    }
    return mostrarAgendamentos(telefone, clienteSalvo, sessao.acao);
  }
  if (texto === '1') {
    await setSessao(telefone, { etapa: 'aguardando_cpf', acao: sessao.acao, regiaoCorpo: sessao.regiaoCorpo });
    return enviarMensagem(telefone, `Por favor, informe seu *CPF* (somente números):\n\nExemplo: 12345678901\n\n_ou *0* para encerrar_`);
  }
  if (texto === '2') {
    if (sessao.acao !== 'agendar') return enviarMensagem(telefone, `Para cancelar precisamos encontrar seu cadastro. Informe seu *CPF*:`);
    await setSessao(telefone, { etapa: 'aguardando_nome_novo', regiaoCorpo: sessao.regiaoCorpo });
    return enviarMensagem(telefone, `Vamos criar seu cadastro! 😊\n\nQual é o seu *nome completo*?\n\n_ou *0* para encerrar_`);
  }
  return enviarMensagem(telefone, `Digite *1* para sim ou *2* para não.`);
}

async function handleParaQuem(telefone, texto, sessao) {
  if (texto === '1') {
    return iniciarAgendamento(telefone, sessao.clienteResponsavel, sessao.regiaoCorpo);
  }
  if (texto === '2') {
    await setSessao(telefone, { etapa: 'aguardando_cpf_terceiro', regiaoCorpo: sessao.regiaoCorpo });
    return enviarMensagem(telefone, `Informe o *CPF* da pessoa para quem deseja agendar:\n\nExemplo: 12345678901`);
  }
  return enviarMensagem(telefone, `Digite *1* para você ou *2* para outra pessoa.`);
}

async function handleCPF(telefone, texto, sessao) {
  if (!validarCPF(texto)) return enviarMensagem(telefone, `CPF inválido. Informe apenas os *11 números*.\n\nExemplo: 12345678901`);
  const cpf = limparCPF(texto);
  await enviarMensagem(telefone, '🔍 Buscando seus dados...');
  const cliente = await fisiosoft.buscarClientePorCPF(cpf);
  if (!cliente) return enviarMensagem(telefone, `❌ CPF *${formatarCPF(cpf)}* não encontrado.\n\nVerifique o número ou entre em contato:\n\n${CONTATO_HUMANO}`);
  salvarClientePorTelefone(telefone, cliente);
  if (sessao.acao === 'agendar') {
    await setSessao(telefone, { etapa: 'aguardando_para_quem', clienteResponsavel: cliente, regiaoCorpo: sessao.regiaoCorpo });
    return enviarMensagem(telefone, `Olá, *${cliente.Nome}*! 😊\n\nEste agendamento é para você ou para outra pessoa?\n\n*1.* 👤 Para mim\n*2.* 👥 Para outra pessoa`);
  }
  return mostrarAgendamentos(telefone, cliente, sessao.acao);
}

async function handleNomeNovo(telefone, texto, sessao) {
  if (texto.length < 3) return enviarMensagem(telefone, `Informe seu *nome completo*:`);
  await setSessao(telefone, { etapa: 'aguardando_cpf_novo', nomeNovo: texto, regiaoCorpo: sessao.regiaoCorpo });
  return enviarMensagem(telefone, `Qual é o seu *CPF*? (somente números)\n\nExemplo: 12345678901`);
}

async function handleCPFNovo(telefone, texto, sessao) {
  if (!validarCPF(texto)) return enviarMensagem(telefone, `CPF inválido. Informe apenas os *11 números*.`);
  await setSessao(telefone, { etapa: 'aguardando_celular_novo', cpfNovo: limparCPF(texto), nomeNovo: sessao.nomeNovo, regiaoCorpo: sessao.regiaoCorpo });
  return enviarMensagem(telefone, `Qual é o seu *celular* com DDD?\n\nExemplo: 11999999999`);
}

async function handleCelularNovo(telefone, texto, sessao) {
  const celular = texto.replace(/\D/g, '');
  if (celular.length < 10) return enviarMensagem(telefone, `Celular inválido. Informe com DDD.\n\nExemplo: 11999999999`);
  await enviarMensagem(telefone, '⏳ Criando seu cadastro...');
  const id = await fisiosoft.incluirCliente({ Nome: sessao.nomeNovo, Cpf: sessao.cpfNovo, Celular: celular, Email: '', Sexo: 'F' });
  if (!id) return enviarMensagem(telefone, `❌ Erro ao criar cadastro.\n\n${CONTATO_HUMANO}`);
  const cliente = { Id: id, Nome: sessao.nomeNovo };
  salvarClientePorTelefone(telefone, cliente);
  await setSessao(telefone, { etapa: 'aguardando_para_quem', clienteResponsavel: cliente, regiaoCorpo: sessao.regiaoCorpo });
  await enviarMensagem(telefone, `✅ Cadastro criado, *${sessao.nomeNovo}*! 🎉`);
  return enviarMensagem(telefone, `Este agendamento é para você ou para outra pessoa?\n\n*1.* 👤 Para mim\n*2.* 👥 Para outra pessoa`);
}

async function handleCPFTerceiro(telefone, texto, sessao) {
  if (!validarCPF(texto)) return enviarMensagem(telefone, `CPF inválido. Informe apenas os *11 números*.`);
  const cpf = limparCPF(texto);
  await enviarMensagem(telefone, '🔍 Buscando cadastro...');
  const cliente = await fisiosoft.buscarClientePorCPF(cpf);
  if (cliente) {
    await setSessao(telefone, { cliente });
    await enviarMensagem(telefone, `✅ Cadastro de *${cliente.Nome}* encontrado! 😊`);
    return iniciarAgendamento(telefone, cliente, sessao.regiaoCorpo);
  }
  await setSessao(telefone, { etapa: 'aguardando_nome_terceiro', cpfTerceiro: cpf, regiaoCorpo: sessao.regiaoCorpo });
  return enviarMensagem(telefone, `Cadastro não encontrado. Qual o *nome completo* da pessoa?`);
}

async function handleNomeTerceiro(telefone, texto, sessao) {
  if (texto.length < 3) return enviarMensagem(telefone, `Informe o *nome completo*:`);
  await setSessao(telefone, { etapa: 'aguardando_celular_terceiro', nomeTerceiro: texto, cpfTerceiro: sessao.cpfTerceiro, regiaoCorpo: sessao.regiaoCorpo });
  return enviarMensagem(telefone, `Qual é o *celular* da pessoa com DDD?\n\nExemplo: 11999999999`);
}

async function handleCelularTerceiro(telefone, texto, sessao) {
  const celular = texto.replace(/\D/g, '');
  if (celular.length < 10) return enviarMensagem(telefone, `Celular inválido. Informe com DDD.`);
  await enviarMensagem(telefone, '⏳ Criando cadastro...');
  const id = await fisiosoft.incluirCliente({ Nome: sessao.nomeTerceiro, Cpf: sessao.cpfTerceiro, Celular: celular, Email: '', Sexo: 'F' });
  if (!id) return enviarMensagem(telefone, `❌ Erro ao criar cadastro.\n\n${CONTATO_HUMANO}`);
  const cliente = { Id: id, Nome: sessao.nomeTerceiro };
  await enviarMensagem(telefone, `✅ Cadastro criado para *${sessao.nomeTerceiro}*! 🎉`);
  return iniciarAgendamento(telefone, cliente, sessao.regiaoCorpo);
}

async function iniciarAgendamento(telefone, cliente, regiaoCorpo) {
  await setSessao(telefone, { etapa: 'aguardando_especialidade', cliente, regiaoCorpo });
  return enviarMensagem(telefone,
    `✅ Agendando para *${cliente.Nome}*!\n\nQual especialidade?\n\n` +
    `*1.* 🦴 Fisioterapia\n*2.* 🏊 Hidroterapia\n*3.* 🧘 Pilates\n*4.* 📐 RPG\n` +
    `*5.* 🪡 Acupuntura\n*6.* 🩺 Consulta Vascular\n*7.* 💆 Drenagem / Massagem\n\n_ou *0* para encerrar_`
  );
}

async function handleEspecialidade(telefone, texto, sessao) {
  const esp = AGENDAS[texto];
  if (!esp) return enviarMensagem(telefone, `Opção inválida. Digite um número entre 1 e 7.`);
  await registrarLead(telefone, sessao.cliente?.Nome, esp.nome);
  if (esp.periodos.length === 1) return buscarMostrarHorarios(telefone, sessao.cliente, esp.periodos[0], esp.diasBusca || 7, esp, sessao.regiaoCorpo);
  const lista = esp.periodos.map((p, i) => `*${i+1}.* ${p.label}`).join('\n');
  await setSessao(telefone, { etapa: 'aguardando_periodo', especialidade: esp, cliente: sessao.cliente, regiaoCorpo: sessao.regiaoCorpo });
  return enviarMensagem(telefone, `*${esp.nome}* — Qual período prefere?\n\n${lista}\n\n_ou *0* para encerrar_`);
}

async function handlePeriodo(telefone, texto, sessao) {
  const i = parseInt(texto) - 1;
  const periodos = sessao.especialidade.periodos;
  if (isNaN(i) || i < 0 || i >= periodos.length) return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${periodos.length}.`);
  return buscarMostrarHorarios(telefone, sessao.cliente, periodos[i], sessao.especialidade.diasBusca || 7, sessao.especialidade, sessao.regiaoCorpo);
}

async function buscarMostrarHorarios(telefone, cliente, agenda, dias, especialidade, regiaoCorpo) {
  await enviarMensagem(telefone, `🔍 Buscando horários disponíveis...`);
  const horarios = await buscarHorarios(agenda.agendaId, agenda.procedimentoId, dias);
  if (!horarios?.length) return enviarMensagem(telefone, `😔 Sem horários disponíveis nos próximos ${dias} dias para *${agenda.agendaNome}*.\n\n${CONTATO_HUMANO}`);
  const lista = horarios.map((h, i) => `*${i+1}.* ${h.diaSemana} ${h.data} às ${h.hora}`).join('\n');
  await setSessao(telefone, { etapa: 'aguardando_horario', agenda, horarios, cliente, especialidade, regiaoCorpo });
  return enviarMensagem(telefone, `📅 *Horários — ${agenda.agendaNome}:*\n\n${lista}\n\nDigite o número desejado ou *0* para encerrar.`);
}

async function handleHorario(telefone, texto, sessao) {
  const i = parseInt(texto) - 1;
  if (isNaN(i) || i < 0 || i >= sessao.horarios.length) return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.horarios.length}.`);
  const h = sessao.horarios[i];
  await setSessao(telefone, { etapa: 'aguardando_confirmacao', horario: h });
  return enviarMensagem(telefone,
    `📋 *Confirme o agendamento:*\n\n` +
    `👤 ${sessao.cliente.Nome}\n💆 ${sessao.agenda.agendaNome}\n` +
    `📅 ${h.diaSemana} ${h.data} às ${h.hora}\n\n*1* confirmar | *0* cancelar`
  );
}

async function handleConfirmacao(telefone, texto, sessao) {
  if (texto !== '1') {
    await setSessao(telefone, { etapa: 'encerrado' });
    return enviarMensagem(telefone, `Tudo bem! Quando quiser agendar é só nos chamar. 😊`);
  }
  await enviarMensagem(telefone, '⏳ Realizando agendamento...');
  const resultado = await fisiosoft.incluirAgendamento({
    IdCliente: sessao.cliente.Id,
    IdAgenda: sessao.agenda.agendaId,
    IdProcedimento: sessao.agenda.procedimentoId,
    IdProfissional: sessao.agenda.idProfissional,
    Data: sessao.horario.data,
    Hora: sessao.horario.hora,
  });
  if (!resultado) return enviarMensagem(telefone, `❌ Erro ao agendar.\n\n${CONTATO_HUMANO}`);
  if (resultado.erro) return enviarMensagem(telefone, `⚠️ *${resultado.erro}*\n\n${CONTATO_HUMANO}`);

  await marcarAgendou(telefone);

  await enviarMensagem(telefone,
    `✅ *Agendamento confirmado!*\n\n` +
    `👤 ${sessao.cliente.Nome}\n` +
    `💆 ${sessao.agenda.agendaNome}\n` +
    `📅 ${sessao.horario.diaSemana}, ${sessao.horario.data} às ${sessao.horario.hora}\n\n` +
    `${ENDERECO}\n\nAté lá! 😊`
  );

  const nome = sessao.agenda.agendaNome.toUpperCase();
  const regiao = sessao.regiaoCorpo || null;

  if (nome.includes('FISIOTERAPIA')) {
    await enviarMensagem(telefone,
      `📋 *Orientações:*\n\n` +
      `📁 Traga *exames* e *encaminhamento médico* (se houver)\n` +
      orientacaoRoupa(regiao)
    );
  } else if (nome.includes('HIDROTERAPIA')) {
    await enviarMensagem(telefone,
      `📋 *Orientações:*\n\n` +
      `📁 Traga *exames* e *encaminhamento médico* (se houver)\n` +
      `🏊 *Traje obrigatório:* Sunga ou maiô, touca, chinelo, roupão e toalha\n` +
      `❌ Sem adornos (brincos, correntes, anéis)\n` +
      `❌ Sem cremes, óleos ou perfumes\n` +
      `⚠️ Ferimentos ou sondas impedem o uso da piscina`
    );
  } else if (nome.includes('PILATES')) {
    await enviarMensagem(telefone,
      `📋 *Orientações:*\n\n` +
      `👟 Vista *roupa leve* e traga *sapatilha de meia*\n` +
      `👥 Turmas com no máximo *3 alunos*\n` +
      `⏱️ Aulas de *1 hora* com fisioterapeutas especializados`
    );
  } else if (nome.includes('RPG')) {
    await enviarMensagem(telefone,
      `📋 *Orientações:*\n\n` +
      `📁 Traga *exames* e *encaminhamento médico* (se houver)\n` +
      `👕 Vista *roupa leve para ginástica*\n` +
      `⏱️ Sessão individual de *1 hora*, *1x por semana*`
    );
  } else {
    await enviarMensagem(telefone,
      `📋 *Orientações:*\n\n` +
      `📁 Traga *exames* e *encaminhamento médico* (se houver)\n` +
      `👕 Vista roupa leve e adequada`
    );
  }

  await enviarMensagem(telefone,
    `📌 *Importante:* Para os próximos agendamentos, agende diretamente na recepção para garantir seu horário! 😊\n\n` +
    `📞 (11) 2268-3195 | 💬 (11) 98728-1427`
  );

  await setSessao(telefone, { etapa: 'encerrado' });
}

async function mostrarAgendamentos(telefone, cliente, acao) {
  await enviarMensagem(telefone, '🔍 Buscando agendamentos...');
  const agendamentos = await fisiosoft.listarAgendamentosCliente(cliente.Id);
  if (!agendamentos?.length) {
    await setSessao(telefone, { etapa: 'encerrado' });
    return enviarMensagem(telefone, `📭 Sem agendamentos futuros, *${cliente.Nome}*.\n\nQuando precisar é só nos chamar! 😊`);
  }
  const lista = agendamentos.map((a, i) => {
    const [data, hora] = (a.DataHoraInicio || ' ').split(' ');
    return `*${i+1}.* ${data} às ${(hora||'').substring(0,5)} - ${a.Procedimento || 'Consulta'}`;
  }).join('\n');
  await setSessao(telefone, { etapa: 'aguardando_cancelamento', agendamentos, cliente });
  return enviarMensagem(telefone, `❌ Qual agendamento deseja cancelar?\n\n${lista}\n\nDigite o número ou *0* para encerrar.`);
}

async function handleCancelamento(telefone, texto, sessao) {
  const i = parseInt(texto) - 1;
  if (isNaN(i) || i < 0 || i >= sessao.agendamentos.length) return enviarMensagem(telefone, `Opção inválida.`);
  const ag = sessao.agendamentos[i];
  const [data, hora] = (ag.DataHoraInicio || ' ').split(' ');
  await setSessao(telefone, { etapa: 'aguardando_confirmacao_cancel', agendamentoParaCancelar: ag, cliente: sessao.cliente });
  return enviarMensagem(telefone,
    `⚠️ Cancelar este agendamento?\n\n` +
    `📅 ${data} às ${(hora||'').substring(0,5)}\n💆 ${ag.Procedimento || 'Consulta'}\n\n*1* confirmar | *0* manter`
  );
}

async function handleConfirmacaoCancel(telefone, texto, sessao) {
  if (texto !== '1') {
    await setSessao(telefone, { etapa: 'encerrado' });
    return enviarMensagem(telefone, `Agendamento mantido! 😊 Até logo!`);
  }
  await enviarMensagem(telefone, '⏳ Cancelando...');
  const ok = await fisiosoft.desmarcarAgendamento(sessao.agendamentoParaCancelar.IdAgendamento);
  await setSessao(telefone, { etapa: 'encerrado' });
  if (!ok) return enviarMensagem(telefone, `❌ Erro ao cancelar.\n\n${CONTATO_HUMANO}`);
  return enviarMensagem(telefone, `✅ Agendamento cancelado!\n\nQuando precisar é só nos chamar. 😊`);
}

async function handleFAQ(telefone, texto) {
  if (texto === '0') {
    await setSessao(telefone, { etapa: 'encerrado' });
    return enviarMensagem(telefone, `Até logo! 😊`);
  }
  const resposta = buscarResposta(texto);
  if (!resposta) return enviarMensagem(telefone, `Opção inválida.\n\n${listarFAQs()}\n\n*0* para encerrar.`);
  return enviarMensagem(telefone, `${resposta}\n\n_Outra dúvida? Digite o número ou *0* para encerrar._`);
}

module.exports = { processarMensagem };
