const { enviarMensagem } = require('../services/whatsapp');
const { buscarEstatisticas } = require('../utils/clienteCache');

const NUMERO_RECEPCAO = '5511982925092';

async function enviarResumoDiario() {
  try {
    const stats = await buscarEstatisticas();
    if (!stats) return;

    const hoje = new Date().toLocaleDateString('pt-BR');
    const taxa = stats.total > 0 ? Math.round((stats.agendamentos / stats.total) * 100) : 0;

    const espTop = stats.porEspecialidade.slice(0, 3)
      .map((e, i) => `${i+1}. ${e.especialidade || 'Outros'}: ${e.total} leads`)
      .join('\n');

    const msg =
      `📊 *Relatório FisioBot — ${hoje}*\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📱 Conversas (30 dias): *${stats.total}*\n` +
      `✅ Agendamentos: *${stats.agendamentos}*\n` +
      `📈 Taxa de conversão: *${taxa}%*\n` +
      `🔴 Não respondidos: *${stats.naoRespondidos}*\n` +
      `👤 Recepção humana: *${stats.humanos}*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🏥 *Top especialidades:*\n${espTop || 'Sem dados'}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `_Acesse o dashboard para mais detalhes._`;

    await enviarMensagem(NUMERO_RECEPCAO, msg);
    console.log('Resumo diário enviado!');
  } catch (err) {
    console.error('Erro resumo diário:', err.message);
  }
}

module.exports = { enviarResumoDiario };
