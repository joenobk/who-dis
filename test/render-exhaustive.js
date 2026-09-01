// Exhaustive render test: every attribute value + key combos must not throw.
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { VOCAB } = require('../lib/packs');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'facegen.js'), 'utf8');
const prev = global.window;
global.window = global;
const faceGen = new Function(src + '\n;return window.faceGen;')();
if (prev === undefined) delete global.window; else global.window = prev;

let count = 0;
const base = {};
for (const v of VOCAB) base[v.key] = v.values[0];
base.name = 'Test Person';

function render(f) {
  const c = createCanvas(176, 200);
  faceGen.drawFace(c, f);
  count++;
}

// every single value of every attribute
for (const v of VOCAB) {
  for (const val of v.values) {
    render(Object.assign({}, base, { [v.key]: val }));
  }
}
// hair x headwear cross product
for (const hs of VOCAB.find(v => v.key === 'hairStyle').values) {
  for (const hw of VOCAB.find(v => v.key === 'headwear').values) {
    render(Object.assign({}, base, { hairStyle: hs, headwear: hw }));
  }
}
// skin x freckles
for (const sk of VOCAB.find(v => v.key === 'skinTone').values) {
  for (const fr of VOCAB.find(v => v.key === 'freckles').values) {
    render(Object.assign({}, base, { skinTone: sk, freckles: fr }));
  }
}
// eye shape x glasses
for (const es of VOCAB.find(v => v.key === 'eyeShape').values) {
  for (const gl of VOCAB.find(v => v.key === 'glasses').values) {
    render(Object.assign({}, base, { eyeShape: es, glasses: gl }));
  }
}
console.log('rendered', count, 'combinations without errors');
process.exit(0);