function validarCPF(cpf) {
  const c = cpf.replace(/\D/g, '');
  if (c.length !== 11) return false;
  // Sequências com todos os dígitos iguais (ex: 00000000000, 11111111111)
  // passam na fórmula abaixo mas nunca são CPFs reais válidos.
  if (/^(\d)\1{10}$/.test(c)) return false;

  const digitos = c.split('').map(Number);
  const calcularDigito = (fatorInicial) => {
    let soma = 0;
    for (let i = 0; i < fatorInicial - 1; i++) {
      soma += digitos[i] * (fatorInicial - i);
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const digito1 = calcularDigito(10);
  if (digito1 !== digitos[9]) return false;
  const digito2 = calcularDigito(11);
  if (digito2 !== digitos[10]) return false;

  return true;
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
