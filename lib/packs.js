// Who Dis? — pack definitions, feature vocabulary, and character generation.
// Everything is data-driven: add a pack to PACKS and it becomes playable/unlockable.

// ---------------------------------------------------------------- vocabulary
const VOCAB = [
  { key: 'gender',            label: 'gender (appearance)', values: ['male', 'female'] },
  { key: 'identity',          label: 'identity',             values: ['woman', 'man', 'transWoman', 'transMan', 'nonBinary', 'genderFluid', 'agender', 'androgynous'] },
  { key: 'skinTone',          label: 'skin tone',         values: ['veryLight', 'light', 'medium', 'tan', 'brown', 'dark'] },
  { key: 'hairColor',         label: 'hair color',        values: ['black', 'darkBrown', 'brown', 'lightBrown', 'blonde', 'red', 'grey', 'white'] },
  { key: 'hairStyle',         label: 'hair style',        values: ['bald', 'buzz', 'short', 'medium', 'long', 'straight', 'curly', 'wavy', 'afro', 'braids', 'bun', 'ponytail', 'mohawk'] },
  { key: 'headwear',          label: 'headwear',          values: ['none', 'hijab', 'turban', 'beanie', 'cap', 'ghutra'] },
  { key: 'eyeColor',          label: 'eye color',         values: ['brown', 'darkBrown', 'hazel', 'amber', 'green', 'blue', 'grey'] },
  { key: 'eyeShape',          label: 'eye shape',         values: ['round', 'almond', 'monolid', 'hooded'] },
  { key: 'eyebrowThickness',  label: 'eyebrow thickness', values: ['thin', 'medium', 'thick'] },
  { key: 'noseBridge',        label: 'nose bridge',       values: ['low', 'medium', 'high'] },
  { key: 'noseShape',         label: 'nose shape',        values: ['narrow', 'straight', 'wide', 'hooked', 'snub', 'flared'] },
  { key: 'lipFullness',       label: 'lip fullness',      values: ['thin', 'medium', 'full'] },
  { key: 'earSize',           label: 'ear size',          values: ['small', 'average', 'large'] },
  { key: 'earLobe',           label: 'ear lobe',          values: ['attached', 'free'] },
  { key: 'facialHair',        label: 'facial hair',       values: ['none', 'stubble', 'mustache', 'goatee', 'beard'] },
  { key: 'glasses',           label: 'glasses',           values: ['none', 'round', 'rectangular', 'aviator'] },
  { key: 'freckles',          label: 'freckles',          values: ['none', 'few', 'many'] },
  { key: 'jawShape',          label: 'jaw shape',         values: ['round', 'square', 'pointed'] },
  { key: 'headShape',         label: 'head shape',        values: ['round', 'oval', 'square', 'long'] }
];
const VOCAB_MAP = Object.fromEntries(VOCAB.map(v => [v.key, v]));

// ---------------------------------------------------------------- identity
// Identity is a *label* (worn as a badge on cards); gender is the rendered
// appearance. In basic play they are always consistent (easy). In woke mode the
// pool widens and labels may not match appearances — that mismatch is the game.
const IDENTITY_INFO = {
  woman:       { label: 'woman',         pronouns: 'she/her' },
  man:         { label: 'man',           pronouns: 'he/him' },
  transWoman:  { label: 'trans woman',   pronouns: 'she/her' },
  transMan:    { label: 'trans man',     pronouns: 'he/him' },
  nonBinary:   { label: 'non-binary',    pronouns: 'they/them' },
  genderFluid: { label: 'gender fluid',  pronouns: 'they/them' },
  agender:     { label: 'agender',       pronouns: 'they/them' },
  androgynous: { label: 'androgynous',   pronouns: 'they/them' }
};
const WOKE_DIST = {
  female: { woman: 30, transWoman: 25, nonBinary: 15, genderFluid: 10, agender: 5, androgynous: 15 },
  male:   { man: 30, transMan: 25, nonBinary: 15, genderFluid: 10, agender: 5, androgynous: 15 }
};

// BASE distribution = global mix (used directly by the "Global Mix" pack).
const BASE = {
  gender: { male: 1, female: 1 },
  skinTone: { veryLight: 1, light: 1, medium: 1, tan: 1, brown: 1, dark: 1 },
  hairColor: { black: 2.5, darkBrown: 2.5, brown: 2, lightBrown: 1, blonde: 0.9, red: 0.5, grey: 0.5, white: 0.3 },
  hairStyle: { bald: 0.5, buzz: 1, short: 2, medium: 2, long: 2, straight: 1.5, curly: 1.5, wavy: 1, afro: 0.8, braids: 0.8, bun: 0.6, ponytail: 0.6, mohawk: 0.3 },
  headwear: { none: 8, hijab: 0.3, turban: 0.2, beanie: 0.8, cap: 0.8, ghutra: 0.1 },
  eyeColor: { brown: 2.5, darkBrown: 2.5, hazel: 1.2, amber: 0.7, green: 0.8, blue: 1.1, grey: 0.7 },
  eyeShape: { round: 1.8, almond: 2.5, monolid: 1.1, hooded: 1.4 },
  eyebrowThickness: { thin: 1, medium: 3, thick: 1.4 },
  noseBridge: { low: 1, medium: 3, high: 1 },
  noseShape: { narrow: 1, straight: 2.5, wide: 1.5, hooked: 0.8, snub: 1, flared: 1 },
  lipFullness: { thin: 1, medium: 2.5, full: 1.5 },
  earSize: { small: 0.8, average: 3, large: 1.2 },
  earLobe: { attached: 1.2, free: 2 },
  facialHair: { none: 3, stubble: 0.8, mustache: 0.3, goatee: 0.4, beard: 0.8 },
  glasses: { none: 6, round: 0.6, rectangular: 0.8, aviator: 0.5 },
  freckles: { none: 4, few: 1, many: 0.4 },
  jawShape: { round: 1.5, square: 1.2, pointed: 1 },
  headShape: { round: 1.5, oval: 2, square: 0.8, long: 1 }
};

// ---------------------------------------------------------------- name pools
const NAMES = {
  global: {
    f: ['Aisha', 'Mateo', 'Sofia', 'Liam', 'Priya', 'Kenji', 'Fatima', 'Diego', 'Elena', 'Noah', 'Amara', 'Lucas', 'Mei', 'Omar', 'Isabella', 'Kofi', 'Anya', 'Rafael', 'Hana', 'Chen', 'Layla', 'Marcus', 'Yuki', 'Nadia', 'David', 'Carmen', 'Kwame', 'Ahmed', 'Ingrid', 'Victor'],
    m: ['Sofia', 'Liam', 'Mateo', 'Kenji', 'Diego', 'Lucas', 'Omar', 'Rafael', 'Marcus', 'David', 'Victor', 'Noah', 'Kofi', 'Ahmed', 'Kwame', 'Chen', 'Yuki', 'Igor', 'Felix', 'Arjun', 'Tomas', 'Jamal', 'Yusuf', 'Petro', 'Nils', 'Miguel', 'Andre', 'Hassan', 'Leo', 'Dmitri']
  },
  eastAsia: {
    f: ['Yui', 'Sakura', 'Hana', 'Aiko', 'Mei', 'Xia', 'Ling', 'Mina', 'Ji-ah', 'Ren', 'Emi', 'Nana', 'Yu-na', 'Hye-jin', 'Fang', 'Miyu'],
    m: ['Haruto', 'Ren', 'Kaito', 'Sota', 'Chen', 'Wei', 'Ming', 'Jun-ho', 'Min-jun', 'Seo-jun', 'Daichi', 'Hiroshi', 'Kenji', 'Takumi', 'Jae-won', 'Hao']
  },
  europe: {
    f: ['Emma', 'Sofia', 'Charlotte', 'Amelia', 'Anna', 'Elena', 'Clara', 'Freya', 'Alice', 'Nina', 'Victoria', 'Elsa', 'Marie', 'Ingrid', 'Lena', 'Camille'],
    m: ['Lucas', 'Liam', 'Noah', 'Hugo', 'Leo', 'Oscar', 'Felix', 'Arthur', 'Thomas', 'Max', 'Gabriel', 'Julian', 'Erik', 'Anton', 'Milan', 'Tomas']
  },
  africa: {
    f: ['Amina', 'Ngozi', 'Zainab', 'Akosua', 'Chiamaka', 'Amara', 'Imani', 'Abena', 'Naledi', 'Thandi', 'Yaa', 'Adaeze', 'Zuri', 'Aissatou', 'Binta', 'Kadiatou'],
    m: ['Kwame', 'Kofi', 'Chidi', 'Tunde', 'Ade', 'Emeka', 'Sipho', 'Thabo', 'Mamadou', 'Ibrahim', 'Osei', 'Demba', 'Babatunde', 'Femi', 'Modou', 'Kelechi']
  },
  arab: {
    f: ['Fatima', 'Aisha', 'Khadija', 'Layla', 'Maryam', 'Noor', 'Salma', 'Zainab', 'Amira', 'Yasmin', 'Huda', 'Rania', 'Dalia', 'Shatha', 'Lina', 'May'],
    m: ['Omar', 'Ahmed', 'Ali', 'Khalid', 'Hassan', 'Yusuf', 'Mahmoud', 'Rashid', 'Tariq', 'Samir', 'Karim', 'Walid', 'Nabil', 'Fadi', 'Ziad', 'Husam']
  },
  latam: {
    f: ['Sofia', 'Valentina', 'Camila', 'Lucia', 'Isabella', 'Gabriela', 'Mariana', 'Daniela', 'Fernanda', 'Catalina', 'Renata', 'Paula', 'Antonella', 'Ximena', 'Alondra', 'Julieta'],
    m: ['Mateo', 'Santiago', 'Diego', 'Lucas', 'Alejandro', 'Sebastian', 'Julian', 'Andres', 'Camilo', 'Tomas', 'Rodrigo', 'Nicolas', 'Emilio', 'Gael', 'Ivan', 'Bruno']
  },
  southAsia: {
    f: ['Priya', 'Ananya', 'Meera', 'Kavya', 'Divya', 'Lakshmi', 'Shreya', 'Riya', 'Sneha', 'Neha', 'Pooja', 'Deepika', 'Anjali', 'Ishita', 'Nisha', 'Ritika'],
    m: ['Arjun', 'Rohan', 'Vikram', 'Rahul', 'Sanjay', 'Amit', 'Rajesh', 'Karthik', 'Suresh', 'Manish', 'Anil', 'Dinesh', 'Naveen', 'Prakash', 'Varun', 'Hari']
  },
  sweden: {
    f: ['Astrid', 'Ingrid', 'Freja', 'Elsa', 'Maja', 'Linnea', 'Saga', 'Ebba', 'Klara', 'Alva', 'Tove', 'Signe', 'Greta', 'Nora', 'Tyra', 'Emelie'],
    m: ['Lars', 'Erik', 'Bjorn', 'Gustav', 'Olof', 'Sven', 'Anders', 'Magnus', 'Nils', 'Johan', 'Emil', 'Oscar', 'Henrik', 'Karl', 'Per', 'Sten']
  },
  cameroon: {
    f: ['Mireille', 'Clarisse', 'Nadine', 'Chantal', 'Vanessa', 'Diane', 'Solange', 'Estelle', 'Ariane', 'Brigitte', 'Fabiola', 'Arlette', 'Delphine', 'Murielle', 'Priscille', 'Sylvie'],
    m: ['Jean', 'Paul', 'Emmanuel', 'Samuel', 'Vitalis', 'Cyrille', 'Bertrand', 'Didier', 'Marcel', 'Rodrigue', 'Stephane', 'Guy', 'Herve', 'Landry', 'Serge', 'Yannick']
  },
  saudi: {
    f: ['Noura', 'Sara', 'Reem', 'Alanoud', 'Layan', 'Jood', 'Hessa', 'Dana', 'Shahad', 'Ghalia', 'Munira', 'Abeer', 'Lama', 'Walaa', 'Areej', 'Malak'],
    m: ['Fahad', 'Saud', 'Majed', 'Faisal', 'Abdulaziz', 'Mohammed', 'Nayef', 'Turki', 'Bandar', 'Sultan', 'Meshal', 'Badr', 'Faisal', 'Khaled', 'Nasser', 'Salem']
  },
  southIndia: {
    f: ['Meenakshi', 'Anitha', 'Poornima', 'Deepa', 'Revathi', 'Kavitha', 'Vanitha', 'Saraswathi', 'Bhanu', 'Radhika', 'Swapna', 'Nandini', 'Jothi', 'Lakshmi', 'Malar', 'Sandhya'],
    m: ['Ramesh', 'Murugan', 'Kandasamy', 'Velu', 'Palani', 'Sekar', 'Senthil', 'Mani', 'Ganesan', 'Arumugam', 'Bharath', 'Rajan', 'Suresh', 'Karthik', 'Vijay', 'Prakash']
  }
};
NAMES.lookalikes = NAMES.global;

// ---------------------------------------------------------------- packs
// difficulty: 1 easy · 2 medium · 3 hard · 4 brutal
const PACKS = [
  {
    id: 'global', name: 'Global Mix', region: 'Worldwide', difficulty: 1, cost: 0,
    tagline: 'Everyone, everywhere. The classic starter board.', dist: BASE, names: NAMES.global
  },
  {
    id: 'eastAsia', name: 'East Asia', region: 'Japan · Korea · China', difficulty: 2, cost: 40,
    tagline: 'Monolid eyes, dark straight hair, high cheekbones.', names: NAMES.eastAsia,
    dist: patch(BASE, {
      skinTone: { medium: 2, tan: 2, light: 1.5, veryLight: 0.3 },
      hairColor: { black: 4, darkBrown: 2, brown: 0.4 },
      hairStyle: { straight: 2.5, medium: 1.5, short: 1.5, long: 1, bun: 1, buzz: 0.7, wavy: 0.5, curly: 0.2 },
      eyeColor: { darkBrown: 2.5, brown: 2, hazel: 0.5 },
      eyeShape: { monolid: 2, almond: 3, round: 0.5, hooded: 0.5 },
      eyebrowThickness: { thin: 1.2, medium: 2.6, thick: 0.8 },
      noseBridge: { low: 1.5, medium: 2, high: 0.3 },
      noseShape: { narrow: 1.5, straight: 1.5, snub: 1, wide: 0.3, flared: 0.2 },
      lipFullness: { thin: 1.5, medium: 2, full: 0.5 },
      earLobe: { attached: 1.6, free: 1 },
      facialHair: { none: 5, stubble: 0.5, mustache: 0.15, goatee: 0.2 },
      glasses: { none: 6, rectangular: 0.8, round: 0.4 },
      freckles: { none: 4.5, few: 0.5 },
      jawShape: { round: 2, oval: 0, square: 1, pointed: 1.2 },
      headShape: { round: 1.5, oval: 2, long: 1, square: 0.6 }
    })
  },
  {
    id: 'europe', name: 'Europe', region: 'Western Europe', difficulty: 2, cost: 40,
    tagline: 'Blondes and brunettes across a dozen nations.', names: NAMES.europe,
    dist: patch(BASE, {
      skinTone: { veryLight: 1.5, light: 2, medium: 1.5, tan: 0.8, brown: 0.1 },
      hairColor: { lightBrown: 1.5, blonde: 1.8, brown: 2, darkBrown: 1.5, black: 0.6, red: 0.8, grey: 0.8, white: 0.5 },
      hairStyle: { short: 2, medium: 2, long: 2, straight: 1, curly: 1.5, wavy: 1.5, buzz: 0.5, bald: 0.5, bun: 0.6, ponytail: 0.6 },
      eyeColor: { blue: 2, green: 1.2, grey: 1, hazel: 1.2, brown: 1, darkBrown: 0.6 },
      eyeShape: { almond: 2, round: 1.5, hooded: 1.5, monolid: 0.1 },
      eyebrowThickness: { thin: 1.2, medium: 3, thick: 1 },
      noseBridge: { medium: 2.5, high: 1.5, low: 0.8 },
      noseShape: { straight: 2, narrow: 1.5, hooked: 1, snub: 1, wide: 0.6 },
      lipFullness: { medium: 2.5, thin: 1.5, full: 0.8 },
      earLobe: { free: 1.8, attached: 1.2 },
      facialHair: { none: 3.5, stubble: 0.8, mustache: 0.3, goatee: 0.3, beard: 0.6 },
      freckles: { few: 1.5, many: 0.6, none: 2.5 },
      glasses: { rectangular: 0.8, round: 0.5, aviator: 0.4, none: 6 }
    })
  },
  {
    id: 'africa', name: 'Africa', region: 'West & Southern Africa', difficulty: 2, cost: 40,
    tagline: 'Rich melanin, full lips, legendary hairstyles.', names: NAMES.africa,
    dist: patch(BASE, {
      skinTone: { brown: 2.5, dark: 2, tan: 1.5, medium: 1, veryLight: 0.05 },
      hairColor: { black: 4.5, darkBrown: 1 },
      hairStyle: { afro: 2.5, curly: 2.5, braids: 2, short: 1.2, medium: 1, long: 0.8, straight: 0.3, bun: 0.5 },
      eyeColor: { darkBrown: 2, brown: 3, hazel: 0.5 },
      eyeShape: { almond: 2.5, round: 1.5, hooded: 1 },
      noseBridge: { low: 1, medium: 2, high: 1 },
      noseShape: { wide: 2, flared: 2, straight: 1, snub: 0.6, narrow: 0.3 },
      lipFullness: { full: 3, medium: 1.5, thin: 0.3 },
      earSize: { average: 2.5, large: 1.5, small: 0.5 },
      earLobe: { free: 2, attached: 1 },
      facialHair: { none: 3, stubble: 0.7, goatee: 0.4, beard: 0.6, mustache: 0.3 },
      eyebrowThickness: { thick: 1.5, medium: 2.5, thin: 0.6 },
      jawShape: { round: 1.5, square: 1.5, pointed: 1 },
      freckles: { none: 4.5, few: 0.5, many: 0.3 }
    })
  },
  {
    id: 'arab', name: 'Arab World', region: 'Middle East & North Africa', difficulty: 2, cost: 40,
    tagline: 'Hooked profiles, arched brows, command of the desert.', names: NAMES.arab,
    dist: patch(BASE, {
      skinTone: { medium: 2, tan: 2.5, light: 1, brown: 1 },
      hairColor: { black: 3, darkBrown: 2, brown: 0.7 },
      hairStyle: { short: 2, medium: 2, straight: 1.5, curly: 1, wavy: 1.5, long: 0.8 },
      headwear: { none: 5, hijab: 1.5, ghutra: 1.2, cap: 0.3 },
      eyeColor: { darkBrown: 2, brown: 2.5, hazel: 1, amber: 0.3 },
      eyeShape: { almond: 2.5, round: 1.5, hooded: 1 },
      eyebrowThickness: { medium: 2.5, thick: 1.5, thin: 0.8 },
      noseBridge: { high: 1.5, medium: 2.5, low: 0.5 },
      noseShape: { hooked: 1.2, straight: 2, narrow: 1.2, snub: 0.6, wide: 0.3 },
      lipFullness: { medium: 2.5, thin: 1.2, full: 1 },
      facialHair: { beard: 1.5, mustache: 1.2, goatee: 0.7, stubble: 1, none: 2.5 },
      earSize: { average: 2.5, small: 1, large: 0.8 },
      glasses: { rectangular: 0.6, round: 0.4, none: 6 }
    })
  },
  {
    id: 'latam', name: 'Latin America', region: 'Mexico to Argentina', difficulty: 2, cost: 40,
    tagline: 'A melting pot of Iberian, indigenous & African flair.', names: NAMES.latam,
    dist: patch(BASE, {
      skinTone: { tan: 2, brown: 1.5, light: 1, medium: 2 },
      hairColor: { black: 3, darkBrown: 2, brown: 1 },
      hairStyle: { wavy: 2, curly: 2, straight: 1.5, long: 1.5, medium: 1.5, short: 1, bun: 0.8, ponytail: 0.8 },
      eyeColor: { brown: 3, darkBrown: 2, hazel: 1, amber: 0.5 },
      eyeShape: { almond: 2, round: 2, hooded: 1.2, monolid: 0.3 },
      eyebrowThickness: { medium: 3, thick: 1.4, thin: 1 },
      noseBridge: { medium: 2.5, low: 1, high: 1 },
      noseShape: { straight: 1.8, narrow: 1, wide: 1.2, hooked: 0.8, snub: 1.2, flared: 1 },
      lipFullness: { medium: 2.5, full: 1.6, thin: 0.8 },
      facialHair: { none: 3, stubble: 1, mustache: 0.6, goatee: 0.5, beard: 0.7 },
      freckles: { none: 4, few: 0.8, many: 0.3 },
      jawShape: { round: 1.7, square: 1.2, pointed: 1.1 }
    })
  },
  {
    id: 'southAsia', name: 'South Asia', region: 'India · Pakistan · Bangladesh', difficulty: 2, cost: 40,
    tagline: 'Warm tones, sharp features, epic mustaches.', names: NAMES.southAsia,
    dist: patch(BASE, {
      skinTone: { brown: 1.5, tan: 1.5, medium: 1.5, dark: 0.8, light: 0.3 },
      hairColor: { black: 4, darkBrown: 1.5, brown: 0.3 },
      hairStyle: { straight: 2, medium: 2, short: 1.5, wavy: 1.5, long: 1.2, curly: 0.5, buzz: 0.7 },
      headwear: { none: 7, turban: 0.5, cap: 0.5, hijab: 0.6 },
      eyeColor: { brown: 3, darkBrown: 2.5, hazel: 0.8 },
      eyeShape: { almond: 2.5, round: 1.5, hooded: 1, monolid: 0.3 },
      noseBridge: { high: 1.2, medium: 2.5, low: 0.5 },
      noseShape: { straight: 2, narrow: 1.5, hooked: 1, snub: 0.5, wide: 0.6 },
      lipFullness: { medium: 2.5, thin: 1, full: 1.2 },
      facialHair: { mustache: 1, goatee: 0.8, beard: 1, none: 3, stubble: 0.8 },
      eyebrowThickness: { thick: 1.5, medium: 2.5, thin: 0.8 },
      jawShape: { round: 2, pointed: 1.5, square: 1 },
      freckles: { none: 4.5, few: 0.5 }
    })
  },
  {
    id: 'sweden', name: 'Sweden', region: 'Scandinavia', difficulty: 3, cost: 80,
    tagline: 'Basically clones. Earlobes will save you.', names: NAMES.sweden,
    dist: patch(BASE, {
      skinTone: { veryLight: 3, light: 2.5, medium: 0.4 },
      hairColor: { blonde: 3.5, lightBrown: 1.5, brown: 0.8, grey: 0.4, red: 0.25, darkBrown: 0.15, black: 0.05 },
      hairStyle: { short: 2, medium: 2, long: 2, straight: 1.5, wavy: 1, curly: 0.4, buzz: 0.6, bald: 0.3 },
      eyeColor: { blue: 3, grey: 1.4, green: 1, hazel: 0.5, brown: 0.2, darkBrown: 0.1 },
      eyeShape: { almond: 2, round: 1.5, hooded: 1.4, monolid: 0.1 },
      eyebrowThickness: { thin: 1.4, medium: 2, thick: 0.5 },
      noseBridge: { medium: 2.4, low: 1, high: 0.8 },
      noseShape: { straight: 2, narrow: 1.6, snub: 1.4, hooked: 0.5, wide: 0.3 },
      lipFullness: { thin: 1.6, medium: 2, full: 0.5 },
      earSize: { average: 3, small: 1.1, large: 0.6 },
      earLobe: { attached: 1.6, free: 1.4 },
      facialHair: { none: 3.2, stubble: 0.8, beard: 0.4, goatee: 0.2, mustache: 0.15 },
      freckles: { none: 2, few: 2, many: 0.8 },
      glasses: { rectangular: 0.8, round: 0.4, aviator: 0.35, none: 6 },
      jawShape: { round: 1.6, square: 1, pointed: 1.4 },
      headShape: { oval: 2, round: 1.6, long: 1, square: 0.8 }
    })
  },
  {
    id: 'cameroon', name: 'Cameroon', region: 'Central Africa', difficulty: 3, cost: 80,
    tagline: 'Dark skin, defined features — notice the small stuff.', names: NAMES.cameroon,
    dist: patch(BASE, {
      skinTone: { dark: 3, brown: 2.5, tan: 1 },
      hairColor: { black: 4.5, darkBrown: 0.5 },
      hairStyle: { afro: 2.5, curly: 2, braids: 2, short: 1.2, medium: 0.8, straight: 0.1, bun: 0.4 },
      eyeColor: { darkBrown: 2.5, brown: 2.5, hazel: 0.3 },
      eyeShape: { almond: 2, round: 1.5, hooded: 1 },
      noseBridge: { low: 1, medium: 2, high: 0.8 },
      noseShape: { wide: 2, flared: 2, straight: 1, snub: 0.5 },
      lipFullness: { full: 3.5, medium: 1, thin: 0.2 },
      earSize: { average: 2, large: 2, small: 0.5 },
      earLobe: { attached: 1.5, free: 2 },
      eyebrowThickness: { thick: 2, medium: 2, thin: 0.4 },
      jawShape: { square: 1.5, round: 1.5, pointed: 1 },
      facialHair: { none: 3, stubble: 0.7, beard: 0.6, goatee: 0.4, mustache: 0.3 },
      headwear: { none: 5, cap: 0.5 }
    })
  },
  {
    id: 'saudi', name: 'Saudi Arabia', region: 'Arabian Peninsula', difficulty: 3, cost: 80,
    tagline: 'Eye contact is a luxury here. Study the brows.', names: NAMES.saudi,
    dist: patch(BASE, {
      skinTone: { tan: 2.5, light: 1.5, medium: 2, brown: 0.8 },
      hairColor: { black: 3.5, darkBrown: 1.5 },
      hairStyle: { short: 2.5, medium: 1.5, straight: 1, wavy: 1, curly: 0.5, bald: 0.3 },
      headwear: { none: 5, hijab: 1.5, ghutra: 1.5, cap: 0.3 },
      eyeColor: { darkBrown: 2.5, brown: 2.5, hazel: 0.8, amber: 0.3 },
      eyeShape: { almond: 2.5, round: 1.5, hooded: 1 },
      eyebrowThickness: { medium: 2.5, thick: 1.5, thin: 0.8 },
      noseBridge: { high: 1.5, medium: 2.5, low: 0.5 },
      noseShape: { hooked: 1.2, straight: 2, narrow: 1.2, snub: 0.6, wide: 0.3 },
      lipFullness: { medium: 2.5, thin: 1.2, full: 1 },
      facialHair: { beard: 1.5, mustache: 1.2, goatee: 0.7, stubble: 1, none: 2.5 },
      earSize: { average: 2.5, small: 1, large: 0.8 },
      eyebrowThickness: { medium: 2.5, thick: 1.4, thin: 0.8 },
      jawShape: { round: 1.5, square: 1.3, pointed: 1.2 }
    })
  },
  {
    id: 'southIndia', name: 'South India', region: 'Tamil Nadu · Kerala · Karnataka', difficulty: 3, cost: 80,
    tagline: 'Dravidian features, dark flowing hair, subtle noses.', names: NAMES.southIndia,
    dist: patch(BASE, {
      skinTone: { brown: 1.5, tan: 1.5, dark: 1, medium: 1.5, light: 0.2 },
      hairColor: { black: 4.5, darkBrown: 0.8 },
      hairStyle: { straight: 2.5, medium: 1.5, long: 1.5, wavy: 1, short: 1, braids: 0.6, bun: 0.6 },
      eyeColor: { darkBrown: 2.5, brown: 2.5, hazel: 0.8 },
      eyeShape: { almond: 2.5, round: 1.5, monolid: 0.2, hooded: 1 },
      eyebrowThickness: { medium: 2.5, thin: 1, thick: 1.2 },
      noseBridge: { medium: 2.5, high: 1, low: 0.8 },
      noseShape: { straight: 1.5, narrow: 1.5, hooked: 0.8, snub: 0.5, wide: 0.6, flared: 0.5 },
      lipFullness: { medium: 2.5, thin: 1.2, full: 1.2 },
      earSize: { average: 2, small: 1.2, large: 0.8 },
      earLobe: { attached: 1.5, free: 1.5 },
      facialHair: { none: 3, mustache: 1.2, goatee: 0.9, beard: 0.8, stubble: 0.8 },
      jawShape: { round: 2, pointed: 1.5, square: 1 },
      freckles: { none: 4.5, few: 0.5 }
    })
  },
  {
    id: 'lookalikes', name: 'Lookalikes', region: 'Everywhere', difficulty: 4, cost: 120,
    tagline: 'Everyone is nearly identical. Four tiny tells.', names: NAMES.lookalikes, lookalikes: true
  }
];

const PACK_MAP = Object.fromEntries(PACKS.map(p => [p.id, p]));

// ---------------------------------------------------------------- helpers
// Deep-merges an override into a base distribution (per-attribute).
function patch(base, over) {
  const out = {};
  for (const key of Object.keys(base)) out[key] = Object.assign({}, base[key]);
  for (const [key, dist] of Object.entries(over)) out[key] = Object.assign({}, dist);
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(rng, dist) {
  let total = 0;
  for (const w of Object.values(dist)) total += w;
  let r = rng() * total;
  for (const [k, w] of Object.entries(dist)) {
    r -= w;
    if (r <= 0) return k;
  }
  return Object.keys(dist)[Object.keys(dist).length - 1];
}

// ---------------------------------------------------------------- generation
// 20 unique tell-combos out of the 36 (2 lobes × 3 brows × 3 bridges × 2 freckle) possibilities.
function lookalikeTellFor(i) {
  const lobes = ['attached', 'free'];
  const brows = ['thin', 'medium', 'thick'];
  const bridge = ['low', 'medium', 'high'];
  const freck = ['none', 'few'];
  return {
    earLobe: lobes[i % 2],
    eyebrowThickness: brows[Math.floor(i / 2) % 3],
    noseBridge: bridge[Math.floor(i / 6) % 3],
    freckles: freck[Math.floor(i / 18) % 2]
  };
}

function genBoard(packId, size = 20, seed = Math.floor(Math.random() * 2 ** 31), woke = false) {
  const pack = PACK_MAP[packId];
  if (!pack) throw new Error('Unknown pack: ' + packId);
  const rng = mulberry32(seed);
  const chars = [];
  const used = new Set();

  if (pack.lookalikes) {
    // Same template face; only the four "tell" attributes vary.
    const template = buildFeatures(pack, rng, true);
    for (let i = 0; i < size; i++) {
      const tell = lookalikeTellFor(i);
      const feats = Object.assign({}, template, tell);
      feats.identity = pickIdentity(pack, feats, woke, rng);
      const name = uniqueName(pack, feats.gender, used, rng);
      chars.push({ id: i, name, ...feats });
    }
    return chars;
  }

  for (let i = 0; i < size; i++) {
    const feats = buildFeatures(pack, rng, false);
    feats.identity = pickIdentity(pack, feats, woke, rng);
    const name = uniqueName(pack, feats.gender, used, rng);
    chars.push({ id: i, name, ...feats });
  }
  return chars;
}

function pickIdentity(pack, feats, woke, rng) {
  if (!woke) return feats.gender === 'female' ? 'woman' : 'man';
  const dist = (pack.identityDist && pack.identityDist[feats.gender]) || WOKE_DIST[feats.gender];
  if (!dist) return 'nonBinary';
  return weightedPick(rng, dist);
}

function buildFeatures(pack, rng, lookalikeTemplate) {
  const feats = {};
  const distMap = pack.dist || BASE;
  for (const attr of VOCAB) {
    if (attr.key === 'identity') continue; // assigned by pickIdentity()
    feats[attr.key] = weightedPick(rng, distMap[attr.key] || BASE[attr.key]);
  }
  // realism constraints
  if (feats.gender === 'female') feats.facialHair = 'none';
  if (feats.gender === 'male' && feats.headwear === 'hijab') feats.headwear = 'none';
  if (feats.hairStyle === 'bald' && feats.headwear === 'none') feats.hairColor = pickFallback(rng, ['grey', 'white', 'black']);
  return feats;
}

function pickFallback(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function uniqueName(pack, gender, used, rng) {
  const pool = (pack.names[gender === 'female' ? 'f' : 'm'] || []).slice();
  const last = pack.names.last || ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'].map(l => l + '.');
  for (let tries = 0; tries < 40; tries++) {
    const first = pool[Math.floor(rng() * pool.length)];
    const surname = last[Math.floor(rng() * last.length)];
    // prefer family names that match the pack when available
    let full = first + ' ' + surname;
    if (!used.has(full)) { used.add(full); return full; }
  }
  return 'Unknown ' + (used.size + 1);
}

// global packs get culturally-blind random surnames
NAMES.global.last = ['Silva', 'Kumar', 'Okafor', 'Tanaka', 'Haddad', 'Garcia', 'Novak', 'Chen', 'Rossi', 'Patel', 'Mensah', 'Larsen', 'Alvarez', 'Sato', 'Kowalski', 'Diallo', 'Nguyen', 'Almeida', 'Moreau', 'Petrov'];
NAMES.eastAsia.last = ['Tanaka', 'Sato', 'Suzuki', 'Takahashi', 'Chen', 'Wang', 'Li', 'Kim', 'Park', 'Lee', 'Yamada', 'Ito', 'Zhang', 'Liu', 'Choi', 'Jung'];
NAMES.europe.last = ['Martin', 'Bernard', 'Weber', 'Dubois', 'Rossi', 'Moreau', 'Jensen', 'Wagner', 'Kovacs', 'Novak', 'Fischer', 'Muller', 'Andersen', 'Christensen', 'Silva', 'Costa'];
NAMES.africa.last = ['Okafor', 'Mensah', 'Osei', 'Nkosi', 'Diallo', 'Toure', 'Adeyemi', 'Boateng', 'Mbeki', 'Dlamini', 'Sow', 'Keita', 'Amadi', 'Bello', 'Kone', 'Sesay'];
NAMES.arab.last = ['Haddad', 'Khalil', 'Nasser', 'Rahman', 'Aziz', 'Mansour', 'Qadir', 'Saleh', 'Fahd', 'Al-Sayed', 'Barakat', 'Nasr', 'Hakim', 'Suleiman', 'Issa', 'Farah'];
NAMES.latam.last = ['Garcia', 'Rodriguez', 'Martinez', 'Lopez', 'Hernandez', 'Gonzalez', 'Perez', 'Ramirez', 'Torres', 'Flores', 'Rivera', 'Morales', 'Castillo', 'Vargas', 'Rojas', 'Mendoza'];
NAMES.southAsia.last = ['Sharma', 'Kumar', 'Patel', 'Singh', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Mehta', 'Rao', 'Pillai', 'Menon', 'Verma', 'Agarwal', 'Joshi', 'Chopra'];
NAMES.sweden.last = ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Gustafsson', 'Lindberg', 'Berg', 'Sandberg', 'Lindqvist', 'Bergstrom', 'Ek'];
NAMES.cameroon.last = ['Mbarga', 'Nganou', 'Fotso', 'Etoundi', 'Kamga', 'Njike', 'Mballa', 'Tchoua', 'Kenfack', 'Atangana', 'Fokou', 'Abanda', 'Essomba', 'Belinga', 'Nkoulou', 'Owona'];
NAMES.saudi.last = ['Al-Qahtani', 'Al-Otaibi', 'Al-Harbi', 'Al-Dossari', 'Al-Zahrani', 'Al-Ghamdi', 'Al-Anazi', 'Al-Shehri', 'Al-Mutairi', 'Al-Shammari', 'Al-Rashidi', 'Al-Ahmed', 'Al-Juhani', 'Al-Farsi', 'Al-Subaie', 'Al-Dawsari'];
NAMES.southIndia.last = ['Pillai', 'Mudaliar', 'Naidu', 'Reddy', 'Gounder', 'Chettiar', 'Nair', 'Menon', 'Iyer', 'Acharya', 'Varma', 'Rao', 'Pillay', 'Iyer', 'Naicker', 'Gowda'];

function getPack(id) { return PACK_MAP[id]; }

// Statically exported helper for the engine: does a candidate match a question?
function featureMatches(card, attr, value) {
  return card[attr] === value;
}

module.exports = { VOCAB, VOCAB_MAP, PACKS, PACK_MAP, getPack, genBoard, featureMatches, mulberry32, weightedPick, patch, IDENTITY_INFO, WOKE_DIST };