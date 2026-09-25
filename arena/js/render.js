/* Shonen Legends: rendering — stages, fighters, effects, HUD and cinematics. */
(() => {
  'use strict';
  const SL = (window.SL = window.SL || {});
  const { ENERGY_COLOR } = SL.data;

  const W = 960, H = 540, GROUND = 462, WORLD = 1400, TAU = Math.PI * 2;
  SL.C = { W, H, GROUND, WORLD, TAU };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  function rgb(hex) { const n = parseInt(String(hex).slice(1), 16) || 0; return [n >> 16, (n >> 8) & 255, n & 255]; }
  function hexA(hex, a) { const [r, gg, b] = rgb(hex); return `rgba(${r},${gg},${b},${a})`; }
  function shade(hex, amt) {
    let [r, gg, b] = rgb(hex);
    if (amt < 0) { r *= 1 + amt; gg *= 1 + amt; b *= 1 + amt; }
    else { r += (255 - r) * amt; gg += (255 - gg) * amt; b += (255 - b) * amt; }
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  }
  SL.util = { clamp, lerp, rnd, hexA, shade, TAU };

  let g = null; // current 2D context; swapped for portraits
  const R = (SL.render = { set ctx(c) { g = c; }, get ctx() { return g; } });

  // ---------- helpers ----------
  function dot(x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function poly(pts, ox = 0, oy = 0) { g.beginPath(); g.moveTo(ox + pts[0][0], oy + pts[0][1]); for (const [x, y] of pts) g.lineTo(ox + x, oy + y); g.closePath(); }
  function outlineText(text, x, y, size, fill, stroke = '#0a0c18', align = 'center', font = 'display') {
    g.font = font === 'display' ? `${size}px Bangers, Impact, sans-serif` : `600 ${size}px "Chakra Petch", sans-serif`;
    g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = Math.max(3, size / 6); g.strokeStyle = stroke; g.strokeText(text, x, y);
    g.fillStyle = fill; g.fillText(text, x, y);
  }
  R.outlineText = outlineText;

  // ---------- precomputed scenery ----------
  const STARS = Array.from({ length: 110 }, (_, i) => ({ x: rnd(i * 7.1) * W, y: rnd(i * 3.3) * 340, r: rnd(i * 1.9) * 1.6 + 0.4 }));
  const ridge = (step, base, amp, seed) => { const a = []; for (let x = -300; x <= WORLD + 300; x += step) a.push([x, base + rnd(x * 0.013 + seed) * amp - Math.sin(x / 190 + seed) * amp * 0.5]); return a; };
  const MOUNT_FAR = ridge(50, 300, 60, 1), MOUNT_NEAR = ridge(70, 352, 40, 7);
  const HOUSES = []; for (let x = -200, i = 0; x < WORLD + 200; i++) { const w = 60 + rnd(i * 5.3) * 60, h = 40 + rnd(i * 2.1) * 45; HOUSES.push({ x, w, h, lit: rnd(i * 9.7) > 0.4 }); x += w + 8 + rnd(i * 1.7) * 30; }
  const BUILDINGS = []; for (let x = -300, i = 0; x < WORLD + 300; i++) { const w = 50 + rnd(i * 3.1) * 90, h = 120 + rnd(i * 4.7) * 230; BUILDINGS.push({ x, w, h, i }); x += w + 4 + rnd(i * 2.3) * 16; }
  const TREES = Array.from({ length: 26 }, (_, i) => ({ x: -250 + i * 72 + rnd(i) * 40, w: 16 + rnd(i * 3) * 18, far: i % 2 }));
  const CLOUDS = Array.from({ length: 6 }, (_, i) => ({ x: rnd(i * 4.4) * (W + 300), y: 40 + rnd(i * 8.8) * 150, s: 0.1 + rnd(i * 2.2) * 0.2, k: 0.7 + rnd(i * 6.1) * 0.8 }));
  const ROCKS = Array.from({ length: 9 }, (_, i) => ({ x: rnd(i * 2.7) * WORLD, y: 90 + rnd(i * 5.1) * 180, r: 14 + rnd(i * 8.3) * 30, s: rnd(i) * TAU }));
  const SHARDS = Array.from({ length: 14 }, (_, i) => ({ x: rnd(i * 3.9) * WORLD, y: 60 + rnd(i * 6.1) * 280, r: 12 + rnd(i * 2.2) * 34, s: rnd(i * 9) * TAU, col: ['#4aa8ff', '#ffd23f', '#ff6a3d', '#3ddc97', '#ff4f6d', '#a07bff'][i % 6] }));

  // ---------- camera layers ----------
  function layer(cam, p, fn) {
    g.save();
    const z = 1 + (cam.z - 1) * p;
    g.translate(W / 2, GROUND); g.scale(z, z);
    g.translate(-(WORLD / 2 + (cam.x - WORLD / 2) * p), -GROUND);
    fn();
    g.restore();
  }
  function sky(stops, y1 = 470) {
    const gr = g.createLinearGradient(0, 0, 0, y1);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g.fillStyle = gr; g.fillRect(-40, -40, W + 80, y1 + 40);
  }
  function glow(x, y, r, inner, outer) {
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function fillRidge(pts, base, color) {
    g.fillStyle = color; g.beginPath(); g.moveTo(pts[0][0], base);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(pts[pts.length - 1][0], base); g.closePath(); g.fill();
  }
  function floor(top, fill, band) {
    g.fillStyle = fill; g.fillRect(-400, top, WORLD + 800, 400);
    if (band) { g.fillStyle = band; g.fillRect(-400, top + 10, WORLD + 800, 40); }
  }

  const STAGES = {
    village(cam, T) {
      sky([[0, '#231a46'], [0.5, '#b8416c'], [0.8, '#ff9350'], [1, '#ffc873']]);
      layer(cam, 0.1, () => { glow(900, 320, 240, 'rgba(255,240,190,.9)', 'rgba(255,160,90,0)'); dot(900, 320, 66, '#ffe3a3'); });
      layer(cam, 0.25, () => fillRidge(MOUNT_FAR, 460, '#7a3462'));
      layer(cam, 0.45, () => {
        fillRidge(MOUNT_NEAR, 460, '#4c2150');
        g.fillStyle = '#2f1638';
        for (let i = 0; i < 4; i++) { const y = 430 - i * 52, w = 110 - i * 20, cx = 330; g.fillRect(cx - w / 2 + 12, y - 40, w - 24, 40); g.beginPath(); g.moveTo(cx - w / 2 - 14, y - 34); g.quadraticCurveTo(cx, y - 70, cx + w / 2 + 14, y - 34); g.lineTo(cx + w / 2, y - 44); g.quadraticCurveTo(cx, y - 64, cx - w / 2, y - 44); g.closePath(); g.fill(); }
      });
      layer(cam, 0.7, () => {
        for (const h of HOUSES) {
          g.fillStyle = '#2a1334'; g.fillRect(h.x, 440 - h.h, h.w, h.h);
          g.beginPath(); g.moveTo(h.x - 10, 444 - h.h); g.lineTo(h.x + h.w / 2, 416 - h.h); g.lineTo(h.x + h.w + 10, 444 - h.h); g.closePath(); g.fill();
          if (h.lit) { g.fillStyle = 'rgba(255,180,90,.8)'; g.fillRect(h.x + h.w * 0.25, 440 - h.h * 0.6, 9, 11); g.fillRect(h.x + h.w * 0.6, 440 - h.h * 0.6, 9, 11); }
        }
      });
      layer(cam, 1, () => { floor(436, '#3a1f2e', '#57303f'); g.fillStyle = 'rgba(255,190,140,.08)'; for (let x = -300; x < WORLD + 300; x += 90) g.fillRect(x, 470, 30, 3); });
    },
    soul(cam, T) {
      sky([[0, '#04061a'], [1, '#17214d']]);
      for (const s of STARS) { g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(T * 0.02 + s.x)); g.fillStyle = '#dfe6ff'; g.fillRect(s.x, s.y, s.r, s.r); }
      g.globalAlpha = 1;
      layer(cam, 0.08, () => {
        glow(420, 150, 220, 'rgba(200,210,255,.35)', 'rgba(200,210,255,0)');
        dot(420, 150, 74, '#f3f1ff');
        g.fillStyle = 'rgba(190,190,225,.5)'; [[395, 130, 12], [445, 170, 16], [430, 115, 7]].forEach(([x, y, r]) => dot(x, y, r, 'rgba(190,190,225,.5)'));
        g.fillStyle = 'rgba(8,11,34,.85)'; g.beginPath(); g.ellipse(460, 178, 140, 7, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(370, 128, 100, 5, 0, 0, TAU); g.fill();
      });
      layer(cam, 0.4, () => {
        [[760, 70, 180], [930, 44, 240], [1050, 56, 220], [140, 60, 230]].forEach(([x, w, top]) => {
          g.fillStyle = '#8f96c4'; g.fillRect(x, top, w, 440 - top);
          g.fillStyle = '#161a38'; g.beginPath(); g.moveTo(x - 12, top + 4); g.lineTo(x + w / 2, top - 24); g.lineTo(x + w + 12, top + 4); g.closePath(); g.fill();
          g.fillStyle = '#23284f'; g.fillRect(x + w / 2 - 5, top + 20, 10, 16);
        });
      });
      layer(cam, 0.7, () => {
        g.fillStyle = '#7d84b3'; g.fillRect(-400, 364, WORLD + 800, 76);
        g.fillStyle = '#161a38'; g.fillRect(-400, 348, WORLD + 800, 18);
        g.fillStyle = '#23284f'; for (let x = -400; x < WORLD + 400; x += 14) g.fillRect(x, 350, 6, 14);
      });
      layer(cam, 1, () => {
        floor(436, '#1d2244');
        g.strokeStyle = 'rgba(160,175,255,.12)'; g.lineWidth = 1;
        [452, 474, 502, 540].forEach((y, i) => { g.beginPath(); g.moveTo(-400, y); g.lineTo(WORLD + 400, y); g.stroke(); for (let x = -400 + (i % 2) * 60; x < WORLD + 400; x += 120) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 22 + i * 6); g.stroke(); } });
      });
    },
    sea(cam, T) {
      sky([[0, '#2a7fd6'], [1, '#a8dcff']], 340);
      glow(840, 60, 180, 'rgba(255,255,235,.95)', 'rgba(255,255,235,0)');
      g.fillStyle = 'rgba(255,255,255,.88)';
      for (const c of CLOUDS) { const x = ((c.x + T * c.s) % (W + 300)) - 150; g.beginPath(); g.ellipse(x, c.y, 60 * c.k, 18 * c.k, 0, 0, TAU); g.ellipse(x + 30 * c.k, c.y - 12 * c.k, 36 * c.k, 20 * c.k, 0, 0, TAU); g.ellipse(x - 34 * c.k, c.y - 4 * c.k, 30 * c.k, 14 * c.k, 0, 0, TAU); g.fill(); }
      layer(cam, 0.3, () => {
        const gr = g.createLinearGradient(0, 330, 0, 440); gr.addColorStop(0, '#1b73bf'); gr.addColorStop(1, '#0c4a88');
        g.fillStyle = gr; g.fillRect(-400, 330, WORLD + 800, 120);
        g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2;
        for (let r = 0; r < 5; r++) { const y = 344 + r * 18, off = Math.sin(T * 0.03 + r) * 20; for (let x = -400 + (r % 2) * 40; x < WORLD + 400; x += 90) { g.beginPath(); g.moveTo(x + off, y); g.quadraticCurveTo(x + off + 12, y - 5, x + off + 24, y); g.stroke(); } }
        const sx = 1050, sy = 336 + Math.sin(T * 0.03) * 2;
        g.fillStyle = '#3b2417'; g.beginPath(); g.moveTo(sx - 60, sy - 10); g.lineTo(sx + 64, sy - 12); g.lineTo(sx + 48, sy + 10); g.lineTo(sx - 46, sy + 10); g.closePath(); g.fill();
        g.fillRect(sx - 2, sy - 90, 4, 80);
        g.fillStyle = '#f4efe2'; g.beginPath(); g.moveTo(sx - 30, sy - 78); g.lineTo(sx + 30, sy - 80); g.lineTo(sx + 34, sy - 34); g.lineTo(sx - 34, sy - 32); g.closePath(); g.fill();
        g.fillStyle = '#111'; g.fillRect(sx + 2, sy - 104, 22, 14); dot(sx + 13, sy - 97, 3.5, '#fff');
      });
      layer(cam, 1, () => {
        g.fillStyle = '#5a3718'; g.fillRect(-400, 404, WORLD + 800, 9);
        for (let x = -400; x < WORLD + 400; x += 48) g.fillRect(x, 404, 8, 36);
        for (let i = 0; i < 8; i++) { const y = 438 + i * 18; g.fillStyle = i % 2 ? '#7c4f27' : '#91602f'; g.fillRect(-400, y, WORLD + 800, 18); g.fillStyle = '#5b3818'; for (let x = -400 + (i % 3) * 70; x < WORLD + 400; x += 210) g.fillRect(x, y, 2, 18); }
      });
    },
    tournament(cam, T) {
      sky([[0, '#3b8fd9'], [0.7, '#9fd6f5'], [1, '#e9f3d7']]);
      g.fillStyle = 'rgba(255,255,255,.9)';
      for (const c of CLOUDS) { const x = ((c.x + T * c.s * 0.6) % (W + 300)) - 150; g.beginPath(); g.ellipse(x, c.y * 0.8, 70 * c.k, 16 * c.k, 0, 0, TAU); g.fill(); }
      layer(cam, 0.2, () => {
        for (const r of ROCKS) { const y = r.y + Math.sin(T * 0.02 + r.s) * 8; g.fillStyle = '#8a7a66'; g.beginPath(); g.ellipse(r.x, y, r.r * 1.3, r.r * 0.7, 0, 0, TAU); g.fill(); g.fillStyle = '#6e5f4f'; g.beginPath(); g.moveTo(r.x - r.r, y + 4); g.lineTo(r.x, y + r.r * 1.6); g.lineTo(r.x + r.r, y + 4); g.closePath(); g.fill(); }
      });
      layer(cam, 0.35, () => fillRidge(MOUNT_FAR, 460, '#6f9a7a'));
      layer(cam, 0.65, () => {
        // stands with crowd
        g.fillStyle = '#c9b999'; g.fillRect(-400, 330, WORLD + 800, 110);
        g.fillStyle = '#a8977a'; for (let y = 340; y < 440; y += 22) g.fillRect(-400, y, WORLD + 800, 3);
        for (let i = 0; i < 180; i++) { const x = -300 + i * 11 + rnd(i) * 6, y = 346 + (i % 4) * 22 + Math.sin(T * 0.2 + i) * (i % 3 === 0 ? 2 : 0); dot(x, y, 4.5, ['#2d3e7a', '#9a3144', '#2f6a4a', '#6b4a8a', '#c07a2a'][i % 5]); }
      });
      layer(cam, 1, () => {
        floor(436, '#e8dfcc');
        g.strokeStyle = '#bfb49c'; g.lineWidth = 2;
        for (let x = -400; x < WORLD + 400; x += 80) { g.beginPath(); g.moveTo(x, 436); g.lineTo(x - 30, 560); g.stroke(); }
        [456, 486, 526].forEach(y => { g.beginPath(); g.moveTo(-400, y); g.lineTo(WORLD + 400, y); g.stroke(); });
      });
    },
    city(cam, T) {
      sky([[0, '#05040f'], [0.6, '#1a1036'], [1, '#3a1552']]);
      layer(cam, 0.15, () => {
        for (const b of BUILDINGS) { if (b.i % 2) continue; g.fillStyle = '#140f28'; g.fillRect(b.x, 440 - b.h - 60, b.w, b.h + 60); }
      });
      layer(cam, 0.45, () => {
        for (const b of BUILDINGS) {
          if (!(b.i % 2)) continue;
          g.fillStyle = '#1d1638'; g.fillRect(b.x, 440 - b.h, b.w, b.h);
          for (let y = 440 - b.h + 10; y < 430; y += 16) for (let x = b.x + 6; x < b.x + b.w - 8; x += 12) if (rnd(x * 0.7 + y) > 0.55) { g.fillStyle = rnd(x + y * 3) > 0.8 ? '#ff5fa2' : '#ffd98a'; g.globalAlpha = 0.55; g.fillRect(x, y, 6, 8); }
          g.globalAlpha = 1;
          if (b.i % 5 === 1) { g.fillStyle = b.i % 10 === 1 ? '#ff3d7f' : '#3de0ff'; g.globalAlpha = 0.6 + 0.4 * Math.sin(T * 0.1 + b.i); g.fillRect(b.x + 8, 440 - b.h + 20, 10, 60); g.globalAlpha = 1; }
        }
      });
      // curtain dome
      g.fillStyle = 'rgba(10,6,20,.35)'; g.beginPath(); g.ellipse(W / 2, 470, W * 0.9, 520, 0, Math.PI, TAU); g.fill();
      layer(cam, 1, () => {
        floor(436, '#1a1826');
        g.fillStyle = 'rgba(255,255,255,.75)';
        for (let x = -400; x < WORLD + 400; x += 60) g.fillRect(x, 468, 36, 8);
        g.fillStyle = 'rgba(255,90,160,.08)'; g.fillRect(-400, 436, WORLD + 800, 6);
      });
    },
    forest(cam, T) {
      sky([[0, '#0b0a24'], [0.7, '#27204f'], [1, '#43306b']]);
      layer(cam, 0.08, () => { glow(1000, 140, 170, 'rgba(255,240,220,.4)', 'rgba(255,240,220,0)'); dot(1000, 140, 50, '#fff4e0'); });
      layer(cam, 0.35, () => { for (const t of TREES) if (t.far) { g.fillStyle = '#1b1438'; g.fillRect(t.x, 80, t.w, 400); } });
      layer(cam, 0.6, () => {
        for (const t of TREES) {
          if (t.far) continue;
          g.fillStyle = '#120d24'; g.fillRect(t.x, 0, t.w + 8, 460);
          for (let k = 0; k < 7; k++) {
            const cx = t.x + t.w / 2 + (k - 3) * 22, cy = 40 + (k % 3) * 26;
            g.fillStyle = hexA(k % 2 ? '#b98cff' : '#d9a8ff', 0.75);
            g.beginPath(); g.ellipse(cx, cy + 30, 9, 34 + (k % 2) * 10, 0, 0, TAU); g.fill();
          }
        }
      });
      layer(cam, 1, () => { floor(436, '#1b1630', '#241c3e'); g.fillStyle = 'rgba(217,168,255,.25)'; for (let x = -400; x < WORLD + 400; x += 37) dot(x + (x % 7), 450 + (x % 23), 2, 'rgba(217,168,255,.35)'); });
    },
    rift(cam, T) {
      sky([[0, '#050009'], [1, '#1c0a33']]);
      g.save(); g.translate(W / 2, 200); g.rotate(T * 0.002);
      for (let i = 0; i < 6; i++) { g.rotate(TAU / 6); const gr = g.createLinearGradient(0, 0, 500, 0); gr.addColorStop(0, 'rgba(138,92,255,.35)'); gr.addColorStop(1, 'rgba(138,92,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(250, 80, 520, 20); g.lineTo(520, 60); g.quadraticCurveTo(250, 120, 0, 10); g.fill(); }
      g.restore();
      glow(W / 2, 200, 120, 'rgba(0,0,0,1)', 'rgba(0,0,0,0)');
      layer(cam, 0.3, () => {
        for (const s of SHARDS) { const y = s.y + Math.sin(T * 0.02 + s.s) * 12; g.save(); g.translate(s.x, y); g.rotate(s.s + T * 0.004); g.fillStyle = hexA(s.col, 0.55); g.beginPath(); g.moveTo(0, -s.r); g.lineTo(s.r * 0.5, 0); g.lineTo(0, s.r); g.lineTo(-s.r * 0.5, 0); g.closePath(); g.fill(); g.restore(); }
      });
      layer(cam, 1, () => {
        floor(436, '#120a22');
        g.strokeStyle = 'rgba(160,110,255,.35)'; g.lineWidth = 2;
        for (let x = -400; x < WORLD + 400; x += 140) { g.beginPath(); g.moveTo(x, 436); g.lineTo(x + 40, 470); g.lineTo(x + 20, 520); g.stroke(); }
        g.fillStyle = 'rgba(138,92,255,.15)'; g.fillRect(-400, 436, WORLD + 800, 4);
      });
    },
  };
  R.drawStage = (stage, cam, T) => (STAGES[stage] || STAGES.village)(cam, T);

  // ---------- fighters ----------
  // Fighters are drawn as a jointed rig: two-bone arms and legs (IK-planted feet),
  // a shaped torso, an anime head with expressions, and layered hair. Each part is
  // drawn twice: an ink pass for the outline, then a color pass with cylindrical
  // shading, highlights and a rim light from the stage.
  const OUT = '#0b0a14';
  const HAIR = {
    spiky: [[-13, 4], [-25, -1], [-16, -8], [-27, -16], [-13, -15], [-18, -30], [-4, -20], [1, -34], [8, -19], [18, -27], [14, -12], [20, -7], [14, -5], [9, -9], [3, -6], [-3, -9], [-8, -2]],
    swept: [[-12, 6], [-28, 3], [-18, -5], [-30, -14], [-15, -13], [-24, -27], [-4, -19], [6, -20], [16, -12], [18, -4], [11, -7], [7, -2], [2, -8], [-6, -4]],
    messy: [[-14, 3], [-18, -7], [-12, -15], [-3, -18], [7, -17], [15, -12], [17, -5], [12, -7], [8, -3], [4, -7], [-2, -5], [-8, -4]],
    flame: [[-12, 4], [-17, -6], [-15, -21], [-9, -38], [-5, -25], [0, -48], [4, -29], [11, -42], [13, -23], [18, -12], [15, -4], [9, -9], [3, -6], [-3, -9], [-8, -3]],
    tall: [[-13, 6], [-27, 1], [-17, -6], [-30, -15], [-15, -15], [-23, -31], [-6, -21], [-4, -40], [4, -23], [13, -35], [13, -17], [19, -10], [14, -6], [9, -10], [3, -5], [-3, -9], [-8, -2]],
    long: [[15, -4], [14, -11], [8, -16], [-2, -17], [-12, -13], [-16, -2], [-17, 14], [-16, 32], [-10, 44], [-5, 33], [-7, 15], [-4, -2], [2, -8], [8, -9], [13, -6]],
    crown: [[-14, 2], [-16, -8], [-9, -15], [2, -16], [11, -13], [15, -6], [13, -4], [4, -8], [-4, -7], [-10, -2]],
  };
  R.HAIR_STYLES = Object.keys(HAIR);
  const EYE = { kaito: '#2f7fe0', ren: '#2a2a3a', ichiro: '#7a4420', sora: '#5a6fae', taro: '#3a2418', kenji: '#4a3218', kairo: '#2a2020', vex: '#2a2020', yuto: '#7a4430', kyo: '#6fc8ff', tenji: '#9a2a22', zen: '#b8862a', null: '#b27bff' };
  const STAGE_RIM = { village: '#ffb070', soul: '#9fc4ff', sea: '#fff1c0', tournament: '#fff4d6', city: '#ff6fb0', forest: '#c9a2ff', rift: '#b58cff' };
  const LIGHT_EYES = new Set(['eye', 'eyes6', 'void', 'frost', 'scar', 'sage', 'flame']);

  function pose(f, T, air) {
    const P = { lean: 0, crouch: 3, bob: 0, legs: 'ik', fF: 14, fB: -12, lF: 0, lB: 0, thF: 0, knF: 0, thB: 0, knB: 0,
      shF: 0.45, elF: 1.65, shB: 0.25, elB: 1.8, extF: 0, expr: 'neutral', tilt: 0 };
    switch (f.state) {
      case 'idle': P.bob = Math.sin(T * 0.1) * 1.5; P.shF += Math.sin(T * 0.1) * 0.05; break;
      case 'walk': { const s = Math.sin(f.anim * 0.3), c = Math.cos(f.anim * 0.3); P.fF = 4 + s * 17; P.fB = -4 - s * 17; P.lF = Math.max(0, c) * 7; P.lB = Math.max(0, -c) * 7; P.bob = -Math.abs(s) * 2; P.crouch = 1; P.shF = 0.5 - s * 0.25; P.shB = 0.3 + s * 0.25; break; }
      case 'dash': P.lean = 0.4; P.legs = 'fk'; P.thF = 1.1; P.knF = 1.3; P.thB = -0.5; P.knB = 0.9; P.shF = -0.9; P.elF = 0.5; P.shB = -1.1; P.elB = 0.4; P.crouch = 6; P.expr = 'grit'; break;
      case 'jump': P.legs = 'fk'; P.thF = 0.9; P.knF = 1.5; P.thB = 0.35; P.knB = 1.1; P.shF = 1.4; P.elF = 0.9; P.shB = -0.4; P.elB = 0.8; P.crouch = 0; break;
      case 'block': P.shF = 0.9; P.elF = 2.3; P.shB = 0.7; P.elB = 2.4; P.crouch = 7; P.fF = 16; P.fB = -16; P.expr = 'grit'; break;
      case 'charge': P.crouch = 11; P.shF = -0.35; P.elF = 0.5; P.shB = -0.5; P.elB = 0.5; P.fF = 22; P.fB = -22; P.bob = Math.sin(T * 0.7); P.expr = 'shout'; break;
      case 'hurt': P.lean = -0.25; P.shF = -0.5; P.elF = 0.7; P.shB = -0.8; P.elB = 0.6; P.expr = 'hurt'; P.tilt = -0.25; break;
      case 'ko': P.shF = 2.4; P.elF = 0.3; P.shB = 2.6; P.elB = 0.2; P.expr = 'ko'; P.legs = 'fk'; P.thF = 0.15; P.knF = 0.2; P.thB = -0.1; P.knB = 0.1; P.crouch = 0; break;
      case 'ult': P.shF = 2.85; P.elF = 0.2; P.shB = 2.6; P.elB = 0.3; P.fF = 20; P.fB = -20; P.crouch = 6; P.expr = 'shout'; P.tilt = -0.12; break;
      case 'beam': P.shF = 1.52; P.elF = 0.08; P.shB = 1.42; P.elB = 0.15; P.fF = 24; P.fB = -22; P.crouch = 10; P.lean = 0.06; P.expr = 'shout'; break;
      case 'win': P.shF = 2.95 + Math.sin(T * 0.2) * 0.08; P.elF = 0.1; P.shB = 0.15; P.elB = 1.3; P.expr = 'smirk'; P.crouch = 1; break;
      case 'attack': {
        const m = f.move, ph = f.t < m.start ? 0 : f.t < m.start + m.active + 3 ? 1 : 2;
        P.expr = ph === 1 ? 'shout' : 'grit';
        if (f.air) { P.legs = 'fk'; P.thF = [0.9, 1.45, 1.1][ph]; P.knF = [1.4, 0.15, 0.8][ph]; P.thB = 0.3; P.knB = 1.1; P.shF = 0.3; P.elF = 1.4; }
        else if (f.step === 2) { P.legs = 'fkF'; P.thF = [0.8, 1.55, 1.1][ph]; P.knF = [1.6, 0.1, 0.9][ph]; P.lean = -0.15; P.shF = 0.4; P.elF = 1.5; P.shB = -0.3; P.elB = 1.0; P.fB = -6; }
        else if (f.step === 0) { P.shF = [0.2, 1.55, 1.1][ph]; P.elF = [2.0, 0.05, 0.9][ph]; P.lean = ph === 1 ? 0.12 : 0; P.fF = 18; P.fB = -14; }
        else { P.shB = [0.1, 1.5, 1.0][ph]; P.elB = [2.0, 0.05, 0.9][ph]; P.shF = 0.3; P.elF = 1.9; P.lean = ph === 1 ? 0.18 : 0; P.fF = 20; P.fB = -10; }
        break;
      }
      case 'special': {
        const k = f.def.special.kind; P.expr = 'shout';
        if (k === 'rush') { P.shF = 1.45; P.elF = 0.08; P.lean = f.t >= 10 ? 0.35 : 0; P.shB = -0.7; P.elB = 0.6; P.fF = 22; P.fB = -22; }
        else if (k === 'wave') { const s = Math.min(1, f.t / 10); P.shF = 2.8 - s * 1.9; P.elF = 0.25; P.shB = P.shF - 0.2; P.elB = 0.4; P.lean = 0.12 * s; P.fF = 20; P.fB = -18; }
        else if (k === 'barrage') { const a = Math.floor(f.t / 3) % 2; P.shF = a ? 1.52 : 0.6; P.elF = a ? 0.05 : 1.5; P.shB = a ? 0.6 : 1.5; P.elB = a ? 1.5 : 0.05; P.crouch = 6; P.fF = 20; P.fB = -18; }
        else if (k === 'teleport') { P.shF = f.t > 14 ? 1.55 : 0.2; P.elF = f.t > 14 ? 0.05 : 1.8; P.lean = 0.2; P.fF = 20; P.fB = -18; }
        else { P.shF = 1.57; P.elF = 0; P.extF = f.armLen; P.shB = -0.4; P.elB = 0.7; P.lean = -0.06; P.fF = 20; P.fB = -18; }
        break;
      }
    }
    if (air && P.legs === 'ik') { P.legs = 'fk'; P.thF = 0.7; P.knF = 1.2; P.thB = 0.2; P.knB = 0.9; }
    return P;
  }

  function ik(hx, hy, fx, fy, l1, l2) {
    let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy);
    const max = l1 + l2 - 0.01;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; fx = hx + dx; fy = hy + dy; }
    const a = Math.atan2(dy, dx), A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const ang = a - A;
    return [hx + Math.cos(ang) * l1, hy + Math.sin(ang) * l1, fx, fy];
  }
  const fk = (x, y, a, l) => [x + Math.sin(a) * l, y + Math.cos(a) * l];

  function hasSword(d) { return d.look.extra === 'sword' || d.look.extra === 'swords3'; }

  function drawAura(f, col, k, T) {
    const cx = f.x, cy = f.y - 62;
    g.save(); g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(cx, cy, 8, cx, cy, 105 * k);
    gr.addColorStop(0, hexA(col, 0.42)); gr.addColorStop(0.55, hexA(col, 0.14)); gr.addColorStop(1, hexA(col, 0));
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, 68 * k, 104 * k, 0, 0, TAU); g.fill();
    for (let layer = 0; layer < 2; layer++) {
      g.fillStyle = layer ? 'rgba(255,255,255,.10)' : hexA(col, 0.17);
      const n = layer ? 5 : 8, spread = layer ? 7 : 10, h = layer ? 100 : 140;
      for (let i = 0; i < n; i++) {
        const fl = Math.sin(T * 0.35 + i * 2.1 + layer), bx = cx + (i - (n - 1) / 2) * spread;
        g.beginPath(); g.moveTo(bx - 13, f.y + 2);
        g.bezierCurveTo(bx - 20, cy + 10, bx - 6 + fl * 6, cy - 40, bx + fl * 10, f.y - h * k - fl * 16);
        g.bezierCurveTo(bx + 6 + fl * 6, cy - 40, bx + 20, cy + 10, bx + 13, f.y + 2); g.fill();
      }
    }
    if (f.corrupted) {
      g.strokeStyle = 'rgba(160,100,255,.5)'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(cx, cy, 42 + i * 12, 16 + i * 4, T * 0.03 + i, 0, TAU); g.stroke(); }
    }
    g.restore();
  }

  function drawFx(kind, x, y, f, T) {
    g.save(); g.globalCompositeOperation = 'lighter';
    if (kind === 'sphere') {
      const r = 12 + Math.sin(T * 0.5) * 1.5;
      const gr = g.createRadialGradient(x + 4, y, 1, x + 4, y, r * 2.2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(120,210,255,.9)'); gr.addColorStop(1, 'rgba(60,140,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x + 4, y, r * 2.2, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(220,245,255,.85)'; g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x + 4, y, r, r * 0.35, T * 0.45 + i * 1.05, 0, TAU); g.stroke(); }
    } else if (kind === 'lightning' || kind === 'fist') {
      const col = kind === 'fist' ? [255, 60, 90] : [160, 140, 255];
      const gr = g.createRadialGradient(x + 4, y, 1, x + 4, y, 30);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, `rgba(${col},.6)`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x + 4, y, 30, 0, TAU); g.fill();
      g.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) {
        g.strokeStyle = i % 2 ? '#ffffff' : kind === 'fist' ? '#ff4a6a' : '#c2b4ff';
        let px = x + 4, py = y; g.beginPath(); g.moveTo(px, py);
        for (let k = 0; k < 4; k++) { px += (Math.random() - 0.35) * 18; py += (Math.random() - 0.5) * 18; g.lineTo(px, py); }
        g.stroke();
      }
    } else if (kind === 'slash') {
      g.strokeStyle = 'rgba(200,255,210,.8)'; g.lineWidth = 3;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x - 10, y, 30 + i * 8, -1.2 + i * 0.2, 0.9 - i * 0.2); g.stroke(); }
    }
    g.restore();
  }

  function drawSword(x, y, ang, f, pass, len = 72) {
    const ux = Math.sin(ang), uy = Math.cos(ang), nx = Math.cos(ang), ny = -Math.sin(ang);
    const bx = x + ux * 5, by = y + uy * 5, tx = x + ux * len, ty = y + uy * len;
    const px = x - ux * 12, py = y - uy * 12;
    if (pass === 0) {
      g.strokeStyle = OUT; g.lineCap = 'round'; g.lineWidth = 9;
      g.beginPath(); g.moveTo(px, py); g.lineTo(tx, ty); g.stroke();
      return;
    }
    const awk = f.awakened;
    // handle with wrap
    g.lineCap = 'butt'; g.strokeStyle = '#2b1f3a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
    g.fillStyle = '#e8dcc0';
    for (let i = 1; i < 4; i++) { const k = i / 4; g.beginPath(); g.arc(lerp(px, x, k), lerp(py, y, k), 1.1, 0, TAU); g.fill(); }
    // blade
    const w = 2.8, back = len - 12;
    g.beginPath();
    g.moveTo(bx + nx * w, by + ny * w);
    g.lineTo(x + ux * back + nx * w * 0.8, y + uy * back + ny * w * 0.8);
    g.lineTo(tx, ty);
    g.lineTo(x + ux * back - nx * w, y + uy * back - ny * w);
    g.lineTo(bx - nx * w, by - ny * w);
    g.closePath();
    const gr = g.createLinearGradient(bx + nx * w, by + ny * w, bx - nx * w, by - ny * w);
    if (awk) { gr.addColorStop(0, f.def.colors.awaken); gr.addColorStop(0.35, '#1a0e16'); gr.addColorStop(1, '#050307'); }
    else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#dfe6f4'); gr.addColorStop(1, '#8792ab'); }
    g.fillStyle = gr; g.fill();
    g.strokeStyle = awk ? hexA(f.def.colors.awaken, 0.8) : 'rgba(255,255,255,.55)'; g.lineWidth = 0.8;
    g.beginPath();
    for (let i = 0; i <= 8; i++) { const k = 0.12 + i * 0.09, wv = Math.sin(i * 1.7) * 0.8; const qx = x + ux * len * k + nx * wv, qy = y + uy * len * k + ny * wv; i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }
    g.stroke();
    // guard
    g.fillStyle = '#c9a24a'; g.beginPath(); g.ellipse(bx - ux * 3, by - uy * 3, 2, 5.5, -ang, 0, TAU); g.fill();
    g.lineCap = 'round';
  }

  function faceDetails(f, d, hx, hy, P, T, flash) {
    const c = d.colors, mark = f.awakened ? d.mark : 'none', L = d.look;
    const corrupt = f.corrupted && !f.awakened;
    const iris = corrupt ? '#b27bff' : f.awakened && LIGHT_EYES.has(d.mark) ? c.awaken : (d.eye || EYE[d.id] || '#4a3526');
    const skinDark = shade(c.skin, -0.32);
    const ex = hx + 6.5, ey = hy - 1.5;
    if (flash) return;
    if (mark === 'sage') { g.fillStyle = hexA('#ff7a1a', 0.85); g.beginPath(); g.ellipse(ex + 0.5, ey + 0.5, 6.5, 5.5, 0, 0, TAU); g.fill(); }
    // blush / cheek shading
    g.fillStyle = hexA(skinDark, 0.35); g.beginPath(); g.ellipse(hx + 7, hy + 5, 4, 2.2, 0, 0, TAU); g.fill();
    const blind = L.extra === 'blindfold' && !f.awakened;
    const closed = P.expr === 'ko' || mark === 'sleep' || (P.expr === 'neutral' && T % 200 < 5);
    if (blind) {
      g.fillStyle = '#101018'; g.beginPath(); g.moveTo(hx - 13, hy - 8); g.lineTo(hx + 14, hy - 7); g.lineTo(hx + 14, hy + 1); g.lineTo(hx - 13, hy + 0); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx - 12, hy - 6); g.lineTo(hx + 13, hy - 5); g.stroke();
    } else if (closed) {
      g.strokeStyle = OUT; g.lineWidth = 1.6; g.beginPath(); g.moveTo(ex - 3.5, ey); g.quadraticCurveTo(ex + 0.5, ey + 2.5, ex + 4, ey - 0.5); g.stroke();
    } else {
      const narrow = P.expr === 'hurt' ? 0.55 : P.expr === 'grit' ? 0.8 : 1;
      g.fillStyle = '#fbfbff';
      g.beginPath(); g.moveTo(ex - 3.3, ey - 2.8 * narrow); g.quadraticCurveTo(ex + 1, ey - 4.6 * narrow, ex + 3.8, ey - 2.6 * narrow); g.lineTo(ex + 3.3, ey + 3.2 * narrow); g.quadraticCurveTo(ex, ey + 4.4 * narrow, ex - 3, ey + 2.8 * narrow); g.closePath(); g.fill();
      const ig = g.createLinearGradient(0, ey - 4, 0, ey + 4);
      ig.addColorStop(0, shade(iris, -0.45)); ig.addColorStop(1, shade(iris, 0.3));
      g.fillStyle = ig; g.beginPath(); g.ellipse(ex + 1.1, ey + 0.3, 2.4, 3.7 * narrow, 0, 0, TAU); g.fill();
      g.fillStyle = OUT; g.beginPath(); g.ellipse(ex + 1.3, ey + 0.5, 1.05, 1.9 * narrow, 0, 0, TAU); g.fill();
      if (d.mark === 'eye' && f.awakened) { g.strokeStyle = OUT; g.lineWidth = 0.7; g.beginPath(); g.arc(ex + 1.1, ey + 0.3, 1.8, 0, TAU); g.stroke(); }
      if (!corrupt) { dot(ex + 0.1, ey - 1.5, 1, '#ffffff'); dot(ex + 2, ey + 1.8, 0.5, 'rgba(255,255,255,.8)'); }
      g.strokeStyle = OUT; g.lineWidth = 2.1; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - 3.8, ey - 2.4 * narrow); g.quadraticCurveTo(ex + 0.5, ey - 5.4 * narrow, ex + 4.6, ey - 3 * narrow); g.stroke();
      if ((f.awakened && LIGHT_EYES.has(d.mark)) || corrupt || (L.extra === 'blindfold' && f.awakened)) {
        g.save(); g.globalCompositeOperation = 'lighter';
        dot(ex + 1, ey, 6.5, hexA(iris, 0.4));
        if (Math.abs(f.vx) > 1) { g.strokeStyle = hexA(iris, 0.7); g.lineWidth = 2; g.beginPath(); g.moveTo(ex + 2, ey); g.lineTo(ex - 22, ey - 2); g.stroke(); }
        g.restore();
      }
    }
    // brow
    const angry = P.expr === 'shout' || P.expr === 'grit' || ['ren', 'vex', 'kenji', 'null'].includes(d.id);
    const sad = P.expr === 'hurt';
    g.strokeStyle = shade(c.hair, -0.35); g.lineWidth = 1.9;
    const by = ey - 6.5;
    g.beginPath(); g.moveTo(ex - 3.4, by + (angry ? -1.6 : sad ? 1 : 0)); g.lineTo(ex + 4.2, by + (angry ? 1.4 : sad ? -1.2 : -0.4)); g.stroke();
    // nose
    g.strokeStyle = skinDark; g.lineWidth = 1; g.beginPath(); g.moveTo(hx + 12.6, hy + 0.5); g.lineTo(hx + 13.8, hy + 3.8); g.lineTo(hx + 12.2, hy + 4.3); g.stroke();
    // mouth
    const mx = hx + 9.2, my = hy + 8.6;
    g.lineWidth = 1.3; g.strokeStyle = OUT;
    if (P.expr === 'shout') { g.fillStyle = '#3a1418'; g.beginPath(); g.moveTo(mx - 3, my - 1.2); g.quadraticCurveTo(mx + 1, my - 2, mx + 3.4, my - 1); g.quadraticCurveTo(mx + 2, my + 3.6, mx - 1.5, my + 2.4); g.closePath(); g.fill(); g.fillStyle = '#ffffff'; g.fillRect(mx - 2.4, my - 1.4, 5, 1); }
    else if (P.expr === 'grit') { g.fillStyle = '#ffffff'; g.fillRect(mx - 2.6, my - 1, 5.4, 2.2); g.strokeRect(mx - 2.6, my - 1, 5.4, 2.2); g.beginPath(); g.moveTo(mx - 2.6, my + 0.1); g.lineTo(mx + 2.8, my + 0.1); g.stroke(); }
    else if (P.expr === 'hurt') { g.beginPath(); g.moveTo(mx - 3, my); g.lineTo(mx - 1, my - 1); g.lineTo(mx + 1, my + 0.6); g.lineTo(mx + 3, my - 0.6); g.stroke(); }
    else if (P.expr === 'smirk') { g.beginPath(); g.moveTo(mx - 2.6, my); g.quadraticCurveTo(mx + 0.5, my + 1.2, mx + 3.2, my - 1.8); g.stroke(); }
    else if (P.expr === 'ko') { g.beginPath(); g.ellipse(mx, my, 1.4, 1, 0, 0, TAU); g.stroke(); }
    else { g.beginPath(); g.moveTo(mx - 2, my + 0.3); g.lineTo(mx + 2.4, my); g.stroke(); }
    // marks
    if (mark === 'marks') { g.fillStyle = '#1a0c10'; g.fillRect(ex - 2, ey + 4.5, 7, 1.4); g.fillRect(ex - 2, ey - 8.5, 7, 1.4); g.fillRect(hx - 3, hy + 3, 1.4, 5); }
    if (mark === 'scar') { g.strokeStyle = '#7a1f1f'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(ex - 1, ey - 8); g.lineTo(ex + 3, ey + 6); g.stroke(); }
    if (mark === 'flame') { g.fillStyle = '#c8202a'; g.beginPath(); g.moveTo(ex - 2, ey - 6); g.quadraticCurveTo(ex + 5, ey - 12, ex + 2, ey - 17); g.quadraticCurveTo(ex, ey - 11, ex - 2, ey - 6); g.fill(); }
    if (mark === 'void') { g.strokeStyle = '#e04bff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(hx + 2, hy - 9); g.lineTo(hx + 5, hy - 3); g.lineTo(hx + 2, hy + 3); g.lineTo(hx + 5, hy + 9); g.stroke(); }
    if (mark === 'frost') { g.strokeStyle = 'rgba(210,245,255,.95)'; g.lineWidth = 1; for (let i = 0; i < 3; i++) { const a = i * 1.05; g.beginPath(); g.moveTo(hx + 3 - Math.cos(a) * 3, hy + 6 - Math.sin(a) * 3); g.lineTo(hx + 3 + Math.cos(a) * 3, hy + 6 + Math.sin(a) * 3); g.stroke(); } }
    if (mark === 'mask') {
      g.fillStyle = '#f4f1ea'; g.beginPath(); g.moveTo(hx + 1, hy - 13); g.quadraticCurveTo(hx + 15, hy - 10, hx + 14, hy + 3); g.quadraticCurveTo(hx + 13, hy + 13, hx + 5, hy + 13); g.quadraticCurveTo(hx + 1, hy + 2, hx + 1, hy - 13); g.fill();
      g.strokeStyle = '#d0142c'; g.lineWidth = 2; g.beginPath(); g.moveTo(hx + 4, hy - 11); g.lineTo(hx + 7, hy + 11); g.stroke(); g.beginPath(); g.moveTo(hx + 9, hy - 10); g.lineTo(hx + 12, hy + 7); g.stroke();
      g.fillStyle = OUT; g.beginPath(); g.ellipse(ex + 0.5, ey, 3, 2.4, 0, 0, TAU); g.fill(); dot(ex + 1, ey, 1.3, '#ffe066');
      g.fillStyle = OUT; for (let i = 0; i < 4; i++) g.fillRect(hx + 6 + i * 1.8, hy + 9, 1, 2.5);
    }
  }

  /**
   * Draw one fighter. opts: { groundY, noShadow, noAura, alpha, rim }
   */
  function drawFighter(f, T, opts = {}) {
    const d = f.def, L = d.look, c = d.colors;
    const flash = f.flash > 0;
    const hairCol = f.awakened && d.awakenHair ? d.awakenHair : c.hair;
    const gy = opts.groundY != null ? opts.groundY : GROUND;
    const air = f.y < gy - 1;
    const P = pose(f, T, air);
    const S = 1.12 * (d.scale || 1);
    const rim = f.awakened ? c.awaken : f.corrupted ? '#a878ff' : (opts.rim || STAGE_RIM[SL.game && SL.game.stage] || '#9fb4ff');
    g.save();
    if (!opts.noShadow) {
      const h = Math.max(0, gy - f.y);
      const gr = g.createRadialGradient(f.x, gy + 3, 2, f.x, gy + 3, 40);
      gr.addColorStop(0, `rgba(0,0,0,${0.5 - Math.min(0.3, h / 400)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(f.x, gy + 3, Math.max(14, 38 - h * 0.08), 8, 0, 0, TAU); g.fill();
    }
    const focus = SL.game && SL.game.cine && SL.game.cine.f === f;
    if (!opts.noAura && (f.awakened || f.state === 'charge' || focus || f.corrupted)) {
      const col = f.corrupted && !f.awakened ? '#8a5cff' : f.awakened ? c.awaken : c.aura;
      drawAura(f, col, (f.state === 'charge' || focus) ? 1.35 : f.corrupted && !f.awakened ? 0.8 : 1, T);
    }
    g.translate(f.x, f.y); g.scale(f.facing * S, S);
    if (f.state === 'ko') g.rotate(-Math.min(1, f.t / 16) * 1.45);
    if (f.state === 'special' && d.special.kind === 'teleport' && f.t >= 6 && f.t < 14) g.globalAlpha = 0.15;
    if (f.invuln > 0 && f.invuln % 6 < 3) g.globalAlpha *= 0.6;
    if (opts.alpha != null) g.globalAlpha = opts.alpha;

    // ----- rig -----
    const hipY = -52 + P.crouch + P.bob;
    const TH = 27, SH = 27, UA = 19, FA = 18;
    const leg = (front) => {
      const hx = front ? 4 : -4;
      const mode = P.legs === 'fkF' ? (front ? 'fk' : 'ik') : P.legs;
      if (mode === 'ik') return ik(hx, hipY, front ? P.fF : P.fB, -(front ? P.lF : P.lB), TH, SH);
      const th = front ? P.thF : P.thB, kn = front ? P.knF : P.knB;
      const [kx, ky] = fk(hx, hipY, th, TH); const [fx, fy] = fk(kx, ky, th - kn, SH);
      return [kx, ky, fx, fy];
    };
    const legF = leg(true), legB = leg(false);
    const cl = Math.cos(P.lean), sl = Math.sin(P.lean);
    const body = (x, y) => [x * cl - y * sl, hipY + x * sl + y * cl]; // body frame (hip origin) -> local
    const arm = (front) => {
      const [sx, sy] = body(front ? 3 : -5, front ? -36 : -35);
      const sh = (front ? P.shF : P.shB) - P.lean, el = front ? P.elF : P.elB;
      const [ex, ey] = fk(sx, sy, sh, UA); const [hx, hy] = fk(ex, ey, sh + el, FA + (front ? P.extF : 0));
      return { sx, sy, ex, ey, hx, hy, fa: sh + el };
    };
    const armF = arm(true), armB = arm(false);
    const [neckX, neckY] = body(1, -40);
    const [hcx, hcy] = body(3, -57);

    const bare = L.outfit === 'vest' || L.outfit === 'gi';
    const sleeve = bare ? c.skin : c.top;
    const gloves = L.outfit === 'suit' ? c.accent : c.skin;
    const shoe = L.outfit === 'suit' ? c.accent : '#26212c';

    for (let pass = 0; pass < 2; pass++) {
      const P0 = pass === 0;
      const col = x => (flash ? '#ffffff' : x);
      const fillPart = (build, base, grad) => {
        build();
        if (P0) { g.fillStyle = OUT; g.fill(); g.lineJoin = 'round'; g.lineWidth = 3.2; g.strokeStyle = OUT; g.stroke(); return; }
        g.fillStyle = flash ? '#ffffff' : grad ? grad() : base; g.fill();
      };
      const limb = (ax, ay, bx, by, w1, w2, base, dim = 0) => {
        const th = Math.atan2(by - ay, bx - ax), nx = -Math.sin(th), ny = Math.cos(th);
        const build = () => {
          g.beginPath();
          g.moveTo(ax + nx * w1 / 2, ay + ny * w1 / 2); g.lineTo(bx + nx * w2 / 2, by + ny * w2 / 2);
          g.arc(bx, by, w2 / 2, th + Math.PI / 2, th - Math.PI / 2, true);
          g.lineTo(ax - nx * w1 / 2, ay - ny * w1 / 2);
          g.arc(ax, ay, w1 / 2, th - Math.PI / 2, th + Math.PI / 2, true);
          g.closePath();
        };
        const litSide = (nx * 0.5 - ny * 0.85) > 0 ? 1 : -1;
        const b = dim ? shade(base, dim) : base;
        fillPart(build, b, () => {
          const mx = (ax + bx) / 2, my = (ay + by) / 2, w = (w1 + w2) / 4;
          const gr = g.createLinearGradient(mx + nx * w * litSide, my + ny * w * litSide, mx - nx * w * litSide, my - ny * w * litSide);
          gr.addColorStop(0, shade(b, 0.22)); gr.addColorStop(0.42, b); gr.addColorStop(1, shade(b, -0.34));
          return gr;
        });
        if (!P0 && !flash) {
          g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = hexA(rim, dim ? 0.18 : 0.45); g.lineWidth = 1.3;
          const s = -litSide;
          g.beginPath(); g.moveTo(ax + nx * w1 / 2 * s * 0.9, ay + ny * w1 / 2 * s * 0.9); g.lineTo(bx + nx * w2 / 2 * s * 0.9, by + ny * w2 / 2 * s * 0.9); g.stroke();
          g.restore();
        }
      };
      const fist = (x, y, r, base, ang) => {
        fillPart(() => { g.beginPath(); g.ellipse(x, y, r * 1.05, r, ang, 0, TAU); }, base, () => {
          const gr = g.createRadialGradient(x + 1.5, y - 2, 0.5, x, y, r * 1.3); gr.addColorStop(0, shade(base, 0.25)); gr.addColorStop(1, shade(base, -0.3)); return gr;
        });
        if (!P0 && !flash) { g.strokeStyle = hexA(OUT, 0.5); g.lineWidth = 0.8; g.beginPath(); g.arc(x, y, r * 0.55, ang - 0.6, ang + 0.6); g.stroke(); }
      };
      const foot = (kx, ky, fx, fy, dim) => {
        let dx = fy - ky, dy = -(fx - kx); const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
        if (!air && P.legs !== 'fk') { dx = 1; dy = 0; }
        const ang = Math.atan2(dy, dx), b = dim ? shade(shoe, dim) : shoe;
        fillPart(() => {
          g.save(); g.translate(fx, fy); g.rotate(ang);
          g.beginPath(); g.moveTo(-5, -5); g.quadraticCurveTo(2, -7, 9, -3); g.quadraticCurveTo(13, -1, 12, 2); g.lineTo(-6, 2); g.closePath();
          g.restore();
        }, b);
        if (!P0 && !flash) { g.save(); g.translate(fx, fy); g.rotate(ang); g.fillStyle = shade(b, 0.35); g.fillRect(-6, 0.6, 18, 1.6); g.restore(); }
      };

      // back arm
      limb(armB.sx, armB.sy, armB.ex, armB.ey, 9.5, 8, sleeve, -0.28);
      limb(armB.ex, armB.ey, armB.hx, armB.hy, 8, 7, bare ? c.skin : sleeve, -0.28);
      fist(armB.hx, armB.hy, 5.4, shade(gloves, -0.25), armB.fa);

      // coat tails and long hair behind body
      if (L.outfit === 'haori' || L.outfit === 'robe') {
        const sway = Math.sin(T * 0.12) * 3 - clamp(f.vx, -6, 6) * 1.2;
        const [ax, ay] = body(-14, -34), [bx, by] = body(-17 + sway, 18), [cx2, cy2] = body(10 + sway * 0.4, 20);
        const tail = L.outfit === 'haori' ? c.top : shade(c.top, -0.1);
        fillPart(() => { g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(bx - 4, (ay + by) / 2, bx, by); g.lineTo(cx2, cy2); g.lineTo(8, hipY - 4); g.closePath(); }, shade(tail, -0.2));
        if (!P0 && !flash && L.outfit === 'haori' && L.pattern && L.pattern !== 'none') {
          g.save(); g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(bx - 4, (ay + by) / 2, bx, by); g.lineTo(cx2, cy2); g.lineTo(8, hipY - 4); g.closePath(); g.clip();
          g.fillStyle = shade(c.accent, -0.2);
          for (let y = hipY - 44; y < 24; y += 6) for (let x = -24; x < 16; x += 6) if (L.pattern === 'checker' ? ((x + y) / 6) % 2 === 0 : (x / 6 + y / 6) % 3 === 0) g.fillRect(x, y, 6, 6);
          g.restore();
        }
      }

      // legs
      limb(-4, hipY, legB[0], legB[1], 13, 10.5, c.legs, -0.25);
      limb(legB[0], legB[1], legB[2], legB[3], 10.5, 8, c.legs, -0.25);
      foot(legB[0], legB[1], legB[2], legB[3], -0.2);
      limb(4, hipY, legF[0], legF[1], 13.5, 11, c.legs);
      limb(legF[0], legF[1], legF[2], legF[3], 11, 8.5, c.legs);
      foot(legF[0], legF[1], legF[2], legF[3], 0);
      // pelvis
      fillPart(() => { g.beginPath(); g.ellipse(0, hipY, 13.5, 8, P.lean, 0, TAU); }, c.legs);

      // torso (body frame)
      g.save(); g.translate(0, hipY); g.rotate(P.lean);
      if (L.extra === 'hood') fillPart(() => { g.beginPath(); g.ellipse(-7, -41, 14, 8, -0.3, 0, TAU); }, shade(c.accent, -0.1));
      const torso = () => {
        g.beginPath();
        g.moveTo(-12, 3);
        g.quadraticCurveTo(-14, -12, -13, -21);
        g.quadraticCurveTo(-18, -29, -16, -36);
        g.quadraticCurveTo(-8, -43, 4, -42);
        g.quadraticCurveTo(15, -41, 16, -34);
        g.quadraticCurveTo(15, -24, 11, -18);
        g.quadraticCurveTo(9, -8, 12, 3);
        g.closePath();
      };
      fillPart(torso, c.top, () => { const gr = g.createLinearGradient(16, -40, -16, 0); gr.addColorStop(0, shade(c.top, 0.2)); gr.addColorStop(0.45, c.top); gr.addColorStop(1, shade(c.top, -0.38)); return gr; });
      if (!P0 && !flash) {
        const A = c.accent;
        g.save(); torso(); g.clip();
        switch (L.outfit) {
          case 'vest': {
            const sg = g.createLinearGradient(12, -40, -2, 0); sg.addColorStop(0, shade(c.skin, 0.15)); sg.addColorStop(1, shade(c.skin, -0.2));
            g.fillStyle = sg; g.beginPath(); g.moveTo(-1, 3); g.lineTo(8, 3); g.lineTo(13, -38); g.lineTo(0, -40); g.closePath(); g.fill();
            g.strokeStyle = shade(c.skin, -0.3); g.lineWidth = 0.9; g.beginPath(); g.moveTo(4, -30); g.quadraticCurveTo(9, -27, 12, -30); g.moveTo(5, -14); g.lineTo(8, -14); g.stroke();
            g.fillStyle = A; g.fillRect(-14, -7, 30, 5); break;
          }
          case 'robe':
            g.fillStyle = shade(A, -0.05); g.beginPath(); g.moveTo(-5, -42); g.lineTo(4, -22); g.lineTo(13, -41); g.lineTo(9, -42); g.lineTo(4, -28); g.lineTo(-1, -42); g.closePath(); g.fill();
            g.fillStyle = A; g.fillRect(-14, -7, 30, 4.5);
            g.strokeStyle = hexA(OUT, 0.35); g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -24); g.quadraticCurveTo(-2, -14, -6, -4); g.moveTo(8, -18); g.quadraticCurveTo(6, -10, 9, -4); g.stroke();
            break;
          case 'jacket':
            g.fillStyle = A; g.beginPath(); g.moveTo(-17, -36); g.quadraticCurveTo(0, -45, 17, -36); g.lineTo(15, -27); g.lineTo(-15, -27); g.closePath(); g.fill();
            g.fillStyle = shade(c.top, -0.35); g.fillRect(-14, -3, 28, 5);
            g.strokeStyle = shade(c.top, -0.4); g.lineWidth = 1.6; g.beginPath(); g.moveTo(6, -27); g.lineTo(5, 3); g.stroke();
            g.fillStyle = '#d9dde6'; g.fillRect(4, -26, 3, 3);
            g.strokeStyle = hexA(OUT, 0.3); g.lineWidth = 1; g.beginPath(); g.moveTo(-8, -20); g.quadraticCurveTo(-4, -12, -9, -5); g.stroke();
            break;
          case 'gi':
            g.fillStyle = A; g.beginPath(); g.moveTo(-3, -43); g.lineTo(5, -24); g.lineTo(14, -41); g.closePath(); g.fill();
            g.fillStyle = shade(A, -0.1); g.fillRect(-14, -8, 30, 5.5); g.fillRect(6, -6, 4, 10);
            g.strokeStyle = hexA(OUT, 0.35); g.lineWidth = 1; g.beginPath(); g.moveTo(-8, -26); g.quadraticCurveTo(-3, -18, -8, -10); g.moveTo(10, -20); g.quadraticCurveTo(8, -14, 10, -9); g.stroke();
            break;
          case 'suit': {
            const ag = g.createLinearGradient(14, -44, -12, -14); ag.addColorStop(0, '#ffffff'); ag.addColorStop(1, shade(A, -0.25));
            g.fillStyle = ag; g.beginPath(); g.moveTo(-15, -37); g.quadraticCurveTo(0, -46, 17, -37); g.lineTo(13, -17); g.quadraticCurveTo(0, -11, -13, -17); g.closePath(); g.fill();
            g.fillStyle = '#d8b24a'; g.fillRect(-14, -5, 30, 3.5);
            g.strokeStyle = hexA(OUT, 0.4); g.lineWidth = 1; g.beginPath(); g.moveTo(1, -40); g.lineTo(1, -15); g.stroke();
            break;
          }
          case 'uniform':
            g.fillStyle = shade(c.top, -0.2); g.fillRect(-16, -44, 34, 6);
            g.fillStyle = '#e1b64a'; [-31, -22, -13, -4].forEach(y => { g.beginPath(); g.arc(7, y, 1.7, 0, TAU); g.fill(); });
            g.strokeStyle = hexA(OUT, 0.4); g.lineWidth = 1; g.beginPath(); g.moveTo(6, -38); g.lineTo(6, 3); g.stroke();
            break;
          case 'haori':
            if (L.pattern === 'checker' || L.pattern === 'triangles') {
              g.fillStyle = A;
              if (L.pattern === 'checker') { for (let y = -46; y < 4; y += 6) for (let x = -18; x < 18; x += 6) if (((x + y) / 6) % 2 === 0) g.fillRect(x, y, 6, 6); }
              else { for (let y = -44; y < 4; y += 9) for (let x = -18; x < 18; x += 9) { g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + 4.5, y); g.lineTo(x + 9, y + 8); g.closePath(); g.fill(); } }
            }
            g.fillStyle = '#15151c'; g.beginPath(); g.moveTo(-1, -42); g.lineTo(6, -42); g.lineTo(7, 3); g.lineTo(0, 3); g.closePath(); g.fill();
            g.fillStyle = '#e9e4d6'; g.fillRect(-14, -7, 30, 3.5);
            break;
        }
        // shading overlay: under-chest shadow and back-side core shadow
        g.fillStyle = 'rgba(0,0,0,.14)'; g.beginPath(); g.ellipse(-12, -18, 8, 28, 0, 0, TAU); g.fill();
        g.restore();
        g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = hexA(rim, 0.5); g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(-12, 1); g.quadraticCurveTo(-14, -12, -13, -21); g.quadraticCurveTo(-18, -29, -16, -36); g.stroke(); g.restore();
      }
      g.restore();

      // neck + head
      limb(neckX, neckY, neckX + 1, neckY - 6, 7, 7, c.skin, -0.12);
      g.save(); g.translate(hcx, hcy); g.rotate(P.lean + P.tilt);
      const hx = 0, hy = 0;
      const headPath = () => {
        g.beginPath();
        g.moveTo(hx - 12, hy + 3);
        g.bezierCurveTo(hx - 15, hy - 12, hx - 2, hy - 18, hx + 7, hy - 14);
        g.bezierCurveTo(hx + 14, hy - 10, hx + 14, hy - 2, hx + 13.5, hy + 3);
        g.quadraticCurveTo(hx + 12.5, hy + 9, hx + 8, hy + 12.5);
        g.quadraticCurveTo(hx + 3, hy + 14, hx - 2, hy + 10);
        g.quadraticCurveTo(hx - 9, hy + 9, hx - 12, hy + 3);
        g.closePath();
      };
      fillPart(headPath, c.skin, () => { const gr = g.createRadialGradient(hx + 6, hy - 5, 2, hx, hy, 18); gr.addColorStop(0, shade(c.skin, 0.16)); gr.addColorStop(0.6, c.skin); gr.addColorStop(1, shade(c.skin, -0.28)); return gr; });
      // ear
      fillPart(() => { g.beginPath(); g.ellipse(hx - 2, hy + 2, 3, 4, 0.2, 0, TAU); }, shade(c.skin, -0.12));
      if (!P0) faceDetails(f, d, hx, hy, P, T, flash);
      // hair
      const hp = HAIR[L.hair] || HAIR.spiky;
      fillPart(() => poly(hp, hx, hy), hairCol, () => { const gr = g.createLinearGradient(0, hy - 30, 0, hy + 10); gr.addColorStop(0, shade(hairCol, 0.22)); gr.addColorStop(0.5, hairCol); gr.addColorStop(1, shade(hairCol, -0.35)); return gr; });
      if (!P0 && !flash) {
        g.save(); poly(hp, hx, hy); g.clip();
        g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2.6; g.beginPath(); g.arc(hx - 1, hy + 3, 15, -2.5, -0.7); g.stroke();
        g.strokeStyle = shade(hairCol, -0.4); g.lineWidth = 0.9;
        for (let i = 1; i < hp.length - 1; i += 2) { const [px, py] = hp[i]; if (py > -6) continue; g.beginPath(); g.moveTo(hx - 1, hy - 6); g.quadraticCurveTo(hx + px * 0.5, hy + py * 0.4, hx + px * 0.85, hy + py * 0.85); g.stroke(); }
        if (f.awakened && d.awakenHair) { g.globalCompositeOperation = 'lighter'; g.fillStyle = hexA(d.awakenHair, 0.25 + 0.15 * Math.sin(T * 0.3)); g.fillRect(hx - 40, hy - 60, 80, 80); }
        g.restore();
      }
      if (L.hair === 'crown') fillPart(() => { g.beginPath(); g.moveTo(hx - 12, hy - 12); g.lineTo(hx - 10, hy - 31); g.lineTo(hx - 4, hy - 17); g.lineTo(hx + 1, hy - 38); g.lineTo(hx + 6, hy - 17); g.lineTo(hx + 12, hy - 31); g.lineTo(hx + 13, hy - 12); g.closePath(); }, c.accent, () => { const gr = g.createLinearGradient(0, hy - 38, 0, hy - 12); gr.addColorStop(0, shade(c.accent, 0.5)); gr.addColorStop(1, shade(c.accent, -0.2)); return gr; });
      // headwear
      if (L.extra === 'headband') {
        fillPart(() => { g.beginPath(); g.rect(hx - 14, hy - 10.5, 28, 5.5); }, c.accent);
        if (!P0 && !flash) {
          const pg = g.createLinearGradient(0, hy - 12, 0, hy - 4); pg.addColorStop(0, '#f3f6fb'); pg.addColorStop(1, '#8f9ab0');
          g.fillStyle = pg; g.fillRect(hx + 1, hy - 12, 11, 8); g.strokeStyle = '#5a6278'; g.lineWidth = 0.8; g.strokeRect(hx + 1, hy - 12, 11, 8);
          g.beginPath(); g.moveTo(hx + 3.5, hy - 6); g.quadraticCurveTo(hx + 6.5, hy - 11, hx + 9.5, hy - 6); g.stroke();
        }
        const wv = Math.sin(T * 0.2), sway = -clamp(f.vx, -6, 6);
        if (!flash) { g.strokeStyle = P0 ? OUT : c.accent; g.lineWidth = P0 ? 6 : 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(hx - 13, hy - 8); g.quadraticCurveTo(hx - 22 + sway, hy - 6 + wv * 3, hx - 30 + sway * 1.5, hy - 1 + wv * 4); g.stroke(); }
      } else if (L.extra === 'hat') {
        const straw = () => { const gr = g.createLinearGradient(0, hy - 26, 0, hy - 6); gr.addColorStop(0, '#f6d98a'); gr.addColorStop(1, '#c79a3a'); return gr; };
        fillPart(() => { g.beginPath(); g.ellipse(hx - 1, hy - 14, 14.5, 11.5, 0, Math.PI, TAU); g.closePath(); }, '#e9c25c', straw);
        if (!P0 && !flash) { g.fillStyle = '#c8202a'; g.fillRect(hx - 14.5, hy - 17, 29, 4.2); }
        fillPart(() => { g.beginPath(); g.ellipse(hx - 1, hy - 12, 26, 5.6, -0.06, 0, TAU); }, '#e9c25c', straw);
        if (!P0 && !flash) { g.strokeStyle = 'rgba(120,80,20,.45)'; g.lineWidth = 0.7; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(hx - 1 + i * 6, hy - 16); g.lineTo(hx - 1 + i * 8, hy - 8); g.stroke(); } }
      } else if (L.extra === 'earrings' && !P0 && !flash) {
        g.fillStyle = '#f4f1ea'; g.fillRect(hx - 4, hy + 6, 4.5, 9); g.strokeStyle = OUT; g.lineWidth = 0.7; g.strokeRect(hx - 4, hy + 6, 4.5, 9);
        dot(hx - 1.8, hy + 11, 1.4, '#d0142c');
      }
      if (L.extra === 'swords3' && !flash) { g.strokeStyle = P0 ? OUT : '#e3ebf8'; g.lineWidth = P0 ? 5 : 2; g.beginPath(); g.moveTo(hx + 10, hy + 8); g.lineTo(hx + 44, hy + 4); g.stroke(); if (!P0) { g.strokeStyle = '#2b1f3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(hx + 4, hy + 9); g.lineTo(hx + 11, hy + 8); g.stroke(); } }
      g.restore();

      // front arm
      const stretching = f.state === 'special' && d.special.kind === 'stretch';
      if (L.extra === 'swords3' && !P0 && !flash) { g.strokeStyle = '#2a2a33'; g.lineWidth = 4; const [wx, wy] = body(-10, -2); g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx - 30, wy + 20); g.stroke(); }
      limb(armF.sx, armF.sy, armF.ex, armF.ey, 10, 8.5, stretching ? c.skin : sleeve);
      limb(armF.ex, armF.ey, armF.hx, armF.hy, stretching ? 8 : 8.5, 7.5, bare || stretching ? c.skin : sleeve);
      if (!P0 && !flash && (L.outfit === 'gi' || L.outfit === 'jacket')) {
        const k = 0.72; g.strokeStyle = L.outfit === 'gi' ? c.accent : shade(c.top, -0.3); g.lineWidth = 8; g.lineCap = 'butt';
        g.beginPath(); g.moveTo(lerp(armF.ex, armF.hx, k), lerp(armF.ey, armF.hy, k)); g.lineTo(lerp(armF.ex, armF.hx, k + 0.14), lerp(armF.ey, armF.hy, k + 0.14)); g.stroke(); g.lineCap = 'round';
      }
      if (stretching) {
        fist(armF.hx, armF.hy, 12, '#17171f', armF.fa);
        if (!P0 && f.armLen > 60) { g.strokeStyle = hexA(c.aura, 0.6); g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(armF.hx - 30 - i * 26, armF.hy - 12 + i * 12); g.lineTo(armF.hx - 60 - i * 26, armF.hy - 12 + i * 12); g.stroke(); } }
      } else fist(armF.hx, armF.hy, 6, gloves, armF.fa);
      if (hasSword(d)) drawSword(armF.hx, armF.hy, armF.fa + 0.5, f, pass);
      if (!P0 && f.state === 'special' && d.special.kind === 'rush' && f.t > 2) drawFx(d.special.fx || 'sphere', armF.hx, armF.hy, f, T);
      if (!P0 && f.state === 'beam') {
        g.save(); g.globalCompositeOperation = 'lighter';
        const bc = d.ult.color || c.aura, r = 14 + Math.sin(T * 0.6) * 3;
        const gr = g.createRadialGradient(armF.hx + 6, armF.hy, 1, armF.hx + 6, armF.hy, r * 2);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, hexA(bc, 0.9)); gr.addColorStop(1, hexA(bc, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(armF.hx + 6, armF.hy, r * 2, 0, TAU); g.fill(); g.restore();
      }
      if (!P0 && f.state === 'attack' && f.t >= f.move.start && f.t < f.move.start + f.move.active + 2) {
        g.save(); g.globalCompositeOperation = 'lighter';
        const [ox, oy] = body(4, -30);
        const sc = f.awakened ? c.awaken : c.aura;
        for (let i = 0; i < 3; i++) { g.strokeStyle = hexA(sc, 0.5 - i * 0.14); g.lineWidth = (hasSword(d) ? 10 : 7) - i * 2.5; g.beginPath(); g.arc(ox, oy, (f.step === 2 ? 60 : hasSword(d) ? 70 : 52) - i * 5, -1.1, 0.7); g.stroke(); }
        g.restore();
      }
    }
    g.restore();
  }
  R.drawFighter = drawFighter;

  // Afterimages for dashes and teleports.
  R.drawGhosts = (f, T) => {
    if (!f.trail || !f.trail.length) return;
    const col = f.awakened ? f.def.colors.awaken : f.def.colors.aura;
    f.trail.forEach((p, i) => {
      g.save(); g.globalAlpha = 0.12 + i * 0.06; g.globalCompositeOperation = 'lighter';
      g.fillStyle = hexA(col, 0.6);
      g.beginPath(); g.ellipse(p.x, p.y - 55, 18, 55, 0, 0, TAU); g.fill();
      g.restore();
    });
  };

  // ---------- projectiles, hazards, particles ----------
  R.drawProjectiles = (list, T) => {
    for (const p of list) {
      const dir = Math.sign(p.vx) || 1;
      g.save(); g.translate(p.x, p.y);
      const r = p.r;
      if (p.kind === 'crescent' || p.kind === 'eclipse') {
        g.scale(dir, 1);
        const ecl = p.kind === 'eclipse';
        g.globalCompositeOperation = ecl ? 'source-over' : 'lighter';
        g.shadowColor = p.color; g.shadowBlur = ecl ? 40 : 22;
        g.fillStyle = ecl ? '#0a0206' : hexA(p.color, 0.85);
        g.beginPath(); g.ellipse(0, 0, r * 0.6, r, 0, -Math.PI / 2, Math.PI / 2, false); g.ellipse(0, 0, r * 0.18, r, 0, Math.PI / 2, -Math.PI / 2, true); g.fill();
        g.shadowBlur = 0;
        g.fillStyle = ecl ? '#ff2640' : '#ffffff';
        g.beginPath(); g.ellipse(r * 0.08, 0, r * 0.45, r * 0.82, 0, -Math.PI / 2, Math.PI / 2, false); g.ellipse(r * 0.08, 0, r * 0.3, r * 0.82, 0, Math.PI / 2, -Math.PI / 2, true); g.fill();
        if (ecl) { g.fillStyle = '#0a0206'; g.beginPath(); g.ellipse(r * 0.08, 0, r * 0.36, r * 0.7, 0, -Math.PI / 2, Math.PI / 2, false); g.ellipse(r * 0.08, 0, r * 0.3, r * 0.7, 0, Math.PI / 2, -Math.PI / 2, true); g.fill(); }
      } else if (p.kind === 'shuriken') {
        g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(0, 0, 4, 0, 0, r * 1.5);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(140,220,255,.8)'); gr.addColorStop(1, 'rgba(60,140,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * 1.5, 0, TAU); g.fill();
        g.rotate(p.t * 0.5); g.fillStyle = 'rgba(225,245,255,.85)';
        for (let i = 0; i < 4; i++) { g.rotate(TAU / 4); g.beginPath(); g.moveTo(0, -6); g.quadraticCurveTo(r * 0.7, -r * 0.5, r * 1.15, 0); g.quadraticCurveTo(r * 0.6, -r * 0.05, 0, 6); g.closePath(); g.fill(); }
        dot(0, 0, 12, '#ffffff');
      } else if (p.kind === 'blackhole') {
        g.globalCompositeOperation = 'lighter';
        g.rotate(p.t * 0.12);
        for (let i = 0; i < 3; i++) { g.strokeStyle = hexA(p.color, 0.6 - i * 0.15); g.lineWidth = 6 - i; g.beginPath(); g.ellipse(0, 0, r * (1.4 + i * 0.3), r * (0.5 + i * 0.12), 0, 0, TAU); g.stroke(); }
        g.globalCompositeOperation = 'source-over';
        dot(0, 0, r * 0.7, '#000');
        g.strokeStyle = hexA('#e04bff', 0.9); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 0.72, 0, TAU); g.stroke();
      } else {
        // orb / pull
        g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(0, 0, 1, 0, 0, r * 1.8);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, hexA(p.color, 0.9)); gr.addColorStop(1, hexA(p.color, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * 1.8, 0, TAU); g.fill();
        if (p.pull) { g.strokeStyle = hexA(p.color, 0.9); g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, r * (0.7 + i * 0.4), p.t * 0.3 + i, p.t * 0.3 + i + 2.2); g.stroke(); } }
      }
      g.restore();
    }
  };

  R.drawHazards = (list, T, fighters) => {
    for (const h of list) {
      if (h.t < 0) continue;
      g.save();
      const warn = h.t < h.warn, active = h.t >= h.warn && h.t < h.warn + h.act;
      if (h.kind === 'pillar' || h.kind === 'fist') {
        if (warn) { const k = h.t / h.warn; g.fillStyle = h.kind === 'fist' ? `rgba(0,0,0,${0.2 + k * 0.4})` : hexA(h.color, 0.25 + k * 0.35); g.beginPath(); g.ellipse(h.x, GROUND + 2, h.w / 2 * (0.4 + k * 0.6), 10, 0, 0, TAU); g.fill(); }
        if (h.kind === 'fist' && h.t < h.warn + h.act) {
          const k = Math.min(1, h.t / h.warn), y = lerp(-260, GROUND - 70, k * k);
          g.fillStyle = '#17171f'; g.fillRect(h.x - 34, y - 540, 68, 490);
          g.beginPath(); g.roundRect ? g.roundRect(h.x - 82, y - 64, 164, 126, 30) : g.rect(h.x - 82, y - 64, 164, 126); g.fill();
          g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 3;
          for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(h.x - 50 + i * 40, y + 20); g.lineTo(h.x - 50 + i * 40, y + 55); g.stroke(); }
          g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,60,90,.9)'; g.lineWidth = 2;
          for (let i = 0; i < 4; i++) { let px = h.x + (Math.random() - 0.5) * 150, py = y - 60 + Math.random() * 120; g.beginPath(); g.moveTo(px, py); for (let j = 0; j < 4; j++) { px += (Math.random() - 0.5) * 40; py += (Math.random() - 0.5) * 40; g.lineTo(px, py); } g.stroke(); }
        }
        if (h.kind === 'pillar' && active) {
          const k = (h.t - h.warn) / h.act, height = 380 * Math.sin(Math.min(1, k * 1.6) * Math.PI / 2) * (1 - Math.max(0, k - 0.75) * 4);
          const darkCore = h.color === '#b02cff';
          g.fillStyle = darkCore ? '#0b0614' : hexA(h.color, 0.35);
          g.beginPath(); g.moveTo(h.x - h.w / 2, GROUND);
          for (let i = 0; i <= 6; i++) g.lineTo(h.x - h.w / 2 + (h.w / 6) * i, GROUND - height + Math.sin(T * 0.6 + i * 2) * 18 + (i % 2) * 26);
          g.lineTo(h.x + h.w / 2, GROUND); g.closePath(); g.fill();
          g.globalCompositeOperation = 'lighter'; g.strokeStyle = hexA(h.color, 0.95); g.lineWidth = 4; g.stroke();
          if (!darkCore) { g.fillStyle = hexA(h.color, 0.25); g.fill(); }
        }
      } else if (h.kind === 'beam') {
        const o = h.owner, y = o.y - 84, x0 = o.x + h.dir * 46;
        if (warn) {
          g.globalCompositeOperation = 'lighter';
          const r = 10 + h.t * 1.4;
          const gr = g.createRadialGradient(x0, y, 1, x0, y, r * 2);
          gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, hexA(h.color, 0.9)); gr.addColorStop(1, hexA(h.color, 0));
          g.fillStyle = gr; g.beginPath(); g.arc(x0, y, r * 2, 0, TAU); g.fill();
        } else if (active) {
          const k = (h.t - h.warn) / h.act, wdt = 46 * Math.sin(Math.min(1, k * 3) * Math.PI / 2) * (k > 0.8 ? (1 - k) * 5 : 1);
          const x1 = h.dir > 0 ? WORLD + 400 : -400;
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = hexA(h.color, 0.55); g.fillRect(Math.min(x0, x1), y - wdt, Math.abs(x1 - x0), wdt * 2);
          g.fillStyle = hexA(h.color, 0.8); g.fillRect(Math.min(x0, x1), y - wdt * 0.6, Math.abs(x1 - x0), wdt * 1.2);
          g.fillStyle = '#ffffff'; g.fillRect(Math.min(x0, x1), y - wdt * 0.28, Math.abs(x1 - x0), wdt * 0.56);
          dot(x0, y, wdt * 1.2, hexA(h.color, 0.7));
        }
      } else if (h.kind === 'slashes' && active) {
        const tg = h.target;
        g.globalCompositeOperation = 'lighter'; g.strokeStyle = hexA(h.color, 0.95); g.lineWidth = 3;
        for (let i = 0; i < 3; i++) { const a = rnd(h.t * 3 + i) * TAU; g.beginPath(); g.moveTo(tg.x + Math.cos(a) * 70, tg.y - 60 + Math.sin(a) * 70); g.lineTo(tg.x - Math.cos(a) * 70, tg.y - 60 - Math.sin(a) * 70); g.stroke(); }
      } else if (h.kind === 'domain' && h.t < h.warn + h.act) {
        const a = Math.min(1, h.t / 10) * (h.t > h.warn + h.act - 10 ? (h.warn + h.act - h.t) / 10 : 1);
        g.globalAlpha = a;
        g.fillStyle = 'rgba(4,2,12,.85)'; g.fillRect(-400, -200, WORLD + 800, 1000);
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 90; i++) { dot(rnd(i * 5.3) * WORLD, rnd(i * 2.9) * 460, rnd(i) * 2 + 0.5, hexA(i % 3 ? '#8fd0ff' : '#ffffff', 0.7)); }
        g.strokeStyle = 'rgba(143,208,255,.35)'; g.lineWidth = 1.5;
        for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(h.target.x, h.target.y - 60, 30 + i * 22 + (h.t % 22), 0, TAU); g.stroke(); }
      }
      g.restore();
    }
  };

  R.drawParticles = list => {
    g.save();
    for (const p of list) {
      const a = p.life / p.max;
      if (p.kind === 'leaf' || p.kind === 'petal') {
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = Math.min(1, a * 3) * 0.85;
        g.save(); g.translate(p.x + Math.sin(p.life * 0.05) * 14, p.y); g.rotate(p.rot); g.fillStyle = p.color; g.beginPath(); g.ellipse(0, 0, 5, 2.5, 0, 0, TAU); g.fill(); g.restore();
        continue;
      }
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
      if (p.kind === 'spark') { g.strokeStyle = p.color; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5); g.stroke(); }
      else if (p.kind === 'ring') { g.strokeStyle = p.color; g.lineWidth = 1 + a * 5; g.beginPath(); g.arc(p.x, p.y, p.r + (1 - a) * p.grow, 0, TAU); g.stroke(); }
      else dot(p.x, p.y, p.r * (0.4 + a * 0.6), p.color);
    }
    g.restore();
  };

  R.drawTexts = list => {
    for (const t of list) { g.save(); g.globalAlpha = Math.min(1, t.life / 15); outlineText(t.text, t.x, t.y, t.size, t.color); g.restore(); }
  };

  function wrap(text, maxW) {
    const words = String(text).split(/\s+/), lines = []; let line = '';
    for (const w of words) { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
    if (line) lines.push(line);
    return lines.slice(0, 4);
  }
  R.drawBubbles = (list, cam) => {
    for (const b of list) {
      const f = b.f, a = Math.min(1, b.life / 12, (b.max - b.life) / 6 + 0.2);
      const sx = (f.x - cam.x) * cam.z + W / 2, sy = (f.y - 150 - GROUND) * cam.z + GROUND;
      g.save(); g.globalAlpha = a;
      g.font = '600 15px "Chakra Petch", sans-serif';
      const lines = wrap(b.text, 230);
      const w = Math.max(...lines.map(l => g.measureText(l).width)) + 22, h = lines.length * 19 + 14;
      const x = clamp(sx - w / 2, 10, W - w - 10), y = clamp(sy - h, 104, H - h - 10);
      g.fillStyle = 'rgba(250,247,240,.96)'; g.strokeStyle = '#0a0c18'; g.lineWidth = 2.5;
      g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 10) : g.rect(x, y, w, h); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(clamp(sx, x + 14, x + w - 14) - 7, y + h - 1); g.lineTo(clamp(sx, x + 14, x + w - 14), y + h + 11); g.lineTo(clamp(sx, x + 14, x + w - 14) + 7, y + h - 1); g.fill();
      g.fillStyle = '#12131f'; g.textAlign = 'left'; g.textBaseline = 'top';
      lines.forEach((l, i) => g.fillText(l, x + 11, y + 8 + i * 19));
      g.restore();
    }
  };

  // ---------- HUD ----------
  function miniPortrait(f, cx, cy, r, T) {
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = '#10142a'; g.fill();
    g.strokeStyle = ENERGY_COLOR[f.def.energy] || '#fff'; g.lineWidth = 3; g.stroke();
    g.clip();
    const s = 1.5;
    const ghost = { ...f, x: 0, y: 0, facing: 1, state: 'idle', t: 0, vx: 0, flash: 0, invuln: 0, trail: null };
    g.translate(cx - 4 * s, cy + 112 * s); g.scale(s, s);
    drawFighter(ghost, T, { noShadow: true, noAura: true, groundY: 0 });
    g.restore();
  }
  function slantBar(x, y, w, h, ratio, fill, right) {
    const sk = 12;
    g.beginPath();
    if (!right) { g.moveTo(x + sk, y); g.lineTo(x + w + sk, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); }
    else { g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - sk, y + h); g.lineTo(x - sk, y + h); }
    g.closePath();
    g.save(); g.clip();
    g.fillStyle = 'rgba(8,10,20,.8)'; g.fillRect(x - sk, y, w + sk * 2, h);
    const ww = (w + sk) * ratio;
    g.fillStyle = fill;
    if (!right) g.fillRect(x + w + sk - ww, y, ww, h); else g.fillRect(x - sk, y, ww, h);
    g.restore();
  }
  function hudSide(f, right, label, T, wins) {
    const pw = 340, px = right ? W - 88 - pw : 88;
    miniPortrait(f, right ? W - 44 : 44, 46, 32, T);
    // name row
    outlineText(f.def.name.toUpperCase(), right ? W - 88 : 88, 16, 20, '#f3efe7', '#0a0c18', right ? 'right' : 'left');
    g.font = '700 11px "Chakra Petch", sans-serif'; g.textBaseline = 'middle';
    g.textAlign = right ? 'left' : 'right';
    g.fillStyle = ENERGY_COLOR[f.def.energy] || '#fff';
    g.fillText(`${label} · ${String(f.def.energy).toUpperCase()}`, right ? W - 88 - pw : 88 + pw, 16);
    // hp
    const r = f.hp / f.maxHp, rs = f.hpShow / f.maxHp, low = r <= 0.3;
    slantBar(px, 28, pw, 20, rs, 'rgba(255,255,255,.85)', right);
    const gr = g.createLinearGradient(0, 28, 0, 48);
    if (low) { const pulse = 0.5 + 0.5 * Math.sin(T * 0.2); gr.addColorStop(0, `rgb(255,${90 + pulse * 40 | 0},80)`); gr.addColorStop(1, '#b0132a'); }
    else { gr.addColorStop(0, '#ffe07a'); gr.addColorStop(1, '#f08a1c'); }
    slantBar(px, 28, pw, 20, r, gr, right);
    // energy
    const full = f.energy >= 100, ec = ENERGY_COLOR[f.def.energy] || '#fff';
    for (let i = 0; i < 4; i++) {
      const part = clamp((f.energy - i * 25) / 25, 0, 1), sw = 52;
      const sx = right ? px + pw - (i + 1) * (sw + 6) : px + i * (sw + 6);
      slantBar(sx, 54, sw, 8, part, full ? (T % 20 < 10 ? '#ffffff' : ec) : ec, right);
    }
    if (full) outlineText('ULTIMATE READY', right ? px + pw - 4 * 58 - 8 : px + 4 * 58 + 8, 58, 15, '#ffc23d', '#0a0c18', right ? 'right' : 'left');
    // round pips
    for (let i = 0; i < 2; i++) dot(right ? W / 2 + 22 + i * 13 : W / 2 - 22 - i * 13, 84, 5, i < wins ? '#ffc23d' : 'rgba(255,255,255,.2)');
    let y = 76;
    if (f.awakened) { outlineText(f.def.awaken.toUpperCase(), right ? W - 88 : 88, y, 17, f.def.colors.awaken, '#0a0c18', right ? 'right' : 'left'); y += 22; }
    if (f.combo >= 2 && f.comboT > 0) { g.save(); g.globalAlpha = Math.min(1, f.comboT / 15); outlineText(`${f.combo} HIT COMBO`, right ? W - 88 : 88, y + 4, 28, '#ffc23d', '#0a0c18', right ? 'right' : 'left'); g.restore(); }
  }
  R.drawHUD = (game, T) => {
    const [p, c] = game.fighters;
    hudSide(p, false, game.labels[0], T, game.wins[0]);
    hudSide(c, true, game.labels[1], T, game.wins[1]);
    const cx = W / 2;
    g.fillStyle = 'rgba(8,10,20,.9)'; g.beginPath(); g.moveTo(cx - 30, 14); g.lineTo(cx + 30, 14); g.lineTo(cx + 22, 70); g.lineTo(cx - 22, 70); g.closePath(); g.fill();
    g.strokeStyle = '#ffc23d'; g.lineWidth = 2; g.stroke();
    outlineText(String(Math.max(0, Math.ceil(game.timer / 60))), cx, 42, 34, game.timer < 600 ? '#ff5b2e' : '#f3efe7');
  };

  R.drawCine = (game, T, drawOnTop) => {
    const cn = game.cine, f = cn.f, d = f.def;
    const e = Math.min(1, cn.t / 10), out = cn.t > cn.dur - 10 ? (cn.dur - cn.t) / 10 : 1, k = e * out;
    const col = cn.type === 'awaken' ? d.colors.awaken : (f.awakened ? d.colors.awaken : (d.ult.color || d.colors.aura));
    g.save();
    g.fillStyle = `rgba(5,6,14,${0.66 * k})`; g.fillRect(-40, -40, W + 80, H + 80);
    const cam = game.cam, cx = (f.x - cam.x) * cam.z + W / 2, cy = (f.y - 60 - GROUND) * cam.z + GROUND;
    g.strokeStyle = hexA(col, 0.55 * k); g.lineWidth = 2;
    for (let i = 0; i < 52; i++) {
      const a = rnd(i * 3.7 + Math.floor(cn.t / 3)) * TAU, r1 = 130 + rnd(i * 1.3 + Math.floor(cn.t / 3)) * 70;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * 1100, cy + Math.sin(a) * 1100); g.stroke();
    }
    drawOnTop();
    if (cn.type === 'ult') {
      const bh = 64 * k;
      g.fillStyle = '#000'; g.fillRect(-40, -40, W + 80, bh + 40); g.fillRect(-40, H - bh, W + 80, bh + 40);
      const bx = lerp(-W - 100, 0, Math.min(1, cn.t / 12));
      g.save(); g.translate(bx, 0); g.globalAlpha = out;
      g.fillStyle = hexA(col, 0.92);
      g.beginPath(); g.moveTo(-40, 240); g.lineTo(W + 40, 190); g.lineTo(W + 40, 290); g.lineTo(-40, 340); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-40, 262, W + 80, 4);
      outlineText(d.short.toUpperCase() + "'S ULTIMATE", W / 2, 222, 22, '#ffffff');
      const size = d.ult.name.length > 18 ? 56 : 70;
      outlineText(d.ult.name.toUpperCase(), W / 2, 272, size, '#ffffff');
      g.restore();
    } else {
      if (cn.t < 6) { g.fillStyle = `rgba(255,255,255,${1 - cn.t / 6})`; g.fillRect(-40, -40, W + 80, H + 80); }
      const s = cn.t < 10 ? lerp(1.6, 1, cn.t / 10) : 1;
      g.globalAlpha = out;
      outlineText(d.short.toUpperCase() + ' REFUSES TO FALL', W / 2, 150, 24, '#f3efe7');
      g.save(); g.translate(W / 2, 214); g.scale(s, s);
      outlineText(d.awaken.toUpperCase(), 0, 0, d.awaken.length > 14 ? 62 : 84, col);
      g.restore();
    }
    g.restore();
  };

  R.drawBanner = b => {
    const s = b.t < 8 ? lerp(1.8, 1, b.t / 8) : 1, a = b.t > b.dur - 10 ? (b.dur - b.t) / 10 : 1;
    g.save(); g.globalAlpha = Math.max(0, a); g.translate(W / 2, H / 2 - 40); g.scale(s, s);
    outlineText(b.text.toUpperCase(), 0, 0, 104, b.color);
    if (b.sub) outlineText(b.sub, 0, 66, 22, '#f3efe7', '#0a0c18', 'center', 'body');
    g.restore();
  };

  // ---------- portraits for menus ----------
  R.portrait = (canvas, def, opts = {}) => {
    const size = opts.size || 240;
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const pc = canvas.getContext('2d');
    const col = ENERGY_COLOR[def.energy] || '#888';
    pc.setTransform(1, 0, 0, 1, 0, 0);
    const gr = pc.createRadialGradient(size / 2, size * 0.46, 10, size / 2, size / 2, size * 0.7);
    gr.addColorStop(0, hexA(col, 0.5)); gr.addColorStop(1, '#0d1024');
    pc.fillStyle = gr; pc.fillRect(0, 0, size, size);
    pc.strokeStyle = hexA(col, 0.16); pc.lineWidth = 2;
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; pc.beginPath(); pc.moveTo(size / 2 + Math.cos(a) * size * 0.17, size * 0.46 + Math.sin(a) * size * 0.17); pc.lineTo(size / 2 + Math.cos(a) * size, size * 0.46 + Math.sin(a) * size); pc.stroke(); }
    const f = { def, x: 0, y: 0, facing: opts.facing || 1, state: opts.state || 'idle', t: 20, anim: 0, vx: 0, flash: 0, invuln: 0, awakened: !!opts.awakened, corrupted: !!opts.corrupted, armLen: 0, trail: null };
    const s = (opts.zoom || 1.22) * size / 240;
    pc.setTransform(s, 0, 0, s, size / 2 - 4 * s, size * 0.925);
    const prev = g; g = pc;
    drawFighter(f, opts.T || 0, { groundY: 0 });
    g = prev;
    pc.setTransform(1, 0, 0, 1, 0, 0);
  };
})();
