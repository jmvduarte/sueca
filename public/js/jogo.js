// ============================================
//  SUECA ONLINE - Cliente
// ============================================

const socket = io();

// Estado local
let estadoAtual = null;
let salaId = null;
let meuIdx = -1;
let meuNome = '';
let cartaSelecionada = null;
let emJogo = false;

// Símbolos dos naipes
const NAIPE_SIMBOLO = { ouros: '♦', copas: '♥', paus: '♣', espadas: '♠' };
const NAIPE_COR = { ouros: 'vermelho', copas: 'vermelho', paus: 'preto', espadas: 'preto' };

// ============================================
//  DOM refs
// ============================================
const ecraLobby = document.getElementById('ecra-lobby');
const ecraJogo = document.getElementById('ecra-jogo');
const formNome = document.getElementById('form-nome');
const painelSalas = document.getElementById('painel-salas');
const inputNome = document.getElementById('input-nome');
const inputCodigo = document.getElementById('input-codigo');
const listaJogadoresEl = document.getElementById('lista-jogadores-sala');
const codigoGrandeEl = document.getElementById('codigo-sala-grande');
const cartasMesa = document.getElementById('cartas-mesa');
const msgVeza = document.getElementById('msg-veza');
const msgTurno = document.getElementById('msg-turno');
const minhaMao = document.getElementById('minha-mao');
const painelAguardando = document.getElementById('painel-aguardando');
const painelFimRodada = document.getElementById('painel-fim-rodada');

// ============================================
//  HELPERS UI
// ============================================
function mostrarEcra(ecra) {
  document.querySelectorAll('.ecra').forEach(e => e.classList.remove('ativo'));
  ecra.classList.add('ativo');
}

function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (tipo ? ' ' + tipo : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('oculto'), 3000);
}

function criarCartaHTML(carta, jogavel = false, naoJogavel = false) {
  const div = document.createElement('div');
  div.className = `carta naipe-${carta.naipe}${jogavel ? ' jogavel' : ''}${naoJogavel ? ' nao-jogavel' : ''}`;
  div.dataset.id = carta.id;
  const s = NAIPE_SIMBOLO[carta.naipe];
  div.innerHTML = `
    <div class="carta-topo"><span class="carta-valor">${carta.valor}</span><span class="carta-naipe">${s}</span></div>
    <div class="carta-centro">${s}</div>
    <div class="carta-fundo"><span class="carta-valor">${carta.valor}</span><span class="carta-naipe">${s}</span></div>
  `;
  return div;
}

function criarCartaCostas(mini = false) {
  const div = document.createElement('div');
  div.className = 'carta-costas' + (mini ? ' mini' : '');
  return div;
}

// Determinar quais cartas o jogador pode jogar
function cartasJogaveis(mao, vezaAtual, trunfo) {
  if (vezaAtual.length === 0) return mao.map(c => c.id); // qualquer
  const naipeLider = vezaAtual[0].carta.naipe;
  const temNaipeLider = mao.some(c => c.naipe === naipeLider);
  if (temNaipeLider) return mao.filter(c => c.naipe === naipeLider).map(c => c.id);
  return mao.map(c => c.id); // qualquer
}

// ============================================
//  RENDERIZAÇÃO DO ESTADO
// ============================================
function renderizarEstado(estado) {
  estadoAtual = estado;
  meuIdx = estado.meuIdx;

  // Mapear posições visuais
  // Eu = baixo (0), direita = (meuIdx+1)%4, cima = (meuIdx+2)%4, esq = (meuIdx+3)%4
  const posParaIdx = {
    baixo: meuIdx,
    dir: (meuIdx + 1) % 4,
    cima: (meuIdx + 2) % 4,
    esq: (meuIdx + 3) % 4
  };

  // Atualizar nomes e cartas dos adversários
  for (const [pos, idx] of Object.entries(posParaIdx)) {
    const jogador = estado.jogadores[idx];
    if (!jogador) continue;
    const nomeEl = document.getElementById(`nome-${pos === 'baixo' ? 'eu' : pos}`);
    const countEl = document.getElementById(`count-${pos}`);
    const slotEl = document.getElementById(`slot-${pos === 'baixo' ? 'baixo' : pos}`);

    if (nomeEl) nomeEl.textContent = jogador.nome || '---';
    if (countEl && pos !== 'baixo') {
      countEl.textContent = jogador.cartasNaMao;
    }

    // Destacar quem é da vez
    if (slotEl) {
      slotEl.classList.toggle('vez-deste', estado.jogadorAtual === idx && estado.estado === 'jogando');
    }

    // Mãos adversários (costas de cartas)
    if (pos !== 'baixo') {
      const maoEl = document.getElementById(`mao-${pos}`);
      if (maoEl) {
        maoEl.innerHTML = '';
        const n = jogador.cartasNaMao || 0;
        const max = Math.min(n, 10);
        for (let i = 0; i < max; i++) {
          maoEl.appendChild(criarCartaCostas());
        }
      }
    }
  }

  // Atualizar pontos
  const nomeEqA = estado.jogadores.filter(j => j.equipa === 0).map(j => j.nome).join(' & ');
  const nomeEqB = estado.jogadores.filter(j => j.equipa === 1).map(j => j.nome).join(' & ');
  document.getElementById('nome-eq-a').textContent = nomeEqA || 'Equipa A';
  document.getElementById('nome-eq-b').textContent = nomeEqB || 'Equipa B';
  document.getElementById('pts-eq-a').textContent = estado.placar?.[0] ?? 0;
  document.getElementById('pts-eq-b').textContent = estado.placar?.[1] ?? 0;

  // Trunfo
  if (estado.trunfo) {
    document.getElementById('label-trunfo').textContent = `Trunfo: ${estado.trunfo} ${NAIPE_SIMBOLO[estado.trunfo]}`;
  }

  // Sala
  document.getElementById('label-sala').textContent = `Sala: ${salaId}`;

  // Mesa: cartas da veza atual
  renderizarMesa(estado);

  // Minha mão
  renderizarMinhaMao(estado);

  // Painel aguardando
  const jogando = estado.estado === 'jogando';
  painelAguardando.style.display = jogando ? 'none' : 'flex';

  if (!jogando) {
    renderizarAguardando(estado);
  }

  // Mensagem de turno
  if (jogando) {
    const minhaTurnos = estado.jogadorAtual === meuIdx;
    document.getElementById('badge-minha-vez').classList.toggle('oculto', !minhaTurnos);
    const nomeVez = estado.jogadores[estado.jogadorAtual]?.nome || '---';
    msgTurno.textContent = minhaTurnos ? '' : `Vez de ${nomeVez}`;
  }
}

function renderizarMesa(estado) {
  if (msgVeza.classList.contains('ativo')) return; // não sobrescrever animação
  cartasMesa.innerHTML = '';
  (estado.vezaAtual || []).forEach(({ carta, jogadorIdx }) => {
    const jogador = estado.jogadores[jogadorIdx];
    const wrap = document.createElement('div');
    wrap.className = 'carta-mesa-wrap carta-animada';
    const cartaEl = criarCartaHTML(carta);
    const nomeEl = document.createElement('span');
    nomeEl.className = 'nome-jogador-mesa';
    nomeEl.textContent = jogador?.nome || '';
    wrap.appendChild(cartaEl);
    wrap.appendChild(nomeEl);
    cartasMesa.appendChild(wrap);
  });
}

function renderizarMinhaMao(estado) {
  minhaMao.innerHTML = '';
  const mao = estado.minhaMao || [];
  const isMinhaVez = estado.jogadorAtual === meuIdx && estado.estado === 'jogando';
  const ids_jogaveis = isMinhaVez ? new Set(cartasJogaveis(mao, estado.vezaAtual, estado.trunfo)) : new Set();

  mao.forEach((carta, i) => {
    const jogavel = isMinhaVez && ids_jogaveis.has(carta.id);
    const naoJogavel = isMinhaVez && !jogavel;
    const cartaEl = criarCartaHTML(carta, jogavel, naoJogavel);
    cartaEl.style.animationDelay = `${i * 0.04}s`;
    if (jogavel) {
      cartaEl.addEventListener('click', () => jogarCarta(carta.id, cartaEl));
    }
    minhaMao.appendChild(cartaEl);
  });
}

function renderizarAguardando(estado) {
  const jogadores = estado.jogadores || [];
  listaJogadoresEl.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const j = jogadores[i];
    const div = document.createElement('div');
    div.className = 'jogador-aguardando';
    const equipa = i % 2;
    div.innerHTML = j
      ? `<span class="equipa-badge eq-${equipa === 0 ? 'a' : 'b'}">${equipa === 0 ? 'Eq. A' : 'Eq. B'}</span>
         <span>${j.nome}</span>`
      : `<span class="equipa-badge eq-${equipa === 0 ? 'a' : 'b'}">${equipa === 0 ? 'Eq. A' : 'Eq. B'}</span>
         <span class="slot-vazio">A aguardar...</span>`;
    listaJogadoresEl.appendChild(div);
  }

  codigoGrandeEl.textContent = salaId || '';

  // Botão nova rodada - só 1º jogador e se estado for aguardando após fim de rodada
  const btn = document.getElementById('btn-iniciar-manual');
  if (estado.estado === 'aguardando' && meuIdx === 0 && jogadores.length === 4 && emJogo) {
    btn.classList.remove('oculto');
    btn.textContent = 'Iniciar Nova Rodada';
  } else if (estado.estado === 'aguardando' && meuIdx === 0 && jogadores.length < 4) {
    btn.classList.add('oculto');
  } else {
    btn.classList.add('oculto');
  }
}

// ============================================
//  JOGAR CARTA
// ============================================
function jogarCarta(cartaId, cartaEl) {
  if (cartaSelecionada === cartaId) {
    // Segunda clique confirma
    socket.emit('jogar_carta', { cartaId });
    cartaSelecionada = null;
  } else {
    // Primeiro clique - selecionar
    document.querySelectorAll('.carta.selecionada').forEach(c => c.classList.remove('selecionada'));
    cartaEl.classList.add('selecionada');
    cartaSelecionada = cartaId;
  }
}

// ============================================
//  SOCKET EVENTS
// ============================================
socket.on('connect', () => {
  console.log('Ligado ao servidor');
});

socket.on('lista_salas', (salas) => {
  renderizarListaSalas(salas);
});

socket.on('entrou_sala', ({ salaId: id, idx }) => {
  salaId = id;
  meuIdx = idx;
  mostrarEcra(ecraJogo);
  painelAguardando.style.display = 'flex';
  painelFimRodada.classList.add('oculto');
});

socket.on('jogador_entrou', ({ nome, total }) => {
  toast(`${nome} entrou na sala (${total}/4)`);
});

socket.on('jogador_saiu', ({ nome }) => {
  toast(`${nome} saiu da sala`, 'erro');
});

socket.on('jogo_iniciado', ({ trunfo }) => {
  emJogo = true;
  painelAguardando.style.display = 'none';
  painelFimRodada.classList.add('oculto');
  toast(`Jogo iniciado! Trunfo: ${trunfo} ${NAIPE_SIMBOLO[trunfo]}`);
});

socket.on('estado_atualizado', (estado) => {
  renderizarEstado(estado);
});

socket.on('veza_completa', ({ vezaInfo, vezaCartas }) => {
  // Mostrar quem ganhou a veza
  const equipa = vezaInfo.equipa === 0 ? 'A' : 'B';
  const txt = `${vezaInfo.nomeVencedor} ganhou a veza!\n+${vezaInfo.pontos} pontos (Eq. ${equipa})`;
  mostrarMsgVeza(txt);
});

socket.on('fim_rodada', (dados) => {
  setTimeout(() => mostrarFimRodada(dados), 2200);
});

socket.on('jogo_interrompido', (msg) => {
  emJogo = false;
  toast(msg, 'erro');
});

socket.on('erro', (msg) => {
  toast(msg, 'erro');
  // Desselecionar carta
  cartaSelecionada = null;
  document.querySelectorAll('.carta.selecionada').forEach(c => c.classList.remove('selecionada'));
});

socket.on('chat_msg', ({ nome, msg, equipa }) => {
  adicionarMsgChat(nome, msg, equipa);
});

// ============================================
//  LOBBY
// ============================================
function renderizarListaSalas(salas) {
  const container = document.getElementById('lista-salas-container');
  container.innerHTML = '';
  const livres = salas.filter(s => s.estado === 'aguardando' && s.jogadores < 4);
  if (livres.length === 0) {
    container.innerHTML = '<p class="sem-salas">Nenhuma sala disponível. Cria uma!</p>';
    return;
  }
  livres.forEach(s => {
    const div = document.createElement('div');
    div.className = 'sala-item';
    div.innerHTML = `
      <div class="sala-info">
        <span class="sala-codigo">${s.id}</span>
        <span class="sala-nomes">${s.nomes.join(', ') || '—'}</span>
      </div>
      <span class="sala-badge ${s.jogadores < 4 ? 'livre' : 'cheia'}">${s.jogadores}/4</span>
    `;
    div.addEventListener('click', () => {
      const nome = getNomeValido();
      if (!nome) return;
      socket.emit('entrar_sala', { salaId: s.id, nome });
    });
    container.appendChild(div);
  });
}

function getNomeValido() {
  const nome = inputNome.value.trim();
  if (!nome) {
    toast('Insere o teu nome primeiro!', 'erro');
    inputNome.focus();
    return null;
  }
  meuNome = nome;
  return nome;
}

// Botão criar sala
document.getElementById('btn-criar').addEventListener('click', () => {
  const nome = getNomeValido();
  if (!nome) return;
  socket.emit('criar_sala', { nome });
});

// Botão ver salas
document.getElementById('btn-entrar-lista').addEventListener('click', () => {
  formNome.classList.add('oculto');
  painelSalas.classList.remove('oculto');
});

document.getElementById('btn-voltar-lobby').addEventListener('click', () => {
  painelSalas.classList.add('oculto');
  formNome.classList.remove('oculto');
});

// Toggle código
document.getElementById('btn-toggle-codigo').addEventListener('click', () => {
  document.getElementById('entrar-codigo').classList.toggle('oculto');
});

document.getElementById('btn-entrar-codigo').addEventListener('click', () => {
  const nome = getNomeValido();
  const codigo = inputCodigo.value.trim().toUpperCase();
  if (!nome) return;
  if (!codigo) { toast('Insere o código da sala', 'erro'); return; }
  socket.emit('entrar_sala', { salaId: codigo, nome });
});

inputNome.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-criar').click();
});
inputCodigo.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-entrar-codigo').click();
});

// ============================================
//  BOTÕES NO JOGO
// ============================================
document.getElementById('btn-copiar-codigo').addEventListener('click', () => {
  navigator.clipboard.writeText(salaId || '').then(() => toast('Código copiado!'));
});

document.getElementById('btn-iniciar-manual').addEventListener('click', () => {
  socket.emit('nova_rodada');
});

document.getElementById('btn-sair-sala').addEventListener('click', () => {
  location.reload();
});

document.getElementById('btn-sair-jogo').addEventListener('click', () => {
  location.reload();
});

document.getElementById('btn-nova-rodada').addEventListener('click', () => {
  painelFimRodada.classList.add('oculto');
  socket.emit('nova_rodada');
});

// ============================================
//  VEZA
// ============================================
function mostrarMsgVeza(txt) {
  msgVeza.textContent = txt;
  msgVeza.classList.remove('oculto');
  msgVeza.classList.add('ativo');
  setTimeout(() => {
    msgVeza.classList.remove('oculto', 'ativo');
  }, 2000);
}

// ============================================
//  FIM RODADA
// ============================================
function mostrarFimRodada(dados) {
  const { pontosRodada, placar, vezasGanhas, equipas } = dados;
  const vencedora = pontosRodada[0] > pontosRodada[1] ? 0 : (pontosRodada[1] > pontosRodada[0] ? 1 : -1);

  const nomeA = equipas[0].join(' & ') || 'Equipa A';
  const nomeB = equipas[1].join(' & ') || 'Equipa B';

  document.getElementById('resultado-rodada').innerHTML = `
    <div class="resultado-equipa${vencedora === 0 ? ' vencedor' : ''}">
      <div class="nome-eq-resultado">${nomeA}</div>
      <div class="pts-resultado" style="color: var(--verde-brilho)">${pontosRodada[0]}</div>
      <div style="font-size:12px;color:var(--texto-dimmed)">${vezasGanhas[0]} vezas</div>
      ${vencedora === 0 ? '<span class="label-vencedor">🏆 VENCEU</span>' : ''}
    </div>
    <div class="resultado-equipa${vencedora === 1 ? ' vencedor' : ''}">
      <div class="nome-eq-resultado">${nomeB}</div>
      <div class="pts-resultado" style="color: #e8a050">${pontosRodada[1]}</div>
      <div style="font-size:12px;color:var(--texto-dimmed)">${vezasGanhas[1]} vezas</div>
      ${vencedora === 1 ? '<span class="label-vencedor">🏆 VENCEU</span>' : ''}
    </div>
  `;

  document.getElementById('placar-total').innerHTML = `
    Placar total: <strong>${nomeA} ${placar[0]}</strong> — <strong>${placar[1]} ${nomeB}</strong>
  `;

  painelFimRodada.classList.remove('oculto');

  // Botão nova rodada só para 1º jogador
  const btnNova = document.getElementById('btn-nova-rodada');
  btnNova.style.display = meuIdx === 0 ? 'block' : 'none';
  if (meuIdx !== 0) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'A aguardar que o criador da sala inicie nova rodada...';
    if (!document.querySelector('.hint-nova-rodada')) {
      hint.classList.add('hint-nova-rodada');
      btnNova.parentNode.insertBefore(hint, btnNova);
    }
  }
}

// ============================================
//  CHAT
// ============================================
const chatPanel = document.getElementById('painel-chat');

document.getElementById('btn-chat-toggle').addEventListener('click', () => {
  chatPanel.classList.toggle('oculto');
});
document.getElementById('btn-fechar-chat').addEventListener('click', () => {
  chatPanel.classList.add('oculto');
});

document.getElementById('btn-enviar-chat').addEventListener('click', enviarChat);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') enviarChat();
});

function enviarChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chat', { msg });
  input.value = '';
}

function adicionarMsgChat(nome, msg, equipa) {
  const container = document.getElementById('chat-msgs');
  const div = document.createElement('div');
  div.className = `chat-msg eq-${equipa}`;
  div.innerHTML = `<span class="chat-nome">${nome}:</span> ${escapeHtml(msg)}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  // Mostrar chat se fechado
  if (chatPanel.classList.contains('oculto')) {
    document.getElementById('btn-chat-icon') && null;
    // Badge notificação no botão
    const btn = document.getElementById('btn-chat-toggle');
    btn.textContent = '💬🔴';
    setTimeout(() => { btn.textContent = '💬'; }, 3000);
  }
}

function adicionarMsgSistema(msg) {
  const container = document.getElementById('chat-msgs');
  const div = document.createElement('div');
  div.className = 'chat-msg sistema';
  div.textContent = msg;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Eventos de chat via socket
socket.on('jogador_entrou', ({ nome }) => {
  adicionarMsgSistema(`${nome} entrou na sala`);
});
socket.on('jogador_saiu', ({ nome }) => {
  adicionarMsgSistema(`${nome} saiu da sala`);
});
socket.on('jogo_iniciado', () => {
  adicionarMsgSistema('Jogo iniciado! Boa sorte a todos! 🃏');
});
