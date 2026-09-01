// Who Dis? — optional AI integration.
// If LLM_API_URL + LLM_API_KEY are set, the game can (1) let the bot answer
// free-form questions with a real model, and (2) map a free-form question to a
// trait so the asker's board is auto-eliminated. Any failure falls back to the
// local judge, so the game always works without AI.

const { VOCAB, VOCAB_MAP } = require('./packs');

let cfg = {
  url: '',
  key: '',
  model: 'gpt-4o-mini',
  timeout: 20000   // generous: local models (e.g. Ollama) may need to reload into VRAM
};
// Lazy env seeding — on first use, fill any unset fields from the environment.
function seed() {
  if (!cfg.url && process.env.LLM_API_URL) cfg.url = process.env.LLM_API_URL.trim();
  if (!cfg.key && process.env.LLM_API_KEY) cfg.key = process.env.LLM_API_KEY.trim();
  if (!cfg.model && process.env.LLM_MODEL) cfg.model = process.env.LLM_MODEL.trim();
  if (process.env.LLM_TIMEOUT_MS != null) cfg.timeout = Number(process.env.LLM_TIMEOUT_MS) || 20000;
}

// Politically-incorrect mode makes the AI's questions playful/edgy for humor.
// Explicitly bounded: no slurs, no hate, keep it a game.
let piMode = false;
function setPiMode(v) { piMode = !!v; }
function getPiMode() { return piMode; }
function piClause() {
  return piMode
    ? 'You may phrase questions playfully, cheekily, or edgily for comedy — but NEVER use slurs, hate speech, or real harassment. Stay a game.'
    : 'Keep phrasing polite and neutral.';
}

function configure(partial) {
  seed();
  if (!partial) return;
  // explicit blank string = user cleared it
  if (typeof partial.llmApiUrl === 'string') cfg.url = partial.llmApiUrl.trim();
  if (typeof partial.llmApiKey === 'string') cfg.key = partial.llmApiKey.trim();
  if (typeof partial.llmModel === 'string' && partial.llmModel.trim()) cfg.model = partial.llmModel.trim();
  if (partial.llmTimeout != null) cfg.timeout = Number(partial.llmTimeout) || 20000;
}
function llmEnabled() { seed(); return !!(cfg.url && cfg.key); }
function getModel() { seed(); return cfg.model; }
function getUrl() { seed(); return cfg.url; }
function getKey() { seed(); return cfg.key; }
function getTimeout() { seed(); return cfg.timeout; }

function vocabHint() {
  return VOCAB.map(v => v.key + ': [' + v.values.join(', ') + ']').join('; ');
}

async function callLLM(prompt, maxTokens = 30) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), cfg.timeout);
  try {
    const resp = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: maxTokens
      }),
      signal: ctrl.signal
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return text ? String(text).trim() : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function canonAttrValue(attr, value) {
  const v = VOCAB_MAP[attr];
  if (!v) return null;
  const val = v.values.find(x => x.toLowerCase() === String(value).toLowerCase());
  return val ? { attr, value: val } : null;
}

/**
 * Judge a free-form question against a card with the LLM.
 * Returns { answer } or null (caller falls back to the local judge).
 */
async function judgeWithLLM(text, card) {
  if (!llmEnabled()) return null;
  const cardJson = JSON.stringify(card);
  const prompt =
    'You are a literal, slightly awkward judge in a Guess-Who-style game.\n' +
    'The suspect\'s hidden person has these traits (JSON): ' + cardJson + '\n' +
    'Answer this yes/no question strictly from those traits: "' + text + '"\n' +
    'Reply with exactly ONE word: YES or NO.\n' +
    'Optional: after the word, add ":traitKey" and then ":value" if the question is clearly about one trait (e.g. "YES:earLobe:attached"). traitKey must be from: ' + VOCAB.map(v => v.key).join(', ') + '.\n' +
    'Trap to respect: "is she a woman?" is about the IDENTITY trait; "is she female?" is about the GENDER (appearance) trait.\n' +
    piClause() + '\n' +
    'If the question is not about a trait (e.g. "is she hot?"), answer YES or NO only.';
  const out = await callLLM(prompt);
  if (!out) return null;
  const m = out.toUpperCase().match(/^(YES|NO)(?::([A-Za-z_]+)(?::(.+))?)?/);
  if (!m) return null;
  const res = { answer: m[1] === 'YES', attr: null, value: null };
  if (m[2]) {
    const cv = canonAttrValue(m[2], m[3] || '');
    if (cv) { res.attr = cv.attr; res.value = cv.value; }
  }
  return res;
}

/**
 * Have the LLM pick a useful trait AND phrase a clever, fun question for the
 * bot's turn. Returns { attr, value, phrase } or null (caller falls back to the
 * built-in structured question).
 */
async function askBotQuestion(cands, opts) {
  if (!llmEnabled()) return null;
  opts = opts || {};
  const sample = cands.slice(0, 12).map(c => {
    const o = {};
    for (const k of Object.keys(c)) if (k !== 'name' && k !== 'id') o[k] = c[k];
    return o;
  });
  const prompt =
    'You are the detective in a Guess-Who game against a human. Choose ONE yes/no question that best splits these candidates (JSON): ' + JSON.stringify(sample) + '\n' +
    'Trap to respect: "is she a woman?" = IDENTITY trait; "is she female?" = GENDER (appearance) trait. So "a woman" -> identity:woman, "female" -> gender:female.\n' +
    piClause() + '\n' +
    'Reply with exactly ONE line: traitKey|value|the clever question text. Example: earLobe|attached|Be honest — are their earlobes welded to the skull or do they swing free? or identity|woman|Is your person a woman — and I mean REALLY a woman, no fine print?\n' +
    'traitKey must be from: ' + VOCAB.map(v => v.key).join(', ') + '. Value must be a valid value for that trait. Keep the question YES/NO answerable.';
  const out = await callLLM(prompt, 60);
  if (!out) return null;
  const m = String(out).trim().split(/\r?\n/)[0].match(/^([A-Za-z_]+)\|([^|]+)\|(.+)$/);
  if (!m) return null;
  const cv = canonAttrValue(m[1], m[2]);
  if (!cv) return null;
  return { attr: cv.attr, value: cv.value, phrase: m[3].trim() };
}

/**
 * Map a free-form question to the trait it is most clearly about.
 * Returns { attr, value } or null.
 */
async function mapTraitWithLLM(text) {
  if (!llmEnabled()) return null;
  const prompt =
    'In a Guess-Who game, a detective asked: "' + text + '"\n' +
    'Map this question to the SINGLE trait from the vocabulary that it is most clearly asking about.\n' +
    'Vocabulary: ' + vocabHint() + '\n' +
    'Trap to respect: a question about "a woman" is about IDENTITY; a question about "female" is about GENDER.\n' +
    'Reply with exactly "traitKey:value" (e.g. earLobe:attached). If the question is not clearly about one trait, reply with just "?".';
  const out = await callLLM(prompt, 15);
  if (!out || out === '?') return null;
  const m = String(out).trim().match(/^([A-Za-z_]+):(.+)$/);
  if (!m) return null;
  return canonAttrValue(m[1], m[2]);
}

module.exports = { llmEnabled, judgeWithLLM, mapTraitWithLLM, askBotQuestion, configure, setPiMode, getPiMode, getModel, getUrl, getKey, getTimeout };