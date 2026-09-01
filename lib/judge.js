// Who Dis? — free-form question judge.
// The bot uses this to answer the human's natural-language questions about the
// bot's secret person. It is deliberately literal and a little Lawful-Stupid,
// which is the fun of it:
//    "is your person a woman?"  -> checks IDENTITY  (woman / trans woman)    [woke-correct]
//    "is your person female?"   -> checks APPEARANCE (gender)                [the polite trap]
// Anything it can't parse gets a coin flip — because in this game the
// opponent's judgment IS the judge.

const inArr = (v, arr) => Array.isArray(arr) && arr.includes(v);
function wm(text, words) { return words.some(w => new RegExp('\\b' + w + 's?\\b', 'i').test(text)); }
function pm(text, phrases) { return phrases.some(p => text.includes(p)); }

const SHE = ['woman', 'transWoman'];
const HE = ['man', 'transMan'];
const THEY = ['nonBinary', 'genderFluid', 'agender', 'androgynous'];
const TRANS = ['transWoman', 'transMan'];
const BROWN_HAIR = ['darkBrown', 'brown', 'lightBrown'];
const BROWN_EYE = ['brown', 'darkBrown'];

// Rule: { key, words?, phrases?, fn(card) -> bool }
const RULES = [
  // ---------------- identity / pronouns (the minefield) ----------------
  { key: 'identity', phrases: ['trans woman', 'transwoman', 'mtf'], fn: c => c.identity === 'transWoman' },
  { key: 'identity', phrases: ['trans man', 'transman', 'ftm'], fn: c => c.identity === 'transMan' },
  { key: 'identity', phrases: ['non-binary'], fn: c => inArr(c.identity, THEY) },
  { key: 'identity', words: ['nonbinary', 'enby'], fn: c => inArr(c.identity, THEY) },
  { key: 'identity', phrases: ['gender fluid'], words: ['genderfluid'], fn: c => c.identity === 'genderFluid' },
  { key: 'identity', words: ['agender', 'genderless'], fn: c => c.identity === 'agender' },
  { key: 'identity', words: ['androgynous', 'androgyn'], fn: c => c.identity === 'androgynous' },
  { key: 'identity', phrases: ['trans'], fn: c => inArr(c.identity, TRANS) },

    // ---------------- hair ----------------
  { key: 'hairColor', words: ['blonde', 'blond'], fn: c => c.hairColor === 'blonde' },
  { key: 'hairColor', words: ['brunette'], phrases: ['brown hair'], fn: c => inArr(c.hairColor, BROWN_HAIR) },
  { key: 'hairColor', phrases: ['black hair'], fn: c => c.hairColor === 'black' || c.hairColor === 'darkBrown' },
  { key: 'hairColor', phrases: ['red hair', 'ginger', 'strawberry'], fn: c => c.hairColor === 'red' },
  { key: 'hairColor', phrases: ['grey hair', 'gray hair', 'silver hair', 'white hair'], fn: c => inArr(c.hairColor, ['grey', 'white']) },
  { key: 'hairStyle', words: ['bald', 'hairless'], phrases: ['shaved head'], fn: c => c.hairStyle === 'bald' },
  { key: 'hairStyle', words: ['buzzcut'], phrases: ['buzz cut'], fn: c => c.hairStyle === 'buzz' },
  { key: 'hairStyle', phrases: ['short hair'], fn: c => inArr(c.hairStyle, ['short', 'buzz', 'bald', 'mohawk']) },
  { key: 'hairStyle', phrases: ['long hair'], fn: c => inArr(c.hairStyle, ['long', 'straight', 'braids', 'ponytail']) },
  { key: 'hairStyle', words: ['curly', 'curls'], fn: c => inArr(c.hairStyle, ['curly', 'afro', 'wavy']) },
  { key: 'hairStyle', phrases: ['straight hair'], fn: c => c.hairStyle === 'straight' },
  { key: 'hairStyle', phrases: ['wavy hair'], fn: c => c.hairStyle === 'wavy' },
  { key: 'hairStyle', words: ['afro'], fn: c => c.hairStyle === 'afro' },
  { key: 'hairStyle', words: ['braids', 'braided'], fn: c => c.hairStyle === 'braids' },
  { key: 'hairStyle', words: ['ponytail'], fn: c => c.hairStyle === 'ponytail' },
  { key: 'hairStyle', words: ['mohawk'], fn: c => c.hairStyle === 'mohawk' },

  // ---------------- facial hair ----------------
  { key: 'facialHair', words: ['beard', 'bearded'], fn: c => c.facialHair === 'beard' },
  { key: 'facialHair', words: ['mustache', 'moustache'], fn: c => c.facialHair === 'mustache' },
  { key: 'facialHair', words: ['goatee'], fn: c => c.facialHair === 'goatee' },
  { key: 'facialHair', words: ['stubble'], fn: c => c.facialHair === 'stubble' },
  { key: 'facialHair', phrases: ['clean shaven', 'clean-shaven'], fn: c => c.facialHair === 'none' },
  { key: 'facialHair', phrases: ['facial hair', 'face hair'], fn: c => c.facialHair !== 'none' },

  // ---------------- eyes ----------------
  { key: 'eyeColor', words: ['blue'], fn: c => c.eyeColor === 'blue' },
  { key: 'eyeColor', words: ['green'], fn: c => c.eyeColor === 'green' },
  { key: 'eyeColor', words: ['hazel'], fn: c => c.eyeColor === 'hazel' },
  { key: 'eyeColor', words: ['brown'], phrases: ['brown eyes'], fn: c => inArr(c.eyeColor, BROWN_EYE) },
  { key: 'eyeColor', words: ['grey', 'gray'], fn: c => c.eyeColor === 'grey' },
  { key: 'eyeColor', phrases: ['dark eyes'], fn: c => c.eyeColor === 'darkBrown' || c.eyeColor === 'brown' },
  { key: 'eyeShape', words: ['monolid'], fn: c => c.eyeShape === 'monolid' },
  { key: 'eyeShape', words: ['almond'], fn: c => c.eyeShape === 'almond' },
  { key: 'eyeShape', words: ['hooded', 'droopy'], fn: c => c.eyeShape === 'hooded' },
  { key: 'eyeShape', phrases: ['round eyes'], fn: c => c.eyeShape === 'round' },

  // ---------------- eyebrows ----------------
  { key: 'eyebrowThickness', words: ['unibrow', 'monobrow'], fn: c => c.eyebrowThickness === 'thick' },
  { key: 'eyebrowThickness', phrases: ['thick eyebrow', 'thick brows', 'thick brow', 'big eyebrows'], fn: c => c.eyebrowThickness === 'thick' },
  { key: 'eyebrowThickness', phrases: ['thin eyebrow', 'thin brows', 'thin brow'], fn: c => c.eyebrowThickness === 'thin' },

  // ---------------- nose ----------------
  { key: 'noseShape', phrases: ['wide nose', 'broad nose'], fn: c => c.noseShape === 'wide' || c.noseShape === 'flared' },
  { key: 'noseShape', words: ['hooked'], fn: c => c.noseShape === 'hooked' },
  { key: 'noseShape', words: ['snub'], fn: c => c.noseShape === 'snub' },
  { key: 'noseShape', phrases: ['straight nose'], fn: c => c.noseShape === 'straight' },
  { key: 'noseShape', phrases: ['flared nostrils'], fn: c => c.noseShape === 'flared' },
  { key: 'noseShape', phrases: ['big nose', 'large nose'], fn: c => inArr(c.noseShape, ['wide', 'hooked', 'flared']) },
  { key: 'noseShape', phrases: ['small nose'], fn: c => inArr(c.noseShape, ['narrow', 'snub']) },
  { key: 'noseBridge', phrases: ['high bridge', 'high nose bridge'], fn: c => c.noseBridge === 'high' },
  { key: 'noseBridge', phrases: ['low bridge', 'flat bridge'], fn: c => c.noseBridge === 'low' },

  // ---------------- lips ----------------
  { key: 'lipFullness', phrases: ['thin lips'], fn: c => c.lipFullness === 'thin' },
  { key: 'lipFullness', phrases: ['full lips', 'big lips'], fn: c => c.lipFullness === 'full' },
  { key: 'lipFullness', phrases: ['small lips'], fn: c => c.lipFullness === 'thin' || c.lipFullness === 'medium' },

  // ---------------- ears ----------------
    { key: 'earLobe', phrases: ['attached earlobe', 'attached lobes', 'earlobes attached', 'earlobe attached'], fn: c => c.earLobe === 'attached' },
    { key: 'earLobe', phrases: ['free earlobe', 'free lobes', 'hanging earlobe', 'earlobes hang', 'detached earlobe'], fn: c => c.earLobe === 'free' },
    { key: 'earLobe', words: ['attached'], fn: c => c.earLobe === 'attached' },
    { key: 'earLobe', words: ['detached'], fn: c => c.earLobe === 'free' },
    { key: 'earSize', phrases: ['big ears', 'large ears'], fn: c => c.earSize === 'large' },
    { key: 'earSize', phrases: ['small ears'], fn: c => c.earSize === 'small' },

  // ---------------- glasses ----------------
  { key: 'glasses', words: ['glasses', 'specs', 'spectacles'], fn: c => c.glasses !== 'none' },
  { key: 'glasses', phrases: ['round glasses'], fn: c => c.glasses === 'round' },
  { key: 'glasses', phrases: ['rectangular glasses', 'square glasses'], fn: c => c.glasses === 'rectangular' },
  { key: 'glasses', words: ['aviator'], fn: c => c.glasses === 'aviator' },

  // ---------------- skin ----------------
  { key: 'skinTone', words: ['pale', 'porcelain'], phrases: ['very light skin', 'light skin'], fn: c => c.skinTone === 'veryLight' || c.skinTone === 'light' },
  { key: 'skinTone', words: ['tanned', 'tan'], phrases: ['tan skin'], fn: c => c.skinTone === 'tan' || c.skinTone === 'medium' },
  { key: 'skinTone', phrases: ['dark skin', 'black skin'], words: ['dark-skinned'], fn: c => c.skinTone === 'dark' || c.skinTone === 'brown' },

  // ---------------- freckles ----------------
  { key: 'freckles', words: ['freckle', 'freckled'], fn: c => c.freckles !== 'none' },

  // ---------------- headwear ----------------
  { key: 'headwear', phrases: ['head covering', 'head cover'], words: ['hat'], fn: c => c.headwear !== 'none' },
  { key: 'headwear', words: ['hijab', 'veil'], phrases: ['headscarf', 'head scarf'], fn: c => c.headwear === 'hijab' },
  { key: 'headwear', words: ['turban'], fn: c => c.headwear === 'turban' },
  { key: 'headwear', words: ['ghutra', 'keffiyeh', 'agal'], fn: c => c.headwear === 'ghutra' },
  { key: 'headwear', words: ['beanie'], fn: c => c.headwear === 'beanie' },
  { key: 'headwear', words: ['cap'], fn: c => c.headwear === 'cap' },

  // ---------------- face / jaw shape ----------------
  { key: 'jawShape', phrases: ['square jaw'], fn: c => c.jawShape === 'square' },
  { key: 'jawShape', phrases: ['pointed chin', 'pointy chin'], fn: c => c.jawShape === 'pointed' },
  { key: 'headShape', phrases: ['round face'], fn: c => c.headShape === 'round' },
  { key: 'headShape', phrases: ['oval face'], fn: c => c.headShape === 'oval' },
  { key: 'headShape', phrases: ['long face'], fn: c => c.headShape === 'long' },
  { key: 'headShape', phrases: ['square face'], fn: c => c.headShape === 'square' },
    { key: 'jawShape', phrases: ['soft chin', 'round chin'], fn: c => c.jawShape === 'round' },

    // ---------------- identity words (only after features; "does she have a beard?" = beard) ----------------
    { key: 'identity', words: ['she', 'her', 'woman', 'women', 'girl', 'girls', 'lady', 'ladies', 'sister', 'daughter', 'mother'], fn: c => inArr(c.identity, SHE) },
    { key: 'identity', words: ['he', 'him', 'man', 'men', 'boy', 'boys', 'guy', 'guys', 'gentleman', 'brother', 'son', 'father'], fn: c => inArr(c.identity, HE) },
    { key: 'identity', words: ['they', 'them', 'theirs'], fn: c => inArr(c.identity, THEY) },
    { key: 'pronoun', words: ['pronoun', 'pronouns'], fn: c => inArr(c.identity, SHE) || inArr(c.identity, HE) },
    // the polite traps — "female"/"male" mean appearance, not identity
    { key: 'appearance', words: ['female'], fn: c => c.gender === 'female' },
    { key: 'appearance', words: ['male'], fn: c => c.gender === 'male' },
    { key: 'appearance', words: ['biological', 'biologically', 'genetically', 'assigned'], fn: c => c.gender === 'male' },
    // does your person pass?
    {
      key: 'pass', words: ['passing', 'passes', 'pass'],
      fn: c => {
        if (c.identity === 'transWoman') return c.gender === 'female';
        if (c.identity === 'transMan') return c.gender === 'male';
        return c.gender === (c.identity === 'woman' ? 'female' : 'male');
      }
    },
    // nobody volunteers this
    { key: 'orientation', words: ['straight', 'gay', 'lesbian', 'queer', 'asexual', 'bisexual', 'orientation'], fn: () => false }
  ];

function evaluate(t, card, rng) {
  for (const rule of RULES) {
    if (rule.words && wm(t, rule.words)) return ok(rule.fn(card), rule.key);
    if (rule.phrases && pm(t, rule.phrases)) return ok(rule.fn(card), rule.key);
  }
  return coin(rng);
}

function ok(answer, note) { return { answer: !!answer, confident: true, note }; }
// Unparseable questions: sometimes the judge shrugs ("don't know" = no info),
// sometimes commits to a coin flip. Both are consequences of vague questions.
function coin(rng) {
  const r = rng();
  if (r < 0.4) return { answer: null, confident: false, note: 'dunno' };   // shrugs
  if (r < 0.7) return { answer: true, confident: false, note: 'random' };
  return { answer: false, confident: false, note: 'random' };
}

/** Evaluate a free-form question against a card. Returns { answer?, confident, note }. */
function judgeQuestion(text, card, rng) {
  const t = String(text || '').toLowerCase();
  if (!t) return coin(rng);
  const neg = /\b(not|no|doesn't|isn't|aren't|wasn't|weren't|don't|ain't)\b/.test(t);
  const res = evaluate(t, card, rng);
  if (neg && res.confident) res.answer = !res.answer;
  return res;
}

// Natural-language phrasing for the bot's structured questions.
function botPhrase(attr, value, rng) {
  const a = attr.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const v = value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const flavors = [
    'Be honest with me — ',
    'Quick check — ',
    'I must ask — ',
    'No judgement, but — ',
    'Let me be direct — ',
    'Careful answer — ',
    'For the record — ',
    'Riddle me this — '
  ];
  const fl = flavors[rng ? Math.floor(rng() * flavors.length) : 0];

  let q;
  if (attr === 'identity') {
    const labels = { woman: 'a woman', man: 'a man', transWoman: 'a trans woman', transMan: 'a trans man', nonBinary: 'non-binary', genderFluid: 'gender fluid', agender: 'agender', androgynous: 'androgynous' };
    q = 'is your person ' + (labels[value] || v) + '?';
  } else if (attr === 'gender') {
    q = 'does your person look ' + (value === 'female' ? 'female' : 'male') + '?';
  } else if (attr === 'hairColor') {
    q = 'does your person have ' + v + ' hair?';
  } else if (attr === 'glasses' || attr === 'headwear') {
    q = value === 'none' ? 'is your person NOT wearing any ' + a + '?' : 'is your person wearing ' + v + ' ' + a + '?';
  } else if (attr === 'facialHair') {
    q = value === 'none' ? 'is your person clean-shaven?' : 'does your person have a ' + v + '?';
  } else {
    q = 'does your person have ' + v + ' ' + a + '?';
  }
  return fl + q;
}

module.exports = { judgeQuestion, botPhrase };