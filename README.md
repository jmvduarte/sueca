# 🃏 Sueca Online

Jogo de Sueca multiplayer online, construído com Node.js, Express e Socket.io.

## Como Jogar

- **4 jogadores** divididos em 2 equipas (Equipa A: jogador 1+3, Equipa B: jogador 2+4)
- O **trunfo** é definido pelo naipe da 1ª carta do 1º jogador
- Cada jogador recebe **10 cartas**
- Tens de jogar o **mesmo naipe** da primeira carta da veza (se tiveres)
- O trunfo bate qualquer outro naipe
- A equipa com mais **pontos** (não vezas) ganha!

### Pontuação
| Carta | Pontos |
|-------|--------|
| Ás    | 11     |
| 7     | 10     |
| Rei   | 4      |
| Valete| 3      |
| Dama  | 2      |
| 2-6   | 0      |

## Instalação Local

```bash
npm install
npm start
```

Abre http://localhost:3000

## Deploy no Render

1. Faz fork/push deste repositório para o GitHub
2. Entra em [render.com](https://render.com) e cria uma conta
3. Clica em **New → Web Service**
4. Liga ao teu repositório GitHub
5. Configura:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
6. Clica **Deploy**!

O Render vai atribuir automaticamente a variável `PORT`.

## Estrutura

```
sueca/
├── server.js          # Servidor Express + Socket.io
├── src/
│   └── sueca.js       # Lógica do jogo
├── public/
│   ├── index.html     # Interface do jogo
│   ├── css/style.css  # Estilos
│   └── js/jogo.js     # Cliente WebSocket
├── render.yaml        # Config Render
└── package.json
```
