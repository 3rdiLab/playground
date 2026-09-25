/* Shonen Legends: synthesized sound effects and taiko drums (no audio files). */
(() => {
  'use strict';
  const SL = (window.SL = window.SL || {});
  let AC = null, master = null, noiseBuf = null;

  const audio = {
    muted: false,
    init() {
      if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
      try {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
        noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
        const ch = noiseBuf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      } catch (e) { AC = null; }
    },
    play(name) {
      if (!AC || audio.muted) return;
      try { (SFX[name] || (() => {}))(); } catch (e) { /* audio is optional */ }
    },
  };

  function tone(f0, dur, type, vol, f1, delay = 0) {
    const t = AC.currentTime + delay, o = AC.createOscillator(), gn = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn); gn.connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, freq, ftype, f1, delay = 0) {
    const t = AC.currentTime + delay, s = AC.createBufferSource(), fl = AC.createBiquadFilter(), gn = AC.createGain();
    s.buffer = noiseBuf; fl.type = ftype; fl.frequency.setValueAtTime(freq, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(gn); gn.connect(master); s.start(t); s.stop(t + Math.min(dur, 0.98));
  }

  const SFX = {
    swing: () => noise(0.09, 0.12, 1800, 'highpass', 5000),
    hit: () => { noise(0.12, 0.35, 1100, 'lowpass', 300); tone(140, 0.12, 'sine', 0.35, 60); },
    heavy: () => { noise(0.25, 0.5, 700, 'lowpass', 150); tone(90, 0.3, 'sine', 0.5, 40); },
    block: () => { tone(1200, 0.06, 'square', 0.08, 700); noise(0.05, 0.15, 4000, 'highpass'); },
    jump: () => tone(260, 0.12, 'sine', 0.08, 520),
    dash: () => noise(0.18, 0.18, 600, 'bandpass', 3000),
    special: () => { tone(260, 0.35, 'sawtooth', 0.1, 900); noise(0.3, 0.15, 800, 'bandpass', 4000); },
    blip: () => tone(900, 0.08, 'triangle', 0.08, 1400),
    teleport: () => { tone(1400, 0.12, 'sine', 0.12, 300); noise(0.1, 0.1, 5000, 'highpass'); },
    awaken: () => { tone(55, 1.2, 'sawtooth', 0.22, 110); noise(0.95, 0.3, 200, 'lowpass', 3000); tone(440, 0.9, 'triangle', 0.08, 880); },
    ult: () => { tone(70, 0.9, 'square', 0.12, 280); noise(0.9, 0.2, 300, 'bandpass', 2500); },
    beam: () => { tone(120, 0.9, 'sawtooth', 0.16, 60); noise(0.95, 0.3, 1500, 'bandpass', 400); },
    boom: () => { noise(0.6, 0.55, 500, 'lowpass', 80); tone(60, 0.6, 'sine', 0.55, 25); },
    ko: () => { tone(90, 1.0, 'sine', 0.55, 30); noise(0.8, 0.45, 900, 'lowpass', 100); },
    select: () => tone(660, 0.07, 'triangle', 0.12),
    confirm: () => { tone(520, 0.08, 'triangle', 0.12); tone(780, 0.12, 'triangle', 0.12, null, 0.07); },
    drum: () => { tone(95, 0.22, 'sine', 0.22, 50); noise(0.06, 0.08, 300, 'lowpass'); },
    rim: () => noise(0.04, 0.06, 3500, 'highpass'),
  };
  audio.DRUM = [1, 0, 0, 2, 1, 0, 2, 0, 1, 0, 0, 2, 1, 1, 2, 0];

  SL.audio = audio;
})();
