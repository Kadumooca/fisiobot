const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function inicializarBanco() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes_cache (
      telefone TEXT PRIMARY KEY,
      dados JSONB,
      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      telefone TEXT,
      nome TEXT,
      especialidade TEXT,
      status TEXT DEFAULT 'lead',
      etapa_encerramento TEXT,
      tentativas_reativacao INTEGER DEFAULT 0,
      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW(),
      agendou_em TIMESTAMP,
      ultima_mensagem_em TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversas (
      id SERIAL PRIMARY KEY,
      telefone TEXT,
      etapa TEXT,
      status TEXT DEFAULT 'ativa',
      transferido_humano BOOLEAN DEFAULT FALSE,
      agendou BOOLEAN DEFAULT FALSE,
      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW(),
      encerrado_em TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS tentativas_reativacao INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ultima_mensagem_em TIMESTAMP DEFAULT NOW()`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS agendou_em TIMESTAMP`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS etapa_encerramento TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'lead'`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT NOW()`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT NOW()`);
  await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativa'`);
  await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS transferido_humano BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS agendou BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS encerrado_em TIMESTAMP`);
  await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS etapa TEXT`);
  await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT NOW()`);
  await pool.query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT NOW()`);
}

inicializarBanco().catch(console.error);

async function buscarClientePorTelefone(telefone) {
  try {
    const res = await pool.query('SELECT dados FROM clientes_cache WHERE telefone = $1', [telefone]);
    return res.rows[0]?.dados || null;
  } catch (err) {
    console.error('Erro buscarClientePorTelefone:', err.message);
    return null;
  }
}

async function salvarClientePorTelefone(telefone, dados) {
  try {
    await pool.query(
      `INSERT INTO clientes_cache (telefone, dados, atualizado_em)
       VALUES ($1, $2, NOW())
       ON CONFLICT (telefone) DO UPDATE SET dados = $2, atualizado_em = NOW()`,
      [telefone, JSON.stringify(dados)]
    );
  } catch (err) {
    console.error('Erro salvarClientePorTelefone:', err.message);
  }
}

async function registrarLead(telefone, nome, especialidade) {
  try {
    const existe = await pool.query('SELECT id FROM leads WHERE telefone = $1', [telefone]);
    if (existe.rows.length === 0) {
      await pool.query(
        `INSERT INTO leads (telefone, nome, especialidade, status, ultima_mensagem_em)
         VALUES ($1, $2, $3, 'lead', NOW())`,
        [telefone, nome || 'Desconhecido', especialidade]
      );
    } else {
      await pool.query(
        `UPDATE leads SET especialidade = $2, atualizado_em = NOW(), ultima_mensagem_em = NOW()
         WHERE telefone = $1`,
        [telefone, especialidade]
      );
    }
    await registrarConversa(telefone);
  } catch (err) {
    console.error('Erro registrarLead:', err.message);
  }
}

async function registrarConversa(telefone) {
  try {
    const existe = await pool.query(
      `SELECT id FROM conversas WHERE telefone = $1 AND status = 'ativa'`, [telefone]
    );
    if (existe.rows.length === 0) {
      await pool.query(
        `INSERT INTO conversas (telefone, status) VALUES ($1, 'ativa')`, [telefone]
      );
    }
  } catch (err) {
    console.error('Erro registrarConversa:', err.message);
  }
}

async function marcarAgendou(telefone) {
  try {
    await pool.query(
      `UPDATE leads SET status = 'agendou', agendou_em = NOW(), atualizado_em = NOW()
       WHERE telefone = $1`,
      [telefone]
    );
    await pool.query(
      `UPDATE conversas SET agendou = TRUE, status = 'encerrada', encerrado_em = NOW(), atualizado_em = NOW()
       WHERE telefone = $1 AND status = 'ativa'`,
      [telefone]
    );
  } catch (err) {
    console.error('Erro marcarAgendou:', err.message);
  }
}

async function marcarTransferidoHumano(telefone) {
  try {
    await pool.query(
      `UPDATE conversas SET transferido_humano = TRUE, status = 'humano', atualizado_em = NOW()
       WHERE telefone = $1 AND status = 'ativa'`,
      [telefone]
    );
    await pool.query(
      `UPDATE leads SET status = 'humano', atualizado_em = NOW() WHERE telefone = $1`,
      [telefone]
    );
  } catch (err) {
    console.error('Erro marcarTransferidoHumano:', err.message);
  }
}

async function marcarEncerrado(telefone) {
  try {
    await pool.query(
      `UPDATE conversas SET status = 'encerrada', encerrado_em = NOW(), atualizado_em = NOW()
       WHERE telefone = $1 AND status = 'ativa'`,
      [telefone]
    );
  } catch (err) {
    console.error('Erro marcarEncerrado:', err.message);
  }
}

async function marcarNaoReativar(telefone) {
  try {
    await pool.query(
      `UPDATE leads SET status = 'nao_reativar', atualizado_em = NOW()
       WHERE telefone = $1`,
      [telefone]
    );
  } catch (err) {
    console.error('Erro marcarNaoReativar:', err.message);
  }
}

async function marcarRespondeuRemarketing(telefone) {
  try {
    await pool.query(
      `UPDATE leads SET status = 'respondeu', tentativas_reativacao = 0, ultima_mensagem_em = NOW(), atualizado_em = NOW()
       WHERE telefone = $1 AND status = 'remarketing'`,
      [telefone]
    );
    await pool.query(
      `UPDATE leads SET ultima_mensagem_em = NOW() WHERE telefone = $1`,
      [telefone]
    );
  } catch (err) {
    console.error('Erro marcarRespondeuRemarketing:', err.message);
  }
}

async function buscarLeadsParaReativar() {
  try {
    const resultado = [];

    const r1 = await pool.query(`
      SELECT telefone, nome, especialidade, tentativas_reativacao
      FROM leads
      WHERE status IN ('lead', 'respondeu')
      AND status NOT IN ('nao_reativar', 'humano', 'agendou')
      AND tentativas_reativacao = 0
      AND ultima_mensagem_em < NOW() - INTERVAL '2 hours'
      AND ultima_mensagem_em > NOW() - INTERVAL '3 hours'
    `);
    r1.rows.forEach(r => resultado.push({ ...r, tentativa: 1 }));

    const r2 = await pool.query(`
      SELECT telefone, nome, especialidade, tentativas_reativacao
      FROM leads
      WHERE status IN ('lead', 'respondeu')
      AND status NOT IN ('nao_reativar', 'humano', 'agendou')
      AND tentativas_reativacao = 1
      AND ultima_mensagem_em < NOW() - INTERVAL '24 hours'
      AND ultima_mensagem_em > NOW() - INTERVAL '25 hours'
    `);
    r2.rows.forEach(r => resultado.push({ ...r, tentativa: 2 }));

    const r3 = await pool.query(`
      SELECT telefone, nome, especialidade, tentativas_reativacao
      FROM leads
      WHERE status IN ('lead', 'respondeu')
      AND status NOT IN ('nao_reativar', 'humano', 'agendou')
      AND tentativas_reativacao = 2
      AND ultima_mensagem_em < NOW() - INTERVAL '48 hours'
      AND ultima_mensagem_em > NOW() - INTERVAL '49 hours'
    `);
    r3.rows.forEach(r => resultado.push({ ...r, tentativa: 3 }));

    return resultado;
  } catch (err) {
    console.error('Erro buscarLeadsParaReativar:', err.message);
    return [];
  }
}

async function incrementarTentativaReativacao(telefone) {
  try {
    await pool.query(
      `UPDATE leads SET tentativas_reativacao = tentativas_reativacao + 1, atualizado_em = NOW()
       WHERE telefone = $1`,
      [telefone]
    );
  } catch (err) {
    console.error('Erro incrementarTentativaReativacao:', err.message);
  }
}

async function buscarEstatisticas() {
  try {
    const total = await pool.query(`SELECT COUNT(*) FROM conversas WHERE criado_em > NOW() - INTERVAL '30 days'`);
    const ativas = await pool.query(`SELECT COUNT(*) FROM conversas WHERE status = 'ativa'`);
    const agendamentos = await pool.query(`SELECT COUNT(*) FROM conversas WHERE agendou = TRUE AND criado_em > NOW() - INTERVAL '30 days'`);
    const humanos = await pool.query(`SELECT COUNT(*) FROM conversas WHERE transferido_humano = TRUE AND criado_em > NOW() - INTERVAL '30 days'`);
    const leads = await pool.query(`SELECT COUNT(*) FROM leads WHERE status = 'lead' AND criado_em > NOW() - INTERVAL '30 days'`);
    const naoRespondidos = await pool.query(`
      SELECT COUNT(*) FROM leads
      WHERE status IN ('lead', 'respondeu')
      AND ultima_mensagem_em < NOW() - INTERVAL '2 hours'
    `);
    const porDia = await pool.query(`
      SELECT DATE(criado_em) as dia, COUNT(*) as total
      FROM conversas
      WHERE criado_em > NOW() - INTERVAL '7 days'
      GROUP BY DATE(criado_em)
      ORDER BY dia ASC
    `);
    const porEspecialidade = await pool.query(`
      SELECT especialidade, COUNT(*) as total
      FROM leads
      WHERE criado_em > NOW() - INTERVAL '30 days'
      GROUP BY especialidade
      ORDER BY total DESC
    `);
const leadsNaoConvertidos = await pool.query(`
      SELECT DISTINCT ON (telefone) telefone, nome, especialidade, ultima_mensagem_em, tentativas_reativacao
      FROM leads
      WHERE status IN ('lead', 'respondeu')
      AND ultima_mensagem_em < NOW() - INTERVAL '1 hour'
      ORDER BY telefone, ultima_mensagem_em DESC
      LIMIT 20
    `);

    return {
      total: parseInt(total.rows[0].count),
      ativas: parseInt(ativas.rows[0].count),
      agendamentos: parseInt(agendamentos.rows[0].count),
      humanos: parseInt(humanos.rows[0].count),
      leads: parseInt(leads.rows[0].count),
      naoRespondidos: parseInt(naoRespondidos.rows[0].count),
      porDia: porDia.rows,
      porEspecialidade: porEspecialidade.rows,
      leadsNaoConvertidos: leadsNaoConvertidos.rows,
    };
  } catch (err) {
    console.error('Erro buscarEstatisticas:', err.message);
    return null;
  }
}

module.exports = {
  buscarClientePorTelefone,
  salvarClientePorTelefone,
  registrarLead,
  marcarAgendou,
  marcarTransferidoHumano,
  marcarEncerrado,
  marcarNaoReativar,
  marcarRespondeuRemarketing,
  buscarLeadsParaReativar,
  incrementarTentativaReativacao,
  buscarEstatisticas,
};
