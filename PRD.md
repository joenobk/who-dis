# PRD — Who Dis?

> **The Blueprint.** What we are building, why, and how we know it works.

## What

**Who Dis?** is a real-time multiplayer **Guess-Who-style detective game** for browser and mobile. Instead of clicking "does your person have a hat?", players type **free-form yes/no questions** about physical features (nose bridges, ear lobes, eyebrow thickness) and **identity labels** until they can name the opponent's person.

- **Multiplayer** over internet/LAN with room codes, invite links, and reconnect support (Socket.IO, in-memory rooms).
- **Free-form questioning** — any yes/no question; opponents judge their own picture on the honor system.
- **12 data-driven character packs** — from *Global Mix* (easy) to single-nation boards like Sweden, Cameroon, Saudi Arabia, South India (hard), plus a "Lookalikes" pack.
- **Identity vs. appearance** — every card wears a pronoun badge; "is your person a woman?" checks identity, "is your person female?" checks appearance. They differ.
- **Woke Mode 🌊** — widens the identity pool (trans woman, trans man, non-binary, gender fluid, agender, androgynous) and deliberately mismatches identity with appearance as a satirical difficulty mode.
- **Procedurally generated faces** from 18 features (no photos, no real people) with an **Enlargeable picture inspector** (tap any card to zoom).
- **Pack progression** — wins earn 🪙 coins, unlock card packs (woke wins pay a bonus).
- **Bot practice mode** with a natural-language judge, plus an **optional real-AI mode** (any OpenAI-compatible chat API) that answers questions and can auto-eliminate your board.
- **"Woke Mode" / Politically Incorrect** — an AI override for creative, playful, edgy questioning (explicitly bounded: no slurs, no hate).

## Why

- A party/duel game that plays like Guess Who but lives where the fun actually is: **awkward phrasing, loaded questions, and the honor system**.
- A procedural identity satire: appearance and identity are distinct axes, and players must learn the difference to win — especially in Woke Mode.
- No real people, no photos: every board is original, seeded, deterministic across clients.

## How we measure success

1. **All tests pass** — `npm test` runs: engine simulation (identity/woke/judge/bot), exhaustive face rendering, and end-to-end socket smoke flows. No regressions.
2. **Secrets never leak** — API keys live only in `.env` (gitignored); `/api/config` never returns the key to the browser.
3. **Bot plays a real game** — the AI asks informative questions (no local-minimum repeats, no uninformative loops) and answers free-form questions correctly, falling back to the built-in judge if the API is unreachable.
4. **Clear end-game reporting** — the UI identifies the winner and the opponent's final guess; no ambiguous match endings.
5. **Every feature is playable** — packs playable pre-unlock (unlocking just marks ownership), points/unlock flow works, Woke Mode and PI-mode toggles behave.
6. **Server configuration is live** — settings (LLM URL/key/model, turn timeout) apply on restart; env loads before modules that need it.

## The 5 Workspace Files (per Simple_AI_Workspace_Architecture_Guide_v5.md)

| File | Role |
|---|---|
| `PRD.md` | This blueprint |
| `.instructions.md` | The manager — rules for the AI |
| `DEVLOG.md` | The diary — session history, never delete entries |
| `CONTEXT.md` | The sticky note — current task and next step |
| `.env` | The secret vault — API keys, never committed |

## Tech stack

- **Node.js ≥ 18**, Express + Socket.IO server (`server.js`), in-memory rooms — no database.
- **Vanilla JS client** (`public/app.js`, `public/facegen.js`, `public/index.html`, `public/style.css`) — no build step.
- **Engine** in `lib/engine.js` (board/turn/win logic), **judge** in `lib/judge.js` (keyword rule table), **AI** in `lib/llm.js` (optional OpenAI-compatible client with lazy env seeding), **packs** in `lib/packs.js` (12 packs + seeded generator).
- **Tests** in `test/` — `engine-sim.js`, `smoke.js`, `render-exhaustive.js`, `render-faces.js`.

## Run it

```bash
npm install
npm start          # http://localhost:3000 (console prints LAN address)
PORT=8080 npm start
TURN_TIMEOUT=90 npm start   # auto-pass idle turns after N seconds (0 = off)
```