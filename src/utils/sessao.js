const pool = require('./db');

pool.query(`
  CREATE TABLE IF NOT EXISTS sessoes (
    telefone TEXT PRIMARY KEY,
    dados JSONB,
    atualizado_em TIMESTAMP DEFAULT NOW()
  )
`).catch(console.error);

const cache = new Map();

async function getSessao(telefone) {
  if (cache.has(telefone)) return cache.get(telefone);
  try {
    const res = await pool.query('SELECT dados FROM sessoes WHERE telefone = $1', [telefone]);
    const dados = res.rows[0]?.dados || { etapa: 'encerrado' };
    cache.set(telefone, dados);
    return dados;
  } catch (err) {
    console.error('Erro getSessao:', err.message);
    return { etapa: 'encerrado' };
  }
}

async function setSessao(telefone, novosDados) {
  const atual = cache.get(telefone) || { etapa: 'encerrado' };
  const merged = { ...atual, ...novosDados };
  cache.set(telefone, merged);
  try {
    await pool.query(
      `INSERT INTO sessoes (telefone, dados, atualizado_em) VALUES ($1, $2, NOW())
       ON CONFLICT (telefone) DO UPDATE SET dados = $2, atualizado_em = NOW()`,
      [telefone, JSON.stringify(merged)]
    );
  } catch (err) {
    console.error('Erro setSessao:', err.message);
  }
}

async function resetarSessao(telefone) {
  cache.delete(telefone);
  try {
    await pool.query(
      `INSERT INTO sessoes (telefone, dados, atualizado_em) VALUES ($1, $2, NOW())
       ON CONFLICT (telefone) DO UPDATE SET dados = $2, atualizado_em = NOW()`,
      [telefone, JSON.stringify({ etapa: 'encerrado' })]
    );
  } catch (err) {
    console.error('Erro resetarSessao:', err.message);
  }
}

module.exports = { getSessao, setSessao, resetarSessao };
