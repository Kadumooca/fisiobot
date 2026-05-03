require('dotenv').config();
const express = require('express');
const { processarMensagem } = require('./handlers/conversa');
const { executarRemarketing } = require('./jobs/remarketing');

const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.data?.key?.fromMe) return res.sendStatus(200);
    const mensagem = body.data?.message?.conversation || body.data?.message?.extendedTextMessage?.text;
    if (!mensagem) return res.sendStatus(200);
    const telefone = body.data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    if (!telefone) return res.sendStatus(200);
    console.log(`Mensagem de ${telefone}: ${mensagem}`);
    processarMensagem(telefone, mensagem).catch(console.error);
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
