// ============================================
//  SUECA ONLINE - Cliente (v2)
// ============================================

const socket = io();

let estadoAtual = null;
let salaId = null;
let meuIdx = -1;
let meuNome = '';
let cartaSelecionada = null;
let emJogo = false;
let vezaTimeout = null;
let bloqueadoVeza = false; // bloquear cliques durante animação veza
let ultimaVeza = null;     // {vezaInfo, vezaCartas, jogadores} para consulta
let fimRodadaVisivel = false; // não mostrar painel aguardando enquanto resultado aberto

const NAIPE_SIMBOLO = { ouros: '♦', copas: '♥', paus: '♣', espadas: '♠' };

// ============================================
//  DOM refs
// ============================================
const ecraLobby = document.getElementById('ecra-lobby');
const ecraJogo  = document.getElementById('ecra-jogo');
const formNome  = document.getElementById('form-nome');
const painelSalas = document.getElementById('painel-salas');
const inputNome = document.getElementById('input-nome');
const inputCodigo = document.getElementById('input-codigo');
const listaJogadoresEl = document.getElementById('lista-jogadores-sala');
const codigoGrandeEl   = document.getElementById('codigo-sala-grande');
const cartasMesa  = document.getElementById('cartas-mesa');
const toastVeza   = document.getElementById('toast-veza');
const msgTurno    = document.getElementById('msg-turno');
const minhaMao    = document.getElementById('minha-mao');
const painelAguardando = document.getElementById('painel-aguardando');
const painelFimRodada  = document.getElementById('painel-fim-rodada');

// ============================================
//  HELPERS
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
  el._t = setTimeout(() => el.classList.add('oculto'), 3500);
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

function criarCartaCostas() {
  const div = document.createElement('div');
  div.className = 'carta-costas';
  return div;
}

function cartasJogaveis(mao, vezaAtual, trunfo) {
  if (!vezaAtual || vezaAtual.length === 0) return mao.map(c => c.id);
  const naipeLider = vezaAtual[0].carta.naipe;
  const temNaipeLider = mao.some(c => c.naipe === naipeLider);
  if (temNaipeLider) return mao.filter(c => c.naipe === naipeLider).map(c => c.id);
  return mao.map(c => c.id);
}

// ============================================
//  RENDERIZAÇÃO PRINCIPAL
// ============================================
function renderizarEstado(estado) {
  estadoAtual = estado;
  meuIdx = estado.meuIdx;

  // posições visuais relativas a mim
  const pos = {
    baixo: meuIdx,
    dir:   (meuIdx + 1) % 4,
    cima:  (meuIdx + 2) % 4,
    esq:   (meuIdx + 3) % 4,
  };

  // Nomes, contagens, destaque de vez
  for (const [slot, idx] of Object.entries(pos)) {
    const j = estado.jogadores[idx];
    const nomeId = slot === 'baixo' ? 'nome-eu' : `nome-${slot}`;
    const nomeEl = document.getElementById(nomeId);
    const countEl = document.getElementById(`count-${slot}`);
    const slotEl  = document.getElementById(`slot-${slot === 'baixo' ? 'baixo' : slot}`);

    if (nomeEl) nomeEl.textContent = j?.nome || '---';
    if (countEl && slot !== 'baixo') countEl.textContent = j?.cartasNaMao ?? 0;
    if (slotEl) slotEl.classList.toggle('vez-deste', estado.estado === 'jogando' && estado.jogadorAtual === idx);

    // Costas das cartas dos adversários
    if (slot !== 'baixo') {
      const maoEl = document.getElementById(`mao-${slot}`);
      if (maoEl) {
        maoEl.innerHTML = '';
        const n = Math.min(j?.cartasNaMao ?? 0, 10);
        for (let i = 0; i < n; i++) maoEl.appendChild(criarCartaCostas());
      }
    }
  }

  // Equipas / pontos no topo
  const nomeA = estado.jogadores.filter(j => j.equipa === 0).map(j => j.nome).join(' & ') || 'Equipa A';
  const nomeB = estado.jogadores.filter(j => j.equipa === 1).map(j => j.nome).join(' & ') || 'Equipa B';
  document.getElementById('nome-eq-a').textContent = nomeA;
  document.getElementById('nome-eq-b').textContent = nomeB;
  document.getElementById('pts-eq-a').textContent  = estado.placar?.[0] ?? 0;
  document.getElementById('pts-eq-b').textContent  = estado.placar?.[1] ?? 0;

  // Pontos rodada
  document.getElementById('pts-rod-a').textContent = estado.pontosRodada?.[0] ?? 0;
  document.getElementById('pts-rod-b').textContent = estado.pontosRodada?.[1] ?? 0;
  document.getElementById('vezas-a').textContent   = estado.vezasGanhas?.[0] ?? 0;
  document.getElementById('vezas-b').textContent   = estado.vezasGanhas?.[1] ?? 0;

  // Trunfo
  if (estado.trunfo) {
    const s = NAIPE_SIMBOLO[estado.trunfo];
    document.getElementById('label-trunfo').textContent = `Trunfo: ${estado.trunfo} ${s}`;
    document.getElementById('label-trunfo').className = `badge-trunfo naipe-${estado.trunfo}`;
  }

  document.getElementById('label-sala').textContent = `Sala: ${salaId}`;

  // Mesa - só renderizar se não estiver bloqueado pela animação de veza
  if (!bloqueadoVeza) {
    renderizarMesa(estado);
  }

  // Minha mão
  renderizarMinhaMao(estado);

  // Painel aguardando (nunca mostrar enquanto o resultado da rodada está aberto)
  const jogando = estado.estado === 'jogando';
  painelAguardando.style.display = (jogando || fimRodadaVisivel || bloqueadoVeza) ? 'none' : 'flex';
  if (!jogando) renderizarAguardando(estado);

  // Badge vez
  if (jogando) {
    const minhaTurno = estado.jogadorAtual === meuIdx;
    document.getElementById('badge-minha-vez').classList.toggle('oculto', !minhaTurno);
    if (!minhaTurno) {
      const nomeVez = estado.jogadores[estado.jogadorAtual]?.nome || '---';
      msgTurno.textContent = `Vez de ${nomeVez}`;
    } else {
      msgTurno.textContent = '';
    }
  }
}

function renderizarMesa(estado) {
  cartasMesa.innerHTML = '';
  (estado.vezaAtual || []).forEach(({ carta, jogadorIdx }) => {
    const jogador = estado.jogadores[jogadorIdx];
    const wrap = document.createElement('div');
    wrap.className = 'carta-mesa-wrap';
    const cartaEl = criarCartaHTML(carta);
    cartaEl.classList.add('carta-animada');
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
  const isMinhaVez = !bloqueadoVeza && estado.jogadorAtual === meuIdx && estado.estado === 'jogando';
  const jogaveisSet = isMinhaVez ? new Set(cartasJogaveis(mao, estado.vezaAtual, estado.trunfo)) : new Set();

  mao.forEach((carta, i) => {
    const jogavel    = isMinhaVez && jogaveisSet.has(carta.id);
    const naoJogavel = isMinhaVez && !jogavel;
    const cartaEl = criarCartaHTML(carta, jogavel, naoJogavel);
    cartaEl.style.animationDelay = `${i * 0.04}s`;
    if (jogavel) cartaEl.addEventListener('click', () => jogarCarta(carta.id, cartaEl));
    minhaMao.appendChild(cartaEl);
  });
}

function renderizarAguardando(estado) {
  const jogadores = estado.jogadores || [];
  listaJogadoresEl.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const j = estado.jogadores[i];
    const eq = i % 2;
    const div = document.createElement('div');
    div.className = 'jogador-aguardando';
    div.innerHTML = j
      ? `<span class="equipa-badge eq-${eq === 0 ? 'a' : 'b'}">${eq === 0 ? 'Eq. A' : 'Eq. B'}</span><span>${j.nome}</span>`
      : `<span class="equipa-badge eq-${eq === 0 ? 'a' : 'b'}">${eq === 0 ? 'Eq. A' : 'Eq. B'}</span><span class="slot-vazio">A aguardar...</span>`;
    listaJogadoresEl.appendChild(div);
  }
  codigoGrandeEl.textContent = salaId || '';

  const btn = document.getElementById('btn-iniciar-manual');
  if (meuIdx === 0 && jogadores.length === 4 && emJogo) {
    btn.classList.remove('oculto');
    btn.textContent = 'Iniciar Nova Rodada';
  } else {
    btn.classList.add('oculto');
  }
}

// ============================================
//  VEZA - mostrar cartas + resultado em cima
// ============================================
function mostrarResultadoVeza(vezaInfo, vezaCartas) {
  bloqueadoVeza = true;
  cartaSelecionada = null;

  // Guardar para o botão "Última veza"
  ultimaVeza = {
    vezaInfo,
    vezaCartas,
    nomes: (vezaCartas || []).map(({ jogadorIdx }) => estadoAtual?.jogadores?.[jogadorIdx]?.nome || `Jogador ${jogadorIdx+1}`)
  };
  document.getElementById('btn-ultima-veza').classList.remove('oculto');

  // Mostrar as cartas da veza completa na mesa
  cartasMesa.innerHTML = '';
  (vezaCartas || []).forEach(({ carta, jogadorIdx }) => {
    if (!estadoAtual) return;
    const jogador = estadoAtual.jogadores[jogadorIdx];
    const wrap = document.createElement('div');
    wrap.className = 'carta-mesa-wrap';
    const cartaEl = criarCartaHTML(carta);
    const nomeEl = document.createElement('span');
    nomeEl.className = 'nome-jogador-mesa';
    nomeEl.textContent = jogador?.nome || '';
    wrap.appendChild(cartaEl);
    wrap.appendChild(nomeEl);
    cartasMesa.appendChild(wrap);
  });

  // Toast veza não-bloqueante (aparece por cima, fora da mesa)
  const equipa = vezaInfo.equipa === 0 ? 'A' : 'B';
  toastVeza.innerHTML = `<strong>${vezaInfo.nomeVencedor}</strong> ganhou a veza &nbsp;+${vezaInfo.pontos}pts &nbsp;<span class="eq-tag">(Eq.${equipa})</span>`;
  toastVeza.classList.remove('oculto');

  clearTimeout(vezaTimeout);
  vezaTimeout = setTimeout(() => {
    toastVeza.classList.add('oculto');
    bloqueadoVeza = false;
    // Re-renderizar mão com cliques correctos
    if (estadoAtual) renderizarMinhaMao(estadoAtual);
  }, 2200);
}

// ============================================
//  JOGAR CARTA
// ============================================
function jogarCarta(cartaId, cartaEl) {
  if (bloqueadoVeza) return;
  if (cartaSelecionada === cartaId) {
    socket.emit('jogar_carta', { cartaId });
    cartaSelecionada = null;
  } else {
    document.querySelectorAll('.carta.selecionada').forEach(c => c.classList.remove('selecionada'));
    cartaEl.classList.add('selecionada');
    cartaSelecionada = cartaId;
  }
}

// ============================================
//  SOCKET EVENTS
// ============================================
socket.on('lista_salas', renderizarListaSalas);

socket.on('entrou_sala', ({ salaId: id, idx }) => {
  salaId = id;
  meuIdx = idx;
  mostrarEcra(ecraJogo);
  painelAguardando.style.display = 'flex';
  painelFimRodada.classList.add('oculto');
});

socket.on('jogador_entrou', ({ nome, total }) => {
  toast(`${nome} entrou na sala (${total}/4)`);
  adicionarMsgSistema(`${nome} entrou na sala`);
});

socket.on('jogador_saiu', ({ nome }) => {
  toast(`${nome} saiu da sala`, 'erro');
  adicionarMsgSistema(`${nome} saiu da sala`);
});

socket.on('jogo_iniciado', ({ trunfo }) => {
  emJogo = true;
  bloqueadoVeza = false;
  fimRodadaVisivel = false;
  ultimaVeza = null;
  document.getElementById('btn-ultima-veza').classList.add('oculto');
  document.getElementById('painel-ultima-veza').classList.add('oculto');
  painelAguardando.style.display = 'none';
  painelFimRodada.classList.add('oculto');
  toastVeza.classList.add('oculto');
  toast(`Jogo iniciado! Trunfo: ${trunfo} ${NAIPE_SIMBOLO[trunfo]}`);
  adicionarMsgSistema(`Jogo iniciado! Trunfo: ${trunfo} ${NAIPE_SIMBOLO[trunfo]} 🃏`);
});

socket.on('estado_atualizado', (estado) => {
  renderizarEstado(estado);
});

socket.on('veza_completa', ({ vezaInfo, vezaCartas }) => {
  mostrarResultadoVeza(vezaInfo, vezaCartas);
});

socket.on('fim_rodada', (dados) => {
  fimRodadaVisivel = true;
  setTimeout(() => {
    bloqueadoVeza = false;
    toastVeza.classList.add('oculto');
    mostrarFimRodada(dados);
  }, 2400);
});

socket.on('jogo_interrompido', (msg) => {
  emJogo = false;
  bloqueadoVeza = false;
  toast(msg, 'erro');
});

socket.on('erro', (msg) => {
  toast(msg, 'erro');
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
      if (nome) socket.emit('entrar_sala', { salaId: s.id, nome });
    });
    container.appendChild(div);
  });
}

function getNomeValido() {
  const nome = inputNome.value.trim();
  if (!nome) { toast('Insere o teu nome primeiro!', 'erro'); inputNome.focus(); return null; }
  meuNome = nome;
  return nome;
}

document.getElementById('btn-criar').addEventListener('click', () => {
  const nome = getNomeValido();
  if (nome) socket.emit('criar_sala', { nome });
});

document.getElementById('btn-entrar-lista').addEventListener('click', () => {
  formNome.classList.add('oculto');
  painelSalas.classList.remove('oculto');
});

document.getElementById('btn-voltar-lobby').addEventListener('click', () => {
  painelSalas.classList.add('oculto');
  formNome.classList.remove('oculto');
});

document.getElementById('btn-toggle-codigo').addEventListener('click', () => {
  document.getElementById('entrar-codigo').classList.toggle('oculto');
});

document.getElementById('btn-entrar-codigo').addEventListener('click', () => {
  const nome  = getNomeValido();
  const codigo = inputCodigo.value.trim().toUpperCase();
  if (!nome) return;
  if (!codigo) { toast('Insere o código da sala', 'erro'); return; }
  socket.emit('entrar_sala', { salaId: codigo, nome });
});

inputNome.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-criar').click(); });
inputCodigo.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-entrar-codigo').click(); });

// ============================================
//  BOTÕES NO JOGO
// ============================================
document.getElementById('btn-copiar-codigo').addEventListener('click', () => {
  navigator.clipboard.writeText(salaId || '').then(() => toast('Código copiado!'));
});

document.getElementById('btn-iniciar-manual').addEventListener('click', () => {
  socket.emit('nova_rodada');
});

document.getElementById('btn-sair-sala').addEventListener('click', () => location.reload());
document.getElementById('btn-sair-jogo').addEventListener('click', () => location.reload());

document.getElementById('btn-nova-rodada').addEventListener('click', () => {
  fimRodadaVisivel = false;
  painelFimRodada.classList.add('oculto');
  socket.emit('nova_rodada');
});

// ============================================
//  ÚLTIMA VEZA (consulta para contar trunfos)
// ============================================
document.getElementById('btn-ultima-veza').addEventListener('click', () => {
  if (!ultimaVeza) return;
  const painel = document.getElementById('painel-ultima-veza');
  const container = document.getElementById('ultima-veza-cartas');
  container.innerHTML = '';

  ultimaVeza.vezaCartas.forEach(({ carta }, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'carta-mesa-wrap';
    const cartaEl = criarCartaHTML(carta);
    const nomeEl = document.createElement('span');
    nomeEl.className = 'nome-jogador-mesa';
    nomeEl.textContent = ultimaVeza.nomes[i] || '';
    wrap.appendChild(cartaEl);
    wrap.appendChild(nomeEl);
    container.appendChild(wrap);
  });

  const eq = ultimaVeza.vezaInfo.equipa === 0 ? 'A' : 'B';
  document.getElementById('ultima-veza-info').textContent =
    `${ultimaVeza.vezaInfo.nomeVencedor} ganhou (+${ultimaVeza.vezaInfo.pontos} pts, Eq. ${eq})`;

  painel.classList.remove('oculto');
});

document.getElementById('btn-fechar-ultima-veza').addEventListener('click', () => {
  document.getElementById('painel-ultima-veza').classList.add('oculto');
});

// ============================================
//  FIM RODADA
// ============================================
function mostrarFimRodada(dados) {
  const { pontosRodada, placar, vezasGanhas, equipas, vencedorPartida } = dados;
  const vencedora = vencedorPartida !== undefined ? vencedorPartida
    : (pontosRodada[0] > pontosRodada[1] ? 0 : pontosRodada[1] > pontosRodada[0] ? 1 : -1);
  const nomeA = equipas[0].join(' & ') || 'Equipa A';
  const nomeB = equipas[1].join(' & ') || 'Equipa B';

  document.getElementById('resultado-rodada').innerHTML = `
    <div class="resultado-equipa${vencedora === 0 ? ' vencedor' : ''}">
      <div class="nome-eq-resultado">${nomeA}</div>
      <div class="pts-resultado" style="color:var(--verde-brilho)">${pontosRodada[0]}</div>
      <div style="font-size:12px;color:var(--texto-dimmed)">${vezasGanhas[0]} vezas</div>
      ${vencedora === 0 ? '<span class="label-vencedor">🏆 GANHOU A PARTIDA</span>' : ''}
    </div>
    <div class="resultado-equipa${vencedora === 1 ? ' vencedor' : ''}">
      <div class="nome-eq-resultado">${nomeB}</div>
      <div class="pts-resultado" style="color:#e8a050">${pontosRodada[1]}</div>
      <div style="font-size:12px;color:var(--texto-dimmed)">${vezasGanhas[1]} vezas</div>
      ${vencedora === 1 ? '<span class="label-vencedor">🏆 GANHOU A PARTIDA</span>' : ''}
    </div>
  `;

  const empate = vencedora === -1 ? '<br><em style="color:var(--texto-dimmed)">Empate 60-60 — ninguém leva a partida!</em>' : '';
  document.getElementById('placar-total').innerHTML =
    `Partidas ganhas: <strong>${nomeA} ${placar[0]}</strong> — <strong>${placar[1]} ${nomeB}</strong>${empate}`;

  painelFimRodada.classList.remove('oculto');

  const btnNova = document.getElementById('btn-nova-rodada');
  const hintEl  = document.getElementById('hint-nova-rodada');
  if (meuIdx === 0) {
    btnNova.style.display = 'block';
    if (hintEl) hintEl.remove();
  } else {
    btnNova.style.display = 'none';
    if (!hintEl) {
      const h = document.createElement('p');
      h.id = 'hint-nova-rodada';
      h.className = 'hint';
      h.textContent = 'A aguardar que o anfitrião inicie nova rodada...';
      btnNova.parentNode.insertBefore(h, btnNova);
    }
  }
}

// ============================================
//  CHAT
// ============================================
const chatPanel = document.getElementById('painel-chat');

document.getElementById('btn-chat-toggle').addEventListener('click', () => {
  chatPanel.classList.toggle('oculto');
  document.getElementById('btn-chat-toggle').textContent = '💬';
});
document.getElementById('btn-fechar-chat').addEventListener('click', () => chatPanel.classList.add('oculto'));
document.getElementById('btn-enviar-chat').addEventListener('click', enviarChat);
document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') enviarChat(); });

function enviarChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chat', { msg });
  input.value = '';
}

function adicionarMsgChat(nome, msg, equipa) {
  const c = document.getElementById('chat-msgs');
  const div = document.createElement('div');
  div.className = `chat-msg eq-${equipa}`;
  div.innerHTML = `<span class="chat-nome">${escapeHtml(nome)}:</span> ${escapeHtml(msg)}`;
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
  if (chatPanel.classList.contains('oculto')) {
    document.getElementById('btn-chat-toggle').textContent = '💬🔴';
  }
}

function adicionarMsgSistema(msg) {
  const c = document.getElementById('chat-msgs');
  const div = document.createElement('div');
  div.className = 'chat-msg sistema';
  div.textContent = msg;
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
