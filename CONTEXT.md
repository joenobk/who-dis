# CONTEXT.md — Current Task (The Sticky Note)

> This file changes every session. It keeps the AI focused on the *next* step.

## Current State (as of 2026-08-31)

- **Who Dis?** is feature-complete and stable. **All tests pass** (`npm test` exits 0: engine sim, render-exhaustive, socket smoke — zero FAILs).
- **Now on GitHub**: private repo **https://github.com/joenobk/who-dis** (branch `main`, origin pushed). `.env` and other secret/settings files are gitignored and untracked.
- **LLM timeout is 20s** (`lib/llm.js` default + `.env` `LLM_TIMEOUT_MS=20000`) — a local model (Ollama) gets time to reload into VRAM before the judge fallback kicks in.
- **Thinking slogans shipped**: the server broadcasts `type:'thinking'` when a bot turn is scheduled; the client rotates clever diversity/homeland one-liners under the turn banner while the bot works (bot opponents only), cleared on the next game event.
- **Workspace docs are in place** (per `Simple_AI_Workspace_Architecture_Guide_v5.md`): `PRD.md`, `.instructions.md`, `DEVLOG.md`, `CONTEXT.md`, and the gitignored `.env`.
- The socket smoke test is **deterministic**: it clears `LLM_API_URL`/`LLM_API_KEY` before requiring the server, so the bot always uses the built-in judge — no dependence on the external API.
- Secrets live in gitignored `.env` (template: `.env.example`); server never exposes the API key.
- Bot plays informative questions; AI answers free-form with a real model and falls back to `lib/judge.js` when unavailable.
- End-game screens report winner + opponent's guess (`lastGuess`).
- Woke Mode, PI (politically incorrect) AI mode, pack progression, and the Enlargeable picture inspector all work.

## Current Task

**DONE — GitHub setup:**
- ✅ git repo initialized (branch `main`), local identity set
- ✅ Initial commit pushed to **https://github.com/joenobk/who-dis** (private)
- ✅ Verified: no secret files tracked, remote matches local HEAD, tree clean

## Next Step (pending)

Pick the first real improvement from this list (ask the user or take the top one):

1. **AI question quality tuning** — extend `lib/judge.js` keyword table and validate with `node test/engine-sim.js`; watch for new local-minimum question loops.
2. **Persistence** — rooms are in-memory; a restart clears active games. Consider optional persistence or graceful shutdown notices.
3. **New packs** — add a community pack (see `README.md` → "Writing your own packs"; any `VOCAB` key works).
4. **Polish** — mobile layout QA of the history scroll bars / inspector zoom; reduce `test/` flakiness if any.
5. **Deploy config** — verify `PORT`, `TURN_TIMEOUT`, and AI settings on a host (Railway/Render/Fly.io).

## Validation Checklist (before closing a session)

- [ ] `npm test` passes
- [ ] `.env` untouched by commits; no secrets in client code or logs
- [ ] DEVLOG.md appended with today's entry
- [ ] This file updated with the next step