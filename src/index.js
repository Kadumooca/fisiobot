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

// Números internos — bot ignora completamente
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
const PALAVRAS_ATIVACAO = ['olá', 'ola', 'oi', 'bom dia', 'boa tarde', 'boa noite'];

function limparTimeouts(telefone) {
  if (timeouts.has(telefone)) {
    const t = timeouts.get(telefone);
    Object.values(t).forEach(id => id && clearTimeout(id));
    timeouts.delete(telefone);
  }
}

function agendarTimeoutHumano(telefone) {
  limparTimeouts(telefone);
  const th = setTimeout(() => {
    const s = getSessao(telefone);
    if (s.etapa === 'atendimento_humano') setSessao(telefone, { etapa: 'encerrado' });
  }, 60 * 60 * 1000);
  timeouts.set(telefone, { th });
}

function agendarTimeoutsInatividade(telefone) {
  limparTimeouts(telefone);
  const s = getSessao(telefone);
  if (['encerrado', 'atendimento_humano'].includes(s.etapa)) return;

  const t1 = setTimeout(async () => {
    const s = getSessao(telefone);
    if (['encerrado', 'atendimento_humano'].includes(s.etapa)) return;
    await enviarMensagem(telefone, `Ainda está por aí? 😊 Estou aqui caso queira continuar!`);
  }, 20 * 60 * 1000);

  const t2 = setTimeout(async () => {
    const s = getSessao(telefone);
    if (['encerrado', 'atendimento_humano'].includes(s.etapa)) return;
    await enviarMensagem(telefone, `Tudo bem! 😊 Vou encerrar por agora.\n\nQuando quiser retomar é só nos chamar com um *Olá*!`);
    setSessao(telefone, { etapa: 'encerrado' });
    limparTimeouts(telefone);
  }, 40 * 60 * 1000);

  timeouts.set(telefone, { t1, t2 });
}

function detectarMidia(body) {
  const msg = body.data?.message;
  return !!(msg?.audioMessage || msg?.videoMessage || msg?.imageMessage ||
    msg?.documentMessage || msg?.stickerMessage || msg?.voiceMessage || msg?.pttMessage);
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const telefone = body.data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    if (!telefone) return res.sendStatus(200);

    // Ignora números internos
    if (NUMEROS_INTERNOS.has(telefone)) return res.sendStatus(200);

    // Registra mensagens nossas
    if (body.data?.key?.fromMe) {
      ultimaMensagemNossa.set(telefone, Date.now());
      return res.sendStatus(200);
    }

    const mensagem = body.data?.message?.conversation ||
                     body.data?.message?.extendedTextMessage?.text;

    const sessao = getSessao(telefone);
    const tempoNossa = ultimaMensagemNossa.get(telefone);
    const tempoDesde = tempoNossa ? (Date.now() - tempoNossa) : Infinity;
    const textoLower = (mensagem || '').toLowerCase().trim();
    const ePalavraAtivacao = PALAVRAS_ATIVACAO.some(p => textoLower === p);

    // Controle de janela 30min após mensagem nossa
    if (tempoNossa) {
      if (tempoDesde < TRINTA_MIN) {
        // Dentro de 30min — silencioso
        return res.sendStatus(200);
      }
      if (tempoDesde >= TRINTA_MIN && ePalavraAtivacao) {
        // Após 30min com palavra de ativação — reativa
        ultimaMensagemNossa.delete(telefone);
      } else if (tempoDesde >= TRINTA_MIN && !ePalavraAtivacao) {
        // Após 30min sem palavra de ativação — ignora
        return res.sendStatus(200);
      }
    }

    // Atendimento humano
    if (sessao.etapa === 'atendimento_humano') {
      agendarTimeoutHumano(telefone);
      return res.sendStatus(200);
    }

    // Mídia
    if (detectarMidia(body)) {
      if (sessao.etapa === 'encerrado') return res.sendStatus(200);
      limparTimeouts(telefone);
      setSessao(telefone, { etapa: 'atendimento_humano' });
      agendarTimeoutHumano(telefone);
      await enviarMensagem(telefone, `Recebi sua mídia! 😊 Um atendente dará continuidade em breve. Por favor aguarde! 🙏`);
      return res.sendStatus(200);
    }

    if (!mensagem) return res.sendStatus(200);

    // Acumula mensagens por 4 segundos
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
      const s = getSessao(telefone);
      if (s.etapa === 'atendimento_humano') agendarTimeoutHumano(telefone);
      else if (!['encerrado'].includes(s.etapa)) agendarTimeoutsInatividade(telefone);
    }, 2000);

    mensagensPendentes.get(telefone).timer = timer;
    return res.sendStatus(200);
  } catch (err) {
    console.error('Erro webhook:', err);
    return res.sendStatus(500);
  }
});

app.get('/setup-db', async (req, res) => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
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
