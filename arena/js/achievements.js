/* Shonen Legends: achievements — definitions, progress tracking and unlock notifications. */
(() => {
  'use strict';
  const SL = window.SL, O = SL.online, E = SL.engine, D = SL.data;

  const TIERS = {
    bronze:   { label: 'Bronze',   pts: 10,  a: '#f0a766', b: '#8a4a1f' },
    silver:   { label: 'Silver',   pts: 25,  a: '#eef2fb', b: '#7a849e' },
    gold:     { label: 'Gold',     pts: 50,  a: '#ffe27a', b: '#c07a0a' },
    platinum: { label: 'Platinum', pts: 100, a: '#c9f4ff', b: '#4a7fd6' },
  };

  // kind: counter key read by get(); goal: target value.
  const LIST = [
    { id: 'first_win',  cat: 'Combat',    icon: 'fist',   tier: 'bronze',   name: 'First Blood',          desc: 'Win your first match.',                          key: 'wins', goal: 1 },
    { id: 'wins10',     cat: 'Combat',    icon: 'fist',   tier: 'silver',   name: 'Rising Star',          desc: 'Win 10 matches.',                                key: 'wins', goal: 10 },
    { id: 'wins50',     cat: 'Combat',    icon: 'crown',  tier: 'gold',     name: 'Living Legend',        desc: 'Win 50 matches.',                                key: 'wins', goal: 50 },
    { id: 'streak5',    cat: 'Combat',    icon: 'flame',  tier: 'silver',   name: 'On Fire',              desc: 'Win 5 matches in a row.',                        key: 'best', goal: 5 },
    { id: 'streak10',   cat: 'Combat',    icon: 'flame',  tier: 'gold',     name: 'Unstoppable',          desc: 'Win 10 matches in a row.',                       key: 'best', goal: 10 },
    { id: 'combo5',     cat: 'Combat',    icon: 'bolt',   tier: 'bronze',   name: 'Chain Starter',        desc: 'Land a 5-hit combo.',                            key: 'maxCombo', goal: 5 },
    { id: 'combo10',    cat: 'Combat',    icon: 'bolt',   tier: 'gold',     name: 'Combo Artist',         desc: 'Land a 10-hit combo.',                           key: 'maxCombo', goal: 10 },
    { id: 'perfect',    cat: 'Combat',    icon: 'shield', tier: 'gold',     name: 'Untouchable',          desc: 'Win a round without taking any damage.',         key: 'perfects', goal: 1 },
    { id: 'underdog',   cat: 'Combat',    icon: 'heart',  tier: 'silver',   name: 'By a Thread',          desc: 'Win a match with less than 10% health left.',    key: 'underdogs', goal: 1 },
    { id: 'emperor',    cat: 'Combat',    icon: 'crown',  tier: 'gold',     name: 'Emperor Slayer',       desc: 'Win a match on Emperor difficulty.',             key: 'emperorWins', goal: 1 },
    { id: 'sweep',      cat: 'Combat',    icon: 'crown',  tier: 'platinum', name: 'Flawless Emperor',     desc: 'Win 2–0 on Emperor difficulty.',                 key: 'emperorSweeps', goal: 1 },

    { id: 'ult1',       cat: 'Technique', icon: 'star',   tier: 'bronze',   name: 'Final Form',           desc: 'Use your first ultimate.',                       key: 'ults', goal: 1 },
    { id: 'ult25',      cat: 'Technique', icon: 'star',   tier: 'silver',   name: 'Overkill',             desc: 'Use 25 ultimates.',                              key: 'ults', goal: 25 },
    { id: 'ultko',      cat: 'Technique', icon: 'star',   tier: 'silver',   name: 'Cinematic Finish',     desc: 'Finish a round with an ultimate.',               key: 'ultKOs', goal: 1 },
    { id: 'awaken1',    cat: 'Technique', icon: 'eye',    tier: 'bronze',   name: 'Refuse to Fall',       desc: 'Awaken for the first time.',                     key: 'awakens', goal: 1 },
    { id: 'comeback',   cat: 'Technique', icon: 'eye',    tier: 'silver',   name: 'Plot Armor',           desc: 'Win a round after awakening.',                   key: 'comebacks', goal: 1 },
    { id: 'block50',    cat: 'Technique', icon: 'shield', tier: 'bronze',   name: 'Iron Wall',            desc: 'Block 50 attacks.',                              key: 'blocks', goal: 50 },
    { id: 'dash100',    cat: 'Technique', icon: 'bolt',   tier: 'bronze',   name: 'Flash Step',           desc: 'Dash 100 times.',                                key: 'dashes', goal: 100 },
    { id: 'over30',     cat: 'Technique', icon: 'wheel',  tier: 'silver',   name: 'Type Master',          desc: 'Land 30 overpower hits using the energy wheel.', key: 'overpowers', goal: 30 },
    { id: 'clash',      cat: 'Technique', icon: 'bolt',   tier: 'bronze',   name: 'Beam Struggle',        desc: 'Collide two projectiles in a clash.',            key: 'clashes', goal: 1 },
    { id: 'timeout',    cat: 'Technique', icon: 'clock',  tier: 'bronze',   name: 'Clock Watcher',        desc: 'Win a round when the timer runs out.',           key: 'timeouts', goal: 1 },
    { id: 'mirror',     cat: 'Technique', icon: 'mirror', tier: 'bronze',   name: 'Mirror Match',         desc: 'Beat a copy of your own fighter.',               key: 'mirrorWins', goal: 1 },

    { id: 'story1',     cat: 'Story',     icon: 'book',   tier: 'bronze',   name: 'The Journey Begins',   desc: 'Clear story chapter 1.',                         key: 'story', goal: 1 },
    { id: 'story4',     cat: 'Story',     icon: 'book',   tier: 'silver',   name: 'Halfway Across',       desc: 'Clear 4 story chapters.',                        key: 'story', goal: 4 },
    { id: 'story7',     cat: 'Story',     icon: 'globe',  tier: 'gold',     name: 'Savior of Six Worlds', desc: 'Defeat the Void Emperor.',                       key: 'story', goal: 7 },
    { id: 'nullwin',    cat: 'Story',     icon: 'void',   tier: 'silver',   name: 'Embrace the Void',     desc: 'Win a match as Null, the Void Emperor.',         key: 'nullWins', goal: 1, secret: true },
    { id: 'worlds',     cat: 'Story',     icon: 'globe',  tier: 'gold',     name: 'World Tour',           desc: 'Win with a fighter from each of the 6 worlds.',  set: 'worldsWon', goal: 6 },
    { id: 'roster',     cat: 'Story',     icon: 'crown',  tier: 'platinum', name: 'Roster Master',        desc: 'Win with all 12 original fighters.',             set: 'fightersWon', goal: 12 },

    { id: 'create1',    cat: 'Creator',   icon: 'brush',  tier: 'bronze',   name: 'Character Designer',   desc: 'Save your first custom fighter.',                key: 'customsCreated', goal: 1 },
    { id: 'create5',    cat: 'Creator',   icon: 'brush',  tier: 'silver',   name: 'Studio Head',          desc: 'Save 5 custom fighters.',                        key: 'customsCreated', goal: 5 },
    { id: 'share1',     cat: 'Creator',   icon: 'share',  tier: 'bronze',   name: 'Going Public',         desc: 'Share a fighter to the community gallery.',      key: 'shared', goal: 1 },
    { id: 'customwin',  cat: 'Creator',   icon: 'brush',  tier: 'silver',   name: 'My Own Legend',        desc: 'Win a match with a fighter you created.',        key: 'customWins', goal: 1 },
    { id: 'gallery',    cat: 'Creator',   icon: 'share',  tier: 'bronze',   name: 'Community Challenger', desc: 'Fight a fighter from the community gallery.',   key: 'galleryFights', goal: 1 },
    { id: 'upgrade1',   cat: 'Creator',   icon: 'star',   tier: 'bronze',   name: 'Level Up',             desc: 'Spend a skill point on one of your fighters.',   key: 'upgrades', goal: 1 },
    { id: 'maxed',      cat: 'Creator',   icon: 'star',   tier: 'gold',     name: 'Fully Trained',        desc: 'Max out any stat on a custom fighter (+10).',    key: 'maxedStat', goal: 1 },
    { id: 'ai10',       cat: 'Combat',    icon: 'bolt',   tier: 'silver',   name: 'Arms Race',            desc: 'Push the rival AI to level 10.',                 key: 'aiLevel', goal: 10 },
    { id: 'ai25',       cat: 'Combat',    icon: 'crown',  tier: 'gold',     name: 'Frankenstein',         desc: 'Push the rival AI to level 25.',                 key: 'aiLevel', goal: 25 },
    { id: 'online1',    cat: 'Combat',    icon: 'globe',  tier: 'silver',   name: 'Face to Face',         desc: 'Win an online match against another player.',   key: 'onlineWins', goal: 1 },
    { id: 'online10',   cat: 'Combat',    icon: 'globe',  tier: 'gold',     name: 'Ranked Contender',     desc: 'Win 10 online matches.',                         key: 'onlineWins', goal: 10 },
    { id: 'banter',     cat: 'Creator',   icon: 'chat',   tier: 'bronze',   name: 'Trash Talk Survivor',  desc: 'Hear a live AI-written rival line.',             key: 'banterHeard', goal: 1 },

    { id: 'complete',   cat: 'Legend',    icon: 'crown',  tier: 'platinum', name: 'Legend of Six Worlds', desc: 'Unlock every other achievement.',                key: '__all', goal: 0 },
  ];
  const BY_ID = Object.fromEntries(LIST.map(a => [a.id, a]));
  const COMPLETE_GOAL = LIST.length - 1;
  BY_ID.complete.goal = COMPLETE_GOAL;

  // ---------- state ----------
  function state() {
    const s = O.save;
    if (!s.ach || typeof s.ach !== 'object') s.ach = {};
    const a = s.ach;
    if (!a.un || typeof a.un !== 'object') a.un = {};
    if (!a.c || typeof a.c !== 'object') a.c = {};
    if (!a.s || typeof a.s !== 'object') a.s = {};
    for (const k of Object.keys(a.un)) if (!BY_ID[k]) delete a.un[k];
    for (const k of ['worldsWon', 'fightersWon']) a.s[k] = Array.isArray(a.s[k]) ? a.s[k].filter(x => typeof x === 'string').slice(0, 40) : [];
    return a;
  }
  function get(key) {
    const s = O.save, a = state();
    if (key === 'wins') return s.stats.wins;
    if (key === 'best') return s.stats.best;
    if (key === 'story') return s.story.cleared;
    if (key === 'aiLevel') return s.ai ? s.ai.level : 0;
    if (key === '__all') return Object.keys(a.un).filter(k => k !== 'complete').length;
    const v = Number(a.c[key]);
    return Number.isFinite(v) ? v : 0;
  }
  function progress(def) {
    const a = state();
    const v = def.set ? a.s[def.set].length : get(def.key);
    return { value: Math.min(v, def.goal), goal: def.goal, done: !!a.un[def.id] };
  }

  const listeners = [];
  let dirty = false;
  function check() {
    const a = state(), fresh = [];
    for (const def of LIST) {
      if (a.un[def.id]) continue;
      const p = progress(def);
      if (p.value >= p.goal && p.goal > 0) { a.un[def.id] = Date.now(); fresh.push(def); }
    }
    if (fresh.length) {
      dirty = true;
      // the completion award may become available after others unlock
      if (!a.un.complete && get('__all') >= COMPLETE_GOAL) { a.un.complete = Date.now(); fresh.push(BY_ID.complete); }
      fresh.forEach(def => listeners.forEach(fn => fn(def)));
      if (SL.game.phase === 'idle' || SL.game.phase === 'matchEnd') flush();
    }
    return fresh;
  }
  function flush() { if (dirty) { dirty = false; O.persist(); O.submitScore(); } }
  function bump(key, n = 1) { const a = state(); a.c[key] = (Number(a.c[key]) || 0) + n; return check(); }
  function max(key, v) { const a = state(); if (v > (Number(a.c[key]) || 0)) { a.c[key] = v; return check(); } return []; }
  function addTo(set, v) { const a = state(); if (!a.s[set].includes(v)) { a.s[set].push(v); return check(); } return []; }
  function points() { const a = state(); return Object.keys(a.un).reduce((t, id) => t + (BY_ID[id] ? TIERS[BY_ID[id].tier].pts : 0), 0); }
  function count() { return Object.keys(state().un).length; }

  // ---------- engine hooks: only the player's actions count ----------
  const isPlayer = f => SL.game.fighters[0] === f;
  let matchUnlocks = [];
  E.on('hit', h => {
    if (isPlayer(h.def) && h.blocked) bump('blocks');
    if (!isPlayer(h.att) || h.blocked) return;
    if (h.adv) bump('overpowers');
    if (h.att.combo >= 2) max('maxCombo', h.att.combo);
  });
  E.on('dash', f => { if (isPlayer(f)) bump('dashes'); });
  E.on('ult', f => { if (isPlayer(f)) bump('ults'); });
  E.on('awaken', f => { if (isPlayer(f)) bump('awakens'); });
  E.on('clash', () => bump('clashes'));
  E.on('ko', k => { if (isPlayer(k.winner) && k.ult) bump('ultKOs'); });
  E.on('round', r => {
    if (r.winner !== 0) return;
    const p = SL.game.fighters[0];
    if (p.hp >= p.maxHp) bump('perfects');
    if (p.awakened) bump('comebacks');
    if (r.timeout) bump('timeouts');
  });

  /** Called by the UI once a match result is known. */
  function onMatch(result, ctx) {
    const d = result.player;
    if (ctx.rival && ctx.rival.gallery) bump('galleryFights');
    if (result.won) {
      if (result.hpLeft < 10) bump('underdogs');
      if (ctx.diff === 'emperor') { bump('emperorWins'); if (result.wins[1] === 0) bump('emperorSweeps'); }
      if (result.rival.id === d.id) bump('mirrorWins');
      if (d.custom && !d.gallery) bump('customWins');
      if (d.id === 'null') bump('nullWins');
      if (!d.custom && d.world && D.WORLD_ORDER.includes(d.world)) addTo('worldsWon', d.world);
      if (!d.custom && !d.boss) addTo('fightersWon', d.id);
    }
    check();
    flush();
  }

  SL.ach = {
    LIST, TIERS, BY_ID, progress, points, count, bump, check, flush, onMatch,
    onUnlock(fn) { listeners.push(fn); },
    unlockedAt(id) { return state().un[id] || 0; },
    beginMatch() { matchUnlocks = []; },
    matchUnlocks() { return matchUnlocks.slice(); },
  };
  listeners.push(def => matchUnlocks.push(def));
  O.onSave(() => { state(); });
})();
