const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../../data/clientes.json');

// Garante que o diretório existe
function garantirDiretorio() {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function carregarCache() {
  try {
    garantirDiretorio();
    if (!fs.existsSync(CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch { return {}; }
}

function salvarCache(cache) {
  try {
    garantirDiretorio();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) { console.error('Erro ao salvar cache:', err.message); }
}

function buscarClientePorTelefone(telefone) {
  const cache = carregarCache();
  return cache[telefone] || null;
}

function salvarClientePorTelefone(telefone, cliente) {
  const cache = carregarCache();
  cache[telefone] = cliente;
  salvarCache(cache);
}

module.exports = { buscarClientePorTelefone, salvarClientePorTelefone };
