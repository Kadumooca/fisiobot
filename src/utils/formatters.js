function validarCPF(cpf) {
  return cpf.replace(/\D/g, '').length === 11;
}

function limparCPF(cpf) {
  return cpf.replace(/\D/g, '');
}

function formatarCPF(cpf) {
  const c = cpf.replace(/\D/g, '');
  return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function validarData(data) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(data);
}

module.exports = { validarCPF, limparCPF, formatarCPF, validarData };
