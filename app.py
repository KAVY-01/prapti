import hmac
import json
import os
import base64
import secrets
from urllib.parse import parse_qsl, quote, urlencode
from datetime import date, datetime, timedelta, timezone

from flask import (Flask, Response, abort, has_request_context, jsonify, redirect,
                   render_template, request, session, url_for)

from engine.extract import PROFILE_KEYS, TELANGANA_DISTRICTS, extract
from engine.ics import build_ics
from engine.sources import check_all as check_sources, load_index as snapshot_index
from engine.match import (FIELD_LABEL, LEVEL_LABEL, DATA_DIR, SCHEMES_PATH, fields_that_matter,
                          applies, format_value, match_all, match_scheme)
from engine.match import load_schemes as load_file_schemes

app = Flask(__name__)

# Sandbox: on a public demo the scheme editor must not change the real rules for everyone.
# Edits are kept in the visitor's own session instead, so a judge can try the editor and
# see their change in results, while everyone else still sees the verified data.
SANDBOX = os.environ.get("PRAPTI_SANDBOX", "").lower() in ("1", "on", "true") or bool(os.environ.get("VERCEL"))
MAX_TEXT = 600  # characters of free text we read; plenty for "who I am", and keeps AI cost and cookies small

# ---------- Security basics ----------
ON_HTTPS = bool(os.environ.get("VERCEL")) or os.environ.get("HTTPS", "").lower() in ("1", "on", "true")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,     # page scripts cannot read the session cookie
    SESSION_COOKIE_SAMESITE="Lax",    # other websites cannot submit our forms with the visitor's cookie
    SESSION_COOKIE_SECURE=ON_HTTPS,   # cookie only travels over https on the live site
    MAX_CONTENT_LENGTH=64 * 1024,     # no request body bigger than 64 KB
)
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",  # a few small inline scripts; nothing from other sites
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("Content-Security-Policy", CSP)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)")  # mic: voice input
    if ON_HTTPS:
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
    return resp
app.config["PERMANENT_SESSION_LIFETIME"] = 60 * 60 * 24 * 180  # remember language and answers for 6 months
# The session only holds the student's answers (never ID numbers) on their own device.
# Without SECRET_KEY a random key is made once and kept in .secret_key (git-ignored), so nobody can
# forge a session (for example the admin login) from a key published in the repo.
def _secret_key():
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".secret_key")
    try:
        with open(path, encoding="utf-8") as f:
            key = f.read().strip()
        if key:
            return key
    except OSError:
        pass
    key = secrets.token_hex(32)
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(key)
    except OSError:
        # Read-only serverless host (Vercel) without SECRET_KEY: every server copy needs the same key,
        # or sessions break between requests. That is safe only in sandbox mode, where nothing a
        # session holds can change shared data (editor edits stay with the visitor).
        if os.environ.get("PRAPTI_SANDBOX", "").lower() in ("1", "on", "true") or os.environ.get("VERCEL"):
            return "prapti-public-sandbox-demo"
    return key


app.secret_key = _secret_key()

# Options for the "Edit my details" form (value, label).
FIELD_OPTIONS = {
    "education_level": list(LEVEL_LABEL.items()),
    "year": [(1, "1st"), (2, "2nd"), (3, "3rd"), (4, "4th+")],
    "community": [(c, c if c != "OC" else "OC / General") for c in ["SC", "ST", "BC", "EBC", "Minority", "OC"]],
    "annual_income": [(90000, "Under ₹1L"), (125000, "₹1–1.5L"), (175000, "₹1.5–2L"), (225000, "₹2–2.5L"),
                      (300000, "₹2.5–3.5L"), (500000, "₹3.5–8L"), (900000, "Above ₹8L")],
    "gender": [("female", "Female"), ("male", "Male"), ("other", "Other")],
    "area": [("rural", "Village (rural)"), ("urban", "Town or city (urban)")],
    "disability": [(True, "Yes, 40%+"), (False, "No")],
    "marks_percent": [(45, "Under 50%"), (52, "50–55%"), (68, "55–80%"), (88, "80% or more")],
    "college_type": [("government", "Government / Aided"), ("private", "Private")],
}
CHIP_FIELDS = ["education_level", "year", "community", "annual_income", "gender", "area",
               "disability", "marks_percent", "college_type"]

# The Quick questions screen: asked only when a detail is missing AND it changes a result.
QUESTIONS = {
    "education_level": ("What are you studying now?", "Each scholarship is for certain classes or courses."),
    "year": ("Which year of the course?", "Some schemes are only for the first or second year."),
    "community": ("Which community are you from?", "Many Telangana scholarships are set aside for SC, ST, BC, EBC or minority students."),
    "annual_income": ("Family income in a year?", "Almost every scholarship has an income limit. A rough idea is enough."),
    "gender": ("Are you a girl or a boy?", "Some schemes, like AICTE Pragati, are only for girls."),
    "area": ("Where do you live?", "The income limit for BC, EBC and minority students is different in rural and urban areas."),
    "disability": ("A disability of 40% or more?", "Some schemes are for students with a disability certificate."),
    "marks_percent": ("Marks in your last exam?", "A few scholarships ask for a minimum percentage."),
    "college_type": ("Government or private college?", "NMMS is only for students in government or aided schools."),
}


LANGS = ("en", "te", "hi")
with open(os.path.join(DATA_DIR, "i18n.json"), encoding="utf-8") as _f:
    I18N = {k: v for k, v in json.load(_f).items() if not k.startswith("_")}


def get_lang():
    lang = session.get("lang")
    if lang in LANGS:
        return lang
    best = request.accept_languages.best_match(["en", "te", "hi"]) if request else None
    return best if best in LANGS else "en"


def tr(key, lang=None, **kw):
    lang = lang or get_lang()
    entry = I18N.get(key)
    if entry is None:
        text = key
    else:
        text = entry.get(lang) if entry.get(lang) is not None else entry.get("en", key)
    if "n" in kw and "{schemes}" in text:
        kw["schemes"] = "scheme" if kw["n"] == 1 else "schemes"
    for k, v in kw.items():
        text = text.replace("{" + k + "}", str(v))
    return text


def opt(label, lang=None):
    """Translate an answer label (e.g. 'Female', 'Under ₹1L')."""
    entry = I18N.get("opt." + label)
    if not entry:
        return label
    return entry.get(lang or get_lang()) or label


def load_samples():
    with open(os.path.join(DATA_DIR, "samples.json"), encoding="utf-8") as f:
        return json.load(f)["samples"]


def sample_display_name(sample_id, lang):
    sample = next((x for x in load_samples() if x["id"] == sample_id), None)
    if not sample:
        return None
    return sample.get(f"name_{lang}") or sample["name"]


def load_schemes():
    """Scheme data for this request: the verified file, plus this visitor's sandbox edits (demo only)."""
    schemes = load_file_schemes()
    overrides = session.get("sandbox") if SANDBOX and has_request_context() else None
    if overrides:
        for sch in schemes:
            o = overrides.get(sch["id"])
            if not o:
                continue
            sch.update(o.get("fields", {}))
            for rule, changed in zip(sch["rules"], o.get("rules", [])):
                rule.update(changed)
    return schemes


def scheme_by_id(scheme_id):
    return next((s for s in load_schemes() if s["id"] == scheme_id), None)


def current_profile():
    return session.get("profile") or {}


def _coerce(field, raw):
    """Turn a form value into the profile value. Anything not one of the offered answers becomes None."""
    if raw in (None, "", "unknown"):
        return None
    try:
        if field in ("year", "annual_income"):
            value = int(raw)
            return value if value > 0 else None
        if field == "marks_percent":
            value = float(raw)
            return value if 0 < value <= 100 else None
    except (TypeError, ValueError):
        return None
    if field == "disability":
        if isinstance(raw, bool):
            return raw
        return str(raw).lower() in ("true", "1", "yes")
    allowed = {v for v, _ in FIELD_OPTIONS.get(field, [])}
    if allowed and raw not in allowed:
        return None
    return raw


def nice(d):
    """'5 Dec 2026' (works on Windows too, unlike strftime('%-d'))."""
    return f"{d.day} {d.strftime('%b %Y')}"


BAND_EDGES = {
    # option value -> upper edge of that band; a typed value is shown as the band it falls in
    "annual_income": [(90000, 100000), (125000, 150000), (175000, 200000), (225000, 250000),
                      (300000, 350000), (500000, 800000), (900000, float("inf"))],
    "marks_percent": [(45, 50), (52, 55), (68, 80), (88, float("inf"))],
}
EXCLUSIVE_EDGE = {"marks_percent"}  # 50% belongs to "50–55%", and 49.5% to "Under 50%"


def selected_options(profile):
    """Which option in the edit form should be pre-selected for each field."""
    out = {}
    for f in CHIP_FIELDS:
        v = profile.get(f)
        if v is None:
            out[f] = None
        elif f in BAND_EDGES:
            strict = f in EXCLUSIVE_EDGE
            out[f] = next(o for o, edge in BAND_EDGES[f] if (v < edge if strict else v <= edge))
        elif f == "year":
            out[f] = min(int(v), 4)
        else:
            out[f] = v
    return out


BANDED = ("annual_income", "marks_percent")  # answered by tapping a range, e.g. "₹1–1.5L", "55–80%"


def set_band(profile, field, value):
    """Remember that this answer was a tapped range (or forget it when the answer is cleared)."""
    bands = dict(profile.get("_bands") or {})
    label = dict(FIELD_OPTIONS.get(field, [])).get(value) if field in BANDED else None
    if label and value is not None:
        bands[field] = label
    else:
        bands.pop(field, None)
    profile["_bands"] = bands


def for_matching(profile, lang):
    """The profile with tapped ranges in the student's language, for the rule sentences."""
    p = dict(profile)
    p["_bands"] = {f: opt(label, lang) for f, label in (profile.get("_bands") or {}).items()}
    return p


def current_labels(profile, lang):
    """The answer shown on each line of 'Edit my details', in the student's words (or None if not told)."""
    shown, bands, out = selected_options(profile), profile.get("_bands") or {}, {}
    for f in CHIP_FIELDS:
        v = profile.get(f)
        if v is None:
            out[f] = None
        elif f in bands:
            out[f] = opt(bands[f], lang)
        elif f in ("annual_income", "marks_percent"):
            out[f] = format_value(f, v)  # typed exactly, e.g. "₹96,000", "72%"
        else:
            out[f] = opt(dict(FIELD_OPTIONS[f]).get(shown[f], format_value(f, v)), lang)
    return out


def understood_chips(profile, lang=None):
    chips = []
    bands = profile.get("_bands") or {}
    for f in CHIP_FIELDS:
        v = profile.get(f)
        if v is None:
            continue
        if f in bands:
            label = tr("chip.income" if f == "annual_income" else "chip.marks", lang, v=opt(bands[f], lang))
        elif f == "year":
            label = tr("chip.year", lang, n=v)
        elif f == "annual_income":
            label = tr("chip.income", lang, v=format_value(f, v))
        elif f == "disability":
            label = tr("chip.disabled" if v else "chip.not_disabled", lang)
        elif f == "marks_percent":
            label = tr("chip.marks", lang, v=format_value(f, v))
        else:
            label = opt(format_value(f, v), lang)
        chips.append(label)
    if profile.get("district"):
        chips.append(profile["district"])
    return chips


@app.context_processor
def inject_helpers():
    lang = get_lang()

    def nice_date(iso):
        if not iso:
            return ""
        return nice(date.fromisoformat(iso))

    js_keys = {k: (v.get(lang) if v.get(lang) is not None else v.get("en")) for k, v in I18N.items()
               if k.split(".")[0] in ("home", "soon", "det", "tr", "st", "adv", "nx", "dl", "listen", "listen_stop", "share")}
    return {"nice_date": nice_date, "lang": lang, "t": lambda key, **kw: tr(key, lang, **kw),
            "opt": lambda label: opt(label, lang), "js_text": js_keys, "sandbox": SANDBOX}


@app.route("/lang/<code>")
def set_lang(code):
    if code in LANGS:
        session["lang"] = code
        session.permanent = True
    back = request.referrer or url_for("index")
    return redirect(back if back.startswith(request.host_url) else url_for("index"))


@app.route("/")
def index():
    return render_template("home.html", samples=load_samples(), schemes=load_schemes(), page="find",
                           first_visit="lang" not in session,
                           text=session.get("text", ""))


@app.route("/find", methods=["POST"])
def find():
    sample_id = request.form.get("sample")
    if sample_id:
        sample = next((s for s in load_samples() if s["id"] == sample_id), None)
        if not sample:
            abort(404)
        session["profile"] = dict(sample["profile"])
        session["text"] = sample["text"]
        session["removed_id"] = False
        session["sample_name"] = sample["id"]
        session["skipped"] = []
        session["asked"] = {}
        session["history"] = []
    else:
        text = (request.form.get("text") or "").strip()[:MAX_TEXT]
        if not text:
            return redirect(url_for("index"))
        result = extract(text)
        session["profile"] = result["profile"]
        session["text"] = text if not result["removed_id"] else ""
        session["removed_id"] = result["removed_id"]
        session["read_by"] = result["source"]
        session.pop("sample_name", None)
        session["skipped"] = []
        session["asked"] = {}
        session["history"] = []
        if pending_questions(result["profile"], []):
            return redirect(url_for("questions"))
    return redirect(url_for("results"))


@app.route("/start", methods=["POST"])
def start_questions():
    """Tap-only path: no typing at all, just the questions that matter."""
    session["profile"] = {k: None for k in PROFILE_KEYS}
    session["text"] = ""
    session["removed_id"] = False
    session.pop("sample_name", None)
    session["skipped"] = []
    session["asked"] = {}
    session["history"] = []
    return redirect(url_for("questions"))


@app.route("/questions/back", methods=["POST"])
def questions_back():
    history = list(session.get("history", []))
    if not history:
        return redirect(url_for("index"))
    field = history.pop()
    profile = dict(current_profile())
    profile[field] = None
    set_band(profile, field, None)
    skipped = [f for f in session.get("skipped", []) if f != field]
    asked = dict(session.get("asked", {}))
    # forget the question on screen now and the one we go back to, so the count stays right
    current = request.form.get("current")
    asked.pop(current, None)
    asked.pop(field, None)
    session.update(profile=profile, skipped=skipped, asked=asked, history=history)
    return redirect(url_for("questions", dir="back"))


def pending_questions(profile, skipped):
    """Missing details that would change at least one result, in a sensible order."""
    matter = set(fields_that_matter(profile, load_schemes()))
    return [f for f in QUESTIONS if f in matter and f not in skipped and profile.get(f) is None]


@app.route("/questions", methods=["GET", "POST"])
def questions():
    if not session.get("profile"):
        return redirect(url_for("index"))
    profile = dict(current_profile())
    skipped = list(session.get("skipped", []))
    if request.method == "POST":
        field = request.form.get("field")
        if field in QUESTIONS:
            session["history"] = list(session.get("history", [])) + [field]
            if request.form.get("skip"):
                skipped.append(field)
            else:
                profile[field] = _coerce(field, request.form.get("value"))
                set_band(profile, field, profile[field])
                if profile[field] is None:
                    skipped.append(field)
            session["profile"] = profile
            session["skipped"] = skipped
        return redirect(url_for("questions"))
    pending = pending_questions(profile, skipped)
    if not pending:
        return redirect(url_for("results"))
    field = pending[0]
    asked = dict(session.get("asked", {}))
    asked[field] = True
    session["asked"] = asked
    step = len(asked)
    total = step + len(pending) - 1
    q, why = tr("q." + field), tr("why." + field)
    return render_template("questions.html", page="find", field=field, question=q, why=why,
                           options=FIELD_OPTIONS[field], step=step, total=total,
                           chips=understood_chips(profile, get_lang()), removed_id=session.get("removed_id", False),
                           can_go_back=bool(session.get("history")))


@app.route("/profile", methods=["POST"])
def update_profile():
    profile = dict(current_profile())
    shown = selected_options(profile)
    for f in CHIP_FIELDS:
        if f in request.form:
            new = _coerce(f, request.form.get(f))
            if new != shown[f]:  # only overwrite what the student actually changed
                profile[f] = new
                set_band(profile, f, new)
    session["profile"] = profile
    return redirect(url_for("results"))


# ---------- Share: a link that reopens the same results (answers only, never a name or ID) ----------
SHARE_KEYS = {"education_level": "e", "year": "y", "community": "c", "annual_income": "i", "gender": "g",
              "area": "a", "disability": "d", "marks_percent": "m", "college_type": "t", "district": "z"}


def share_token(profile):
    data = {short: profile[f] for f, short in SHARE_KEYS.items() if profile.get(f) is not None}
    bands = [f for f in (profile.get("_bands") or {}) if f in BANDED]
    if bands:
        data["b"] = [SHARE_KEYS[f] for f in bands]
    raw = json.dumps(data, separators=(",", ":"), ensure_ascii=True).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def profile_from_token(token):
    """Decode a share link; every value is checked like a tapped answer, so a hand-made link cannot do harm."""
    try:
        data = json.loads(base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)))
    except (ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    profile = {k: None for k in PROFILE_KEYS}
    for f, short in SHARE_KEYS.items():
        if f == "district":
            z = data.get(short)
            profile[f] = z if z in TELANGANA_DISTRICTS else None
        elif f in FIELD_OPTIONS:
            profile[f] = _coerce(f, data.get(short))
    for short in data.get("b") or []:
        f = next((f for f, s in SHARE_KEYS.items() if s == short), None)
        if f in BANDED and profile.get(f) is not None:
            set_band(profile, f, profile[f])
    return profile


def share_link(profile):
    scheme = "https" if ON_HTTPS else request.scheme
    return f"{scheme}://{request.host}/r/{share_token(profile)}"


def share_message(result, first, link, lang):
    likely = [m for m in result["likely"] if m["days_left"] is None or m["days_left"] >= 0]
    if not likely:
        return tr("share.msg_none", lang, link=link)
    names = ", ".join(m["name"] for m in likely[:4]) + ("…" if len(likely) > 4 else "")
    step = (tr("share.first", lang, name=first["name"], d=nice(date.fromisoformat(first["deadline"])))
            if first and first.get("deadline") else "")
    return tr("share.msg", lang, n=len(likely), v=result["summary"]["likely_value_text"], names=names,
              first=step, link=link)


@app.route("/r/<token>")
def shared(token):
    profile = profile_from_token(token)
    if not profile or not any(v is not None for k, v in profile.items() if k != "_bands"):
        return redirect(url_for("index"))
    session.update(profile=profile, text="", removed_id=False, skipped=[], asked={}, history=[], shared=True)
    session.pop("sample_name", None)
    return redirect(url_for("results"))


# ---------- One trip: every document the student's schemes need, collected once ----------
TRIP_WHERE = ["mee_seva", "hospital", "college", "home"]  # the slow certificates first


def doc_name(d, lang):
    return tr("doc." + d["key"], lang) if d.get("key") and ("doc." + d["key"]) in I18N else d["name"]


def one_trip(result, lang):
    """Merge the document lists of the schemes a student will apply for into one list, grouped by place.

    Uses the 'likely' schemes that are still open (or the 'maybe' ones if there are none), and each
    scheme's own document list, which already leaves out documents this student does not need.
    """
    def open_(m):
        return m["days_left"] is None or m["days_left"] >= 0
    chosen = [m for m in result["likely"] if open_(m)] or [m for m in result["maybe"] if open_(m)]
    items, total = {}, 0
    for m in chosen:
        for d in m["documents"]:
            total += 1
            key = d.get("key") or d["name"]
            it = items.setdefault(key, {"key": key, "name": doc_name(d, lang), "hint": d.get("hint", ""),
                                        "where": d.get("where", "home"), "days": d.get("days"), "schemes": []})
            it["schemes"].append({"id": m["id"], "name": m["name"], "days_left": m["days_left"]})
    for it in items.values():
        it["rush"] = None
        if it["days"]:
            soon = sorted((sc for sc in it["schemes"] if sc["days_left"] is not None), key=lambda sc: sc["days_left"])
            if soon and soon[0]["days_left"] <= it["days"]:
                it["rush"] = {"name": soon[0]["name"], "d": soon[0]["days_left"], "n": it["days"]}
    groups = []
    for where in TRIP_WHERE:
        group = sorted((it for it in items.values() if it["where"] == where), key=lambda it: -len(it["schemes"]))
        if group:
            groups.append({"where": where, "items": group})
    return {"schemes": chosen, "groups": groups, "total": total, "unique": len(items),
            "mee_seva": sum(1 for it in items.values() if it["where"] == "mee_seva")}


@app.route("/documents")
def documents():
    if not session.get("profile"):
        return redirect(url_for("index"))
    lang = get_lang()
    trip = one_trip(match_all(for_matching(current_profile(), lang), load_schemes(), lang=lang), lang)
    return render_template("documents.html", page="find", trip=trip)


@app.route("/results")
def results():
    profile = current_profile()
    if not session.get("profile"):
        return redirect(url_for("index"))
    lang = get_lang()
    result = match_all(for_matching(profile, lang), load_schemes(), lang=lang)
    missing = [f for f in CHIP_FIELDS if profile.get(f) is None]
    first = next((m for m in result["likely"] if m["category"] != "loan" and (m["days_left"] is None or m["days_left"] >= 0)), None)
    link = share_link(profile)
    return render_template("results.html", first=first, page="find", r=result, profile=profile,
                           trip=one_trip(result, lang), share_url=link, opened_shared=session.pop("shared", False),
                           wa_text=quote(share_message(result, first, link, lang)),
                           chips=understood_chips(profile, lang), options=FIELD_OPTIONS,
                           field_label=FIELD_LABEL, chip_fields=CHIP_FIELDS, missing=missing,
                           selected=selected_options(profile), current=current_labels(profile, lang),
                           removed_id=session.pop("removed_id", False),
                           sample_name=sample_display_name(session.get("sample_name"), lang))


@app.route("/scheme/<scheme_id>")
def scheme_detail(scheme_id):
    scheme = scheme_by_id(scheme_id)
    if not scheme:
        abort(404)
    profile = current_profile()
    result = match_scheme(scheme, for_matching(profile, get_lang()), get_lang())
    return render_template("scheme.html", page="find", s=scheme, m=result,
                           has_profile=bool(session.get("profile")))


@app.route("/tracker")
def tracker():
    """The tracker lives on the student's own device (localStorage); the page only needs scheme facts.

    Documents are listed the same way as on the scheme page (only the ones this student needs, by key),
    so ticks made on the scheme page or the one-trip list count here too."""
    meta = []
    profile = current_profile()
    today = date.today()
    lang = get_lang()
    for s in load_schemes():
        meta.append({
            "id": s["id"],
            "name": s.get(f"name_{lang}") or s["name_en"],
            "benefit": s.get("benefit_text"),
            "deadline": s.get("deadline"),
            "deadline_note": s.get("deadline_note"),
            "days_left": (date.fromisoformat(s["deadline"]) - today).days if s.get("deadline") else None,
            "documents": [{"key": d.get("key") or d["name"], "name": doc_name(d, lang), "hint": d.get("hint", "")}
                          for d in s.get("documents", []) if applies(d.get("needed_if"), profile)],
            "portal": next((st["link"] for st in s.get("steps", []) if st.get("link")), s.get("source_url")),
            "source_name": s.get("source_name"),
        })
    return render_template("tracker.html", page="tracker", schemes_meta=meta)


# ---------- About ----------
@app.route("/about")
def about():
    seen, sources = set(), []
    for sch in load_schemes():
        if sch["source_url"] not in seen:
            seen.add(sch["source_url"])
            sources.append((sch["source_name"], sch["source_url"]))
    return render_template("about.html", page="about", sources=sources)


# ---------- How the rules stay right (public) ----------
IST = timezone(timedelta(hours=5, minutes=30))
_SOURCE_CHECK = {}  # the latest "check official pages" result on this server: {"at": ..., "results": {...}}


def _run_source_check():
    """Fetch the official pages and compare them with our snapshots; reuse a result under 10 minutes old."""
    now = datetime.now(IST)
    last = _SOURCE_CHECK.get("at")
    if not last or (now - last).total_seconds() > 600:
        _SOURCE_CHECK.update(at=now, results=check_sources(load_schemes()))
    return _SOURCE_CHECK


@app.route("/changes")
def changes():
    """Public: when each scheme was last checked against its official source, and what changed."""
    schemes = sorted(load_schemes(), key=lambda s: s.get("last_verified") or "", reverse=True)
    snaps = snapshot_index()
    for s in schemes:
        s["snapshot"] = snaps.get(s.get("source_url"), {}).get("taken")
    return render_template("changes.html", page="about", schemes=schemes, log=_read_log()[:50],
                           check=_SOURCE_CHECK.get("results"), checked_at=_SOURCE_CHECK.get("at"))


@app.route("/changes/check", methods=["POST"])
def changes_check():
    """Anyone can ask for a fresh check; the result is shared for 10 minutes so the official sites are not hammered."""
    _run_source_check()
    return changes()  # shown straight away: on a serverless host the next request may reach another copy


# ---------- Helper mode (NGO / Mee Seva operators) ----------
@app.route("/helper")
def helper():
    return render_template("helper.html", page="helper")


@app.route("/api/helper-check", methods=["POST"])
def api_helper_check():
    data = request.get_json(silent=True) or {}
    extracted = extract(str(data.get("text") or "")[:MAX_TEXT])
    result = match_all(extracted["profile"], load_schemes(), lang="en")
    upcoming = sorted([m for m in result["likely"] if m["deadline"] and (m["days_left"] or 0) >= 0],
                      key=lambda m: m["days_left"])
    return jsonify({
        "chips": understood_chips(extracted["profile"], "en"),
        "likely": [{"id": m["id"], "name": m["name_en"]} for m in result["likely"]],
        "maybe": len(result["maybe"]),
        "value": result["summary"]["likely_value_inr"],
        "next_deadline": nice(date.fromisoformat(upcoming[0]["deadline"])) if upcoming else None,
        "removed_id": extracted["removed_id"],
    })


@app.route("/helper/print")
def helper_print():
    ids = [i for i in (request.args.get("ids") or "").split(",") if i]
    nick = (request.args.get("nick") or "Student")[:40]
    schemes = [sch for sch in load_schemes() if sch["id"] in ids]
    return render_template("print.html", nick=nick, schemes=schemes,
                           today=nice(date.today()))


# ---------- Scheme editor ----------
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "prapti-demo")
CHANGELOG_PATH = os.path.join(DATA_DIR, "changelog.json")
OPS = ["eq", "in", "lte", "gte", "lt", "gt"]
RULE_FIELDS = ["education_level", "year", "community", "annual_income", "gender", "area",
               "disability", "marks_percent", "college_type"]


def _is_admin():
    return session.get("admin") is True


def _read_log():
    try:
        with open(CHANGELOG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def _parse_value(op, raw):
    raw = (raw or "").strip()
    def one(v):
        v = v.strip()
        if v.lower() in ("true", "false"):
            return v.lower() == "true"
        try:
            return int(v)
        except ValueError:
            try:
                return float(v)
            except ValueError:
                return v
    if op == "in":
        return [one(v) for v in raw.split(",") if v.strip()]
    return one(raw)


@app.route("/admin/login", methods=["POST"])
def admin_login():
    if hmac.compare_digest(request.form.get("password", ""), ADMIN_PASSWORD):
        session["admin"] = True
        return redirect(url_for("admin_schemes"))
    return render_template("admin_login.html", page="admin", error="That password is not right."), 401


@app.route("/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin", None)
    return redirect(url_for("index"))


@app.route("/admin/schemes")
def admin_schemes():
    if not _is_admin():
        return render_template("admin_login.html", page="admin")
    today = date.today()
    schemes = load_schemes()
    for sch in schemes:
        lv = sch.get("last_verified")
        sch["stale"] = (not lv) or (today - date.fromisoformat(lv)).days > 90
    log = (session.get("sandbox_log", []) if SANDBOX else []) + _read_log()
    return render_template("admin_list.html", page="admin", schemes=schemes, log=log[:12],
                           saved=request.args.get("saved"), has_edits=bool(session.get("sandbox")),
                           default_password=ADMIN_PASSWORD == "prapti-demo" and not SANDBOX)


@app.route("/admin/reset", methods=["POST"])
def admin_reset():
    """Sandbox only: forget this visitor's edits and go back to the verified data."""
    session.pop("sandbox", None)
    session.pop("sandbox_log", None)
    return redirect(url_for("admin_schemes"))


@app.route("/admin/schemes/<scheme_id>", methods=["GET", "POST"])
def admin_edit(scheme_id):
    if not _is_admin():
        return render_template("admin_login.html", page="admin")
    sch = scheme_by_id(scheme_id)
    if not sch:
        abort(404)
    if request.method == "GET":
        return render_template("admin_edit.html", page="admin", s=sch, fields=RULE_FIELDS, ops=OPS)

    form = request.form
    changes = []
    try:
        deadline = form.get("deadline", "").strip() or None
        if deadline:
            date.fromisoformat(deadline)
        updates = {
            "benefit_text": form.get("benefit_text", "").strip(),
            "benefit_max_inr": int(form.get("benefit_max_inr") or 0),
            "deadline": deadline,
            "deadline_note": form.get("deadline_note", "").strip(),
            "source_url": form.get("source_url", "").strip(),
        }
        if not updates["source_url"].startswith("https://"):
            raise ValueError("The official source must be an https:// link.")
        for k, v in updates.items():
            if sch.get(k) != v:
                changes.append(f"{k} {sch.get(k)!r} → {v!r}")
                sch[k] = v
        for i, rule in enumerate(sch["rules"]):
            op = form.get(f"op_{i}", rule["op"])
            field = form.get(f"field_{i}", rule["field"])
            if op not in OPS or field not in RULE_FIELDS:
                raise ValueError("Unknown field or check.")
            value = _parse_value(op, form.get(f"value_{i}"))
            text = form.get(f"text_{i}", rule["text_en"]).strip()
            if "{user_value}" not in text:
                raise ValueError(f"Rule {i + 1}: keep {{user_value}} in the sentence.")
            for k, v in (("field", field), ("op", op), ("value", value), ("text_en", text)):
                if rule.get(k) != v:
                    changes.append(f"rule {i + 1} {k} {rule.get(k)!r} → {v!r}")
                    rule[k] = v
    except ValueError as exc:
        return render_template("admin_edit.html", page="admin", s=sch, fields=RULE_FIELDS, ops=OPS,
                               error=str(exc) or "Please check the values."), 400

    sch["last_verified"] = date.today().isoformat()
    changes.append("marked verified")
    entry = {"when": datetime.now().strftime("%Y-%m-%d %H:%M"), "scheme": sch["name_en"], "changes": changes}

    if SANDBOX:
        overrides = dict(session.get("sandbox", {}))
        overrides[scheme_id] = {
            "fields": {k: sch.get(k) for k in ("benefit_text", "benefit_max_inr", "deadline", "deadline_note",
                                               "source_url", "last_verified")},
            "rules": [{k: r[k] for k in ("field", "op", "value", "text_en")} for r in sch["rules"]],
        }
        # the session is a cookie (about 4 KB), so a demo visitor can hold edits to a few schemes at a time
        if len(json.dumps(overrides, ensure_ascii=False)) > 4500:
            return render_template("admin_edit.html", page="admin", s=sch, fields=RULE_FIELDS, ops=OPS,
                                   error="The demo can hold changes to only a few schemes at once. "
                                         "Use 'Undo my changes' on the list first."), 400
        session["sandbox"] = overrides
        entry["changes"] = changes[:6]
        session["sandbox_log"] = ([entry] + list(session.get("sandbox_log", [])))[:5]
        return redirect(url_for("admin_schemes", saved=sch["name_en"]))

    with open(SCHEMES_PATH, encoding="utf-8") as f:
        data = json.load(f)
    data["schemes"] = [sch if x["id"] == scheme_id else x for x in data["schemes"]]
    with open(SCHEMES_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log = _read_log()
    log.insert(0, entry)
    with open(CHANGELOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log[:200], f, ensure_ascii=False, indent=2)
    return redirect(url_for("admin_schemes", saved=sch["name_en"]))


@app.route("/api/extract", methods=["POST"])
def api_extract():
    data = request.get_json(silent=True) or {}
    return jsonify(extract(str(data.get("text") or "")[:MAX_TEXT]))


@app.route("/api/match", methods=["POST"])
def api_match():
    data = request.get_json(silent=True) or {}
    raw = data.get("profile") if isinstance(data.get("profile"), dict) else {}
    profile = {k: (_coerce(k, raw.get(k)) if k in FIELD_OPTIONS else raw.get(k)) for k in PROFILE_KEYS}
    lang = data.get("lang") if data.get("lang") in LANGS else "en"
    return jsonify(match_all(profile, load_schemes(), lang=lang))


@app.route("/api/scheme/<scheme_id>")
def api_scheme(scheme_id):
    scheme = scheme_by_id(scheme_id)
    if not scheme:
        abort(404)
    return jsonify(scheme)


@app.route("/api/ics/<scheme_id>")
def api_ics(scheme_id):
    scheme = scheme_by_id(scheme_id)
    if not scheme:
        abort(404)
    ics = build_ics(scheme)
    if not ics:
        abort(404)
    return Response(ics, mimetype="text/calendar",
                    headers={"Content-Disposition": f"attachment; filename=prapti-{scheme_id}.ics"})


@app.errorhandler(404)
def not_found(_e):
    return render_template("error.html", page="", title="Page not found",
                           text="This page does not exist. Your saved schemes and tracker are safe."), 404


@app.errorhandler(500)
def server_error(_e):
    return render_template("error.html", page="", title="Something went wrong",
                           text="Please try again in a moment. Nothing you typed was stored."), 500


def _restore_vercel_path(wsgi_app):
    """vercel.json sends every request as /api/index?__p=<original path>; put the original path back."""
    def wrapped(environ, start_response):
        pairs = parse_qsl(environ.get("QUERY_STRING", ""), keep_blank_values=True)
        path = next((v for k, v in pairs if k == "__p"), None)
        if path is not None:
            environ["PATH_INFO"] = "/" + path.lstrip("/")
            environ["QUERY_STRING"] = urlencode([(k, v) for k, v in pairs if k != "__p"])
        return wsgi_app(environ, start_response)
    return wrapped


app.wsgi_app = _restore_vercel_path(app.wsgi_app)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(debug=os.environ.get("FLASK_DEBUG", "1") == "1", host=os.environ.get("HOST", "127.0.0.1"), port=port)
