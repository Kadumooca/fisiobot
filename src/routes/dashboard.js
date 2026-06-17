const express = require('express');
const router = express.Router();
const { buscarEstatisticas } = require('../utils/clienteCache');

const USUARIO = process.env.DASHBOARD_USER;
const SENHA = process.env.DASHBOARD_PASS;

function autenticar(req, res, next) {
  if (!USUARIO || !SENHA) {
    console.error('Dashboard: DASHBOARD_USER ou DASHBOARD_PASS não configurados.');
    return res.status(500).send('Dashboard não configurado.');
  }
  const auth = req.headers.authorization;
  if (!auth) {
    res.set('WWW-Authenticate', 'Basic realm="FisioBot Dashboard"');
    return res.status(401).send('Autenticação necessária');
  }
  const [tipo, token] = auth.split(' ');
  const [user, pass] = Buffer.from(token, 'base64').toString().split(':');
  if (user === USUARIO && pass === SENHA) return next();
  res.set('WWW-Authenticate', 'Basic realm="FisioBot Dashboard"');
  return res.status(401).send('Credenciais inválidas');
}

router.get('/', autenticar, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const stats = await buscarEstatisticas();
  if (!stats) return res.status(500).send('Erro ao buscar dados');

  const porDiaLabels = stats.porDia.map(d => d.dia.toISOString().split('T')[0]);
  const porDiaData = stats.porDia.map(d => parseInt(d.total));
  const espLabels = stats.porEspecialidade.map(e => e.especialidade || 'Outros');
  const espData = stats.porEspecialidade.map(e => parseInt(e.total));

  const leadsHTML = stats.leadsNaoConvertidos.map(l => {
    const tempo = Math.round((Date.now() - new Date(l.ultima_mensagem_em)) / 1000 / 60);
    const tempoStr = tempo < 60 ? `${tempo} min` : `${Math.round(tempo/60)}h`;
    return `
      <tr>
        <td>${l.nome || 'Desconhecido'}</td>
        <td>${l.telefone}</td>
        <td>${l.especialidade || '-'}</td>
        <td>${tempoStr} atrás</td>
        <td>${l.tentativas_reativacao}x</td>
      </tr>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="300">
  <title>FisioBot Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; color: #333; }
    header { background: #075e54; color: white; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center; }
    header h1 { font-size: 22px; }
    header span { font-size: 13px; opacity: 0.8; }
    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 30px; }
    .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; }
    .card .numero { font-size: 42px; font-weight: 700; margin: 8px 0; }
    .card .label { font-size: 13px; color: #666; }
    .card.verde .numero { color: #25d366; }
    .card.azul .numero { color: #075e54; }
    .card.laranja .numero { color: #f39c12; }
    .card.vermelho .numero { color: #e74c3c; }
    .card.roxo .numero { color: #9b59b6; }
    .card.cinza .numero { color: #7f8c8d; }
    .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .chart-box { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .chart-box h3 { font-size: 15px; color: #555; margin-bottom: 16px; }
    .tabela-box { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 30px; }
    .tabela-box h3 { font-size: 15px; color: #555; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #f8f9fa; padding: 10px 14px; text-align: left; color: #555; font-weight: 600; }
    td { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; }
    tr:last-child td { border-bottom: none; }
    .atualizado { text-align: center; font-size: 12px; color: #999; margin-top: 10px; padding-bottom: 30px; }
    @media(max-width: 768px) { .charts { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<header>
  <h1>🏥 Clínica Lituânia — FisioBot</h1>
  <span>Atualiza automaticamente a cada 5 min</span>
</header>
<div class="container">
  <div class="cards">
    <div class="card azul">
      <div class="label">Conversas (30 dias)</div>
      <div class="numero">${stats.total}</div>
    </div>
    <div class="card verde">
      <div class="label">Agendamentos</div>
      <div class="numero">${stats.agendamentos}</div>
    </div>
    <div class="card laranja">
      <div class="label">Leads ativos</div>
      <div class="numero">${stats.leads}</div>
    </div>
    <div class="card vermelho">
      <div class="label">Não respondidos</div>
      <div class="numero">${stats.naoRespondidos}</div>
    </div>
    <div class="card roxo">
      <div class="label">Recepção humana</div>
      <div class="numero">${stats.humanos}</div>
    </div>
    <div class="card cinza">
      <div class="label">Conversas ativas</div>
      <div class="numero">${stats.ativas}</div>
    </div>
  </div>

  <div class="charts">
    <div class="chart-box">
      <h3>📈 Conversas por dia (últimos 7 dias)</h3>
      <canvas id="chartDia"></canvas>
    </div>
    <div class="chart-box">
      <h3>🏥 Leads por especialidade</h3>
      <canvas id="chartEsp"></canvas>
    </div>
  </div>

  <div class="tabela-box">
    <h3>⚠️ Leads não convertidos (último contato há mais de 1h)</h3>
    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Telefone</th>
          <th>Especialidade</th>
          <th>Último contato</th>
          <th>Tentativas</th>
        </tr>
      </thead>
      <tbody>${leadsHTML || '<tr><td colspan="5" style="text-align:center;color:#999">Nenhum lead pendente 🎉</td></tr>'}</tbody>
    </table>
  </div>

  <div class="atualizado">Última atualização: ${new Date().toLocaleString('pt-BR')} — Página atualiza a cada 5 minutos</div>
</div>

<script>
new Chart(document.getElementById('chartDia'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(porDiaLabels)},
    datasets: [{
      label: 'Conversas',
      data: ${JSON.stringify(porDiaData)},
      borderColor: '#075e54',
      backgroundColor: 'rgba(7,94,84,0.1)',
      tension: 0.4,
      fill: true,
    }]
  },
  options: { responsive: true, plugins: { legend: { display: false } } }
});

new Chart(document.getElementById('chartEsp'), {
  type: 'doughnut',
  data: {
    labels: ${JSON.stringify(espLabels)},
    datasets: [{
      data: ${JSON.stringify(espData)},
      backgroundColor: ['#075e54','#25d366','#f39c12','#e74c3c','#9b59b6','#3498db','#1abc9c'],
    }]
  },
  options: { responsive: true }
});
</script>
</body>
</html>`);
});

module.exports = router;
