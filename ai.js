// Chess AI — Minimax with Alpha-Beta Pruning

const AI = (() => {

// ── Piece values ───────────────────────────────────────────────────────────
const VALUE = { P:100, N:320, B:330, R:500, Q:900, K:20000 };

// ── Piece-square tables (white's perspective, row 0 = rank 8) ─────────────
const PST = {
    P: [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [ 5,  5, 10, 25, 25, 10,  5,  5],
        [ 0,  0,  0, 20, 20,  0,  0,  0],
        [ 5, -5,-10,  0,  0,-10, -5,  5],
        [ 5, 10, 10,-20,-20, 10, 10,  5],
        [ 0,  0,  0,  0,  0,  0,  0,  0]
    ],
    N: [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
    ],
    B: [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
    ],
    R: [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [ 5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [ 0,  0,  0,  5,  5,  0,  0,  0]
    ],
    Q: [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [ -5,  0,  5,  5,  5,  5,  0, -5],
        [  0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
    ],
    K: [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [ 20, 20,  0,  0,  0,  0, 20, 20],
        [ 20, 30, 10,  0,  0, 10, 30, 20]
    ]
};

// ── Board evaluation ───────────────────────────────────────────────────────
function evaluate(engine) {
    if (engine.status === 'checkmate') {
        return engine.turn === 'b' ? 99999 : -99999; // white wins = positive
    }
    if (engine.status === 'stalemate') return 0;

    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = engine.board[r][c];
            if (!piece) continue;
            const col = piece[0], type = piece[1];
            const val = VALUE[type];
            const pstRow = col === 'w' ? r : 7 - r;
            const pst = PST[type] ? PST[type][pstRow][c] : 0;
            score += col === 'w' ? (val + pst) : -(val + pst);
        }
    }
    return score;
}

// ── Collect all moves for a color ──────────────────────────────────────────
function allMoves(engine, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (engine.colorAt(r, c) === color) {
                const legal = engine.legalMoves(r, c);
                for (const [tr, tc] of legal) {
                    moves.push({ fr:r, fc:c, tr, tc });
                }
            }
        }
    }
    return moves;
}

// Move ordering: captures first (improves alpha-beta pruning)
function orderMoves(moves, engine) {
    return moves.sort((a, b) => {
        const capA = engine.board[a.tr][a.tc] ? VALUE[engine.board[a.tr][a.tc][1]] || 0 : 0;
        const capB = engine.board[b.tr][b.tc] ? VALUE[engine.board[b.tr][b.tc][1]] || 0 : 0;
        return capB - capA;
    });
}

// ── Minimax with alpha-beta pruning ───────────────────────────────────────
function minimax(engine, depth, alpha, beta, maximizing) {
    if (depth === 0 || engine.status === 'checkmate' || engine.status === 'stalemate') {
        return evaluate(engine);
    }

    const color = maximizing ? 'w' : 'b';
    const moves = orderMoves(allMoves(engine, color), engine);

    if (moves.length === 0) return evaluate(engine);

    if (maximizing) {
        let best = -Infinity;
        for (const { fr, fc, tr, tc } of moves) {
            // Save state
            const savedBoard    = engine.board.map(row => [...row]);
            const savedTurn     = engine.turn;
            const savedEP       = engine.enPassant;
            const savedCastle   = {...engine.castling};
            const savedStatus   = engine.status;
            const savedHistory  = [...engine.history];

            engine.move(fr, fc, tr, tc);
            const val = minimax(engine, depth - 1, alpha, beta, false);

            // Restore state
            engine.board    = savedBoard;
            engine.turn     = savedTurn;
            engine.enPassant = savedEP;
            engine.castling = savedCastle;
            engine.status   = savedStatus;
            engine.history  = savedHistory;

            best = Math.max(best, val);
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const { fr, fc, tr, tc } of moves) {
            const savedBoard    = engine.board.map(row => [...row]);
            const savedTurn     = engine.turn;
            const savedEP       = engine.enPassant;
            const savedCastle   = {...engine.castling};
            const savedStatus   = engine.status;
            const savedHistory  = [...engine.history];

            engine.move(fr, fc, tr, tc);
            const val = minimax(engine, depth - 1, alpha, beta, true);

            engine.board    = savedBoard;
            engine.turn     = savedTurn;
            engine.enPassant = savedEP;
            engine.castling = savedCastle;
            engine.status   = savedStatus;
            engine.history  = savedHistory;

            best = Math.min(best, val);
            beta = Math.min(beta, best);
            if (beta <= alpha) break;
        }
        return best;
    }
}

// ── Public: get best move for AI (plays as black) ─────────────────────────
function getBestMove(engine, depth = 3) {
    const moves = orderMoves(allMoves(engine, 'b'), engine);
    if (moves.length === 0) return null;

    let bestMove = null;
    let bestVal = Infinity;

    for (const move of moves) {
        const savedBoard   = engine.board.map(row => [...row]);
        const savedTurn    = engine.turn;
        const savedEP      = engine.enPassant;
        const savedCastle  = {...engine.castling};
        const savedStatus  = engine.status;
        const savedHistory = [...engine.history];

        engine.move(move.fr, move.fc, move.tr, move.tc);
        const val = minimax(engine, depth - 1, -Infinity, Infinity, true);

        engine.board    = savedBoard;
        engine.turn     = savedTurn;
        engine.enPassant = savedEP;
        engine.castling = savedCastle;
        engine.status   = savedStatus;
        engine.history  = savedHistory;

        if (val < bestVal) {
            bestVal = val;
            bestMove = move;
        }
    }
    return bestMove;
}

return { getBestMove };
})();
