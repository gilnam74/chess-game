// ── Piece symbols ──────────────────────────────────────────────────────────
const PIECES = {
    wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
    bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
};

// ── Notation helpers ───────────────────────────────────────────────────────
const FILES = 'abcdefgh';
function toAlg(r, c) { return FILES[c] + (8-r); }
function moveSAN(hist, engine) {
    const { from:[fr,fc], to:[tr,tc], piece, captured, promotion } = hist;
    const type = piece[1];
    const dest = toAlg(tr, tc);
    if (type === 'K' && Math.abs(tc-fc) === 2) return tc > fc ? 'O-O' : 'O-O-O';
    let s = type === 'P' ? (captured || hist.enPassantCapture ? FILES[fc]+'x' : '') + dest
                         : type + (captured ? 'x' : '') + dest;
    if (promotion) s += '=' + promotion;
    return s;
}

// ── App state ──────────────────────────────────────────────────────────────
let engine = new ChessEngine();
let myColor = null;   // 'w' or 'b'
let peer = null;
let conn = null;
let isOnline = false;
let selected = null;
let validMoves = [];
let moveHistory = [];
let pendingPromotion = null;
let playerNames = { w: 'White', b: 'Black' };
let gameActive = false;
let localMode = false; // hot-seat for testing

// ── DOM refs ───────────────────────────────────────────────────────────────
const lobbyEl      = document.getElementById('lobby');
const waitingEl    = document.getElementById('waiting');
const gameEl       = document.getElementById('game');
const boardEl      = document.getElementById('board');
const roomCodeEl   = document.getElementById('room-code');
const joinInput    = document.getElementById('join-input');
const statusText   = document.getElementById('status-text');
const turnDot      = document.getElementById('turn-dot');
const turnLabel    = document.getElementById('turn-label');
const moveListEl   = document.getElementById('move-list');
const myNameEl     = document.getElementById('my-name');
const oppNameEl    = document.getElementById('opp-name');
const whiteRowEl   = document.getElementById('white-row');
const blackRowEl   = document.getElementById('black-row');
const toastEl      = document.getElementById('toast');
const gameoverEl   = document.getElementById('gameover-overlay');

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, duration=3000) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

// ── Board rendering ────────────────────────────────────────────────────────
function buildBoard() {
    boardEl.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            sq.className = 'sq ' + ((r+c)%2===0 ? 'light' : 'dark');
            sq.dataset.r = r;
            sq.dataset.c = c;
            sq.addEventListener('click', onSquareClick);
            boardEl.appendChild(sq);
        }
    }
}

function renderBoard() {
    const state = engine.getState();
    const inCheckColor = (state.status === 'check' || state.status === 'checkmate') ? state.turn : null;
    let kingCheckSq = null;
    if (inCheckColor) {
        for (let r=0;r<8;r++) for (let c=0;c<8;c++)
            if (state.board[r][c] === inCheckColor+'K') kingCheckSq = [r,c];
    }

    const sqs = boardEl.querySelectorAll('.sq');
    sqs.forEach(sq => {
        const r = +sq.dataset.r, c = +sq.dataset.c;
        // Base color
        const isLight = (r+c)%2===0;
        sq.className = 'sq ' + (isLight ? 'light' : 'dark');

        // Check highlight
        if (kingCheckSq && kingCheckSq[0]===r && kingCheckSq[1]===c)
            sq.classList.add('in-check');

        // Selected
        if (selected && selected[0]===r && selected[1]===c)
            sq.classList.add('selected');

        // Move targets
        const isTarget = validMoves.some(([mr,mc]) => mr===r && mc===c);
        if (isTarget) {
            if (state.board[r][c]) sq.classList.add('attack-target');
            else sq.classList.add('move-target');
        }

        // Piece
        const piece = state.board[r][c];
        if (piece) {
            const span = document.createElement('span');
            span.className = 'piece ' + (piece[0]==='w' ? 'white' : 'black');
            span.textContent = PIECES[piece];
            sq.innerHTML = '';
            sq.appendChild(span);
        } else {
            sq.innerHTML = '';
        }
    });
}

function renderBoardFlipped() {
    // For black player: show board from black's perspective
    const sqs = boardEl.querySelectorAll('.sq');
    // Reorder the grid visually by CSS transform if needed
    // Actually we handle this by flipping r,c during rendering
}

function flipBoardForBlack() {
    if (myColor === 'b') {
        boardEl.style.transform = 'rotate(180deg)';
        boardEl.querySelectorAll('.piece').forEach(p => p.style.transform = 'rotate(180deg)');
        // Update labels
        document.getElementById('files-top').style.transform = 'scaleX(-1)';
        document.getElementById('files-bottom').style.transform = 'scaleX(-1)';
        document.getElementById('ranks-left').style.transform = 'scaleY(-1)';
        document.getElementById('ranks-right').style.transform = 'scaleY(-1)';
    }
}

// ── Square click ───────────────────────────────────────────────────────────
function onSquareClick(e) {
    if (!gameActive) return;

    let r = +e.currentTarget.dataset.r;
    let c = +e.currentTarget.dataset.c;

    // If board is flipped (black's perspective), flip coords
    if (myColor === 'b' && !localMode) {
        r = 7 - r; c = 7 - c;
    }

    const state = engine.getState();

    // It's not my turn
    if (!localMode && state.turn !== myColor) {
        toast('상대방 차례입니다');
        return;
    }

    const pieceHere = state.board[r][c];

    if (selected) {
        // Try to move
        const isTarget = validMoves.some(([mr,mc]) => mr===r && mc===c);
        if (isTarget) {
            attemptMove(selected[0], selected[1], r, c);
            return;
        }
        // Select different own piece
        if (pieceHere && pieceHere[0] === state.turn) {
            selected = [r, c];
            validMoves = engine.legalMoves(r, c);
            renderBoard();
            if (myColor === 'b' && !localMode) applyPieceFlip();
            return;
        }
        // Deselect
        selected = null;
        validMoves = [];
        renderBoard();
        if (myColor === 'b' && !localMode) applyPieceFlip();
    } else {
        if (pieceHere && pieceHere[0] === state.turn) {
            selected = [r, c];
            validMoves = engine.legalMoves(r, c);
            renderBoard();
            if (myColor === 'b' && !localMode) applyPieceFlip();
        }
    }
}

function applyPieceFlip() {
    boardEl.querySelectorAll('.piece').forEach(p => p.style.transform = 'rotate(180deg)');
}

function attemptMove(fr, fc, tr, tc) {
    const piece = engine.pieceAt(fr, fc);
    // Pawn promotion?
    const isPromotion = piece[1] === 'P' && (tr === 0 || tr === 7);
    if (isPromotion) {
        pendingPromotion = { fr, fc, tr, tc };
        showPromotionModal(piece[0]);
        return;
    }
    executeMove(fr, fc, tr, tc);
}

function executeMove(fr, fc, tr, tc, promotion='Q') {
    const hist = engine.move(fr, fc, tr, tc, promotion);
    selected = null;
    validMoves = [];
    moveHistory.push(hist);

    renderBoard();
    if (myColor === 'b' && !localMode) applyPieceFlip();
    updateStatus();
    updateMoveList();
    updatePlayerRows();

    // Send to opponent
    if (isOnline && conn) {
        conn.send({ type: 'move', fr, fc, tr, tc, promotion });
    }

    checkGameOver();
}

// ── Promotion ──────────────────────────────────────────────────────────────
function showPromotionModal(color) {
    const modal = document.getElementById('promotion-modal');
    modal.classList.add('show');
    const pieces = ['Q','R','B','N'];
    const container = document.getElementById('promo-pieces');
    container.innerHTML = '';
    pieces.forEach(p => {
        const btn = document.createElement('div');
        btn.className = 'promo-piece';
        btn.textContent = PIECES[color+p];
        btn.title = p;
        btn.addEventListener('click', () => {
            modal.classList.remove('show');
            const { fr,fc,tr,tc } = pendingPromotion;
            pendingPromotion = null;
            executeMove(fr, fc, tr, tc, p);
        });
        container.appendChild(btn);
    });
}

// ── Status ─────────────────────────────────────────────────────────────────
function updateStatus() {
    const state = engine.getState();
    const turnName = state.turn === 'w' ? 'White' : 'Black';
    const msgs = {
        playing:   `${turnName}'s turn`,
        check:     `${turnName} is in CHECK`,
        checkmate: '',
        stalemate: 'Stalemate'
    };
    statusText.textContent = msgs[state.status] || '';
    turnDot.className = 'turn-dot ' + (state.turn==='w' ? 'white' : 'black');
    turnLabel.textContent = turnName;
}

function updateMoveList() {
    moveListEl.innerHTML = '';
    const hist = engine.history;
    for (let i = 0; i < hist.length; i += 2) {
        const pair = document.createElement('div');
        pair.className = 'move-pair';
        const num = document.createElement('span');
        num.className = 'move-num';
        num.textContent = (i/2+1) + '.';
        const m1 = document.createElement('span');
        m1.className = 'move-san';
        m1.textContent = moveSAN(hist[i]);
        pair.appendChild(num);
        pair.appendChild(m1);
        if (hist[i+1]) {
            const m2 = document.createElement('span');
            m2.className = 'move-san';
            m2.textContent = moveSAN(hist[i+1]);
            pair.appendChild(m2);
        }
        moveListEl.appendChild(pair);
    }
    moveListEl.scrollTop = moveListEl.scrollHeight;
}

function updatePlayerRows() {
    const state = engine.getState();
    whiteRowEl.classList.toggle('active', state.turn === 'w');
    blackRowEl.classList.toggle('active', state.turn === 'b');
}

function checkGameOver() {
    const state = engine.getState();
    if (state.status === 'checkmate' || state.status === 'stalemate') {
        gameActive = false;
        setTimeout(() => showGameOver(state.status), 600);
    }
}

function showGameOver(status) {
    const overlay = document.getElementById('gameover-overlay');
    const title   = document.getElementById('gameover-title');
    const sub     = document.getElementById('gameover-subtitle');
    const trophy  = document.getElementById('gameover-trophy');

    if (status === 'checkmate') {
        const winner = engine.turn === 'w' ? 'Black' : 'White'; // turn already switched
        title.textContent = winner + ' Wins!';
        sub.textContent   = 'Checkmate';
        trophy.textContent = winner === 'White' ? '♔' : '♚';
    } else {
        title.textContent  = 'Draw';
        sub.textContent    = 'Stalemate';
        trophy.textContent = '🤝';
    }
    overlay.classList.add('show');
}

// ── Networking (PeerJS) ────────────────────────────────────────────────────
function generateRoomCode() {
    return Math.random().toString(36).substr(2,6).toUpperCase();
}

function initPeer(id) {
    peer = new Peer(id, {
        host: '0.peerjs.com', port: 443, path: '/',
        secure: true,
        debug: 0
    });

    peer.on('error', err => {
        console.error(err);
        toast('연결 오류: ' + err.type);
    });
    return peer;
}

function handleConnection(c) {
    conn = c;
    conn.on('open', () => {
        isOnline = true;
        toast('상대방이 연결되었습니다!');
        startGame();
    });
    conn.on('data', onData);
    conn.on('close', () => {
        toast('상대방 연결이 끊어졌습니다');
        gameActive = false;
    });
}

function onData(data) {
    if (data.type === 'move') {
        const { fr, fc, tr, tc, promotion } = data;
        const hist = engine.move(fr, fc, tr, tc, promotion);
        selected = null;
        validMoves = [];
        moveHistory.push(hist);
        renderBoard();
        if (myColor === 'b') applyPieceFlip();
        updateStatus();
        updateMoveList();
        updatePlayerRows();
        checkGameOver();
    } else if (data.type === 'name') {
        const oppColor = myColor === 'w' ? 'b' : 'w';
        playerNames[oppColor] = data.name;
        updatePlayerDisplay();
    } else if (data.type === 'rematch') {
        if (confirm('상대방이 리매치를 요청합니다. 수락하시겠습니까?')) {
            sendData({ type: 'rematch-accept' });
            startNewGame();
        }
    } else if (data.type === 'rematch-accept') {
        startNewGame();
    }
}

function sendData(obj) {
    if (conn && conn.open) conn.send(obj);
}

// ── Lobby actions ──────────────────────────────────────────────────────────
window.createRoom = function() {
    const code = generateRoomCode();
    roomCodeEl.textContent = code;
    showWaiting();

    myColor = 'w';
    playerNames.w = 'Player 1';
    playerNames.b = 'Player 2';

    const p = initPeer(code);
    p.on('open', () => {
        p.on('connection', c => handleConnection(c));
    });
};

window.copyCode = function() {
    navigator.clipboard?.writeText(roomCodeEl.textContent)
        .then(() => toast('코드가 복사되었습니다'))
        .catch(() => toast(roomCodeEl.textContent));
};

window.joinRoom = function() {
    const code = joinInput.value.trim().toUpperCase();
    if (!code || code.length < 4) { toast('방 코드를 입력하세요'); return; }

    myColor = 'b';
    playerNames.w = 'Player 1';
    playerNames.b = 'Player 2';

    const p = initPeer();
    p.on('open', () => {
        const c = p.connect(code, { reliable: true });
        handleConnection(c);
        toast('연결 중...');
    });
    p.on('error', () => toast('방을 찾을 수 없습니다: ' + code));
};

window.playLocal = function() {
    localMode = true;
    myColor = 'w';
    playerNames.w = 'Player 1 (White)';
    playerNames.b = 'Player 2 (Black)';
    startGame();
};

// ── Game start ─────────────────────────────────────────────────────────────
function showWaiting() {
    lobbyEl.style.display = 'none';
    waitingEl.style.display = 'flex';
}

function startGame() {
    lobbyEl.style.display   = 'none';
    waitingEl.style.display = 'none';
    gameEl.style.display    = 'flex';
    gameActive = true;

    engine.reset();
    moveHistory = [];
    selected = null;
    validMoves = [];

    buildBoard();
    renderBoard();
    updateStatus();
    updateMoveList();
    updatePlayerDisplay();
    updatePlayerRows();

    if (myColor === 'b' && !localMode) {
        boardEl.style.transform = 'rotate(180deg)';
        applyPieceFlip();
        // flip labels
        try {
            document.getElementById('files-top').style.transform = 'scaleX(-1)';
            document.getElementById('files-bottom').style.transform = 'scaleX(-1)';
            document.getElementById('ranks-left').style.transform = 'scaleY(-1)';
            document.getElementById('ranks-right').style.transform = 'scaleY(-1)';
        } catch(e) {}
    }

    if (isOnline) {
        sendData({ type: 'name', name: playerNames[myColor] });
    }
}

function updatePlayerDisplay() {
    document.getElementById('white-name').textContent = playerNames.w;
    document.getElementById('black-name').textContent = playerNames.b;
    document.getElementById('white-you').style.display  = myColor==='w' ? 'inline' : 'none';
    document.getElementById('black-you').style.display  = myColor==='b' ? 'inline' : 'none';
}

function startNewGame() {
    gameoverEl.classList.remove('show');
    engine.reset();
    moveHistory = [];
    selected = null;
    validMoves = [];
    gameActive = true;
    buildBoard();
    renderBoard();
    updateStatus();
    updateMoveList();
    updatePlayerRows();
    if (myColor === 'b' && !localMode) applyPieceFlip();
}

// ── Buttons ────────────────────────────────────────────────────────────────
window.resignGame = function() {
    if (!gameActive) return;
    if (!confirm('정말 기권하시겠습니까?')) return;
    gameActive = false;
    const winner = myColor === 'w' ? 'Black' : 'White';
    document.getElementById('gameover-title').textContent = winner + ' Wins!';
    document.getElementById('gameover-subtitle').textContent = 'Resignation';
    document.getElementById('gameover-trophy').textContent = winner==='White' ? '♔' : '♚';
    gameoverEl.classList.add('show');
};

window.requestRematch = function() {
    gameoverEl.classList.remove('show');
    if (localMode) { startNewGame(); return; }
    sendData({ type: 'rematch' });
    toast('리매치 요청을 보냈습니다...');
};

window.goToLobby = function() {
    gameoverEl.classList.remove('show');
    gameEl.style.display = 'none';
    lobbyEl.style.display = 'flex';
    if (conn) { conn.close(); conn = null; }
    if (peer) { peer.destroy(); peer = null; }
    isOnline = false;
    localMode = false;
    myColor = null;
    boardEl.style.transform = '';
};

// ── Init ───────────────────────────────────────────────────────────────────
buildBoard();
