const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { JogoSueca } = require('./src/sueca');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Estado global
const salas = {}; // id -> JogoSueca
const socketSala = {}; // socketId -> salaId

// ==========================================
//  Helpers
// ==========================================
function emitirEstadoSala(salaId) {
  const jogo = salas[salaId];
  if (!jogo) return;
  jogo.jogadores.forEach(j => {
    const socket = io.sockets.sockets.get(j.socketId);
    if (socket) {
      socket.emit('estado_atualizado', jogo.getEstadoPublico(j.socketId));
    }
  });
}

function emitirSalas() {
  const lista = Object.values(salas).map(j => ({
    id: j.id,
    jogadores: j.jogadores.length,
    estado: j.estado,
    nomes: j.jogadores.map(p => p.nome)
  }));
  io.emit('lista_salas', lista);
}

// ==========================================
//  API REST
// ==========================================
app.get('/api/salas', (req, res) => {
  const lista = Object.values(salas).map(j => ({
    id: j.id,
    jogadores: j.jogadores.length,
    estado: j.estado,
    nomes: j.jogadores.map(p => p.nome)
  }));
  res.json(lista);
});

// ==========================================
//  Socket.io
// ==========================================
io.on('connection', (socket) => {
  console.log(`[+] Ligado: ${socket.id}`);

  // Enviar lista de salas ao ligar
  socket.emit('lista_salas', Object.values(salas).map(j => ({
    id: j.id,
    jogadores: j.jogadores.length,
    estado: j.estado,
    nomes: j.jogadores.map(p => p.nome)
  })));

  // Criar sala
  socket.on('criar_sala', ({ nome }) => {
    if (!nome || nome.trim().length < 1) {
      socket.emit('erro', 'Nome inválido');
      return;
    }
    const salaId = uuidv4().slice(0, 6).toUpperCase();
    const jogo = new JogoSueca(salaId);
    salas[salaId] = jogo;

    const resultado = jogo.adicionarJogador(socket.id, nome.trim());
    if (resultado.erro) {
      socket.emit('erro', resultado.erro);
      return;
    }

    socketSala[socket.id] = salaId;
    socket.join(salaId);
    socket.emit('entrou_sala', { salaId, idx: resultado.idx });
    emitirEstadoSala(salaId);
    emitirSalas();
    console.log(`[Sala] ${salaId} criada por ${nome}`);
  });

  // Entrar numa sala
  socket.on('entrar_sala', ({ salaId, nome }) => {
    if (!nome || nome.trim().length < 1) {
      socket.emit('erro', 'Nome inválido');
      return;
    }
    const jogo = salas[salaId];
    if (!jogo) {
      socket.emit('erro', 'Sala não encontrada');
      return;
    }

    const resultado = jogo.adicionarJogador(socket.id, nome.trim());
    if (resultado.erro) {
      socket.emit('erro', resultado.erro);
      return;
    }

    socketSala[socket.id] = salaId;
    socket.join(salaId);
    socket.emit('entrou_sala', { salaId, idx: resultado.idx });

    // Notificar todos na sala
    io.to(salaId).emit('jogador_entrou', { nome: nome.trim(), total: jogo.jogadores.length });

    emitirEstadoSala(salaId);
    emitirSalas();
    console.log(`[Sala] ${nome} entrou em ${salaId}`);

    // Auto-iniciar se 4 jogadores
    if (jogo.jogadores.length === 4) {
      setTimeout(() => iniciarJogo(salaId), 1500);
    }
  });

  // Iniciar jogo manualmente
  socket.on('iniciar_jogo', () => {
    const salaId = socketSala[socket.id];
    if (!salaId) return;
    iniciarJogo(salaId);
  });

  function iniciarJogo(salaId) {
    const jogo = salas[salaId];
    if (!jogo) return;

    const resultado = jogo.iniciar();
    if (resultado.erro) {
      io.to(salaId).emit('erro', resultado.erro);
      return;
    }

    io.to(salaId).emit('jogo_iniciado', { trunfo: jogo.trunfo });
    emitirEstadoSala(salaId);
    console.log(`[Jogo] ${salaId} iniciado, trunfo: ${jogo.trunfo}`);
  }

  // Jogar carta
  socket.on('jogar_carta', ({ cartaId }) => {
    const salaId = socketSala[socket.id];
    if (!salaId) return;
    const jogo = salas[salaId];
    if (!jogo) return;

    const resultado = jogo.jogarCarta(socket.id, cartaId);
    if (resultado.erro) {
      socket.emit('erro', resultado.erro);
      return;
    }

    if (resultado.vezaCompleta) {
      // Emitir resultado da veza
      io.to(salaId).emit('veza_completa', {
        vezaInfo: resultado.vezaInfo,
        vezaCartas: resultado.vezaCartas,
        proximoJogador: resultado.proximoJogador
      });

      if (resultado.fimRodada) {
        io.to(salaId).emit('fim_rodada', {
          pontosRodada: resultado.pontosRodada,
          placar: resultado.placar,
          vezasGanhas: resultado.vezasGanhas,
          equipas: [
            jogo.jogadores.filter(j => j.equipa === 0).map(j => j.nome),
            jogo.jogadores.filter(j => j.equipa === 1).map(j => j.nome)
          ]
        });

        setTimeout(() => emitirEstadoSala(salaId), 300);
        return;
      }
    }

    // Atualizar estado para todos
    setTimeout(() => emitirEstadoSala(salaId), resultado.vezaCompleta ? 2000 : 0);
  });

  // Nova rodada
  socket.on('nova_rodada', () => {
    const salaId = socketSala[socket.id];
    if (!salaId) return;
    const jogo = salas[salaId];
    if (!jogo || jogo.estado !== 'aguardando') return;

    // Só o 1º jogador pode iniciar nova rodada
    if (jogo.jogadores[0]?.socketId === socket.id) {
      iniciarJogo(salaId);
    }
  });

  // Chat
  socket.on('chat', ({ msg }) => {
    const salaId = socketSala[socket.id];
    if (!salaId) return;
    const jogo = salas[salaId];
    if (!jogo) return;
    const jogador = jogo.jogadores.find(j => j.socketId === socket.id);
    if (!jogador) return;
    if (msg && msg.trim().length > 0 && msg.length < 200) {
      io.to(salaId).emit('chat_msg', { nome: jogador.nome, msg: msg.trim(), equipa: jogador.equipa });
    }
  });

  // Desligar
  socket.on('disconnect', () => {
    console.log(`[-] Desligado: ${socket.id}`);
    const salaId = socketSala[socket.id];
    if (salaId) {
      const jogo = salas[salaId];
      if (jogo) {
        const jogador = jogo.jogadores.find(j => j.socketId === socket.id);
        if (jogador) {
          io.to(salaId).emit('jogador_saiu', { nome: jogador.nome });
        }
        jogo.removerJogador(socket.id);
        if (jogo.jogadores.length === 0) {
          delete salas[salaId];
          console.log(`[Sala] ${salaId} removida (vazia)`);
        } else {
          // Se estava a jogar, parar o jogo
          if (jogo.estado === 'jogando') {
            jogo.estado = 'aguardando';
            io.to(salaId).emit('jogo_interrompido', 'Um jogador saiu. Aguardando novo jogador...');
          }
          emitirEstadoSala(salaId);
        }
      }
      delete socketSala[socket.id];
      emitirSalas();
    }
  });
});

// ==========================================
//  Start
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🃏 Sueca Online a correr em http://localhost:${PORT}`);
});
