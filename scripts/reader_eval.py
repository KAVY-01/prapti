"""Score the offline reader against realistic student messages.

    python scripts/reader_eval.py            # practice set, with every miss listed
    python scripts/reader_eval.py --holdout  # the honest number (never tuned on)

Two numbers per set:
  read correctly  = details the message states that the reader got right
  wrong guesses   = details the message does NOT state that the reader filled in anyway
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.extract import PROFILE_KEYS, extract  # noqa: E402
from tests.reader_cases import HOLDOUT, PRACTICE  # noqa: E402


def same(field, got, want):
    if field == "marks_percent" and got is not None:
        return abs(got - want) < 0.6
    return got == want


def score(cases, show=True):
    stated = right = invented = 0
    for text, want in cases:
        got = extract(text, use_ai=False)["profile"]
        misses = []
        for field in PROFILE_KEYS:
            if field in want:
                stated += 1
                if same(field, got.get(field), want[field]):
                    right += 1
                else:
                    misses.append(f"{field}: got {got.get(field)!r}, want {want[field]!r}")
            elif got.get(field) is not None:
                invented += 1
                misses.append(f"{field}: guessed {got.get(field)!r}, not stated")
        if show and misses:
            print(f"- {text}\n    " + "\n    ".join(misses))
    return stated, right, invented


if __name__ == "__main__":
    holdout = "--holdout" in sys.argv
    cases = HOLDOUT if holdout else PRACTICE
    stated, right, invented = score(cases, show=not holdout or "-v" in sys.argv)
    name = "HOLDOUT" if holdout else "PRACTICE"
    print(f"\n{name}: {len(cases)} messages · read correctly {right}/{stated} ({100 * right / stated:.1f}%) · "
          f"wrong guesses {invented}")
