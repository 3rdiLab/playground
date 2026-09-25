/* Shonen Legends: screens and flow — versus select, story, creator, ranks, arena overlays. */
(() => {
  'use strict';
  const SL = window.SL;
  const D = SL.data, R = SL.render, E = SL.engine, O = SL.online, A = SL.audio;
  const { ENERGY_COLOR, ENERGY_ORDER, ENERGY_STAGE, WORLDS, WORLD_ORDER, ROSTER, STORY } = D;
  const $ = id => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null) n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };

  const ui = {
    view: 'versus', slot: 'p1', p1: 'kaito', p2: 'random', focus: 'kaito', filter: 'all',
    diff: O.local.get('diff', 'captain'), gallery: [], lastMatch: null,
  };
  if (!E.DIFF[ui.diff]) ui.diff = 'captain';
  A.muted = O.local.get('muted', false);

  // ---------- helpers ----------
  let toastTimer = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600); }
  const bossUnlocked = () => O.save.story.cleared >= STORY.length;
  const customs = () => O.save.custom;
  function allFighters() {
    const base = ROSTER.filter(d => !d.boss || bossUnlocked());
    return [...base, ...customs(), ...ui.gallery];
  }
  function findDef(id) {
    return ROSTER.find(d => d.id === id) || customs().find(d => d.id === id) || ui.gallery.find(d => d.id === id) || null;
  }
  const worldName = d => (d.custom ? (d.gallery ? 'Community fighter' : 'Your creation') : WORLDS[d.world].name);
  const stageOf = d => (d.custom ? ENERGY_STAGE[d.energy] : WORLDS[d.world].stage);
  const stageNameOf = d => (d.custom ? Object.values(WORLDS).find(w => w.stage === ENERGY_STAGE[d.energy]).stageName : WORLDS[d.world].stageName);
  const energyPill = d => el('span', { class: 'pill', style: `color:${ENERGY_COLOR[d.energy]}`, text: d.energy });
  const portraitCache = new Map();
  function paint(canvas, def, opts = {}) {
    const size = opts.size || 160;
    const key = `${def.id}|${size}|${opts.awakened ? 1 : 0}|${opts.corrupted ? 1 : 0}|${opts.facing || 1}|${def.custom ? JSON.stringify(def) : ''}`;
    let src = portraitCache.get(key);
    if (!src) {
      src = document.createElement('canvas');
      R.portrait(src, def, { size, awakened: opts.awakened, corrupted: opts.corrupted, facing: opts.facing, T: 30 });
      if (portraitCache.size > 200) portraitCache.clear();
      portraitCache.set(key, src);
    }
    canvas.width = size; canvas.height = size;
    canvas.getContext('2d').drawImage(src, 0, 0);
  }

  // ---------- views ----------
  function showView(name) {
    ui.view = name;
    for (const v of ['versus', 'online', 'story', 'create', 'awards', 'ranks', 'arena']) $('view-' + v).hidden = v !== name;
    document.querySelectorAll('.tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === name)));
    $('app').classList.toggle('in-arena', name === 'arena');
    if (name === 'versus') renderVersus();
    if (name === 'story') renderStory();
    if (name === 'create') renderCreator();
    if (name === 'ranks') renderRanks();
    if (name === 'awards') renderAwards();
    if (name === 'online') renderOnline();
    if (name !== 'arena') { E.stop(); crLoop(name === 'create'); $('btnPause').disabled = false; $('btnPause').title = ''; }
  }
  document.querySelectorAll('.tabs [role=tab]').forEach(b => b.addEventListener('click', () => {
    if (ui.view === 'arena' && !confirmLeave()) return;
    A.init(); A.play('select'); showView(b.dataset.view);
  }));
  function confirmLeave() { return true; }

  // ================= AWARDS =================
  const ICONS = {
    fist: 'M7 10V6a2 2 0 0 1 4 0v3m0-1V5a2 2 0 0 1 4 0v4m0-2a2 2 0 0 1 4 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-3a2 2 0 0 1 4 0',
    crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
    flame: 'M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 0 3 1 4 3 5 0-4-1-6 0-9z',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
    shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
    heart: 'M12 20s-8-5-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11z',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    wheel: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3v12M6.8 9l10.4 6M6.8 15l10.4-6',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l4 2',
    mirror: 'M8 3h8v18H8zM12 3v18',
    book: 'M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    void: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
    brush: 'M18 3l3 3-9 9-3-3zM8 13l3 3c0 3-3 5-7 5 1-2 1-3 1-4a3 3 0 0 1 3-4z',
    share: 'M18 8a3 3 0 1 0-2.8-4M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm12 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 10.5l6.8-4M8.6 13.5l6.8 4',
    chat: 'M4 5h16v10H9l-5 4z',
  };
  function badge(def, done) {
    const t = SL.ach.TIERS[def.tier], ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', ICONS[def.icon] || ICONS.star); svg.append(p);
    const b = el('span', { class: 'badge' + (done ? '' : ' off'), style: `--ta:${t.a};--tb:${t.b}` }); b.append(svg);
    return b;
  }
  let awardFilter = 'all';
  function renderAwards() {
    const L = SL.ach.LIST, done = L.filter(a => SL.ach.unlockedAt(a.id));
    const maxPts = L.reduce((t, a) => t + SL.ach.TIERS[a.tier].pts, 0);
    $('awardsSummary').innerHTML = '';
    $('awardsSummary').append(
      el('div', { class: 'aw-big' }, el('b', { text: `${done.length}/${L.length}` }), el('span', { text: 'Unlocked' })),
      el('div', { class: 'aw-big' }, el('b', { text: String(SL.ach.points()) }), el('span', { text: `of ${maxPts} points` })),
      el('div', { class: 'aw-bar' }, el('i', { style: `width:${Math.round(100 * done.length / L.length)}%` })));
    const seg = $('awardsFilter'); seg.innerHTML = '';
    for (const [k, label] of [['all', 'All'], ['done', 'Unlocked'], ['todo', 'Locked']]) seg.append(el('button', { type: 'button', 'aria-pressed': String(awardFilter === k), text: label, onclick: () => { awardFilter = k; renderAwards(); } }));
    const box = $('awardsList'); box.innerHTML = '';
    const cats = [...new Set(L.map(a => a.cat))];
    for (const cat of cats) {
      const items = L.filter(a => a.cat === cat).filter(a => { const u = !!SL.ach.unlockedAt(a.id); return awardFilter === 'all' || (awardFilter === 'done' ? u : !u); });
      if (!items.length) continue;
      const grid = el('div', { class: 'aw-grid' });
      for (const a of items) {
        const pr = SL.ach.progress(a), at = SL.ach.unlockedAt(a.id), hidden = a.secret && !at;
        const pct = Math.round(100 * pr.value / (pr.goal || 1));
        grid.append(el('div', { class: 'aw' + (at ? ' done' : '') },
          badge(a, !!at),
          el('div', { class: 'aw-body' },
            el('p', { class: 'aw-name', text: hidden ? 'Secret achievement' : a.name }),
            el('p', { class: 'aw-desc', text: hidden ? 'Keep playing to discover it.' : a.desc }),
            el('p', { class: 'aw-meta' }, el('span', { class: 'pill', style: `color:${SL.ach.TIERS[a.tier].a}`, text: `${SL.ach.TIERS[a.tier].label} · ${SL.ach.TIERS[a.tier].pts}` }),
              el('span', { text: at ? `Unlocked ${new Date(at).toLocaleDateString()}` : pr.goal > 1 ? `${pr.value}/${pr.goal}` : 'Locked' })),
            !at && pr.goal > 1 ? el('span', { class: 'aw-prog' }, el('i', { style: `width:${pct}%` })) : null)));
      }
      box.append(el('h3', { class: 'aw-cat', text: cat }), grid);
    }
  }
  // unlock pop-up, shown anywhere in the app
  const achQueue = [];
  let achShowing = false;
  function nextAch() {
    if (achShowing || !achQueue.length) return;
    achShowing = true;
    const def = achQueue.shift(), t = $('achToast');
    t.innerHTML = '';
    t.append(badge(def, true), el('div', {}, el('p', { class: 'eyebrow', text: `Achievement unlocked · +${SL.ach.TIERS[def.tier].pts}` }), el('p', { class: 'at-name', text: def.name })));
    t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    A.play('achieve');
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; achShowing = false; nextAch(); }, 350); }, 3000);
  }
  SL.ach.onUnlock(def => { achQueue.push(def); nextAch(); if (ui.view === 'awards') renderAwards(); });

  // ---------- header toggles ----------
  function refreshToggles() {
    $('btnSound').textContent = A.muted ? 'Sound: Off' : 'Sound: On';
    $('btnGfx').textContent = SL.settings.hq ? 'Graphics: High' : 'Graphics: Low';
    const has3d = !!(SL.render3d && SL.render3d.ok);
    $('btnView').textContent = has3d ? (SL.settings.r3d ? 'View: 3D' : 'View: 2D') : 'View: 2D';
    $('btnView').title = has3d ? 'Switch between the 3D and 2D renderers' : '3D is loading or not supported in this browser';
    const live = O.banterMode === 'live';
    $('btnBanter').textContent = live ? 'Rival AI: Live' : 'Rival AI: Classic';
    $('btnBanter').title = live ? 'Rivals write fresh trash talk with Claude (uses your Claude usage). Click for classic lines.' : 'Rivals use built-in lines. Click to let Claude write live trash talk.';
  }
  SL.settings.hq = O.local.get('hq', true);
  SL.settings.r3d = O.local.get('r3d', true);
  $('btnView').addEventListener('click', () => {
    if (!(SL.render3d && SL.render3d.ok)) { toast('3D needs WebGL, which is not available in this browser. Using 2D.'); return; }
    SL.settings.r3d = !SL.settings.r3d; O.local.set('r3d', SL.settings.r3d); refreshToggles();
  });
  const boot3d = () => {
    if (!SL.render3d || SL.render3d.ok) return;
    const cv = $('game3d');
    if (SL.render3d.init(cv)) E.attach3d(cv);
    refreshToggles();
  };
  window.addEventListener('sl-3d-ready', boot3d);
  if (SL.render3d) boot3d();
  $('btnGfx').addEventListener('click', () => { SL.settings.hq = !SL.settings.hq; O.local.set('hq', SL.settings.hq); refreshToggles(); });
  $('btnSound').addEventListener('click', () => { A.muted = !A.muted; O.local.set('muted', A.muted); A.init(); refreshToggles(); });
  $('btnBanter').addEventListener('click', () => { O.setBanter(O.banterMode === 'live' ? 'classic' : 'live'); refreshToggles(); toast(O.banterMode === 'live' ? 'Rivals will write live trash talk when available.' : 'Rivals will use classic lines.'); });

  // ================= VERSUS =================
  const FILTERS = [['all', 'All'], ...WORLD_ORDER.map(w => [w, WORLDS[w].name]), ['custom', 'Your fighters'], ['gallery', 'Community']];
  function renderFilters() {
    const box = $('filters'); box.innerHTML = '';
    for (const [k, label] of FILTERS) {
      box.append(el('button', { type: 'button', 'aria-pressed': String(ui.filter === k), text: label, onclick: () => { ui.filter = k; renderFilters(); renderGrid(); } }));
    }
  }
  function filtered() {
    const f = ui.filter;
    if (f === 'all') return allFighters();
    if (f === 'custom') return customs();
    if (f === 'gallery') return ui.gallery;
    return ROSTER.filter(d => d.world === f);
  }
  function renderGrid() {
    const grid = $('grid'); grid.innerHTML = '';
    const list = filtered();
    for (const d of list) {
      const c = el('canvas', { 'aria-hidden': 'true' });
      const card = el('button', { type: 'button', class: 'fcard' + (ui.p1 === d.id ? ' is-p1' : '') + (ui.p2 === d.id ? ' is-p2' : ''), 'aria-label': d.name, onclick: () => pickFighter(d) },
        c, ui.p1 === d.id ? el('span', { class: 'tag p1', text: '1P' }) : null, ui.p2 === d.id ? el('span', { class: 'tag p2', text: 'CPU' }) : null,
        el('span', { class: 'fname', text: d.short }), el('span', { class: 'fsub', text: `${d.energy} · ${d.custom ? worldName(d) : WORLDS[d.world].name}` }));
      grid.append(card);
      paint(c, d, { size: 160 });
    }
    if (ui.filter === 'all' && !bossUnlocked()) {
      const c = el('canvas', { 'aria-hidden': 'true' });
      grid.append(el('button', { type: 'button', class: 'fcard locked', 'aria-label': 'Locked fighter', onclick: () => toast('Clear all 7 story chapters to unlock this fighter.') }, c, el('span', { class: 'fname', text: '???' }), el('span', { class: 'fsub', text: 'Clear Story mode' })));
      paint(c, ROSTER.find(d => d.boss), { size: 160 });
    }
    if (!list.length) grid.append(el('p', { class: 'empty', text: ui.filter === 'custom' ? 'No fighters yet. Build one in the Create tab.' : ui.filter === 'gallery' ? (O.db ? 'Nobody has shared a fighter yet. Be the first from the Create tab.' : 'The community gallery works when this game is opened on claude.ai.') : 'No fighters here.' }));
  }
  function pickFighter(d) {
    A.init(); A.play('select');
    if (ui.slot === 'p1') {
      ui.p1 = d.id; ui.focus = d.id;
      if (!ui.pickedOnce) { ui.pickedOnce = true; ui.slot = 'p2'; $('slotHint').textContent = 'Now pick your rival, or leave it on Random and press Fight.'; }
    } else { ui.p2 = d.id; ui.focus = d.id; }
    renderVersus();
  }
  function renderSlots() {
    for (const [key, id] of [['p1', 'slotP1'], ['p2', 'slotP2']]) {
      const b = $(id), d = key === 'p1' ? findDef(ui.p1) : (ui.p2 === 'random' ? null : findDef(ui.p2));
      b.setAttribute('aria-pressed', String(ui.slot === key));
      const c = b.querySelector('canvas');
      if (d) { paint(c, d, { size: 192, facing: key === 'p1' ? 1 : -1 }); b.querySelector('.slot-name').textContent = d.name; b.querySelector('.slot-meta').textContent = `${d.energy} · ${worldName(d)}`; }
      else {
        c.width = 192; c.height = 192; const g = c.getContext('2d'); g.fillStyle = '#10142a'; g.fillRect(0, 0, 192, 192);
        g.font = '110px Bangers, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ff4f6d'; g.fillText('?', 96, 104);
        b.querySelector('.slot-name').textContent = 'Random'; b.querySelector('.slot-meta').textContent = 'A surprise opponent';
      }
    }
  }
  function statRow(label, value, min, max, shown) {
    const pct = Math.round(100 * (value - min) / (max - min));
    return el('div', { class: 'stat' }, el('span', { text: label }), el('span', { class: 'bar' }, el('i', { style: `width:${Math.max(6, Math.min(100, pct))}%` })), el('span', { text: shown }));
  }
  function renderDetail() {
    const base = findDef(ui.focus) || findDef(ui.p1);
    const box = $('detail'); box.innerHTML = '';
    if (!base) return;
    const d = O.effective(base);
    const beats = ENERGY_ORDER.filter(e => D.overpowers(d.energy, e));
    const add = (...kids) => box.append(...kids.filter(k => k != null));
    const weak = ENERGY_ORDER.filter(e => D.overpowers(e, d.energy));
    add(
      el('div', {}, el('p', { class: 'eyebrow', text: worldName(d) }), el('h3', { text: d.name })),
      el('div', { class: 'matchup' }, energyPill(d), d.gallery ? el('span', { class: 'pill', style: 'color:#9aa2c6', text: 'Community' }) : null),
      d.quote ? el('p', { class: 'quote', text: `“${d.quote}”` }) : null,
      el('dl', { class: 'moves' },
        el('dt', { text: 'Special' }), el('dd', { text: d.special.name }),
        el('dt', { text: 'Ultimate' }), el('dd', { text: d.ult.name }),
        el('dt', { text: 'Awakens' }), el('dd', { text: d.awaken })),
      el('div', { class: 'stats' },
        statRow('Health', d.hp, 85, 155, String(d.hp)),
        statRow('Speed', d.speed, 0.9, 1.3, d.speed.toFixed(2)),
        statRow('Power', d.power || 1, 0.92, 1.24, (d.power || 1).toFixed(2))),
      base.custom && base.up && (base.up.hp || base.up.speed || base.up.power) ? el('p', { class: 'note', text: `Includes upgrades: Health +${base.up.hp}, Speed +${base.up.speed}, Power +${base.up.power}.` }) : null,
      d.energy === 'Void' ? el('p', { class: 'note', text: 'Void energy has no weakness and no advantage.' }) :
      el('div', { class: 'matchup' }, el('span', { text: 'Strong vs' }), ...beats.map(e => el('span', { class: 'pill', style: `color:${ENERGY_COLOR[e]}`, text: e })), el('span', { text: '· Weak vs' }), ...weak.map(e => el('span', { class: 'pill', style: `color:${ENERGY_COLOR[e]}`, text: e }))),
    );
  }
  function renderDiff() {
    const box = $('diffSeg'); box.innerHTML = '';
    for (const [k, v] of Object.entries(E.DIFF)) box.append(el('button', { type: 'button', 'aria-pressed': String(ui.diff === k), text: v.label, onclick: () => { ui.diff = k; O.local.set('diff', k); renderDiff(); } }));
  }
  function renderAiLevel() {
    const ai = O.save.ai, b = O.aiBonus();
    $('aiLevel').textContent = ai.level ? `Rival AI level ${ai.level}: Health +${b.hp}, Speed +${b.speed}, Power +${b.power}` : 'Rival AI level 0. It gains a level every time it loses.';
  }
  function renderVersus() {
    renderAiLevel();
    if (SL.net) SL.net.setMyFighter(() => findDef(ui.p1) || ROSTER[0]);
    if (!findDef(ui.p1)) ui.p1 = 'kaito';
    if (ui.p2 !== 'random' && !findDef(ui.p2)) ui.p2 = 'random';
    renderSlots(); renderFilters(); renderGrid(); renderDetail(); renderDiff();
  }
  $('slotP1').addEventListener('click', () => { ui.slot = 'p1'; ui.focus = ui.p1; $('slotHint').textContent = 'Picking your fighter.'; renderVersus(); });
  $('slotP2').addEventListener('click', () => { ui.slot = 'p2'; if (ui.p2 !== 'random') ui.focus = ui.p2; $('slotHint').textContent = 'Picking your rival.'; renderVersus(); });
  $('btnRandomRival').addEventListener('click', () => { ui.p2 = 'random'; A.play('select'); renderVersus(); });
  $('btnFight').addEventListener('click', () => {
    const p1 = findDef(ui.p1);
    let p2 = ui.p2 === 'random' ? null : findDef(ui.p2);
    if (!p2) { const pool = allFighters().filter(d => d.id !== p1.id && !d.gallery); p2 = pool[Math.floor(Math.random() * pool.length)]; }
    startFight({ mode: 'versus', p1, p2, diff: ui.diff });
  });

  function drawWheel() {
    const c = $('wheel'), g = c.getContext('2d'), cx = 240, cy = 240, r = 170;
    g.clearRect(0, 0, 480, 480);
    const pos = ENERGY_ORDER.map((e, i) => { const a = -Math.PI / 2 + i * Math.PI / 3; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
    g.lineWidth = 3;
    ENERGY_ORDER.forEach((e, i) => {
      for (const k of [1, 2]) {
        const [x1, y1] = pos[i], [x2, y2] = pos[(i + k) % 6];
        const a = Math.atan2(y2 - y1, x2 - x1), sx = x1 + Math.cos(a) * 46, sy = y1 + Math.sin(a) * 46, ex = x2 - Math.cos(a) * 50, ey = y2 - Math.sin(a) * 50;
        g.strokeStyle = SL.util.hexA(ENERGY_COLOR[e], k === 1 ? 0.8 : 0.35);
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
        g.fillStyle = g.strokeStyle; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(a - 0.4) * 14, ey - Math.sin(a - 0.4) * 14); g.lineTo(ex - Math.cos(a + 0.4) * 14, ey - Math.sin(a + 0.4) * 14); g.closePath(); g.fill();
      }
    });
    ENERGY_ORDER.forEach((e, i) => {
      const [x, y] = pos[i];
      g.fillStyle = '#10142a'; g.beginPath(); g.arc(x, y, 42, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ENERGY_COLOR[e]; g.lineWidth = 3; g.stroke();
      g.fillStyle = ENERGY_COLOR[e]; g.font = '700 21px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, x, y);
    });
  }

  // ================= ARENA =================
  const overlay = $('overlay');
  let fight = null; // { mode, p1, p2, lines, liveLines, onWin, onLose, retry }
  E.attach($('game'), $('padRoot'), p => {
    if (!p) return;
    $('padSpecial').classList.toggle('ready', p.energy >= 25);
    $('padUlt').classList.toggle('ready', p.energy >= 100);
  });

  function startFight(cfg) {
    A.init(); A.play('confirm');
    const p1 = O.effective(cfg.p1), p2 = O.effective(cfg.p2, true);
    cfg = { ...cfg, base1: cfg.base1 || cfg.p1, base2: cfg.base2 || cfg.p2 };
    SL.ach.beginMatch();
    fight = { ...cfg, p1: cfg.base1, p2: cfg.base2, lines: O.classicLines(p2), live: null, token: Math.random() };
    const token = fight.token;
    showView('arena');
    $('arenaStage').textContent = cfg.stageName || stageNameOf(p2);
    // Ask Claude for fresh rival lines while the VS splash plays.
    if (O.canBanter()) {
      const context = cfg.mode === 'story' ? `Story chapter "${cfg.chapterTitle}". ${p2.boss ? 'The rival is the final boss who wants to swallow all six worlds.' : "The rival is under the Void Emperor's mind control and does not want to be freed."}` : 'An exhibition match.';
      O.matchLines(p1, p2, context).then(l => { if (!fight || fight.token !== token || !l) return; fight.live = l; SL.ach.bump('banterHeard'); if (SL.game.phase === 'fight' && SL.game.phaseT < 300 && l.intro) E.say(SL.game.fighters[1], l.intro); });
    }
    vsSplash(p1, p2, () => {
      if (!fight || fight.token !== token) return;
      overlay.hidden = true;
      E.start({
        p1, p2, diff: cfg.diff, stage: cfg.stage || stageOf(p2), stageName: cfg.stageName || stageNameOf(p2),
        hpMult: cfg.hpMult || 1, corrupted: !!cfg.corrupted, labels: ['YOU', cfg.mode === 'story' ? 'RIVAL' : 'CPU'],
        onEnd: result => setTimeout(() => { if (fight && fight.token === token) showResult(result); }, 1100),
      });
    });
  }
  function vsSplash(p1, p2, done) {
    overlay.innerHTML = '';
    const l = el('canvas'), r = el('canvas');
    overlay.append(el('div', { class: 'vs-splash' },
      el('div', { class: 'side l' }, l, el('span', { class: 'wl', text: `${p1.energy} · ${worldName(p1)}` }), el('span', { class: 'nm', text: p1.name })),
      el('div', { class: 'side r' }, r, el('span', { class: 'wl', text: `${p2.energy} · ${worldName(p2)}${O.save.ai.level ? ` · Rival AI Lv ${O.save.ai.level}` : ''}` }), el('span', { class: 'nm', text: p2.name })),
      el('div', { class: 'vs', text: 'VS' })));
    paint(l, p1, { size: 320 }); paint(r, p2, { size: 320, facing: -1, corrupted: fight && fight.corrupted });
    overlay.hidden = false;
    let fired = false;
    const go = () => { if (fired) return; fired = true; done(); };
    overlay.onclick = go;
    setTimeout(go, 2300);
  }
  E.on('intro', () => {
    if (!fight) return;
    const f = SL.game.fighters[1];
    E.say(f, (fight.live && fight.live.intro) || fight.lines.intro);
  });
  E.on('awaken', f => {
    if (!fight || f !== SL.game.fighters[1]) return;
    if (fight.live && fight.live.awaken) setTimeout(() => E.say(f, fight.live.awaken, 150), 0);
  });

  const STAT_LABEL = { hp: 'Health', speed: 'Speed', power: 'Power' };
  function recordResult(result) {
    const s = O.save.stats;
    if (result.won) { s.wins++; s.streak++; s.best = Math.max(s.best, s.streak); }
    else if (!result.draw) { s.losses++; s.streak = 0; }
    const id = result.player.id;
    s.main[id] = (s.main[id] || 0) + 1;
    const keys = Object.keys(s.main);
    if (keys.length > 40) delete s.main[keys.sort((a, b) => s.main[a] - s.main[b])[0]];
  }

  function showResult(result) {
    const mode = fight.mode, rival = result.rival;
    recordResult(result);
    const storyAdvance = mode === 'story' && result.won && fight.onWin;
    const notes = [];
    if (result.won) {
      const k = O.aiLevelUp();
      notes.push(`The rival AI learned from this loss: now level ${O.save.ai.level}${k ? ` (+1 ${STAT_LABEL[k]})` : ' (all stats maxed)'}.`);
      const base = fight.p1;
      if (base.custom && !base.gallery) {
        const gained = O.recordCustomWin(base.id);
        const d = customs().find(f => f.id === base.id);
        if (gained > 0) notes.push(`${base.short} earned a skill point! Spend it in the Create tab.`);
        else if (d) notes.push(`${base.short}: ${d.wins % O.WINS_PER_POINT}/${O.WINS_PER_POINT} wins toward the next skill point.`);
      }
    }
    O.persist();
    SL.ach.onMatch(result, { diff: fight.diff, rival: fight.p2, mode });
    O.submitScore();
    const unlocked = SL.ach.matchUnlocks();
    const title = result.draw ? 'Draw' : result.won ? 'Victory' : 'Defeat';
    const classic = result.won ? fight.lines.lose : fight.lines.win;
    const live = fight.live ? (result.won ? fight.live.lose : fight.live.win) : '';
    const quote = el('p', { class: 'ov-quote' }, el('b', { text: rival.short }), document.createTextNode(live || classic));
    const s = result.stats;
    overlay.innerHTML = '';
    const actions = el('div', { class: 'ov-actions' });
    if (mode === 'story') {
      if (result.won) actions.append(el('button', { class: 'btn primary', type: 'button', text: 'Continue', onclick: () => fight.onWin() }));
      else actions.append(
        el('button', { class: 'btn primary', type: 'button', text: 'Retry chapter', onclick: () => fight.retry() }),
        el('button', { class: 'btn', type: 'button', text: 'Back to story', onclick: () => showView('story') }));
    } else {
      actions.append(
        el('button', { class: 'btn primary', type: 'button', text: 'Rematch', onclick: () => startFight({ ...fight }) }),
        el('button', { class: 'btn', type: 'button', text: 'Change fighters', onclick: () => showView('versus') }));
    }
    overlay.append(el('div', { class: 'ov-card' },
      el('p', { class: 'eyebrow', text: `${mode === 'story' ? 'Chapter' : 'Match'} over · ${result.wins[0]}–${result.wins[1]}` }),
      el('h2', { class: 'ov-title ' + (result.won ? 'win' : 'lose'), text: title }),
      el('p', { class: 'ov-sub', text: `Best combo ${s.maxCombo} · Ultimates ${s.ults} · Win streak ${O.save.stats.streak} (best ${O.save.stats.best})` }),
      quote,
      notes.length ? el('p', { class: 'ov-note', text: notes.join(' ') }) : null,
      unlocked.length ? el('p', { class: 'ov-note ach', text: `Achievements unlocked: ${unlocked.map(a => a.name).join(', ')}` }) : null,
      actions));
    overlay.onclick = null;
    overlay.hidden = false;
    if (O.canBanter()) {
      const token = fight.token;
      quote.lastChild.textContent = (live || classic);
      O.postMatch(result).then(line => { if (line && fight && fight.token === token) quote.lastChild.textContent = line; });
    }
    if (storyAdvance) { /* chapter progress saved when Continue plays the outro */ }
  }

  E.on('pause', paused => {
    $('btnPause').textContent = paused ? 'Resume' : 'Pause';
    if (paused) {
      overlay.innerHTML = '';
      overlay.append(el('div', { class: 'ov-card' },
        el('p', { class: 'eyebrow', text: `Round ${SL.game.round} · ${SL.game.wins[0]}–${SL.game.wins[1]}` }),
        el('h2', { class: 'ov-title win', text: 'Paused' }),
        el('div', { class: 'ov-actions' },
          el('button', { class: 'btn primary', type: 'button', text: 'Resume', onclick: () => E.togglePause(false) }),
          el('button', { class: 'btn', type: 'button', text: 'Quit match', onclick: quitFight }))));
      overlay.onclick = null; overlay.hidden = false;
    } else overlay.hidden = true;
  });
  function quitFight() {
    if (SL.net.match) { SL.net.leave(); fight = null; E.stop(); overlay.hidden = true; showView('online'); return; }
    const back = fight && fight.mode === 'story' ? 'story' : 'versus';
    fight = null; E.stop(); overlay.hidden = true; $('btnPause').textContent = 'Pause';
    showView(back);
  }
  $('btnPause').addEventListener('click', () => E.togglePause());
  $('btnQuit').addEventListener('click', quitFight);
  document.addEventListener('visibilitychange', () => { if (document.hidden && ui.view === 'arena' && (SL.game.phase === 'fight' || SL.game.phase === 'intro') && !SL.game.paused) E.togglePause(true); });

  // ================= ONLINE =================
  const NET = SL.net;
  NET.setMyFighter(() => findDef(ui.p1) || ROSTER[0]);
  const nameCache = {};
  async function nameOf(by) {
    if (!by) return 'A player';
    if (nameCache[by]) return nameCache[by];
    const ps = await O.profiles([by]);
    return (nameCache[by] = (ps[by] && ps[by].name) || 'A player');
  }
  async function renderOnline() {
    const me = findDef(ui.p1) || ROSTER[0];
    const box = $('onMe'); box.innerHTML = '';
    const c = el('canvas', { 'aria-hidden': 'true' });
    box.append(c, el('div', {}, el('b', { text: me.name }), energyPill(me)));
    paint(c, me, { size: 144 });
    const status = $('onStatus'), list = $('onList');
    list.innerHTML = '';
    if (NET.status !== 'online') {
      status.textContent = NET.status === 'connecting' ? 'Connecting…' : 'Online play works when this game is opened on claude.ai by people in your organization.';
      list.append(el('p', { class: 'empty', text: 'Nobody to show yet.' }));
      return;
    }
    status.textContent = NET.pendingOut ? 'Challenge sent. Waiting for an answer…' : NET.connected === false ? 'Reconnecting…' : 'You are visible to other players.';
    const peers = NET.peers();
    if (!peers.length) { list.append(el('p', { class: 'empty', text: 'Nobody else has the game open right now. Share the link with a friend and challenge them here.' })); return; }
    for (const p of peers) {
      const lb = p.presence.lobby, busy = lb.st !== 'open';
      const row = el('div', { class: 'on-row' });
      const img = el('img', { alt: '', hidden: '' });
      const nm = el('span', { class: 'nm', text: p.isMe ? 'You (another tab)' : '…' });
      const act = p.isMe ? el('span', { class: 'note', text: 'Your other tab' }) :
        NET.pendingOut && NET.pendingOut.to === p.peer ? el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => { NET.cancelChallenge(); renderOnline(); } }) :
        el('button', { class: 'btn primary', type: 'button', text: busy ? 'In a match' : 'Challenge', disabled: busy || NET.pendingOut || NET.match ? '' : null, onclick: () => { A.init(); if (NET.challenge(p.peer)) { A.play('confirm'); renderOnline(); } } });
      row.append(img, el('div', {}, nm, el('div', { class: 'sub' }, el('span', { class: 'dot' + (busy ? ' busy' : '') }), document.createTextNode(`${String(lb.f || 'Unknown fighter').slice(0, 30)} · ${busy ? 'busy' : 'ready'}`))), act);
      list.append(row);
      if (!p.isMe) nameOf(p.by).then(n => { nm.textContent = n; });
      if (p.by && O.user) O.profiles([p.by]).then(ps => { if (ps[p.by] && ps[p.by].avatarUrl) { img.src = ps[p.by].avatarUrl; img.hidden = false; } });
    }
  }
  $('onChange').addEventListener('click', () => { ui.slot = 'p1'; showView('versus'); });
  let onlineRenderQueued = false;
  NET.onChange = () => { if (ui.view === 'online' && !onlineRenderQueued) { onlineRenderQueued = true; requestAnimationFrame(() => { onlineRenderQueued = false; renderOnline(); }); } };
  NET.onNotice = msg => { toast(msg); NET.onChange(); };
  NET.onInvite = async inv => {
    const box = $('invite');
    if (!inv) { box.hidden = true; return; }
    const name = await nameOf(inv.by);
    if (NET.pendingIn !== inv) return;
    box.innerHTML = '';
    box.append(el('p', { class: 'eyebrow', text: 'Incoming challenge' }), el('h2', { class: 'title', text: `${name} wants to fight` }),
      el('p', { class: 'note', text: `They are playing ${inv.def.name}. You will fight as ${(findDef(ui.p1) || ROSTER[0]).name}.` }),
      el('div', { class: 'ov-actions', style: 'justify-content:flex-start' },
        el('button', { class: 'btn primary', type: 'button', text: 'Accept', onclick: () => { A.init(); box.hidden = true; NET.accept(); } }),
        el('button', { class: 'btn', type: 'button', text: 'Decline', onclick: () => { box.hidden = true; NET.decline(); } })));
    box.hidden = false; A.init(); A.play('achieve');
  };
  NET.onStart = m => {
    $('invite').hidden = true;
    fight = { mode: 'online', token: Math.random() };
    overlay.hidden = true;
    showView('arena');
    $('btnPause').disabled = true; $('btnPause').title = 'Online matches cannot be paused';
    $('arenaStage').textContent = 'Online match';
    nameOf(m.oppBy).then(n => { $('arenaStage').textContent = `Online vs ${n}`; });
  };
  NET.onEnd = async r => {
    if (ui.view !== 'arena') return;
    if (r.aborted) { toast(r.reason); fight = null; E.stop(); overlay.hidden = true; showView('online'); return; }
    const s = O.save.stats;
    if (r.won) { s.wins++; s.streak++; s.best = Math.max(s.best, s.streak); SL.ach.bump('onlineWins'); }
    else if (!r.draw) { s.losses++; s.streak = 0; }
    O.persist(); SL.ach.flush(); O.submitScore();
    const name = await nameOf(r.oppBy);
    overlay.innerHTML = '';
    overlay.append(el('div', { class: 'ov-card' },
      el('p', { class: 'eyebrow', text: `Online match · ${r.wins[0]}–${r.wins[1]}` }),
      el('h2', { class: 'ov-title ' + (r.won ? 'win' : 'lose'), text: r.draw ? 'Draw' : r.won ? 'Victory' : 'Defeat' }),
      el('p', { class: 'ov-sub', text: `${r.won ? 'You beat' : r.draw ? 'You tied with' : 'You lost to'} ${name} (${r.rival.name}).` }),
      el('div', { class: 'ov-actions' },
        el('button', { class: 'btn primary', type: 'button', text: 'Rematch', onclick: () => { overlay.hidden = true; E.stop(); showView('online'); if (NET.challenge(r.opp)) toast('Rematch challenge sent.'); } }),
        el('button', { class: 'btn', type: 'button', text: 'Back to lobby', onclick: () => { overlay.hidden = true; E.stop(); showView('online'); } }))));
    overlay.onclick = null; overlay.hidden = false;
  };

  // ================= STORY =================
  function heroDef() { return findDef(O.save.story.hero) || ROSTER[0]; }
  function renderStory() {
    $('dialogue').hidden = true; $('chapters').hidden = false;
    const sel = $('heroSelect'); sel.innerHTML = '';
    const opts = [...ROSTER.filter(d => !d.boss || bossUnlocked()), ...customs()];
    for (const d of opts) sel.append(el('option', { value: d.id, text: `${d.name} (${d.energy})` }));
    sel.value = heroDef().id;
    const list = $('chapters'); list.innerHTML = '';
    const cleared = O.save.story.cleared;
    STORY.forEach((ch, i) => {
      const foe = findDef(ch.foe === heroDef().id ? ch.alt : ch.foe);
      const status = i < cleared ? 'done' : i === cleared ? 'next' : 'locked';
      const c = el('canvas', { 'aria-hidden': 'true' });
      const btn = status === 'locked' ? el('span', { class: 'note', text: 'Locked' }) :
        el('button', { class: 'btn' + (status === 'next' ? ' primary' : ''), type: 'button', text: status === 'done' ? 'Replay' : 'Play', onclick: () => playChapter(i) });
      list.append(el('li', { class: 'chapter ' + status }, c,
        el('div', {},
          el('span', { class: 'ch-num', text: ch.boss ? 'Final chapter' : `Chapter ${i + 1} · ${WORLDS[ch.world].name}` }),
          el('h3', { text: ch.title }),
          el('div', { class: 'ch-row' }, el('span', { class: 'note', text: `vs ${foe.short}` }), status === 'done' ? el('span', { class: 'pill', style: 'color:#3ddc97', text: 'Cleared' }) : null, btn))));
      paint(c, foe, { size: 168, facing: -1, corrupted: !ch.boss && status !== 'done' });
    });
  }
  $('heroSelect').addEventListener('change', e => { O.save.story.hero = e.target.value; O.persist(); renderStory(); });

  function playChapter(i) {
    const ch = STORY[i], hero = heroDef();
    const foe = findDef(ch.foe === hero.id ? ch.alt : ch.foe);
    runDialogue(ch, i, hero, foe, ch.intro, () => {
      const cfg = {
        mode: 'story', p1: hero, p2: foe, diff: ch.diff, hpMult: ch.hpMult, corrupted: !ch.boss,
        stage: WORLDS[ch.world].stage, stageName: WORLDS[ch.world].stageName, chapterTitle: ch.title,
        onWin: () => {
          if (O.save.story.cleared === i) { O.save.story.cleared = i + 1; SL.ach.check(); SL.ach.flush(); O.persist(); O.submitScore(); }
          fight = null; E.stop(); overlay.hidden = true;
          showView('story');
          runDialogue(ch, i, hero, foe, ch.outro, () => { renderStory(); if (i === STORY.length - 1) toast('Null, the Void Emperor, is now playable in Versus.'); }, true);
        },
        retry: () => startFight(cfg),
      };
      startFight(cfg);
    });
  }
  function runDialogue(ch, i, hero, foe, lines, done, freed) {
    $('chapters').hidden = true;
    const box = $('dialogue'); box.hidden = false;
    $('dlgEyebrow').textContent = ch.boss ? 'Final chapter' : `Chapter ${i + 1}`;
    $('dlgTitle').textContent = ch.title;
    paint($('dlgLeft'), hero, { size: 260 });
    paint($('dlgRight'), foe, { size: 260, facing: -1, corrupted: !ch.boss && !freed });
    let n = 0;
    const show = () => {
      const [who, text] = lines[n];
      $('dlgName').textContent = who === 'narrator' ? '' : who === 'player' ? hero.name : foe.name;
      $('dlgText').textContent = text;
      $('dlgLeft').classList.toggle('dim', who !== 'player');
      $('dlgRight').classList.toggle('dim', who !== 'foe');
      $('dlgNext').textContent = n === lines.length - 1 ? (freed ? 'Back to chapters' : 'Fight!') : 'Next';
    };
    const finish = () => { $('dlgNext').onclick = $('dlgSkip').onclick = null; box.hidden = true; $('chapters').hidden = false; done(); };
    $('dlgNext').onclick = () => { A.play('select'); if (++n >= lines.length) finish(); else show(); };
    $('dlgSkip').onclick = finish;
    show();
    box.scrollIntoView({ block: 'nearest' });
  }

  // ================= CREATOR =================
  const CR_COLORS = [['skin', 'Skin'], ['hair', 'Hair'], ['top', 'Top'], ['legs', 'Legs'], ['accent', 'Accent'], ['aura', 'Aura'], ['awaken', 'Awakened']];
  const LABELS = {
    hair: { spiky: 'Spiky', swept: 'Swept back', messy: 'Short and messy', flame: 'Flame', tall: 'Tall spikes', long: 'Long', crown: 'Slick with crown' },
    outfit: { jacket: 'Track jacket', robe: 'Shihakusho robe', vest: 'Open vest', gi: 'Training gi', suit: 'Armored suit', uniform: 'School uniform', haori: 'Haori coat' },
    extra: { none: 'None', headband: 'Headband', sword: 'Sword', swords3: 'Three swords', hat: 'Straw hat', blindfold: 'Blindfold', earrings: 'Earrings', hood: 'Hood' },
    pattern: { none: 'Plain', checker: 'Checkered', triangles: 'Triangles' },
    mark: { none: 'None', sage: 'Sage pigment', eye: 'Glowing eye', mask: 'Hollow mask', marks: 'Curse marks', scar: 'Scar', flame: 'Flame mark', eyes6: 'Unsealed eyes', void: 'Void cracks' },
    special: { rush: 'Rush (charge forward)', wave: 'Wave (projectile)', barrage: 'Barrage (3 shots)', teleport: 'Teleport strike', stretch: 'Stretch punch' },
    fx: { sphere: 'Spiral sphere', lightning: 'Lightning', fist: 'Cursed fist', slash: 'Sword slash' },
    ult: { bigShot: 'Giant shuriken', bigWave: 'Eclipse wave', pillars: 'Flame pillars', meteor: 'Falling fist', beam: 'Energy beam', dashStrike: 'Flash strike', domain: 'Domain' },
  };
  const BUDGET = 15;
  let cr = null, crEditing = null;
  function crDefault() {
    return { name: 'Akira Tempest', energy: 'Ki', quote: 'Every fight makes me stronger.', look: { hair: 'spiky', outfit: 'gi', extra: 'headband', pattern: 'none' },
      colors: { skin: '#f1c79a', hair: '#2a1f4a', top: '#3a7bd5', legs: '#1f2a44', accent: '#ffd23a', aura: '#8fd8ff', awaken: '#ff5a1f' },
      special: { name: 'Comet Rush', kind: 'rush', fx: 'lightning' }, ult: { name: 'Starfall Beam', kind: 'beam' }, awaken: 'Tempest Mode', mark: 'eye',
      awakenHair: '', pts: { hp: 5, speed: 5, power: 5 } };
  }
  const statFrom = pts => ({ hp: Math.round(90 + pts.hp * 3.5), speed: +(0.92 + pts.speed * 0.024).toFixed(3), power: +(0.94 + pts.power * 0.016).toFixed(3) });
  const ptsFrom = d => ({ hp: Math.round(Math.max(0, Math.min(10, (d.hp - 90) / 3.5))), speed: Math.round(Math.max(0, Math.min(10, (d.speed - 0.92) / 0.024))), power: Math.round(Math.max(0, Math.min(10, ((d.power || 1) - 0.94) / 0.016))) });
  function crDef() {
    const s = statFrom(cr.pts);
    return O.sanitizeFighter({ ...cr, id: crEditing || 'preview', short: cr.name.split(/\s+/)[0], ...s, ult: { ...cr.ult, hits: cr.ult.kind === 'dashStrike' ? 9 : undefined }, awakenHair: cr.awakenHair || undefined });
  }
  function fillSelect(id, list, labels) { const s = $(id); s.innerHTML = ''; for (const v of list) s.append(el('option', { value: v, text: labels ? labels[v] || v : v })); }
  let crBuilt = false;
  function buildCreator() {
    if (crBuilt) return; crBuilt = true;
    fillSelect('crEnergy', ENERGY_ORDER);
    fillSelect('crHair', O.ENUMS.hair, LABELS.hair);
    fillSelect('crOutfit', O.ENUMS.outfit, LABELS.outfit);
    fillSelect('crExtra', O.ENUMS.extra, LABELS.extra);
    fillSelect('crPattern', O.ENUMS.pattern, LABELS.pattern);
    fillSelect('crMark', O.ENUMS.mark, LABELS.mark);
    fillSelect('crSpKind', O.ENUMS.special, LABELS.special);
    fillSelect('crSpFx', O.ENUMS.fx, LABELS.fx);
    fillSelect('crUltKind', O.ENUMS.ult, LABELS.ult);
    const box = $('crColors');
    for (const [k, label] of CR_COLORS) box.append(el('label', {}, el('input', { type: 'color', id: 'crC_' + k }), document.createTextNode(label)));
    $('crForm').addEventListener('input', crRead);
    $('crForm').addEventListener('change', crRead);
    $('crForm').addEventListener('submit', e => { e.preventDefault(); crSave(false); });
    $('crShare').addEventListener('click', () => crSave(true));
    $('crTry').addEventListener('click', () => { const d = crSave(false); if (d) { ui.p1 = d.id; ui.focus = d.id; ui.filter = 'custom'; showView('versus'); } });
    $('crRandom').addEventListener('click', crRandomize);
    $('crNew').addEventListener('click', () => { cr = crDefault(); crEditing = null; crWrite(); });
    $('crAwake').addEventListener('change', crPreview);
  }
  function crWrite() {
    $('crName').value = cr.name; $('crEnergy').value = cr.energy; $('crQuote').value = cr.quote;
    $('crHair').value = cr.look.hair; $('crOutfit').value = cr.look.outfit; $('crExtra').value = cr.look.extra; $('crPattern').value = cr.look.pattern || 'none';
    for (const [k] of CR_COLORS) $('crC_' + k).value = cr.colors[k];
    $('crSpKind').value = cr.special.kind; $('crSpName').value = cr.special.name; $('crSpFx').value = cr.special.fx || 'sphere';
    $('crUltKind').value = cr.ult.kind; $('crUltName').value = cr.ult.name;
    $('crAwaken').value = cr.awaken; $('crMark').value = cr.mark;
    $('crAwHairOn').checked = !!cr.awakenHair; $('crAwHair').value = cr.awakenHair || '#ffe066';
    $('crHp').value = cr.pts.hp; $('crSpeed').value = cr.pts.speed; $('crPower').value = cr.pts.power;
    $('crSave').textContent = crEditing ? 'Save changes' : 'Save fighter';
    crStats(); crPreview();
  }
  function crRead(e) {
    cr.name = $('crName').value; cr.energy = $('crEnergy').value; cr.quote = $('crQuote').value;
    cr.look = { hair: $('crHair').value, outfit: $('crOutfit').value, extra: $('crExtra').value, pattern: $('crPattern').value };
    for (const [k] of CR_COLORS) cr.colors[k] = $('crC_' + k).value;
    cr.special = { kind: $('crSpKind').value, name: $('crSpName').value, fx: $('crSpFx').value };
    cr.ult = { kind: $('crUltKind').value, name: $('crUltName').value };
    cr.awaken = $('crAwaken').value; cr.mark = $('crMark').value;
    cr.awakenHair = $('crAwHairOn').checked ? $('crAwHair').value : '';
    const want = { hp: +$('crHp').value, speed: +$('crSpeed').value, power: +$('crPower').value };
    const changed = e && e.target && ({ crHp: 'hp', crSpeed: 'speed', crPower: 'power' })[e.target.id];
    const total = want.hp + want.speed + want.power;
    if (total > BUDGET && changed) { want[changed] -= total - BUDGET; $(e.target.id).value = want[changed]; }
    cr.pts = want;
    $('crSpFx').disabled = cr.special.kind !== 'rush';
    $('crPattern').disabled = cr.look.outfit !== 'haori';
    crStats(); crPreview();
  }
  function crStats() {
    const s = statFrom(cr.pts), used = cr.pts.hp + cr.pts.speed + cr.pts.power;
    $('crHpVal').textContent = s.hp; $('crSpeedVal').textContent = s.speed.toFixed(2); $('crPowerVal').textContent = s.power.toFixed(2);
    $('crPoints').innerHTML = ''; $('crPoints').append(document.createTextNode('Points left: '), el('b', { text: String(BUDGET - used) }), document.createTextNode(` of ${BUDGET}. Every point in one stat is a point you can't spend on another.`));
  }
  let crFrame = 0, crRaf = 0;
  function crPreview() {
    const c = $('crCanvas');
    const d = crDef();
    R.portrait(c, d, { size: 360, awakened: $('crAwake').checked, T: crFrame, zoom: 1.22 });
  }
  function crLoop(on) {
    cancelAnimationFrame(crRaf);
    if (!on) return;
    const tick = () => { crFrame++; if (crFrame % 3 === 0 && cr) crPreview(); crRaf = requestAnimationFrame(tick); };
    crRaf = requestAnimationFrame(tick);
  }
  const rand = a => a[Math.floor(Math.random() * a.length)];
  const randColor = () => '#' + Array.from({ length: 3 }, () => Math.floor(40 + Math.random() * 200).toString(16).padStart(2, '0')).join('');
  function crRandomize() {
    const first = ['Akira', 'Haru', 'Rin', 'Daichi', 'Kaze', 'Mika', 'Sen', 'Toru', 'Yuki', 'Ryo', 'Nami', 'Jin'];
    const last = ['Tempest', 'Kurogane', 'Hoshino', 'Ashura', 'Mizuki', 'Raijin', 'Okami', 'Hayabusa', 'Tsukuyomi', 'Kagero'];
    const sp = ['Comet Rush', 'Crescent Fang', 'Thunder Palm', 'Shadow Step', 'Dragon Volley', 'Moon Slash', 'Void Needle'];
    const ul = ['Starfall Beam', 'Heavenly Collapse', 'Nine Tails Storm', 'Crimson Domain', 'Final Horizon', 'Dragon King Cannon'];
    const aw = ['Tempest Mode', 'Bankai: Black Sun', 'Gear Ascension', 'Ultra Instinct Form', 'Demon Mark', 'Six Paths Mode'];
    cr = {
      name: `${rand(first)} ${rand(last)}`, energy: rand(ENERGY_ORDER), quote: rand(['I never back down.', 'This is my story.', "You're in my way.", "Let's make this fun!", 'I carry my friends with me.']),
      look: { hair: rand(O.ENUMS.hair), outfit: rand(O.ENUMS.outfit), extra: rand(O.ENUMS.extra), pattern: rand(O.ENUMS.pattern) },
      colors: { skin: rand(['#f1c79a', '#e9b88c', '#c98e62', '#8d5a3b', '#f5dcc8', '#6b4430']), hair: randColor(), top: randColor(), legs: randColor(), accent: randColor(), aura: randColor(), awaken: randColor() },
      special: { name: rand(sp), kind: rand(O.ENUMS.special), fx: rand(O.ENUMS.fx) }, ult: { name: rand(ul), kind: rand(O.ENUMS.ult) },
      awaken: rand(aw), mark: rand(O.ENUMS.mark), awakenHair: Math.random() < 0.4 ? randColor() : '',
      pts: (() => { const a = Math.floor(Math.random() * 8), b = Math.floor(Math.random() * Math.min(8, BUDGET - a)); return { hp: a, speed: b, power: Math.min(10, BUDGET - a - b) }; })(),
    };
    crEditing = null; A.play('select'); crWrite();
  }
  function crSave(share) {
    if (!cr.name.trim()) { $('crStatus').textContent = 'Give your fighter a name first.'; $('crName').focus(); return null; }
    const list = customs();
    if (!crEditing && list.length >= 12) { $('crStatus').textContent = 'You can keep up to 12 fighters. Delete one to make room.'; return null; }
    const id = crEditing || 'c_' + Math.random().toString(36).slice(2, 10);
    const d = O.sanitizeFighter({ ...crDef(), id });
    const prev = list.find(f => f.id === id);
    d.shared = share ? true : !!(prev && prev.shared);
    if (prev) { d.up = prev.up; d.wins = prev.wins; } else SL.ach.bump('customsCreated');
    if (share) SL.ach.bump('shared');
    if (prev) list[list.indexOf(prev)] = d; else list.push(d);
    crEditing = id;
    portraitCache.clear();
    O.persist();
    A.play('confirm');
    if (d.shared) {
      O.publishGallery().then(ok => { $('crStatus').textContent = ok ? `${d.name} is saved and shared in the community gallery.` : `${d.name} is saved. Sharing needs the claude.ai version with edit access, so it stays private for now.`; });
    } else $('crStatus').textContent = `${d.name} is saved. Find them under "Your fighters" in Versus.`;
    $('crSave').textContent = 'Save changes';
    renderSaved();
    return d;
  }
  function upgradeBox(d) {
    const pts = O.skillPoints(d), next = O.WINS_PER_POINT - (d.wins % O.WINS_PER_POINT);
    const box = el('div', { class: 'upg' },
      el('p', { class: 'upg-head' }, el('span', { text: `${d.wins} win${d.wins === 1 ? '' : 's'}` }),
        el('span', { class: pts ? 'upg-pts on' : 'upg-pts', text: pts ? `${pts} skill point${pts === 1 ? '' : 's'} to spend` : `${next} more win${next === 1 ? '' : 's'} to next point` })));
    const row = el('div', { class: 'upg-row' });
    for (const k of ['hp', 'speed', 'power']) {
      const lv = d.up[k], full = lv >= O.UP_CAP;
      row.append(el('button', {
        type: 'button', class: 'upg-btn', disabled: (!pts || full) ? '' : null,
        'aria-label': `Upgrade ${STAT_LABEL[k]}, currently +${lv}`,
        onclick: () => {
          if (!O.upgrade(d.id, k)) return;
          A.play('confirm'); SL.ach.bump('upgrades'); if (d.up[k] >= O.UP_CAP) SL.ach.bump('maxedStat');
          SL.ach.flush(); portraitCache.clear(); renderSaved(); toast(`${d.short}: ${STAT_LABEL[k]} +1.`);
        },
      }, el('b', { text: STAT_LABEL[k] }), el('span', { text: full ? 'MAX' : `+${lv}` })));
    }
    box.append(row);
    return box;
  }
  function renderSaved() {
    const box = $('crSaved'); box.innerHTML = '';
    const list = customs();
    if (!list.length) { box.append(el('p', { class: 'empty', text: 'Fighters you save show up here. You can keep up to 12.' })); return; }
    for (const d of list) {
      const c = el('canvas', { 'aria-hidden': 'true' });
      const del = el('button', { class: 'btn danger', type: 'button', text: 'Delete' });
      del.addEventListener('click', () => {
        if (del.dataset.armed) {
          O.save.custom = list.filter(f => f.id !== d.id); if (crEditing === d.id) crEditing = null;
          O.persist(); if (d.shared) O.publishGallery(); renderSaved(); toast(`${d.name} deleted.`);
        } else { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = 'Delete'; } }, 3000); }
      });
      box.append(el('div', { class: 'saved' }, c, el('div', {},
        el('div', { class: 'nm', text: d.name }),
        el('div', { class: 'matchup' }, energyPill(d), d.shared ? el('span', { class: 'pill', style: 'color:#3ddc97', text: 'Shared' }) : null),
        upgradeBox(d),
        el('div', { class: 'acts' },
          el('button', { class: 'btn', type: 'button', text: 'Fight', onclick: () => { ui.p1 = d.id; ui.focus = d.id; showView('versus'); } }),
          el('button', { class: 'btn', type: 'button', text: 'Edit', onclick: () => { crEditing = d.id; cr = { ...JSON.parse(JSON.stringify(d)), pts: ptsFrom(d), awakenHair: d.awakenHair || '' }; crWrite(); $('view-create').scrollIntoView({ block: 'start' }); } }),
          el('button', { class: 'btn', type: 'button', text: d.shared ? 'Unshare' : 'Share', onclick: () => { d.shared = !d.shared; if (d.shared) SL.ach.bump('shared'); O.persist(); O.publishGallery().then(ok => toast(ok ? (d.shared ? `${d.name} is in the gallery.` : `${d.name} removed from the gallery.`) : 'Sharing needs the claude.ai version with edit access.')); renderSaved(); } }),
          del))));
      paint(c, d, { size: 128 });
    }
  }
  function renderCreator() {
    buildCreator();
    if (!cr) { cr = crDefault(); crWrite(); }
    renderSaved();
  }

  // ================= RANKS =================
  let scoresUnsub = null, galleryUnsub = null, scoreRows = null;
  function renderMyStats() {
    const s = O.save.stats, box = $('myStats'); box.innerHTML = '';
    const mainId = Object.entries(s.main).sort((a, b) => b[1] - a[1])[0];
    const main = mainId ? findDef(mainId[0]) : null;
    for (const [label, v] of [['Wins', s.wins], ['Losses', s.losses], ['Best streak', s.best], ['Story', `${O.save.story.cleared}/${STORY.length}`], ['Achievement points', SL.ach.points()], ['Rival AI level', O.save.ai.level]]) {
      box.append(el('div', {}, el('b', { text: String(v) }), el('span', { text: label })));
    }
  }
  async function renderBoard() {
    const body = $('boardBody'); body.innerHTML = '';
    if (scoreRows === null) {
      $('boardStatus').textContent = O.status === 'connecting' ? 'Connecting to the leaderboard…' : 'The shared leaderboard works when this game is opened on claude.ai. Your own record is saved on this device.';
      return;
    }
    $('boardStatus').textContent = scoreRows.length ? 'Top players by total wins. Updated live.' : 'No scores yet. Win a match to claim the top spot.';
    const profiles = await O.profiles(scoreRows.map(r => r.id));
    body.innerHTML = '';
    scoreRows.forEach((r, i) => {
      const p = profiles[r.id] || {}, main = findDef(String(r.main || ''));
      const name = p.name || (r.id === O.uid ? 'You' : 'A player');
      const who = el('span', { class: 'who' }, p.avatarUrl ? el('img', { src: p.avatarUrl, alt: '' }) : null, el('span', { text: name }));
      body.append(el('tr', { class: r.id === O.uid ? 'me' : '' },
        el('td', { class: 'rank', text: String(i + 1) }), el('td', {}, who),
        el('td', { class: 'num', text: String(Number(r.wins) || 0) }), el('td', { class: 'num', text: String(Number(r.best) || 0) }),
        el('td', { class: 'num', text: `${Math.min(STORY.length, Number(r.story) || 0)}/${STORY.length}` }),
        el('td', { text: main ? main.short : '—' }), el('td', { class: 'num', text: String(Number(r.ap) || 0) })));
    });
  }
  function renderGallery() {
    const box = $('galleryList'); box.innerHTML = '';
    if (!O.db) { $('galleryStatus').textContent = 'The community gallery works when this game is opened on claude.ai.'; return; }
    $('galleryStatus').textContent = ui.gallery.length ? 'Fighters shared by other players. Fight them or play as them.' : 'No shared fighters yet. Share one from the Create tab.';
    for (const d of ui.gallery.slice(0, 24)) {
      const c = el('canvas', { 'aria-hidden': 'true' });
      box.append(el('div', { class: 'saved' }, c, el('div', {},
        el('div', { class: 'nm', text: d.name }), el('div', { class: 'matchup' }, energyPill(d)),
        el('div', { class: 'acts' },
          el('button', { class: 'btn', type: 'button', text: 'Play as', onclick: () => { ui.p1 = d.id; ui.focus = d.id; showView('versus'); } }),
          el('button', { class: 'btn', type: 'button', text: 'Fight them', onclick: () => { ui.p2 = d.id; ui.focus = d.id; showView('versus'); } })))));
      paint(c, d, { size: 128 });
    }
  }
  function renderRanks() { renderMyStats(); renderBoard(); renderGallery(); }

  O.onSave(() => { if (ui.view === 'ranks') renderMyStats(); });
  O.ready.then(() => {
    refreshToggles();
    scoresUnsub = O.watchScores(rows => { scoreRows = rows; if (ui.view === 'ranks') renderBoard(); });
    galleryUnsub = O.watchGallery(list => {
      ui.gallery = (list || []).filter(d => d.author !== O.uid);
      if (ui.view === 'versus') renderGrid();
      if (ui.view === 'ranks') renderGallery();
    });
    if (ui.view === 'versus') renderVersus();
    if (ui.view === 'story') renderStory();
    if (ui.view === 'ranks') renderRanks();
  });

  // ---------- boot ----------
  refreshToggles();
  drawWheel();
  showView('versus');
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { portraitCache.clear(); drawWheel(); if (ui.view === 'versus') renderSlots(); });
})();
