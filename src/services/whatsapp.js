const axios = require('axios');

const evolution = axios.create({
  baseURL: process.env.EVOLUTION_API_URL,
  headers: {
    apikey: process.env.EVOLUTION_API_KEY,
    'Content-Type': 'application/json',
  },
});

const INSTANCE = process.env.EVOLUTION_INSTANCE;

async function enviarMensagem(telefone, texto) {
  try {
    await evolution.post(`/message/sendText/${INSTANCE}`, {
      number: telefone,
      text: texto,
    });
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err.message);
  }
}

module.exports = { enviarMensagem };
