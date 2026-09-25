/* Shonen Legends: online versus over the artifact room.
   Lobby = presence ({lobby}). Challenges = events on the "duel" topic.
   The challenger hosts: it runs the real simulation and publishes compact
   snapshots in its presence (~30/s); the guest renders those snapshots and
   publishes its controls in presence ({inp}). Presses travel as counters so
   coalesced presence updates never lose a button press. */
(() => {
  'use strict';
  const SL = window.SL, O = SL.online, E = SL.engine, D = SL.data;

  const net = (SL.net = {
    room: null, status: 'connecting', match: null, pendingOut: null, pendingIn: null,
    onChange: () => {}, onInvite: () => {}, onStart: () => {}, onEnd: () => {}, onNotice: () => {},
  });
  const hasRuntime = typeof window.claude === 'object' && window.claude && typeof window.claude.use === 'function';
  const newId = () => Math.random().toString(36).slice(2, 10);

  // ---------- fighters over the wire ----------
  function payload(def) {
    if (!def.custom) return { id: def.id };
    const c = { ...def }; delete c.shared; delete c.author; delete c.gallery; return c;
  }
  function resolve(raw) {
    if (!raw || typeof raw !== 'object') return D.ROSTER[0];
    const roster = D.ROSTER.find(d => d.id === raw.id && !raw.custom);
    if (roster) return roster;
    const d = O.sanitizeFighter(raw, 'net_' + newId());
    d.id = 'net_' + String(d.id).slice(0, 30); d.gallery = true;
    return d;
  }

  // ---------- lobby ----------
  let myDefFn = () => D.ROSTER[0];
  net.setMyFighter = fn => { myDefFn = fn; publishLobby(); };
  function publishLobby(state) {
    if (!net.room) return;
    const d = myDefFn();
    const st = state || (net.match ? 'busy' : 'open');
    net.room.presence({ lobby: { st, f: d.name.slice(0, 30), e: d.energy, v: 1 } }).catch(() => {});
  }
  net.peers = () => {
    if (!net.room) return [];
    return net.room.peers().filter(p => !p.sameTab && p.kind === 'viewer' && p.presence && p.presence.lobby && p.presence.lobby.v === 1);
  };
  net.self = () => (net.room ? net.room.peers().find(p => p.sameTab) : null);
  const peerById = id => (net.room ? net.room.peers().find(p => p.peer === id) : null);

  // ---------- messaging ----------
  function send(to, data) { if (!net.room) return Promise.resolve(); return net.room.emit('duel', { ...data, to }).catch(e => { if (e && e.code === 'not_permitted') net.onNotice('Your access level on this page does not allow online challenges. Ask the owner for Contributor access.'); }); }

  net.challenge = peer => {
    if (net.match || net.pendingOut) return false;
    const mid = newId();
    net.pendingOut = { mid, to: peer, at: Date.now() };
    send(peer, { t: 'invite', mid, def: payload(myDefFn()) });
    setTimeout(() => { if (net.pendingOut && net.pendingOut.mid === mid) { net.pendingOut = null; net.onNotice('No answer. The challenge expired.'); net.onChange(); } }, 20000);
    net.onChange();
    return true;
  };
  net.cancelChallenge = () => { if (net.pendingOut) { send(net.pendingOut.to, { t: 'decline', mid: net.pendingOut.mid }); net.pendingOut = null; net.onChange(); } };
  net.accept = () => {
    const inv = net.pendingIn; if (!inv || net.match) return;
    net.pendingIn = null;
    net.awaitingStart = { mid: inv.mid, host: inv.from, at: Date.now() };
    net.myAccepted = myDefFn();
    send(inv.from, { t: 'accept', mid: inv.mid, def: payload(net.myAccepted) });
    setTimeout(() => { if (net.awaitingStart && net.awaitingStart.mid === inv.mid) { net.awaitingStart = null; net.onNotice('The match did not start. Try challenging them instead.'); } }, 10000);
  };
  net.decline = () => { const inv = net.pendingIn; if (!inv) return; net.pendingIn = null; send(inv.from, { t: 'decline', mid: inv.mid }); net.onChange(); };

  function onDuel(msg) {
    const d = msg.data;
    if (!d || typeof d !== 'object' || msg.sameTab) return;
    const me = net.self();
    if (!me || d.to !== me.peer) return;
    const mid = String(d.mid || '').slice(0, 16);
    switch (d.t) {
      case 'invite':
        if (net.match || net.pendingIn) { send(msg.peer, { t: 'decline', mid, busy: true }); return; }
        net.pendingIn = { mid, from: msg.peer, by: msg.by, def: resolve(d.def) };
        net.onInvite(net.pendingIn);
        setTimeout(() => { if (net.pendingIn && net.pendingIn.mid === mid) { net.pendingIn = null; net.onInvite(null); } }, 20000);
        break;
      case 'decline':
        if (net.pendingOut && net.pendingOut.mid === mid) { net.pendingOut = null; net.onNotice(d.busy ? 'They are busy in another match.' : 'Challenge declined.'); net.onChange(); }
        if (net.pendingIn && net.pendingIn.mid === mid) { net.pendingIn = null; net.onInvite(null); }
        break;
      case 'accept': {
        if (!net.pendingOut || net.pendingOut.mid !== mid || net.pendingOut.to !== msg.peer) return;
        net.pendingOut = null;
        const p1 = myDefFn(), p2 = resolve(d.def);
        const stages = [...new Set([p1, p2].map(x => D.ENERGY_STAGE[x.energy] || 'village'))];
        const stage = stages[Math.floor(Math.random() * stages.length)];
        send(msg.peer, { t: 'start', mid, stage, p1: payload(p1), p2: d.def });
        startHost({ mid, opp: msg.peer, oppBy: msg.by, p1, p2, stage });
        break;
      }
      case 'start':
        if (!net.awaitingStart || net.awaitingStart.mid !== mid || net.awaitingStart.host !== msg.peer) return;
        net.awaitingStart = null;
        startGuest({ mid, opp: msg.peer, oppBy: msg.by, p1: resolve(d.p1), p2: net.myAccepted || myDefFn(), stage: Object.values(D.ENERGY_STAGE).includes(d.stage) ? d.stage : 'village' });
        break;
      case 'end':
        if (net.match && net.match.mid === mid && net.match.role === 'guest') finishGuest(d);
        break;
      case 'leave':
        if (net.match && net.match.mid === mid) abort('Your opponent left the match.');
        break;
    }
  }

  // ---------- host ----------
  const BIT = { left: 1, right: 2, block: 4, charge: 8, jump: 16 };
  function stageName(stage) { const w = Object.values(D.WORLDS).find(x => x.stage === stage); return w ? w.stageName : ''; }
  function startHost(m) {
    net.match = { ...m, role: 'host', seen: { a: 0, s: 0, u: 0, j: 0, d: 0 }, inited: false };
    publishLobby('busy');
    net.onStart(net.match);
    const match = net.match;
    E.start({
      p1: O.effective(m.p1), p2: O.effective(m.p2), diff: 'captain', stage: m.stage, stageName: stageName(m.stage),
      labels: ['YOU', 'RIVAL'], online: true,
      remote: inp => {
        const p = peerById(match.opp), x = p && p.presence && p.presence.inp;
        for (const k of Object.keys(BIT)) inp[k] = false;
        inp.attack = inp.special = inp.ult = false; inp.dash = 0;
        if (!x || x.m !== match.mid) return;
        const h = x.h | 0;
        for (const [k, b] of Object.entries(BIT)) inp[k] = !!(h & b);
        const seen = match.seen;
        if (!match.inited) { for (const k of ['a', 's', 'u', 'j', 'd']) seen[k] = x[k] | 0; match.inited = true; return; }
        const pressed = k => { const v = x[k] | 0; if (v > seen[k]) { seen[k] = v; return true; } return false; };
        inp.attack = pressed('a'); inp.special = pressed('s'); inp.ult = pressed('u');
        if (pressed('j')) inp.jump = true;
        if (pressed('d')) inp.dash = x.dd === -1 ? -1 : 1;
      },
      onFrame: () => {
        if (!net.room || net.match !== match) return;
        let snap = E.snapshot(); snap.m = match.mid;
        let json = JSON.stringify(snap);
        if (json.length > 3800) { snap.tx = []; snap.pr = snap.pr.slice(0, 4); json = JSON.stringify(snap); }
        if (json.length <= 3900) net.room.presence({ net: snap }).catch(() => {});
      },
      onEnd: result => {
        if (net.match !== match) return;
        send(match.opp, { t: 'end', mid: match.mid, w: result.wins });
        finish({ won: result.won, draw: result.draw, wins: result.wins, player: m.p1, rival: m.p2, oppBy: m.oppBy });
      },
    });
  }

  // ---------- guest ----------
  function startGuest(m) {
    net.match = { ...m, role: 'guest', counts: { a: 0, s: 0, u: 0, j: 0, d: 0 }, dd: 1, lastSent: '' };
    publishLobby('busy');
    net.onStart(net.match);
    const match = net.match;
    E.view({
      p1: O.effective(m.p1), p2: O.effective(m.p2), stage: m.stage, stageName: stageName(m.stage),
      labels: ['RIVAL', 'YOU'], me: 1, online: true,
      onFrame: () => {
        if (!net.room || net.match !== match) return;
        const i = E.readInput(), c = match.counts;
        if (i.attack) c.a++; if (i.special) c.s++; if (i.ult) c.u++; if (i.jump) c.j++; if (i.dash) { c.d++; match.dd = i.dash; }
        let h = 0; for (const [k, b] of Object.entries(BIT)) if (i[k]) h |= b;
        const inp = { m: match.mid, h, a: c.a, s: c.s, u: c.u, j: c.j, d: c.d, dd: match.dd };
        const key = JSON.stringify(inp);
        if (key !== match.lastSent) { match.lastSent = key; net.room.presence({ inp }).catch(() => {}); }
        const host = peerById(match.opp), snap = host && host.presence && host.presence.net;
        if (snap && snap.m === match.mid) {
          E.applySnapshot(snap);
          if (snap.ph === 'matchEnd' && !match.ended) finishGuest({ w: snap.w });
        }
      },
    });
  }
  function finishGuest(d) {
    const m = net.match; if (!m || m.ended) return;
    m.ended = true;
    const w = Array.isArray(d.w) ? d.w : [0, 0];
    // host is fighter 0, so from the guest's side the wins are reversed
    finish({ won: w[1] > w[0], draw: w[0] === w[1], wins: [w[1] | 0, w[0] | 0], player: m.p2, rival: m.p1, oppBy: m.oppBy });
  }

  function finish(r) {
    const m = net.match; if (!m) return;
    m.ended = true;
    setTimeout(() => {
      clearMatch();
      net.onEnd({ ...r, opp: m.opp });
    }, 1200);
  }
  function clearMatch() {
    net.match = null;
    if (net.room) net.room.presence({ net: null, inp: null }).catch(() => {});
    publishLobby();
  }
  function abort(reason) {
    if (!net.match) return;
    const m = net.match;
    clearMatch();
    E.stop();
    net.onEnd({ aborted: true, reason, opp: m.opp });
  }
  net.leave = () => {
    const m = net.match; if (!m) return;
    send(m.opp, { t: 'leave', mid: m.mid });
    clearMatch();
  };

  // ---------- boot ----------
  if (!hasRuntime) { net.status = 'offline'; return; }
  window.claude.use('room').then(room => {
    if (!room) { net.status = 'offline'; net.onChange(); return; }
    net.room = room; net.status = 'online';
    room.on('duel', onDuel, () => { net.status = 'offline'; net.onChange(); });
    room.onPeers(ch => {
      if (net.match && ch.left.some(p => p.peer === net.match.opp)) abort('Your opponent disconnected.');
      if (net.pendingIn && ch.left.some(p => p.peer === net.pendingIn.from)) { net.pendingIn = null; net.onInvite(null); }
      net.onChange();
    }, () => { net.status = 'offline'; net.onChange(); });
    room.onConnection(ok => { net.connected = ok; net.onChange(); });
    publishLobby();
    net.onChange();
  }).catch(() => { net.status = 'offline'; net.onChange(); });
})();
