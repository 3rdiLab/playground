import pytest

from shonen_clash.fighters import ADVANTAGE, FOCUS, Energy, roster


def test_advantages_form_a_cycle():
    assert set(ADVANTAGE) == set(Energy)
    assert set(ADVANTAGE.values()) == set(Energy)
    for energy, beats in ADVANTAGE.items():
        assert beats is not energy
        assert ADVANTAGE[beats] is not energy


def test_roster_is_fresh_each_call():
    first, second = roster(), roster()
    first[0].take_damage(50)
    assert second[0].hp == second[0].max_hp


def test_every_fighter_can_focus():
    for fighter in roster():
        assert FOCUS in fighter.techniques


def test_damage_never_goes_below_zero():
    fighter = roster()[0]
    assert fighter.take_damage(10_000) == fighter.max_hp
    assert fighter.hp == 0
    assert not fighter.is_alive


def test_spend_rejects_overdraft():
    fighter = roster()[0]
    fighter.ep = 5
    with pytest.raises(ValueError):
        fighter.spend(10)


def test_recover_caps_at_max():
    fighter = roster()[0]
    fighter.ep = fighter.max_ep - 3
    fighter.recover(50)
    assert fighter.ep == fighter.max_ep


def test_awakens_once_at_low_hp():
    fighter = roster()[0]
    fighter.take_damage(fighter.max_hp // 2)
    assert not fighter.maybe_awaken()
    fighter.hp = int(fighter.max_hp * 0.3)
    assert fighter.maybe_awaken()
    assert fighter.attack_multiplier > 1
    assert not fighter.maybe_awaken()


def test_knocked_out_fighter_does_not_awaken():
    fighter = roster()[0]
    fighter.take_damage(fighter.max_hp)
    assert not fighter.maybe_awaken()
