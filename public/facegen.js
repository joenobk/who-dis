// Who Dis? — procedural cartoon face renderer.
// Renders every feature in the vocabulary onto a canvas. Fully deterministic per card.
(function () {
  'use strict';

  // ---------------------------------------------------------------- palettes
  const SKIN = {
    veryLight: '#ffdfc4', light: '#f3c9a1', medium: '#e0ac69',
    tan: '#c68642', brown: '#8d5524', dark: '#5d3a1e'
  };
  const HAIR = {
    black: '#26221f', darkBrown: '#4a352a', brown: '#6f4a2f', lightBrown: '#9a6b3b',
    blonde: '#d9a441', red: '#9e4a2c', grey: '#9aa0a5', white: '#e9e6df'
  };
  const EYE = {
    brown: '#5b3d24', darkBrown: '#2f2016', hazel: '#6b5323', amber: '#a06a1e',
    green: '#3f7a43', blue: '#3a6ea5', grey: '#6e7b87'
  };
  const SHIRT = ['#2c6e6f', '#9a3b3b', '#3b5e8a', '#6f5b9a', '#4a7a4a', '#b06a35', '#5a5a6a', '#8a4a6a', '#3a7a8a', '#6a6a2a', '#9a4a8a', '#3b6b6b'];
  const HEADWEAR = ['#3a4a5a', '#7a5a3a', '#4a6a7a', '#6a4a4a', '#4a7a4a', '#5a5a7a', '#8a6a4a', '#6d5a8a'];

  // ---------------------------------------------------------------- deterministic rand
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function faceHash(f) {
    let h = 2166136261;
    const s = JSON.stringify(f);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function browColorOf(hairColor) {
    if (hairColor === 'blonde' || hairColor === 'red') return '#6f4a2f';
    if (hairColor === 'white') return '#8a8a8a';
    return HAIR[hairColor] || '#3a3530';
  }

  // ---------------------------------------------------------------- renderer
  function drawFace(canvas, f) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const s = W / 176;
    const cx = W / 2, cy = H * 0.54;
    const R = 48 * s;
    const rand = mulberry(faceHash(f) ^ 0xdeadbeef);

    const skin = SKIN[f.skinTone] || '#ffdfc4';
    const hairC = HAIR[f.hairColor] || '#26221f';
    const shirtC = SHIRT[faceHash(f) % SHIRT.length];
    const hwC = HEADWEAR[faceHash(f) % HEADWEAR.length];

    // head geometry
    let wx = 1.0, lng = 1.0;
    if (f.headShape === 'oval') wx = 0.86;
    else if (f.headShape === 'square') wx = 1.02;
    else if (f.headShape === 'long') { wx = 0.8; lng = 1.12; }
    const jawTuck = f.jawShape === 'pointed' ? 0.45 : f.jawShape === 'square' ? 0.72 : 0.6;
    const headTop = cy - R * 1.08 * lng;
    const headBot = cy + R * 1.14 * lng;
    const neckTop = cy + R * 0.62 * lng;

    // ----------------------------------------------------- shoulders & neck
    const shoulderY = H * 0.88;
    ctx.fillStyle = shirtC;
    rr(ctx, cx - 104 * s, shoulderY, 208 * s, H - shoulderY + 8, 26 * s);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    rr(ctx, cx - 30 * s, shoulderY, 60 * s, 5 * s, 2 * s);
    ctx.fill();
    ctx.fillStyle = shade(skin, -16);
    ctx.fillRect(cx - 13 * s, neckTop, 26 * s, shoulderY - neckTop + 4);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(cx - 13 * s, neckTop, 26 * s, 8 * s);

    // ----------------------------------------------------- ears (behind head)
    const earY = cy + 0.02 * R * lng;
    const earScale = f.earSize === 'small' ? 0.8 : f.earSize === 'large' ? 1.25 : 1;
    for (const side of [-1, 1]) {
      const ex = cx + side * (R * wx + 0.06 * R);
      ctx.fillStyle = shade(skin, -10);
      ctx.beginPath();
      ctx.ellipse(ex, earY, 0.11 * R * earScale, 0.22 * R * earScale, 0, 0, Math.PI * 2);
      ctx.fill();
      if (f.earLobe === 'free') {
        ctx.fillStyle = shade(skin, -24);
        ctx.beginPath();
        ctx.arc(ex, earY + 0.21 * R * earScale, 0.06 * R * earScale, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = shade(skin, -14);
        ctx.beginPath();
        ctx.ellipse(ex, earY + 0.17 * R * earScale, 0.09 * R * earScale, 0.10 * R, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ----------------------------------------------------- hair back layer
    drawHairBack(ctx, f, cx, cy, R, wx, lng, hairC);

    // ----------------------------------------------------- head
    ctx.beginPath();
    ctx.moveTo(cx, headTop);
    ctx.bezierCurveTo(cx + R * wx * 0.55, headTop - R * 0.15, cx + R * wx * 1.02, cy - R * 0.5, cx + R * wx * 1.02, cy + R * 0.12);
    ctx.bezierCurveTo(cx + R * wx * 1.02, cy + R * 0.62, cx + R * wx * jawTuck, cy + R * 0.95, cx, headBot);
    ctx.bezierCurveTo(cx - R * wx * jawTuck, cy + R * 0.95, cx - R * wx * 1.02, cy + R * 0.62, cx - R * wx * 1.02, cy + R * 0.12);
    ctx.bezierCurveTo(cx - R * wx * 1.02, cy - R * 0.5, cx - R * wx * 0.55, headTop - R * 0.15, cx, headTop);
    ctx.closePath();
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.lineWidth = 1.5 * s;
    ctx.strokeStyle = shade(skin, -32);
    ctx.stroke();

    // ----------------------------------------------------- hair front & headwear
        drawHairFront(ctx, f, cx, cy, R, wx, lng, hairC, rand, headBot);
        drawHeadwear(ctx, f, cx, cy, R, wx, lng, hwC, rand, s);

    // ----------------------------------------------------- feature layout
    const browY = cy - 0.34 * R * lng;
    const eyeY = cy - 0.08 * R * lng;
    const eyeHalfGap = 0.34 * R * wx;
    const eyeW = 0.15 * R;

    // cheeks
    if (f.skinTone === 'veryLight' || f.skinTone === 'light') {
      ctx.fillStyle = 'rgba(220,140,120,0.15)';
      ctx.beginPath(); ctx.arc(cx - eyeHalfGap - 0.18 * R, eyeY + 0.45 * R, 0.12 * R, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + eyeHalfGap + 0.18 * R, eyeY + 0.45 * R, 0.12 * R, 0, Math.PI * 2); ctx.fill();
    }

    // eyebrows
    const browT = f.eyebrowThickness === 'thin' ? 0.03 * R : f.eyebrowThickness === 'thick' ? 0.062 * R : 0.044 * R;
    const browW = eyeW * 2.05 * (f.eyebrowThickness === 'thick' ? 1.08 : 1);
    ctx.fillStyle = shade(browColorOf(f.hairColor), -8);
    for (const side of [-1, 1]) {
      const bx = cx + side * eyeHalfGap - (side > 0 ? browW * 0.3 : 0);
      ctx.save();
      ctx.translate(bx + browW * 0.5, browY);
      ctx.rotate(-side * 0.08);
      rr(ctx, -browW / 2, -browT / 2, browW, browT, browT / 2);
      ctx.fill();
      ctx.restore();
    }

    // eyes
    for (const side of [-1, 1]) {
      const ex = cx + side * eyeHalfGap;
      const eyeH = f.eyeShape === 'round' ? 0.12 * R : f.eyeShape === 'monolid' ? 0.05 * R : 0.08 * R;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = EYE[f.eyeColor] || '#5b3d24';
      ctx.beginPath();
      ctx.arc(ex, eyeY, eyeW * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1612';
      ctx.beginPath();
      ctx.arc(ex, eyeY, eyeW * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(ex - eyeW * 0.18, eyeY - eyeW * 0.18, eyeW * 0.10, 0, Math.PI * 2);
      ctx.fill();

      // lids
      ctx.strokeStyle = shade(skin, -48);
      ctx.lineWidth = 1.6 * s;
      if (f.eyeShape === 'monolid') {
        ctx.beginPath();
        ctx.moveTo(ex - eyeW * 1.05, eyeY - eyeH * 0.9);
        ctx.lineTo(ex + eyeW * 1.05, eyeY - eyeH * 0.9);
        ctx.stroke();
      } else if (f.eyeShape === 'hooded') {
        ctx.beginPath();
        ctx.moveTo(ex - eyeW * 1.05, eyeY - eyeH * 0.9);
        ctx.lineTo(ex + eyeW * 1.05, eyeY - eyeH * 0.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, eyeY - eyeH - 0.07 * R, eyeW * 0.95, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else if (f.eyeShape === 'almond') {
        ctx.beginPath();
        ctx.moveTo(ex - eyeW * 1.02, eyeY + eyeH * 0.55);
        ctx.quadraticCurveTo(ex, eyeY - eyeH * 1.05, ex + eyeW * 1.02, eyeY + eyeH * 0.55);
        ctx.stroke();
      } else {
        ctx.beginPath();
              ctx.arc(ex, eyeY, eyeW * 0.92, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
      }
      // lashes for women
      if (f.gender === 'female') {
        ctx.strokeStyle = '#3a332b';
        ctx.lineWidth = 1.1 * s;
        ctx.beginPath();
        ctx.moveTo(ex - eyeW * 0.7, eyeY - eyeH * 0.8);
        ctx.lineTo(ex - eyeW * 0.95, eyeY - eyeH * 1.35);
        ctx.moveTo(ex, eyeY - eyeH * 1.0);
        ctx.lineTo(ex + eyeW * 0.08, eyeY - eyeH * 1.4);
        ctx.moveTo(ex + eyeW * 0.7, eyeY - eyeH * 0.8);
        ctx.lineTo(ex + eyeW * 0.95, eyeY - eyeH * 1.35);
        ctx.stroke();
              }
            }

            // ----------------------------------------------------- nose
            drawNose(ctx, f, cx, cy, R, lng, skin);

    // ----------------------------------------------------- mouth
    const my = cy + 0.68 * R * lng;
    const mw = 0.15 * R * (f.lipFullness === 'thin' ? 1.25 : f.lipFullness === 'full' ? 1.4 : 1.3);
    const mth = 0.09 * R * (f.lipFullness === 'thin' ? 0.55 : f.lipFullness === 'full' ? 1.5 : 1.05);
    ctx.fillStyle = '#a4433a';
    ctx.beginPath();
    ctx.moveTo(cx - mw, my);
    ctx.bezierCurveTo(cx - mw * 0.65, my - mth * 0.85, cx - mw * 0.1, my - mth * 0.55, cx, my - mth * 0.3);
    ctx.bezierCurveTo(cx + mw * 0.1, my - mth * 0.55, cx + mw * 0.65, my - mth * 0.85, cx + mw, my);
    ctx.bezierCurveTo(cx + mw * 0.55, my + mth, cx - mw * 0.55, my + mth, cx - mw, my);
    ctx.fill();
    ctx.strokeStyle = shade('#a4433a', -35);
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(cx - mw * 0.7, my);
    ctx.quadraticCurveTo(cx, my + mth * 0.3, cx + mw * 0.7, my);
    ctx.stroke();

    // ----------------------------------------------------- freckles
    if (f.freckles !== 'none') {
      const n = f.freckles === 'few' ? 5 : 11;
      const fyBase = eyeY + 0.42 * R;
      ctx.fillStyle = 'rgba(122,82,42,0.55)';
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const fx = cx + side * (eyeHalfGap + 0.08 * R + rand() * 0.26 * R);
        const fy = fyBase + (rand() - 0.5) * 0.22 * R;
        if (fy < my - 0.15 * R) {
          ctx.beginPath();
          ctx.arc(fx, fy, 0.019 * R, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ----------------------------------------------------- facial hair & glasses
    drawFacialHair(ctx, f, cx, cy, R, wx, lng, hairC, jawTuck, headBot);
    drawGlasses(ctx, f, cx, eyeY, eyeHalfGap, R, s);
  }

  // ---------------------------------------------------------------- hair back
  function drawHairBack(ctx, f, cx, cy, R, wx, lng, hairC) {
    const style = f.hairStyle;
    ctx.fillStyle = hairC;
    if (style === 'afro') {
      ctx.beginPath();
      ctx.arc(cx, cy - 0.55 * R * lng, R * wx * 1.25, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === 'long' || style === 'straight' || style === 'wavy') {
      ctx.beginPath();
      ctx.ellipse(cx, cy - 0.5 * R * lng, R * wx * 1.05, R * lng * 0.98, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- hair front
  function drawHairFront(ctx, f, cx, cy, R, wx, lng, hairC, rand, headBot) {
    const style = f.hairStyle;
    if (style === 'bald') return;
    if (f.headwear === 'hijab' || f.headwear === 'turban' || f.headwear === 'ghutra') return;
    // beanie/cap: hair drawn normally so it peeks out beneath the hat

    ctx.fillStyle = hairC;
    const topY = cy - 1.05 * R * lng;
    const coverH = style === 'buzz' ? 0.30 * R
      : style === 'short' ? 0.5 * R
      : style === 'medium' ? 0.75 * R
      : style === 'long' ? 0.95 * R
      : style === 'straight' ? 0.75 * R
      : style === 'curly' ? 0.75 * R
      : style === 'wavy' ? 0.75 * R
      : style === 'braids' ? 0.9 * R
      : style === 'bun' ? 0.55 * R
      : style === 'ponytail' ? 0.55 * R
      : 0.5 * R;

    // main cap over the top of the head
    ctx.beginPath();
    ctx.moveTo(cx - R * wx * 1.02, topY + coverH * 0.55);
    ctx.bezierCurveTo(cx - R * wx * 1.02, topY - R * 0.3, cx - R * wx * 0.5, topY - R * 0.16, cx, topY - R * 0.02);
    ctx.bezierCurveTo(cx + R * wx * 0.5, topY - R * 0.16, cx + R * wx * 1.02, topY - R * 0.3, cx + R * wx * 1.02, topY + coverH * 0.55);
    ctx.bezierCurveTo(cx + R * wx * 0.62, topY + coverH * 0.68, cx - R * wx * 0.62, topY + coverH * 0.68, cx - R * wx * 1.02, topY + coverH * 0.55);
    ctx.closePath();
    ctx.fill();

    // side panels for medium and longer
    if (coverH >= 0.7 * R) {
      ctx.fillRect(cx - R * wx * 1.12, topY + coverH * 0.3, R * wx * 0.6, coverH * 0.7);
      ctx.fillRect(cx + R * wx * 0.52, topY + coverH * 0.3, R * wx * 0.6, coverH * 0.7);
    }
    // shoulder-length panels
    if (style === 'long' || style === 'straight') {
      ctx.fillRect(cx - R * wx * 1.1, cy - 0.1 * R, R * wx * 0.52, R * 1.25 * lng);
      ctx.fillRect(cx + R * wx * 0.58, cy - 0.1 * R, R * wx * 0.52, R * 1.25 * lng);
    }

    // texture
    if (style === 'curly') {
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const bx = cx + (t - 0.5) * 2 * R * wx * 0.98;
        const by = topY - R * 0.06 - Math.sin(t * Math.PI) * R * 0.28;
        ctx.beginPath();
        ctx.arc(bx, by, 0.17 * R, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === 'wavy') {
      ctx.strokeStyle = hairC;
      ctx.lineWidth = 0.052 * R;
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const bx = cx + (t - 0.5) * 2 * R * wx * 0.92;
        ctx.beginPath();
        ctx.moveTo(bx, topY);
        ctx.quadraticCurveTo(bx - 0.1 * R, topY + 0.32 * R, bx, topY + 0.5 * R);
        ctx.stroke();
      }
    } else if (style === 'braids') {
      ctx.strokeStyle = hairC;
      ctx.lineWidth = 0.055 * R;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const bx = cx + side * (R * wx * (0.98 - i * 0.18));
          ctx.beginPath();
          ctx.moveTo(bx, topY + R * 0.12);
          ctx.quadraticCurveTo(bx + side * 0.08 * R, cy + R * 0.32, bx + side * 0.12 * R, headBot - 0.2 * R);
          ctx.stroke();
        }
        for (let i = 0; i < 4; i++) {
          const by = topY + 0.3 * R + i * 0.16 * R;
          ctx.fillStyle = ['#e0b84a', '#d05050', '#4a9a6a', '#b06a9a'][i % 4];
          ctx.beginPath();
          ctx.arc(cx + side * R * wx * 0.82, by, 0.022 * R, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = hairC;
      }
    } else if (style === 'bun') {
      rr(ctx, cx - R * 0.22, topY - R * 0.34, R * 0.44, R * 0.36, R * 0.18);
      ctx.fill();
    } else if (style === 'ponytail') {
      const side = rand() > 0.5 ? 1 : -1;
      ctx.beginPath();
      ctx.ellipse(cx + side * R * wx * 1.22, cy - 0.12 * R, 0.17 * R, 0.34 * R, side * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === 'mohawk') {
      ctx.beginPath();
      ctx.moveTo(cx - 0.14 * R, topY + 0.55 * R);
      ctx.lineTo(cx - 0.21 * R, topY - 0.3 * R);
      ctx.quadraticCurveTo(cx, topY - 0.5 * R, cx + 0.21 * R, topY - 0.3 * R);
      ctx.lineTo(cx + 0.14 * R, topY + 0.55 * R);
      ctx.closePath();
      ctx.fill();
    }

    // fringe
    if (style === 'medium' || style === 'long' || style === 'straight' || style === 'wavy') {
      ctx.fillStyle = hairC;
      ctx.beginPath();
      ctx.moveTo(cx - R * wx * 0.55, topY + coverH * 0.55);
      ctx.quadraticCurveTo(cx, topY + coverH * 0.85, cx + R * wx * 0.55, topY + coverH * 0.55);
      ctx.quadraticCurveTo(cx + R * wx * 0.25, topY + coverH * 0.74, cx, topY + coverH * 0.72);
      ctx.quadraticCurveTo(cx - R * wx * 0.25, topY + coverH * 0.74, cx - R * wx * 0.55, topY + coverH * 0.55);
      ctx.fill();
    }
  }

  // --------------------------------------------------------------- headwear
  function drawHeadwear(ctx, f, cx, cy, R, wx, lng, col, rand, s) {
    const hw = f.headwear;
    if (hw === 'none') return;
    const topY = cy - 1.05 * R * lng;

    if (hw === 'beanie') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - R * wx * 1.05, topY + 0.5 * R);
      ctx.bezierCurveTo(cx - R * wx * 1.05, topY - 0.35 * R, cx + R * wx * 1.05, topY - 0.35 * R, cx + R * wx * 1.05, topY + 0.5 * R);
      ctx.quadraticCurveTo(cx, topY + 0.64 * R, cx - R * wx * 1.05, topY + 0.5 * R);
      ctx.fill();
          // crisp dark silhouette so the beanie never reads as hair
          ctx.strokeStyle = 'rgba(15,14,12,0.55)';
          ctx.lineWidth = 2.2 * s;
          ctx.stroke();
          ctx.fillRect(cx - R * wx * 1.06, topY + 0.3 * R, R * wx * 2.12, 0.2 * R);
          // knit texture stitches
          ctx.strokeStyle = shade(col, -30);
          ctx.lineWidth = 1.2 * s;
          for (let i = 0; i < 7; i++) {
            const t = (i + 1) / 8;
            const bx = cx + (t - 0.5) * 2 * R * wx * 0.86;
            const by = topY - 0.08 * R - Math.sin(t * Math.PI) * 0.24 * R;
            ctx.beginPath();
            ctx.moveTo(bx - 0.09 * R, by);
            ctx.lineTo(bx + 0.09 * R, by + 0.14 * R);
            ctx.stroke();
          }
          ctx.fillStyle = shade(col, -24);
          ctx.fillRect(cx - R * wx * 1.06, topY + 0.44 * R, R * wx * 2.12, 0.06 * R);
        } else if (hw === 'cap') {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(cx - R * wx * 1.0, topY + 0.42 * R);
          ctx.bezierCurveTo(cx - R * wx * 1.0, topY - 0.4 * R, cx + R * wx * 1.0, topY - 0.4 * R, cx + R * wx * 1.0, topY + 0.42 * R);
          ctx.quadraticCurveTo(cx, topY + 0.56 * R, cx - R * wx * 1.0, topY + 0.42 * R);
          ctx.fill();
          // dark outline delineates cap dome from any hair beneath
          ctx.strokeStyle = 'rgba(15,14,12,0.5)';
          ctx.lineWidth = 2 * s;
          ctx.stroke();
          // panel seams
          ctx.strokeStyle = shade(col, -26);
          ctx.lineWidth = 1.2 * s;
          for (const dx of [-0.4, 0, 0.4]) {
            ctx.beginPath();
            ctx.moveTo(cx + dx * R * wx, topY - 0.04 * R);
            ctx.quadraticCurveTo(cx + dx * R * wx * 1.05, topY + 0.16 * R, cx + dx * R * wx * 0.8, topY + 0.34 * R);
            ctx.stroke();
          }
          // visor with edge highlight
          ctx.fillStyle = shade(col, -12);
          rr(ctx, cx - R * wx * 1.12, topY + 0.34 * R, R * wx * 2.24, 0.18 * R, 0.09 * R);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.1 * s;
          rr(ctx, cx - R * wx * 1.0, topY + 0.36 * R, R * wx * 2.0, 0.06 * R, 0.03 * R);
          ctx.stroke();
          ctx.fillStyle = shade(col, 18);
          ctx.beginPath();
          ctx.arc(cx, topY - 0.08 * R, 0.05 * R, 0, Math.PI * 2);
          ctx.fill();
        } else if (hw === 'turban') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx, topY + 0.1 * R, R * wx * 1.05, R * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
              ctx.strokeStyle = 'rgba(15,14,12,0.55)';
              ctx.lineWidth = 2 * s;
              ctx.stroke();
              ctx.strokeStyle = shade(col, -24);
      ctx.lineWidth = 1.4 * s;
      for (let i = 0; i < 4; i++) {
        const yy = topY + 0.0 * R + i * 0.12 * R;
        ctx.beginPath();
        ctx.moveTo(cx - R * wx * 0.9, yy);
        ctx.quadraticCurveTo(cx, yy + 0.05 * R, cx + R * wx * 0.9, yy);
        ctx.stroke();
      }
      ctx.fillStyle = shade(col, 6);
      ctx.beginPath();
      ctx.ellipse(cx, topY + 0.38 * R, R * wx * 0.3, R * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (hw === 'ghutra') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - R * wx * 1.05, cy + 0.3 * R);
      ctx.bezierCurveTo(cx - R * wx * 1.3, topY - 0.1 * R, cx - R * wx * 0.85, topY - 0.55 * R, cx, topY - 0.62 * R);
      ctx.bezierCurveTo(cx + R * wx * 0.85, topY - 0.55 * R, cx + R * wx * 1.3, topY - 0.1 * R, cx + R * wx * 1.05, cy + 0.3 * R);
      ctx.quadraticCurveTo(cx, cy + 0.6 * R, cx - R * wx * 1.05, cy + 0.3 * R);
      ctx.fill();
          ctx.strokeStyle = 'rgba(15,14,12,0.5)';
          ctx.lineWidth = 2 * s;
          ctx.stroke();
          ctx.fillStyle = shade(col, -38);
      rr(ctx, cx - R * wx * 1.12, topY - 0.12 * R, R * wx * 2.24, 0.13 * R, 0.065 * R);
      ctx.fill();
      ctx.strokeStyle = shade(col, -20);
      ctx.lineWidth = 1.1 * s;
      ctx.beginPath();
      ctx.moveTo(cx - R * wx * 0.72, topY + 0.05 * R);
      ctx.quadraticCurveTo(cx - R * wx * 0.3, cy + 0.3 * R, cx, cy + 0.48 * R);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + R * wx * 0.72, topY + 0.05 * R);
      ctx.quadraticCurveTo(cx + R * wx * 0.3, cy + 0.3 * R, cx, cy + 0.48 * R);
      ctx.stroke();
    } else if (hw === 'hijab') {
      // veil sweeping over the head and down to the shoulders
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - R * 1.35, cy + 0.8 * R);
      ctx.bezierCurveTo(cx - R * 1.5, cy - 0.2 * R, cx - R * 0.85, topY - 0.6 * R, cx, topY - 0.62 * R);
      ctx.bezierCurveTo(cx + R * 0.85, topY - 0.6 * R, cx + R * 1.5, cy - 0.2 * R, cx + R * 1.35, cy + 0.8 * R);
      ctx.quadraticCurveTo(cx, cy + 1.0 * R, cx - R * 1.35, cy + 0.8 * R);
      ctx.closePath();
      // face opening (even-odd cut so the face stays visible)
      ctx.moveTo(cx + R * wx * 1.0, cy + 0.18 * R);
      ctx.quadraticCurveTo(cx + R * wx * 0.88, cy - 0.5 * R, cx, cy - 0.6 * R);
      ctx.quadraticCurveTo(cx - R * wx * 0.88, cy - 0.5 * R, cx - R * wx * 1.0, cy + 0.18 * R);
      ctx.closePath();
      ctx.fill('evenodd');
      // brow band
      ctx.fillStyle = shade(col, -10);
      rr(ctx, cx - R * wx * 0.9, cy - 0.66 * R, R * wx * 1.8, 0.1 * R, 0.05 * R);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- nose
  function drawNose(ctx, f, cx, cy, R, lng, skin) {
    const pen = shade(skin, -45);
    ctx.strokeStyle = pen;
    ctx.lineWidth = 0.035 * R;
    ctx.lineCap = 'round';
    const top = cy - 0.02 * R * lng;
    const tip = cy + 0.42 * R * lng;
    const bx = 0.05 * R;

    switch (f.noseShape) {
      case 'narrow':
        ctx.beginPath();
        ctx.moveTo(cx - bx, top);
        ctx.lineTo(cx - bx * 1.15, tip - 0.16 * R);
        ctx.moveTo(cx + bx, top);
        ctx.lineTo(cx + bx * 1.15, tip - 0.16 * R);
        ctx.stroke();
        ctx.fillStyle = pen;
        ctx.beginPath(); ctx.arc(cx, tip - 0.15 * R, 0.055 * R, 0, Math.PI * 2); ctx.fill();
        break;
      case 'wide':
        ctx.beginPath();
        ctx.moveTo(cx - bx * 2.0, top);
        ctx.lineTo(cx - bx * 2.9, tip - 0.1 * R);
        ctx.moveTo(cx + bx * 2.0, top);
        ctx.lineTo(cx + bx * 2.9, tip - 0.1 * R);
        ctx.stroke();
        nostrils(ctx, cx, tip + 0.02 * R, 0.12 * R, pen);
        break;
      case 'hooked':
        ctx.beginPath();
        ctx.moveTo(cx, top);
        ctx.lineTo(cx, tip - 0.26 * R);
        ctx.quadraticCurveTo(cx, tip - 0.16 * R, cx + 0.18 * R, tip - 0.14 * R);
        ctx.stroke();
        nostrils(ctx, cx, tip + 0.02 * R, 0.08 * R, pen);
        break;
      case 'snub':
        ctx.beginPath();
        ctx.moveTo(cx, top);
        ctx.lineTo(cx, tip - 0.22 * R);
        ctx.stroke();
        ctx.fillStyle = pen;
        ctx.beginPath(); ctx.arc(cx, tip - 0.16 * R, 0.07 * R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade(skin, -20);
        ctx.beginPath(); ctx.arc(cx - 0.02 * R, tip - 0.19 * R, 0.035 * R, 0, Math.PI * 2); ctx.fill();
        break;
      case 'flared':
        ctx.beginPath();
        ctx.moveTo(cx - bx, top);
        ctx.lineTo(cx - bx, tip - 0.22 * R);
        ctx.moveTo(cx + bx, top);
              ctx.lineTo(cx + bx, tip - 0.22 * R);
        ctx.stroke();
        nostrils(ctx, cx, tip + 0.02 * R, 0.15 * R, pen);
        break;
      default: // straight
        ctx.beginPath();
        ctx.moveTo(cx, top);
        ctx.lineTo(cx, tip - 0.2 * R);
        ctx.quadraticCurveTo(cx, tip - 0.08 * R, cx + 0.15 * R, tip - 0.08 * R);
        ctx.stroke();
    }
  }
  function nostrils(ctx, cx, tip, w, pen) {
    ctx.strokeStyle = pen;
    ctx.lineWidth = 0.03 * 48;
      ctx.beginPath();
      ctx.arc(cx - w, tip - 0.08 * 48, 0.06 * 48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + w, tip - 0.08 * 48, 0.06 * 48, 0, Math.PI * 2);
      ctx.stroke();
    }

  // --------------------------------------------------------------- facial hair
  function drawFacialHair(ctx, f, cx, cy, R, wx, lng, hairC, jawTuck, headBot) {
    const fh = f.facialHair;
    if (fh === 'none' || f.gender === 'female') return;

    if (fh === 'stubble') {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 0.85 * R * lng, R * wx * 0.85, R * 0.28 * lng, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (fh === 'mustache') {
      ctx.fillStyle = hairC;
      ctx.beginPath();
      ctx.moveTo(cx - 0.21 * R, cy + 0.52 * R * lng);
      ctx.quadraticCurveTo(cx - 0.05 * R, cy + 0.45 * R * lng, cx + 0.21 * R, cy + 0.52 * R * lng);
      ctx.quadraticCurveTo(cx + 0.1 * R, cy + 0.6 * R * lng, cx, cy + 0.58 * R * lng);
      ctx.quadraticCurveTo(cx - 0.1 * R, cy + 0.6 * R * lng, cx - 0.21 * R, cy + 0.52 * R * lng);
      ctx.fill();
    } else if (fh === 'goatee') {
      ctx.fillStyle = hairC;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 0.98 * R * lng, 0.16 * R, 0.13 * R, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (fh === 'beard') {
      ctx.fillStyle = hairC;
      ctx.beginPath();
      ctx.moveTo(cx - R * wx * 1.02, cy + 0.12 * R);
      ctx.bezierCurveTo(cx - R * wx * 1.0, cy + 0.55 * R, cx - R * wx * jawTuck, cy + 0.95 * R, cx, headBot - 0.03 * R);
      ctx.bezierCurveTo(cx + R * wx * jawTuck, cy + 0.95 * R, cx + R * wx * 1.0, cy + 0.55 * R, cx + R * wx * 1.02, cy + 0.12 * R);
      ctx.quadraticCurveTo(cx, cy + 0.5 * R, cx - R * wx * 1.02, cy + 0.12 * R);
      ctx.closePath();
      ctx.fill();
      // mustache part
      ctx.beginPath();
      ctx.moveTo(cx - 0.21 * R, cy + 0.52 * R * lng);
      ctx.quadraticCurveTo(cx, cy + 0.45 * R * lng, cx + 0.21 * R, cy + 0.52 * R * lng);
      ctx.quadraticCurveTo(cx, cy + 0.6 * R * lng, cx - 0.21 * R, cy + 0.52 * R * lng);
      ctx.fill();
    }
  }

  // --------------------------------------------------------------- glasses
  function drawGlasses(ctx, f, cx, eyeY, eyeHalfGap, R, s) {
    const g = f.glasses;
    if (g === 'none') return;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // lens shapes (filled with a subtle tint so they read as glass)
      ctx.fillStyle = 'rgba(150,190,235,0.16)';
      for (const side of [-1, 1]) {
        const ex = cx + side * eyeHalfGap;
        ctx.beginPath();
        if (g === 'round') {
          ctx.arc(ex, eyeY, 0.29 * R, 0, Math.PI * 2);
        } else if (g === 'rectangular') {
          rr(ctx, ex - 0.38 * R, eyeY - 0.15 * R, 0.76 * R, 0.30 * R, 0.05 * R);
      } else if (g === 'aviator') {
          ctx.moveTo(ex - 0.3 * R, eyeY - 0.16 * R);
          ctx.lineTo(ex + 0.3 * R, eyeY - 0.16 * R);
          ctx.lineTo(ex + 0.32 * R, eyeY + 0.08 * R);
          ctx.quadraticCurveTo(ex + 0.3 * R, eyeY + 0.2 * R, ex, eyeY + 0.2 * R);
          ctx.quadraticCurveTo(ex - 0.3 * R, eyeY + 0.2 * R, ex - 0.32 * R, eyeY + 0.08 * R);
          ctx.closePath();
        }
        ctx.fill();
      }

      // bold dark frames
      ctx.strokeStyle = '#171310';
      ctx.lineWidth = 4.2 * s;
      for (const side of [-1, 1]) {
        const ex = cx + side * eyeHalfGap;
        ctx.beginPath();
        if (g === 'round') {
          ctx.arc(ex, eyeY, 0.29 * R, 0, Math.PI * 2);
        } else if (g === 'rectangular') {
          rr(ctx, ex - 0.38 * R, eyeY - 0.15 * R, 0.76 * R, 0.30 * R, 0.05 * R);
        } else if (g === 'aviator') {
          ctx.moveTo(ex - 0.3 * R, eyeY - 0.16 * R);
          ctx.lineTo(ex + 0.3 * R, eyeY - 0.16 * R);
          ctx.lineTo(ex + 0.32 * R, eyeY + 0.08 * R);
          ctx.quadraticCurveTo(ex + 0.3 * R, eyeY + 0.2 * R, ex, eyeY + 0.2 * R);
          ctx.quadraticCurveTo(ex - 0.3 * R, eyeY + 0.2 * R, ex - 0.32 * R, eyeY + 0.08 * R);
          ctx.closePath();
        }
        ctx.stroke();
        // temple bar
        ctx.lineWidth = 3.4 * s;
        ctx.beginPath();
        ctx.moveTo(ex + side * 0.34 * R, eyeY);
        ctx.lineTo(ex + side * 0.62 * R, eyeY - 0.03 * R);
        ctx.stroke();
      }
      // bridge
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath();
      if (g === 'aviator') {
        ctx.moveTo(cx - 0.13 * R, eyeY - 0.1 * R);
        ctx.quadraticCurveTo(cx, eyeY - 0.24 * R, cx + 0.13 * R, eyeY - 0.1 * R);
      } else {
        ctx.moveTo(cx - 0.16 * R, eyeY - 0.05 * R);
        ctx.lineTo(cx + 0.16 * R, eyeY - 0.05 * R);
      }
      ctx.stroke();
      // nose pads
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#171310';
        ctx.beginPath();
        ctx.arc(cx + side * 0.1 * R, eyeY + 0.2 * R, 0.03 * R, 0, Math.PI * 2);
        ctx.fill();
      }
      // glass glare
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.4 * s;
      for (const side of [-1, 1]) {
        const ex = cx + side * eyeHalfGap;
        ctx.beginPath();
        ctx.moveTo(ex - 0.16 * R, eyeY - 0.14 * R);
        ctx.lineTo(ex - 0.03 * R, eyeY - 0.2 * R);
        ctx.stroke();
      }
    }

  window.faceGen || (window.faceGen = {});
  window.faceGen.drawFace = drawFace;
})();