"""Save a text snapshot of every scheme's official page.

Run this right after re-verifying the schemes:   python scripts/snapshot_sources.py
The scheme editor's "Check official pages now" compares the live pages with these snapshots.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.match import load_schemes  # noqa: E402
from engine.sources import take_snapshots  # noqa: E402

if __name__ == "__main__":
    for url, entry in take_snapshots(load_schemes()).items():
        print(("OK   " if entry.get("file") else "FAIL ") + url + "  " + str(entry.get("chars") or entry.get("error")))
