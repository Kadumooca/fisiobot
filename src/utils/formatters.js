function limparCPF(cpf) {
  return cpf.replace(/\D/g, '');
}

function validarCPF(cpf) {
  const limpo = limparCPF(cpf);
  return limpo.length === 11;
}

function formatarCPF(cpf) {
  const limpo = limparCPF(cpf);
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function validarData(data) {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(data)) return false;
  const [dia, mes, ano] = data.split('/').map(Number);
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
}

function dataParaAPI(data) {
  const [dia, mes, ano] = data.split('/');
  return `${ano}-${mes}-${dia}`;
}

function dataParaExibicao(data) {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

module.exports = {
  limparCPF,
  validarCPF,
  formatarCPF,
  validarData,
  dataParaAPI,
  dataParaExibicao,
};
