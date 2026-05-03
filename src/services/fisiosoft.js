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

async function incluirCliente(payload) {
  try {
    const { data } = await api.post('/cliente/incluir', payload);
    return data.Dado;
  } catch (err) { console.error('Erro incluirCliente:', err.message); return null; }
}

// Retorna todas as agendas
async function listarAgendas() {
  try {
    const { data } = await api.post('/agenda/listar', {});
    return data.Dado;
  } catch (err) { console.error('Erro listarAgendas:', err.message); return null; }
}

// Filtra agendas pela especialidade escolhida
async function listarAgendasPorEspecialidade(especialidade) {
  try {
    const { data } = await api.post('/agenda/listar', {});
    const agendas = data.Dado || [];
    return agendas.filter(a => 
      a.Nome.toUpperCase().includes(especialidade.toUpperCase())
    );
  } catch (err) { console.error('Erro listarAgendasPorEspecialidade:', err.message); return null; }
}

async function buscarHorariosDisponiveis(agendaId, procedimentoId, dataStr) {
  try {
    const { data } = await api.post('/agenda/buscar-horarios-disponiveis', { 
      IdAgenda: agendaId,
      IdProcedimento: procedimentoId,
      Data: dataStr 
    });
    return data.Dado;
  } catch (err) { console.error('Erro buscarHorarios:', err.message); return null; }
}
async function listarProcedimentos() {
  try {
    const { data } = await api.post('/procedimento/listar', {});
    return data.Dado;
  } catch (err) { console.error('Erro listarProcedimentos:', err.message); return null; }
}

async function incluirAgendamento(payload) {
  try {
    console.log('Payload agendamento:', JSON.stringify(payload));
    const { data } = await api.post('/agendamento/incluir', payload);
    console.log('Resposta agendamento:', JSON.stringify(data));
    return data;
  } catch (err) { 
    console.error('Erro incluirAgendamento:', err.message);
    if (err.response) {
      console.error('Resposta erro:', JSON.stringify(err.response.data));
    }
    return null; 
  }
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
  incluirCliente,
  listarAgendas,
  listarAgendasPorEspecialidade,
  buscarHorariosDisponiveis,
  listarProcedimentos,
  incluirAgendamento,
  desmarcarAgendamento,
  listarAgendamentosCliente,
};
