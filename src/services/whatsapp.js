const axios = require('axios');
const pool = require('../utils/db');

// Cache em memória — fonte primária e mais rápida
// Persiste enquanto o processo estiver rodando
const idsEnviadosPeloBot = new Set();
const LIMITE_IDS_GUARDADOS = 1000; // aumentado para cobrir mais histórico

function registrarIdBotMemoria(id) {
  if (!id) return;
  idsEnviadosPeloBot.add(id);
  if (idsEnviadosPeloBot.size > LIMITE_IDS_GUARDADOS) {
    const primeiro = idsEnviadosPeloBot.values().next().value;
    idsEnviadosPeloBot.delete(primeiro);
  }
}

// Persiste no banco de forma assíncrona (não bloqueia o envio)
async function registrarIdBotBanco(id) {
  if (!id) return;
  try {
    await pool.query(
      `INSERT INTO mensagens_bot (id_mensagem, criado_em)
       VALUES ($1, NOW())
       ON CONFLICT (id_mensagem) DO NOTHING`,
      [id]
    );
  } catch (err) {
    console.error('Erro ao registrar ID bot no banco:', err.message);
  }
}

async function ehMensagemDoBot(id) {
  if (!id) return false;

  // Verifica memória primeiro — cobre 100% dos casos normais
  if (idsEnviadosPeloBot.has(id)) {
    return true;
  }

  // Consulta banco apenas após restart (ID não está em memória)
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM mensagens_bot WHERE id_mensagem = $1 AND criado_em > NOW() - INTERVAL '7 days'`,
      [id]
    );
    if (rows.length > 0) {
      idsEnviadosPeloBot.add(id); // recarrega na memória
      console.log(`[BOT-ID] ID ${id} recuperado do banco`);
      return true;
    }
  } catch (err) {
    console.error('Erro ao verificar ID bot no banco:', err.message);
  }

  return false;
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
    if (idMensagem) {
      // Registra em memória IMEDIATAMENTE (síncrono)
      registrarIdBotMemoria(idMensagem);
      // Persiste no banco em background (assíncrono, não bloqueia)
      registrarIdBotBanco(idMensagem).catch(err =>
        console.error('Erro background registrarIdBotBanco:', err.message)
      );
    }
    return idMensagem;
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err.message);
  }
}

module.exports = { enviarMensagem, ehMensagemDoBot };
