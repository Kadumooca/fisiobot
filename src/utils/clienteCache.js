const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function inicializarTabela() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes_cache (
        telefone VARCHAR(20) PRIMARY KEY,
        cliente_id INTEGER,
        nome VARCHAR(255),
        criado_em TIMESTAMP DEFAULT NOW(),
        atualizado_em TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        telefone VARCHAR(20) NOT NULL,
        nome VARCHAR(255),
        especialidade VARCHAR(100),
        agendou BOOLEAN DEFAULT FALSE,
        data_contato TIMESTAMP DEFAULT NOW(),
        tentativas_remarketing INTEGER DEFAULT 0,
        ultima_tentativa TIMESTAMP,
        respondeu_remarketing BOOLEAN DEFAULT FALSE,
        motivo_nao_agendou TEXT,
        ativo BOOLEAN DEFAULT TRUE
      )
    `);

    console.log('Tabelas prontas!');
  } catch (err) {
    console.error('Erro ao criar tabelas:', err.message);
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

async function registrarLead(telefone, nome, especialidade) {
  try {
    await pool.query(`
      INSERT INTO leads (telefone, nome, especialidade, data_contato)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT DO NOTHING
    `, [telefone, nome, especialidade]);
  } catch (err) {
    console.error('Erro ao registrar lead:', err.message);
  }
}

async function marcarAgendou(telefone) {
  try {
    await pool.query(`
      UPDATE leads SET agendou = TRUE, ativo = FALSE
      WHERE telefone = $1 AND agendou = FALSE
    `, [telefone]);
  } catch (err) {
    console.error('Erro ao marcar agendou:', err.message);
  }
}

async function buscarLeadsParaRemarketing() {
  try {
    const result = await pool.query(`
      SELECT * FROM leads
      WHERE agendou = FALSE
      AND ativo = TRUE
      AND tentativas_remarketing < 2
      AND data_contato < NOW() - INTERVAL '1 day'
      AND (ultima_tentativa IS NULL OR ultima_tentativa < NOW() - INTERVAL '1 day')
      AND respondeu_remarketing = FALSE
    `);
    return result.rows;
  } catch (err) {
    console.error('Erro ao buscar leads:', err.message);
    return [];
  }
}

async function atualizarTentativaRemarketing(telefone) {
  try {
    await pool.query(`
      UPDATE leads 
      SET tentativas_remarketing = tentativas_remarketing + 1,
          ultima_tentativa = NOW()
      WHERE telefone = $1
    `, [telefone]);
  } catch (err) {
    console.error('Erro ao atualizar tentativa:', err.message);
  }
}

async function marcarRespondeuRemarketing(telefone) {
  try {
    await pool.query(`
      UPDATE leads SET respondeu_remarketing = TRUE
      WHERE telefone = $1
    `, [telefone]);
  } catch (err) {
    console.error('Erro ao marcar respondeu:', err.message);
  }
}

inicializarTabela();

module.exports = {
  buscarClientePorTelefone,
  salvarClientePorTelefone,
  registrarLead,
  marcarAgendou,
  buscarLeadsParaRemarketing,
  atualizarTentativaRemarketing,
  marcarRespondeuRemarketing,
};
