from __future__ import annotations

from .domain.scoring import normalize_text

# A deliberately small, conservative list (Turkish + English). Hosts can always kick players.
_BLOCKED = (
    "amk", "aq", "orospu", "pic", "pezevenk", "sik", "sikik", "sikerim", "yarak", "yarrak",
    "gotveren", "ibne", "kahpe", "amcik", "amina", "siktir", "kaltak", "serefsiz",
    "fuck", "fucker", "shit", "bitch", "cunt", "dick", "cock", "pussy", "asshole", "nigger",
    "nigga", "faggot", "whore", "slut", "retard", "nazi", "hitler", "penis", "vagina", "porn", "sex",
)  # fmt: skip
_BLOCKED_SET = frozenset(_BLOCKED)
# Substring matches only for long, unambiguous words to avoid the Scunthorpe problem.
_SUBSTRING_BLOCKED = tuple(w for w in _BLOCKED if len(w) >= 5)
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})


def is_inappropriate(nickname: str) -> bool:
    normalized = normalize_text(nickname.translate(_LEET))
    if any(word in _BLOCKED_SET for word in normalized.split(" ")):
        return True
    squashed = normalized.replace(" ", "")
    return any(word in squashed for word in _SUBSTRING_BLOCKED)
