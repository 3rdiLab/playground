# Shonen Clash

A turn-based terminal battle game inspired by Naruto, Bleach and One Piece.
Chakra, reiatsu and haki fighters go head to head. When a fighter drops to
30% HP, they awaken into their ultimate form, the way shonen heroes always do.

## Quick start

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
