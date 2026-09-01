// WHO DIS? — client application (free-form questions, judgment answers, woke mode)
(function () {
  'use strict';

  // ---------------------------------------------------------------- storage
  const store = {
    get(key, def) { try { const v = localStorage.getItem('whodis:' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(key, val) { try { localStorage.setItem('whodis:' + key, JSON.stringify(val)); } catch (e) { /* ignore */ } }
  };

    let config = { turnTimeout: 0, llmEnabled: false };

  const IDENTITY_INFO = {
    woman: { label: 'woman', pronouns: 'she/her' },
    man: { label: 'man', pronouns: 'he/him' },
    transWoman: { label: 'trans woman', pronouns: 'she/her' },
    transMan: { label: 'trans man', pronouns: 'he/him' },
    nonBinary: { label: 'non-binary', pronouns: 'they/them' },
    genderFluid: { label: 'gender fluid', pronouns: 'they/them' },
    agender: { label: 'agender', pronouns: 'they/them' },
    androgynous: { label: 'androgynous', pronouns: 'they/them' }
  };

  const state = {
    screen: 'menu',
    socket: null,
    name: store.get('name', ''),
    playerId: store.get('playerId', 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)),
    points: store.get('points', 0),
    owned: store.get('owned', ['global']),
    lastRoom: store.get('lastRoom', null),
    packs: [],
    vocab: [],
    selectedPackId: store.get('selectedPack', 'global'),
    woke: store.get('woke', false),
    mySeat: null,
    room: null,
    game: null,       // {board, targetId, flips:Set, turn, players, over, pending:null|{from,text,attr,value}}
    cardEls: {},
    logEls: [],
    guessMode: false,
    inspectCardId: null,
        lastMyAnswer: null,   // {text, answer} after someone answers your question
        elimValue: null,
        clipTimer: null
  };

  function $(id) { return document.getElementById(id); }
  const screens = { menu: $('screen-menu'), lobby: $('screen-lobby'), game: $('screen-game') };
  function show(name) {
    state.screen = name;
    for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
    $('screen-end').classList.add('hidden');
    $('screen-inspect').classList.add('hidden');
    $('modal').classList.add('hidden');
      if (name !== 'game') { stopTimer(); stopThinking(); }
    }
  function toast(msg, ms) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('toast-container').appendChild(t);
    setTimeout(() => t.remove(), ms || 2600);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // Clever "thinking" slogans shown while the bot mulls a move (an LLM call can
  // take a while — a local model may need to reload into VRAM).
  const THINK_SLOGANS = [
    'Diversity is a garden — every bloom needs its own soil.',
    'A world of one culture is a library with a single book.',
    'Homelands are the roots; without roots, no tree bears fruit worth sharing.',
    'You can\u2019t transplant a forest \u2014 only protect the soil each one grew from.',
    'Tradition is a language; every place speaks its own dialect. Diversity is fluency.',
    'A mosaic stays a mosaic only while each tile stays itself.',
    'Shared history is the map, shared culture the compass, tradition the anchor.',
    'Unique peoples are the colors on the palette \u2014 blend them all and you get gray.',
    'Every tradition is a seed grown in one soil; move the seed and you lose the tree.',
    'A river needs its banks; a people needs its homeland \u2014 that\u2019s how the flow stays rich.'
  ];
  function modal(title, text, okLabel, onOk) {
    $('modal-title').textContent = title;
    $('modal-text').textContent = text;
    $('modal-ok').textContent = okLabel || 'OK';
    $('modal').classList.remove('hidden');
    $('modal-ok').onclick = () => { $('modal').classList.add('hidden'); onOk && onOk(); };
    $('modal-cancel').onclick = () => $('modal').classList.add('hidden');
  }
  function pronounOf(identity) {
    const i = IDENTITY_INFO[identity];
    return i ? i.pronouns : 'they/them';
  }
  function identityLabel(identity) {
    const i = IDENTITY_INFO[identity];
    return i ? i.label : identity;
  }
  function idBadge(identity) {
    const i = IDENTITY_INFO[identity] || { pronouns: 'they/them' };
    return '<span class="idbadge">' + esc(i.pronouns) + '</span>';
  }

  // ---------------------------------------------------------------- helpers
  function me() { return state.mySeat; }
  function otherSeat() { return me() === 0 ? 1 : 0; }
  function otherName() {
    if (state.game && state.game.players) {
      const o = state.game.players.find(p => p.seat !== me());
      if (o) return o.name;
    }
    if (state.room && state.room.players) {
      const o = state.room.players.find(p => p.seat !== me());
      if (o) return o.name;
    }
    return 'Opponent';
  }
  function cardById(id) { return state.game ? state.game.board.find(c => c.id === id) : null; }
  function isOff(id) { return state.game ? state.game.flips.has(id) : false; }
  function myTurn() { return state.game && state.game.turn === me() && !state.game.over; }
  function pendingForMe() { return state.game && state.game.pending && state.game.pending.from !== me() ? state.game.pending : null; }

  function syncFlips() {
    if (!state.game || !state.socket) return;
      state.socket.emit('game:flip', { ids: Array.from(state.game.flips) }, () => {});
  }

    // Ask the server for authoritative turn/pending/flip state (recovery from any desync).
    function resyncState() {
      if (!state.socket) return;
      state.socket.emit('game:sync', (res) => {
        if (!res || !res.ok || !state.game) return;
        state.game.turn = res.turn;
        state.game.pending = res.pending ? { from: res.pending.from, text: res.pending.text } : null;
        state.game.flips = new Set(res.flips);
        paintBoard();
        updateRemaining();
        renderHeader();
        renderBars();
      });
    }
  function toggleFlip(id) {
    if (state.game.flips.has(id)) state.game.flips.delete(id); else state.game.flips.add(id);
    paintBoard();
    updateRemaining();
    syncFlips();
  }

  // ---------------------------------------------------------------- sockets
  function connect() {
    state.socket = io();
    const s = state.socket;

    s.on('connect', () => {
      if (state.lastRoom && (state.screen === 'lobby' || state.screen === 'game')) {
        s.emit('join', { code: state.lastRoom.code, name: state.name || 'Detective', playerId: state.playerId });
      }
    });
    s.on('disconnect', () => {
      if (state.screen === 'game') toast('Connection lost — reconnecting…', 3000);
    });

    s.on('lobby:update', (snap) => {
      state.room = { code: snap.code, packId: snap.packId, woke: snap.woke, hostSeat: snap.hostSeat, players: snap.players };
      if (state.screen !== 'lobby') show('lobby');
      renderLobby();
    });

    s.on('pack:change', (d) => {
      if (state.room) state.room.packId = d.packId;
      if (state.screen === 'lobby') renderLobby();
    });

    s.on('woke:change', (d) => {
      if (state.room) state.room.woke = d.woke;
      if (state.screen === 'lobby') renderLobby();
      else toast(d.woke ? '🌊 Woke mode is ON' : 'Woke mode is OFF');
    });

    s.on('game:start', (d) => {
      state.mySeat = d.seat;
      state.game = {
              gen: d.gen,
              board: d.board,
        targetId: d.targetId,
        flips: new Set(d.flips || []),
        turn: d.turn,
              turnAt: Date.now(),
              players: d.players,
              over: false,
              pending: d.pending ? { from: d.pending.from, text: d.pending.text, attr: d.pending.attr, value: d.pending.value } : null
            };
      state.cardEls = {};
      state.logEls = [];
      state.guessMode = false;
            state.lastMyAnswer = null;
                  stopThinking();
                  $('eliminate-row').classList.add('hidden');
            show('game');
      buildBoard();
      renderTarget();
      renderHeader();
      renderBars();
      renderLog();
    });

    s.on('game:history', (d) => {
      if (d.seat !== me() || !state.game) return;
      state.logEls = [];
      (d.history || []).forEach(h => state.logEls.push({ by: h.by, text: h.text, answer: h.answer }));
      renderLog();
    });

    s.on('game:event', (ev) => {
          if (ev.type !== 'thinking') stopThinking();
          const g = state.game;
          if (!g && ev.type !== 'over' && ev.type !== 'void') return;
          switch (ev.type) {
            case 'thinking':
              startThinking();
              break;
            case 'turn':
          g.turn = ev.turn;
                  if (ev.turnAt) g.turnAt = ev.turnAt;
                  renderHeader();
                  renderBars();
                  break;
        case 'ask': {
          g.turn = ev.turn;
                  if (ev.turnAt) g.turnAt = ev.turnAt;
                  g.pending = { from: ev.by, text: ev.text || ev.phrase, attr: ev.attr, value: ev.value };
                  upsertLog(ev.by, ev.text || ev.phrase, undefined);
                  // a new question means the previous answer bookkeeping is done
                  $('eliminate-row').classList.add('hidden');
                  state.lastMyAnswer = null;
                  if (ev.by !== me()) {
                    toast(esc(otherName()) + ' asked: "' + esc(ev.text || ev.phrase) + '"', 2200);
                  }
                  renderLog();
                  renderHeader();
                  renderBars();
                  break;
                }
        case 'answer': {
          g.pending = null;
          g.turn = ev.turn;
                  if (ev.turnAt) g.turnAt = ev.turnAt;
                  const asker = ev.by !== undefined ? ev.by : ev.from;
                  // merge into the single pending question row (no duplicate)
                  upsertLog(asker, ev.text, ev.answer);
                  if (asker === me()) {
                    state.lastMyAnswer = { text: ev.text, answer: ev.answer };
                    if (typeof ev.answer === 'boolean') showEliminateRow();
                    else $('eliminate-row').classList.add('hidden');
                  }
                  if (ev.answer === null) {
                    toast('⍰ ' + esc(otherName()) + ' doesn\'t know — no info gained', 1800);
                  } else if (ev.answer !== undefined) {
                    toast((asker === me() ? 'Their answer: ' : 'You answered: ') + (ev.answer ? 'YES ✓' : 'NO ✗'), 1600);
                  }
                  renderLog();
                  renderHeader();
                  renderBars();
                  break;
                }
                case 'pass': {
                  g.turn = ev.turn;
                  if (ev.turnAt) g.turnAt = ev.turnAt;
                  state.logEls.push({ by: ev.by, text: ev.auto ? 'ran out of time (auto-passed)' : 'skipped the turn', answer: null });
                  if (ev.auto) toast('⏱ ' + esc(otherName()) + ' ran out of time — auto-passed', 2200);
                  renderLog();
                  renderHeader();
                  renderBars();
                  break;
                }
                case 'autoElm': {
                  if (ev.seat === me() && g.board) {
                    // AI eliminated non-matching candidates on OUR board — add-only
                    let applied = 0;
                    for (const card of g.board) {
                      const matches = card[ev.attr] === ev.value;
                      const eliminated = matches !== ev.answer;
                      if (eliminated && !g.flips.has(card.id)) { g.flips.add(card.id); applied++; }
                    }
                    paintBoard();
                    updateRemaining();
                    toast('🤖 AI eliminated ' + applied + ' for your ' + ev.attr.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() + ' question', 2200);
                    renderLog();
                  }
                  break;
                }
                case 'guess': {
                  state.logEls.push({ by: ev.by, text: ev.correct !== false ? 'made a guess: ' + ev.guessedName : 'guessed', answer: null });
                  renderLog();
                  break;
                }
        case 'over':
                  if (!ev.gen || !state.game || ev.gen === state.game.gen) endGame(ev);
          break;
        case 'void':
                  if (!ev.gen || !state.game || ev.gen === state.game.gen) endVoid(ev);
          break;
      }
    });

    s.on('room:opponent', (d) => {
      const el = $('opp-status');
      if (el) el.textContent = d.online ? '' : 'Opponent disconnected — waiting…';
      if (state.screen === 'lobby') renderLobby();
    });
  }

  // ---------------------------------------------------------------- log
  function logLine(l) {
    const div = document.createElement('div');
    div.className = 'log-item';
    const who = l.by === me() ? 'You' : esc(otherName());
      let ans = '';
      if (l.answer === null) ans = '<span class="ans-dunno">⍰ DON\'T KNOW</span>';
      else if (typeof l.answer === 'boolean') ans = '<span class="' + (l.answer ? 'ans-yes' : 'ans-no') + '">' + (l.answer ? 'YES ✓' : 'NO ✗') + '</span>';
      div.innerHTML = '<span class="who">' + who + '</span><span class="q">"' + esc(l.text) + '"</span>' + ans;
      return div;
    }
  function renderLog() {
    const wrap = $('log');
    wrap.innerHTML = '';
    state.logEls.slice(-40).forEach(l => wrap.appendChild(logLine(l)));
      wrap.scrollTop = wrap.scrollHeight;
  }

    // merge an answer into its still-pending question row so we never get duplicates
    function upsertLog(by, text, answer) {
      if (answer === undefined || answer === null) {
        // null is still a real answer ("don't know"), so only undefined = no answer yet
        if (answer === undefined) {
          state.logEls.push({ by, text, answer: undefined });
          return;
        }
      }
      let hit = -1;
      for (let i = state.logEls.length - 1; i >= 0; i--) {
        const l = state.logEls[i];
        if (l.by === by && l.text === text && typeof l.answer !== 'boolean' && l.answer !== null) { hit = i; break; }
      }
      if (hit >= 0) state.logEls[hit] = { by, text, answer };
      else state.logEls.push({ by, text, answer });
    }

    // ------------------------------------------------- auto-eliminate assist
    function showEliminateRow() {
      const row = $('eliminate-row');
      if (!row || !state.lastMyAnswer || !state.game || state.game.over) return;
      row.classList.remove('hidden');
      const ansEl = $('elim-answer');
      if (ansEl) {
        ansEl.textContent = state.lastMyAnswer.answer ? 'YES ✓' : 'NO ✗';
        ansEl.className = 'elim-answer ' + (state.lastMyAnswer.answer ? 'yes' : 'no');
      }
      const sel = $('elim-trait');
      if (sel.options.length === 0) {
        for (const v of state.vocab) {
          const o = document.createElement('option');
          o.value = v.key;
          o.textContent = v.label;
          sel.appendChild(o);
        }
      }
      state.elimValue = null;
      renderElimValues();
    }
    function renderElimValues() {
      const wrap = $('elim-values');
      wrap.innerHTML = '';
      const attr = $('elim-trait').value;
      const v = state.vocab.find(x => x.key === attr);
      if (!v) return;
      for (const val of v.values) {
        const c = document.createElement('button');
        c.className = 'chip-val' + (state.elimValue === val ? ' sel' : '');
        c.textContent = val;
        c.onclick = () => { state.elimValue = val; renderElimValues(); $('btn-elim-apply').disabled = false; };
        wrap.appendChild(c);
      }
      $('btn-elim-apply').disabled = state.elimValue == null;
    }
    function applyEliminate() {
      const g = state.game;
      const attr = $('elim-trait').value;
      const val = state.elimValue;
      if (!g || !state.lastMyAnswer || !attr || val == null) return;
      let flipped = 0;
      // add-only: we eliminate the people that contradict the answer, but NEVER
      // re-enable cards the player already eliminated (a wrong trait guess must
      // not resurrect previously-eliminated people)
      for (const card of g.board) {
        const matches = card[attr] === val;
        const eliminated = matches !== state.lastMyAnswer.answer;
        if (eliminated && !g.flips.has(card.id)) flipped++;
        if (eliminated) g.flips.add(card.id);
      }
      const attrLabelX = attr.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      syncFlips();
      paintBoard();
      updateRemaining();
      $('eliminate-row').classList.add('hidden');
      state.lastMyAnswer = null;
      toast('🎯 Eliminated ' + flipped + ' matching your ' + attrLabelX + ' question', 2000);
    }

  // ---------------------------------------------------------------- target tray
  function renderTarget() {
    const wrap = $('target-card');
    wrap.innerHTML = '';
    if (!state.game) return;
    const card = cardById(state.game.targetId);
    if (!card) return;
    const cv = document.createElement('canvas');
    cv.width = 176; cv.height = 200;
    faceGen.drawFace(cv, card);
    wrap.appendChild(cv);
    const info = document.createElement('div');
    info.innerHTML = '<div class="nameplate">' + esc(card.name) + '</div>' + idBadge(card.identity);
    wrap.appendChild(info);
  }

  // ---------------------------------------------------------------- board
  function buildBoard() {
      const wrap = $('board');
      wrap.innerHTML = '';
      state.cardEls = {};
      for (const card of state.game.board) {
        const el = document.createElement('div');
        el.className = 'card';
        el.dataset.id = card.id;
        const face = document.createElement('div');
        face.className = 'face-wrap';
        const cv = document.createElement('canvas');
        cv.width = 176; cv.height = 200;
        faceGen.drawFace(cv, card);
        face.appendChild(cv);
        const nm = document.createElement('div');
        nm.className = 'nameplate';
        nm.textContent = card.name;
        el.appendChild(face);
        el.appendChild(nm);
        el.insertAdjacentHTML('beforeend', idBadge(card.identity));
        el.addEventListener('click', () => cardClick(card.id));
        wrap.appendChild(el);
        state.cardEls[card.id] = el;
      }
      paintBoard();
    }

  function cardClick(id) {
    const g = state.game;
    if (!g || g.over) return;
    if (state.guessMode) {
      const card = cardById(id);
      if (!card) return;
      if (g.flips.has(id)) { toast('That person was eliminated!'); return; }
      modal('Guess ' + card.name + '?', 'Wrong guess = instant loss. Are you sure?', '🔫 GUESS', () => {
        state.socket.emit('game:guess', { id });
      });
      return;
    }
    // open the big zoomed inspector
    openInspect(id);
  }

  function openInspect(id) {
    const card = cardById(id);
    if (!card) return;
    state.inspectCardId = id;
    const pic = $('inspect-pic');
    pic.innerHTML = '';
    const cv = document.createElement('canvas');
    cv.width = 352; cv.height = 400;
    faceGen.drawFace(cv, card);
    pic.appendChild(cv);
    $('inspect-name').textContent = card.name;
    $('inspect-badge').innerHTML = idBadge(card.identity) + ' · ' + esc(identityLabel(card.identity)) + ' · appears ' + esc(card.gender);
    const flipBtn = $('btn-inspect-flip');
    flipBtn.textContent = isOff(id) ? '↩ Un-eliminate' : '🚫 Eliminate';
    flipBtn.disabled = state.guessMode;
    $('screen-inspect').classList.remove('hidden');
  }

  function paintBoard() {
    if (!state.game) return;
    for (const card of state.game.board) {
      const el = state.cardEls[card.id];
      if (el) el.classList.toggle('off', isOff(card.id));
    }
    $('board').classList.toggle('guess-hint', state.guessMode);
  }
  function updateRemaining() {
    const el = $('remaining');
    if (!el || !state.game) return;
    el.textContent = (state.game.board.length - state.game.flips.size) + ' possible';
  }

  // ---------------------------------------------------------------- header
    let timerTick = null;
    function stopTimer() { if (timerTick) { clearInterval(timerTick); timerTick = null; } const el = $('turn-timer'); if (el) el.textContent = ''; }

      // "thinking" slogans while the bot works (LLM calls may take 20s+)
      let thinkTick = null;
      function stopThinking() {
        if (thinkTick) { clearInterval(thinkTick); thinkTick = null; }
        const el = $('think-slogan');
        if (el) el.textContent = '';
      }
      function startThinking() {
        if (thinkTick) return;
        const g = state.game;
        if (!g || !g.players) return;
        const o = g.players.find(p => p.seat !== me());
        if (!o || o.kind !== 'bot') return;   // slogans are for the slow bot wait
        const el = $('think-slogan');
        if (!el) return;
        let i = 0;
        const show = () => { el.textContent = '\uD83D\uDCAD ' + THINK_SLOGANS[i++ % THINK_SLOGANS.length]; };
        show();
        thinkTick = setInterval(show, 4000);
      }
    function startTimer() {
      stopTimer();
      const el = $('turn-timer');
      if (!el || !config.turnTimeout || !state.game) return;
      timerTick = setInterval(() => {
        const g = state.game;
        if (!g || g.over) { stopTimer(); return; }
        const remain = Math.max(0, config.turnTimeout - Math.floor((Date.now() - g.turnAt) / 1000));
        if (remain <= 0) { el.textContent = '⏱ —'; return; }
        el.textContent = '⏱ ' + remain + 's';
        el.classList.toggle('warn', remain <= 10);
      }, 500);
    }

    function renderHeader() {
      if (!state.game) return;
      $('you-chip').textContent = '🕵️ ' + esc(state.name || 'Detective');
      $('opp-chip').textContent = '🔎 ' + esc(otherName());
      if (myTurn()) {
        $('turn-banner').textContent = '🕵️ Your turn' + (pendingForMe() ? ' — answer first!' : ' — ask away!');
        $('turn-banner').classList.add('mine');
      } else if (state.game.pending && state.game.pending.from === me()) {
        $('turn-banner').textContent = '⏳ Waiting for ' + esc(otherName()) + ' to answer…';
        $('turn-banner').classList.remove('mine');
      } else {
        $('turn-banner').textContent = '🔎 ' + esc(otherName()) + ' is thinking…';
        $('turn-banner').classList.remove('mine');
      }
      startTimer();
      updateRemaining();
    }

  // ---------------------------------------------------------------- bars
  function renderBars() {
    const ansBar = $('ans-bar');
    const askBar = $('ask-bar');
    if (!state.game || state.game.over) { ansBar.classList.add('hidden'); askBar.classList.add('hidden'); return; }
    const p = pendingForMe();
    if (p) {
      // ANSWER phase — show our target big so we can judge
      ansBar.classList.remove('hidden');
      askBar.classList.add('hidden');
      $('ans-text').textContent = p.text;
      const wrap = $('ans-target');
      wrap.innerHTML = '';
      const card = cardById(state.game.targetId);
      if (card) {
        const cv = document.createElement('canvas');
        cv.width = 176; cv.height = 200;
        faceGen.drawFace(cv, card);
        wrap.appendChild(cv);
      }
    } else {
      ansBar.classList.add('hidden');
      askBar.classList.remove('hidden');
      const canAct = myTurn();
      $('btn-ask').disabled = !(canAct && $('q-text').value.trim());
      $('btn-pass').disabled = !canAct;
      $('btn-suggest').disabled = !canAct;
      $('btn-guess-mode').disabled = !canAct;
    }
  }

  function buildTraitChips() {
    const wrap = $('trait-chips');
    wrap.innerHTML = '';
    const chips = [
      { label: 'she/her?', q: 'is your person a woman?' },
      { label: 'he/him?', q: 'is your person a man?' },
      { label: 'they/them?', q: 'are they non-binary?' },
      { label: 'beard?', q: 'does your person have a beard?' },
      { label: 'glasses?', q: 'do they wear glasses?' },
      { label: 'bald?', q: 'is your person bald?' },
      { label: 'hijab?', q: 'do they wear a hijab or head covering?' },
      { label: 'earlobes?', q: 'are their earlobes attached?' },
      { label: 'freckles?', q: 'do they have freckles?' },
      { label: 'passing?', q: 'does your person pass?' }
    ];
    for (const c of chips) {
      const b = document.createElement('button');
      b.className = 'tchip';
      b.textContent = c.label;
      b.onclick = () => { $('q-text').value = c.q; onQChange(); toast('Now ask it!', 1200); };
      wrap.appendChild(b);
    }
  }
  function onQChange() {
    const canAct = myTurn();
    $('btn-ask').disabled = !(canAct && $('q-text').value.trim());
  }

  // ---------------------------------------------------------------- suggest
  function suggestQ() {
    const g = state.game;
    if (!g || !myTurn() || pendingForMe()) return;
    const cands = g.board.filter(c => !g.flips.has(c.id));
    const n = cands.length;
    if (n <= 1) { toast('Only one candidate left — just guess!'); return; }
    let best = null, bestScore = Infinity;
    for (const v of state.vocab) {
      const counts = {};
      for (const c of cands) counts[c[v.key]] = (counts[c[v.key]] || 0) + 1;
      const vals = Object.keys(counts).filter(k => counts[k] > 0 && counts[k] < n);
      for (const val of vals) {
        const k = counts[val];
        const score = (k * k + (n - k) * (n - k)) / n;
        if (score < bestScore) { bestScore = score; best = { attr: v.key, value: val }; }
      }
    }
    if (!best) { toast('Nothing informative left — make a guess!'); return; }
    $('q-text').value = phraseFor(best.attr, best.value);
    onQChange();
    toast('💡 Suggested: "' + $('q-text').value + '"');
  }
  function phraseFor(attr, value) {
    if (attr === 'identity') {
      return 'is your person ' + (value === 'woman' ? 'a woman' : value === 'man' ? 'a man' : identityLabel(value)) + '?';
    }
    if (attr === 'gender') return 'does your person look ' + value + '?';
    if (attr === 'hairColor') return 'does your person have ' + pubVal(attr, value) + ' hair?';
    if (attr === 'facialHair' && value === 'none') return 'is your person clean-shaven?';
    return 'does your person have ' + pubVal(attr, value) + '?';
  }
  function pubVal(attr, value) {
    return value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }

  // ---------------------------------------------------------------- end game
  function endGame(ev) {
    if (!state.game) return;
    state.game.over = true;
    const won = ev.winner === me();
    const pts = won ? ev.winnerPts : ev.loserPts;
    state.points += pts;
    store.set('points', state.points);
    $('points-val').textContent = state.points;

    const end = $('screen-end');
    end.classList.remove('hidden');
    end.className = 'overlay ' + (won ? 'win' : 'lose');
      const card = cardById(ev.targetId);        // the person being identified (opponent of guesser)
      const nm = card ? card.name : '…';
      const guesser = ev.guessedBy === me() ? 'You' : esc(otherName());
      const guessed = ev.guessedName || nm;

      // Explicit: who guessed, what name, and who won.
      let title, sub;
      if (won) {
        title = '🎉 YOU WIN!';
        sub = guesser === 'You'
          ? 'You guessed <b>' + esc(guessed) + '</b> and you were RIGHT. Nice work (' + ev.questions + ' questions).'
          : esc(otherName()) + ' guessed <b>' + esc(guessed) + '</b> — WRONG! Their person was actually <b>' + nm + '</b>. You win by default.';
      } else {
        title = '💀 ' + (guesser === 'You' ? 'YOU LOSE' : esc(otherName()).toUpperCase() + ' WINS');
        sub = guesser === 'You'
          ? 'You guessed <b>' + esc(guessed) + '</b> — WRONG. The person was <b>' + nm + '</b>.'
          : esc(otherName()) + ' guessed <b>' + esc(guessed) + '</b> and was RIGHT. Better luck next case.';
      }
      $('end-title').textContent = title;
      const wrap = $('end-target');
      wrap.innerHTML = '';
      if (card) {
        const cv = document.createElement('canvas');
        cv.width = 176; cv.height = 200;
        faceGen.drawFace(cv, card);
        wrap.appendChild(cv);
        const nmd = document.createElement('div');
        nmd.className = 'nm';
        nmd.textContent = card.name + ' · ' + identityLabel(card.identity) + ' (' + pronounOf(card.identity) + ')';
        wrap.appendChild(nmd);
    }
      $('end-sub').innerHTML = sub;
      $('end-points').textContent = '🪙 +' + pts + (ev.woke ? ' (woke bonus included)' : '');
    }

    function played() {
      if (state.game && state.game.players) {
        const meSeat = me();
        const p = state.game.players.find(x => x.seat === meSeat);
        return p && p.kind === 'bot' ? 'bot' : 'human';
      }
      return 'human';
    }

  function endVoid(ev) {
    if (!state.game) return;
    state.game.over = true;
    const end = $('screen-end');
    end.classList.remove('hidden');
    end.className = 'overlay';
    $('end-title').textContent = '🚪 CASE CLOSED';
    $('end-sub').textContent = ev.reason || 'The match was voided.';
    $('end-target').innerHTML = '';
    $('end-points').textContent = '';
  }

 // ---------------------------------------------------------------- lobby
 function renderLobby() {
   const r = state.room;
   if (!r) return;
   $('room-code').textContent = r.code;
   const wrap = $('lobby-players');
   wrap.innerHTML = '';
   for (let i = 0; i < 2; i++) {
     const p = r.players.find(x => x.seat === i);
     const row = document.createElement('div');
     row.className = 'lp-row';
     if (p) {
       row.innerHTML = '<span class="emoji">' + p.emoji + '</span><span class="nm">' + esc(p.name) + '</span>' +
         '<span class="st ' + (p.online ? 'on' : '') + '">' + (p.kind === 'bot' ? '🤖 bot' : (p.online ? 'ready' : 'offline…')) + '</span>';
     } else {
       row.innerHTML = '<span class="emoji">🕵️</span><span class="nm">Waiting for detective…</span>';
     }
     wrap.appendChild(row);
   }
   const pack = state.packs.find(p => p.id === r.packId);
   $('lobby-pack-name').textContent = pack ? pack.name : r.packId;
   $('lobby-pack-tagline').textContent = pack ? pack.tagline : '';
   const isHost = r.hostSeat === me();
   $('btn-start').disabled = !isHost || r.players.length < 2;
   $('btn-start').textContent = isHost ? '▶ Start Match' : 'Waiting for host to start…';
   $('btn-pack-prev').disabled = !isHost;
   $('btn-pack-next').disabled = !isHost;
   const wokeEl = $('lobby-woke');
   wokeEl.checked = !!r.woke;
   wokeEl.disabled = !isHost;
 }

 function cyclePack(dir) {
   const r = state.room;
   if (!r) return;
   const idx = state.packs.findIndex(p => p.id === r.packId);
   const n = (idx + dir + state.packs.length) % state.packs.length;
   state.socket.emit('lobby:setPack', { packId: state.packs[n].id });
 }

 // ---------------------------------------------------------------- packs
 function renderPacks() {
   const wrap = $('pack-list');
   wrap.innerHTML = '';
   for (const p of state.packs) {
     const owned = state.owned.includes(p.id);
     const el = document.createElement('div');
     el.className = 'pack' + (state.selectedPackId === p.id ? ' selected' : '') + (owned ? '' : ' locked');
     el.innerHTML =
       '<div class="p-cost">' + (owned ? (p.cost ? '✓ OWNED' : 'FREE') : '🪙 ' + p.cost) + '</div>' +
       '<div class="p-name">' + esc(p.name) + '</div>' +
       '<div class="p-region">' + esc(p.region) + '</div>' +
       '<div class="p-tagline">' + esc(p.tagline) + '</div>' +
       '<div class="p-diff">' + '★'.repeat(p.difficulty) + '☆'.repeat(4 - p.difficulty) + '</div>';
     el.addEventListener('click', () => {
       // ANY pack can be selected — locked packs are fully playable to test,
       // they just don't count as "owned" until unlocked with points.
       if (!owned) {
         if (state.points >= p.cost) {
           // offer to unlock, but selection happens regardless
           modal('Unlock ' + p.name + '?', 'This costs 🪙 ' + p.cost + '. You have 🪙 ' + state.points + '. (Packs are fully playable for testing either way.)', 'Unlock', () => {
             state.points -= p.cost;
             state.owned.push(p.id);
             store.set('points', state.points);
             store.set('owned', state.owned);
             $('points-val').textContent = state.points;
             renderPacks();
             toast('Unlocked: ' + p.name + '!');
           });
           state.selectedPackId = p.id;
           store.set('selectedPack', p.id);
           renderPacks();
           return;
         }
         toast('Testing ' + p.name + ' — win matches to earn 🪙 and own it');
         state.selectedPackId = p.id;
         store.set('selectedPack', p.id);
         renderPacks();
         return;
       }
       state.selectedPackId = p.id;
       store.set('selectedPack', p.id);
       renderPacks();
     });
     wrap.appendChild(el);
   }
   const sel = state.packs.find(p => p.id === state.selectedPackId);
   $('selected-pack').textContent = sel ? '▶ Playing pack: ' + sel.name : '';
 }

 // ---------------------------------------------------------------- woke toggle
 function applyWokeUi() {
   $('woke-toggle').checked = state.woke;
   $('woke-sub').textContent = state.woke
     ? 'ON — identity ≠ appearance. Asking is a minefield. +2🪙.'
     : 'OFF — binary &amp; consistent, solvable &amp; calm.'.replace('&amp;', '&');
 }

 function openSettings() {
   $('set-url').value = config.llmUrlSet ? config.llmUrl || '' : '';
   $('set-key').value = '';
   $('set-key').placeholder = 'saved (leave blank to keep)';
   $('set-model').value = config.llmModel || 'gpt-4o-mini';
   $('set-autoelim').checked = !!config.autoEliminate;
   $('set-status').textContent = config.llmEnabled
     ? '🤖 AI ACTIVE — bot uses ' + (config.llmModel || 'model') + (config.autoEliminate ? ' & auto-eliminates your board' : '')
     : '🤖 AI OFF — built-in judge + manual elimination';
   $('settings-modal').classList.remove('hidden');
 }

 function saveSettings() {
   const url = $('set-url').value.trim();
   const key = $('set-key').value.trim();
   const model = $('set-model').value.trim();
   fetch('/api/settings', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       llmApiUrl: url,
       llmApiKey: key,
       llmModel: model,
       autoEliminate: $('set-autoelim').checked
     })
   }).then(r => r.json()).then((res) => {
     config.llmEnabled = !!res.llmEnabled;
     config.llmModel = res.llmModel;
     config.llmUrlSet = res.llmUrlSet;
     config.autoEliminate = !!res.autoEliminate;
     $('settings-modal').classList.add('hidden');
     toast(res.llmEnabled
       ? '🤖 AI ACTIVE' + (res.autoEliminate ? ' + auto-eliminate ON' : ' (manual elimination)')
       : '🤖 AI OFF — built-in judge', 2200);
   }).catch(() => toast('Could not save settings', 2200));
 }

 // ---------------------------------------------------------------- init
 function init() {
   $('points-val').textContent = state.points;
   $('player-name').value = state.name;
   applyWokeUi();
   $('player-name').addEventListener('input', (e) => {
     state.name = e.target.value.trim().slice(0, 20);
     store.set('name', state.name);
   });

   $('woke-toggle').addEventListener('change', (e) => {
     state.woke = e.target.checked;
     store.set('woke', state.woke);
     applyWokeUi();
     toast(state.woke ? '🌊 Woke Mode ON — tread carefully' : 'Woke Mode OFF — back to basics');
   });

   $('btn-bot').addEventListener('click', () => {
     state.socket.emit('botMatch', { name: state.name || 'Detective', playerId: state.playerId, packId: state.selectedPackId, woke: state.woke });
   });
   $('btn-create').addEventListener('click', () => {
     state.socket.emit('create', { name: state.name || 'Detective', playerId: state.playerId, packId: state.selectedPackId, woke: state.woke }, (res) => {
       if (res && res.ok) {
         state.mySeat = res.seat || 0;
         state.lastRoom = { code: res.code, seat: res.seat };
         store.set('lastRoom', state.lastRoom);
         show('lobby');
       } else toast('Could not create room');
     });
   });
   $('btn-join').addEventListener('click', () => $('join-box').classList.toggle('hidden'));
   $('btn-join-go').addEventListener('click', () => {
     const code = $('join-code').value.trim().toUpperCase();
     if (!code) return;
     state.socket.emit('join', { code, name: state.name || 'Detective', playerId: state.playerId }, (res) => {
       if (res && res.ok) {
         $('join-error').textContent = '';
         state.mySeat = res.seat;
         state.lastRoom = { code: res.code, seat: res.seat };
         store.set('lastRoom', state.lastRoom);
         if (res.state === 'lobby') show('lobby');
       } else {
         $('join-error').textContent = (res && res.error) || 'Join failed';
       }
     });
   });
   $('btn-copy').addEventListener('click', () => {
     const code = state.lastRoom ? state.lastRoom.code : (state.room ? state.room.code : '');
     if (!code) return;
     const url = location.origin + location.pathname + '?room=' + code;
     const done = () => toast('Invite link copied', 2400);
     if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done);
     else { prompt('Copy this invite link:', url); done(); }
   });
   $('btn-start').addEventListener('click', () => state.socket.emit('lobby:start'));
   $('btn-leave').addEventListener('click', () => { state.lastRoom = null; store.set('lastRoom', null); show('menu'); });
   $('btn-pack-prev').addEventListener('click', () => cyclePack(-1));
   $('btn-pack-next').addEventListener('click', () => cyclePack(1));
   $('btn-pack-details').addEventListener('click', () => {
     const r = state.room;
     if (!r) return;
     const pack = state.packs.find(p => p.id === r.packId);
     if (pack) toast(pack.tagline, 3200);
   });
   $('btn-how').addEventListener('click', () => $('howto').classList.toggle('hidden'));
   $('lobby-woke').addEventListener('change', (e) => {
     state.socket.emit('lobby:setWoke', { woke: e.target.checked });
   });

   // AI settings
   $('btn-settings').addEventListener('click', openSettings);
   $('btn-settings-cancel').addEventListener('click', () => $('settings-modal').classList.add('hidden'));
   $('btn-settings-save').addEventListener('click', saveSettings);

   // inspect modal
   $('btn-inspect-flip').addEventListener('click', () => {
     if (state.inspectCardId === null) return;
     toggleFlip(state.inspectCardId);
     // close the zoomed view after eliminating
     $('screen-inspect').classList.add('hidden');
   });
   $('btn-inspect-close').addEventListener('click', () => $('screen-inspect').classList.add('hidden'));
   $('btn-inspect-guess').addEventListener('click', () => {
     const id = state.inspectCardId;
     $('screen-inspect').classList.add('hidden');
     const card = cardById(id);
     if (!card) return;
     if (state.game && state.game.flips.has(id)) { toast('That person was eliminated!'); return; }
     modal('Guess ' + card.name + '?', 'Wrong guess = instant loss. Are you sure?', '🔫 GUESS', () => {
       state.socket.emit('game:guess', { id });
     });
   });

   // ask bar
   $('q-text').addEventListener('input', onQChange);
   $('q-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-ask').click(); });
   $('btn-ask').addEventListener('click', () => {
     const text = $('q-text').value.trim();
     if (!text || !myTurn() || pendingForMe()) return;
     state.socket.emit('game:ask', { text }, (res) => {
       if (!res || !res.ok) {
         // server rejected (e.g. pending question out of sync) — resync and unblock
         toast((res && res.error) || 'Could not ask — resyncing…', 2600);
         resyncState();
         renderBars();
         return;
       }
       $('q-text').value = '';
       $('btn-ask').disabled = true;
       state.lastMyAnswer = null;
       $('eliminate-row').classList.add('hidden');
       renderBars();
     });
   });
   $('btn-pass').addEventListener('click', () => {
     if (!myTurn() || pendingForMe()) return;
     state.socket.emit('game:pass');
   });
   $('btn-suggest').addEventListener('click', suggestQ);
   $('elim-trait').addEventListener('change', renderElimValues);
   $('btn-elim-apply').addEventListener('click', applyEliminate);
   $('btn-elim-dismiss').addEventListener('click', () => {
     $('eliminate-row').classList.add('hidden');
     state.lastMyAnswer = null;
     renderBars();
   });
   $('btn-guess-mode').addEventListener('click', () => {
     state.guessMode = !state.guessMode;
     paintBoard();
     toast(state.guessMode ? '🔫 Guess mode — tap a card to guess' : 'Inspect mode — tap a card to enlarge');
   });

   // answer bar
   function answer(yes) {
     const p = pendingForMe();
     if (!p || !state.socket) return;
     state.socket.emit('game:answer', { yes }, (res) => {
       if (res && res.ok) {
         // Only auto-apply the bot's structured question to OUR board if the
         // user opted in via ⚙ Settings → "Auto-eliminate my board".
         if (config.autoEliminate && p.attr && p.value && yes !== null) {
           let flipped = 0;
           for (const card of state.game.board) {
             const matches = card[p.attr] === p.value;
             const eliminated = yes ? !matches : matches;
             if (eliminated && !state.game.flips.has(card.id)) flipped++;
             if (eliminated) state.game.flips.add(card.id);
           }
           syncFlips();
           paintBoard();
           updateRemaining();
           if (flipped > 0) toast('⚡ Eliminated ' + flipped + ' (auto-eliminate ON)', 2000);
         }
       } else {
         toast((res && res.error) || 'Could not answer — resyncing…', 2600);
         resyncState();
       }
     });
   }
   $('btn-ans-yes').addEventListener('click', () => answer(true));
   $('btn-ans-no').addEventListener('click', () => answer(false));
   $('btn-ans-dunno').addEventListener('click', () => answer(null));

   // end overlay
   $('btn-rematch').addEventListener('click', () => state.socket.emit('game:rematch'));
   $('btn-back-menu').addEventListener('click', () => { state.lastRoom = null; store.set('lastRoom', null); show('menu'); });

   // join via ?room= link
   const params = new URLSearchParams(location.search);
   const roomParam = params.get('room');
   if (roomParam) {
     $('join-code').value = roomParam;
     setTimeout(() => $('btn-join-go').click(), 400);
   }

   connect();
   buildTraitChips();

   Promise.all([
     fetch('/api/packs').then(r => r.json()),
     fetch('/api/vocab').then(r => r.json()),
     fetch('/api/config').then(r => r.json()).catch(() => ({}))
   ]).then(([packs, vocab, cfg]) => {
     state.packs = packs;
     state.vocab = vocab;
     config = Object.assign(config, cfg || {});
     renderPacks();
   }).catch(() => toast('Could not load game data — is the server running?'));

   // hide settings modal on Esc / backdrop
   $('settings-modal').addEventListener('click', (e) => {
     if (e.target === $('settings-modal')) $('settings-modal').classList.add('hidden');
   });
 }

 document.addEventListener('DOMContentLoaded', init);
  })();