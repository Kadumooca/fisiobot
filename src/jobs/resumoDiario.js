const nodemailer = require('nodemailer');
const { buscarEstatisticas } = require('../utils/clienteCache');

const EMAIL_DESTINO = 'eduardo@clinicalituania.com.br';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

async function enviarResumoDiario() {
  try {
    const stats = await buscarEstatisticas();
    if (!stats) return;

    const hoje = new Date().toLocaleDateString('pt-BR');
    const taxa = stats.total > 0 ? Math.round((stats.agendamentos / stats.total) * 100) : 0;

    const espTop = stats.porEspecialidade.slice(0, 3)
      .map((e, i) => `<tr><td>${i+1}. ${e.especialidade || 'Outros'}</td><td><b>${e.total} leads</b></td></tr>`)
      .join('');

    const leadsHTML = stats.leadsNaoConvertidos.slice(0, 10).map(l => {
      const tempo = Math.round((Date.now() - new Date(l.ultima_mensagem_em)) / 1000 / 60);
      const tempoStr = tempo < 60 ? `${tempo} min` : `${Math.round(tempo/60)}h`;
      return `<tr>
        <td>${l.nome || 'Desconhecido'}</td>
        <td>${l.telefone}</td>
        <td>${l.especialidade || '-'}</td>
        <td>${tempoStr} atrás</td>
        <td>${l.tentativas_reativacao}x</td>
      </tr>`;
    }).join('');

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    .header { background: #075e54; color: white; padding: 24px 30px; }
    .header h1 { font-size: 20px; margin: 0; }
    .header p { margin: 4px 0 0; opacity: 0.8; font-size: 13px; }
    .body { padding: 24px 30px; }
    .cards { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; }
    .card { border-radius: 10px; padding: 16px; text-align: center; }
    .card .num { font-size: 32px; font-weight: 700; }
    .card .lbl { font-size: 12px; margin-top: 4px; }
    .card.verde { background: #e8f8f1; } .card.verde .num { color: #25d366; }
    .card.azul { background: #e8f4f8; } .card.azul .num { color: #075e54; }
    .card.laranja { background: #fef9e7; } .card.laranja .num { color: #f39c12; }
    .card.vermelho { background: #fdedec; } .card.vermelho .num { color: #e74c3c; }
    .card.roxo { background: #f5eef8; } .card.roxo .num { color: #9b59b6; }
    .card.cinza { background: #f2f3f4; } .card.cinza .num { color: #7f8c8d; }
    h3 { color: #555; font-size: 14px; margin: 20px 0 10px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f8f9fa; padding: 8px 12px; text-align: left; color: #555; }
    td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
    .footer { background: #f8f9fa; padding: 16px 30px; text-align: center; font-size: 12px; color: #999; }
    .btn { display: inline-block; margin-top: 12px; padding: 10px 24px; background: #075e54; color: white; border-radius: 8px; text-decoration: none; font-size: 13px; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🏥 Clínica Lituânia — Relatório FisioBot</h1>
    <p>${hoje} — Resumo diário automático</p>
  </div>
  <div class="body">
    <div class="cards">
      <div class="card azul">
        <div class="num">${stats.total}</div>
        <div class="lbl">Conversas (30 dias)</div>
      </div>
      <div class="card verde">
        <div class="num">${stats.agendamentos}</div>
        <div class="lbl">Agendamentos</div>
      </div>
      <div class="card laranja">
        <div class="num">${taxa}%</div>
        <div class="lbl">Conversão</div>
      </div>
      <div class="card vermelho">
        <div class="num">${stats.naoRespondidos}</div>
        <div class="lbl">Não respondidos</div>
      </div>
      <div class="card roxo">
        <div class="num">${stats.humanos}</div>
        <div class="lbl">Recepção humana</div>
      </div>
      <div class="card cinza">
        <div class="num">${stats.ativas}</div>
        <div class="lbl">Conversas ativas</div>
      </div>
    </div>

    <h3>🏥 Top especialidades</h3>
    <table>
      <thead><tr><th>Especialidade</th><th>Leads</th></tr></thead>
      <tbody>${espTop || '<tr><td colspan="2">Sem dados</td></tr>'}</tbody>
    </table>

    <h3>⚠️ Leads não convertidos</h3>
    <table>
      <thead>
        <tr><th>Nome</th><th>Telefone</th><th>Especialidade</th><th>Último contato</th><th>Tentativas</th></tr>
      </thead>
      <tbody>${leadsHTML || '<tr><td colspan="5" style="text-align:center;color:#999">Nenhum lead pendente 🎉</td></tr>'}</tbody>
    </table>

    <div style="text-align:center;margin-top:20px">
      <a href="https://fisiobot-production.up.railway.app/dashboard" class="btn">🖥️ Ver dashboard completo</a>
    </div>
  </div>
  <div class="footer">
    Relatório gerado automaticamente pelo FisioBot • Clínica Lituânia
  </div>
</div>
</body>
</html>`;

    await transporter.sendMail({
      from: `"FisioBot — Clínica Lituânia" <${process.env.GMAIL_USER}>`,
      to: EMAIL_DESTINO,
      subject: `📊 Relatório FisioBot — ${hoje}`,
      html,
    });

    console.log('Resumo diário enviado por email!');
  } catch (err) {
    console.error('Erro resumo diário:', err.message);
  }
}

module.exports = { enviarResumoDiario };
