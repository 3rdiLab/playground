"""Shonen Clash: a turn-based battle game inspired by classic shonen anime."""

from shonen_clash.battle import Battle, TurnResult
from shonen_clash.fighters import ADVANTAGE, Energy, Fighter, Technique, roster

__all__ = ["ADVANTAGE", "Battle", "Energy", "Fighter", "Technique", "TurnResult", "roster"]
__version__ = "0.1.0"
