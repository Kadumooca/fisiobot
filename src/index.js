require('dotenv').config();
const express = require('express');
const { processarMensagem } = require('./handlers/conversa');
const { executarRemarketing } = require('./jobs/remarketing');
const { enviarMensagem } = require('./services/whatsapp');
const { getSessao, setSessao } = require('./utils/sessao');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const MSG_APENAS_TEXTO = `😊 Olá! Sou um assistente virtual e trabalho apenas com mensagens de texto. Áudios, fotos e vídeos não consigo processar ainda. Escreva o que precisa e terei prazer em te ajudar!`;

const timeouts = new Map();

function limparTimeouts(telefone) {
  if (timeouts.has(telefone)) {
    const { t1, t2 } = timeouts.get(telefone);
    if (t1) clearTimeout(t1);
    if (t2) clearTimeout(t2);
    timeouts.delete(telefone);
  }
}

function agendarTimeoutsOferta(telefone) {
  limparTimeouts(telefone);
  const sessao = getSessao(telefone);
  if (sessao.etapa !== 'aguardando_resposta_agendamento') return;

  // 5 min — 1ª tentativa
  const t1 = setTimeout(async () => {
    const s = getSessao(telefone);
    if (s.etapa === 'encerrado' || s.etapa === 'menu') return;
    await enviarMensagem(telefone,
      `Oi! 😊 Ainda está pensando se gostaria de agendar?\n\nEstou aqui para te ajudar a dar esse primeiro passo no seu tratamento!`
    );
  }, 5 * 60 * 1000);

  // 15 min — 2ª tentativa e encerra
  const t2 = setTimeout(async () => {
    const s = getSessao(telefone);
    if (s.etapa === 'encerrado' || s.etapa === 'menu') return;
    await enviarMensagem(telefone,
      `Tudo bem! 😊 Vou encerrar nosso atendimento por agora.\n\nQuando quiser retomar, é só nos enviar um *Olá* e terei prazer em te atender!`
    );
    setSessao(telefone, { etapa: 'encerrado' });
    limparTimeouts(telefone);
  }, 15 * 60 * 1000);

  timeouts.set(telefone, { t1, t2 });
}

function detectarMidiaOuPerguntaSobreAudio(body, mensagem) {
  const msg = body.data?.message;
  if (
    msg?.audioMessage ||
    msg?.videoMessage ||
    msg?.imageMessage ||
    msg?.documentMessage ||
    msg?.stickerMessage ||
    msg?.voiceMessage ||
    msg?.pttMessage
  ) return true;

  if (mensagem) {
    const textoLower = mensagem.toLowerCase();
    const palavrasAudio = [
      'posso mandar audio', 'posso enviar audio', 'aceita audio',
      'posso mandar áudio', 'posso enviar áudio', 'aceita áudio',
      'posso mandar voz', 'posso enviar voz', 'aceita voz',
      'posso mandar foto', 'posso enviar foto', 'aceita foto',
      'posso mandar video', 'posso enviar video', 'aceita video',
      'posso mandar vídeo', 'posso enviar vídeo', 'aceita vídeo',
      'posso gravar', 'mensagem de voz', 'por voz', 'gravação de voz',
      'aceita imagem', 'posso mandar imagem', 'posso enviar imagem',
      'manda foto', 'manda audio', 'manda áudio', 'manda vídeo', 'manda video'
    ];
    if (palavrasAudio.some(p => textoLower.includes(p))) return true;
  }
  return false;
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.data?.key?.fromMe) return res.sendStatus(200);

    const telefone = body.data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    if (!telefone) return res.sendStatus(200);

    const mensagem = body.data?.message?.conversation ||
                     body.data?.message?.extendedTextMessage?.text;

    if (detectarMidiaOuPerguntaSobreAudio(body, mensagem)) {
      await enviarMensagem(telefone, MSG_APENAS_TEXTO);
      return res.sendStatus(200);
    }

    if (!mensagem) return res.sendStatus(200);

    console.log(`Mensagem de ${telefone}: ${mensagem}`);

    limparTimeouts(telefone);
    await processarMensagem(telefone, mensagem);

    const sessaoAtual = getSessao(telefone);
    if (sessaoAtual.etapa === 'aguardando_resposta_agendamento') {
      agendarTimeoutsOferta(telefone);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('Erro no webhook:', err);
    return res.sendStatus(500);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

setInterval(async () => {
  try {
    await executarRemarketing();
  } catch (err) {
    console.error('Erro no job de remarketing:', err);
  }
}, 30 * 60 * 1000);

executarRemarketing().catch(console.error);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FisioBot rodando na porta ${PORT}`);
});
