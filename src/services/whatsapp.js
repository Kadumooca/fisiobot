const axios = require('axios');

async function enviarMensagem(telefone, mensagem) {
  try {
    const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
    await axios.post(url, {
      number: telefone,
      text: mensagem,
    }, {
      headers: { apikey: process.env.EVOLUTION_API_KEY },
    });
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err.message);
  }
}

module.exports = { enviarMensagem };
