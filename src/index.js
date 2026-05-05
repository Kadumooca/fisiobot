require('dotenv').config();
const express = require('express');
const { processarMensagem } = require('./handlers/conversa');
const { executarRemarketing } = require('./jobs/remarketing');
const { enviarMensagem } = require('./services/whatsapp');
const { getSessao, setSessao } = require('./utils/sessao');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mapa de timeouts por telefone
const timeouts = new Map();

function limparTimeouts(telefone) {
  if (timeouts.has(telefone)) {
    const { t1, t2 } = timeouts.get(telefone);
    if (t1) clearTimeout(t1);
    if (t2) clearTimeout(t2);
    timeouts.delete(telefone);
  }
}

function agendarTimeouts(telefone) {
  limparTimeouts(telefone);

  const sessao = getSessao(telefone);

  // Não agenda timeout se sessão está encerrada ou no menu inicial
  if (sessao.etapa === 'encerrado' || sessao.etapa === 'menu') return;

  // Timeout 1 — 3 minutos: manda "alô"
  const t1 = setTimeout(async () => {
    const s = getSessao(telefone);
    if (s.etapa === 'encerrado' || s.etapa === 'menu') return;
    await enviarMensagem(telefone, `Alô! 👋 Ainda está por aí? Estou aqui para te ajudar!`);
    setSessao(telefone, { aguardandoResposta: true });
  }, 3 * 60 * 1000);

  // Timeout 2 — 5 minutos: pergunta se encerra
  const t2 = setTimeout(async () => {
    const s = getSessao(telefone);
    if (s.etapa === 'encerrado' || s.etapa === 'menu') return;
    await enviarMensagem(telefone,
      `Parece que você se ocupou com outra coisa! 😊\n\n` +
      `Posso encerrar nosso atendimento por agora?\n\n` +
      `Quando quiser continuar, é só nos enviar um *Olá*!`
    );
    setSessao(telefone, { etapa: 'encerrado' });
    limparTimeouts(telefone);
  }, 5 * 60 * 1000);

  timeouts.set(telefone, { t1, t2 });
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.data?.key?.fromMe) return res.sendStatus(200);
    const mensagem = body.data?.message?.conversation || body.data?.message?.extendedTextMessage?.text;
    if (!mensagem) return res.sendStatus(200);
    const telefone = body.data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    if (!telefone) return res.sendStatus(200);
    console.log(`Mensagem de ${telefone}: ${mensagem}`);

    // Cancela timeouts anteriores ao receber nova mensagem
    limparTimeouts(telefone);

    // Processa mensagem
    await processarMensagem(telefone, mensagem);

    // Agenda novos timeouts após processar
    agendarTimeouts(telefone);

    return res.sendStatus(200);
  } catch (err) {
    console.error('Erro no webhook:', err);
    return res.sendStatus(500);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Job de remarketing — verifica a cada 30 minutos
setInterval(async () => {
  try {
    await executarRemarketing();
  } catch (err) {
    console.error('Erro no job de remarketing:', err);
  }
}, 30 * 60 * 1000);

// Executa uma vez ao iniciar (se estiver no horário)
executarRemarketing().catch(console.error);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FisioBot rodando na porta ${PORT}`);
});
