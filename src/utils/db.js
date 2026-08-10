const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  // Sem isso, conexões que ficam paradas por um tempo (madrugada, horários de
  // baixo tráfego) podem ser derrubadas silenciosamente pela rede/provedor —
  // o pg só descobre na hora de usar de novo, e o erro que aparece é
  // "Connection terminated due to connection timeout". O keepAlive manda
  // pings de TCP periódicos pra manter a conexão de fato viva.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Sem esse handler, um erro numa conexão ociosa do pool (ex: o Postgres
// derrubando a conexão) dispara um evento 'error' não tratado que DERRUBA
// o processo Node inteiro. Isso pode causar reinícios em cascata.
pool.on('error', (err) => {
  console.error('[PG-POOL] Erro inesperado em conexão ociosa:', err.message);
});

// Fecha as conexões do pool de forma limpa quando o Railway manda SIGTERM
// pra reiniciar/parar o processo. Sem isso, as conexões antigas podem ficar
// "penduradas" no Postgres por alguns segundos, colidindo com as novas
// conexões que o processo subindo tenta abrir — é esse cenário que gera
// o erro "sorry, too many clients already".
async function encerrarPoolComCalma(sinal) {
  console.log(`[PG-POOL] Recebido ${sinal}, encerrando pool de conexões...`);
  try {
    await pool.end();
  } catch (err) {
    console.error('[PG-POOL] Erro ao encerrar pool:', err.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => encerrarPoolComCalma('SIGTERM'));
process.on('SIGINT', () => encerrarPoolComCalma('SIGINT'));

module.exports = pool;
