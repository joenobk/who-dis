// Who Dis? — match engine: board, targets, free-form questions, flips, guesses, bot AI.
const { VOCAB, PACK_MAP, genBoard, featureMatches, mulberry32 } = require('./packs');
const { judgeQuestion, botPhrase } = require('./judge');

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Match {
  // seats: [{kind: 'human'|'bot', name}]
  constructor({ packId, seats, seed = Math.floor(Math.random() * 2 ** 31), botLevel = 'hard', woke = false }) {
    if (seats.length !== 2) throw new Error('Match requires exactly 2 seats');
    this.packId = packId;
    this.pack = PACK_MAP[packId];
        this.gen = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); // unique per match
    this.seats = seats.map((s, i) => ({ seat: i, ...s }));
    this.seed = seed;
    this.woke = !!woke;
    this.board = genBoard(packId, 20, seed, this.woke);
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const targetOrder = shuffle(rng, this.board.map(c => c.id));
    this.targets = [targetOrder[0], targetOrder[1]];
    this.flips = [new Set(), new Set()];   // per-seat eliminated cards (set by the seat itself)
    this.history = [[], []];               // per-seat question log: { text, answer, by }
    this.pending = null;                   // { from, text } — incoming question awaiting an answer
    this.lastBotAsk = null;                // { attr, value } — bot's last structured question
    this.lastGuess = null;                 // { by, name, correct } — final guess of the match
    this.turn = 0;
    this.state = 'playing';
    this.winner = null;
    this.botLevel = botLevel;
    this.turnCount = 0;
        this.turnStartedAt = Date.now();   // when the current turn began (for timers/watchdogs)
        this._overrideAnswer = null;       // optional pre-judged answer for the bot (AI judge)
        this._overrideAsk = null;          // optional AI-chosen question { attr, value, phrase }
      }

  // ---------------------------------------------------------------- reads
  cardById(id) { return this.board.find(c => c.id === id); }

  cardsForSeat(seat) {
    return this.board.map(c => ({ id: c.id, name: c.name, ...Object.fromEntries(VOCAB.map(v => [v.key, c[v.key]])) }));
  }

  candidates(seat) {
    return this.board.filter(c => !this.flips[seat].has(c.id));
  }

  setFlips(seat, ids) { this.flips[seat] = new Set((ids || []).map(Number)); }

  // Server-driven auto-elimination for a seat (used by the optional AI eliminator).
  // Add-only: never resurrects already-eliminated cards.
  autoEliminate(seat, attr, value, answer) {
    const flipped = [];
    for (const c of this.board) {
      if (!this.flips[seat].has(c.id) && (c[attr] === value) !== !!answer) {
        this.flips[seat].add(c.id);
        flipped.push(c.id);
      }
    }
    return flipped;
  }

  // ---------------------------------------------------------------- actions
  ask(seat, text) {
    if (this.state !== 'playing') return { ok: false, error: 'Match is over.' };
    if (seat !== this.turn) return { ok: false, error: 'Not your turn.' };
    if (this.seats[seat].kind === 'bot') return { ok: false, error: 'Not available.' };
    if (this.pending) return { ok: false, error: 'Answer the incoming question first.' };
    text = String(text || '').trim().slice(0, 240);
    if (!text) return { ok: false, error: 'Ask a question.' };
    this.pending = { from: seat, text };
    this.turn = 1 - seat;
    this.turnCount++;
        this.turnStartedAt = Date.now();
        return { ok: true };
      }

  answer(seat, yes) {
    if (this.state !== 'playing') return { ok: false, error: 'Match is over.' };
    if (seat !== this.turn) return { ok: false, error: 'Not your turn.' };
    if (!this.pending) return { ok: false, error: 'Nothing to answer.' };
    if (this.pending.from === seat) return { ok: false, error: 'Not addressed to you.' };
    if (this.seats[seat].kind === 'bot') return { ok: false, error: 'Bot answers automatically.' };
    const q = this.pending;
    this.pending = null;
        const ans = yes === null ? null : !!yes;   // null = "don't know" (no info gained)
        this.history[q.from].push({ text: q.text, answer: ans, by: q.from });
        // if the bot asked and we gave a real answer, the bot eliminates on its own board
        if (this.seats[q.from].kind === 'bot' && this.lastBotAsk && ans !== null) {
          const { attr, value } = this.lastBotAsk;
          for (const c of this.board) {
            if (featureMatches(c, attr, value) !== ans) this.flips[q.from].add(c.id);
          }
        }
        this.turn = seat;     // answering earns you the next ask (Guess Who turn model!)
        this.turnStartedAt = Date.now();
        return { ok: true, text: q.text, answer: ans, from: q.from };
      }

  pass(seat) {
    if (this.state !== 'playing') return { ok: false, error: 'Match is over.' };
    if (seat !== this.turn) return { ok: false, error: 'Not your turn.' };
    if (this.pending) return { ok: false, error: 'Answer the incoming question first.' };
    if (this.seats[seat].kind === 'bot') return { ok: false, error: 'Not available.' };
    this.turn = 1 - seat;
    this.turnCount++;
        this.turnStartedAt = Date.now();
        return { ok: true };
      }

  guess(seat, cardId) {
    if (this.state !== 'playing') return { ok: false, error: 'Match is over.' };
    if (seat !== this.turn) return { ok: false, error: 'Not your turn.' };
    if (!this.cardById(cardId)) return { ok: false, error: 'Unknown card.' };
    const targetCard = this.cardById(this.targets[1 - seat]);
    const correct = cardId === targetCard.id;
    this.lastGuess = { by: seat, name: this.cardById(cardId).name, correct };
    this.state = 'over';
    this.winner = correct ? seat : 1 - seat;
    return {
      ok: true,
      correct,
      targetId: targetCard.id,
      targetName: targetCard.name,
      winner: this.winner,
      guessedName: this.cardById(cardId).name
    };
  }

  // ---------------------------------------------------------------- bot
  isBotTurn() {
    return this.state === 'playing' && this.seats[this.turn].kind === 'bot';
  }

  botChooseQuestion() {
    const seat = this.turn;
    const cands = this.candidates(seat);
    const n = cands.length;
    if (n <= 0) return null;
    let best = null;
    let bestScore = Infinity;
    for (const attr of VOCAB) {
      const k2 = attr.key;
      // attribute must vary among candidates to be informative
      const firstVal = cands[0][k2];
      let varies = false;
      for (const c of cands) if (c[k2] !== firstVal) { varies = true; break; }
      if (!varies) continue;
      const counts = {};
      for (const c of cands) counts[c[k2]] = (counts[c[k2]] || 0) + 1;
      const vals = Object.keys(counts).filter(k => counts[k] > 0 && counts[k] < n);
      for (const val of vals) {
        const k = counts[val];
        const score = (k * k + (n - k) * (n - k)) / n;
        if (score < bestScore) { bestScore = score; best = { attr: k2, value: val }; }
      }
    }
    return best;
  }

  /**
   * Run the bot's turn. Returns an array of events to broadcast:
   *   1. answer the human's incoming free-form question (judged)
   *   2. then ask a structured question (or guess)
   */
  botStep() {
    if (!this.isBotTurn()) return null;
    const seat = this.turn;
    const events = [];

    // (1) answer the human's free-form question
    if (this.pending && this.pending.from !== seat) {
      const q = this.pending;
      this.pending = null;
      const target = this.cardById(this.targets[1 - seat]);
          let judged;
          if (this._overrideAnswer && this._overrideAnswer.for === q.from) {
            judged = this._overrideAnswer.res;
            this._overrideAnswer = null;
          } else {
            judged = judgeQuestion(q.text, target, mulberry32((this.seed ^ 0x5f356495 + this.turnCount) >>> 0));
          }
          const ans = judged.answer == null ? null : !!judged.answer;
          this.history[q.from].push({ text: q.text, answer: ans, by: q.from });
          // if the bot asked this question, it now eliminates on its own board
          if (this.seats[q.from].kind === 'bot' && this.lastBotAsk && ans !== null) {
            const { attr, value } = this.lastBotAsk;
            for (const c of this.board) {
              if (featureMatches(c, attr, value) !== ans) this.flips[q.from].add(c.id);
            }
          }
          events.push({ type: 'answer', by: q.from, text: q.text, answer: ans, note: judged.note });
        }

    // (2) ask / guess
    const cands = this.candidates(seat);
    if (cands.length === 1) {
      const res = this.guess(seat, cands[0].id);
      events.push({ type: 'guess', by: seat, ...res });
    } else {
      let q = null;
      if (this._overrideAsk && this.candidates(seat).some(c => c[this._overrideAsk.attr] !== cands[0][this._overrideAsk.attr])) {
                q = this._overrideAsk;   // AI-chosen question still informative
      } else {
                q = this.botChooseQuestion();
      }
      this._overrideAsk = null;
      if (!q) {
                const res = this.guess(seat, cands[Math.floor(Math.random() * cands.length)].id);
                events.push({ type: 'guess', by: seat, ...res });
      } else {
                this.lastBotAsk = { attr: q.attr, value: q.value };
                const rng = mulberry32((this.seed ^ 0xc2b2ae35 + this.turnCount) >>> 0);
                const phrase = q.phrase || botPhrase(q.attr, q.value, rng);
                this.pending = { from: seat, text: phrase };
                this.turn = 1 - seat;
                this.turnCount++;
                this.turnStartedAt = Date.now();
                events.push({ type: 'ask', by: seat, attr: q.attr, value: q.value, phrase, turn: this.turn });
      }
    }
    return events.length ? events : null;
  }
}

module.exports = { Match };