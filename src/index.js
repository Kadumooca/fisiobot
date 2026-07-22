require('dotenv').config();
const express = require('express');
const { processarMensagem } = require('./handlers/conversa');
const { executarRemarketing } = require('./jobs/remarketing');
const { enviarResumoDiario } = require('./jobs/resumoDiario');
const { enviarMensagem } = require('./services/whatsapp');
const { getSessao, setSessao } = require('./utils/sessao');
const { marcarNaoReativar } = require('./utils/clienteCache');
const dashboardRouter = require('./routes/dashboard');

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
  'boa sessão', 'boa sessao', 'obrigado', 'obrigada', 'foi ótimo',
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
    await enviarMensagem(telefone, `Ainda está por aí? 😊 Estou aqui caso queira continuar!`);
  }, QUINZE_MIN);

  // Encerra após 30min sem interação
  const t2 = setTimeout(async () => {
    const s = await getSessao(telefone);
    if (['encerrado', 'atendimento_humano'].includes(s.etapa)) return;
    await enviarMensagem(telefone, `Tudo bem! 😊 Vou encerrar por agora.\n\nQuando quiser retomar é só nos chamar com um *Olá*!`);
    await setSessao(telefone, { etapa: 'encerrado' });
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
    const telefone = body.data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    if (!telefone) return res.sendStatus(200);

    // Números internos (profissionais da clínica): bot sempre silenciado
    if (NUMEROS_INTERNOS.has(telefone)) {
      console.log(`[INTERNO IGNORADO] ${telefone}`);
      return res.sendStatus(200);
    }

    // Mensagem enviada pelo WhatsApp da clínica (recepção ou bot)
    if (body.data?.key?.fromMe) {
      const sessaoAtual = await getSessao(telefone);

      // Se a sessão está em qualquer etapa ativa do bot, a mensagem fromMe
      // é do próprio bot — ignorar completamente, sem alterar estado.
      const ETAPAS_BOT = [
        'conversando_lissa', 'aguardando_menu', 'aguardando_resposta_lissa',
        'aguardando_especialidade', 'aguardando_periodo', 'aguardando_tipo_cliente',
        'aguardando_nome', 'aguardando_cpf', 'aguardando_horario',
        'aguardando_confirmacao', 'aguardando_horario_busca',
        'aguardando_para_quem', 'aguardando_nome_novo', 'aguardando_cpf_novo',
        'aguardando_sexo_novo', 'aguardando_celular_novo', 'aguardando_nome_terceiro', 'aguardando_cpf_terceiro',
        'aguardando_celular_terceiro'
      ];

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

      if (ETAPAS_BOT.includes(sessaoAtual.etapa)) {
        // Mensagem do bot durante conversa ativa — ignorar
        return res.sendStatus(200);
      }

      // Sessão encerrada ou atendimento_humano: mensagem fromMe é da recepção
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
