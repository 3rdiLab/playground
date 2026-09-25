# Shonen Clash

A turn-based terminal battle game inspired by Naruto, Bleach and One Piece.
Chakra, reiatsu and haki fighters go head to head. When a fighter drops to
30% HP, they awaken into their ultimate form, the way shonen heroes always do.

## Play in your browser

**[Shonen Legends: Arena](https://claude.ai/artifact/Ke7w1epWLTStsVwGdugcFf)** is a real-time 2D anime fighter.
It runs from a link, with touch buttons on phones.

- **12 fighters from 6 worlds**, plus a secret boss: Leaf Shinobi (chakra), Spirit Court (reiatsu),
  Grand Line Pirates (haki), Star Warriors (ki), Cursed Academy (cursed energy) and Demon Hunters (breath).
  All characters are original fan-style homages rather than the official ones.
- **Energy wheel:** each energy overpowers the next two on the wheel for 20% extra damage.
- **Story mode:** seven chapters across the worlds, ending against Null, the Void Emperor. Beating him unlocks Null.
- **Fighter creator:** design a fighter's look, colors, moves, awakening and stats, then share it to the community gallery.
- **Leaderboard:** shared wins, best streak and story progress for everyone who opens the game on claude.ai.
- **Rival AI banter:** rivals can trash-talk you live with Claude, reacting to how the match went.
  Switch it to classic lines in the header.

Source: [`arena/`](arena/). `index.html` holds the layout and styles. The scripts in `arena/js/` load in this order:
`data.js` (roster, story, lines), `audio.js`, `render.js` (stages, fighters, effects), `engine.js`
(combat, AI, camera, input), `online.js` (saves, leaderboard, gallery, banter) and `ui.js` (screens).

## Terminal version

This Python version is a turn-based game you run in a terminal. It can't be played from the
GitHub page itself.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
shonen-clash          # or: python -m shonen_clash
```

## How it plays

| Energy  | Overpowers | Flavor                                  |
|---------|------------|-----------------------------------------|
| Chakra  | Haki       | Clever jutsu outwit raw willpower       |
| Haki    | Reiatsu    | Willpower crushes spiritual pressure    |
| Reiatsu | Chakra     | Spiritual pressure overwhelms chakra    |

- **Techniques** cost EP (energy). Stronger moves are less accurate.
- **Focus** skips your attack to restore 25 EP. Every turn also regenerates 5 EP.
- **Type advantage** deals 1.5x damage. **Critical hits** (10% chance) deal 2x.
- **Awakening:** at 30% HP or less, a fighter enters their ultimate form (Sage
  Mode, Bankai, Gear Overdrive...) and deals 1.5x damage for the rest of the fight.

## Roster

| Fighter          | Energy  | Awakening            |
|------------------|---------|----------------------|
| Kaito Uzuhara    | Chakra  | Sage Mode            |
| Ren Kageyama     | Chakra  | Eternal Eye          |
| Ichiro Kurosawa  | Reiatsu | Bankai: Crimson Moon |
| Taro D. Storm    | Haki    | Gear Overdrive       |

## Development

```bash
pytest
```

The engine lives in `src/shonen_clash/battle.py` and the fighters live in
`src/shonen_clash/fighters.py`. Battles accept a `seed`, so they can be
replayed exactly, which is what the tests rely on.
