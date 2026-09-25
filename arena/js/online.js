/* Shonen Legends: saves, shared leaderboard, fighter gallery and live rival banter.
   Everything here degrades gracefully: without the claude.ai runtime the game
   keeps working from browser storage with classic banter lines. */
(() => {
  'use strict';
  const SL = (window.SL = window.SL || {});
  const { ENERGY_ORDER, WORLDS, LINES } = SL.data;

  // ---------- local storage (per-viewer convenience + offline fallback) ----------
  const local = {
    get(k, fb) { try { const v = localStorage.getItem('sla2.' + k); return v === null ? fb : JSON.parse(v); } catch (e) { return fb; } },
    set(k, v) { try { localStorage.setItem('sla2.' + k, JSON.stringify(v)); } catch (e) { /* unavailable */ } },
  };

  // ---------- custom fighter validation ----------
  const HEX = /^#[0-9a-fA-F]{6}$/;
  // Progression: custom fighters earn 1 skill point per 5 wins (max 10 per stat);
  // the rival AI levels up each time it loses, adding a point to a random stat.
  const UP_CAP = 10, AI_CAP = 15, WINS_PER_POINT = 5;
  const PER_POINT = { hp: 3, speed: 0.012, power: 0.012 };
  const ENUMS = {
    hair: ['spiky', 'swept', 'messy', 'flame', 'tall', 'long', 'crown'],
    outfit: ['jacket', 'robe', 'vest', 'gi', 'suit', 'uniform', 'haori'],
    extra: ['none', 'headband', 'sword', 'swords3', 'hat', 'blindfold', 'earrings', 'hood'],
    pattern: ['none', 'checker', 'triangles'],
    mark: ['none', 'sage', 'eye', 'mask', 'marks', 'scar', 'flame', 'eyes6', 'void'],
    special: ['rush', 'wave', 'barrage', 'teleport', 'stretch'],
    fx: ['sphere', 'lightning', 'fist', 'slash'],
    ult: ['bigShot', 'bigWave', 'pillars', 'meteor', 'beam', 'dashStrike', 'domain'],
  };
  const str = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  const pick = (v, list, fb) => (list.includes(v) ? v : fb);
  const col = (v, fb) => (HEX.test(String(v)) ? String(v) : fb);
  const num = (v, a, b, fb) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : fb; };

  function sanitizeFighter(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') return null;
    const c = raw.colors || {}, lk = raw.look || {}, sp = raw.special || {}, ul = raw.ult || {};
    const name = str(raw.name, 24) || 'Nameless Fighter';
    const def = {
      id: str(raw.id, 40).replace(/[^a-zA-Z0-9_-]/g, '') || fallbackId || 'c_' + Math.random().toString(36).slice(2, 9),
      custom: true, world: 'custom',
      name, short: str(raw.short, 12) || name.split(/\s+/)[0].slice(0, 12),
      energy: pick(raw.energy, ENERGY_ORDER, 'Chakra'),
      hp: Math.round(num(raw.hp, 85, 125, 100)), speed: num(raw.speed, 0.9, 1.16, 1), power: num(raw.power, 0.92, 1.1, 1),
      awaken: str(raw.awaken, 28) || 'Awakened Form',
      mark: pick(raw.mark, ENUMS.mark, 'none'),
      look: { hair: pick(lk.hair, ENUMS.hair, 'spiky'), outfit: pick(lk.outfit, ENUMS.outfit, 'jacket'), extra: pick(lk.extra, ENUMS.extra, 'none'), pattern: pick(lk.pattern, ENUMS.pattern, 'none') },
      colors: {
        skin: col(c.skin, '#f1c79a'), hair: col(c.hair, '#222233'), top: col(c.top, '#3355aa'), legs: col(c.legs, '#222233'),
        accent: col(c.accent, '#ffd23a'), aura: col(c.aura, '#8fd8ff'), awaken: col(c.awaken, '#ff5a1f'),
      },
      special: { name: str(sp.name, 28) || 'Signature Move', kind: pick(sp.kind, ENUMS.special, 'wave'), fx: pick(sp.fx, ENUMS.fx, 'sphere') },
      ult: { name: str(ul.name, 30) || 'Final Technique', kind: pick(ul.kind, ENUMS.ult, 'beam'), hits: ul.kind === 'dashStrike' ? (num(ul.hits, 1, 9, 1) >= 5 ? 9 : 1) : undefined },
      quote: str(raw.quote, 90),
    };
    if (raw.awakenHair && HEX.test(String(raw.awakenHair))) def.awakenHair = String(raw.awakenHair);
    const up = raw.up || {};
    def.up = { hp: Math.round(num(up.hp, 0, UP_CAP, 0)), speed: Math.round(num(up.speed, 0, UP_CAP, 0)), power: Math.round(num(up.power, 0, UP_CAP, 0)) };
    def.wins = Math.round(num(raw.wins, 0, 1e6, 0));
    def.special.color = def.colors.aura;
    def.ult.color = def.colors.awaken;
    return def;
  }

  // ---------- runtime capabilities ----------
  const hasRuntime = typeof window.claude === 'object' && window.claude && typeof window.claude.use === 'function';
  const use = name => (hasRuntime ? window.claude.use(name).catch(() => null) : Promise.resolve(null));
  const online = (SL.online = {
    db: null, user: null, sample: null, uid: null, canWrite: null,
    ENUMS, sanitizeFighter, local,
    status: 'connecting',
    save: null,
  });

  const DEFAULT_SAVE = () => ({ story: { hero: 'kaito', cleared: 0 }, custom: [], stats: { wins: 0, losses: 0, streak: 0, best: 0, main: {} }, v: 1 });
  function normalizeSave(s) {
    const d = DEFAULT_SAVE();
    if (!s || typeof s !== 'object') s = d;
    const story = s.story || {};
    const stats = s.stats || {};
    const ach = s.ach && typeof s.ach === 'object' ? s.ach : {};
    const numMap = (o, n) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).slice(0, n).map(([k, v]) => [str(k, 40), Math.round(num(v, 0, 1e13, 0))])) : {});
    return {
      v: 1,
      ach: {
        un: numMap(ach.un, 80), c: numMap(ach.c, 80),
        s: { worldsWon: Array.isArray(ach.s && ach.s.worldsWon) ? ach.s.worldsWon.map(x => str(x, 20)).slice(0, 12) : [],
             fightersWon: Array.isArray(ach.s && ach.s.fightersWon) ? ach.s.fightersWon.map(x => str(x, 40)).slice(0, 40) : [] },
      },
      ai: (() => { const a = s.ai || {}, p = a.pts || {}; return { level: Math.round(num(a.level, 0, 1e6, 0)), pts: { hp: Math.round(num(p.hp, 0, 1e6, 0)), speed: Math.round(num(p.speed, 0, 1e6, 0)), power: Math.round(num(p.power, 0, 1e6, 0)) } }; })(),
      story: { hero: str(story.hero, 40) || 'kaito', cleared: Math.round(num(story.cleared, 0, 7, 0)) },
      custom: Array.isArray(s.custom) ? s.custom.slice(0, 12).map(f => { const c = sanitizeFighter(f); if (c && f.shared) c.shared = true; return c; }).filter(Boolean) : [],
      stats: {
        wins: Math.round(num(stats.wins, 0, 1e6, 0)), losses: Math.round(num(stats.losses, 0, 1e6, 0)),
        streak: Math.round(num(stats.streak, 0, 1e6, 0)), best: Math.round(num(stats.best, 0, 1e6, 0)),
        main: stats.main && typeof stats.main === 'object' ? Object.fromEntries(Object.entries(stats.main).slice(0, 40).map(([k, v]) => [str(k, 40), Math.round(num(v, 0, 1e6, 0))])) : {},
      },
    };
  }
  online.save = normalizeSave(local.get('save', null));

  const saveListeners = [];
  online.onSave = fn => saveListeners.push(fn);
  let writing = Promise.resolve();
  online.persist = () => {
    local.set('save', online.save);
    if (online.db && online.uid) {
      const body = JSON.parse(JSON.stringify(online.save));
      writing = writing.then(() => online.db.doc(`data/users/${online.uid}/save`).set(body)).catch(() => {});
    }
    saveListeners.forEach(fn => fn(online.save));
  };

  online.ready = Promise.all([use('db'), use('user'), use('sample')]).then(async ([db, user, sample]) => {
    online.db = db; online.user = user; online.sample = sample;
    if (user) {
      try { online.uid = await user.id(); } catch (e) { online.uid = null; }
      try { online.canWrite = await user.can('data.write'); } catch (e) { online.canWrite = null; }
    }
    if (db && online.uid) {
      try {
        const snap = await db.doc(`data/users/${online.uid}/save`).get();
        if (snap.exists) {
          const remote = normalizeSave(snap.data());
          const localSave = online.save;
          // keep whichever has more progress, and merge custom fighters by id
          const merged = remote;
          merged.story.cleared = Math.max(remote.story.cleared, localSave.story.cleared);
          for (const k of ['wins', 'losses', 'best']) merged.stats[k] = Math.max(remote.stats[k], localSave.stats[k]);
          if (localSave.ai.level > merged.ai.level) merged.ai = localSave.ai;
          for (const f of merged.custom) { const l = localSave.custom.find(x => x.id === f.id); if (l && l.wins > f.wins) { f.wins = l.wins; f.up = l.up; } }
          for (const [k, v] of Object.entries(localSave.ach.un)) if (!merged.ach.un[k]) merged.ach.un[k] = v;
          for (const [k, v] of Object.entries(localSave.ach.c)) merged.ach.c[k] = Math.max(merged.ach.c[k] || 0, v);
          for (const k of ['worldsWon', 'fightersWon']) merged.ach.s[k] = [...new Set([...merged.ach.s[k], ...localSave.ach.s[k]])];
          const ids = new Set(merged.custom.map(f => f.id));
          for (const f of localSave.custom) if (!ids.has(f.id) && merged.custom.length < 12) merged.custom.push(f);
          online.save = merged;
        }
        online.persist();
      } catch (e) { /* keep local save */ }
    }
    online.status = db ? 'online' : 'offline';
    saveListeners.forEach(fn => fn(online.save));
    return online;
  });

  // ---------- progression ----------
  const KEYS = ['hp', 'speed', 'power'];
  online.PER_POINT = PER_POINT; online.UP_CAP = UP_CAP; online.AI_CAP = AI_CAP; online.WINS_PER_POINT = WINS_PER_POINT;
  function boosted(def, pts) {
    const d = { ...def };
    d.hp = Math.round(def.hp + (pts.hp || 0) * PER_POINT.hp);
    d.speed = +(def.speed + (pts.speed || 0) * PER_POINT.speed).toFixed(3);
    d.power = +((def.power || 1) + (pts.power || 0) * PER_POINT.power).toFixed(3);
    return d;
  }
  online.skillPoints = d => (d && d.custom ? Math.max(0, Math.floor((d.wins || 0) / WINS_PER_POINT) - KEYS.reduce((t, k) => t + (d.up ? d.up[k] : 0), 0)) : 0);
  /** Stats a fighter actually fights with: base + upgrades (custom) or + AI levels (rival). */
  online.effective = (def, asRival) => {
    let d = def.custom && def.up ? boosted(def, def.up) : { ...def };
    if (asRival) { const p = online.aiBonus(); if (p.hp || p.speed || p.power) d = boosted(d, p); }
    return d;
  };
  online.aiBonus = () => { const p = online.save.ai.pts; return { hp: Math.min(AI_CAP, p.hp), speed: Math.min(AI_CAP, p.speed), power: Math.min(AI_CAP, p.power) }; };
  online.aiLevelUp = () => {
    const ai = online.save.ai;
    ai.level++;
    const open = KEYS.filter(k => ai.pts[k] < AI_CAP);
    const k = open.length ? open[Math.floor(Math.random() * open.length)] : null;
    if (k) ai.pts[k]++;
    return k;
  };
  online.upgrade = (id, key) => {
    const d = online.save.custom.find(f => f.id === id);
    if (!d || !KEYS.includes(key) || online.skillPoints(d) < 1 || d.up[key] >= UP_CAP) return false;
    d.up[key]++;
    online.persist();
    if (d.shared) online.publishGallery();
    return true;
  };
  online.recordCustomWin = id => { const d = online.save.custom.find(f => f.id === id); if (!d) return 0; const before = online.skillPoints(d); d.wins++; return online.skillPoints(d) - before; };

  // ---------- leaderboard ----------
  online.submitScore = async () => {
    if (!online.db || !online.uid) return;
    const s = online.save.stats;
    const main = Object.entries(s.main).sort((a, b) => b[1] - a[1])[0];
    const body = { wins: s.wins, losses: s.losses, best: s.best, story: online.save.story.cleared, main: main ? main[0] : '', ap: SL.ach ? SL.ach.points() : 0, ai: online.save.ai.level, awards: SL.ach ? SL.ach.count() : 0, updated: Date.now() };
    try { await online.db.doc(`scores/${online.uid}`).set(body); } catch (e) { /* view-only viewers cannot write */ }
  };
  online.watchScores = cb => {
    if (!online.db) { cb(null); return () => {}; }
    return online.db.collection('scores').orderBy('wins', 'desc').limit(50).onSnapshot(
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => cb(null),
    );
  };
  online.profiles = async ids => {
    if (!online.user || !ids.length) return {};
    try { return await online.user.profiles(ids); } catch (e) { return {}; }
  };

  // ---------- gallery ----------
  online.publishGallery = async () => {
    if (!online.db || !online.uid) return false;
    const shared = online.save.custom.filter(f => f.shared).slice(0, 6).map(f => { const c = { ...f }; delete c.shared; return c; });
    try { await online.db.doc(`gallery/${online.uid}`).set({ fighters: shared, updated: Date.now() }); return true; }
    catch (e) { return false; }
  };
  online.watchGallery = cb => {
    if (!online.db) { cb(null); return () => {}; }
    return online.db.collection('gallery').limit(100).onSnapshot(
      snap => {
        const out = [];
        for (const d of snap.docs) {
          const data = d.data() || {};
          const list = Array.isArray(data.fighters) ? data.fighters.slice(0, 6) : [];
          list.forEach((raw, i) => { const f = sanitizeFighter(raw, `g_${d.id.slice(-8)}_${i}`); if (f) { f.id = `g_${d.id.replace(/[^a-zA-Z0-9]/g, '').slice(-10)}_${i}`; f.author = d.id; f.gallery = true; out.push(f); } });
        }
        cb(out);
      },
      () => cb(null),
    );
  };

  // ---------- live rival banter ----------
  online.banterMode = local.get('banter', 'live');
  online.setBanter = mode => { online.banterMode = mode; local.set('banter', mode); };
  let banterBlocked = false;
  const persona = d => {
    const w = d.custom ? `an original ${d.energy} fighter` : `${WORLDS[d.world] ? WORLDS[d.world].name : ''} (${d.energy} user)`;
    return `${d.name} from ${w}. Signature move: ${d.special.name}. Ultimate: ${d.ult.name}. Awakened form: ${d.awaken}.` + (d.quote ? ` Personality in their own words: "${d.quote}"` : '');
  };

  online.canBanter = () => !!online.sample && !banterBlocked && online.banterMode === 'live';

  online.matchLines = async (player, rival, context) => {
    if (!online.canBanter()) return null;
    const prompt = [
      'You write trash talk for a rival in a lighthearted 2D anime fighting game.',
      `The rival is ${persona(rival)}`,
      `The player is fighting as ${persona(player)}`,
      context ? `Situation: ${context}` : '',
      'Write in the rival\'s own voice, playful and confident, PG-13, no slurs, no real people. Each line at most 14 words. Reference the player\'s character or moves when it fits.',
      'Reply with only JSON: {"intro": string, "awaken": string, "win": string, "lose": string}',
      'intro = said as the fight begins; awaken = said when the rival transforms at low health; win = said after beating the player; lose = said after losing.',
    ].filter(Boolean).join('\n');
    try {
      const data = await online.sample.json(prompt, { modelTier: 'quick', cache: false });
      if (!data || typeof data !== 'object') return null;
      const out = {};
      for (const k of ['intro', 'awaken', 'win', 'lose']) out[k] = str(data[k], 140);
      return out;
    } catch (e) {
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(e && e.code)) banterBlocked = true;
      return null;
    }
  };

  online.postMatch = async (result) => {
    if (!online.canBanter()) return null;
    const s = result.stats;
    const facts = [
      `Result: the rival ${result.won ? 'LOST' : result.draw ? 'drew' : 'WON'} ${result.wins[1]}-${result.wins[0]} in rounds.`,
      `Player's best combo: ${s.maxCombo} hits. Player used ${s.ults} ultimate(s).`,
      `Player ${s.awakened ? 'was pushed into their awakened form' : 'never had to awaken'}. Player finished with ${result.hpLeft}% health.`,
    ].join(' ');
    const prompt = [
      'You voice the rival in a lighthearted 2D anime fighting game, reacting right after a match.',
      `The rival is ${persona(result.rival)}`,
      `The player fought as ${result.player.name}.`,
      facts,
      'Write ONE reaction line in the rival\'s voice, at most 22 words, PG-13. Mention one specific fact above. Reply with just the line, no quotes.',
    ].join('\n');
    try {
      const { text } = await online.sample(prompt, { modelTier: 'quick', cache: false });
      return str(text, 180);
    } catch (e) {
      if (['not_granted', 'sampling_disabled', 'not_declared'].includes(e && e.code)) banterBlocked = true;
      return null;
    }
  };

  online.classicLines = def => LINES[def.id] || LINES.custom;
})();
