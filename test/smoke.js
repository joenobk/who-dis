// End-to-end socket smoke test for the free-form flow: create/join, ask/answer,
// manual flips, woke mode, bot match with judge answers.
//
// Deterministic by design: the bot answers must come from the BUILT-IN judge,
// never the optional LLM API (a real call can take 30s+ and exceeds the 9s
// abort timeout, which would make these waits fail). Clear the env vars BEFORE
// requiring the server — server.js's .env loader only fills undefined vars, so
// these stay empty and llmEnabled() returns false.
process.env.LLM_API_URL = '';
process.env.LLM_API_KEY = '';

const { io } = require('socket.io-client');
const { server } = require('../server');

const PORT = 4391;
let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.error('FAIL:', msg); } else console.log('ok  ', msg); }

function connectClient() {
  return new Promise((resolve, reject) => {
    const s = io('http://127.0.0.1:' + PORT, { transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}
function emitAck(s, evt, payload) {
  return new Promise((resolve) => s.emit(evt, payload, (res) => resolve(res)));
}
function makeCollector(s, events) {
  const buf = {}; const waiters = {};
  for (const ev of events) {
    buf[ev] = [];
    s.on(ev, (d) => {
      if (waiters[ev] && waiters[ev].length) waiters[ev].shift()(d);
      else buf[ev].push(d);
    });
  }
  return function take(evt, timeout = 3000) {
    return new Promise((resolve, reject) => {
      if (buf[evt].length) return resolve(buf[evt].shift());
      const t = setTimeout(() => reject(new Error('timeout waiting for ' + evt)), timeout);
      waiters[evt] = waiters[evt] || [];
      waiters[evt].push((d) => { clearTimeout(t); resolve(d); });
    });
  };
}
const BOT_WAIT = 12000; // bot moves are async + scheduled (600-1400ms) — be generous under CI load
async function waitFor(s, type, predicate, take, timeout = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const remaining = timeout - (Date.now() - t0);
    const ev = await take(type, Math.max(500, remaining)).catch(() => null);
    if (!ev) break;
    if (predicate(ev)) return ev;
  }
  return null;
}
function waitBot(type, predicate, take, timeout) {
  return waitFor(undefined, type, predicate, take, timeout || BOT_WAIT);
}

(async () => {
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  // ---- bot match: free-form ask + judge answer + bot structured ask
  {
    const a = await connectClient();
    const take = makeCollector(a, ['game:start', 'game:event']);
    const res = await emitAck(a, 'botMatch', { name: 'Tester', playerId: 'tester-1', packId: 'sweden', woke: true });
    check(res && res.ok, 'botMatch creates woked room');
    const start = await take('game:start');
    check(start && start.board.length === 20 && start.woke === true, 'bot game:start woked, 20 cards');
    check(start.board.every(c => c.identity && c.identity.length > 0), 'board cards carry identity');
    check(start.flips && Array.isArray(start.flips), 'start carries flips array');

    // human free-form ask
    const askAck = await emitAck(a, 'game:ask', { text: 'is your person a woman?' });
    check(askAck && askAck.ok, 'human free-form ask OK');

        // bot turn broadcasts a 'thinking' event (client shows rotating slogans)
        const thinkEvt = await waitFor(a, 'game:event', e => e.type === 'thinking', take);
        check(!!thinkEvt, 'bot turn broadcasts thinking event (slogans)');

    // bot answers (judge) then asks its own structured question
    const answerEvt = await waitFor(a, 'game:event', e => e.type === 'answer' && e.text && typeof e.answer === 'boolean', take);
    check(answerEvt, 'bot answers the free-form question (judge)');
    const askEvt = await waitFor(a, 'game:event', e => e.type === 'ask' && e.by === 1, take);
    check(askEvt && askEvt.phrase && askEvt.attr, 'bot asks a phrased structured question with attr/value');

    // human answers the bot's question — flips should be pending for human now
    const ansRes = await emitAck(a, 'game:answer', { yes: true });
    check(ansRes && ansRes.ok, 'human answers bot question');
    check(typeof ansRes.text === 'string' && typeof ansRes.answer === 'boolean', 'answer ack carries text+answer');

        // TURN MODEL: answering earns the next ask — so it's the HUMAN's turn now.
        // This is THE regression that was the "bot keeps asking, never my turn" bug.
        const askAgain = await emitAck(a, 'game:ask', { text: 'second question — do they wear glasses?' });
        check(askAgain && askAgain.ok, 'human can ask again after answering (answerer earns next turn)');

                // bot answers Q2, then asks its own question (bot's turn after answering)
                const ansQ2 = await waitFor(a, 'game:event', e => e.type === 'answer' && e.text === 'second question — do they wear glasses?', take, BOT_WAIT);
                check(!!ansQ2 && (typeof ansQ2.answer === 'boolean' || ansQ2.answer === null), 'bot answers Q2 (yes/no/dont-know)');
                const botAsk2 = await waitFor(a, 'game:event', e => e.type === 'ask' && e.by === 1, take, BOT_WAIT);
                check(!!botAsk2, 'bot asks its question after answering Q2');

                // human must answer the bot's pending question before anything else
                const blockedStill = await emitAck(a, 'game:ask', { text: 'one too many?' });
                check(blockedStill && blockedStill.ok === false, 'cannot ask while a question is pending');
                const ansBQ2 = await emitAck(a, 'game:answer', { yes: false });
                check(ansBQ2 && ansBQ2.ok, 'human answers bot Q2 → earns next turn');

                // then ask Q3 ("balding?") — bot may answer yes/no OR "don't know" (null)
                const askQ3 = await emitAck(a, 'game:ask', { text: 'is your person balding?' });
                check(askQ3 && askQ3.ok, 'human asks Q3 after answering');
                const botAnsQ3 = await waitFor(a, 'game:event', e => e.type === 'answer' && e.text === 'is your person balding?', take, BOT_WAIT);
                check(!!botAnsQ3 && (typeof botAnsQ3.answer === 'boolean' || botAnsQ3.answer === null), 'bot can answer yes/no/dont-know');

                // end game 1: bot has the turn (it answers → its turn) and asks; answer it,
                // then make a losing guess so the match reaches 'over'
                const botAsk3 = await waitFor(a, 'game:event', e => e.type === 'ask' && e.by === 1, take, BOT_WAIT);
                check(!!botAsk3, 'bot asks after Q3');
                const ansBQ3 = await emitAck(a, 'game:answer', { yes: true });
                check(ansBQ3 && ansBQ3.ok, 'human answers bot Q3 → earns next turn');
                const loseGuess = await emitAck(a, 'game:guess', { id: 0 });
                check(loseGuess && loseGuess.ok && loseGuess.correct === false, 'human loses game 1 on purpose');
                const over1 = await waitFor(a, 'game:event', e => e.type === 'over', take, BOT_WAIT);
                                check(!!over1, 'game 1 reaches over');
                                // regression: revealed person must be the card the final GUESSER
                                // was trying to identify — here the human guessed wrong, so the
                                // reveal is the BOT's held card, NEVER the human's own held card
                                check(typeof over1.guessedBy === 'number' && over1.guessedBy === 0, 'over includes guessedBy = human (0)');
                                const humanHeld = start ? start.targetId : -1;
                                check(over1.targetId !== undefined && over1.targetId !== humanHeld, 'reveal is NOT the human\'s own held card (bot\'s person)');

        // invalid flows
        const badAsk = await emitAck(a, 'game:ask', { text: '' });
        check(badAsk && badAsk.ok === false, 'empty question rejected');

        // ---- REMATCH: the second game must fully restart and stay clean
                // (regression: stale bot steps / double 'over' after rematch)
                const rematch = await emitAck(a, 'game:rematch', {});
                check(rematch && rematch.ok, 'bot rematch accepted');
                const start2 = await waitFor(a, 'game:event', e => e.type === 'ask' || e.type === 'turn', take, BOT_WAIT).catch(() => null);
                check(!!start2, 'second game produces events (not stuck/over)');
        // play two turns in the second game (ask → bot answers → our turn → ask → ...)
        const a2 = await emitAck(a, 'game:ask', { text: 'is your person female?' });
        check(a2 && a2.ok, 'second game: ask works');
        const ans2e = await waitFor(a, 'game:event', e => e.type === 'answer' && e.text === 'is your person female?', take, BOT_WAIT);
        check(!!ans2e && typeof ans2e.answer === 'boolean', 'second game: bot answers');
        const ask2e = await waitFor(a, 'game:event', e => e.type === 'ask' && e.by === 1, take, BOT_WAIT);
        check(!!ask2e, 'second game: bot asks back');
        const a2b = await emitAck(a, 'game:answer', { yes: false });
        check(a2b && a2b.ok, 'second game: answer works');

        // state recovery endpoint
        const sync = await emitAck(a, 'game:sync', {});
        check(sync && sync.ok && typeof sync.turn === 'number' && Array.isArray(sync.flips), 'game:sync returns turn+pending+flips');
        a.close();
          }

  // ---- human vs human: full free-form match
  {
    const h1 = await connectClient();
    const h2 = await connectClient();
    const take1 = makeCollector(h1, ['lobby:update', 'game:start', 'game:event']);
    const take2 = makeCollector(h2, ['game:start', 'game:event']);
    const r1 = await emitAck(h1, 'create', { name: 'Alice', playerId: 'p-alice', packId: 'global', woke: true });
    check(r1.ok, 'host creates woked room (' + r1.code + ')');
    const r2 = await emitAck(h2, 'join', { code: r1.code, name: 'Bob', playerId: 'p-bob' });
    check(r2.ok && r2.seat === 1, 'guest joins as seat 1');

    let lobby1 = await take1('lobby:update');
    while (lobby1.players.length < 2) lobby1 = await take1('lobby:update');
    check(lobby1.players.length === 2 && lobby1.woke === true, 'lobby shows two players + woke flag');

    const startR = await emitAck(h1, 'lobby:start', {});
    check(startR.ok, 'host starts match');
    const g1 = await take1('game:start');
    const g2 = await take2('game:start');
    check(g1.board.length === 20 && g2.board.length === 20, 'both receive board');
    check(g1.woke === true && g1.flips.length === 0, 'woked game with empty flips');

    // h1 asks free-form
    const ack1 = await emitAck(h1, 'game:ask', { text: 'does your person have a beard?' });
    check(ack1.ok, 'h1 free-form ask accepted');
    // h2 sees ask, must answer first
    const askEvt = await waitFor(h2, 'game:event', e => e.type === 'ask' && e.by === 0, take2);
    check(askEvt && askEvt.text === 'does your person have a beard?', 'h2 sees ask event with text');
    // h2 cannot ask while pending
    const blocked = await emitAck(h2, 'game:ask', { text: 'skipping? no' });
    check(blocked.ok === false, 'h2 cannot ask before answering');
    // h2 answers
        const ansAck = await emitAck(h2, 'game:answer', { yes: false });
        check(ansAck.ok && ansAck.answer === false && ansAck.from === 0, 'h2 answers h1 (no)');
        const ansEvt = await waitFor(h1, 'game:event', e => e.type === 'answer' && e.from === 0, take1, 4000);
        check(ansEvt && ansEvt.answer === false && ansEvt.text, 'h1 receives typed answer event');
        // TURN MODEL: answering earns the next ask — so it's h2's turn now
        const ack2 = await emitAck(h2, 'game:ask', { text: 'is your person a woman?' });
        check(ack2.ok, 'answerer earns next ask (h2 can ask right after answering)');
        // h1 answers h2 -> turn back to h1
        const ans2 = await emitAck(h1, 'game:answer', { yes: true });
        check(ans2.ok, 'h1 answers h2');
        // h1 can flip manually on its returned turn
        const idToFlip = g1.board[0].id;
        const flipRes = await emitAck(h1, 'game:flip', { ids: g1.board.slice(1).map(c => c.id) });
        check(flipRes.ok && flipRes.flips.length === 19, 'h1 persists manual flips (19)');
        // h1 asks again -> h2 answers -> h2's turn -> h2 passes -> h1 guesses (loses)
        const ack3 = await emitAck(h1, 'game:ask', { text: 'are their earlobes attached?' });
        check(ack3.ok, 'h1 asks again after answering (alternation works)');
        const ans3 = await emitAck(h2, 'game:answer', { yes: true });
        check(ans3.ok && ans3.answer === true, 'h2 answers h1 (yes)');
        const pass2 = await emitAck(h2, 'game:pass', {});
        check(pass2.ok, 'h2 passes');
        const wrongGuess = await emitAck(h1, 'game:guess', { id: idToFlip });
        check(wrongGuess.ok === true && wrongGuess.correct === false, 'wrong guess ends match');
        const over = await waitFor(h1, 'game:event', e => e.type === 'over', take1, 5000);
        check(over && over.winner === 1 && over.woke === true, 'game over, winner h2, woke bonus flag');
        check(typeof over.winnerPts === 'number', 'points awarded');

        h1.close(); h2.close();
      }

  // ---- woked board has identity variety
  {
    const { genBoard } = require('../lib/packs');
    const basic = genBoard('global', 20, 5, false);
    const woke = genBoard('global', 20, 5, true);
    check(basic.every(c => c.identity === (c.gender === 'female' ? 'woman' : 'man')), 'basic board identity is consistent');
    const variety = new Set(woke.map(c => c.identity));
    check(variety.size > 2, 'woked board has identity variety (' + variety.size + ' labels)');
  }

  server.close();
  console.log(failures === 0 ? '\nSMOKE TEST PASSED' : '\n' + failures + ' FAILURE(S)');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });