const { getSessao, setSessao, resetarSessao } = require('../utils/sessao');
const { enviarMensagem } = require('../services/whatsapp');
const fisiosoft = require('../services/fisiosoft');
const { consultarIA } = require('../services/ia');
const { validarCPF, limparCPF, formatarCPF } = require('../utils/formatters');
const { listarFAQs, buscarResposta } = require('../utils/faq');
const { buscarClientePorTelefone, salvarClientePorTelefone, registrarLead, marcarAgendou, marcarRespondeuRemarketing, marcarNaoReativar } = require('../utils/clienteCache');

const WHATSAPP_RECEPCAO = 'https://wa.me/5511987281427';
const CONTATO_HUMANO = `Caso prefira falar diretamente com nossa equipe:\n📞 (11) 2268-3195\n💬 WhatsApp: wa.me/5511987281427\n\nHorário: Segunda a Sexta, 7h às 20h 😊`;
const ENDERECO = `📍 *Clínica Lituânia*\nRua Lituânia, 209 - Mooca\nCEP 03184-020 - São Paulo/SP\n📞 (11) 2268-3195\n💬 WhatsApp: ${WHATSAPP_RECEPCAO}`;

const BOAS_VINDAS = `━━━━━━━━━━━━━━━━━━
🏥 *Clínica Lituânia*
━━━━━━━━━━━━━━━━━━

Olá! Como posso te ajudar? 😊

*1.* 🗂️ Ver menu de opções
*2.* 💬 Falar com a Lissa - Atendente Virtual

Digite o número da opção desejada
━━━━━━━━━━━━━━━━━━
_ou digite *sair* para encerrar_`;

const MENU_PRINCIPAL = `━━━━━━━━━━━━━━━━━━
🏥 *Clínica Lituânia*
━━━━━━━━━━━━━━━━━━

Como posso te ajudar? 😊

1️⃣  📅 Agendar consulta
2️⃣  ❌ Cancelar agendamento
3️⃣  🔄 Reagendar consulta
4️⃣  🗓️ Ver meus agendamentos
5️⃣  ❓ Dúvidas frequentes
6️⃣  💬 Falar com a Lissa - Atendente Virtual
7️⃣  👤 Falar com a Recepção

0️⃣  🔚 Encerrar atendimento
━━━━━━━━━━━━━━━━━━
_Digite o número da opção_
_ou digite *sair* para encerrar_`;

const PALAVRAS_REATIVACAO = ['olá', 'ola', 'oi', 'bom dia', 'boa tarde', 'boa noite'];
const FRASES_SITE = ['olá, gostaria de mais informações', 'ola, gostaria de mais informacoes', 'gostaria de mais informações', 'gostaria de mais informacoes'];
const PALAVRAS_AGRADECIMENTO = ['obrigado', 'obrigada', 'brigado', 'brigada', 'valeu', 'thanks', 'agradeço', 'agradeco', 'grato', 'grata', 'muito obrigado', 'muito obrigada'];
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

function formatarData(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const a = date.getFullYear();
  return `${d}/${m}/${a}`;
}

async function buscarProximosHorarios(agendaId, procedimentoId, diasBusca = 7) {
  const horariosEncontrados = [];
  const hoje = new Date();
  for (let i = 1; i <= diasBusca; i++) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + i);
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
    if (horariosEncontrados.length >= 10) break;
  }
  return horariosEncontrados;
}

function extrairRegiao(texto) {
  const match = texto.match(/\[REGIAO\s*:\s*([^\]]+)\]/i);
  if (match) return match[1].toLowerCase().trim();
  return null;
}

function limparTextoIA(texto) {
  return texto
    .replace(/\[REGIAO\s*:\s*[^\]]*\]/gi, '')
    .replace(/\[OFERECER_AGENDAMENTO\]/gi, '')
    .replace(/\[ENCERRAR\]/gi, '')
    .replace(/REGIAO\s*:\s*[\w\s]+/gi, '')
    .replace(/\[REGIAO[^\]]*\]/gi, '')
    .trim();
}

function gerarOrientacaoRoupa(regiao) {
  if (!regiao) return '👕 Vista roupa leve e adequada para o tratamento.';
  const r = regiao.toLowerCase();
  if (r.includes('joelho') || r.includes('quadril'))
    return '👕 Para seu tratamento, venha de *bermuda ou shorts confortável* para facilitar o acesso à região.';
  if (r.includes('ombro'))
    return '👕 Para seu tratamento, venha com *regata ou blusa de alça* para facilitar a aplicação dos aparelhos.';
  if (r.includes('coluna'))
    return '👕 Para seu tratamento, venha com *roupa confortável* que permita movimentação.';
  if (r.includes('cotovelo') || r.includes('punho') || r.includes('mão'))
    return '👕 Para seu tratamento, venha com *manga curta ou camiseta* para facilitar o acesso ao membro superior.';
  if (r.includes('tornozelo') || r.includes('pé'))
    return '👕 Para seu tratamento, venha de *bermuda ou calça que possa ser levantada* para facilitar o acesso à região.';
  return '👕 Vista roupa leve e adequada para o tratamento.';
}

function contextoPilatesAtivo(sessao) {
  const historico = sessao.historicoLissa || [];
  for (let i = historico.length - 1; i >= 0; i--) {
    if (historico[i]?.content?.toLowerCase().includes('pilates')) return true;
  }
  return false;
}

async function processarMensagem(telefone, mensagem) {
  const texto = mensagem.trim();
  const textoLower = texto.toLowerCase();
  const sessao = getSessao(telefone);
  await marcarRespondeuRemarketing(telefone);

  // Detecta intenção de cancelamento/adiamento — não reativar
  if (FRASES_NAO_REATIVAR.some(f => textoLower.includes(f))) {
    await marcarNaoReativar(telefone);
    console.log(`Lead ${telefone} marcado como nao_reativar`);
  }

  if (sessao.etapa === 'encerrado') {
    const ativou = PALAVRAS_REATIVACAO.some(p => textoLower === p);
    const ativouSite = FRASES_SITE.some(p => textoLower.includes(p));
    if (ativou || ativouSite) {
      setSessao(telefone, { etapa: 'aguardando_escolha_menu' });
      return enviarMensagem(telefone, BOAS_VINDAS);
    }
    return;
  }

  if (sessao.etapa === 'aguardando_escolha_menu') {
    if (texto === '1') {
      setSessao(telefone, { etapa: 'menu' });
      return enviarMensagem(telefone, MENU_PRINCIPAL);
    }
    if (texto === '2') {
      setSessao(telefone, { etapa: 'conversando_com_lissa', historicoLissa: [], regiaoCorpo: null });
      return enviarMensagem(telefone, `Oi! Eu sou a *Lissa*, atendente virtual da Clínica Lituânia! 😊\n\nEstou aqui para te ajudar a encontrar o melhor tratamento para você.\n\nMe conta: qual é a sua dor ou queixa hoje?`);
    }
    return enviarMensagem(telefone, BOAS_VINDAS);
  }

  if (PALAVRAS_AGRADECIMENTO.some(p => textoLower === p || textoLower.includes(p))) {
    const etapasAtivas = ['conversando_com_lissa', 'aguardando_resposta_agendamento'];
    if (etapasAtivas.includes(sessao.etapa)) {
      setSessao(telefone, { etapa: 'encerrado' });
      return enviarMensagem(telefone, `De nada! 😊 Foi um prazer te atender.\n\nEsperamos te ver em breve na *Clínica Lituânia*!\n\nQuando precisar, é só nos enviar um *Olá*. 👋`);
    }
  }

  if (texto === '0') return voltarAnterior(telefone, sessao);

  if (textoLower === 'sair') {
    setSessao(telefone, { etapa: 'encerrado' });
    return enviarMensagem(telefone, `✅ Atendimento encerrado. Até logo! 😊\n\nQuando precisar, é só nos enviar um *Olá*.`);
  }

  if (textoLower === 'menu' || textoLower === 'voltar') {
    setSessao(telefone, { etapa: 'menu' });
    return enviarMensagem(telefone, MENU_PRINCIPAL);
  }

  switch (sessao.etapa) {
    case 'menu':                                return handleMenu(telefone, texto);
    case 'conversando_com_lissa':               return handleLissa(telefone, texto, sessao);
    case 'aguardando_resposta_agendamento':     return handleRespostaAgendamento(telefone, texto, sessao);
    case 'aguardando_tipo_cliente':             return handleTipoCliente(telefone, texto, sessao);
    case 'aguardando_para_quem':                return handleParaQuem(telefone, texto, sessao);
    case 'aguardando_cpf_terceiro':             return handleCPFTerceiro(telefone, texto, sessao);
    case 'aguardando_nome_terceiro':            return handleNomeTerceiro(telefone, texto, sessao);
    case 'aguardando_celular_terceiro':         return handleCelularTerceiro(telefone, texto, sessao);
    case 'aguardando_cpf':                      return handleCPF(telefone, texto, sessao);
    case 'aguardando_cpf_novo':                 return handleCPFNovo(telefone, texto, sessao);
    case 'aguardando_nome_novo':                return handleNomeNovo(telefone, texto, sessao);
    case 'aguardando_celular_novo':             return handleCelularNovo(telefone, texto, sessao);
    case 'aguardando_especialidade':            return handleEspecialidade(telefone, texto, sessao);
    case 'aguardando_periodo':                  return handlePeriodo(telefone, texto, sessao);
    case 'aguardando_horario':                  return handleHorario(telefone, texto, sessao);
    case 'aguardando_confirmacao_agendamento':  return handleConfirmacaoAgendamento(telefone, texto, sessao);
    case 'aguardando_cancelamento':             return handleCancelamento(telefone, texto, sessao);
    case 'aguardando_confirmacao_cancel':       return handleConfirmacaoCancel(telefone, texto, sessao);
    case 'aguardando_reagendamento':            return handleReagendamento(telefone, texto, sessao);
    case 'aguardando_faq':                      return handleFAQ(telefone, texto);
    default:
      setSessao(telefone, { etapa: 'menu' });
      return enviarMensagem(telefone, MENU_PRINCIPAL);
  }
}

async function voltarAnterior(telefone, sessao) {
  switch (sessao.etapa) {
    case 'menu':
      setSessao(telefone, { etapa: 'encerrado' });
      return enviarMensagem(telefone, `✅ Atendimento encerrado. Até logo! 😊\n\nQuando precisar, é só nos enviar um *Olá*.`);
    case 'aguardando_horario':
      if (sessao.especialidade && sessao.especialidade.periodos.length > 1) {
        const lista = sessao.especialidade.periodos.map((p, i) => `*${i+1}.* ${p.label}`).join('\n');
        setSessao(telefone, { etapa: 'aguardando_periodo' });
        return enviarMensagem(telefone, `✅ *${sessao.especialidade.nome}*\n\nQual período prefere?\n\n${lista}\n\nDigite o número ou *0* para voltar.\n_ou digite *sair* para encerrar_`);
      }
      return voltarParaEspecialidades(telefone, sessao);
    case 'aguardando_periodo':
      return voltarParaEspecialidades(telefone, sessao);
    default:
      setSessao(telefone, { etapa: 'menu' });
      return enviarMensagem(telefone, MENU_PRINCIPAL);
  }
}

async function voltarParaEspecialidades(telefone, sessao) {
  setSessao(telefone, { etapa: 'aguardando_especialidade', cliente: sessao.cliente });
  return enviarMensagem(telefone,
    `✅ Olá, *${sessao.cliente?.Nome || ''}*!\n\nQual especialidade deseja agendar?\n\n` +
    `*1.* 🦴 Fisioterapia\n*2.* 🏊 Hidroterapia\n*3.* 🧘 Pilates\n*4.* 📐 RPG\n` +
    `*5.* 🪡 Acupuntura\n*6.* 🩺 Consulta Vascular\n*7.* 💆 Drenagem / Massagem Relaxante\n\n*0* para voltar ao menu\n_ou digite *sair* para encerrar_`
  );
}

async function handleMenu(telefone, texto) {
  switch (texto) {
    case '1': case '2': case '3': case '4': {
      const acoes = { '1': 'agendar', '2': 'cancelar', '3': 'reagendar', '4': 'listar' };
      setSessao(telefone, { etapa: 'aguardando_tipo_cliente', acao: acoes[texto] });
      return enviarMensagem(telefone, `Você já é nosso paciente?\n\n*1.* ✅ Sim, já sou paciente\n*2.* 🆕 Não, sou novo paciente\n\n_ou digite *sair* para encerrar_`);
    }
    case '5':
      setSessao(telefone, { etapa: 'aguardando_faq' });
      return enviarMensagem(telefone, `❓ *Dúvidas Frequentes*\n\n${listarFAQs()}\n\nDigite o número ou *0* para voltar.\n_ou digite *sair* para encerrar_`);
    case '6':
      setSessao(telefone, { etapa: 'conversando_com_lissa', historicoLissa: [], regiaoCorpo: null });
      return enviarMensagem(telefone, `Oi! Eu sou a *Lissa*, atendente virtual da Clínica Lituânia! 😊\n\nEstou aqui para te ajudar a encontrar o melhor tratamento para você.\n\nMe conta: qual é a sua dor ou queixa hoje?`);
    case '7':
      setSessao(telefone, { etapa: 'atendimento_humano' });
      return enviarMensagem(telefone,
        `Certo! 😊 A partir deste momento você será atendido por um de nossos atendentes.\n\nEm breve entraremos em contato. Até logo! 👋`
      );
    default:
      setSessao(telefone, { etapa: 'encerrado' });
      return;
  }
}

async function handleLissa(telefone, texto, sessao) {
  const historico = sessao.historicoLissa || [];
  historico.push({ role: 'user', content: texto });
  await enviarMensagem(telefone, '...');
  const resposta = await consultarIA(historico);
  if (!resposta) return enviarMensagem(telefone, `Desculpe, tive um probleminha técnico. 😅\n\n${CONTATO_HUMANO}\n\n*0* para voltar ao menu.`);

  const regiao = extrairRegiao(resposta);
  const ofereceAgendamento = resposta.includes('[OFERECER_AGENDAMENTO]');
  const encerrar = resposta.includes('[ENCERRAR]');
  const respostaLimpa = limparTextoIA(resposta);

  historico.push({ role: 'assistant', content: resposta });
  const novaSessao = { historicoLissa: historico };
  if (regiao) novaSessao.regiaoCorpo = regiao;
  if (respostaLimpa.toLowerCase().includes('pilates') || resposta.toLowerCase().includes('pilates')) {
    novaSessao.contextoPilates = true;
  }
  setSessao(telefone, novaSessao);

  await enviarMensagem(telefone, respostaLimpa);

  if (encerrar) { setSessao(telefone, { etapa: 'encerrado' }); return; }
  if (ofereceAgendamento) { setSessao(telefone, { etapa: 'aguardando_resposta_agendamento' }); return; }
  if (historico.length >= 12) {
    return enviarMensagem(telefone, `💬 Para um atendimento mais personalizado:\n\n${CONTATO_HUMANO}\n\nOu *0* para voltar ao menu.`);
  }
}

async function handleRespostaAgendamento(telefone, texto, sessao) {
  const textoLower = texto.toLowerCase().trim();

  const respostaSim = [
    'sim', 's', 'claro', 'pode', 'quero', 'yes', 'ok', 'vamos', 'pode ser',
    'topo', 'quero sim', 'com certeza', 'tenho', 'já fui', 'ja fui',
    'já consultei', 'ja consultei', 'tenho sim', 'já tenho', 'ja tenho',
    'fui sim', 'consultei', 'tenho encaminhamento', 'podemos continuar',
    'pode continuar', 'continuar', 'continua'
  ];

  const respostaNao = [
    'não', 'nao', 'n', 'agora não', 'agora nao', 'depois', 'talvez',
    'ainda não', 'ainda nao', 'não tenho', 'nao tenho', 'ainda não fui',
    'ainda nao fui', 'não fui', 'nao fui', 'não consultei', 'nao consultei',
    'ainda não consultei', 'ainda nao consultei', 'não tenho encaminhamento',
    'nao tenho encaminhamento', 'sem encaminhamento', 'não tenho médico',
    'nao tenho medico'
  ];

  if (PALAVRAS_AGRADECIMENTO.some(p => textoLower === p || textoLower.includes(p))) {
    setSessao(telefone, { etapa: 'encerrado' });
    return enviarMensagem(telefone, `De nada! 😊 Foi um prazer te atender.\n\nEsperamos te ver em breve na *Clínica Lituânia*!\n\nQuando precisar, é só nos enviar um *Olá*. 👋`);
  }

  const temSim = respostaSim.some(p => textoLower === p || textoLower.includes(p));
  const temNao = respostaNao.some(p => textoLower === p || textoLower.includes(p));

  if (temSim && !temNao) {
    const clienteSalvo = await buscarClientePorTelefone(telefone);
    if (clienteSalvo) {
      setSessao(telefone, { cliente: clienteSalvo, regiaoCorpo: sessao.regiaoCorpo });
      await enviarMensagem(telefone, `Ótimo! Vamos agendar para *${clienteSalvo.Nome}*! 😊`);
      return iniciarFluxoAgendamento(telefone, clienteSalvo);
    } else {
      setSessao(telefone, { etapa: 'aguardando_tipo_cliente', acao: 'agendar', regiaoCorpo: sessao.regiaoCorpo });
      return enviarMensagem(telefone, `Ótimo! Vamos agendar! 😊\n\nVocê já é nosso paciente?\n\n*1.* ✅ Sim, já sou paciente\n*2.* 🆕 Não, sou novo paciente`);
    }
  }

  if (temNao && !temSim) {
    if (sessao.contextoPilates || contextoPilatesAtivo(sessao)) {
      setSessao(telefone, { etapa: 'encerrado' });
      return enviarMensagem(telefone,
        `Tudo bem, sem problemas! 😊\n\nFoi um prazer conversar com você. Quando quiser conhecer o Pilates ou qualquer outro serviço da *Clínica Lituânia*, é só nos enviar um *Olá*! 👋`
      );
    }
    await enviarMensagem(telefone,
      `Tudo bem, não se preocupe! 😊\n\n` +
      `O encaminhamento médico não é obrigatório para iniciar o tratamento. ` +
      `Nossos profissionais farão uma avaliação completa na primeira sessão.\n\n` +
      `Posso verificar os horários disponíveis para você?`
    );
    setSessao(telefone, { etapa: 'aguardando_resposta_agendamento' });
    return;
  }

  setSessao(telefone, { etapa: 'conversando_com_lissa' });
  return handleLissa(telefone, texto, sessao);
}

async function handleTipoCliente(telefone, texto, sessao) {
  const clienteSalvo = await buscarClientePorTelefone(telefone);
  if (clienteSalvo) {
    if (sessao.acao === 'agendar') {
      await enviarMensagem(telefone, `Olá de novo, *${clienteSalvo.Nome}*! 😊`);
      setSessao(telefone, { etapa: 'aguardando_para_quem', clienteResponsavel: clienteSalvo });
      return enviarMensagem(telefone,
        `Este agendamento é para você ou para outra pessoa?\n\n*1.* 👤 Para mim\n*2.* 👥 Para outra pessoa\n\n_ou digite *sair* para encerrar_`
      );
    }
    setSessao(telefone, { cliente: clienteSalvo });
    await enviarMensagem(telefone, `Olá de novo, *${clienteSalvo.Nome}*! 😊`);
    switch (sessao.acao) {
      case 'cancelar': return mostrarAgendamentos(telefone, clienteSalvo, 'cancelar');
      case 'reagendar':return mostrarAgendamentos(telefone, clienteSalvo, 'reagendar');
      case 'listar':   return mostrarAgendamentos(telefone, clienteSalvo, 'listar');
    }
  }
  if (texto === '1') {
    setSessao(telefone, { etapa: 'aguardando_cpf' });
    return enviarMensagem(telefone, `Por favor, informe seu *CPF* (somente números):\n\nExemplo: 12345678901\n\n_ou digite *sair* para encerrar_`);
  }
  if (texto === '2') {
    setSessao(telefone, { etapa: 'aguardando_nome_novo' });
    return enviarMensagem(telefone, `Ótimo! Vamos criar seu cadastro. 😊\n\nQual é o seu *nome completo*?\n\n_ou digite *sair* para encerrar_`);
  }
  return enviarMensagem(telefone, `Opção inválida. Digite *1* para paciente existente ou *2* para novo paciente.`);
}

async function handleParaQuem(telefone, texto, sessao) {
  if (texto === '1') {
    const cliente = sessao.clienteResponsavel;
    setSessao(telefone, { cliente });
    return iniciarFluxoAgendamento(telefone, cliente);
  }
  if (texto === '2') {
    setSessao(telefone, { etapa: 'aguardando_cpf_terceiro' });
    return enviarMensagem(telefone, `Por favor, informe o *CPF* da pessoa para quem deseja agendar:\n\nExemplo: 12345678901\n\n_ou digite *sair* para encerrar_`);
  }
  return enviarMensagem(telefone, `Opção inválida. Digite *1* para você ou *2* para outra pessoa.`);
}

async function handleCPFTerceiro(telefone, texto, sessao) {
  if (!validarCPF(texto)) return enviarMensagem(telefone, `CPF inválido. Informe apenas os *11 números*.\n\nExemplo: 12345678901`);
  const cpf = limparCPF(texto);
  await enviarMensagem(telefone, '🔍 Buscando cadastro...');
  const cliente = await fisiosoft.buscarClientePorCPF(cpf);
  if (cliente) {
    setSessao(telefone, { cliente });
    await enviarMensagem(telefone, `✅ Encontrei o cadastro de *${cliente.Nome}*! 😊`);
    return iniciarFluxoAgendamento(telefone, cliente);
  }
  setSessao(telefone, { etapa: 'aguardando_nome_terceiro', cpfTerceiro: cpf });
  return enviarMensagem(telefone, `Cadastro não encontrado. Vamos criar! 😊\n\nQual é o *nome completo* da pessoa?\n\n_ou digite *sair* para encerrar_`);
}

async function handleNomeTerceiro(telefone, texto, sessao) {
  if (texto.length < 3) return enviarMensagem(telefone, `Nome muito curto. Informe o *nome completo*:`);
  setSessao(telefone, { etapa: 'aguardando_celular_terceiro', nomeTerceiro: texto });
  return enviarMensagem(telefone, `Qual é o *celular* da pessoa com DDD?\n\nExemplo: 11999999999\n\n_ou digite *sair* para encerrar_`);
}

async function handleCelularTerceiro(telefone, texto, sessao) {
  const celular = texto.replace(/\D/g, '');
  if (celular.length < 10) return enviarMensagem(telefone, `Celular inválido. Informe com DDD.\n\nExemplo: 11999999999`);
  await enviarMensagem(telefone, '⏳ Criando cadastro...');
  const novoCliente = await fisiosoft.incluirCliente({
    Nome: sessao.nomeTerceiro, Cpf: sessao.cpfTerceiro,
    Celular: celular, Email: '', Sexo: 'F',
  });
  if (!novoCliente) {
    setSessao(telefone, { etapa: 'menu' });
    return enviarMensagem(telefone, `❌ Erro ao criar cadastro.\n\n${CONTATO_HUMANO}`);
  }
  const cliente = { Id: novoCliente, Nome: sessao.nomeTerceiro };
  setSessao(telefone, { cliente });
  await enviarMensagem(telefone, `✅ Cadastro criado para *${sessao.nomeTerceiro}*! 🎉`);
  return iniciarFluxoAgendamento(telefone, cliente);
}

async function handleCPF(telefone, texto, sessao) {
  if (!validarCPF(texto)) return enviarMensagem(telefone, `CPF inválido. Informe apenas os *11 números*.\n\nExemplo: 12345678901`);
  const cpf = limparCPF(texto);
  await enviarMensagem(telefone, '🔍 Buscando seus dados...');
  const cliente = await fisiosoft.buscarClientePorCPF(cpf);
  if (!cliente) return enviarMensagem(telefone, `❌ CPF *${formatarCPF(cpf)}* não encontrado.\n\nVerifique o CPF ou *0* para voltar ao menu.\n\n${CONTATO_HUMANO}`);
  salvarClientePorTelefone(telefone, cliente);
  if (sessao.acao === 'agendar') {
    setSessao(telefone, { etapa: 'aguardando_para_quem', clienteResponsavel: cliente });
    return enviarMensagem(telefone,
      `Olá, *${cliente.Nome}*! 😊\n\nEste agendamento é para você ou para outra pessoa?\n\n*1.* 👤 Para mim\n*2.* 👥 Para outra pessoa\n\n_ou digite *sair* para encerrar_`
    );
  }
  setSessao(telefone, { cliente });
  switch (sessao.acao) {
    case 'cancelar': return mostrarAgendamentos(telefone, cliente, 'cancelar');
    case 'reagendar':return mostrarAgendamentos(telefone, cliente, 'reagendar');
    case 'listar':   return mostrarAgendamentos(telefone, cliente, 'listar');
  }
}

async function handleNomeNovo(telefone, texto, sessao) {
  if (texto.length < 3) return enviarMensagem(telefone, `Nome muito curto. Informe seu *nome completo*:`);
  setSessao(telefone, { etapa: 'aguardando_cpf_novo', nomeNovo: texto });
  return enviarMensagem(telefone, `Qual é o seu *CPF*? (somente números)\n\nExemplo: 12345678901\n\n_ou digite *sair* para encerrar_`);
}

async function handleCPFNovo(telefone, texto, sessao) {
  if (!validarCPF(texto)) return enviarMensagem(telefone, `CPF inválido. Informe apenas os *11 números*.\n\nExemplo: 12345678901`);
  const cpf = limparCPF(texto);
  setSessao(telefone, { etapa: 'aguardando_celular_novo', cpfNovo: cpf });
  return enviarMensagem(telefone, `Qual é o seu *celular* com DDD?\n\nExemplo: 11999999999\n\n_ou digite *sair* para encerrar_`);
}

async function handleCelularNovo(telefone, texto, sessao) {
  const celular = texto.replace(/\D/g, '');
  if (celular.length < 10) return enviarMensagem(telefone, `Celular inválido. Informe com DDD.\n\nExemplo: 11999999999`);
  await enviarMensagem(telefone, '⏳ Criando seu cadastro...');
  const novoCliente = await fisiosoft.incluirCliente({
    Nome: sessao.nomeNovo, Cpf: sessao.cpfNovo,
    Celular: celular, Email: '', Sexo: 'F',
  });
  if (!novoCliente) {
    setSessao(telefone, { etapa: 'menu' });
    return enviarMensagem(telefone, `❌ Erro ao criar cadastro.\n\n${CONTATO_HUMANO}\n\n*0* para voltar ao menu.`);
  }
  const cliente = { Id: novoCliente, Nome: sessao.nomeNovo };
  salvarClientePorTelefone(telefone, cliente);
  setSessao(telefone, { etapa: 'aguardando_para_quem', clienteResponsavel: cliente });
  await enviarMensagem(telefone, `✅ Cadastro criado com sucesso, *${sessao.nomeNovo}*! 🎉`);
  return enviarMensagem(telefone,
    `Este agendamento é para você ou para outra pessoa?\n\n*1.* 👤 Para mim\n*2.* 👥 Para outra pessoa\n\n_ou digite *sair* para encerrar_`
  );
}

async function iniciarFluxoAgendamento(telefone, cliente) {
  setSessao(telefone, { etapa: 'aguardando_especialidade', cliente });
  return enviarMensagem(telefone,
    `✅ Agendando para *${cliente.Nome}*!\n\nQual especialidade deseja agendar?\n\n` +
    `*1.* 🦴 Fisioterapia\n*2.* 🏊 Hidroterapia\n*3.* 🧘 Pilates\n*4.* 📐 RPG\n` +
    `*5.* 🪡 Acupuntura\n*6.* 🩺 Consulta Vascular\n*7.* 💆 Drenagem / Massagem Relaxante\n\n*0* para voltar ao menu\n_ou digite *sair* para encerrar_`
  );
}

async function handleEspecialidade(telefone, texto, sessao) {
  const especialidade = AGENDAS_POR_ESPECIALIDADE[texto];
  if (!especialidade) return enviarMensagem(telefone, `Opção inválida. Digite um número entre 1 e 7.`);
  await registrarLead(telefone, sessao.cliente?.Nome, especialidade.nome);
  if (especialidade.periodos.length === 1) {
    return buscarEMostrarHorarios(telefone, sessao.cliente, especialidade.periodos[0], especialidade.diasBusca || 7, especialidade);
  }
  const lista = especialidade.periodos.map((p, i) => `*${i+1}.* ${p.label}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_periodo', especialidade });
  return enviarMensagem(telefone, `✅ *${especialidade.nome}*\n\nQual período prefere?\n\n${lista}\n\nDigite o número ou *0* para voltar.\n_ou digite *sair* para encerrar_`);
}

async function handlePeriodo(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  const periodos = sessao.especialidade.periodos;
  if (isNaN(index) || index < 0 || index >= periodos.length)
    return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${periodos.length}.`);
  return buscarEMostrarHorarios(telefone, sessao.cliente, periodos[index], sessao.especialidade.diasBusca || 7, sessao.especialidade);
}

async function buscarEMostrarHorarios(telefone, cliente, agenda, dias, especialidade) {
  await enviarMensagem(telefone, `🔍 Buscando horários disponíveis nos próximos ${dias} dias...`);
  const horarios = await buscarProximosHorarios(agenda.agendaId, agenda.procedimentoId, dias);
  if (!horarios || horarios.length === 0)
    return enviarMensagem(telefone, `😔 Não encontrei horários disponíveis nos próximos ${dias} dias para *${agenda.agendaNome}*.\n\n${CONTATO_HUMANO}\n\n*0* para voltar.`);
  const lista = horarios.map((h, i) => `*${i+1}.* ${h.diaSemana} ${h.data} às ${h.hora}`).join('\n');
  setSessao(telefone, { etapa: 'aguardando_horario', agendaSelecionada: agenda, horariosDisponiveis: horarios, cliente, especialidade });
  return enviarMensagem(telefone, `✅ *Horários disponíveis — ${agenda.agendaNome}:*\n\n${lista}\n\nDigite o número do horário desejado ou *0* para voltar.\n_ou digite *sair* para encerrar_`);
}

async function handleHorario(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.horariosDisponiveis.length)
    return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.horariosDisponiveis.length}.`);
  const horarioEscolhido = sessao.horariosDisponiveis[index];
  setSessao(telefone, { etapa: 'aguardando_confirmacao_agendamento', horarioEscolhido });
  return enviarMensagem(telefone,
    `📋 *Confirme o agendamento:*\n\n` +
    `👤 ${sessao.cliente.Nome}\n💆 ${sessao.agendaSelecionada.agendaNome}\n` +
    `📅 ${horarioEscolhido.diaSemana} ${horarioEscolhido.data}\n🕐 ${horarioEscolhido.hora}\n\n*1* confirmar | *2* cancelar\n\n_ou digite *sair* para encerrar_`
  );
}

async function handleConfirmacaoAgendamento(telefone, texto, sessao) {
  if (texto === '2') {
    setSessao(telefone, { etapa: 'menu' });
    return enviarMensagem(telefone, `Cancelado.\n\n${MENU_PRINCIPAL}`);
  }
  if (texto !== '1') return enviarMensagem(telefone, 'Digite *1* para confirmar ou *2* para cancelar.');
  await enviarMensagem(telefone, '⏳ Realizando agendamento...');
  const resultado = await fisiosoft.incluirAgendamento({
    IdCliente: sessao.cliente.Id, IdAgenda: sessao.agendaSelecionada.agendaId,
    IdProcedimento: sessao.agendaSelecionada.procedimentoId,
    IdProfissional: sessao.agendaSelecionada.idProfissional,
    Data: sessao.horarioEscolhido.data, Hora: sessao.horarioEscolhido.hora,
  });
  resetarSessao(telefone);
  if (!resultado) return enviarMensagem(telefone, `❌ Erro ao agendar.\n\n${CONTATO_HUMANO}`);
  if (resultado.erro) return enviarMensagem(telefone, `⚠️ *${resultado.erro}*\n\nPor favor escolha outro horário ou entre em contato:\n\n${CONTATO_HUMANO}`);
  await marcarAgendou(telefone);

  const nomeAgenda = sessao.agendaSelecionada.agendaNome.toUpperCase();
  const regiao = sessao.regiaoCorpo || null;

  await enviarMensagem(telefone,
    `✅ *Agendamento confirmado!*\n\n` +
    `👤 ${sessao.cliente.Nome}\n💆 ${sessao.agendaSelecionada.agendaNome}\n` +
    `📅 ${sessao.horarioEscolhido.diaSemana} ${sessao.horarioEscolhido.data} às ${sessao.horarioEscolhido.hora}\n\n` +
    `📍 *Clínica Lituânia*\nRua Lituânia, 209 - Mooca\nCEP 03184-020 - São Paulo/SP\n\n` +
    `Até lá! 😊`
  );

  if (nomeAgenda.includes('FISIOTERAPIA')) {
    const orientacaoRoupa = gerarOrientacaoRoupa(regiao);
    await enviarMensagem(telefone,
      `📋 *Orientações para sua consulta:*\n\n` +
      `📁 Traga seus *exames* e *encaminhamento médico* (se houver)\n` +
      orientacaoRoupa
    );
  } else if (nomeAgenda.includes('HIDROTERAPIA')) {
    await enviarMensagem(telefone,
      `📋 *Orientações para sua consulta:*\n\n` +
      `📁 Traga seus *exames* e *encaminhamento médico* (se houver)\n` +
      `👕 Vista roupa leve para vir à clínica\n` +
      `ℹ️ A avaliação está incluída na sua primeira sessão`
    );
    await enviarMensagem(telefone,
      `🏊 *Orientações para Hidroterapia:*\n\n` +
      `✅ *Traje obrigatório:* Sunga ou maiô, touca, chinelo, roupão e toalha\n` +
      `❌ *Proibido adornos:* Brincos, correntes, pulseiras, anéis, etc\n` +
      `❌ *Proibido na piscina:* Cremes, óleos corporais e produtos de perfumaria\n` +
      `⚠️ *Atenção:* Ferimentos, uso de sondas ou alergias de pele impedem o uso da piscina`
    );
  } else if (nomeAgenda.includes('PILATES')) {
    await enviarMensagem(telefone,
      `📋 *Orientações para o Pilates:*\n\n` +
      `📁 Traga seus *exames* e *encaminhamento médico* (se houver)\n` +
      `👟 Vista *roupa leve* e traga *sapatilha de meia*\n` +
      `👥 Turmas com no máximo *3 alunos*\n` +
      `⏱️ Aulas de *1 hora* ministradas por fisioterapeutas experientes`
    );
  } else if (nomeAgenda.includes('RPG')) {
    await enviarMensagem(telefone,
      `📋 *Orientações para o RPG:*\n\n` +
      `📁 Traga seus *exames* e *encaminhamento médico* (se houver)\n` +
      `ℹ️ A avaliação está incluída na sua primeira sessão\n` +
      `👕 Vista *roupa leve para ginástica*\n` +
      `🔄 Temos vestiários disponíveis caso queira se trocar na clínica\n` +
      `⏱️ Sessão individual de *1 hora*, realizada *1x por semana*`
    );
  } else {
    await enviarMensagem(telefone,
      `📋 *Orientações para sua consulta:*\n\n` +
      `📁 Traga seus *exames* e *encaminhamento médico* (se houver)\n` +
      `👕 Vista roupa leve e adequada para o tratamento\n` +
      `ℹ️ A avaliação está incluída na sua primeira sessão`
    );
  }

  await enviarMensagem(telefone,
    `📌 *Informação importante:*\n\n` +
    `O horário agendado é válido para esta sessão. Para dar continuidade ao seu tratamento, as próximas sessões deverão ser agendadas diretamente na recepção da clínica — nossa equipe terá prazer em encontrar os melhores horários para a sua rotina! 😊\n\n` +
    `📞 (11) 2268-3195 | 💬 WhatsApp: (11) 98728-1427`
  );

  setSessao(telefone, { etapa: 'encerrado' });
}

async function mostrarAgendamentos(telefone, cliente, acao) {
  await enviarMensagem(telefone, '🔍 Buscando agendamentos...');
  const agendamentos = await fisiosoft.listarAgendamentosCliente(cliente.Id);
  if (!agendamentos || agendamentos.length === 0) {
    await enviarMensagem(telefone, `📭 Sem agendamentos futuros, *${cliente.Nome}*.\n\nQuando precisar, é só nos enviar um *Olá*. 😊`);
    setSessao(telefone, { etapa: 'encerrado' });
    return;
  }
  const lista = agendamentos.map((a, i) => {
    const dataHora = a.DataHoraInicio ? a.DataHoraInicio.split(' ') : ['', ''];
    const data = dataHora[0] || '';
    const hora = dataHora[1] ? dataHora[1].substring(0, 5) : '';
    return `*${i+1}.* ${data} às ${hora} - ${a.Procedimento || 'Consulta'}`;
  }).join('\n');
  if (acao === 'listar') {
    await enviarMensagem(telefone, `📅 *Seus agendamentos:*\n\n${lista}\n\nQuando precisar, é só nos enviar um *Olá*. 😊`);
    setSessao(telefone, { etapa: 'encerrado' });
    return;
  }
  const emoji = acao === 'cancelar' ? '❌' : '🔄';
  const textoAcao = acao === 'cancelar' ? 'cancelar' : 'reagendar';
  setSessao(telefone, { etapa: acao === 'cancelar' ? 'aguardando_cancelamento' : 'aguardando_reagendamento', agendamentos });
  return enviarMensagem(telefone, `${emoji} Qual deseja *${textoAcao}*?\n\n${lista}\n\nDigite o número ou *0* para voltar.\n_ou digite *sair* para encerrar_`);
}

async function handleCancelamento(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.agendamentos.length)
    return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.agendamentos.length}.`);
  const ag = sessao.agendamentos[index];
  setSessao(telefone, { etapa: 'aguardando_confirmacao_cancel', agendamentoParaCancelar: ag });
  const dataHora = ag.DataHoraInicio ? ag.DataHoraInicio.split(' ') : ['', ''];
  const data = dataHora[0] || '';
  const hora = dataHora[1] ? dataHora[1].substring(0, 5) : '';
  return enviarMensagem(telefone,
    `⚠️ Cancelar este agendamento?\n\n` +
    `👤 ${ag.Cliente || sessao.cliente.Nome}\n📅 ${data} às ${hora}\n💆 ${ag.Procedimento || 'Consulta'}\n\n*1* confirmar | *2* manter\n\n_ou digite *sair* para encerrar_`
  );
}

async function handleConfirmacaoCancel(telefone, texto, sessao) {
  if (texto === '2') {
    setSessao(telefone, { etapa: 'menu' });
    return enviarMensagem(telefone, `Mantido!\n\n${MENU_PRINCIPAL}`);
  }
  if (texto !== '1') return enviarMensagem(telefone, 'Digite *1* para confirmar ou *2* para manter.');
  await enviarMensagem(telefone, '⏳ Cancelando...');
  const resultado = await fisiosoft.desmarcarAgendamento(sessao.agendamentoParaCancelar.IdAgendamento);
  if (!resultado) {
    setSessao(telefone, { etapa: 'menu' });
    return enviarMensagem(telefone, `❌ Erro ao cancelar.\n\n${CONTATO_HUMANO}`);
  }
  await enviarMensagem(telefone, `✅ Cancelado com sucesso!\n\nQuando precisar, é só nos enviar um *Olá*. 😊`);
  setSessao(telefone, { etapa: 'encerrado' });
}

async function handleReagendamento(telefone, texto, sessao) {
  const index = parseInt(texto) - 1;
  if (isNaN(index) || index < 0 || index >= sessao.agendamentos.length)
    return enviarMensagem(telefone, `Opção inválida. Digite entre 1 e ${sessao.agendamentos.length}.`);
  const ag = sessao.agendamentos[index];
  await fisiosoft.desmarcarAgendamento(ag.IdAgendamento);
  const agendaSelecionada = { agendaId: ag.IdAgenda, procedimentoId: ag.IdProcedimento, idProfissional: ag.IdProfissional, agendaNome: ag.Procedimento };
  return buscarEMostrarHorarios(telefone, sessao.cliente, agendaSelecionada, 7, null);
}

async function handleFAQ(telefone, texto) {
  const resposta = buscarResposta(texto);
  if (!resposta) return enviarMensagem(telefone, `Opção inválida.\n\n${listarFAQs()}\n\n*0* para voltar.\n_ou digite *sair* para encerrar_`);
  return enviarMensagem(telefone, `${resposta}\n\n_Outra dúvida? Digite o número ou *0* para voltar._\n_ou digite *sair* para encerrar_`);
}

module.exports = { processarMensagem };
