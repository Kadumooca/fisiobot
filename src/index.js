require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { processarMensagem, transferirParaRecepcao } = require('./handlers/conversa');
const { executarRemarketing } = require('./jobs/remarketing');
const { enviarResumoDiario } = require('./jobs/resumoDiario');
const { enviarMensagem, ehMensagemDoBot, envioBotRecente } = require('./services/whatsapp');
const { getSessao, setSessao } = require('./utils/sessao');
const { marcarNaoReativar } = require('./utils/clienteCache');
const dashboardRouter = require('./routes/dashboard');
const pool = require('./utils/db');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/dashboard', dashboardRouter);

// Exporta função para conversa.js registrar quando o bot encerra uma sessão
global.registrarEncerramentoBot = (telefone) => {
  ultimoEncerramentoBot.set(telefone, Date.now());
};

const NUMEROS_INTERNOS = new Set([
  '5511963675329', '5511959652048', '5511975444523', '5511988404884',
  '5511985033232', '5511998685040', '5511947034822', '5511973858548',
  '5511946650682', '5511997540484', '5511999759486', '5511981490375',
  '5511999811668', '5511983575930', '5511985341813'
]);

const timeouts = new Map();
const ultimaMensagemNossa = new Map();
const mensagensPendentes = new Map();
const ultimoEncerramentoBot = new Map(); // quando o bot encerrou a conversa
const TRINTA_MIN = 30 * 60 * 1000;
const QUINZE_MIN = 15 * 60 * 1000;

// Rastreia a última vez que uma mensagem de paciente foi de fato processada,
// pra alimentar a detecção de "silêncio suspeito" (ver monitorarSaudeConexao).
let ultimaMensagemRecebidaEm = Date.now();

const PALAVRAS_ATIVACAO = ['olá', 'ola', 'oi', 'bom dia', 'boa tarde', 'boa noite'];
const FRASES_ATIVACAO = [
  'olá clínica lituânia, gostaria de mais informações sobre a terapia',
  'ola clinica lituania, gostaria de mais informacoes sobre a terapia',
  'olá, gostaria de mais informações',
  'ola, gostaria de mais informacoes',
];

// Padrões que indicam encerramento pela recepção
const PADROES_ENCERRAMENTO_RECEPCAO = [
  '👋', 'até logo', 'ate logo', 'até mais', 'ate mais', 'tchau', 'flw',
  'boa sessão', 'boa sessao', 'foi ótimo',
  'foi otimo', 'até breve', 'ate breve', 'tenha um bom dia',
  'até a próxima', 'ate a proxima'
];

function limparTimeouts(telefone) {
  if (timeouts.has(telefone)) {
    const t = timeouts.get(telefone);
    Object.values(t).forEach(id => id && clearTimeout(id));
    timeouts.delete(telefone);
  }
}

// Atendimento humano: sem timeout — recepção encerra quando quiser
function agendarTimeoutsInatividade(telefone) {
  limparTimeouts(telefone);

  // Aviso após 15min sem interação (somente conversas em andamento)
  const t1 = setTimeout(async () => {
    const s = await getSessao(telefone);
    if (['encerrado', 'atendimento_humano'].includes(s.etapa)) return;
    // Trava atômica no banco: só quem conseguir de fato gravar o timestamp
    // (rowCount > 0) é que manda a mensagem. Isso elimina a janela de corrida
    // entre "ler o banco" e "escrever no banco" que existia antes — se duas
    // instâncias do processo rodarem ao mesmo tempo (comum em deploys), só
    // uma delas grava a tempo e a outra desiste, em vez de as duas mandarem
    // a mensagem porque nenhuma viu a escrita da outra.
    const { rowCount } = await pool.query(
      `UPDATE sessoes SET dados = jsonb_set(dados, '{avisoInatividadeEm}', to_jsonb($2::text))
       WHERE telefone = $1
         AND (dados->>'avisoInatividadeEm' IS NULL
              OR (dados->>'avisoInatividadeEm')::timestamptz < NOW() - INTERVAL '15 minutes')`,
      [telefone, new Date().toISOString()]
    );
    if (rowCount === 0) return;
    await enviarMensagem(telefone, `Ainda está por aí? 😊 Estou aqui caso queira continuar!`);
  }, QUINZE_MIN);

  // Encerra após 30min sem interação
  const t2 = setTimeout(async () => {
    const s = await getSessao(telefone);
    if (['encerrado', 'atendimento_humano'].includes(s.etapa)) return;
    // Mesma trava atômica pro encerramento automático (e mensagem de despedida)
    const { rowCount } = await pool.query(
      `UPDATE sessoes SET dados = jsonb_set(jsonb_set(dados, '{etapa}', '"encerrado"'), '{encerramentoAutoEm}', to_jsonb($2::text))
       WHERE telefone = $1
         AND (dados->>'encerramentoAutoEm' IS NULL
              OR (dados->>'encerramentoAutoEm')::timestamptz < NOW() - INTERVAL '30 minutes')`,
      [telefone, new Date().toISOString()]
    );
    if (rowCount === 0) return;
    await enviarMensagem(telefone, `Tudo bem! 😊 Vou encerrar por agora.\n\nQuando quiser retomar é só nos chamar com um *Olá*!`);
    limparTimeouts(telefone);
  }, 30 * 60 * 1000);

  timeouts.set(telefone, { t1, t2 });
}

function detectarMidia(body) {
  const msg = body.data?.message;
  return !!(msg?.audioMessage || msg?.videoMessage || msg?.imageMessage ||
    msg?.documentMessage || msg?.stickerMessage || msg?.voiceMessage || msg?.pttMessage);
}

function detectarEncerramentoRecepcao(texto) {
  if (!texto) return false;
  const lower = texto.toLowerCase().trim();
  return PADROES_ENCERRAMENTO_RECEPCAO.some(p => lower.includes(p));
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const remoteJidBruto = body.data?.key?.remoteJid;

    // O WhatsApp às vezes entrega o mesmo evento também sob um identificador
    // de privacidade "@lid" (Linked ID), em vez do número de telefone normal.
    // Sem esse filtro, o sistema trata isso como um contato novo/diferente e
    // cria uma segunda sessão paralela pra mesma pessoa — causando a Lissa se
    // reapresentar do nada no meio da conversa e lembretes/encerramentos
    // duplicados, porque duas sessões passam a rodar em paralelo pro mesmo
    // paciente. A mesma mensagem sempre chega também pelo JID normal
    // (@s.whatsapp.net), então é seguro ignorar a variante @lid.
    if (remoteJidBruto?.endsWith('@lid')) {
      console.log(`[LID-IGNORADO] Evento duplicado via @lid ignorado: ${remoteJidBruto}`);
      return res.sendStatus(200);
    }

    // Quando a Evolution API reconecta ao WhatsApp (ex: depois de um restart),
    // o WhatsApp reenvia um histórico de mensagens antigas pelo mesmo webhook,
    // como se fossem eventos novos. Sem essa checagem, isso reabre em massa
    // conversas antigas pra "atendimento_humano" (inclusive já encerradas há
    // dias) só porque uma resposta antiga da recepção foi "relembrada" pelo
    // WhatsApp — e nada disso é uma interação real acontecendo agora.
    const messageTimestamp = body.data?.messageTimestamp;
    if (messageTimestamp) {
      const idadeSegundos = Date.now() / 1000 - Number(messageTimestamp);
      if (idadeSegundos > 60) {
        console.log(`[HISTORICO-IGNORADO] Evento com ${Math.round(idadeSegundos)}s de idade ignorado — replay de histórico, não mensagem ao vivo.`);
        return res.sendStatus(200);
      }
    }

    const telefone = remoteJidBruto?.replace('@s.whatsapp.net', '');
    if (!telefone) return res.sendStatus(200);

    // Números internos (profissionais da clínica): bot sempre silenciado
    if (NUMEROS_INTERNOS.has(telefone)) {
      console.log(`[INTERNO IGNORADO] ${telefone}`);
      return res.sendStatus(200);
    }

    // Mensagem enviada pelo WhatsApp da clínica (recepção ou bot)
    if (body.data?.key?.fromMe) {
      // O WhatsApp/Evolution API às vezes entrega a MESMA mensagem do
      // paciente duas vezes — uma vez normal (fromMe: false) e outra
      // rotulada incorretamente como fromMe: true. Um humano não consegue
      // fisicamente responder a algo que o bot ainda está com o timer de
      // debounce de 2s rodando pra essa mesma pessoa — se isso acontecer,
      // é quase certeza esse bug de entrega duplicada, não a recepção de
      // verdade. Ignora em vez de silenciar o bot à toa.
      if (mensagensPendentes.has(telefone)) {
        console.log(`[FROMME-SUSPEITO] Evento fromMe ignorado para ${telefone} — chegou durante debounce da própria mensagem do paciente (provável entrega duplicada do WhatsApp)`);
        return res.sendStatus(200);
      }

      const sessaoAtual = await getSessao(telefone);

      // Sessão encerrada: webhook fromMe em até 30s = mensagem de despedida do bot → ignorar
      // Depois de 30s = lembrete manual da recepção → aplica lógica normal
      if (sessaoAtual.etapa === 'encerrado') {
        const encerradoEm = ultimoEncerramentoBot.get(telefone) || 0;
        const deltaSegundos = (Date.now() - encerradoEm) / 1000;
        if (deltaSegundos < 30) {
          console.log(`[BOT-FAREWELL] fromMe ignorado para ${telefone} (${Math.round(deltaSegundos)}s após encerramento)`);
          return res.sendStatus(200);
        }
      }

      // Verifica pelo ID da mensagem se ela foi enviada pelo próprio bot.
      // Não depende de uma lista de nomes de etapas (que sempre fica
      // desatualizada quando uma etapa nova é criada no conversa.js) — o ID
      // é preciso em qualquer etapa, sempre.
      const idMensagem = body.data?.key?.id;
      const confirmadoDoBot = await ehMensagemDoBot(idMensagem);
      if (confirmadoDoBot || envioBotRecente(telefone)) {
        return res.sendStatus(200);
      }

      // Não é do bot → é a recepção assumindo manualmente, em qualquer etapa
      ultimaMensagemNossa.set(telefone, Date.now());
      console.log(`[HUMANO] Mensagem da recepção para ${telefone} (etapa: ${sessaoAtual.etapa})`);

      const textoEnviado = body.data?.message?.conversation ||
                           body.data?.message?.extendedTextMessage?.text || '';

      if (detectarEncerramentoRecepcao(textoEnviado)) {
        await marcarNaoReativar(telefone);
        await setSessao(telefone, { etapa: 'encerrado' });
        limparTimeouts(telefone);
        console.log(`[ENCERRADO] Recepção encerrou conversa com ${telefone}`);
      } else {
        await setSessao(telefone, { etapa: 'atendimento_humano', assumido_em: new Date().toISOString() });
        limparTimeouts(telefone);
        console.log(`[ASSUMIDO] Recepção assumiu conversa com ${telefone}`);
      }

      return res.sendStatus(200);
    }

    const mensagem = body.data?.message?.conversation ||
                     body.data?.message?.extendedTextMessage?.text;

    const sessao = await getSessao(telefone);
    const tempoNossa = ultimaMensagemNossa.get(telefone);
    const tempoDesde = tempoNossa ? (Date.now() - tempoNossa) : Infinity;
    const textoLower = (mensagem || '').toLowerCase().trim();
    const ePalavraAtivacao = PALAVRAS_ATIVACAO.some(p => textoLower === p) ||
                             FRASES_ATIVACAO.some(p => textoLower.startsWith(p));

    if (tempoNossa) {
      if (tempoDesde < TRINTA_MIN) {
        console.log(`[BLOQUEADO] ${telefone} - dentro de 30min (${Math.round(tempoDesde/60000)}min atrás)`);
        return res.sendStatus(200);
      }
      // Passou 30min: libera independente da mensagem
      ultimaMensagemNossa.delete(telefone);
    }

    // Primeiro contato (nunca teve sessão): reativa com qualquer mensagem
    // Sessão encerrada (já conversou antes): só reativa com palavra-chave ou JoinChat
    if (!sessao.etapa || sessao.etapa === 'encerrado') {
      const primeiroContato = sessao._novo === true;
      if (!primeiroContato && !ePalavraAtivacao) {
        console.log(`[SILENCIADO] ${telefone} - conversa encerrada, aguardando ativação`);
        return res.sendStatus(200);
      }
      console.log(`[REATIVADO] ${telefone} - ${primeiroContato ? 'primeiro contato' : 'mensagem de ativação'}`);
      await setSessao(telefone, { etapa: 'conversando_lissa' });
    }

    // Atendimento humano: bot silenciado, recepção conduz sem timeout
    // Paciente respondendo renova o timer de 2h (recepção ainda está ativa)
    if (sessao.etapa === 'atendimento_humano') {
      await setSessao(telefone, { etapa: 'atendimento_humano', assumido_em: new Date().toISOString() });
      console.log(`[HUMANO ATIVO] ${telefone} - bot silenciado, recepção conduz`);
      return res.sendStatus(200);
    }

    if (detectarMidia(body)) {
      if (sessao.etapa === 'encerrado') return res.sendStatus(200);
      limparTimeouts(telefone);
      await setSessao(telefone, { etapa: 'atendimento_humano' });
      await enviarMensagem(telefone, `Recebi sua mídia! 😊 Estamos transferindo seu contato para a recepção, que dará continuidade ao atendimento em breve. Por favor aguarde! 🙏`);
      return res.sendStatus(200);
    }

    if (!mensagem) return res.sendStatus(200);

    // Acumula mensagens por 2 segundos
    if (mensagensPendentes.has(telefone)) {
      clearTimeout(mensagensPendentes.get(telefone).timer);
      mensagensPendentes.get(telefone).textos.push(mensagem);
    } else {
      mensagensPendentes.set(telefone, { textos: [mensagem], timer: null });
    }

    const timer = setTimeout(async () => {
      const pendente = mensagensPendentes.get(telefone);
      if (!pendente) return;
      mensagensPendentes.delete(telefone);
      const textoFinal = pendente.textos.join('\n');
      console.log(`Mensagem de ${telefone}: ${textoFinal}`);
      ultimaMensagemRecebidaEm = Date.now();
      alertaSilencioEnviado = false;

      limparTimeouts(telefone);
      try {
        await processarMensagem(telefone, textoFinal);
      } catch (err) {
        console.error(`Erro processarMensagem ${telefone}:`, err.message);
      }
      const s = await getSessao(telefone);
      if (!['encerrado', 'atendimento_humano'].includes(s.etapa)) {
        agendarTimeoutsInatividade(telefone);
      }
    }, 2000);

    mensagensPendentes.get(telefone).timer = timer;
    return res.sendStatus(200);
  } catch (err) {
    console.error('Erro webhook:', err);
    // Sem isso, um erro ANTES de chegar no processarMensagem (ex: falha ao
    // carregar a sessão) deixava o paciente sem nenhuma resposta — nem a
    // mensagem de fallback, porque esse catch é externo ao processarMensagem
    // e não tinha esse tratamento. Tenta avisar o paciente com o telefone
    // já extraído no início do handler (linha 97), antes de qualquer parte
    // que possa ter falhado.
    try {
      const telefoneFallback = req.body?.data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
      if (telefoneFallback && !NUMEROS_INTERNOS.has(telefoneFallback) && !req.body?.data?.key?.fromMe) {
        await transferirParaRecepcao(telefoneFallback);
      }
    } catch (err2) {
      console.error('Erro no fallback do catch externo do webhook:', err2.message);
    }
    return res.sendStatus(500);
  }
});

app.get('/setup-db', async (req, res) => {
  const pool = require('./utils/db');
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS mensagens_bot (id_mensagem TEXT PRIMARY KEY, criado_em TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mensagens_bot_criado ON mensagens_bot (criado_em)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS sessoes (telefone TEXT PRIMARY KEY, dados JSONB, atualizado_em TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS clientes_cache (telefone TEXT PRIMARY KEY, dados JSONB, criado_em TIMESTAMP DEFAULT NOW(), atualizado_em TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS leads (id SERIAL PRIMARY KEY, telefone TEXT, nome TEXT, especialidade TEXT, status TEXT DEFAULT 'lead', etapa_encerramento TEXT, tentativas_reativacao INTEGER DEFAULT 0, criado_em TIMESTAMP DEFAULT NOW(), atualizado_em TIMESTAMP DEFAULT NOW(), agendou_em TIMESTAMP, ultima_mensagem_em TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS conversas (id SERIAL PRIMARY KEY, telefone TEXT, etapa TEXT, status TEXT DEFAULT 'ativa', transferido_humano BOOLEAN DEFAULT FALSE, agendou BOOLEAN DEFAULT FALSE, criado_em TIMESTAMP DEFAULT NOW(), atualizado_em TIMESTAMP DEFAULT NOW(), encerrado_em TIMESTAMP)`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS tentativas_reativacao INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ultima_mensagem_em TIMESTAMP DEFAULT NOW()`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS agendou_em TIMESTAMP`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS etapa_encerramento TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'lead'`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT NOW()`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT NOW()`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativa'`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS transferido_humano BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS agendou BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS encerrado_em TIMESTAMP`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS etapa TEXT`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT NOW()`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT NOW()`);
    res.json({ ok: true, mensagem: 'Banco configurado com sucesso!' });
  } catch (err) {
    res.json({ ok: false, erro: err.message });
  }
});

app.get('/fix-sessoes', async (req, res) => {
  const pool = require('./utils/db');
  try {
    const { rowCount } = await pool.query(
      `UPDATE sessoes SET dados = jsonb_set(dados, '{etapa}', '"encerrado"') WHERE dados->>'etapa' = 'atendimento_humano'`
    );
    res.json({ ok: true, liberadas: rowCount });
  } catch (err) {
    res.json({ ok: false, erro: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

process.on('uncaughtException', (err) => {
  console.error('ERRO NÃO CAPTURADO:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('PROMISE REJEITADA:', reason);
});

const DUAS_HORAS = 2 * 60 * 60 * 1000;

// Libera sessões atendimento_humano após 2h de inatividade (job a cada 15min)
setInterval(async () => {
  try {
    const pool = require('./utils/db');
    const limite = new Date(Date.now() - DUAS_HORAS).toISOString();
    const { rowCount } = await pool.query(
      `UPDATE sessoes
       SET dados = jsonb_set(dados, '{etapa}', '"encerrado"')
       WHERE dados->>'etapa' = 'atendimento_humano'
       AND (dados->>'assumido_em') IS NOT NULL
       AND (dados->>'assumido_em')::timestamptz < $1`,
      [limite]
    );
    if (rowCount > 0) console.log(`[TIMEOUT] ${rowCount} sessão(ões) atendimento_humano expiradas → encerrado`);
  } catch (err) {
    console.error('Erro timeout atendimento_humano:', err.message);
  }
}, 15 * 60 * 1000);

setInterval(async () => {
  try { await executarRemarketing(); }
  catch (err) { console.error('Erro remarketing:', err); }
}, 30 * 60 * 1000);

// Horário comercial (seg-sex, 7h-20h, fuso de São Paulo) — usado pra saber se
// um silêncio prolongado de mensagens é ou não esperado.
function dentroDoHorarioComercial() {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(agora);
  const hora = parseInt(partes.find(p => p.type === 'hour').value, 10);
  const diaSemana = (partes.find(p => p.type === 'weekday').value || '').toLowerCase();
  const diasUteis = ['seg', 'ter', 'qua', 'qui', 'sex'];
  return diasUteis.some(d => diaSemana.startsWith(d)) && hora >= 7 && hora < 20;
}

async function alertarInstabilidade(motivo, jaAlertado, marcarAlertado) {
  const numeroAlerta = process.env.NUMERO_ALERTA;
  console.error(`[ALERTA-INSTABILIDADE] ${motivo}`);
  if (!numeroAlerta) {
    console.error('[ALERTA-INSTABILIDADE] NUMERO_ALERTA não configurado — alerta ficou só no log.');
    return;
  }
  if (jaAlertado()) return; // evita repetir pro mesmo episódio em andamento
  marcarAlertado();
  try {
    await enviarMensagem(numeroAlerta, `⚠️ *Alerta FisioBot*\n\n${motivo}\n\nVale checar o WhatsApp da clínica manualmente e a conexão da Evolution API no Railway.`);
  } catch (err) {
    console.error('[ALERTA-INSTABILIDADE] Falha ao enviar o próprio alerta:', err.message);
  }
}

// Camada 1: pergunta direto pra Evolution API se a instância está conectada.
// Pega desconexões completas (instância caiu, precisa de novo QR code, etc.)
// Controle de alerta PRÓPRIO — não interfere no da camada 2.
let alertaConexaoEnviado = false;
async function verificarConexaoEvolutionAPI() {
  try {
    const url = `${process.env.EVOLUTION_API_URL}/instance/connectionState/${process.env.EVOLUTION_INSTANCE}`;
    const { data } = await axios.get(url, {
      headers: { apikey: process.env.EVOLUTION_API_KEY },
      timeout: 8000,
    });
    const estado = data?.instance?.state || data?.state;
    if (estado !== 'open') {
      await alertarInstabilidade(
        `A Evolution API respondeu, mas o estado da conexão é "${estado}" (esperado: "open"). O WhatsApp pode estar desconectado.`,
        () => alertaConexaoEnviado,
        () => { alertaConexaoEnviado = true; }
      );
    } else {
      alertaConexaoEnviado = false; // conexão ok de novo — libera pra alertar se cair de novo depois
    }
  } catch (err) {
    await alertarInstabilidade(
      `Não consegui consultar o status da Evolution API: ${err.message}. Ela pode estar fora do ar ou travada.`,
      () => alertaConexaoEnviado,
      () => { alertaConexaoEnviado = true; }
    );
  }
}

// Camada 2: mesmo com a Evolution API dizendo "open", ela pode estar
// silenciosamente falhando em repassar mensagens recebidas (foi exatamente
// o que aconteceu no incidente do Redis instável). Se ficar tempo demais sem
// nenhuma mensagem de paciente durante horário comercial, isso é suspeito.
// Limite alto de propósito — só pra avisar em casos realmente fora do comum,
// não em manhãs/dias mais parados. Controle de alerta PRÓPRIO (não
// compartilha com a camada 1), e só reseta quando uma mensagem real chega.
const JANELA_SILENCIO_SUSPEITO = 2 * 60 * 60 * 1000; // 2h
let alertaSilencioEnviado = false;
function verificarSilencioSuspeito() {
  if (!dentroDoHorarioComercial()) return;
  const tempoSemMensagem = Date.now() - ultimaMensagemRecebidaEm;
  if (tempoSemMensagem > JANELA_SILENCIO_SUSPEITO) {
    const minutos = Math.round(tempoSemMensagem / 60000);
    alertarInstabilidade(
      `Nenhuma mensagem de paciente processada nos últimos ${minutos} minutos, em plena hora comercial. Pode ser só um dia bem calmo, mas também pode ser mensagens se perdendo antes de chegar no bot (já aconteceu por instabilidade do Redis da Evolution API).`,
      () => alertaSilencioEnviado,
      () => { alertaSilencioEnviado = true; }
    );
  }
}

setInterval(verificarConexaoEvolutionAPI, 10 * 60 * 1000);
setInterval(verificarSilencioSuspeito, 10 * 60 * 1000);

function agendarResumoDiario() {
  const agora = new Date();
  const alvo = new Date();
  alvo.setHours(20, 0, 0, 0);
  if (agora >= alvo) alvo.setDate(alvo.getDate() + 1);
  setTimeout(async () => {
    await enviarResumoDiario();
    setInterval(enviarResumoDiario, 24 * 60 * 60 * 1000);
  }, alvo - agora);
  console.log(`Resumo diário agendado para ${alvo.toLocaleString('pt-BR')}`);
}

agendarResumoDiario();
// Aguarda 30s após startup para evitar "too many clients" durante inicialização
setTimeout(() => executarRemarketing().catch(console.error), 30000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FisioBot rodando na porta ${PORT}`);
  console.log(`Dashboard: https://fisiobot-production.up.railway.app/dashboard`);
});
