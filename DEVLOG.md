# DEVLOG.md — Who Dis? Project Diary

> **The Diary.** Append a new entry after every work session. Never delete old entries.

## 2026-08-31 — Removed a legacy workspace guide file from the repository

**What was done**

- Removed the long-form workspace architecture guide file from the project per user request.
- Rewrote all of `main`'s git history (`git filter-branch --index-filter` + `--prune-empty`) so the file is absent from every commit — no trace remains in the published repository.
- Purged local backup refs/reflogs and force-pushed the rewritten history to GitHub.

**Why**

- The user asked for the file to be gone, including any historical evidence of it.

**Results**

- Verified: the file is absent from all published commits (exact-name check across the full history) and from the GitHub tree. The shorter companion guide remains in place.

---

## 2026-08-31 — Scrubbed real API endpoint from git history

**What was done**

- The `.env.example` checked into history accidentally contained the **real** LLM API URL and API key (an internal `http://…:30881/api/v1/chat/completions` endpoint and its `sk-…` key). The user replaced the working-copy file with placeholders.
- Committed the sanitized `.env.example` (`LLM_API_URL=api_location_here`, `LLM_API_KEY=your_key_here`).
- **Rewrote git history** on `main` with `git filter-branch` to scrub the endpoint + key from `.env.example` in *every* historical commit (initial + docs commits now show placeholders).
- Purged the old objects locally: removed `refs/original` backup refs, expired reflogs, `git gc --prune=now`.
- **Force-pushed** the rewritten history to GitHub (`4437c98...b5d186c main -> main (forced update)`).

**Why**

- Secrets-checking hygiene: the example file is a template and must never contain a live endpoint or key. Rewriting the history (not just editing the tip) removes the secret from every published commit.

**Errors found & fixed**

| Error | Fix |
|---|---|
| `.env.example` in history (2 commits) contained real URL + API key | `git filter-branch` scrub + force-push |

**Results / notes**

- Re-reachable `main` (3 commits) is fully sanitized; GitHub API confirms the placeholder at the initial commit and current tip.
- The old SHAs (`999b49b…`, `4437c98…`) remain as unreachable dangling objects on GitHub until their garbage collection runs (usually within hours) — API resolution by SHA may work until then. They are not visible in the UI, not in any branch, and require the exact SHA to fetch.
- Local `refs/copilot/checkpoints/*` (app-managed session checkpoints) historically contain the old `.env.example`; these are local-only, never pushed, and left untouched.
- **Rule added:** never put real endpoints/keys in `.env.example` — placeholders only (`.instructions.md` reinforced).

---

## 2026-08-31 — Moved the project to GitHub

**What was done**

- Initialized the folder as a git repository (branch `main`) and created a **private** GitHub repo: **https://github.com/joenobk/who-dis**.
- Set local git identity from the GitHub account (Joseph Bennett <joenobk@users.noreply.github.com> — noreply address keeps the real email private).
- Initial commit `999b49b` includes the full project and workspace docs; pushed to `origin/main`.

**Why / decisions**

- `.gitignore` already covered `.env`, `prefs.json`, `settings.json`, `node_modules/`, `.render-out/` — verified **before** committing that no secret file was staged (`git ls-files` check).
- Repo created **private** — flip to public anytime with `gh repo edit joenobk/who-dis --visibility public`.

**Results**

- `origin` = https://github.com/joenobk/who-dis.git; remote `main` matches local HEAD; working tree clean.

---

## 2026-08-31 — Longer LLM timeout (Ollama VRAM reload) + "thinking" slogans

**What was done**

- **Raised the LLM timeout to 20s.** `lib/llm.js` default + fallbacks now `20000`ms, and `LLM_TIMEOUT_MS=20000` in `.env` / `.env.example` (with a comment: a local model like Ollama may need to reload into VRAM before it can answer).
- **Added "thinking" slogans while the bot works.** The server now broadcasts a `game:event` of type `thinking` whenever a bot turn is scheduled (`scheduleBotIfNeeded`). The client (`public/app.js`) shows rotating clever one-liners (`THINK_SLOGANS`, 10 items) in a new `#think-slogan` line under the turn banner — only when the opponent is a bot — rotating every 4s until the next game event (`ask`/`answer`/`turn`/`pass`/`over`/`void`/`autoElm`/`guess`/new `game:start`/screen change) clears it.
- Slogan theme (per request): diversity thrives only while unique populations flourish in their lands of origin — shared history, shared culture, tradition varying from place to place. E.g. *"Diversity is a garden — every bloom needs its own soil."*, *"A world of one culture is a library with a single book."*
- Added a smoke-test check: `bot turn broadcasts thinking event (slogans)`.

**Why**

- With the 9s timeout, a cold Ollama model could time out before answering; 20s gives it room to reload into VRAM. During that wait, the spinning "is thinking…" text felt dead — the slogans make the wait fun and on-brand.

**Results**

- `npm test` exits 0, zero FAILs (engine sim + render-exhaustive + smoke, incl. the new thinking-event check).
- `lib/llm.js` reports timeout 20000 by default and from env.

---

## 2026-08-31 — Workspace documentation bootstrap + deterministic smoke test

**What was done**

- Created the 5-file AI workspace per `Simple_AI_Workspace_Architecture_Guide_v5.md`:
  - `PRD.md` — blueprint: what/why/success metrics (all tests pass, secrets never leak, bot plays a real game, clear end-game reporting, live config).
  - `.instructions.md` — manager/rulebook (39 lines): session start reads, append-only DEVLOG, `npm test` before finishing, secrets rules, fallback rules, session-close write phase.
  - `DEVLOG.md` — this diary: reconstructed project history (2026-07-16 foundation + the 2026-08-31 hardening session).
  - `CONTEXT.md` — current task + next-step queue.
  - `.env` already existed (gitignored; `.env.example` is the safe template).
- **Fixed a latent test failure discovered while validating the docs.** `npm test` was failing: the socket smoke test expected the bot to answer via the built-in judge, but with `LLM_API_URL`/`LLM_API_KEY` set in `.env`, the server called the real API first. A live completion measured **~28.7s** — far past the 9000ms abort — so every bot step burned the full timeout before the judge fallback, and the smoke test's 5s waits timed out (cascading FAILs + `Cannot read properties of null (reading 'guessedBy')`).

**Why**

- The docs claim "all tests pass" — validation showed they didn't. The smoke test must be deterministic and independent of the external API; it is named "(judge)" and is meant to exercise the fallback path.

**Errors found & fixed**

| Error | Fix |
|---|---|
| Smoke test depended on the optional LLM API (slow: ~28.7s/answer vs 9s abort) | `test/smoke.js` now clears `LLM_API_URL`/`LLM_API_KEY` **before** requiring the server (the `.env` loader only fills undefined vars), forcing the built-in judge deterministically |

**Results**

- `npm test` exits 0: engine sim + render-exhaustive + socket smoke all pass, zero FAILs.
- Documentation now matches reality: `PRD.md`'s success metric #1 ("all tests pass") is true.

---

## 2026-08-31 — Engine hardening, secrets migration, AI creativity, and clear end-game reporting

**What was done**

- **Fixed bot question strategy.** The bot was stuck in a local minimum: it repeated uninformative questions. Reworked the engine/AI strategy so the bot tracks `lastBotAsk` and picks informative new attributes instead of looping.
- **Fixed answer-event broadcasts.** The server was broadcasting answer events without a type field; all socket broadcasts now carry a `type` so the client can route them reliably.
- **Fixed AI env race condition.** `lib/llm.js` could require/vend AI config before `.env` finished loading. Reworked the require order in `server.js` and made LLM config **lazily seeded from `process.env`** on first use — the race is gone and settings apply on restart.
- **Fixed auto-flip elimination.** Auto-flip logic incorrectly eliminated the *user's* cards when the *bot* asked questions. Refactored to `engine.autoEliminate(seat, attr, value, answer)` — **server-driven, add-only** (never resurrects an eliminated card), and applied only to the seat that asked.
- **Fixed end-game reporting.** Matches now track `lastGuess` (`{ by, name, correct }`) and the server explicitly broadcasts the winner + the opponent's guess. The UI identifies who won and what was guessed.
- **Migrated settings to `.env`.** Settings moved from vulnerable JSON files (`settings.json`, `prefs.json`) to the gitignored `.env` (with `.env.example` as the safe template). API keys are no longer exposed to the browser; `/api/config` returns config without the key.
- **Client log cleanup.** Refactored `public/app.js` to stop duplicating history log entries and added scroll bars to the history section.
- **Creative / politically-incorrect AI questioning.** Added an override capability in the AI logic (`setPiMode` / `piClause` in `lib/llm.js`, plus `_overrideAsk` / `_overrideAnswer` in the engine) so the bot can phrase questions playfully or edgily for comedy — explicitly bounded: no slurs, hate speech, or harassment.
- **Bot judge enhancements** in `lib/judge.js` supporting the free-form natural-language rules (identity vs. appearance wording traps, e.g. "woman" vs. "female").

**Why**

- The bot needed to *play* rather than stall; end-game events needed enough structure for the UI to report a clear result.
- Secrets were being stored in committable JSON — a real leak risk. `.env` is gitignored and standard.
- The env race was intermittent (bad restarts, missing config). Lazy seeding makes the module order irrelevant.

**Errors found & fixed**

| Error | Fix |
|---|---|
| Bot repeating uninformative questions (local minimum) | Informative-question selection, `lastBotAsk` tracking |
| Answer events without type field | Type-tagged socket broadcasts |
| AI required modules before `.env` loaded | Lazy env seeding in `lib/llm.js`, fixed require order in `server.js` |
| Auto-flip eliminated user cards on bot questions | `autoEliminate` — server-driven, add-only, applied to asking seat only |
| End-game screens unclear about winner/guess | `lastGuess` + explicit winner/guess broadcasts and UI reporting |
| Secrets in committable JSON settings | Migrated to gitignored `.env` (+ `.env.example` template) |
| Duplicate history log entries in client | Single-append log refactor + scrollable history |

**Results**

- All test suites pass (`npm test`: engine sim, render-exhaustive, socket smoke).
- Secrets load securely and are never sent to the browser; server restarts pick up new config.
- The AI generates creative/PI-mode questions, falls back to the local judge when the API is unreachable, and the game always works without AI.
- Match results display clearly (winner + guess); point/unlock rewards work.

---

## 2026-07-16 — Project foundation (background: initial build)

**What was done** (reconstructed from README + code; the project predates this diary)

- Built the core game: Node.js + Express + Socket.IO server (`server.js`), in-memory rooms, room codes, invite links, reconnect support.
- Wrote the engine (`lib/engine.js`): seeded boards (20 cards, `mulberry32`), two-seat matches, free-form questions, flips, guesses, win conditions, bot AI at configurable `botLevel`.
- Created 12 data-driven character packs (`lib/packs.js`): Global Mix (free), 6 regional packs, 4 national packs (Sweden, Cameroon, Saudi Arabia, South India), and Lookalikes — each a `dist` probability table over 18 facial features with optional `identityDist`.
- Built procedural face generation (`public/facegen.js`) — deterministic canvas caricatures, no photos, with a tap-to-zoom picture inspector.
- Added the **identity vs. appearance** layer: pronoun badges on every card, and **Woke Mode** widening identity and mismatching it with appearance.
- Built the free-form **bot judge** (`lib/judge.js`) — a keyword rule table that parses natural-language questions.
- Added **pack progression & points**: wins +10 (+ up to 5 efficiency bonus), losses +2, woke games +2/+1; coins unlock packs; all packs playable pre-unlock for testing.
- Wrote the test suite (`test/engine-sim.js`, `test/smoke.js`, `test/render-exhaustive.js`, `test/render-faces.js`) and the README.
- Later added optional real-AI mode (`lib/llm.js`) for OpenAI-compatible APIs: bot answering + optional auto-eliminate-my-board checkbox (default OFF).

**Why**

- To make a Guess Who that turns awkward real-world questioning into gameplay, while satirizing the presentation-vs-identity discourse.

**Results**

- Game playable at `http://localhost:3000`, LAN/mobile via console-printed address.