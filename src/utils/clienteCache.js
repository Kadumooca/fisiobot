const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Cria a tabela se não existir
async function inicializarTabela() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes_cache (
        telefone VARCHAR(20) PRIMARY KEY,
        cliente_id INTEGER NOT NULL,
        nome VARCHAR(255) NOT NULL,
        criado_em TIMESTAMP DEFAULT NOW(),
        atualizado_em TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Tabela clientes_cache pronta!');
  } catch (err) {
    console.error('Erro ao criar tabela:', err.message);
  }
}

async function buscarClientePorTelefone(telefone) {
  try {
    const result = await pool.query(
      'SELECT cliente_id, nome FROM clientes_cache WHERE telefone = $1',
      [telefone]
    );
    if (result.rows.length === 0) return null;
    return { Id: result.rows[0].cliente_id, Nome: result.rows[0].nome };
  } catch (err) {
    console.error('Erro ao buscar cliente:', err.message);
    return null;
  }
}

async function salvarClientePorTelefone(telefone, cliente) {
  try {
    await pool.query(`
      INSERT INTO clientes_cache (telefone, cliente_id, nome, atualizado_em)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (telefone) DO UPDATE
      SET cliente_id = $2, nome = $3, atualizado_em = NOW()
    `, [telefone, cliente.Id, cliente.Nome]);
  } catch (err) {
    console.error('Erro ao salvar cliente:', err.message);
  }
}

inicializarTabela();

module.exports = { buscarClientePorTelefone, salvarClientePorTelefone };
