const axios = require('axios');
const pool = require('../utils/db');

// Cache em memória para IDs recentes (evita consulta ao banco para mensagens novas)
const idsEnviadosPeloBot = new Set();
const LIMITE_IDS_GUARDADOS = 500;

// Persiste ID no banco para sobreviver a restarts
async function registrarIdBot(id) {
  if (!id) return;

  // Adiciona na memória
  idsEnviadosPeloBot.add(id);
  if (idsEnviadosPeloBot.size > LIMITE_IDS_GUARDADOS) {
    const primeiro = idsEnviadosPeloBot.values().next().value;
    idsEnviadosPeloBot.delete(primeiro);
  }

  // Persiste no banco (TTL de 7 dias — IDs mais antigos não precisam ser verificados)
  try {
    await pool.query(
      `INSERT INTO mensagens_bot (id_mensagem, criado_em)
       VALUES ($1, NOW())
       ON CONFLICT (id_mensagem) DO NOTHING`,
      [id]
    );
  } catch (err) {
    // Não bloqueia o envio se o banco falhar
    console.error('Erro ao registrar ID bot no banco:', err.message);
  }
}

async function ehMensagemDoBot(id) {
  if (!id) return false;

  // Verifica memória primeiro (mais rápido)
  if (idsEnviadosPeloBot.has(id)) return true;

  // Se não está em memória, consulta o banco (pode ser pós-restart)
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM mensagens_bot WHERE id_mensagem = $1 AND criado_em > NOW() - INTERVAL '7 days'`,
      [id]
    );
    if (rows.length > 0) {
      idsEnviadosPeloBot.add(id); // recarrega na memória
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
    await registrarIdBot(idMensagem);
    return idMensagem;
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err.message);
  }
}

module.exports = { enviarMensagem, ehMensagemDoBot };
