"""Watch the official scheme pages for changes.

Each scheme links to an official page. When we verify a scheme we keep a text snapshot of
that page (data/source_snapshots/). Later, the scheme editor can fetch the pages again and
see which ones changed since: those schemes need a fresh check before students rely on them.

Only the visible text is compared (scripts, styles and tags are dropped), and small changes
such as a visitor counter or today's date are ignored, so a flag means real new wording.
"""
from __future__ import annotations

import difflib
import hashlib
import html
import json
import os
import re
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date

SNAP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "source_snapshots")
INDEX_PATH = os.path.join(SNAP_DIR, "index.json")
CHANGED_BELOW = 0.95   # pages less than 95% the same are reported as changed
MAX_CHARS = 40000
try:  # use the standard certificate bundle when available (some Python installs ship without one)
    import certifi
    _SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    _SSL = ssl.create_default_context()
_UA = "Mozilla/5.0 (compatible; PraptiSourceCheck/1.0; checks public scheme pages)"


def page_text(raw: str) -> str:
    """Visible text of an HTML page, in one normalised line (numbers like dates kept)."""
    raw = re.sub(r"(?is)<(script|style|noscript|svg)\b.*?</\1>", " ", raw)
    raw = re.sub(r"(?s)<!--.*?-->", " ", raw)
    raw = re.sub(r"(?s)<[^>]+>", " ", raw)
    text = html.unescape(raw)
    return re.sub(r"\s+", " ", text).strip()[:MAX_CHARS]


def fetch(url: str, timeout: float = 8.0) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as resp:  # noqa: S310 (fixed list of official https URLs)
        body = resp.read(2_000_000)
        charset = resp.headers.get_content_charset() or "utf-8"
    return page_text(body.decode(charset, errors="replace"))


def _file_for(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()[:12] + ".txt"


def load_index() -> dict:
    try:
        with open(INDEX_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a.split(), b.split(), autojunk=False).ratio()


def scheme_urls(schemes: list[dict]) -> dict[str, list[str]]:
    """Official page URL -> ids of the schemes that rely on it."""
    out: dict[str, list[str]] = {}
    for s in schemes:
        if s.get("source_url"):
            out.setdefault(s["source_url"], []).append(s["id"])
    return out


def take_snapshots(schemes: list[dict]) -> dict:
    """Save the current text of every official page (run after verifying the schemes)."""
    os.makedirs(SNAP_DIR, exist_ok=True)
    index = load_index()
    for url in scheme_urls(schemes):
        try:
            text = fetch(url, timeout=20)
        except Exception as exc:  # report and keep going
            index[url] = {**index.get(url, {}), "error": f"{type(exc).__name__}: {exc}"[:200]}
            continue
        name = _file_for(url)
        with open(os.path.join(SNAP_DIR, name), "w", encoding="utf-8") as f:
            f.write(text)
        index[url] = {"file": name, "taken": date.today().isoformat(), "chars": len(text)}
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    return index


def check_one(url: str, entry: dict | None) -> dict:
    if not entry or not entry.get("file"):
        return {"url": url, "state": "no_snapshot"}
    try:
        with open(os.path.join(SNAP_DIR, entry["file"]), encoding="utf-8") as f:
            before = f.read()
    except OSError:
        return {"url": url, "state": "no_snapshot"}
    try:
        now = fetch(url)
    except Exception as exc:
        return {"url": url, "state": "unreachable", "error": f"{type(exc).__name__}"[:80], "since": entry.get("taken")}
    ratio = similarity(before, now)
    return {"url": url, "state": "changed" if ratio < CHANGED_BELOW else "same",
            "similarity": round(ratio, 3), "since": entry.get("taken")}


def check_all(schemes: list[dict]) -> dict[str, dict]:
    """Fetch every official page now (in parallel) and compare with its snapshot. Returns scheme id -> result."""
    urls = scheme_urls(schemes)
    index = load_index()
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda u: check_one(u, index.get(u)), urls))
    by_scheme = {}
    for res in results:
        for sid in urls[res["url"]]:
            by_scheme[sid] = res
    return by_scheme
