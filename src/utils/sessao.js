const sessoes = new Map();

function getSessao(telefone) {
  if (!sessoes.has(telefone)) {
    sessoes.set(telefone, { etapa: 'encerrado' });
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
