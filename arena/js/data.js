/* Shonen Legends: game data — energies, worlds, fighters, story and banter. */
(() => {
  'use strict';
  const SL = (window.SL = window.SL || {});

  // Six energies on a wheel. Each one overpowers the next two around the wheel.
  const ENERGY_ORDER = ['Chakra', 'Ki', 'Haki', 'Breath', 'Reiatsu', 'Cursed'];
  const ENERGY_COLOR = {
    Chakra: '#4aa8ff', Ki: '#ffd23f', Haki: '#ff6a3d', Breath: '#3ddc97',
    Reiatsu: '#ff4f6d', Cursed: '#a07bff', Void: '#c9c3e6',
  };
  function overpowers(a, b) {
    const i = ENERGY_ORDER.indexOf(a), j = ENERGY_ORDER.indexOf(b);
    if (i < 0 || j < 0) return false;
    const d = (j - i + 6) % 6;
    return d === 1 || d === 2;
  }

  const WORLDS = {
    leaf:   { name: 'Leaf Shinobi',        energy: 'Chakra',  stage: 'village',    stageName: 'Hidden Leaf Village' },
    spirit: { name: 'Spirit Court',        energy: 'Reiatsu', stage: 'soul',       stageName: 'Spirit Court at Midnight' },
    sea:    { name: 'Grand Line Pirates',  energy: 'Haki',    stage: 'sea',        stageName: 'Grand Line Deck' },
    star:   { name: 'Star Warriors',       energy: 'Ki',      stage: 'tournament', stageName: 'Star Tournament Ring' },
    cursed: { name: 'Cursed Academy',      energy: 'Cursed',  stage: 'city',       stageName: 'Shibuya Crossing, 2 a.m.' },
    hunter: { name: 'Demon Hunters',       energy: 'Breath',  stage: 'forest',     stageName: 'Wisteria Forest' },
    rift:   { name: 'The Rift',            energy: 'Void',    stage: 'rift',       stageName: 'The Rift Between Worlds' },
  };
  const WORLD_ORDER = ['leaf', 'spirit', 'sea', 'star', 'cursed', 'hunter'];

  // look.hair: spiky | swept | messy | flame | long | tall | crown
  // look.outfit: jacket | robe | vest | gi | suit | uniform | haori
  // look.extra: headband | sword | hat | swords3 | blindfold | earrings | hood | none
  const ROSTER = [
    { id: 'kaito', world: 'leaf', name: 'Kaito Uzuhara', short: 'Kaito', hp: 105, speed: 1.0, power: 1.0,
      awaken: 'Sage Mode', mark: 'sage',
      look: { hair: 'spiky', outfit: 'jacket', extra: 'headband' },
      colors: { skin: '#f1c79a', hair: '#ffd23a', top: '#ff7b1c', legs: '#ff7b1c', accent: '#1d3d8f', aura: '#ffb347', awaken: '#ff5a1f' },
      special: { name: 'Spiral Sphere', kind: 'rush', fx: 'sphere' },
      ult: { name: 'Planetary Spiral Shuriken', kind: 'bigShot' },
      quote: 'I never go back on my word. That is my ninja way.' },
    { id: 'ren', world: 'leaf', name: 'Ren Kageyama', short: 'Ren', hp: 95, speed: 1.12, power: 1.02,
      awaken: 'Eternal Eye', mark: 'eye',
      look: { hair: 'swept', outfit: 'robe', extra: 'none' },
      colors: { skin: '#efd2b4', hair: '#1c1d33', top: '#3b3f63', legs: '#23253d', accent: '#9b87ff', aura: '#a996ff', awaken: '#b02cff' },
      special: { name: 'Lightning Blade', kind: 'rush', fx: 'lightning' },
      ult: { name: 'Black Flame', kind: 'pillars', color: '#b02cff' },
      quote: 'You are not worth my full power. Not yet.' },

    { id: 'ichiro', world: 'spirit', name: 'Ichiro Kurosawa', short: 'Ichiro', hp: 100, speed: 1.03, power: 1.02,
      awaken: 'Bankai: Crimson Moon', mark: 'mask',
      look: { hair: 'spiky', outfit: 'robe', extra: 'sword' },
      colors: { skin: '#f0c8a0', hair: '#ff8a2b', top: '#17171f', legs: '#17171f', accent: '#e9e9f2', aura: '#8fd8ff', awaken: '#ff2640' },
      special: { name: 'Moonfang Wave', kind: 'wave' },
      ult: { name: 'Final Eclipse', kind: 'bigWave' },
      quote: 'I fight to protect. That is all the reason I need.' },
    { id: 'sora', world: 'spirit', name: 'Sora Himura', short: 'Sora', hp: 96, speed: 1.08, power: 1.0,
      awaken: 'Bankai: Silver Blizzard', mark: 'frost',
      look: { hair: 'long', outfit: 'robe', extra: 'sword' },
      colors: { skin: '#f4dcc6', hair: '#171a2b', top: '#15161e', legs: '#15161e', accent: '#f2f5ff', aura: '#bfe9ff', awaken: '#7fe0ff' },
      special: { name: 'Frost Petal', kind: 'wave', color: '#bfe9ff' },
      ult: { name: 'White Moon Dance', kind: 'pillars', color: '#9fe6ff' },
      quote: 'Stand still. The cold will be quick.' },

    { id: 'taro', world: 'sea', name: 'Taro D. Storm', short: 'Taro', hp: 112, speed: 0.95, power: 1.0,
      awaken: 'Gear Overdrive', mark: 'none', awakenHair: '#f4f1ea',
      look: { hair: 'messy', outfit: 'vest', extra: 'hat' },
      colors: { skin: '#e9b88c', hair: '#16161e', top: '#d8262f', legs: '#2b58d6', accent: '#ffd23a', aura: '#ff5c6c', awaken: '#f4f1ea' },
      special: { name: 'Armament Rocket', kind: 'stretch' },
      ult: { name: "Conqueror's Thunder King", kind: 'meteor' },
      quote: "I'm gonna be King of the Pirates. You're just in the way!" },
    { id: 'kenji', world: 'sea', name: 'Kenji Hayate', short: 'Kenji', hp: 110, speed: 0.98, power: 1.06,
      awaken: 'Asura Spirit', mark: 'scar',
      look: { hair: 'messy', outfit: 'robe', extra: 'swords3' },
      colors: { skin: '#e2b489', hair: '#43b35a', top: '#eef0f2', legs: '#1b1c22', accent: '#2f8a45', aura: '#7ce38f', awaken: '#ff4a3a' },
      special: { name: 'Tiger Hunt', kind: 'rush', fx: 'slash' },
      ult: { name: 'Nine-Sword Asura', kind: 'dashStrike', hits: 9 },
      quote: 'Nothing happened here. Walk away while you can.' },

    { id: 'kairo', world: 'star', name: 'Kairo Son', short: 'Kairo', hp: 108, speed: 1.02, power: 1.03,
      awaken: 'Super Ascension', mark: 'none', awakenHair: '#ffe066',
      look: { hair: 'tall', outfit: 'gi', extra: 'none' },
      colors: { skin: '#f0c49a', hair: '#15131c', top: '#ff8c1a', legs: '#ff8c1a', accent: '#2a53c9', aura: '#9fd2ff', awaken: '#ffd23f' },
      special: { name: 'Ki Volley', kind: 'barrage', color: '#9fd2ff' },
      ult: { name: 'Solar Wave Cannon', kind: 'beam', color: '#7fc8ff' },
      quote: "You're strong! This is gonna be fun!" },
    { id: 'vex', world: 'star', name: 'Prince Vex', short: 'Vex', hp: 102, speed: 1.05, power: 1.05,
      awaken: 'Super Ascension', mark: 'none', awakenHair: '#ffe066',
      look: { hair: 'flame', outfit: 'suit', extra: 'none' },
      colors: { skin: '#eec39c', hair: '#15131c', top: '#243a8f', legs: '#243a8f', accent: '#f2f2f6', aura: '#d08bff', awaken: '#ffd23f' },
      special: { name: 'Instant Strike', kind: 'teleport' },
      ult: { name: 'Royal Flash', kind: 'beam', color: '#ffe066' },
      quote: 'Kneel before royalty, low-class warrior.' },

    { id: 'yuto', world: 'cursed', name: 'Yuto Kagari', short: 'Yuto', hp: 110, speed: 1.06, power: 1.0,
      awaken: 'Vessel Awakening', mark: 'marks',
      look: { hair: 'messy', outfit: 'uniform', extra: 'hood' },
      colors: { skin: '#f1c7a0', hair: '#ff8fb1', top: '#1b2140', legs: '#1b2140', accent: '#d8263a', aura: '#ff6b8a', awaken: '#ff2046' },
      special: { name: 'Divergent Fist', kind: 'rush', fx: 'fist' },
      ult: { name: 'Black Spark', kind: 'dashStrike', hits: 1 },
      quote: "I'm not letting anyone die without a proper send-off." },
    { id: 'kyo', world: 'cursed', name: 'Kyo Shirogane', short: 'Kyo', hp: 100, speed: 1.0, power: 1.08,
      awaken: 'Six Eyes Unsealed', mark: 'eyes6',
      look: { hair: 'tall', outfit: 'uniform', extra: 'blindfold' },
      colors: { skin: '#f5dcc8', hair: '#eef1ff', top: '#141833', legs: '#141833', accent: '#3a4480', aura: '#7fb6ff', awaken: '#8fd0ff' },
      special: { name: 'Lapse Blue', kind: 'wave', color: '#4a8dff', pull: true },
      ult: { name: 'Boundless Void', kind: 'domain' },
      quote: "Relax. I'm the strongest. You'll be fine... probably." },

    { id: 'tenji', world: 'hunter', name: 'Tenji Hanafuda', short: 'Tenji', hp: 104, speed: 1.04, power: 1.02,
      awaken: 'Demon Slayer Mark', mark: 'flame',
      look: { hair: 'swept', outfit: 'haori', extra: 'earrings', pattern: 'checker' },
      colors: { skin: '#f2c8a2', hair: '#7a1f26', top: '#1f8a5a', legs: '#1a1a22', accent: '#111317', aura: '#58b8ff', awaken: '#ff7a2a' },
      special: { name: 'Water Wheel', kind: 'wave', color: '#58b8ff' },
      ult: { name: 'Sun Halo Dance', kind: 'pillars', color: '#ff8a2a' },
      quote: "I'll cut through you, then I'll help you rest." },
    { id: 'zen', world: 'hunter', name: 'Zen Raimaru', short: 'Zen', hp: 94, speed: 1.16, power: 1.0,
      awaken: 'Sleeping Stance', mark: 'sleep',
      look: { hair: 'spiky', outfit: 'haori', extra: 'sword', pattern: 'triangles' },
      colors: { skin: '#f3d0ad', hair: '#ffd23a', top: '#f1c21b', legs: '#1a1a22', accent: '#f4f1ea', aura: '#ffe066', awaken: '#fff2a8' },
      special: { name: 'Thunderclap', kind: 'teleport' },
      ult: { name: 'Godspeed Thunder', kind: 'dashStrike', hits: 1 },
      quote: "I'm gonna die, I'm gonna die... okay, fine, let's go." },

    { id: 'null', world: 'rift', name: 'Null, the Void Emperor', short: 'Null', hp: 120, speed: 1.02, power: 1.1, boss: true,
      awaken: 'Event Horizon', mark: 'void',
      look: { hair: 'crown', outfit: 'suit', extra: 'none' },
      colors: { skin: '#b9b4d6', hair: '#1a1030', top: '#0f0b1c', legs: '#0f0b1c', accent: '#8a5cff', aura: '#8a5cff', awaken: '#e04bff' },
      special: { name: 'Void Shards', kind: 'barrage', color: '#b58cff' },
      ult: { name: 'Collapse', kind: 'bigShot', color: '#8a5cff', variant: 'blackhole' },
      quote: 'Every world ends. I am simply early.' },
  ];

  // Short, character-true lines used when live AI banter is off or unavailable.
  const LINES = {
    kaito:  { intro: "Believe it! I'm taking you down!", win: "Told you. I don't give up!", lose: "I'll train harder. This isn't over!", awaken: 'Nature energy... flowing!' },
    ren:    { intro: 'Hmph. Try to keep up.', win: 'Weak. As expected.', lose: '...I underestimated you.', awaken: 'Now you see what my eyes see.' },
    ichiro: { intro: "Let's settle this.", win: 'Stay down. You fought well.', lose: "Damn... I'll get stronger.", awaken: 'Bankai!' },
    sora:   { intro: 'Your spirit pressure is trembling.', win: 'The snow covers everything.', lose: 'The ice... cracked.', awaken: 'Scatter, Silver Blizzard.' },
    taro:   { intro: "Hey! You look strong! Let's fight!", win: "Shishishi! I'm hungry now!", lose: "Ow... next time I'm winning!", awaken: 'Gear Overdrive! This feels great!' },
    kenji:  { intro: "Three swords. You'd better have more than one trick.", win: 'Not even a warm-up.', lose: "Hmph. I'll carve this lesson in.", awaken: 'Nine faces. Nine arms. Nine swords.' },
    kairo:  { intro: "Hi! I'm Kairo! Wanna go all out?", win: "That was awesome! Let's go again!", lose: 'Wow, you really are strong!', awaken: 'HAAAAAAH!' },
    vex:    { intro: 'You dare challenge the prince?', win: 'Know your place.', lose: 'Impossible! This is a fluke!', awaken: "Witness the power of a true prince!" },
    yuto:   { intro: "Alright, I'll go first.", win: 'Phew. Thanks for the fight.', lose: "Can't stop here... I still have work to do.", awaken: 'Something inside me just woke up.' },
    kyo:    { intro: "Don't worry, I'll go easy on you.", win: 'Throughout heaven and earth, I alone am the strongest.', lose: 'Huh. Interesting.', awaken: 'Let me take off the blindfold.' },
    tenji:  { intro: 'I can smell your fear. Let us begin.', win: 'Rest now. It is over.', lose: 'I will not break... I will stand again.', awaken: 'My heart is burning!' },
    zen:    { intro: "Please don't hurt me! ...Fine, let's go.", win: 'Wait, I won? I WON?!', lose: 'I knew it! I knew this would happen!', awaken: 'Zzz... Thunder Breathing.' },
    null:   { intro: 'Six worlds. Six energies. All mine.', win: 'Silence is the natural order.', lose: 'Impossible... the void... recedes...', awaken: 'Witness the event horizon.' },
    custom: { intro: 'You ready? Because I am.', win: "That's how it's done.", lose: 'Next round is mine.', awaken: 'This is my true power!' },
  };

  const STORY = [
    { world: 'leaf', foe: 'ren', alt: 'kaito', title: 'Cracks in the Leaf', diff: 'rookie', hpMult: 1.0,
      intro: [
        ['narrator', 'A violet tear splits the sky above the Hidden Leaf. Six worlds that were never meant to touch begin to bleed into each other.'],
        ['foe', 'The rift is calling me. Its power answers every question I ever had.'],
        ['player', "That isn't you talking. Snap out of it, or I'll knock you out of it!"],
      ],
      outro: [['foe', "My head... it's clear. The rift was feeding on my anger."], ['foe', 'Something is hunting the strongest fighters of every world. Go through the tear. I will hold the village.']] },
    { world: 'spirit', foe: 'sora', alt: 'ichiro', title: 'Frost over the Spirit Court', diff: 'rookie', hpMult: 1.1,
      intro: [
        ['narrator', 'Snow falls upward in the Spirit Court. The barracks are empty and the moon has turned violet.'],
        ['foe', 'An intruder from the living world. The Void Emperor said you would come.'],
        ['player', "Void Emperor? So someone's pulling the strings. Move aside."],
      ],
      outro: [['foe', 'He calls himself Null. He is collecting energy from every world.'], ['foe', 'Chakra, reiatsu, haki, ki, cursed energy, breath. With all six he can erase the boundaries for good.']] },
    { world: 'sea', foe: 'kenji', alt: 'taro', title: 'Storm on the Grand Line', diff: 'captain', hpMult: 1.1,
      intro: [
        ['narrator', 'The ocean churns under a purple sky. A lone swordsman stands on the deck with three blades drawn.'],
        ['foe', "Captain's missing. Some shadow took him. If you're with that shadow, you're finished."],
        ['player', "I'm hunting that shadow too. But I get the feeling you need to test me first."],
      ],
      outro: [['foe', "You're the real deal. Fine. Null took our captain's haki straight out of his body."], ['foe', "Get it back. I'll keep this ship afloat until you do."]] },
    { world: 'star', foe: 'vex', alt: 'kairo', title: 'The Star Tournament', diff: 'captain', hpMult: 1.2,
      intro: [
        ['narrator', 'A floating tournament ring hangs over a shattered planet. The crowd is silent and the scoreboard only shows one name: Null.'],
        ['foe', 'That void creature promised me the strongest opponent in six worlds. Are you it?'],
        ['player', "He's using you to drain your ki. Fight me and find out who's stronger."],
      ],
      outro: [['foe', 'Tch. You are strong. Stronger than that parasite deserves.'], ['foe', "Go. Beat him. Then come back, because you and I aren't finished."]] },
    { world: 'cursed', foe: 'kyo', alt: 'yuto', title: 'Midnight at Shibuya', diff: 'captain', hpMult: 1.25,
      intro: [
        ['narrator', 'Shibuya is sealed inside a black curtain. Traffic lights blink over empty streets.'],
        ['foe', "Oh, you're the one tearing through the worlds. Null wants me to stop you. I kind of want to see what you've got."],
        ['player', "You're not even under his control, are you? You're just bored."],
      ],
      outro: [['foe', 'Okay, okay. You pass.'], ['foe', "Null's hiding in the last world before the rift: the Wisteria Forest. The demons there are already his."]] },
    { world: 'hunter', foe: 'zen', alt: 'tenji', title: 'Wisteria in Bloom', diff: 'emperor', hpMult: 1.25,
      intro: [
        ['narrator', 'Wisteria petals drift through a forest that should keep demons away. Tonight they turn the color of the rift.'],
        ['foe', "Zzz... the void... says... you're the last obstacle..."],
        ['player', "He's asleep and still under Null's spell. I'll wake him up the hard way."],
      ],
      outro: [['foe', "Wha? Where am I? Why does my face hurt?!"], ['foe', "The rift is right behind those trees. Please be careful. I am NOT going in there."]] },
    { world: 'rift', foe: 'null', alt: 'null', title: 'The Void Emperor', diff: 'emperor', hpMult: 1.6, boss: true,
      intro: [
        ['narrator', 'Inside the rift, fragments of all six worlds orbit a black throne. The Void Emperor rises.'],
        ['foe', 'You carried a piece of every world here for me. How thoughtful.'],
        ['player', 'Every fighter you corrupted is waiting for me to bring their power home. This ends now.'],
      ],
      outro: [['narrator', 'The throne cracks. Six streams of energy flood back to their worlds, and the tear in the sky seals shut.'], ['narrator', 'Null is now unlocked in Versus. The worlds remember your name.']] },
  ];

  for (const d of ROSTER) d.energy = WORLDS[d.world].energy;
  const ENERGY_STAGE = { Chakra: 'village', Reiatsu: 'soul', Haki: 'sea', Ki: 'tournament', Cursed: 'city', Breath: 'forest', Void: 'rift' };

  SL.data = { ENERGY_STAGE, ENERGY_ORDER, ENERGY_COLOR, overpowers, WORLDS, WORLD_ORDER, ROSTER, LINES, STORY };
})();
