"""Fighters, techniques and the three power systems."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Energy(Enum):
    CHAKRA = "Chakra"
    REIATSU = "Reiatsu"
    HAKI = "Haki"


# Each energy type overpowers exactly one other, rock-paper-scissors style:
# clever chakra jutsu outwit raw haki, haki willpower crushes spiritual reiatsu,
# and reiatsu pressure overwhelms chakra.
ADVANTAGE: dict[Energy, Energy] = {
    Energy.CHAKRA: Energy.HAKI,
    Energy.HAKI: Energy.REIATSU,
    Energy.REIATSU: Energy.CHAKRA,
}

AWAKEN_THRESHOLD = 0.3
AWAKEN_MULTIPLIER = 1.5


@dataclass(frozen=True)
class Technique:
    name: str
    power: int
    cost: int
    accuracy: float = 1.0
    restore: int = 0


FOCUS = Technique("Focus", power=0, cost=0, restore=25)


@dataclass
class Fighter:
    name: str
    energy: Energy
    max_hp: int
    max_ep: int
    techniques: list[Technique]
    awakening: str
    hp: int = field(init=False)
    ep: int = field(init=False)
    awakened: bool = field(default=False, init=False)

    def __post_init__(self) -> None:
        self.hp = self.max_hp
        self.ep = self.max_ep
        if FOCUS not in self.techniques:
            self.techniques = [*self.techniques, FOCUS]

    @property
    def is_alive(self) -> bool:
        return self.hp > 0

    @property
    def attack_multiplier(self) -> float:
        return AWAKEN_MULTIPLIER if self.awakened else 1.0

    def can_use(self, technique: Technique) -> bool:
        return technique in self.techniques and self.ep >= technique.cost

    def take_damage(self, amount: int) -> int:
        dealt = min(self.hp, max(0, amount))
        self.hp -= dealt
        return dealt

    def spend(self, cost: int) -> None:
        if cost > self.ep:
            raise ValueError(f"{self.name} lacks the {self.energy.value} for that ({self.ep}/{cost})")
        self.ep -= cost

    def recover(self, amount: int) -> None:
        self.ep = min(self.max_ep, self.ep + amount)

    def maybe_awaken(self) -> bool:
        """Awaken once when pushed to the brink, like every good shonen protagonist."""
        if self.awakened or not self.is_alive or self.hp > self.max_hp * AWAKEN_THRESHOLD:
            return False
        self.awakened = True
        return True


def roster() -> list[Fighter]:
    """Fresh copies of every playable fighter."""
    return [
        Fighter(
            "Kaito Uzuhara", Energy.CHAKRA, max_hp=120, max_ep=100, awakening="Sage Mode",
            techniques=[
                Technique("Shadow Clone Barrage", power=18, cost=10),
                Technique("Spiral Sphere", power=32, cost=25, accuracy=0.9),
                Technique("Planetary Spiral Shuriken", power=50, cost=45, accuracy=0.75),
            ],
        ),
        Fighter(
            "Ren Kageyama", Energy.CHAKRA, max_hp=105, max_ep=110, awakening="Eternal Eye",
            techniques=[
                Technique("Fireball Jutsu", power=20, cost=12),
                Technique("Lightning Blade", power=35, cost=28, accuracy=0.9),
                Technique("Black Flame", power=48, cost=45, accuracy=0.8),
            ],
        ),
        Fighter(
            "Ichiro Kurosawa", Energy.REIATSU, max_hp=115, max_ep=100, awakening="Bankai: Crimson Moon",
            techniques=[
                Technique("Zanpakuto Slash", power=19, cost=10),
                Technique("Moonfang Wave", power=34, cost=27, accuracy=0.9),
                Technique("Final Eclipse", power=52, cost=50, accuracy=0.75),
            ],
        ),
        Fighter(
            "Taro D. Storm", Energy.HAKI, max_hp=130, max_ep=90, awakening="Gear Overdrive",
            techniques=[
                Technique("Rubber Pistol", power=17, cost=8),
                Technique("Armament Rocket", power=33, cost=25, accuracy=0.9),
                Technique("Conqueror's Thunder King", power=50, cost=45, accuracy=0.8),
            ],
        ),
    ]
