const axios = require('axios');

// Guarda os IDs das mensagens que o PRÓPRIO BOT enviou, para diferenciar com
// certeza de mensagens digitadas manualmente pela recepção no mesmo número
// (o prefixo do ID não é confiável para essa distinção).
const idsEnviadosPeloBot = new Set();
const LIMITE_IDS_GUARDADOS = 500; // evita crescimento infinito em memória

function registrarIdBot(id) {
  if (!id) return;
  idsEnviadosPeloBot.add(id);
  if (idsEnviadosPeloBot.size > LIMITE_IDS_GUARDADOS) {
    const primeiro = idsEnviadosPeloBot.values().next().value;
    idsEnviadosPeloBot.delete(primeiro);
  }
}

function ehMensagemDoBot(id) {
  return !!id && idsEnviadosPeloBot.has(id);
}

async function enviarMensagem(telefone, mensagem) {
  try {
    const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
    const resposta = await axios.post(url, {
      number: telefone,
      text: mensagem,
    }, {
      headers: { apikey: process.env.EVOLUTION_API_KEY },
    });

    const idMensagem = resposta.data?.key?.id;
    registrarIdBot(idMensagem);
    return idMensagem;
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err.message);
  }
}

module.exports = { enviarMensagem, ehMensagemDoBot };
