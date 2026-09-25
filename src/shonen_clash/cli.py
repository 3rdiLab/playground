"""Play Shonen Clash in the terminal."""

from __future__ import annotations

import random

from shonen_clash.battle import Battle
from shonen_clash.fighters import Fighter, roster


def bar(current: int, maximum: int, width: int = 20) -> str:
    filled = round(width * current / maximum) if maximum else 0
    return "█" * filled + "░" * (width - filled)


def status(fighter: Fighter) -> str:
    aura = f" [{fighter.awakening}]" if fighter.awakened else ""
    return (
        f"{fighter.name} ({fighter.energy.value}){aura}\n"
        f"  HP {bar(fighter.hp, fighter.max_hp)} {fighter.hp}/{fighter.max_hp}\n"
        f"  EP {bar(fighter.ep, fighter.max_ep)} {fighter.ep}/{fighter.max_ep}"
    )


def pick(prompt: str, count: int) -> int:
    while True:
        raw = input(prompt).strip()
        if raw.isdigit() and 1 <= int(raw) <= count:
            return int(raw) - 1
        print(f"Enter a number from 1 to {count}.")


def main() -> None:
    fighters = roster()
    print("=== SHONEN CLASH ===\nChoose your fighter:")
    for i, f in enumerate(fighters, 1):
        print(f"  {i}. {f.name} ({f.energy.value}) - awakens into {f.awakening}")
    player = fighters.pop(pick("> ", len(fighters)))
    cpu = random.choice(fighters)
    print(f"\n{player.name} vs {cpu.name}! FIGHT!\n")

    battle = Battle(player, cpu)
    try:
        while not battle.is_over:
            if battle.active is player:
                print(status(player), status(cpu), sep="\n")
                moves = player.techniques
                for i, t in enumerate(moves, 1):
                    note = "" if player.can_use(t) else "  (not enough EP)"
                    print(f"  {i}. {t.name}  pow {t.power}  cost {t.cost}{note}")
                move = moves[pick("> ", len(moves))]
                if not player.can_use(move):
                    print("You don't have the energy for that!\n")
                    continue
            else:
                move = battle.cpu_choice()
            print("\n" + battle.take_turn(move).describe() + "\n")
    except (KeyboardInterrupt, EOFError):
        print("\nYou fled the battle.")
