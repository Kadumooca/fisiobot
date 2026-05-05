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

async function listarAgendas() {
  try {
    const { data } = await api.post('/agenda/listar', {});
    return data.Dado;
  } catch (err) { console.error('Erro listarAgendas:', err.message); return null; }
}

async function buscarHorariosDisponiveis(agendaId, procedimentoId, dataStr) {
  try {
    const { data } = await api.post('/agenda/buscar-horarios-disponiveis', {
      IdAgenda: agendaId, IdProcedimento: procedimentoId, Data: dataStr
    });
    return data.Dado;
  } catch (err) { console.error('Erro buscarHorarios:', err.message); return null; }
}

async function incluirAgendamento(payload) {
  try {
    console.log('Payload agendamento:', JSON.stringify(payload));
    const { data } = await api.post('/agendamento/incluir', payload);
    console.log('Resposta agendamento:', JSON.stringify(data));
    if (data.Dado === 0 && data.Mensagem) {
      return { erro: data.Mensagem };
    }
    return data;
  } catch (err) {
    console.error('Erro incluirAgendamento:', err.message);
    if (err.response) console.error('Resposta erro:', JSON.stringify(err.response.data));
    return null;
  }
}

async function desmarcarAgendamento(agendamentoId) {
  try {
    console.log('Desmarcando agendamento:', agendamentoId);
    const { data } = await api.post('/agendamento/desmarcar', { IdAgendamento: agendamentoId });
    console.log('Resposta desmarcar:', JSON.stringify(data));
    return data;
  } catch (err) {
    console.error('Erro desmarcarAgendamento:', err.message);
    if (err.response) console.error('Resposta erro desmarcar:', JSON.stringify(err.response.data));
    return null;
  }
}

async function listarAgendamentosCliente(clienteId) {
  try {
    const { data } = await api.post('/agendamento/listar-agendamentos-cliente', { IdCliente: clienteId });
    return data.Dado;
  } catch (err) {
    console.error('Erro listarAgendamentosCliente:', err.message);
    return null;
  }
}

module.exports = {
  buscarClientePorCPF, incluirCliente, listarAgendas,
  buscarHorariosDisponiveis, incluirAgendamento,
  desmarcarAgendamento, listarAgendamentosCliente,
};
