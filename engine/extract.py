"""Turn plain text into a student profile.

Step 3 ships the rule-based fallback parser (works offline, no AI).
Step 4 adds an LLM first pass; this parser stays as the fallback.

Guardrail: anything that looks like an ID number is removed before parsing.
"""
from __future__ import annotations

import re

PROFILE_KEYS = ["education_level", "year", "community", "annual_income", "gender", "area",
                "district", "disability", "marks_percent", "college_type"]

# 12-digit Aadhaar-like numbers (with optional spaces/dashes) and PAN-like codes.
_AADHAAR = re.compile(r"(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)")
_PAN = re.compile(r"\b[A-Za-z]{5}\d{4}[A-Za-z]\b")
_LONG_NUMBER = re.compile(r"(?<!\d)\d{10,}(?!\d)")

TELANGANA_DISTRICTS = [
    "Adilabad", "Bhadradri Kothagudem", "Hanumakonda", "Hyderabad", "Jagtial", "Jangaon",
    "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam",
    "Kumuram Bheem Asifabad", "Mahabubabad", "Mahabubnagar", "Mancherial", "Medak",
    "Medchal", "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal", "Nizamabad",
    "Peddapalli", "Rajanna Sircilla", "Rangareddy", "Sangareddy", "Siddipet", "Suryapet",
    "Vikarabad", "Wanaparthy", "Warangal", "Yadadri Bhuvanagiri",
]
DISTRICT_ALIASES = {
    "హైదరాబాద్": "Hyderabad", "हैदराबाद": "Hyderabad", "వరంగల్": "Warangal", "नलगोंडा": "Nalgonda",
    "నల్గొండ": "Nalgonda", "కరీంనగర్": "Karimnagar", "ఖమ్మం": "Khammam", "నిజామాబాద్": "Nizamabad",
    "secunderabad": "Hyderabad", "ranga reddy": "Rangareddy", "hyd": "Hyderabad", "hyderabad": "Hyderabad",
    "రంగారెడ్డి": "Rangareddy", "medchal-malkajgiri": "Medchal",
}
URBAN_DISTRICTS = {"Hyderabad", "Medchal", "Rangareddy"}

# Telugu and Devanagari digits, read as 0-9 (voice typing and phone keyboards can return them)
_DIGITS = str.maketrans("౦౧౨౩౪౫౬౭౮౯०१२३४५६७८९", "0123456789" * 2)


def normalise_digits(text: str) -> str:
    return (text or "").translate(_DIGITS)


def scrub_ids(text: str) -> tuple[str, bool]:
    """Remove ID-like numbers. Returns (clean_text, removed_anything)."""
    cleaned = _AADHAAR.sub(" ", text)
    cleaned = _PAN.sub(" ", cleaned)
    cleaned = _LONG_NUMBER.sub(" ", cleaned)
    return cleaned, cleaned != text


def _num(s: str) -> float:
    return float(s.replace(",", ""))


# Words for "month", "thousand" and "lakh" as students type them: English, Telugu, Hindi,
# and Telugu or Hindi written in English letters ("velu", "hazaar", "nelaku", "mahine").
_MONTH_WORDS = r"month|monthly|నెల|महीन|माह|nelaku|nela\b|mahin[ae]|mahina|mahine"
_MONTHLY = re.compile(r"^\s*(?:rupees|rs\.?|₹)?\s*(?:per|a|every|each|/|ka|ki|ke)?\s*(?:" + _MONTH_WORDS + ")", re.I)
_MONTH_BEFORE = re.compile(_MONTH_WORDS, re.I)
_LAKH = r"(?:lakhs?|lacs?|lac|lpa\b|l\b|lakshalu|laksha\w*|లక్షలు|లక్ష|लाख)"
_THOUSAND = r"(?:thousand|k\b|velu|vela\b|వేలు|వేల|hazaa?r|hajar|हज़ार|हजार)"
_INCOME_WORDS = r"income|earn\w*|salary|kamai|kamaata|aamdani|amdani|aadayam|adayam|sampad\w*|ఆదాయం|आय|आमदनी|कमाई"
_NUMBER = r"(\d{1,3}(?:,\d{2,3})+|\d{4,7})"


def _income(t: str):
    value = _income_once(t)
    if value is None:
        return None
    amount, start, end = value
    monthly = _MONTHLY.search(t[end:end + 25]) or _MONTH_BEFORE.search(t[max(0, start - 25):start])
    return amount * 12 if monthly else amount


def _income_once(t: str):
    # "1 lakh 20 thousand"
    m = re.search(r"(\d+(?:\.\d+)?)\s*" + _LAKH + r"\s*(?:and\s*)?(\d+)\s*" + _THOUSAND, t, re.I)
    if m:
        return int(_num(m.group(1)) * 100000 + _num(m.group(2)) * 1000), m.start(), m.end()
    m = re.search(r"(\d+(?:\.\d+)?)\s*" + _LAKH, t, re.I)
    if m:
        return int(_num(m.group(1)) * 100000), m.start(), m.end()
    m = re.search(r"(\d+(?:\.\d+)?)\s*" + _THOUSAND, t, re.I)
    if m:
        return int(_num(m.group(1)) * 1000), m.start(), m.end()
    # plain number near an income word, e.g. "income is 80,000", "papa ki kamai 6000", "nelaku 15000 sampadistharu"
    m = re.search(r"(?:" + _INCOME_WORDS + r")\D{0,30}?" + _NUMBER, t, re.I)
    if m:
        return int(_num(m.group(1))), m.start(1), m.end()
    m = re.search(_NUMBER + r"\s*(?:\S+\s*){0,1}(?:" + _INCOME_WORDS + ")", t, re.I)
    if m:
        return int(_num(m.group(1))), m.start(), m.end(1)
    m = re.search(_NUMBER + r"\s*(?:a year|per year|per annum|yearly|/year)", t, re.I)
    if m:
        return int(_num(m.group(1))), m.start(), m.end()
    return None


def _community(t: str):
    # Short codes (SC, ST, BC, OC) are matched in capitals and standing alone, so that
    # "B.Sc", "BCA" or "St. Ann's" are not read as a community. Lower case counts only
    # next to a word like "category" ("sc category", "we are st").
    def code(c):
        return (re.search(r"(?<![\w.])" + c + r"(?!\w)", t)
                or re.search(r"\b" + c + r"\s*(?:category|caste|community|student|candidate|quota)\b"
                             r"|\b(?:we are|i am|memu|hum|ham)\s+" + c + r"\b", t, re.I))
    if code("EBC"):
        return "EBC"
    if code(r"S\.?C\.?") or re.search(r"scheduled caste|దళిత|दलित|ఎస్సీ|एससी|एस\.?सी", t, re.I):
        return "SC"
    if (re.search(r"(?<![\w.])S\.?T\b\.?(?!\s*[A-Z][a-z])", t) or code("ST")
            or re.search(r"scheduled tribe|tribal|\blambad[ai]\b|\bbanjara\b|\bkoya\b|\bgonds?\b|ఎస్టీ|గిరిజన|आदिवासी|एसटी", t, re.I)):
        return "ST"
    if (re.search(r"(?<![\w.])O?BC(?:[\s-][A-E])?(?!\w)", t) or code("BC") or code("OBC")
            or re.search(r"backward|బీసీ|ओबीसी|पिछड़", t, re.I)):
        return "BC"
    if re.search(r"minorit|muslim|christian|sikh|మైనారిటీ|ముస్లిం|अल्पसंख्यक|मुस्लिम", t, re.I):
        return "Minority"
    if (code("OC") or code("EWS") or re.search(r"general (?:category|caste)|forward caste|\bgeneral\s+category", t, re.I)):
        return "OC"
    return None


def _education(t: str):
    checks = [
        ("pg", r"\b(?:m\.?\s?tech|mba|mca|m\.?\s?sc\b|m\.\s?com\b|mcom\b|m\.?\s?pharm\w*|(?-i:M\.?A\b)|post\s?grad\w*|pg\b|masters?\b)"),
        ("professional", r"b\.?\s?tech|(?-i:\bB\.?E\b)|engineering|\bengg\b|mbbs|b\.?\s?pharm|pharmacy|medicine|medical (?:college|course|student)|\bbds\b|nursing|b\.?\s?arch|ఇంజనీరింగ్|इंजीनियरिंग"),
        ("iti_polytechnic", r"polytechnic|diploma|\biti\b|పాలిటెక్నిక్|पॉलिटेक्निक"),
        ("degree", r"\bdegree\b|\bb\.?\s?com|\bb\.?\s?sc|\bb\.?\s?a\b|\bbba\b|\bbca\b|graduat|డిగ్రీ|डिग्री"),
        ("inter", r"\binter\b|intermediate|junior college|\b1[12]th\b|\b1[12]\s*(?:class|std)|class\s*1[12]|ఇంటర్|इंटर"),
        ("class_10", r"class\s*10|10th\s*(?:class|std|standard)|\bin\s*10th|\bssc\b|పదవ తరగతి|दसवीं"),
        ("class_9", r"class\s*9|9th\s*(?:class|std|standard)|\bin\s*9th|తొమ్మిదవ తరగతి|नौवीं"),
    ]
    for level, pattern in checks:
        if re.search(pattern, t, re.I):
            return level
    return None


_YEAR_WORDS = {
    "first": 1, "1st": 1, "second": 2, "2nd": 2, "third": 3, "3rd": 3, "fourth": 4, "4th": 4, "final": 4,
    "మొదటి": 1, "రెండవ": 2, "రెండో": 2, "మూడవ": 3, "నాలుగవ": 4, "पहले": 1, "पहला": 1, "दूसरे": 2, "दूसरा": 2, "तीसरे": 3,
    "modati": 1, "modhati": 1, "rendo": 2, "rendava": 2, "moodo": 3, "mudo": 3, "mudava": 3, "naalugo": 4, "nalugo": 4,
    "pehle": 1, "pehla": 1, "pahle": 1, "doosre": 2, "dusre": 2, "doosra": 2, "dusra": 2, "teesre": 3, "tisre": 3,
}


def _year(t: str):
    m = re.search(r"(" + "|".join(_YEAR_WORDS) + r")\s*(?:-|\s)?\s*(?:year|yr|సంవత్సరం|साल|वर्ष|samvatsaram|saal|sal\b)", t, re.I)
    if m:
        return _YEAR_WORDS[m.group(1).lower()]
    m = re.search(r"(?:year|yr)\s*(\d)\b", t, re.I)
    if m:
        return int(m.group(1))
    return None


def _gender(t: str):
    # Pronouns (he/she/his/her) are left out on purpose: in these messages they usually describe
    # a parent ("my father, he is a farmer"), not the student. A sibling counts only when the
    # sibling is the one studying ("my sister is doing engineering").
    if re.search(r"\b(?:girl|female|daughter|woman|ammayi|ammai|ladki|beti)\b"
                 r"|\bsister\s+(?:is\s+)?(?:studying|doing|in|joined|studies|got)\b"
                 r"|\b(?:rahi|rhi)\s*(?:hoon|hun|hu|hu?n)\b|विद्यार्थिनी|छात्रा|रही\s*(?:हूँ|हूं)|విద్యార్థిని|అమ్మాయి|बेटी|लड़की", t, re.I):
        return "female"
    if re.search(r"\b(?:boy|male|son|abbayi|abbai|ladka|beta)\b"
                 r"|\bbrother\s+(?:is\s+)?(?:studying|doing|in|joined|studies|got)\b"
                 r"|\b(?:raha|rha)\s*(?:hoon|hun|hu|hu?n)\b|छात्र\b|रहा\s*(?:हूँ|हूं)|అబ్బాయి|बेटा|लड़का", t, re.I):
        return "male"
    return None


def _district(t: str):
    for d in TELANGANA_DISTRICTS:
        if re.search(r"\b" + re.escape(d) + r"\b", t, re.I):
            return d
    for alias, d in DISTRICT_ALIASES.items():
        if re.search(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", t, re.I):
            return d
    return None


def _area(t: str, district):
    if re.search(r"village|rural|\bgram\b|గ్రామం|పల్లె|ఊరు|गाँव|गांव|ग्रामीण|\bgaon\b|\bgaav\b|\bgav\b|\bpalle\b|\bpalli\b|\bthanda\b|\btanda\b|\b(?:maa\s+)?vooru\b", t, re.I):
        return "rural"
    if re.search(r"\bcity\b|urban|\btown\b|शहर|నగరం|పట్టణం|\bshehar\b|\bshahar\b|\bnagaram\b|\bpattanam\b", t, re.I):
        return "urban"
    if district in URBAN_DISTRICTS:
        return "urban"
    return None


_DISABILITY = r"disab|handicap|\bpwd\b|\bph\b|divyang|blind|deaf|hearing|wheelchair|వికలాంగ|దివ్యాంగ|दिव्यांग|विकलांग"


def _disability(t: str):
    if re.search(_DISABILITY, t, re.I):
        if re.search(r"\bno\s+disab|not\s+disabled|\bno\s+handicap", t, re.I):
            return False
        return True
    return None


def _marks(t: str):
    for m in re.finditer(r"(\d{2,3}(?:\.\d+)?)\s*(?:%|percent|per cent|శాతం|प्रतिशत)", t, re.I):
        # "60% handicapped", "40% disability", "hearing disability (50%)" describe a disability
        # certificate, not exam marks. "85%, no disability" is still marks.
        before, after = t[max(0, m.start() - 30):m.start()], t[m.end():m.end() + 25]
        if (re.match(r"\W{0,3}(?:physically\s+)?(?:" + _DISABILITY + ")", after, re.I)
                or re.search(r"(?:" + _DISABILITY + r")\w*(?:\s+(?:certificate|cert|of|is|percentage))*\W{0,15}$", before, re.I)):
            continue
        v = _num(m.group(1))
        if 0 < v <= 100:
            return v
    # Telangana SSC gives a GPA out of 10. GPA x 9.5 is the widely used approximate conversion
    # (the board publishes no official formula), so a GPA gives an approximate percentage.
    m = re.search(r"(\d{1,2}(?:\.\d+)?)\s*(?:/\s*10\s*)?(?:gpa|cgpa)|(?:gpa|cgpa)\s*(?:of|is|:)?\s*(\d{1,2}(?:\.\d+)?)", t, re.I)
    if m:
        v = _num(m.group(1) or m.group(2))
        if 0 < v <= 10:
            return round(v * 9.5, 2)
    return None


def _college(t: str):
    if re.search(r"government|govt|aided|zphs|zilla parishad|ప్రభుత్వ|सरकारी|\bsarkari\b|\bprabhutva\b|\bprabutva\b", t, re.I):
        return "government"
    if re.search(r"private|ప్రైవేట్|प्राइवेट|निजी|\bprivet\b", t, re.I):
        return "private"
    return None


def extract_fallback(text: str) -> dict:
    t = normalise_digits(text)
    district = _district(t)
    return {
        "education_level": _education(t),
        "year": _year(t),
        "community": _community(t),
        "annual_income": _income(t),
        "gender": _gender(t),
        "area": _area(t, district),
        "district": district,
        "disability": _disability(t),
        "marks_percent": _marks(t),
        "college_type": _college(t),
    }


def extract(text: str, use_ai: bool = True) -> dict:
    """Returns {"profile": {...}, "removed_id": bool, "source": "ai" | "offline"}.

    ID-like numbers are removed before anything else sees the text.
    The optional AI reading fills what it can; the offline parser fills any gaps.
    """
    clean, removed = scrub_ids(normalise_digits(text))
    offline = extract_fallback(clean)
    ai = None
    if use_ai:
        from engine.llm import extract_with_ai
        ai = extract_with_ai(clean)
    if ai:
        profile = {k: (ai.get(k) if ai.get(k) is not None else offline.get(k)) for k in PROFILE_KEYS}
        source = "ai"
    else:
        profile = offline
        source = "offline"
    return {"profile": profile, "removed_id": removed, "source": source}
