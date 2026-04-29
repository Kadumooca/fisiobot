require('dotenv').config();
const express = require('express');
const { processarMensagem } = require('./handlers/conversa');

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FisioBot rodando na porta ${PORT}`);
});
