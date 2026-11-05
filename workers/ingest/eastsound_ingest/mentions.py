"""Brand / keyword mentions in spoken audio (live reads, presenter shout-outs).

Pre-recorded adverts are best caught by audio fingerprinting: enroll the ad
like a song and every airing matches exactly. This module covers what
fingerprinting cannot: words a presenter *says*. Speech is transcribed and
the transcript is searched for tracked brands.

Speech recognisers spell local names unpredictably ("Stanbic" → "Sambic",
"Mukwano" → "Mequano"), so matching is fuzzy on spelling AND on sound
(Metaphone), with stricter rules for very short names where a fuzzy match
would be guesswork.
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from pathlib import Path

import jellyfish
from rapidfuzz import fuzz

# Tuned on 135 natural-voice clips (20 ad reads + 25 confusable non-ad lines,
# 3 voices each) under broadcast degradation. Accept a candidate when spelling
# OR sound is close enough; sound alone must also look roughly like the term,
# so unrelated words that share consonants ("stand back" vs "Stanbic") don't count.
SPELLING_MIN = 82
SOUND_MIN = 92
SOUND_NEEDS_SPELLING = 55
SHORT_TERM = 4  # terms this short (MTN, Coke) must match exactly
ALIAS_MIN = 92  # learned "heard as" spellings: near-exact only, no sound matching
ALIAS_MIN_CHARS = 5  # shorter aliases ("r 1", "air") would fire on everyday words


@dataclass(frozen=True)
class Keyword:
    brand: str
    terms: tuple[str, ...]  # spoken forms, e.g. ("mtn", "m t n", "em tee en")
    aliases: tuple[str, ...] = ()  # how the recogniser has misheard it, confirmed by a reviewer
    id: str | None = None  # tracked_keywords.id when loaded from the database


@dataclass
class Hit:
    brand: str
    term: str
    heard: str  # the words in the transcript that matched
    score: int
    start_word: int = 0


@dataclass
class KeywordSet:
    keywords: list[Keyword] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.keywords)


def normalize(text: str) -> list[str]:
    """Lowercase words; dots/hyphens split ("M.T.N." → m t n, "Coca-Cola" → coca cola)."""
    t = text.lower().replace("’", "'")
    t = re.sub(r"[.\-_/]", " ", t)
    t = re.sub(r"'s\b", "s", t)
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return t.split()


def _compact(words: list[str] | tuple[str, ...]) -> str:
    return "".join(words)


def _sound(s: str) -> str:
    return jellyfish.metaphone(s) if s else ""


def _sound_core(code: str) -> str:
    """Metaphone without a leading vowel or the soft W/H/Y sounds recognisers drop or add
    ("Rwenzori" heard as "our wensory": ARWNSR → RWNSR; "Mukwano" as "Mequano": MKWN → MKN)."""
    core = code[1:] if code[:1] in "AEIOU" else code
    return core[:1] + "".join(c for c in core[1:] if c not in "WHY")


def _term_score(term_words: list[str], window: list[str]) -> int:
    a, b = _compact(term_words), _compact(window)
    if not a or not b:
        return 0
    if len(a) <= SHORT_TERM:
        return 100 if a == b else 0
    spelling = fuzz.ratio(a, b)
    if spelling >= SPELLING_MIN:
        return int(spelling)
    if spelling < SOUND_NEEDS_SPELLING:
        return 0
    sa, sb = _sound(a), _sound(b)
    sound = fuzz.ratio(sa, sb)
    if sound >= SOUND_MIN:
        return int(sound)
    ca, cb = _sound_core(sa), _sound_core(sb)
    if len(ca) >= 3 and ca == cb:
        return SOUND_MIN  # same consonant skeleton
    return 0


def _alias_score(alias_words: list[str], window: list[str]) -> int:
    a, b = _compact(alias_words), _compact(window)
    if len(a) < ALIAS_MIN_CHARS or not b:
        return 0
    s = fuzz.ratio(a, b)
    return int(s) if s >= ALIAS_MIN else 0


def _scan(words: list[str], phrase: str, scorer) -> tuple[int, int, int]:
    """Best (score, start, size) for one phrase over all nearby window sizes."""
    pw = normalize(phrase)
    best = (0, 0, 0)
    if not pw:
        return best
    n = len(pw)
    for size in sorted({max(1, n - 1), n, n + 1, n + 2}):
        for i in range(0, max(0, len(words) - size) + 1):
            s = scorer(pw, words[i : i + size])
            if s > best[0]:
                best = (s, i, size)
    return best


def find_mentions(transcript: str, keywords: KeywordSet) -> list[Hit]:
    """Best hit per brand in one transcript (empty list if none)."""
    words = normalize(transcript)
    if not words:
        return []
    best: dict[str, Hit] = {}
    for kw in keywords.keywords:
        for phrase, scorer in [(t, _term_score) for t in kw.terms] + [(a, _alias_score) for a in kw.aliases]:
            s, i, size = _scan(words, phrase, scorer)
            if s and (kw.brand not in best or s > best[kw.brand].score):
                best[kw.brand] = Hit(kw.brand, phrase, " ".join(words[i : i + size]), s, i)
    return sorted(best.values(), key=lambda h: h.start_word)


def load_keywords_file(path: str | Path) -> KeywordSet:
    """CSV with columns brand, terms — terms separated by '|'.

    brand,terms,aliases
    MTN,mtn|m t n|em tee en,empty n
    Stanbic Bank,stanbic|stanbic bank,
    """
    out: list[Keyword] = []
    with Path(path).open(newline="") as f:
        for row in csv.DictReader(f):
            brand = (row.get("brand") or "").strip()
            terms = tuple(t.strip() for t in (row.get("terms") or brand).split("|") if t.strip())
            aliases = tuple(t.strip() for t in (row.get("aliases") or "").split("|") if t.strip())
            if brand and terms:
                out.append(Keyword(brand, terms, aliases))
    return KeywordSet(out)
