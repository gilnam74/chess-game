// Chess Game Engine - Complete chess rules implementation

class ChessEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.board = [
            ['bR','bN','bB','bQ','bK','bB','bN','bR'],
            ['bP','bP','bP','bP','bP','bP','bP','bP'],
            ['','','','','','','',''],
            ['','','','','','','',''],
            ['','','','','','','',''],
            ['','','','','','','',''],
            ['wP','wP','wP','wP','wP','wP','wP','wP'],
            ['wR','wN','wB','wQ','wK','wB','wN','wR']
        ];
        this.turn = 'w';
        this.enPassant = null;
        this.castling = { wK: true, wQ: true, bK: true, bQ: true };
        this.history = [];
        this.status = 'playing'; // 'playing','check','checkmate','stalemate'
        this.halfMoves = 0;
    }

    pieceAt(r, c) { return this.board[r][c] || ''; }
    colorAt(r, c) { return this.board[r][c] ? this.board[r][c][0] : null; }
    typeAt(r, c)  { return this.board[r][c] ? this.board[r][c][1] : null; }
    inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

    // Pseudo-legal moves (ignores check)
    pseudoMoves(r, c) {
        const piece = this.board[r][c];
        if (!piece) return [];
        const col = piece[0], type = piece[1];
        const moves = [];

        const push = (tr, tc) => {
            if (this.inBounds(tr, tc) && this.colorAt(tr, tc) !== col)
                moves.push([tr, tc]);
        };

        const slide = (dr, dc) => {
            let nr = r + dr, nc = c + dc;
            while (this.inBounds(nr, nc)) {
                if (this.board[nr][nc]) {
                    if (this.colorAt(nr, nc) !== col) moves.push([nr, nc]);
                    break;
                }
                moves.push([nr, nc]);
                nr += dr; nc += dc;
            }
        };

        switch (type) {
            case 'P': {
                const dir = col === 'w' ? -1 : 1;
                const startRow = col === 'w' ? 6 : 1;
                // Forward
                if (this.inBounds(r+dir, c) && !this.board[r+dir][c]) {
                    moves.push([r+dir, c]);
                    if (r === startRow && !this.board[r+2*dir][c])
                        moves.push([r+2*dir, c]);
                }
                // Captures
                for (const dc of [-1, 1]) {
                    const nr = r+dir, nc = c+dc;
                    if (!this.inBounds(nr, nc)) continue;
                    if (this.board[nr][nc] && this.colorAt(nr, nc) !== col)
                        moves.push([nr, nc]);
                    if (this.enPassant && this.enPassant[0]===nr && this.enPassant[1]===nc)
                        moves.push([nr, nc]);
                }
                break;
            }
            case 'N':
                for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
                    push(r+dr, c+dc);
                break;
            case 'B':
                for (const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) slide(dr,dc);
                break;
            case 'R':
                for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]) slide(dr,dc);
                break;
            case 'Q':
                for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) slide(dr,dc);
                break;
            case 'K':
                for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]])
                    push(r+dr, c+dc);
                // Castling
                const row = col === 'w' ? 7 : 0;
                if (r === row && c === 4) {
                    if (col==='w' && this.castling.wK && !this.board[row][5] && !this.board[row][6])
                        moves.push([row, 6]);
                    if (col==='w' && this.castling.wQ && !this.board[row][3] && !this.board[row][2] && !this.board[row][1])
                        moves.push([row, 2]);
                    if (col==='b' && this.castling.bK && !this.board[row][5] && !this.board[row][6])
                        moves.push([row, 6]);
                    if (col==='b' && this.castling.bQ && !this.board[row][3] && !this.board[row][2] && !this.board[row][1])
                        moves.push([row, 2]);
                }
                break;
        }
        return moves;
    }

    isInCheck(color) {
        let kr = -1, kc = -1;
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++)
                if (this.board[r][c] === color+'K') { kr=r; kc=c; }
        if (kr === -1) return false;

        const enemy = color === 'w' ? 'b' : 'w';
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++)
                if (this.colorAt(r,c) === enemy)
                    if (this.pseudoMoves(r,c).some(([mr,mc]) => mr===kr && mc===kc))
                        return true;
        return false;
    }

    // Simulate move and check if color's king is in check
    wouldBeInCheck(fr, fc, tr, tc, color) {
        const saved = this.board.map(row => [...row]);
        const savedEP = this.enPassant;

        // En passant capture
        if (this.typeAt(fr,fc)==='P' && tc!==fc && !this.board[tr][tc]) {
            const captRow = color==='w' ? tr+1 : tr-1;
            this.board[captRow][tc] = '';
        }
        this.board[tr][tc] = this.board[fr][fc];
        this.board[fr][fc] = '';

        const inCheck = this.isInCheck(color);
        this.board = saved;
        this.enPassant = savedEP;
        return inCheck;
    }

    legalMoves(r, c) {
        const col = this.colorAt(r, c);
        if (!col) return [];
        const pseudo = this.pseudoMoves(r, c);

        return pseudo.filter(([tr, tc]) => {
            // Castling: king can't be in check, can't pass through check
            if (this.typeAt(r,c) === 'K' && Math.abs(tc - c) === 2) {
                if (this.isInCheck(col)) return false;
                const passCol = tc > c ? c+1 : c-1;
                const row = col==='w' ? 7 : 0;
                if (this.wouldBeInCheck(r, c, row, passCol, col)) return false;
            }
            return !this.wouldBeInCheck(r, c, tr, tc, col);
        });
    }

    hasAnyLegalMoves(color) {
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++)
                if (this.colorAt(r,c) === color && this.legalMoves(r,c).length > 0)
                    return true;
        return false;
    }

    move(fr, fc, tr, tc, promotion='Q') {
        const piece = this.board[fr][fc];
        const col = piece[0], type = piece[1];

        const hist = {
            from:[fr,fc], to:[tr,tc], piece,
            captured: this.board[tr][tc],
            castlingBefore: {...this.castling},
            enPassantBefore: this.enPassant,
            promotion: null,
            enPassantCapture: null
        };

        // En passant
        if (type==='P' && tc!==fc && !this.board[tr][tc]) {
            const capRow = col==='w' ? tr+1 : tr-1;
            hist.enPassantCapture = [capRow, tc];
            hist.capturedEP = this.board[capRow][tc];
            this.board[capRow][tc] = '';
        }

        // Castling rook move
        if (type==='K') {
            const row = col==='w' ? 7 : 0;
            if (fc===4 && tc===6) { this.board[row][5]=this.board[row][7]; this.board[row][7]=''; }
            if (fc===4 && tc===2) { this.board[row][3]=this.board[row][0]; this.board[row][0]=''; }
        }

        this.board[tr][tc] = piece;
        this.board[fr][fc] = '';

        // Pawn promotion
        if (type==='P' && (tr===0 || tr===7)) {
            this.board[tr][tc] = col + promotion;
            hist.promotion = promotion;
        }

        // Update en passant
        this.enPassant = (type==='P' && Math.abs(tr-fr)===2) ? [(fr+tr)/2, fc] : null;

        // Update castling rights
        if (type==='K') {
            if (col==='w') { this.castling.wK=false; this.castling.wQ=false; }
            else           { this.castling.bK=false; this.castling.bQ=false; }
        }
        if (type==='R' || hist.captured?.includes('R')) {
            if (fr===7&&fc===7) this.castling.wK=false;
            if (fr===7&&fc===0) this.castling.wQ=false;
            if (fr===0&&fc===7) this.castling.bK=false;
            if (fr===0&&fc===0) this.castling.bQ=false;
        }

        this.turn = col==='w' ? 'b' : 'w';
        this.history.push(hist);
        this.updateStatus();
        return hist;
    }

    updateStatus() {
        const col = this.turn;
        if (!this.hasAnyLegalMoves(col)) {
            this.status = this.isInCheck(col) ? 'checkmate' : 'stalemate';
        } else {
            this.status = this.isInCheck(col) ? 'check' : 'playing';
        }
    }

    getState() {
        return {
            board: this.board.map(r => [...r]),
            turn: this.turn,
            enPassant: this.enPassant,
            castling: {...this.castling},
            status: this.status
        };
    }
}
