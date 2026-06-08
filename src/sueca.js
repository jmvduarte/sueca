// ==========================================
//  SUECA - Lógica do Jogo
// ==========================================

const NAIPES = ['ouros', 'copas', 'paus', 'espadas'];
const VALORES = ['2', '3', '4', '5', '6', 'Q', 'J', 'K', '7', 'A'];
const PONTOS_CARTA = { 'A': 11, '7': 10, 'K': 4, 'J': 3, 'Q': 2, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 };
const ORDEM_CARTA = { 'A': 9, '7': 8, 'K': 7, 'J': 6, 'Q': 5, '6': 4, '5': 3, '4': 2, '3': 1, '2': 0 };

function criarBaralho() {
  const baralho = [];
  for (const naipe of NAIPES) {
    for (const valor of VALORES) {
      baralho.push({ naipe, valor, id: `${valor}_${naipe}` });
    }
  }
  return baralho;
}

function baralhar(baralho) {
  const b = [...baralho];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function distribuirCartas(baralho) {
  // 4 jogadores, 10 cartas cada
  const maos = [[], [], [], []];
  for (let i = 0; i < 40; i++) {
    maos[i % 4].push(baralho[i]);
  }
  return maos;
}

function pontosCartas(cartas) {
  return cartas.reduce((acc, c) => acc + (PONTOS_CARTA[c.valor] || 0), 0);
}

function cartaVence(carta1, carta2, trunfo, naipeLider) {
  // trunfo bate tudo
  if (carta1.naipe === trunfo && carta2.naipe !== trunfo) return 1;
  if (carta2.naipe === trunfo && carta1.naipe !== trunfo) return 2;
  // ambas trunfo - maior trunfo
  if (carta1.naipe === trunfo && carta2.naipe === trunfo) {
    return ORDEM_CARTA[carta1.valor] > ORDEM_CARTA[carta2.valor] ? 1 : 2;
  }
  // carta2 não é do naipe lider - carta1 ganha
  if (carta2.naipe !== naipeLider) return 1;
  // carta1 não é do naipe lider - carta2 ganha
  if (carta1.naipe !== naipeLider) return 2;
  // ambas do naipe lider
  return ORDEM_CARTA[carta1.valor] > ORDEM_CARTA[carta2.valor] ? 1 : 2;
}

function determinarVencedorVeza(veza, trunfo) {
  let melhor = 0; // índice da carta vencedora
  const naipeLider = veza[0].naipe;
  for (let i = 1; i < veza.length; i++) {
    const resultado = cartaVence(veza[melhor], veza[i], trunfo, naipeLider);
    if (resultado === 2) melhor = i;
  }
  return melhor;
}

// ==========================================
//  Classe principal do jogo
// ==========================================
class JogoSueca {
  constructor(id) {
    this.id = id;
    this.estado = 'aguardando'; // aguardando, jogando, fim
    this.jogadores = []; // [{id, nome, socketId, equipa}]
    this.maos = {}; // socketId -> cartas
    this.trunfo = null;
    this.vezaAtual = []; // [{carta, jogadorIdx}]
    this.jogadorAtual = 0; // índice 0-3
    this.pontos = [0, 0]; // equipa 0 (j0+j2), equipa 1 (j1+j3)
    this.pontosRodada = [0, 0];
    this.histVezas = [];
    this.rodada = 1;
    this.maxRodadas = 10; // 10 vezas por rodada
    this.vezasGanhas = [0, 0]; // vezas ganhas por equipa nesta rodada
    this.placar = [0, 0]; // pontos totais (pode ser multi-rodada)
  }

  adicionarJogador(socketId, nome) {
    if (this.jogadores.length >= 4) return { erro: 'Sala cheia' };
    if (this.estado !== 'aguardando') return { erro: 'Jogo já começou' };

    const idx = this.jogadores.length;
    const equipa = idx % 2; // 0,2 = equipa A; 1,3 = equipa B
    this.jogadores.push({ id: socketId, nome, socketId, equipa, idx });
    return { sucesso: true, idx };
  }

  removerJogador(socketId) {
    const idx = this.jogadores.findIndex(j => j.socketId === socketId);
    if (idx !== -1) {
      this.jogadores.splice(idx, 1);
      // Re-indexar
      this.jogadores.forEach((j, i) => {
        j.idx = i;
        j.equipa = i % 2;
      });
    }
  }

  iniciar() {
    if (this.jogadores.length !== 4) return { erro: 'Precisa de 4 jogadores' };

    const baralho = baralhar(criarBaralho());
    const maos = distribuirCartas(baralho);

    this.jogadores.forEach((j, i) => {
      this.maos[j.socketId] = maos[i];
    });

    // Trunfo = naipe da 1ª carta do 1º jogador
    this.trunfo = maos[0][0].naipe;
    this.vezaAtual = [];
    this.jogadorAtual = 0;
    this.estado = 'jogando';
    this.pontosRodada = [0, 0];
    this.vezasGanhas = [0, 0];
    this.histVezas = [];

    return { sucesso: true };
  }

  jogarCarta(socketId, cartaId) {
    const jogadorIdx = this.jogadores.findIndex(j => j.socketId === socketId);
    if (jogadorIdx === -1) return { erro: 'Jogador não encontrado' };
    if (jogadorIdx !== this.jogadorAtual) return { erro: 'Não é a tua vez' };

    const mao = this.maos[socketId];
    const cartaIdx = mao.findIndex(c => c.id === cartaId);
    if (cartaIdx === -1) return { erro: 'Carta não encontrada na tua mão' };

    // Verificar regra do naipe lider
    if (this.vezaAtual.length > 0) {
      const naipeLider = this.vezaAtual[0].carta.naipe;
      const temNaipeLider = mao.some(c => c.naipe === naipeLider);
      const carta = mao[cartaIdx];
      if (temNaipeLider && carta.naipe !== naipeLider) {
        return { erro: `Tens cartas de ${naipeLider}, tens de jogar esse naipe` };
      }
    }

    const carta = mao.splice(cartaIdx, 1)[0];
    this.vezaAtual.push({ carta, jogadorIdx });

    // Veza completa (4 cartas)
    if (this.vezaAtual.length === 4) {
      return this.resolverVeza();
    }

    // Próximo jogador
    this.jogadorAtual = (this.jogadorAtual + 1) % 4;
    return { sucesso: true, carta, proximoJogador: this.jogadorAtual };
  }

  resolverVeza() {
    const cartas = this.vezaAtual.map(v => v.carta);
    const naipeLider = cartas[0].naipe;
    let melhorIdx = 0;
    for (let i = 1; i < 4; i++) {
      const res = cartaVence(this.vezaAtual[melhorIdx].carta, this.vezaAtual[i].carta, this.trunfo, naipeLider);
      if (res === 2) melhorIdx = i;
    }

    const vencedor = this.vezaAtual[melhorIdx];
    const jogadorVencedor = this.jogadores[vencedor.jogadorIdx];
    const equipaVencedora = jogadorVencedor.equipa;
    const pontosVeza = pontosCartas(cartas);

    this.pontosRodada[equipaVencedora] += pontosVeza;
    this.vezasGanhas[equipaVencedora]++;

    const vezaInfo = {
      cartas: this.vezaAtual,
      vencedor: vencedor.jogadorIdx,
      nomeVencedor: jogadorVencedor.nome,
      equipa: equipaVencedora,
      pontos: pontosVeza
    };
    this.histVezas.push(vezaInfo);

    this.jogadorAtual = vencedor.jogadorIdx;
    const vezaAnterior = [...this.vezaAtual];
    this.vezaAtual = [];

    // Verificar fim de rodada (10 vezas)
    if (this.histVezas.length === 10) {
      return this.finalizarRodada(vezaInfo, vezaAnterior);
    }

    return {
      sucesso: true,
      vezaCompleta: true,
      vezaInfo,
      vezaCartas: vezaAnterior,
      proximoJogador: this.jogadorAtual
    };
  }

  finalizarRodada(vezaInfo, vezaAnterior) {
    // Adicionar pontos ao placar total
    this.placar[0] += this.pontosRodada[0];
    this.placar[1] += this.pontosRodada[1];

    const resultado = {
      sucesso: true,
      vezaCompleta: true,
      fimRodada: true,
      vezaInfo,
      vezaCartas: vezaAnterior,
      pontosRodada: [...this.pontosRodada],
      placar: [...this.placar],
      vezasGanhas: [...this.vezasGanhas]
    };

    // Reiniciar para nova rodada
    this.estado = 'aguardando';
    return resultado;
  }

  getEstadoPublico(socketId) {
    const jogadorIdx = this.jogadores.findIndex(j => j.socketId === socketId);
    return {
      id: this.id,
      estado: this.estado,
      jogadores: this.jogadores.map(j => ({
        nome: j.nome,
        idx: j.idx,
        equipa: j.equipa,
        cartasNaMao: this.maos[j.socketId]?.length || 0
      })),
      minhaMao: this.maos[socketId] || [],
      meuIdx: jogadorIdx,
      trunfo: this.trunfo,
      vezaAtual: this.vezaAtual,
      jogadorAtual: this.jogadorAtual,
      pontosRodada: this.pontosRodada,
      placar: this.placar,
      vezasGanhas: this.vezasGanhas,
      numVezas: this.histVezas.length
    };
  }
}

module.exports = { JogoSueca, pontosCartas, PONTOS_CARTA };
