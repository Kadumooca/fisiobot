const axios = require('axios');

const api = axios.create({
  baseURL: 'https://app.fisioterapiasoft.com.br/api/v1',
  headers: {
    Authorization: `Bearer ${process.env.FISIOSOFT_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function buscarClientePorCPF(cpf) {
  try {
    const { data } = await api.post('/cliente/buscar-por-cpf', { Cpf: cpf });
    return data.Dado;
  } catch (err) { console.error('Erro buscarClientePorCPF:', err.message); return null; }
}

async function listarAgendas() {
  try {
    const { data } = await api.post('/agenda/listar', {});
    return data.Dado;
  } catch (err) { console.error('Erro listarAgendas:', err.message); return null; }
}

async function buscarHorariosDisponiveis(agendaId, dataStr) {
  try {
    const { data } = await api.post('/agenda/buscar-horarios-disponiveis', { AgendaId: agendaId, Data: dataStr });
    return data.Dado;
  } catch (err) { console.error('Erro buscarHorarios:', err.message); return null; }
}

async function listarProcedimentos() {
  try {
    const { data } = await api.post('/procedimento/listar', {});
    return data.Dado;
  } catch (err) { console.error('Erro listarProcedimentos:', err.message); return null; }
}

async function listarProfissionais() {
  try {
    const { data } = await api.post('/profissional/listar', {});
    return data.Dado;
  } catch (err) { console.error('Erro listarProfissionais:', err.message); return null; }
}

async function incluirAgendamento(payload) {
  try {
    const { data } = await api.post('/agendamento/incluir', payload);
    return data;
  } catch (err) { console.error('Erro incluirAgendamento:', err.message); return null; }
}

async function desmarcarAgendamento(agendamentoId) {
  try {
    const { data } = await api.post('/agendamento/desmarcar', { AgendamentoId: agendamentoId });
    return data;
  } catch (err) { console.error('Erro desmarcarAgendamento:', err.message); return null; }
}

async function listarAgendamentosCliente(clienteId) {
  try {
    const { data } = await api.post('/agendamento/listar-agendamentos-cliente', { ClienteId: clienteId });
    return data.Dado;
  } catch (err) { console.error('Erro listarAgendamentosCliente:', err.message); return null; }
}

module.exports = {
  buscarClientePorCPF,
  listarAgendas,
  buscarHorariosDisponiveis,
  listarProcedimentos,
  listarProfissionais,
  incluirAgendamento,
  desmarcarAgendamento,
  listarAgendamentosCliente,
};
