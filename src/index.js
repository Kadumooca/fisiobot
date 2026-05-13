require('dotenv').config();
const express = require('express');
const { processarMensagem } = require('./handlers/conversa');
const { executarRemarketing } = require('./jobs/remarketing');
const { enviarResumoDiario } = require('./jobs/resumoDiario');
const { enviarMensagem } = require('./services/whatsapp');
const { getSessao, setSessao } = require('./utils/sessao');
const dashboardRouter = require('./routes/dashboard');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/dashboard', dashboardRouter);

const timeouts = new Map();

function limparTimeouts(telefone) {
  if (timeouts.has(telefone)) {
    const { t1, t2, t3, th } = timeouts.get(telefone);
    if (t1) clearTimeout(t1);
    if (t2) clearTimeout(t2);
    if (t3) clearTimeout(t3);
    if (th) clearTimeout(th);
    timeouts.delete(telefone);
  }
}

function agendarTimeoutHumano(telefone) {
  limparTimeouts(telefone);
  const th = setTimeout(async () => {
    const s = getSessao(telefone);
    if (s.etapa !== 'atendimento_humano') return;
    setSessao(telefone, { etapa: 'encerrado' });
  }, 1 * 60 * 60 * 1000);
  timeouts.set(telefone, { th });
}

function agendarTimeoutsInatividade(telefone) {
  limparTimeouts(telefone);
  const sessao = getSessao(telefone);
  if (sessao.etapa === 'encerrado' || sessao.etapa === 'menu' || sessao.etapa === 'atendimento_humano') return;

  const t1 = setTimeout(async () => {
    const s = getSessao(telefone);
    if (s.etapa === 'encerrado' || s.etapa === 'menu' || s.etapa === 'atendimento_humano') return;
    await enviarMensagem(telefone, `Olá! 😊 Ainda está por aí? Estou aqui caso queira continuar ou tirar alguma dúvida!`);
  }, 15 * 60 * 1000);

  const t2 = setTimeout(async () => {
    const s = getSessao(telefone);
    if (s.etapa === 'encerrado' || s.etapa === 'menu' || s.etapa === 'atendimento_humano') return;
    await enviarMensagem(telefone, `Oi novamente! 😊 Caso queira retomar nossa conversa ou agendar um horário na *Clínica Lituânia*, estou à disposição!`);
  }, 30 * 60 * 1000);

  const t3 = setTimeout(async () => {
    const s = getSessao(telefone);
    if (s.etapa === 'encerrado' || s.etapa === 'menu' || s.etapa === 'atendimento_humano') return;
    await enviarMensagem(telefone,
      `Tudo bem! 😊 Vou encerrar nosso atendimento por agora.\n\nQuando quiser retomar, é só nos enviar um *Olá* e terei prazer em te atender!`
    );
    setSessao(telefone, { etapa: 'encerrado' });
    limparTimeouts(telefone);
  }, 45 * 60 * 1000);

  timeouts.set(telefone, { t1, t2, t3 });
}

function agendarTimeoutsOferta(telefone) {
  limparTimeouts(telefone);
  const sessao = getSessao(telefone);
  if (sessao.etapa !== 'aguardando_resposta_agendamento') return;

  const t1 = setTimeout(async () => {
    const s = getSessao(telefone);
    if (s.etapa === 'encerrado' || s.etapa === 'menu' || s.etapa === 'atendimento_humano') return;
    await enviarMensagem(telefone,
      `Oi! 😊 Ainda está pensando se gostaria de agendar?\n\nEstou aqui para te ajudar a dar esse primeiro passo no seu tratamento!`
    );
  }, 5 * 60 * 1000);

  const t2 = setTimeout(async () => {
    const s = getSessao(telefone);
    if (s.etapa === 'encerrado' || s.etapa === 'menu' || s.etapa === 'atendimento_humano') return;
    await enviarMensagem(telefone,
      `Tudo bem! 😊 Vou encerrar nosso atendimento por agora.\n\nQuando quiser retomar, é só nos enviar um *Olá* e terei prazer em te atender!`
    );
    setSessao(telefone, { etapa: 'encerrado' });
    limparTimeouts(telefone);
  }, 15 * 60 * 1000);

  timeouts.set(telefone, { t1, t2 });
}

function detectarMidia(body) {
  const msg = body.data?.message;
  return !!(msg?.audioMessage || msg?.videoMessage || msg?.imageMessage ||
    msg?.documentMessage || msg?.stickerMessage || msg?.voiceMessage || msg?.pttMessage);
}

function detectarPerguntaSobreAudio(mensagem) {
  if (!mensagem) return false;
  const textoLower = mensagem.toLowerCase();
  const palavras = [
    'posso mandar audio', 'posso enviar audio', 'aceita audio',
    'posso mandar áudio', 'posso enviar áudio', 'aceita áudio',
    'posso mandar voz', 'posso enviar voz', 'aceita voz',
    'posso mandar foto', 'posso enviar foto', 'aceita foto',
    'posso mandar video', 'posso enviar video', 'aceita video',
    'posso mandar vídeo', 'posso enviar vídeo', 'aceita vídeo',
    'posso gravar', 'mensagem de voz', 'por voz', 'gravação de voz',
    'aceita imagem', 'posso mandar imagem', 'posso enviar imagem',
    'manda foto', 'manda audio', 'manda áudio', 'manda vídeo', 'manda video'
  ];
  return palavras.some(p => textoLower.includes(p));
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.data?.key?.fromMe) return res.sendStatus(200);

    const telefone = body.data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    if (!telefone) return res.sendStatus(200);

    const mensagem = body.data?.message?.conversation ||
                     body.data?.message?.extendedTextMessage?.text;

    const sessaoAtual = getSessao(telefone);

    if (sessaoAtual.etapa === 'atendimento_humano') {
      agendarTimeoutHumano(telefone);
      return res.sendStatus(200);
    }

    if (detectarMidia(body)) {
      if (sessaoAtual.etapa === 'encerrado') return res.sendStatus(200);
      limparTimeouts(telefone);
      setSessao(telefone, { etapa: 'atendimento_humano' });
      agendarTimeoutHumano(telefone);
      await enviarMensagem(telefone,
        `😊 Recebi sua mídia! A partir deste momento um de nossos atendentes irá dar continuidade à conversa.\n\nPor favor, aguarde — em breve retornaremos! 🙏`
      );
      return res.sendStatus(200);
    }

    if (detectarPerguntaSobreAudio(mensagem)) {
      if (sessaoAtual.etapa === 'encerrado') return res.sendStatus(200);
      await enviarMensagem(telefone,
        `😊 Sou um assistente virtual e trabalho apenas com mensagens de texto. Escreva o que precisa e terei prazer em te ajudar!`
      );
      return res.sendStatus(200);
    }

    if (!mensagem) return res.sendStatus(200);

    console.log(`Mensagem de ${telefone}: ${mensagem}`);

    limparTimeouts(telefone);
    await processarMensagem(telefone, mensagem);

    const sessaoDepois = getSessao(telefone);

    if (sessaoDepois.etapa === 'atendimento_humano') {
      agendarTimeoutHumano(telefone);
    } else if (sessaoDepois.etapa === 'aguardando_resposta_agendamento') {
      agendarTimeoutsOferta(telefone);
    } else if (sessaoDepois.etapa !== 'encerrado' && sessaoDepois.etapa !== 'menu') {
      agendarTimeoutsInatividade(telefone);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('Erro no webhook:', err);
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
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'lead'`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS tentativas_reativacao INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ultima_mensagem_em TIMESTAMP DEFAULT NOW()`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS agendou_em TIMESTAMP`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS etapa_encerramento TEXT`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativa'`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS transferido_humano BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS agendou BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS encerrado_em TIMESTAMP`);
    await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS etapa TEXT`);
    res.json({ ok: true, mensagem: 'Banco configurado com sucesso!' });
  } catch (err) {
    res.json({ ok: false, erro: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Remarketing a cada 30 min
setInterval(async () => {
  try { await executarRemarketing(); }
  catch (err) { console.error('Erro remarketing:', err); }
}, 30 * 60 * 1000);

// Resumo diário às 20h
function agendarResumoDiario() {
  const agora = new Date();
  const alvo = new Date();
  alvo.setHours(20, 0, 0, 0);
  if (agora >= alvo) alvo.setDate(alvo.getDate() + 1);
  const diff = alvo - agora;
  setTimeout(async () => {
    await enviarResumoDiario();
    setInterval(enviarResumoDiario, 24 * 60 * 60 * 1000);
  }, diff);
  console.log(`Resumo diário agendado para ${alvo.toLocaleString('pt-BR')}`);
}

agendarResumoDiario();
executarRemarketing().catch(console.error);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FisioBot rodando na porta ${PORT}`);
  console.log(`Dashboard: https://fisiobot-production.up.railway.app/dashboard`);
});
