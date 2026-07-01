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
    const res = await pool.query('SELECT dados, atualizado_em FROM sessoes WHERE telefone = $1', [telefone]);
    if (!res.rows[0]) return { etapa: 'encerrado', _novo: true };

    const dados = res.rows[0].dados || { etapa: 'encerrado' };
    const atualizadoEm = new Date(res.rows[0].atualizado_em);
    const agora = new Date();
    const horas = (agora - atualizadoEm) / 1000 / 60 / 60;

    // Após 3 horas de inatividade — reinicia como nova conversa
    if (horas >= 3) {
      const novaSessao = { etapa: 'encerrado' };
      cache.set(telefone, novaSessao);
      return novaSessao;
    }

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
