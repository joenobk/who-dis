// Renders sample boards to PNG so faces can be visually inspected (uses @napi-rs/canvas).
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { genBoard, PACKS } = require('../lib/packs');

function loadFaceGen() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'facegen.js'), 'utf8');
  const fn = new Function(src + '\n;return window.faceGen;');
  const prev = global.window;
  global.window = global;
  const faceGen = fn();
  if (prev === undefined) delete global.window; else global.window = prev;
  return faceGen;
}

const faceGen = loadFaceGen();

const CELL = 100;
const ROWS_PER_PACK = 2;
const COLS = 10;

const outDir = path.join(__dirname, '..', '.render-out');
fs.mkdirSync(outDir, { recursive: true });

for (const pack of PACKS) {
  const board = genBoard(pack.id, 20);
  const canvas = createCanvas(CELL * COLS, CELL * ROWS_PER_PACK);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20222a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  board.forEach((card, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const c = createCanvas(CELL - 8, CELL - 12);
    faceGen.drawFace(c, card);
    ctx.drawImage(c, col * CELL + 4, row * CELL + 2, CELL - 8, CELL - 12);
    ctx.fillStyle = '#eee';
    ctx.font = '9px sans-serif';
    ctx.fillText(card.name, col * CELL + 4, row * CELL + (row === 0 ? CELL - 4 : CELL * 2 - 4));
  });

  fs.writeFileSync(path.join(outDir, pack.id + '.png'), canvas.toBuffer('image/png'));
  console.log('rendered', pack.id);
}
console.log('done ->', outDir);