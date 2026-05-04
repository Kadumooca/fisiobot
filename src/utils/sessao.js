// Armazena o estado da conversa de cada usuário em memória
// Exemplo de sessão:
// {
//   etapa: 'menu' | 'encerrado' | 'aguardando_cpf' | 'aguardando_nome' | 'aguardando_data' | 'aguardando_horario' | 'aguardando_confirmacao_cancel',
//   paciente: { id, nome, cpf },
//   agendamentoTemp: { data, horario, horarioId },
//   agendamentoParaCancelar: { id, descricao }
// }
// Obs: etapa 'encerrado' bloqueia o bot até o cliente enviar uma saudação.

const sessoes = new Map();

function getSessao(telefone) {
  if (!sessoes.has(telefone)) {
    sessoes.set(telefone, { etapa: 'menu' });
  }
  return sessoes.get(telefone);
}

function setSessao(telefone, dados) {
  const atual = getSessao(telefone);
  sessoes.set(telefone, { ...atual, ...dados });
}

function resetarSessao(telefone) {
  sessoes.set(telefone, { etapa: 'menu' });
}

module.exports = { getSessao, setSessao, resetarSessao };
