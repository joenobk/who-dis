// Engine simulation: pack generation, identity/woke, judge, free-form flow, bot games.
const { Match } = require('../lib/engine');
const { PACKS, genBoard, VOCAB } = require('../lib/packs');
const { judgeQuestion } = require('../lib/judge');
const { mulberry32 } = require('../lib/packs');

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error('FAIL:', msg); }
  else console.log('ok  ', msg);
}

// 1. every pack generates a valid board (basic + woke)
for (const pack of PACKS) {
  for (const woke of [false, true]) {
    const board = genBoard(pack.id, 20, 12345, woke);
    check(board.length === 20, `${pack.id}${woke ? '/woke' : ''}: 20 cards`);
    check(new Set(board.map(c => c.name)).size === 20, `${pack.id}${woke ? '/woke' : ''}: unique names`);
    check(board.every(c => VOCAB.every(v => v.values.includes(c[v.key]))), `${pack.id}${woke ? '/woke' : ''}: all features+identity valid`);
    check(board.every(c => c.gender === 'male' || c.gender === 'female'), `${pack.id}${woke ? '/woke' : ''}: valid gender`);
    check(board.every(c => c.gender !== 'female' || c.facialHair === 'none'), `${pack.id}${woke ? '/woke' : ''}: no facial hair on female render`);
    check(board.every(c => c.gender !== 'male' || c.headwear !== 'hijab'), `${pack.id}${woke ? '/woke' : ''}: no hijab on male render`);
    if (!woke) {
      check(board.every(c => (c.gender === 'female' ? c.identity === 'woman' : c.identity === 'man')),
        `${pack.id}: basic mode identity matches appearance (solvable)`);
    } else {
      const mismatches = board.filter(c => (c.gender === 'female' ? c.identity !== 'woman' : c.identity !== 'man'));
      check(mismatches.length > 0, `${pack.id}/woke: at least one identity/appearance mismatch`);
    }
  }
}

// 2. judge unit tests
{
  const rng = mulberry32(1);
  const j = (q, card) => judgeQuestion(q, card, rng).answer;
  const sheCard = { gender: 'female', identity: 'woman', facialHair: 'none', glasses: 'none', hairStyle: 'long', hairColor: 'blonde', earLobe: 'free', skinTone: 'light', freckles: 'few', noseBridge: 'high' };
  const transCard = { gender: 'male', identity: 'transWoman', facialHair: 'none', glasses: 'none', hairStyle: 'long', hairColor: 'brown', earLobe: 'attached', skinTone: 'medium', freckles: 'none', noseBridge: 'medium' };

  check(j('is your person a woman?', transCard) === true, 'judge: trans woman IS a woman (identity semantics)');
  check(j('is your person female?', transCard) === false, 'judge: female checks appearance (the trap)');
  check(j('is your person a man?', sheCard) === false, 'judge: woman is not a man');
  check(j('are they trans?', transCard) === true, 'judge: trans detected');
  check(j('are they non-binary?', sheCard) === false, 'judge: non-binary w/ binary identity');
  check(j('does your person have a beard?', sheCard) === false, 'judge: beard negative');
  check(j('do they wear glasses?', sheCard) === false, 'judge: glasses negative');
  check(j('are their earlobes attached?', transCard) === true, 'judge: earlobe attached');
  check(j('do they have freckles?', sheCard) === true, 'judge: freckles positive');
  check(j('does your person pass?', transCard) === false, 'judge: passes = presentation matches (trans woman w/ male appearance = no)');
  check(j('is your person not a woman?', sheCard) === false, 'judge: negation inverts');
}

// 3. human-vs-human free-form game (flips are player-driven, not server-computed)
{
  const m = new Match({ packId: 'global', seats: [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }], seed: 777 });
  const QS = [
        ['is your person a woman?', 'identity', 'woman'],
        ['does your person have a beard?', 'facialHair', 'beard'],
        ['do they wear glasses?', 'glasses', 'rectangular'],
        ['are their earlobes attached?', 'earLobe', 'attached'],
        ['do they have freckles?', 'freckles', 'few'],
        ['does your person have blonde hair?', 'hairColor', 'blonde']
  ];
  let lastAsk = null; // { seat, attr, value }
  let guard = 0;
  while (m.state === 'playing' && guard++ < 200) {
        const seat = m.turn;
        if (m.pending && m.pending.from !== seat) {
          // answer truthfully based on the answerer's own target
          const truth = m.cardById(m.targets[seat])[lastAsk.attr] === lastAsk.value;
          const r = m.answer(seat, truth);
          check(r.ok, 'free-form answer succeeds');
          // the asker flips manually now that they know the answer
          if (lastAsk && lastAsk.seat === r.from) {
            const elim = m.board.filter(c => (c[lastAsk.attr] === lastAsk.value) !== r.answer).map(c => c.id);
            const merged = new Set(m.flips[r.from]);
            elim.forEach(id => merged.add(id));
            m.setFlips(r.from, Array.from(merged));
          }
          continue;
        }
        const cands = m.candidates(seat);
        if (cands.length <= 2) {
          const r = m.guess(seat, cands[0].id);
          check(r.ok, 'scripted guess succeeds');
          break;
        }
        // pick the first question that would eliminate someone
        let chosen = null;
        for (const [text, attr, value] of QS) {
          const yes = cands.filter(c => c[attr] === value).length;
          if (yes > 0 && yes < cands.length) { chosen = { text, attr, value }; break; }
        }
        if (!chosen) { const r = m.guess(seat, cands[0].id); check(r.ok, 'dumb guess'); break; }
        const r = m.ask(seat, chosen.text);
        check(r.ok, 'free-form ask succeeds');
        lastAsk = { seat, attr: chosen.attr, value: chosen.value };
  }
  check(m.state === 'over', 'scripted game finishes');
  check(m.winner === 0 || m.winner === 1, 'has a winner');
  // guard against asking twice while pending
  const m2 = new Match({ packId: 'global', seats: [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }], seed: 5 });
  m2.ask(0, 'a question?');
  const blocked = m2.ask(1, 'another?');
  check(blocked.ok === false && blocked.error.includes('Answer'), 'server rejects ask while pending');
}

// 4. bot games must resolve using the judge on human questions
function runBotMatch(packId, woke, level) {
  const m = new Match({
    packId, woke,
    seats: [{ kind: 'bot', name: 'Bot1' }, { kind: 'bot', name: 'Bot2' }],
    seed: Date.now() & 0x7fffffff,
    botLevel: level
  });
  let guard = 0;
  let humanLikeQ = 0;
  while (m.state === 'playing' && guard++ < 250) {
    const events = m.botStep();
    if (!events) break;
    for (const ev of events) {
      if (ev.type === 'answer' && ev.text) humanLikeQ++;
    }
  }
  return { over: m.state === 'over', questions: m.turnCount, humanLikeQ, guard };
}

for (const packId of ['sweden', 'cameroon', 'saudi', 'southIndia', 'global', 'lookalikes']) {
  for (const woke of [false, true]) {
    const res = runBotMatch(packId, woke, 'hard');
    check(res.over, `${packId}${woke ? '/woke' : ''}: bot game completes (${res.questions} turns, guard=${res.guard})`);
  }
}

console.log(failures === 0 ? '\nALL ENGINE TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);