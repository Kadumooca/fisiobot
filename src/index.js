require('dotenv').config();
const express = require('express');
const { processarMensagem } = require('./handlers/conversa');
const { executarRemarketing } = require('./jobs/remarketing');
const { enviarResumoDiario } = require('./jobs/resumoDiario');
const { enviarMensagem, ehMensagemDoBot } = require('./services/whatsapp');
const { getSessao, setSessao } = require('./utils/sessao');
const { marcarNaoReativar } = require('./utils/clienteCache');
const dashboardRouter = require('./routes/dashboard');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/dashboard', dashboardRouter);

const NUMEROS_INTERNOS = new Set([
  '5511963675329', '5511959652048', '5511975444523', '5511988404884',
  '5511985033232', '5511998685040', '5511947034822', '5511973858548',
  '5511946650682', '5511997540484', '5511999759486', '5511981490375',
  '5511999811668', '5511983575930', '5511985341813'
]);

const timeouts = new Map();
const ultimaMensagemNossa = new Map();
const mensagensPendentes = new Map();
const TRINTA_MIN = 30 * 60 * 1000;
const QUINZE_MIN = 15 * 60 * 1000;
const PALAVRAS_ATIVACAO = ['olá', 'ola', 'oi', 'bom dia', 'boa tarde', 'boa noite'];

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
      const idMensagem = body.data?.key?.id || '';
      const ehMensagemBot = ehMensagemDoBot(idMensagem);

      if (!ehMensagemBot) {
        // Mensagem humana enviada pela recepção
        ultimaMensagemNossa.set(telefone, Date.now());
        console.log(`[HUMANO] Mensagem nossa para ${telefone}`);

        const textoEnviado = body.data?.message?.conversation ||
                             body.data?.message?.extendedTextMessage?.text || '';

        if (detectarEncerramentoRecepcao(textoEnviado)) {
          // Recepção se despediu → encerra, paciente pode reativar com qualquer mensagem
          await marcarNaoReativar(telefone);
          await setSessao(telefone, { etapa: 'encerrado' });
          limparTimeouts(telefone);
          console.log(`[ENCERRADO] Recepção encerrou conversa com ${telefone}`);
        } else {
          // Qualquer outra mensagem manual da recepção assume a conversa:
          // o bot fica silenciado até a recepção encerrar explicitamente.
          await setSessao(telefone, { etapa: 'atendimento_humano' });
          limparTimeouts(telefone);
          console.log(`[ASSUMIDO] Recepção assumiu conversa com ${telefone}`);
        }
      }
      return res.sendStatus(200);
    }

    const mensagem = body.data?.message?.conversation ||
                     body.data?.message?.extendedTextMessage?.text;

    const sessao = await getSessao(telefone);
    const tempoNossa = ultimaMensagemNossa.get(telefone);
    const tempoDesde = tempoNossa ? (Date.now() - tempoNossa) : Infinity;
    const textoLower = (mensagem || '').toLowerCase().trim();
    const ePalavraAtivacao = PALAVRAS_ATIVACAO.some(p => textoLower === p);

    if (tempoNossa) {
      if (tempoDesde < TRINTA_MIN) {
        console.log(`[BLOQUEADO] ${telefone} - dentro de 30min (${Math.round(tempoDesde/60000)}min atrás)`);
        return res.sendStatus(200);
      }
      // Passou 30min: libera independente da mensagem
      ultimaMensagemNossa.delete(telefone);
    }

    // Conversa encerrada: só reativa com palavra-chave
    // (evita que respostas como "Ok", "Confirmado" a lembretes manuais reativem o bot)
    if (sessao.etapa === 'encerrado') {
      if (!ePalavraAtivacao) {
        console.log(`[SILENCIADO] ${telefone} - conversa encerrada, aguardando palavra-chave`);
        return res.sendStatus(200);
      }
      console.log(`[REATIVADO] ${telefone} - palavra-chave recebida`);
      await setSessao(telefone, { etapa: 'conversando_lissa' });
    }

    // Atendimento humano: bot silenciado, recepção conduz sem timeout
    if (sessao.etapa === 'atendimento_humano') {
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

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

process.on('uncaughtException', (err) => {
  console.error('ERRO NÃO CAPTURADO:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('PROMISE REJEITADA:', reason);
});

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
executarRemarketing().catch(console.error);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FisioBot rodando na porta ${PORT}`);
  console.log(`Dashboard: https://fisiobot-production.up.railway.app/dashboard`);
});
