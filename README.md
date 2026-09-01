# 🕵️ WHO DIS?

A real-time multiplayer **Guess Who** for browser and mobile — but instead of "does your person have a hat?", you'll be typing **free-form yes/no questions** about **nose bridges, ear lobes, eyebrow thickness and identity labels** until you can name your opponent's person.

- **Multiplayer over the internet or LAN** (browser + mobile), room codes & invite links, reconnect support.
- **Free-form questioning** — type any yes/no question. Your opponent must **evaluate their picture** and pass judgment. The fun is in the awkward phrasing, the loaded questions, and the honor system.
- **12 data-driven character packs** — from a diverse *Global Mix* to brutal single-nation boards (Sweden, Cameroon, Saudi Arabia, South India) where everyone looks alike.
- **Identity vs appearance** — every card wears a pronoun badge. "Is your person a woman?" checks *identity*; "is your person female?" checks *appearance*. They are not the same thing. 🌊 **Woke Mode** widens identity (trans woman, trans man, non-binary, gender fluid, agender, androgynous) and deliberately mismatches it with appearance — a satirical difficulty mode where staying within the orthodoxy while solving the case is the whole game.
- **Faces are procedurally generated** from 18 features — no photos, no real people. Tap any card to **zoom in** and inspect it up close.
- **Pack progression** — win matches to earn 🪙 (woke wins pay a bonus), unlock packs.
- **Bot practice** with a judge that parses natural-language questions (and never volunteers anyone's orientation).

## Play

```bash
npm install
npm start
```

Then open **http://localhost:3000** (the console prints your LAN address — open that on your phone to play on mobile).

- **Practice vs Bot** — instant solo game.
- **Create Room** — share the link/code; opponent opens it on any device.
- On your turn: **type a question** (💡 Suggest and quick-trait chips help), your opponent studies their person and answers **YES/NO**, then **you** eliminate everyone who doesn't match by tapping cards (open a card to zoom). Guess a name when one candidate remains — a wrong guess loses instantly.

## The awkward part

Because answers are human judgment, you can ask *anything* — and in Woke Mode the wording matters:

| You ask | Checks | Woke gotcha |
|---|---|---|
| "is your person a woman?" | identity (woman/trans woman) | correct orthodoxy |
| "is your person female?" | appearance (rendered gender) | the polite trap — they may answer NO |
| "does your person pass?" | presentation vs identity | uncomfortable either way |
| "are they non-binary?" | they/them identities | |

The bot judge uses exactly these rules, so practice mode teaches you the minefield.

## How the difficulty works

Packs define per-attribute probability distributions. In *Global Mix* you can separate people by skin tone and hair color. In **Sweden** almost everyone is light-skinned with light hair and blue eyes — so you're forced to inspect `earLobe` (attached vs free), `eyebrowThickness`, `noseBridge`, `noseShape`, `lipFullness`, `freckles`, `jawShape`… Woke mode adds the identity layer on top of any pack.

## Packs & points

| Pack | Region | Diff | Cost |
|---|---|---|---|
| Global Mix | Worldwide | ★ | free |
| East Asia · Europe · Africa · Arab World · Latin America · South Asia | regions | ★★ | 40 |
| Sweden · Cameroon · Saudi Arabia · South India | nations | ★★★ | 80 |
| Lookalikes | everywhere | ★★★★ | 120 |

**All packs are fully playable for testing** even before you unlock them — click
any pack to select it (unlocking with 🪙 just marks them as owned).

Wins: +10 (+ up to 5 efficiency bonus), losses +2. Woke games: +2 extra / +1 extra.

## Writing your own packs

Packs live in [`lib/packs.js`](lib/packs.js). Each pack is:

```js
{
  id: 'myPack', name: 'My Pack', region: '…', difficulty: 2, cost: 40,
  tagline: '…',
  names: { f: ['…'], m: ['…'] },            // first names by rendered gender
  dist: {                                     // per-attribute value weights
    skinTone: { light: 2, medium: 1, brown: 0.5 },
    earLobe:   { attached: 1,  free: 0.5 },   // narrow ranges = harder
    …                                          // any key from VOCAB
  },
  identityDist: {                              // optional woke-mode identity pool
    female: { woman: 30, transWoman: 25, nonBinary: 15, … },
    male: { man: 30, transMan: 25, … }
  }
}
```

The generator samples `dist` per attribute, then assigns `identity` (strict mapping in basic mode, weighted pool in woke mode). Seeded — every client sees the same board because the server sends the full feature list. The bot's free-form judge is [`lib/judge.js`](lib/judge.js) — a keyword rule table you can extend.

## Tech

- **Node.js + Express + Socket.IO** server (in-memory rooms, no database needed)
- **Vanilla JS client** — no build step
- Canvas-based face renderer (`public/facegen.js`), deterministic per card

### Deploying online

Any Node host works (Railway, Render, Fly.io, a VPS):

```bash
PORT=8080 npm start            # set your port
TURN_TIMEOUT=90 npm start      # auto-pass idle human turns after N seconds (0 = off)
```

**Optional real-AI mode** — set these (or use the ⚙ AI Settings button in the menu)
to have the bot answer free-form questions and auto-eliminate your board with a
real model (any OpenAI-compatible chat API):

```bash
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```

"Auto-eliminate my board" is a separate checkbox in ⚙ Settings (default OFF) —
when enabled, the AI maps each of your questions to a trait and flips the cards
it rules out. The bot judge always answers with the real model when AI is on;
if the API is unreachable the game falls back to the built-in judge.

WebSockets must be enabled (default on most hosts). Rooms are in-memory — a restart clears active games.

## Tests

```bash
npm test   # engine sim (identity/woke/judge/bot) · exhaustive face render · end-to-end socket flows
node test/render-faces.js   # renders sample boards to .render-out/*.png for visual QA
```

## Design notes

- Faces are **caricatures** built from feature values; no real person is depicted; every board is original.
- The identity badges are labels on caricatures — the game is a satire of presentation-vs-identity discourse (the "female" question is the trap), and every identity is playable and asked about with the same yes/no honesty. No group is depicted with malice; if a pack makes you uncomfortable, basic mode turns the whole layer off.