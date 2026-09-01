// Who Dis? — socket server: rooms, lobby, match lifecycle, bot turns.
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');
const { Match } = require('./lib/engine');
const { VOCAB, PACKS, PACK_MAP } = require('./lib/packs');

const PORT = process.env.PORT || 3000;
const TURN_TIMEOUT = Number(process.env.TURN_TIMEOUT === undefined ? 90 : process.env.TURN_TIMEOUT); // seconds; 0 = disabled
const ENV_FILE = path.join(__dirname, '.env');
const SETTINGS_FILE = path.join(__dirname, '.env'); // preferred; fallback to settings.json
const PREF_FILE = path.join(__dirname, 'prefs.json');

// Tiny .env loader (no dependency) — MUST run before lib/llm is required,
// because llm reads process.env at require-time.
try {
  const lines = require('fs').readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
} catch (e) { /* no .env yet */ }

const llm = require('./lib/llm');

// load persisted settings (AI config) at boot — llm.js already reads process.env
// (from .env via the loader above); only the non-secret toggle is stored here.
let uiSettings = { autoEliminate: false };
try {
  const pref = JSON.parse(require('fs').readFileSync(PREF_FILE, 'utf8'));
  if (pref && typeof pref.autoEliminate === 'boolean') uiSettings.autoEliminate = pref.autoEliminate;
} catch (e) { /* no pref file yet */ }
try {
  // back-compat: old settings.json
  const s = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'settings.json'), 'utf8'));
  if (s && typeof s.autoEliminate === 'boolean') uiSettings.autoEliminate = s.autoEliminate;
} catch (e) { /* none */ }

// Persist secrets to .env (git-ignored). The auto-eliminate toggle is not a
// secret but must survive restarts, so store it in a small JSON pref file.
function persistSettings() {
  const secretKeys = { LLM_API_URL: llm.getUrl(), LLM_API_KEY: llm.getKey(), LLM_MODEL: llm.getModel(), LLM_TIMEOUT_MS: String(llm.getTimeout()) };
  const lines = [];
  for (const [k, v] of Object.entries(secretKeys)) if (v) lines.push(k + '=' + v);
  try { require('fs').writeFileSync(SETTINGS_FILE, lines.join('\n') + '\n'); } catch (e) { /* non-fatal */ }
  try { require('fs').writeFileSync(PREF_FILE, JSON.stringify({ autoEliminate: uiSettings.autoEliminate })); } catch (e) { /* non-fatal */ }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/packs', (req, res) => res.json(PACKS.map(p => ({ id: p.id, name: p.name, region: p.region, difficulty: p.difficulty, cost: p.cost, tagline: p.tagline }))));
app.get('/api/vocab', (req, res) => res.json(VOCAB));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => res.json({
  turnTimeout: TURN_TIMEOUT,
  llmEnabled: llm.llmEnabled(),
  llmModel: llm.getModel(),
  llmUrlSet: !!llm.getUrl(),
  autoEliminate: uiSettings.autoEliminate,
  botLevel: 'hard'
}));

app.post('/api/settings', (req, res) => {
  const b = req.body || {};
  llm.configure(b);
  if (typeof b.autoEliminate === 'boolean') uiSettings.autoEliminate = b.autoEliminate;
  persistSettings();
  res.json({
    ok: true,
    llmEnabled: llm.llmEnabled(),
    llmModel: llm.getModel(),
    llmUrlSet: !!llm.getUrl(),
    autoEliminate: uiSettings.autoEliminate
  });
});

// ---------------------------------------------------------------- rooms
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map(); // code -> room

function genCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  if (rooms.has(code)) return genCode();
  return code;
}

const EMOJIS = ['🕵️', '🔎', '🧐', '🦉'];

function makeRoom(code, seat0, woke) {
  return {
    code,
    packId: 'global',
    woke: !!woke,
    seats: [seat0, null],
    host: 0,
    state: 'lobby', // lobby | playing | over
    match: null,
        botScheduled: false,
        voidTimer: null,
    overAt: 0,
    createdAt: Date.now()
  };
}

function seatOf(room, playerId) {
  return room.seats.findIndex(s => s && s.playerId === playerId);
}

function roomSnapshot(room) {
  return {
    code: room.code,
    packId: room.packId,
    woke: room.woke,
    hostSeat: room.host,
    state: room.state,
    players: room.seats.map((s, i) => s ? { seat: i, name: s.name, emoji: s.emoji, online: s.online, kind: s.kind } : null).filter(Boolean)
  };
}

function emitRoom(room, evt, payload, exceptSocketId) {
  for (const s of room.seats) {
    if (!s) continue;
    const sock = io.sockets.sockets.get(s.socketId);
    if (sock && sock.id !== exceptSocketId) sock.emit(evt, payload);
  }
}

function toSocket(room, seat) {
  const s = room.seats[seat];
  return s ? io.sockets.sockets.get(s.socketId) : null;
}

// ---------------------------------------------------------------- game orchestration

function startMatch(room) {
  const players = room.seats.map(s => ({ kind: s.kind, name: s.name }));
  const match = new Match({ packId: room.packId, seats: players, botLevel: 'hard', woke: room.woke });
  room.match = match;
  room.state = 'playing';
  room.overAt = 0;
    room.botScheduled = false;

  for (let seat = 0; seat < 2; seat++) {
    const sock = toSocket(room, seat);
    if (sock) {
      sock.emit('game:start', {
        seat,
        packId: room.packId,
        packName: PACK_MAP[room.packId].name,
              gen: match.gen,
              woke: room.woke,
        board: match.cardsForSeat(seat),
        targetId: match.targets[seat],
        flips: Array.from(match.flips[seat]),
        turn: match.turn,
        players: roomSnapshot(room).players,
        pending: match.pending ? { from: match.pending.from, text: match.pending.text } : null
      });
    }
  }
  emitRoom(room, 'game:event', { type: 'turn', turn: match.turn, turnAt: match.turnStartedAt });
  scheduleBotIfNeeded(room);
}

function scheduleBotIfNeeded(room) {
  const m = room.match;
  if (!m || m.state !== 'playing' || !m.isBotTurn()) return;
    if (room.botScheduled) return;            // watchdog/sweep guard
    room.botScheduled = true;
    // let the client show "thinking…" slogans while the bot works (LLM calls
    // can take a while — a local model may need to reload into VRAM)
    broadcastGameEvent(room, { type: 'thinking' });
    const delay = 600 + Math.random() * 800;
    setTimeout(() => {
      if (room.match === m && m.state === 'playing' && m.isBotTurn()) {
        runBotStep(room).catch(() => {}).finally(() => { room.botScheduled = false; });
      } else {
        room.botScheduled = false;
      }
    }, delay);
  }

  // Main bot step. Tries the AI judge for a pending human question first, then
  // runs the engine's step, then (optionally) maps the human's question to a
  // trait so the human's board is auto-eliminated.
  async function runBotStep(room) {
    const m = room.match;
    if (!m || m.state !== 'playing') return;

    // AI judge for the human's pending free-form question
    if (llm.llmEnabled() && m.pending && m.pending.from !== m.turn && m.seats[m.turn].kind === 'bot') {
      const target = m.cardById(m.targets[m.turn]);
      const judged = await llm.judgeWithLLM(m.pending.text, target);
      // guard: match may have ended / been rematched while the API was in flight
      if (room.match !== m || m.state !== 'playing') return;
      if (judged) m._overrideAnswer = { for: m.pending.from, res: judged };
    }

    // AI-chosen creative question (only when it's the bot's turn to ASK)
    if (llm.llmEnabled() && m.isBotTurn() && m.candidates(m.turn).length > 1) {
      const cands = m.candidates(m.turn).map(id => m.cardById(id));
      const q = await llm.askBotQuestion(cands, { woke: m.woke, pi: llm.getPiMode() });
      if (room.match !== m || m.state !== 'playing') return;
      if (q) m._overrideAsk = q;
    }

    const events = m.botStep() || [];
    for (const evt of events) broadcastGameEvent(room, evt);

    // AI elimination assist: if the human asked and the bot answered, map the
    // question to a trait and eliminate the asker's non-matching candidates.
        if (uiSettings.autoEliminate && llm.llmEnabled() && m.state === 'playing') {
      const ans = events.find(e => e.type === 'answer');
      if (ans && room.seats[ans.by] && room.seats[ans.by].kind === 'human') {
        runAIElimination(room, ans.by, ans.text, ans.answer);
      }
    }

        if (m.state === 'over') {
          const guessEvt = events.find(e => e.type === 'guess');
          endMatch(room, m.winner, guessEvt ? guessEvt.by : m.winner);
        } else scheduleBotIfNeeded(room);
      }

  async function runAIElimination(room, seat, text, answer) {
    const m = room.match;
    try {
      const mapped = await llm.mapTraitWithLLM(text);
      if (!mapped || m !== room.match || m.state !== 'playing') return;
      const flipped = m.autoEliminate(seat, mapped.attr, mapped.value, answer);
      if (flipped.length) {
        emitRoom(room, 'game:event', {
          type: 'autoElm', seat, attr: mapped.attr, value: mapped.value, answer: !!answer, flipped: flipped.length
        });
      }
    } catch (e) { /* fall back to manual elimination */ }
  }

  function broadcastGameEvent(room, evt) {
    const m = room.match;
    if (m && (evt.type === 'ask' || evt.type === 'answer' || evt.type === 'pass')) {
      evt.turn = m.turn;
      evt.turnAt = m.turnStartedAt;
    }
    emitRoom(room, 'game:event', evt);
  }

  // Housekeeping sweep: (1) un-stick a bot that never moved, (2) auto-pass human
  // turns that exceed TURN_TIMEOUT.
  function startSweep() {
    setInterval(() => {
      for (const room of rooms.values()) {
        const m = room.match;
        if (!m || m.state !== 'playing') continue;
        const stale = Date.now() - m.turnStartedAt;

        if (m.isBotTurn()) {
          if (!room.botScheduled && stale > 4000) {
            room.botScheduled = true;
                    runBotStep(room).catch(() => {}).finally(() => {
                      room.botScheduled = false;
                    });
                  }
                } else if (TURN_TIMEOUT > 0 && room.seats[m.turn] && room.seats[m.turn].kind === 'human') {
          if (!m.pending && stale > TURN_TIMEOUT * 1000) {
            // auto-pass the idle human
            m.pass(m.turn);
            const evt = { type: 'pass', by: m.turn, auto: true };
            broadcastGameEvent(room, evt);
            scheduleBotIfNeeded(room);
          }
        }
      }
    }, 2000);
  }

function endMatch(room, winnerSeat, guessedBy) {
  if (room.state !== 'playing') return;              // idempotent — never double-emit "over"
  room.state = 'over';
  room.overAt = Date.now();
  room.botScheduled = false;
  const m = room.match;
  const wq = m.history[winnerSeat].length;
  let winnerPts = 10 + Math.max(0, Math.min(5, 12 - wq));
  let loserPts = 2;
  if (room.woke) { winnerPts += 2; loserPts += 1; } // woke games are worth more
  const gb = typeof guessedBy === 'number' ? guessedBy : winnerSeat;
    // Reveal the card the final GUESSER was trying to identify (the other seat's person).
    const revealedIdx = m.targets[1 - gb];
    emitRoom(room, 'game:event', {
      type: 'over',
      gen: m.gen,
      winner: winnerSeat,
      winnerName: m.seats[winnerSeat].name,
      guessedBy: gb,
      guessedName: m.lastGuess ? m.lastGuess.name : null,
      winnerPts,
      loserPts,
      woke: room.woke,
      targetName: m.cardById(revealedIdx).name,
      targetId: revealedIdx,
      questions: m.turnCount
    });
  // schedule cleanup
  setTimeout(() => { if (room.state === 'over') rooms.delete(room.code); }, 10 * 60 * 1000);
}

// ---------------------------------------------------------------- socket io

io.on('connection', (socket) => {
  // ---- create online room
  socket.on('create', (data, ack) => {
    const name = sanitizeName(data && data.name) || 'Player';
    const code = genCode();
    const room = makeRoom(code, {
      playerId: (data && data.playerId) || makePlayerId(),
      name, emoji: EMOJIS[0], online: true, socketId: socket.id, kind: 'human'
        }, data && data.woke);
    rooms.set(code, room);
    socket.join('room:' + code);
        socket.emit('lobby:update', roomSnapshot(room));
        if (ack) ack({ ok: true, code, seat: 0, playerId: room.seats[0].playerId, packId: room.packId, woke: room.woke });
      });

  // ---- join online room (also used for reconnecting mid-game)
  socket.on('join', (data, ack) => {
    const code = String((data && data.code) || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return ack && ack({ ok: false, error: 'Room not found.' });

    const name = sanitizeName(data && data.name) || 'Player';
    const playerId = data && data.playerId;

    // rejoin: same player, game in progress
    const existingSeat = seatOf(room, playerId);
    if (existingSeat !== -1) {
      const s = room.seats[existingSeat];
      if (s) {
        s.socketId = socket.id;
        s.online = true;
        if (room.voidTimer) { clearTimeout(room.voidTimer); room.voidTimer = null; }
        socket.join('room:' + code);
        if (room.match) {
          const m = room.match;
          socket.emit('game:start', {
            seat: existingSeat,
            packId: room.packId,
            packName: PACK_MAP[room.packId].name,
                woke: room.woke,
                board: m.cardsForSeat(existingSeat),
                targetId: m.targets[existingSeat],
                flips: Array.from(m.flips[existingSeat]),
                turn: m.turn,
                players: roomSnapshot(room).players,
                pending: m.pending ? { from: m.pending.from, text: m.pending.text } : null
              });
              socket.emit('game:history', { seat: existingSeat, history: m.history[existingSeat] });
            }
            emitRoom(room, 'lobby:update', roomSnapshot(room));
            if (room.state === 'playing') socket.emit('game:event', { type: 'turn', turn: room.match.turn });
            return ack && ack({ ok: true, code, seat: existingSeat, playerId, state: room.state });
          }
        }

    if (room.state !== 'lobby') return ack && ack({ ok: false, error: 'Match already started.' });
    if (room.seats[1]) return ack && ack({ ok: false, error: 'Room is full.' });

    room.seats[1] = {
      playerId: playerId || makePlayerId(),
      name, emoji: EMOJIS[1], online: true, socketId: socket.id, kind: 'human'
    };
    socket.join('room:' + code);
    emitRoom(room, 'lobby:update', roomSnapshot(room));
    if (ack) ack({ ok: true, code, seat: 1, playerId: room.seats[1].playerId, state: room.state });
  });

  // ---- bot match (solo practice)
  socket.on('botMatch', (data, ack) => {
    const code = genCode();
    const room = makeRoom(code, {
      playerId: (data && data.playerId) || makePlayerId(),
      name: sanitizeName(data && data.name) || 'Player',
      emoji: EMOJIS[0], online: true, socketId: socket.id, kind: 'human'
      }, data && data.woke);
    room.seats[1] = { playerId: 'bot-' + code, name: 'Detective Bot', emoji: '🤖', online: true, socketId: null, kind: 'bot' };
    if (data && data.packId && PACK_MAP[data.packId]) room.packId = data.packId;
    rooms.set(code, room);
    socket.join('room:' + code);
    startMatch(room);
      if (ack) ack({ ok: true, code, seat: 0, playerId: room.seats[0].playerId, packId: room.packId, woke: room.woke });
  });

  // ---- lobby controls (host only)
  socket.on('lobby:setPack', (data, ack) => {
    const room = socketRoom(socket);
    if (!room) return ack && ack({ ok: false, error: 'Not in a room.' });
    const seat = seatOfPlayer(room, socket);
    if (seat !== room.host) return ack && ack({ ok: false, error: 'Only the host can change the pack.' });
    if (!PACK_MAP[data.packId]) return ack && ack({ ok: false, error: 'Unknown pack.' });
    room.packId = data.packId;
    emitRoom(room, 'pack:change', { packId: data.packId, packName: PACK_MAP[data.packId].name });
    if (ack) ack({ ok: true });
  });

  socket.on('lobby:start', (data, ack) => {
    const room = socketRoom(socket);
    if (!room) return ack && ack({ ok: false, error: 'Not in a room.' });
    const seat = seatOfPlayer(room, socket);
    if (seat !== room.host) return ack && ack({ ok: false, error: 'Only the host can start.' });
    if (room.state !== 'lobby') return ack && ack({ ok: false, error: 'Already started.' });
    if (!room.seats[1]) return ack && ack({ ok: false, error: 'Waiting for an opponent.' });
    if (!room.seats[0].online || !room.seats[1].online) return ack && ack({ ok: false, error: 'Opponent is offline.' });
    startMatch(room);    if (ack) ack({ ok: true });
  });

  socket.on('lobby:setWoke', (data, ack) => {
      const room = socketRoom(socket);
      if (!room) return ack && ack({ ok: false, error: 'Not in a room.' });
      const seat = seatOfPlayer(room, socket);
      if (seat !== room.host) return ack && ack({ ok: false, error: 'Only the host can toggle woke mode.' });
      room.woke = !!data.woke;
      emitRoom(room, 'woke:change', { woke: room.woke });
      if (ack) ack({ ok: true, woke: room.woke });
    });

    // ---- game actions
    socket.on('game:ask', (data, ack) => {
      const room = socketRoom(socket);
      if (!room) return ack && ack({ ok: false, error: 'Not in a room.' });
      const seat = seatOfPlayer(room, socket);
      const m = room.match;
      if (!m) return ack && ack({ ok: false, error: 'Game not started.' });
      const res = m.ask(seat, data.text);
      if (!res.ok) return ack && ack(res);
      broadcastGameEvent(room, { type: 'ask', by: seat, text: String(data.text).trim().slice(0, 240) });
            if (m.state === 'over') endMatch(room, m.winner, seat);
      else scheduleBotIfNeeded(room);
      if (ack) ack({ ok: true });
    });

    socket.on('game:answer', (data, ack) => {
      const room = socketRoom(socket);
      if (!room) return ack && ack({ ok: false, error: 'Not in a room.' });
      const seat = seatOfPlayer(room, socket);
      const m = room.match;
      if (!m) return ack && ack({ ok: false, error: 'Game not started.' });
          const yes = typeof data.yes === 'boolean' ? data.yes : null; // null = "don't know"
          const res = m.answer(seat, yes);
          if (!res.ok) return ack && ack(res);
          broadcastGameEvent(room, Object.assign({ type: 'answer' }, res));
          if (m.state === 'over') {
                      endMatch(room, m.winner, seat);
          } else {
            // after an answer the turn goes to the ANSWERER (who can then ask).
            // If that's the bot, schedule it (this was the "bot thinking forever" deadlock).
            scheduleBotIfNeeded(room);
            // AI elimination assist for the human asker — opt-in only
                        if (uiSettings.autoEliminate && llm.llmEnabled() && res.answer !== null && room.seats[res.from] && room.seats[res.from].kind === 'human') {
              runAIElimination(room, res.from, res.text, res.answer);
            }
          }
          if (ack) ack({ ok: true, ...res });
        });

    socket.on('game:flip', (data, ack) => {
      const room = socketRoom(socket);
      if (!room) return ack && ack({ ok: false, error: 'Not in a room.' });
      const seat = seatOfPlayer(room, socket);
      const m = room.match;
      if (!m) return ack && ack({ ok: false, error: 'Game not started.' });
      if (Array.isArray(data.ids)) {
        m.setFlips(seat, data.ids);
        return ack && ack({ ok: true, flips: Array.from(m.flips[seat]) });
      }
      return ack && ack({ ok: false, error: 'Bad flips payload.' });
    });

    // ---- state recovery
    socket.on('game:sync', (data, ack) => {
      const room = socketRoom(socket);
      if (!room) return ack && ack({ ok: false, error: 'Not in a room.' });
      const seat = seatOfPlayer(room, socket);
      const m = room.match;
      if (!m) return ack && ack({ ok: false, error: 'Game not started.' });
      if (ack) ack({
        ok: true,
        turn: m.turn,
        pending: m.pending ? { from: m.pending.from, text: m.pending.text } : null,
        flips: Array.from(m.flips[seat]),
        state: m.state
      });
    });

  socket.on('game:pass', (data, ack) => {
    const room = socketRoom(socket);
    if (!room) return ack && ack({ ok: false, error: 'Not in a room.' });
    const seat = seatOfPlayer(room, socket);
    const m = room.match;
    if (!m) return ack && ack({ ok: false, error: 'Game not started.' });
    const res = m.pass(seat);
    if (!res.ok) return ack && ack(res);
    emitRoom(room, 'game:event', { type: 'pass', by: seat });
    scheduleBotIfNeeded(room);
    if (ack) ack({ ok: true });
  });

  socket.on('game:guess', (data, ack) => {
    const room = socketRoom(socket);
    if (!room) return ack && ack({ ok: false, error: 'Not in a room.' });
    const seat = seatOfPlayer(room, socket);
    const m = room.match;
    if (!m) return ack && ack({ ok: false, error: 'Game not started.' });
    const res = m.guess(seat, data.id);
    if (!res.ok) return ack && ack(res);
    broadcastGameEvent(room, { type: 'guess', by: seat, id: data.id, correct: res.correct, targetId: res.targetId, targetName: res.targetName, guessedName: res.guessedName });
        endMatch(room, m.winner, seat);
    if (ack) ack({ ok: true, ...res });
  });

  socket.on('game:rematch', (data, ack) => {
    const room = socketRoom(socket);
    if (!room) return ack && ack({ ok: false, error: 'Not in a room.' });
    if (room.state === 'over') {
      // keep the same seats; the bot seat stays a bot
      room.state = 'lobby';
      room.match = null;
      startMatch(room);
      if (ack) ack({ ok: true });
    } else if (ack) ack({ ok: false, error: 'Match in progress.' });
  });

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const seat = room.seats.findIndex(s => s && s.socketId === socket.id);
      if (seat === -1) continue;
      const s = room.seats[seat];
      s.online = false;
      emitRoom(room, 'lobby:update', roomSnapshot(room), socket.id);
      if (room.state === 'playing' && room.match) {
        emitRoom(room, 'room:opponent', { seat, online: false });
        if (!room.voidTimer) {
          room.voidTimer = setTimeout(() => {
            if (room.state === 'playing') {
              const other = room.seats.map((x, i) => i).filter(i => i !== seat && room.seats[i] && room.seats[i].online);
              if (other.length === 0) { rooms.delete(room.code); return; }
              room.state = 'void';
              emitRoom(room, 'game:event', { type: 'void', gen: room.match && room.match.gen, reason: 'Opponent left.' });
              rooms.delete(room.code);
            }
          }, 60000);
        }
      }
    }
  });
});

// ---------------------------------------------------------------- helpers
function makePlayerId() {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function sanitizeName(n) {
  return String(n || '').replace(/[<>&]/g, '').trim().slice(0, 20);
}
function socketRoom(socket) {
  for (const room of rooms.values()) {
    if (room.seats.some(s => s && s.socketId === socket.id)) return room;
  }
  return null;
}
function seatOfPlayer(room, socket) {
  return room.seats.findIndex(s => s && s.socketId === socket.id);
}

// ---------------------------------------------------------------- boot
function boot() {
  // Prune abandoned lobbies (no one here after 30 min) to avoid unbounded growth.
  setInterval(() => {
    for (const [code, room] of rooms) {
      if (room.state === 'lobby' && Date.now() - room.createdAt > 30 * 60 * 1000) rooms.delete(code);
    }
  }, 5 * 60 * 1000);

  // Bot watchdog + human turn timeouts.
  startSweep();

  server.listen(PORT, '0.0.0.0', () => {
    console.log('🕵️  Who Dis? server running');
    console.log(`   Local:   http://localhost:${PORT}`);
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const iface of ifaces || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`   LAN:     http://${iface.address}:${PORT}   (open this on your phone)`);
        }
      }
    }
  });
}

if (require.main === module) {
  boot();
}

module.exports = { app, server, io, boot };