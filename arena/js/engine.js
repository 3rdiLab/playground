/* Shonen Legends: engine — combat, moves, AI, camera, input and match flow. */
(() => {
  'use strict';
  const SL = (window.SL = window.SL || {});
  const { W, H, GROUND, WORLD, TAU } = SL.C;
  const { clamp, lerp, hexA } = SL.util;
  const { ENERGY_COLOR, overpowers, LINES } = SL.data;
  const R = SL.render, audio = SL.audio;
  const sfx = n => audio.play(n);

  const COMBO = [
    { dmg: 5, reach: 62, start: 4, active: 4, rec: 9, kb: 2, lift: 0 },
    { dmg: 6, reach: 66, start: 4, active: 4, rec: 10, kb: 3, lift: 0 },
    { dmg: 10, reach: 76, start: 6, active: 5, rec: 18, kb: 9, lift: -7 },
  ];
  const AIR = { dmg: 7, reach: 64, start: 3, active: 8, rec: 8, kb: 5, lift: -2 };
  const DIFF = {
    rookie:  { label: 'Rookie',  react: 24, block: 0.12, aggro: 0.35 },
    captain: { label: 'Captain', react: 13, block: 0.4,  aggro: 0.6 },
    emperor: { label: 'Emperor', react: 6,  block: 0.72, aggro: 0.85 },
  };

  SL.settings = { hq: true, r3d: true };
  const game = (SL.game = {
    phase: 'idle', paused: false, frame: 0, phaseT: 0,
    fighters: [], projectiles: [], hazards: [], particles: [], texts: [], bubbles: [],
    cine: null, banner: null, hitstop: 0, shake: 0, slowmo: 0, pendingAwaken: [],
    round: 1, wins: [0, 0], timer: 0, stage: 'village', stageName: '', diff: 'captain', drumStep: 0,
    cam: { x: WORLD / 2, z: 1 }, labels: ['YOU', 'CPU'], opts: null, stats: null,
  });
  const listeners = {};
  const emitEvent = (type, data) => (listeners[type] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });

  function blankInput() { return { left: false, right: false, jump: false, block: false, charge: false, attack: false, special: false, ult: false, dash: 0 }; }
  function makeFighter(def, x, facing, isCpu, extra = {}) {
    const hp = Math.round(def.hp * (extra.hpMult || 1));
    return {
      def, x, y: GROUND, vx: 0, vy: 0, facing, isCpu,
      hp, maxHp: hp, hpShow: hp, energy: 20,
      state: 'idle', t: 0, anim: 0, stun: 0, invuln: 0, flash: 0,
      awakened: false, corrupted: !!extra.corrupted, combo: 0, comboT: 0, maxCombo: 0,
      step: 0, move: null, air: false, hitDone: false, queued: false, armLen: 0, noFric: false, trail: [],
      input: blankInput(), ai: { cool: 0 },
    };
  }
  const other = f => (game.fighters[0] === f ? game.fighters[1] : game.fighters[0]);

  // ---------- effects ----------
  function emit(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      if (game.particles.length > 900) game.particles.shift();
      const life = o.life * (0.6 + Math.random() * 0.6), ang = Math.random() * TAU, sp = Math.random() * (o.spread || 0);
      game.particles.push({
        x: x + (Math.random() - 0.5) * (o.jitter || 0), y: y + (Math.random() - 0.5) * (o.jitterY || o.jitter || 0),
        vx: Math.cos(ang) * sp + (o.vx || 0), vy: Math.sin(ang) * sp + (o.vy || 0),
        life, max: life, r: (o.r || 3) * (0.5 + Math.random()), color: o.color,
        g: o.g || 0, drag: o.drag || 0.94, kind: o.kind || 'glow', grow: o.grow || 60, rot: Math.random() * TAU,
      });
    }
  }
  function floatText(x, y, text, color, size = 26) { game.texts.push({ x, y, text, color, size, life: 50, max: 50 }); }
  function banner(text, color = '#ffc23d', dur = 55, sub = '') { game.banner = { text, color, dur, sub, t: 0 }; }
  function say(f, text, dur = 170) {
    if (!text) return;
    game.bubbles = game.bubbles.filter(b => b.f !== f);
    game.bubbles.push({ f, text: String(text).slice(0, 160), life: dur, max: dur });
  }

  // ---------- combat ----------
  function hit(att, def, dmg, kb, lift, opts = {}) {
    if (game.phase !== 'fight' || def.state === 'ko' || def.invuln > 0) return false;
    const dir = Math.sign(def.x - att.x) || att.facing;
    const blocked = def.state === 'block' && def.facing === -dir && !opts.unblockable;
    let mult = (att.awakened ? 1.3 : 1) * (att.def.power || 1);
    const adv = overpowers(att.def.energy, def.def.energy);
    if (adv) mult *= 1.2;
    const crit = !blocked && !opts.multi && Math.random() < 0.08;
    if (crit) mult *= 1.5;
    let d = dmg * mult;
    if (blocked) d *= 0.2;
    d = Math.max(1, Math.round(d));
    def.hp = Math.max(0, def.hp - d);
    att.energy = Math.min(100, att.energy + (blocked ? 2 : d * 0.9));
    def.energy = Math.min(100, def.energy + d * 0.5);
    const hx = def.x - dir * 10, hy = def.y - 70;
    const col = att.awakened ? att.def.colors.awaken : att.def.colors.aura;

    if (blocked) {
      def.vx = dir * kb * 0.6;
      emit(hx, hy, 10, { spread: 7, life: 14, r: 2.5, color: '#9fd8ff', kind: 'spark' });
      if (!opts.multi) floatText(def.x, def.y - 130, 'BLOCK', '#9fd8ff', 22);
      game.hitstop = Math.max(game.hitstop, 3); sfx('block');
    } else {
      def.state = 'hurt'; def.t = 0; def.stun = 12 + Math.abs(kb); def.flash = 4; def.air = false;
      def.vx = dir * kb; if (lift) def.vy = lift;
      const heavy = dmg >= 14;
      emit(hx, hy, heavy ? 26 : opts.multi ? 6 : 14, { spread: heavy ? 13 : 9, life: 18, r: 3, color: '#fff2b8', kind: 'spark' });
      if (!opts.multi || heavy) emit(hx, hy, 1, { life: 14, r: heavy ? 26 : 14, grow: heavy ? 90 : 50, color: hexA(col, 1), kind: 'ring' });
      game.shake = Math.max(game.shake, heavy ? 14 : 6);
      game.hitstop = Math.max(game.hitstop, heavy ? 8 : opts.multi ? 2 : 4);
      floatText(def.x + (Math.random() - 0.5) * 30, def.y - 125, String(d), crit ? '#ff5b2e' : '#ffffff', crit ? 36 : opts.multi ? 22 : 28);
      if (crit) floatText(def.x, def.y - 160, 'CRITICAL!', '#ff5b2e', 26);
      else if (adv && !opts.multi) floatText(def.x, def.y - 160, 'OVERPOWER!', ENERGY_COLOR[att.def.energy], 22);
      att.combo = att.comboT > 0 ? att.combo + 1 : 1; att.comboT = 55; att.maxCombo = Math.max(att.maxCombo, att.combo);
      sfx(heavy ? 'heavy' : 'hit');
    }

    emitEvent('hit', { att, def, dmg: d, blocked, adv, crit, ult: !!opts.ult });

    if (def.hp <= 0) {
      def.state = 'ko'; def.t = 0; def.vy = -8; def.vx = dir * 7; def.stun = 0;
      game.phase = 'roundEnd'; game.phaseT = 0;
      game.wins[game.fighters.indexOf(att)]++;
      game.hitstop = 20; game.shake = 22; game.slowmo = 70;
      emit(def.x, def.y - 60, 40, { spread: 14, life: 30, r: 4, color: '#ffd27a' });
      banner('K.O.!', '#ff4a3a', 110);
      sfx('ko');
      emitEvent('ko', { winner: att, loser: def, ult: !!opts.ult });
      emitEvent('round', { winner: game.fighters.indexOf(att), timeout: false });
    } else if (!def.awakened && def.hp <= def.maxHp * 0.3 && !game.pendingAwaken.includes(def)) {
      game.pendingAwaken.push(def);
    }
    return true;
  }

  function meleeHits(f, o, reach) {
    const cx = f.x + f.facing * reach * 0.6;
    return Math.abs(o.x - cx) < reach * 0.5 + 24 && Math.abs(o.y - f.y) < 90;
  }
  function startAttack(f, step) {
    f.state = 'attack'; f.step = step; f.air = f.y < GROUND - 1; f.move = f.air ? AIR : COMBO[step];
    f.t = 0; f.hitDone = false; f.queued = false;
    sfx('swing');
  }
  function updateAttack(f, o) {
    const m = f.move;
    if (f.input.attack) f.queued = true;
    if (f.hitDone && f.input.special && f.energy >= 25) { startSpecial(f); return; }
    if (f.t >= m.start && f.t < m.start + m.active && !f.hitDone && meleeHits(f, o, m.reach)) { f.hitDone = true; hit(f, o, m.dmg, m.kb, m.lift); }
    if (f.air && f.y >= GROUND) { f.state = 'idle'; f.air = false; return; }
    if (f.t >= m.start + m.active + m.rec) {
      if (f.queued && !f.air && f.step < 2) startAttack(f, f.step + 1);
      else { f.state = f.air ? 'jump' : 'idle'; }
    }
  }

  function shoot(f, o) {
    game.projectiles.push({
      owner: f, x: f.x + f.facing * o.dx, y: f.y - o.dy, vx: f.facing * o.speed, r: o.r,
      dmg: o.dmg, kb: o.kb, lift: o.lift, kind: o.kind, big: !!o.big, ult: !!o.big, color: o.color, pull: !!o.pull, t: 0, dead: false,
    });
  }

  function startSpecial(f) {
    f.energy -= 25; f.state = 'special'; f.t = 0; f.hitDone = false; f.armLen = 0; f.vx = 0; f.air = false;
    floatText(f.x, f.y - 150, f.def.special.name, f.def.colors.aura, 24);
    sfx('special');
  }
  function updateSpecial(f, o) {
    const sp = f.def.special, c = f.def.colors, k = sp.kind;
    const col = sp.color || (f.awakened ? c.awaken : c.aura);
    if (k === 'rush') {
      if (f.t < 10) f.vx = 0;
      else if (f.t < 28) {
        f.vx = f.facing * 15; f.noFric = true;
        emit(f.x - f.facing * 10, f.y - 60, 3, { spread: 2, life: 16, r: 5, color: col, vx: -f.facing * 2 });
        if (!f.hitDone && Math.abs(o.x - (f.x + f.facing * 30)) < 50 && Math.abs(o.y - f.y) < 90) {
          f.hitDone = true; f.vx = 0; f.t = 28;
          hit(f, o, 14, 11, -6);
          emit(o.x, o.y - 70, 22, { spread: 10, life: 20, r: 5, color: col });
        }
      } else if (f.t > 40) f.state = 'idle';
    } else if (k === 'wave') {
      if (f.t === 10) shoot(f, sp.pull
        ? { dx: 44, dy: 70, speed: 9, r: 20, dmg: 11, kb: -9, lift: -2, kind: 'orb', color: col, pull: true }
        : { dx: 44, dy: 70, speed: 11, r: 28, dmg: 13, kb: 9, lift: -3, kind: 'crescent', color: col });
      if (f.t > 30) f.state = 'idle';
    } else if (k === 'barrage') {
      if (f.t === 6 || f.t === 12 || f.t === 18) { shoot(f, { dx: 40, dy: 72 + (f.t % 12) * 2 - 6, speed: 12, r: 10, dmg: 5, kb: 3, lift: 0, kind: 'orb', color: col }); sfx('blip'); }
      if (f.t > 28) f.state = 'idle';
    } else if (k === 'teleport') {
      if (f.t === 6) { sfx('teleport'); emit(f.x, f.y - 60, 20, { spread: 6, life: 18, r: 4, color: col }); f.invuln = 10; f.trail = [{ x: f.x, y: f.y }]; }
      if (f.t === 12) {
        const side = o.x >= f.x ? 1 : -1;
        f.x = clamp(o.x + side * 55, 40, WORLD - 40); f.facing = -side;
        emit(f.x, f.y - 60, 20, { spread: 6, life: 18, r: 4, color: col });
      }
      if (f.t >= 15 && f.t < 20 && !f.hitDone && meleeHits(f, o, 72)) { f.hitDone = true; hit(f, o, 14, 9, -4); }
      if (f.t > 32) { f.state = 'idle'; f.trail = []; }
    } else if (k === 'stretch') {
      const T = f.t;
      f.armLen = T < 6 ? 0 : T < 18 ? (T - 6) / 12 * 300 : T < 30 ? 300 * (1 - (T - 18) / 12) : 0;
      if (!f.hitDone && T >= 8 && T < 24) {
        const fx = f.x + f.facing * (22 + f.armLen);
        if (Math.abs(o.x - fx) < 40 && Math.abs(o.y - f.y) < 90) { f.hitDone = true; hit(f, o, 14, 10, -3); }
      }
      if (T > 34) f.state = 'idle';
    }
  }

  function startUlt(f) {
    f.energy = 0; f.state = 'ult'; f.t = -999; f.vx = 0; f.air = false; f.flash = 0;
    game.cine = { type: 'ult', f, t: 0, dur: 80 };
    sfx('ult');
    emitEvent('ult', f);
  }
  function executeUlt(f) {
    const o = other(f), u = f.def.ult, c = f.def.colors, col = u.color || (f.awakened ? c.awaken : c.aura);
    f.t = 0;
    switch (u.kind) {
      case 'bigShot':
        if (u.variant === 'blackhole') shoot(f, { dx: 80, dy: 90, speed: 6.5, r: 46, dmg: 30, kb: 14, lift: -9, kind: 'blackhole', big: true, color: col });
        else shoot(f, { dx: 70, dy: 85, speed: 8.5, r: 56, dmg: 30, kb: 14, lift: -9, kind: 'shuriken', big: true, color: '#9fe3ff' });
        break;
      case 'bigWave':
        shoot(f, { dx: 60, dy: 90, speed: 12, r: 92, dmg: 32, kb: 14, lift: -9, kind: 'eclipse', big: true, color: '#ff2640' });
        break;
      case 'pillars':
        [-90, 0, 90].forEach((off, i) => game.hazards.push({ kind: 'pillar', owner: f, target: o, x: clamp(o.x + off, 40, WORLD - 40), t: -i * 14, warn: 22, act: 26, w: 84, dmg: 11, kb: 8, lift: -9, hit: false, color: col }));
        break;
      case 'meteor':
        game.hazards.push({ kind: 'fist', owner: f, target: o, x: o.x, t: 0, warn: 32, act: 16, w: 170, dmg: 32, kb: 14, lift: -12, hit: false, color: col });
        break;
      case 'beam':
        f.state = 'beam'; f.t = 0;
        game.hazards.push({ kind: 'beam', owner: f, target: o, dir: f.facing, t: 0, warn: 16, act: 44, n: 0, color: col });
        sfx('beam');
        break;
      case 'dashStrike': {
        const hits = u.hits || 1, side = o.x >= f.x ? 1 : -1, from = f.x;
        f.x = clamp(o.x + side * 70, 40, WORLD - 40); f.facing = -side;
        f.trail = [0.2, 0.4, 0.6, 0.8].map(k => ({ x: lerp(from, f.x, k), y: f.y }));
        sfx('dash');
        game.hazards.push({ kind: 'slashes', owner: f, target: o, t: 0, warn: 6, act: hits === 1 ? 10 : hits * 5, hits, n: 0, dmg: hits === 1 ? 32 : 36 / hits, color: col });
        break;
      }
      case 'domain':
        game.hazards.push({ kind: 'domain', owner: f, target: o, t: 0, warn: 46, act: 26, hit: false, color: col });
        break;
    }
  }

  function startAwaken(f) {
    if (f.hp <= 0 || f.awakened) return;
    f.awakened = true; f.corrupted = false;
    f.energy = Math.min(100, f.energy + 50);
    f.state = 'idle'; f.stun = 0; f.vx = 0; f.invuln = 40; f.flash = 0;
    game.cine = { type: 'awaken', f, t: 0, dur: 100 };
    emit(f.x, f.y - 60, 60, { spread: 12, life: 40, r: 5, color: f.def.colors.awaken });
    sfx('awaken');
    emitEvent('awaken', f);
  }

  // ---------- fighter update ----------
  const FREE = new Set(['idle', 'walk', 'jump', 'block', 'charge']);
  function updateFighter(f, o) {
    const inp = f.input, d = f.def;
    f.t++;
    if (f.stun > 0) f.stun--;
    if (f.invuln > 0) f.invuln--;
    if (f.flash > 0) f.flash--;
    if (f.comboT > 0 && --f.comboT === 0) f.combo = 0;
    if (f.trail.length && f.state !== 'dash' && f.state !== 'special' && game.frame % 3 === 0) f.trail.shift();
    f.noFric = false;
    const onGround = f.y >= GROUND - 0.5;

    if (f.state === 'hurt' && f.stun <= 0 && onGround) f.state = 'idle';

    if (FREE.has(f.state)) {
      f.facing = o.x >= f.x ? 1 : -1;
      const spd = 4.4 * d.speed * (f.awakened ? 1.15 : 1);
      const mv = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (inp.ult && f.energy >= 100) startUlt(f);
      else if (inp.special && f.energy >= 25 && onGround) startSpecial(f);
      else if (inp.attack) startAttack(f, 0);
      else if (inp.dash && onGround) { f.state = 'dash'; f.t = 0; f.dashDir = inp.dash; f.invuln = Math.max(f.invuln, 6); sfx('dash'); emitEvent('dash', f); }
      else if (onGround && inp.block) { f.state = 'block'; f.vx = 0; }
      else if (onGround && inp.charge) {
        f.state = 'charge'; f.vx = 0;
        f.energy = Math.min(100, f.energy + 0.7);
        if (game.frame % 2 === 0) emit(f.x, f.y - 10, 1, { jitter: 50, jitterY: 6, vy: -3.2, life: 30, r: 3, color: f.awakened ? d.colors.awaken : d.colors.aura, drag: 0.99 });
      } else if (onGround) {
        f.vx = mv * spd;
        if (inp.jump) { f.vy = -14; f.state = 'jump'; sfx('jump'); }
        else f.state = mv ? 'walk' : 'idle';
      } else {
        f.state = 'jump';
        f.vx = clamp(f.vx + mv * 0.45, -spd, spd);
      }
    } else if (f.state === 'attack') updateAttack(f, o);
    else if (f.state === 'special') updateSpecial(f, o);
    else if (f.state === 'dash') {
      f.vx = f.dashDir * 11 * d.speed; f.noFric = true;
      if (game.frame % 2 === 0) f.trail.push({ x: f.x, y: f.y }), f.trail.length > 4 && f.trail.shift();
      if (f.t > 13) { f.state = 'idle'; }
    }
    else if (f.state === 'ult') { if (f.t > 36) f.state = 'idle'; }
    else if (f.state === 'beam') { if (f.t > 64) f.state = 'idle'; }
    else if (f.state === 'win') { f.vx = 0; }

    if (f.state !== 'ko') f.energy = Math.min(100, f.energy + 0.035);
    if (f.state === 'walk') f.anim += Math.abs(f.vx) * 0.22;
    if ((f.awakened || f.corrupted) && game.frame % 5 === 0 && f.state !== 'ko') {
      emit(f.x, f.y - 30, 1, { jitter: 36, jitterY: 60, vy: -2, life: 26, r: 3, color: f.awakened ? d.colors.awaken : '#8a5cff', drag: 0.98 });
    }

    f.vy += 0.75;
    f.x += f.vx; f.y += f.vy;
    if (f.y >= GROUND) { f.y = GROUND; f.vy = 0; if (f.state === 'jump') f.state = 'idle'; }
    if (f.y >= GROUND && !f.noFric && f.state !== 'walk') f.vx *= 0.8;
    f.x = clamp(f.x, 40, WORLD - 40);
  }

  function separate(a, b) {
    if (a.state === 'ko' || b.state === 'ko' || a.state === 'dash' || b.state === 'dash') return;
    const dx = b.x - a.x, min = 46;
    if (Math.abs(dx) < min && Math.abs(a.y - b.y) < 80) {
      const s = dx >= 0 ? 1 : -1, push = (min - Math.abs(dx)) / 2;
      a.x = clamp(a.x - push * s, 40, WORLD - 40);
      b.x = clamp(b.x + push * s, 40, WORLD - 40);
    }
  }

  function circleHitsFighter(p, f) {
    const nx = clamp(p.x, f.x - 24, f.x + 24), ny = clamp(p.y, f.y - 115, f.y);
    return (p.x - nx) ** 2 + (p.y - ny) ** 2 < p.r * p.r;
  }
  function updateProjectiles() {
    const P = game.projectiles;
    for (const p of P) {
      p.x += p.vx; p.t++;
      if (p.t % 2 === 0) emit(p.x - Math.sign(p.vx) * p.r * 0.4, p.y, p.big ? 3 : 1, { jitter: p.r, life: 20, r: p.big ? 7 : 4, color: p.color, vx: -p.vx * 0.1 });
      if (p.kind === 'blackhole') { const tg = other(p.owner); if (tg.state !== 'ko' && Math.abs(tg.x - p.x) < 320) tg.x = clamp(tg.x + Math.sign(p.x - tg.x) * 1.6, 40, WORLD - 40); }
    }
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j];
      if (a.dead || b.dead || a.owner === b.owner) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.8) {
        if (a.big && !b.big) b.dead = true; else if (b.big && !a.big) a.dead = true; else a.dead = b.dead = true;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        emit(mx, my, 30, { spread: 12, life: 24, r: 4, color: '#fff2b8', kind: 'spark' });
        emit(mx, my, 1, { life: 18, r: 20, grow: 120, color: 'rgba(255,255,255,1)', kind: 'ring' });
        floatText(mx, my - 50, 'CLASH!', '#ffffff', 30); emitEvent('clash', { a: a.owner, b: b.owner });
        game.shake = Math.max(game.shake, 10); sfx('boom');
      }
    }
    for (const p of P) {
      if (p.dead) continue;
      const tgt = other(p.owner);
      if (tgt.state !== 'ko' && circleHitsFighter(p, tgt) && hit(p.owner, tgt, p.dmg, p.kb, p.lift, { ult: p.ult })) {
        p.dead = true;
        emit(p.x, p.y, p.big ? 40 : 12, { spread: p.big ? 14 : 8, life: 24, r: 5, color: p.color });
      }
      if (p.x < -200 || p.x > WORLD + 200 || p.t > 260) p.dead = true;
    }
    game.projectiles = P.filter(p => !p.dead);
  }

  function updateHazards() {
    for (const h of game.hazards) {
      h.t++;
      const tg = h.target, active = h.t >= h.warn && h.t < h.warn + h.act;
      if (h.kind === 'pillar' || h.kind === 'fist') {
        if (h.t === h.warn) {
          game.shake = Math.max(game.shake, h.kind === 'fist' ? 24 : 10); sfx('boom');
          emit(h.x, GROUND, h.kind === 'fist' ? 50 : 22, { spread: 12, life: 30, r: 5, color: h.kind === 'fist' ? '#ffd27a' : h.color, vy: -3 });
          if (h.kind === 'fist') emit(h.x, GROUND - 10, 1, { life: 24, r: 30, grow: 260, color: '#ffffff', kind: 'ring' });
        }
        if (active) {
          if (!h.hit && Math.abs(tg.x - h.x) < h.w / 2 + 22 && (h.kind === 'pillar' || tg.y > GROUND - 220) && hit(h.owner, tg, h.dmg, h.kb, h.lift, { ult: true })) h.hit = true;
          if (h.kind === 'pillar') emit(h.x, GROUND, 3, { jitter: h.w * 0.6, jitterY: 4, vy: -8, life: 22, r: 7, color: h.color, drag: 0.97 });
        }
      } else if (h.kind === 'beam') {
        if (active && (h.t - h.warn) % 5 === 0 && h.n < 8) {
          h.n++;
          const o = h.owner, inPath = (tg.x - o.x) * h.dir > 0 && Math.abs((tg.y - 60) - (o.y - 84)) < 70;
          if (inPath) hit(o, tg, 4, 4 * h.dir * Math.sign(tg.x - o.x || 1), h.n === 8 ? -8 : 0, { multi: true, ult: true });
          game.shake = Math.max(game.shake, 6);
        }
      } else if (h.kind === 'slashes') {
        if (active) {
          const every = h.hits === 1 ? 1 : 5;
          if ((h.t - h.warn) % every === 0 && h.n < h.hits) {
            h.n++;
            const last = h.n === h.hits;
            hit(h.owner, tg, h.dmg, last ? 12 : 2, last ? -10 : 0, { multi: !last || h.hits > 1, unblockable: h.hits === 1, ult: true });
            emit(tg.x, tg.y - 60, 10, { spread: 10, life: 16, r: 3, color: h.color, kind: 'spark' });
            sfx('swing');
          }
        }
      } else if (h.kind === 'domain') {
        if (h.t < h.warn && tg.state !== 'ko') { tg.vx = 0; tg.state = 'hurt'; tg.stun = 10; if (tg.y < GROUND) tg.vy = Math.min(tg.vy, 0.5); }
        if (h.t === h.warn && !h.hit) { h.hit = true; hit(h.owner, tg, 30, 12, -10, { unblockable: true, ult: true }); game.shake = 20; sfx('boom'); }
      }
      if (h.t > h.warn + h.act + 20) h.dead = true;
    }
    game.hazards = game.hazards.filter(h => !h.dead);
  }

  function updateParticles() {
    for (const p of game.particles) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag; p.life--; p.rot += 0.05; }
    game.particles = game.particles.filter(p => p.life > 0);
    for (const t of game.texts) { t.y -= 1.1; t.life--; }
    game.texts = game.texts.filter(t => t.life > 0);
    for (const b of game.bubbles) b.life--;
    game.bubbles = game.bubbles.filter(b => b.life > 0);
  }

  // ---------- AI ----------
  function aiUpdate(f, o) {
    const inp = f.input, dd = DIFF[game.diff] || DIFF.captain, ai = f.ai;
    if (--ai.cool > 0) return;
    ai.cool = dd.react + Math.floor(Math.random() * 6);
    inp.left = inp.right = inp.block = inp.charge = false;
    const dx = o.x - f.x, dist = Math.abs(dx), dir = Math.sign(dx) || 1, R0 = Math.random();

    const threat = game.projectiles.find(p => p.owner !== f && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(f.x - p.x) < 280);
    const hazard = game.hazards.find(h => h.owner !== f && h.t < h.warn && (h.kind === 'pillar' || h.kind === 'fist') && Math.abs(h.x - f.x) < h.w);
    if (hazard && R0 < dd.block + 0.1) { if (hazard.x > f.x) inp.left = true; else inp.right = true; if (Math.random() < 0.5) inp.dash = hazard.x > f.x ? -1 : 1; ai.cool = 12; return; }
    if (threat && R0 < dd.block) { if (Math.random() < 0.55 && !threat.big) inp.block = true; else inp.jump = true; ai.cool = 14; return; }
    if ((o.state === 'attack' || (o.state === 'special' && o.def.special.kind !== 'wave')) && dist < 130 && R0 < dd.block) { inp.block = true; ai.cool = 16; return; }
    if (f.energy >= 100 && dist < 620 && R0 < dd.aggro) { inp.ult = true; return; }
    const k = f.def.special.kind;
    if (f.energy >= 25 && Math.random() < dd.aggro * 0.45) {
      if ((k === 'rush' && dist < 280 && dist > 60) || ((k === 'wave' || k === 'barrage') && dist > 150) || (k === 'stretch' && dist < 320 && dist > 90) || (k === 'teleport' && dist > 120)) { inp.special = true; return; }
    }
    if (dist > 78) {
      if (f.energy < 55 && dist > 380 && Math.random() < 0.35) { inp.charge = true; ai.cool = 30; return; }
      if (dir > 0) inp.right = true; else inp.left = true;
      if (dist > 300 && Math.random() < 0.15) inp.dash = dir;
      else if (Math.random() < 0.05) inp.jump = true;
    } else if (Math.random() < dd.aggro) { inp.attack = true; ai.cool = 5; }
    else if (dir > 0) inp.left = true; else inp.right = true;
  }

  // ---------- input ----------
  const keys = {}, touch = { left: false, right: false, jump: false, block: false, charge: false };
  const presses = { attack: false, special: false, ult: false, jump: false, dash: 0 };
  const lastTap = { left: 0, right: 0 };
  const KEYMAP = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'jump', ArrowUp: 'jump', Space: 'jump',
    KeyS: 'block', ArrowDown: 'block', KeyI: 'charge', KeyJ: 'attack', KeyK: 'special', KeyL: 'ult' };
  function dirTap(a) {
    const now = performance.now();
    if (now - lastTap[a] < 260) presses.dash = a === 'left' ? -1 : 1;
    lastTap[a] = now;
  }
  window.addEventListener('keydown', e => {
    if (game.phase === 'idle') return;
    if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); engine.togglePause(); return; }
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault(); audio.init();
    keys[a] = true;
    if (!e.repeat) { if (a in presses) presses[a] = true; if (a === 'left' || a === 'right') dirTap(a); }
  });
  window.addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) keys[a] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; for (const k in touch) touch[k] = false; });

  function bindPad(root) {
    root.querySelectorAll('[data-hold]').forEach(b => {
      const k = b.dataset.hold;
      const on = e => { e.preventDefault(); audio.init(); touch[k] = true; b.classList.add('on'); if (k === 'left' || k === 'right') dirTap(k); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
      const off = () => { touch[k] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, off));
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
    root.querySelectorAll('[data-press]').forEach(b => {
      const k = b.dataset.press;
      b.addEventListener('pointerdown', e => { e.preventDefault(); audio.init(); presses[k] = true; b.classList.add('on'); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, () => b.classList.remove('on')));
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
  }
  function collectPlayerInput(p) {
    const inp = p.input;
    for (const k of ['left', 'right', 'block', 'charge']) inp[k] = !!(keys[k] || touch[k]);
    inp.jump = presses.jump || !!keys.jump || touch.jump;
    inp.attack = presses.attack; inp.special = presses.special; inp.ult = presses.ult; inp.dash = presses.dash;
  }
  function clearPresses() { presses.attack = presses.special = presses.ult = presses.jump = false; presses.dash = 0; }

  // ---------- camera ----------
  function updateCamera(snap) {
    const [a, b] = game.fighters;
    const mid = (a.x + b.x) / 2, dist = Math.abs(a.x - b.x);
    let z = clamp(780 / (dist + 280), 1, 1.3);
    if (game.cine) z = Math.min(1.4, z + 0.12);
    const half = W / 2 / z;
    const x = clamp(game.cine ? lerp(mid, game.cine.f.x, 0.4) : mid, half, WORLD - half);
    const k = snap ? 1 : 0.1;
    game.cam.z = lerp(game.cam.z, z, k);
    game.cam.x = lerp(game.cam.x, clamp(x, W / 2 / game.cam.z, WORLD - W / 2 / game.cam.z), k);
  }

  // ---------- step ----------
  function ambient() {
    if (game.frame % 9 !== 0) return;
    const x = game.cam.x + (Math.random() - 0.5) * W * 1.2;
    switch (game.stage) {
      case 'village': emit(x, -10, 1, { vx: -0.8, vy: 1.1, life: 420, r: 3, color: '#ff9a4a', kind: 'leaf', drag: 1 }); break;
      case 'soul': emit(x, 440, 1, { vy: -0.6, life: 260, r: 3, color: '#8fd8ff', drag: 1 }); break;
      case 'forest': emit(x, -10, 1, { vx: -0.4, vy: 0.9, life: 480, r: 3, color: '#d9a8ff', kind: 'petal', drag: 1 }); break;
      case 'rift': emit(x, 450, 1, { vy: -1.2, life: 200, r: 3, color: '#b58cff', drag: 1 }); break;
      case 'city': if (game.frame % 27 === 0) emit(x, 60 + Math.random() * 200, 1, { life: 60, r: 2, color: '#ff5fa2', drag: 1 }); break;
      default: if (game.frame % 27 === 0) emit(x, 350 + Math.random() * 60, 1, { life: 40, r: 2, color: '#ffffff', drag: 1 });
    }
  }

  function step() {
    game.frame++;
    const [p, c] = game.fighters;
    updateParticles();
    if (game.banner && ++game.banner.t > game.banner.dur) game.banner = null;
    if (game.shake > 0) { game.shake *= 0.88; if (game.shake < 0.3) game.shake = 0; }
    ambient();
    if ((game.phase === 'fight' || game.phase === 'intro') && game.frame % 8 === 0) {
      const s = audio.DRUM[game.drumStep++ % 16];
      if (s === 1) sfx('drum'); else if (s === 2) sfx('rim');
    }
    updateCamera(false);

    if (game.cine) {
      const cn = game.cine; cn.t++;
      if (cn.t % 2 === 0) emit(cn.f.x, cn.f.y - 50, 2, { jitter: 60, jitterY: 80, vy: -4, life: 30, r: 5, color: cn.type === 'awaken' ? cn.f.def.colors.awaken : cn.f.def.colors.aura, drag: 0.98 });
      if (cn.t >= cn.dur) { game.cine = null; if (cn.type === 'ult') executeUlt(cn.f); }
      return;
    }
    if (game.hitstop > 0) { game.hitstop--; return; }
    if (game.slowmo > 0) { game.slowmo--; if (game.slowmo % 2) return; }
    if (game.pendingAwaken.length) { startAwaken(game.pendingAwaken.shift()); return; }

    game.phaseT++;
    if (game.phase === 'intro') {
      if (game.phaseT === 1) { banner('Round ' + game.round, '#ffc23d', 50, game.stageName); if (game.round === 1) emitEvent('intro', null); }
      if (game.phaseT === 55) banner('Fight!', '#ff5b2e', 40);
      if (game.phaseT >= 70) { game.phase = 'fight'; game.phaseT = 0; }
    }

    if (game.phase === 'fight') {
      collectPlayerInput(p);
      if (game.opts.remote) game.opts.remote(c.input); else aiUpdate(c, p);
      if (--game.timer <= 0) timeUp();
    } else { p.input = blankInput(); c.input = blankInput(); }

    updateFighter(p, c);
    updateFighter(c, p);
    separate(p, c);
    updateProjectiles();
    updateHazards();
    for (const f of game.fighters) f.hpShow = f.hpShow > f.hp ? Math.max(f.hp, f.hpShow - 0.4) : f.hp;

    c.input.attack = c.input.special = c.input.ult = c.input.jump = false; c.input.dash = 0;
    clearPresses();

    if (game.phase === 'roundEnd') {
      if (game.phaseT === 60) for (const f of game.fighters) if (f.state !== 'ko' && f.hp > 0 && game.wins[game.fighters.indexOf(f)] > 0) { f.state = 'win'; f.t = 0; }
      if (game.phaseT === 150) advanceRound();
    }
  }

  function timeUp() {
    const [p, c] = game.fighters;
    const rp = p.hp / p.maxHp, rc = c.hp / c.maxHp;
    game.phase = 'roundEnd'; game.phaseT = 0;
    if (Math.abs(rp - rc) < 0.001) banner('Draw', '#c7cbe0', 110);
    else { game.wins[rp > rc ? 0 : 1]++; banner('Time!', '#ffc23d', 110); }
    emitEvent('round', { winner: Math.abs(rp - rc) < 0.001 ? -1 : rp > rc ? 0 : 1, timeout: true });
  }
  function advanceRound() {
    const [a, b] = game.wins;
    if (a >= 2 || b >= 2 || game.round >= 5) { endMatch(); return; }
    game.round++;
    resetRound();
  }
  function resetRound() {
    const [p, c] = game.fighters, o = game.opts;
    game.stats.maxCombo = Math.max(game.stats.maxCombo, p.maxCombo);
    game.fighters = [makeFighter(p.def, WORLD / 2 - 220, 1, false), makeFighter(c.def, WORLD / 2 + 220, -1, true, { hpMult: o.hpMult, corrupted: o.corrupted })];
    game.projectiles = []; game.hazards = []; game.pendingAwaken = []; game.bubbles = [];
    game.cine = null; game.banner = null; game.hitstop = 0; game.slowmo = 0;
    game.timer = 60 * 60; game.phase = 'intro'; game.phaseT = 0;
    updateCamera(true);
  }
  function endMatch() {
    game.phase = 'matchEnd';
    const [a, b] = game.wins;
    const [p] = game.fighters;
    game.stats.maxCombo = Math.max(game.stats.maxCombo, p.maxCombo);
    const result = { won: a > b, draw: a === b, wins: [a, b], rounds: game.round, player: game.fighters[0].def, rival: game.fighters[1].def, stats: { ...game.stats }, hpLeft: Math.round(100 * p.hp / p.maxHp) };
    emitEvent('end', result);
    if (game.opts.onEnd) game.opts.onEnd(result);
  }

  // ---------- render ----------
  let canvas = null, ctx = null, scale = 1;
  function resize() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    scale = canvas.width / W;
  }
  // Post-processing: a cheap bloom (downscaled, contrast-thresholded, blurred copy
  // added back on top) and a vignette. Bloom needs canvas filters; without them it is skipped.
  let bloom = null, vignette = null;
  function postFX() {
    if (!SL.settings.hq) return;
    if (!bloom) {
      const cv = document.createElement('canvas'); cv.width = 240; cv.height = 135;
      const bc = cv.getContext('2d'); bc.filter = 'brightness(0.95) contrast(3.2) saturate(1.3) blur(2.5px)';
      bloom = { cv, bc, ok: typeof bc.filter === 'string' && bc.filter !== 'none' };
    }
    if (bloom.ok) {
      bloom.bc.clearRect(0, 0, 240, 135);
      bloom.bc.drawImage(canvas, 0, 0, 240, 135);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bloom.cv, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    if (!vignette) {
      vignette = document.createElement('canvas'); vignette.width = W; vignette.height = H;
      const vc = vignette.getContext('2d'), gr = vc.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.72);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.42)');
      vc.fillStyle = gr; vc.fillRect(0, 0, W, H);
    }
    ctx.drawImage(vignette, 0, 0);
  }

  let canvas3d = null;
  const use3d = () => SL.settings.r3d && canvas3d && SL.render3d && SL.render3d.ok;
  function render() {
    R.ctx = ctx;
    const T = game.frame, cam = game.cam;
    if (canvas3d) canvas3d.style.visibility = use3d() ? 'visible' : 'hidden';
    if (use3d()) {
      const r = canvas.getBoundingClientRect();
      SL.render3d.render(game, Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
      const pj = SL.render3d.project;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      R.drawTexts(game.texts, pj);
      R.drawHUD(game, T);
      if (game.cine) R.drawCine(game, T, () => {}, pj);
      R.drawBubbles(game.bubbles, cam, pj);
      if (game.banner) R.drawBanner(game.banner);
      return;
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.save();
    if (game.shake > 0) ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
    R.drawStage(game.stage, cam, T);
    ctx.save();
    ctx.translate(W / 2, GROUND); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -GROUND);
    R.drawHazards(game.hazards.filter(h => h.kind !== 'beam'), T, game.fighters);
    const fs = [...game.fighters].sort((a, b) => (a.state === 'attack' || a.state === 'special' ? 1 : 0) - (b.state === 'attack' || b.state === 'special' ? 1 : 0));
    for (const f of fs) R.drawGhosts(f, T);
    for (const f of fs) R.drawFighter(f, T);
    R.drawHazards(game.hazards.filter(h => h.kind === 'beam'), T, game.fighters);
    R.drawProjectiles(game.projectiles, T);
    R.drawParticles(game.particles);
    R.drawTexts(game.texts);
    ctx.restore();
    ctx.restore();
    postFX();
    R.drawHUD(game, T);
    if (game.cine) R.drawCine(game, T, () => {
      ctx.save(); ctx.translate(W / 2, GROUND); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -GROUND);
      R.drawFighter(game.cine.f, T); ctx.restore();
    });
    R.drawBubbles(game.bubbles, cam);
    if (game.banner) R.drawBanner(game.banner);
  }

  let last = performance.now(), acc = 0, padHooks = null;
  const DT = 1000 / 60;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(100, now - last); last = now;
    if (game.phase === 'idle' || !canvas) return;
    if (game.view) {
      acc += dt; let n = 0;
      while (acc >= DT && n < 5) { viewStep(); acc -= DT; n++; }
      if (n === 5) acc = 0;
      if (padHooks) padHooks(game.fighters[game.opts.me || 0]);
      render();
      return;
    }
    if (!game.paused) {
      acc += dt; let n = 0;
      while (acc >= DT && n < 5) { step(); if (game.opts && game.opts.onFrame) game.opts.onFrame(); acc -= DT; n++; }
      if (n === 5) acc = 0;
      if (padHooks) padHooks(game.fighters[0]);
    }
    render();
  }
  requestAnimationFrame(loop);

  // ---------- online play: snapshots (host) and a render-only view (guest) ----------
  const r1 = v => Math.round(v * 10) / 10;
  function snapshot() {
    const idx = f => game.fighters.indexOf(f);
    return {
      f: game.frame, ph: game.phase, pt: game.phaseT, w: game.wins, rd: game.round, tm: game.timer, sh: r1(game.shake),
      fs: game.fighters.map(f => [r1(f.x), r1(f.y), f.facing, f.state, f.t, r1(f.hp), r1(f.hpShow), r1(f.energy), f.awakened ? 1 : 0, f.combo, f.comboT, f.step, f.air ? 1 : 0, Math.round(f.armLen), f.flash, f.invuln, r1(f.vx), Math.round(f.anim)]),
      pr: game.projectiles.slice(0, 8).map(p => [r1(p.x), r1(p.y), r1(p.vx), p.r, p.kind, p.color, p.t, p.big ? 1 : 0, p.pull ? 1 : 0, idx(p.owner)]),
      hz: game.hazards.slice(0, 6).map(h => [h.kind, r1(h.x || 0), h.t, h.warn, h.act, h.w || 0, h.color, idx(h.owner), idx(h.target), h.dir || 0]),
      cn: game.cine ? [game.cine.type, idx(game.cine.f), game.cine.t, game.cine.dur] : 0,
      bn: game.banner ? [game.banner.text, game.banner.color, game.banner.dur, game.banner.sub, game.banner.t] : 0,
      tx: game.texts.slice(-5).map(t => [Math.round(t.x), Math.round(t.y), String(t.text).slice(0, 24), t.color, t.size, t.life]),
    };
  }
  let lastSnap = null;
  function applySnapshot(s) {
    if (!s || !Array.isArray(s.fs) || s.fs.length !== 2) return;
    if (lastSnap && s.f <= lastSnap.f) return;
    const prev = lastSnap; lastSnap = s;
    const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const str = (v, d = '') => (typeof v === 'string' ? v.slice(0, 40) : d);
    game.phase = ['intro', 'fight', 'roundEnd', 'matchEnd'].includes(s.ph) ? s.ph : game.phase;
    game.phaseT = num(s.pt); game.round = num(s.rd, 1); game.timer = num(s.tm);
    game.wins = Array.isArray(s.w) ? [num(s.w[0]), num(s.w[1])] : game.wins;
    game.shake = Math.max(game.shake, num(s.sh));
    s.fs.forEach((a, i) => {
      const f = game.fighters[i]; if (!Array.isArray(a)) return;
      const hpBefore = f.hp, wasAwake = f.awakened;
      f.tx = num(a[0], f.x); f.ty = num(a[1], f.y);
      if (!prev || Math.abs(f.tx - f.x) > 200) { f.x = f.tx; f.y = f.ty; }
      f.facing = a[2] === -1 ? -1 : 1; f.state = str(a[3], 'idle'); f.t = num(a[4]);
      f.hp = num(a[5], f.hp); f.hpShow = num(a[6], f.hp); f.energy = num(a[7]); f.awakened = !!a[8];
      f.combo = num(a[9]); f.comboT = num(a[10]); f.step = num(a[11]); f.air = !!a[12]; f.armLen = num(a[13]);
      f.flash = num(a[14]); f.invuln = num(a[15]); f.vx = num(a[16]); f.anim = num(a[17]);
      f.move = f.air ? AIR : COMBO[Math.max(0, Math.min(2, f.step))];
      if (prev && f.hp < hpBefore - 0.5) {
        const heavy = hpBefore - f.hp >= 12;
        emit(f.x, f.y - 70, heavy ? 22 : 12, { spread: heavy ? 12 : 8, life: 18, r: 3, color: '#fff2b8', kind: 'spark' });
        sfx(heavy ? 'heavy' : 'hit');
      }
      if (prev && f.awakened && !wasAwake) { emit(f.x, f.y - 60, 50, { spread: 12, life: 40, r: 5, color: f.def.colors.awaken }); sfx('awaken'); emitEvent('awaken', f); }
    });
    const F = i => game.fighters[i] || game.fighters[0];
    game.projectiles = (Array.isArray(s.pr) ? s.pr : []).map(a => ({ x: num(a[0]), y: num(a[1]), vx: num(a[2], 1), r: Math.min(120, num(a[3], 10)), kind: str(a[4], 'orb'), color: str(a[5], '#ffffff'), t: num(a[6]), big: !!a[7], pull: !!a[8], owner: F(num(a[9])) }));
    game.hazards = (Array.isArray(s.hz) ? s.hz : []).map(a => ({ kind: str(a[0], 'pillar'), x: num(a[1]), t: num(a[2]), warn: num(a[3], 1), act: num(a[4], 1), w: num(a[5]), color: str(a[6], '#ffffff'), owner: F(num(a[7])), target: F(num(a[8])), dir: num(a[9]) }));
    game.cine = Array.isArray(s.cn) ? { type: str(s.cn[0], 'ult'), f: F(num(s.cn[1])), t: num(s.cn[2]), dur: num(s.cn[3], 80) } : null;
    const bn = Array.isArray(s.bn) ? s.bn : null;
    if (bn && (!game.banner || game.banner.text !== bn[0])) { game.banner = { text: str(bn[0]), color: str(bn[1], '#ffc23d'), dur: num(bn[2], 50), sub: str(bn[3]), t: num(bn[4]) }; if (bn[0] === 'K.O.!') sfx('ko'); }
    else if (!bn) game.banner = null;
    game.texts = (Array.isArray(s.tx) ? s.tx : []).map(a => ({ x: num(a[0]), y: num(a[1]), text: str(a[2]), color: str(a[3], '#ffffff'), size: Math.min(40, num(a[4], 24)), life: num(a[5], 20), max: 50 }));
  }
  function viewStep() {
    game.frame++;
    updateParticles();
    ambient();
    if (game.shake > 0) { game.shake *= 0.88; if (game.shake < 0.3) game.shake = 0; }
    for (const f of game.fighters) {
      if (f.tx != null) { f.x += (f.tx - f.x) * 0.45; f.y += (f.ty - f.y) * 0.45; }
      if (f.flash > 0) f.flash--;
      if ((f.awakened) && game.frame % 5 === 0 && f.state !== 'ko') emit(f.x, f.y - 30, 1, { jitter: 36, jitterY: 60, vy: -2, life: 26, r: 3, color: f.def.colors.awaken, drag: 0.98 });
    }
    if (game.phase === 'fight' && game.frame % 8 === 0) { const s = audio.DRUM[game.drumStep++ % 16]; if (s === 1) sfx('drum'); else if (s === 2) sfx('rim'); }
    updateCamera(false);
    if (game.opts.onFrame) game.opts.onFrame();
  }
  /** Read and consume this device's controls (used by the online guest). */
  function readInput() {
    const i = {};
    for (const k of ['left', 'right', 'block', 'charge']) i[k] = !!(keys[k] || touch[k]);
    i.jump = presses.jump || !!keys.jump || touch.jump;
    i.attack = presses.attack; i.special = presses.special; i.ult = presses.ult; i.dash = presses.dash;
    clearPresses();
    return i;
  }

  const engine = (SL.engine = {
    DIFF,
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    attach(cv, padRoot, onPadState) {
      canvas = cv; ctx = cv.getContext('2d');
      if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
      window.addEventListener('resize', resize);
      if (padRoot) bindPad(padRoot);
      padHooks = onPadState;
    },
    resize,
    /** opts: { p1, p2, diff, stage, stageName, hpMult, corrupted, labels, onEnd } */
    start(opts) {
      audio.init();
      game.opts = opts;
      game.diff = opts.diff || 'captain';
      game.stage = opts.stage; game.stageName = opts.stageName || '';
      game.labels = opts.labels || ['YOU', 'CPU'];
      game.fighters = [makeFighter(opts.p1, WORLD / 2 - 220, 1, false), makeFighter(opts.p2, WORLD / 2 + 220, -1, true, { hpMult: opts.hpMult, corrupted: opts.corrupted })];
      game.wins = [0, 0]; game.round = 1; game.particles = []; game.texts = [];
      game.stats = { maxCombo: 0, ults: 0, awakened: false };
      game.paused = false; game.view = false;
      resetRound();
      resize();
      last = performance.now(); acc = 0;
    },
    stop() { game.phase = 'idle'; game.paused = false; game.view = false; if (SL.render3d && SL.render3d.ok) SL.render3d.clear(); },
    togglePause(force) {
      if (game.phase === 'idle' || game.phase === 'matchEnd' || (game.opts && game.opts.online)) return;
      game.paused = typeof force === 'boolean' ? force : !game.paused;
      if (!game.paused) { last = performance.now(); acc = 0; }
      for (const k in keys) keys[k] = false;
      emitEvent('pause', game.paused);
    },
    say,
    snapshot, applySnapshot, readInput, blankInput,
    attach3d(cv) { canvas3d = cv; },
    /** Guest: render-only view driven by host snapshots. opts: { p1, p2, stage, stageName, labels, me, onFrame } */
    view(opts) {
      audio.init();
      game.opts = opts; game.view = true; lastSnap = null;
      game.stage = opts.stage; game.stageName = opts.stageName || ''; game.labels = opts.labels;
      game.fighters = [makeFighter(opts.p1, WORLD / 2 - 220, 1, false), makeFighter(opts.p2, WORLD / 2 + 220, -1, false)];
      game.wins = [0, 0]; game.round = 1; game.particles = []; game.texts = []; game.projectiles = []; game.hazards = []; game.bubbles = [];
      game.cine = null; game.banner = null; game.paused = false; game.phase = 'intro'; game.timer = 3600;
      game.stats = { maxCombo: 0, ults: 0, awakened: false };
      updateCamera(true); resize();
      last = performance.now(); acc = 0;
    },
    lines(def) { return LINES[def.id] || LINES.custom; },
  });

  engine.on('ult', f => { if (f === game.fighters[0]) game.stats.ults++; });
  engine.on('awaken', f => {
    if (f === game.fighters[0]) game.stats.awakened = true;
    const line = (f.customLine && f.customLine.awaken) || engine.lines(f.def).awaken;
    say(f, line, 130);
  });
})();
