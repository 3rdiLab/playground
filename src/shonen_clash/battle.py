"""The turn-based battle engine."""

from __future__ import annotations

import random
from dataclasses import dataclass

from shonen_clash.fighters import ADVANTAGE, Fighter, Technique

EFFECTIVE_MULTIPLIER = 1.5
CRIT_CHANCE = 0.1
CRIT_MULTIPLIER = 2.0
EP_REGEN_PER_TURN = 5


@dataclass(frozen=True)
class TurnResult:
    attacker: str
    defender: str
    technique: str
    hit: bool
    damage: int
    crit: bool
    effective: bool
    awakened: str | None
    ko: bool

    def describe(self) -> str:
        lines = [f"{self.attacker} uses {self.technique}!"]
        if self.damage == 0 and self.hit:
            lines.append(f"{self.attacker} gathers their energy.")
        elif not self.hit:
            lines.append("...but it missed!")
        else:
            if self.crit:
                lines.append("CRITICAL HIT!")
            if self.effective:
                lines.append("It overpowers their energy!")
            lines.append(f"{self.defender} takes {self.damage} damage.")
        if self.awakened:
            lines.append(f"{self.defender} refuses to fall... {self.awakened.upper()} AWAKENS!")
        if self.ko:
            lines.append(f"{self.defender} is down. {self.attacker} wins!")
        return "\n".join(lines)


def compute_damage(
    attacker: Fighter, defender: Fighter, technique: Technique, rng: random.Random
) -> tuple[bool, int, bool, bool]:
    """Return (hit, damage, crit, effective) for one technique."""
    if technique.power == 0:
        return True, 0, False, False
    if rng.random() > technique.accuracy:
        return False, 0, False, False
    multiplier = attacker.attack_multiplier
    effective = ADVANTAGE[attacker.energy] is defender.energy
    if effective:
        multiplier *= EFFECTIVE_MULTIPLIER
    crit = rng.random() < CRIT_CHANCE
    if crit:
        multiplier *= CRIT_MULTIPLIER
    damage = max(1, round(technique.power * multiplier * rng.uniform(0.85, 1.0)))
    return True, damage, crit, effective


class Battle:
    def __init__(self, first: Fighter, second: Fighter, seed: int | None = None) -> None:
        if first is second:
            raise ValueError("A fighter cannot battle themselves")
        self.fighters = (first, second)
        self.rng = random.Random(seed)
        self.turn = 0
        self.log: list[TurnResult] = []

    @property
    def active(self) -> Fighter:
        return self.fighters[self.turn % 2]

    @property
    def opponent(self) -> Fighter:
        return self.fighters[(self.turn + 1) % 2]

    @property
    def winner(self) -> Fighter | None:
        alive = [f for f in self.fighters if f.is_alive]
        return alive[0] if len(alive) == 1 else None

    @property
    def is_over(self) -> bool:
        return self.winner is not None

    def available(self, fighter: Fighter) -> list[Technique]:
        return [t for t in fighter.techniques if fighter.can_use(t)]

    def take_turn(self, technique: Technique) -> TurnResult:
        if self.is_over:
            raise RuntimeError("The battle is already over")
        attacker, defender = self.active, self.opponent
        if not attacker.can_use(technique):
            raise ValueError(f"{attacker.name} cannot use {technique.name} right now")

        attacker.spend(technique.cost)
        attacker.recover(technique.restore)
        hit, damage, crit, effective = compute_damage(attacker, defender, technique, self.rng)
        defender.take_damage(damage)
        awakened = defender.awakening if defender.maybe_awaken() else None
        attacker.recover(EP_REGEN_PER_TURN)

        result = TurnResult(
            attacker=attacker.name,
            defender=defender.name,
            technique=technique.name,
            hit=hit,
            damage=damage,
            crit=crit,
            effective=effective,
            awakened=awakened,
            ko=not defender.is_alive,
        )
        self.log.append(result)
        self.turn += 1
        return result

    def cpu_choice(self) -> Technique:
        """Pick a move for the active fighter: go big when possible, focus when drained."""
        options = [t for t in self.available(self.active) if t.power > 0]
        if not options:
            return next(t for t in self.active.techniques if t.restore > 0)
        options.sort(key=lambda t: t.power * t.accuracy, reverse=True)
        return options[0] if self.rng.random() < 0.7 else self.rng.choice(options)

    def auto_play(self, max_turns: int = 500) -> Fighter | None:
        while not self.is_over and self.turn < max_turns:
            self.take_turn(self.cpu_choice())
        return self.winner
