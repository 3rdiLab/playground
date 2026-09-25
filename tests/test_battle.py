import random

import pytest

from shonen_clash.battle import Battle, compute_damage
from shonen_clash.fighters import ADVANTAGE, FOCUS, Energy, Technique, roster


def by_energy(energy):
    return next(f for f in roster() if f.energy is energy)


class FixedRng(random.Random):
    """Always hits, never crits, no damage variance."""

    def random(self):
        return 0.5

    def uniform(self, a, b):
        return 1.0


def test_type_advantage_boosts_damage():
    hit = Technique("Test Hit", power=20, cost=0)
    chakra, haki, reiatsu = by_energy(Energy.CHAKRA), by_energy(Energy.HAKI), by_energy(Energy.REIATSU)
    assert ADVANTAGE[Energy.CHAKRA] is Energy.HAKI

    _, strong, _, effective = compute_damage(chakra, haki, hit, FixedRng())
    _, neutral, _, not_effective = compute_damage(chakra, reiatsu, hit, FixedRng())
    assert effective and not not_effective
    assert strong == 30 and neutral == 20


def test_awakening_boosts_damage():
    hit = Technique("Test Hit", power=20, cost=0)
    attacker, defender = roster()[0], roster()[2]
    attacker.awakened = True
    _, damage, _, _ = compute_damage(attacker, defender, hit, FixedRng())
    assert damage == 30


def test_missed_attack_deals_no_damage():
    wild = Technique("Wild Swing", power=99, cost=0, accuracy=0.0)
    hit, damage, _, _ = compute_damage(roster()[0], roster()[2], wild, FixedRng())
    assert not hit and damage == 0


def test_turns_alternate_and_spend_energy():
    a, b = roster()[0], roster()[2]
    battle = Battle(a, b, seed=1)
    move = a.techniques[0]
    battle.take_turn(move)
    assert a.ep == a.max_ep - move.cost + 5
    assert battle.active is b


def test_focus_restores_energy():
    a, b = roster()[0], roster()[2]
    a.ep = 0
    battle = Battle(a, b, seed=1)
    result = battle.take_turn(FOCUS)
    assert a.ep == 30
    assert result.damage == 0 and b.hp == b.max_hp


def test_cannot_use_unaffordable_move():
    a, b = roster()[0], roster()[2]
    a.ep = 0
    battle = Battle(a, b, seed=1)
    with pytest.raises(ValueError):
        battle.take_turn(a.techniques[-2])


def test_cannot_fight_yourself():
    fighter = roster()[0]
    with pytest.raises(ValueError):
        Battle(fighter, fighter)


def test_same_seed_same_battle():
    def replay(seed):
        battle = Battle(roster()[0], roster()[3], seed=seed)
        battle.auto_play()
        return battle.log

    assert replay(42) == replay(42)


@pytest.mark.parametrize("seed", range(25))
def test_auto_play_always_finishes(seed):
    fighters = roster()
    rng = random.Random(seed)
    a, b = rng.sample(fighters, 2)
    battle = Battle(a, b, seed=seed)
    winner = battle.auto_play()
    assert winner is not None
    assert battle.log[-1].ko
    with pytest.raises(RuntimeError):
        battle.take_turn(FOCUS)


def test_describe_mentions_awakening():
    a, b = roster()[0], roster()[2]
    b.hp = 1 + int(b.max_hp * 0.3)
    battle = Battle(a, b, seed=0)
    battle.rng = FixedRng()
    result = battle.take_turn(a.techniques[0])
    assert result.awakened == b.awakening
    assert "AWAKENS" in result.describe()
