import os
import pathlib
import unittest

os.environ["PRAPTI_AI"] = "off"  # tests never call the API

try:
    from app import app
except ImportError:  # Flask not installed in this interpreter
    app = None

BANNED = ("guaranteed", "you will get", "you are approved", "confirmed eligible")


@unittest.skipIf(app is None, "Flask not installed")
class TestFlow(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.c = app.test_client()


    def test_sandbox_edits_stay_with_one_visitor(self):
        import app as app_module
        app_module.SANDBOX = True
        try:
            judge, other = app.test_client(), app.test_client()
            judge.post("/admin/login", data={"password": "prapti-demo"})
            before = pathlib.Path(app_module.SCHEMES_PATH).read_text(encoding="utf-8")
            form = {"benefit_text": "Changed by a judge", "benefit_max_inr": "1", "deadline": "",
                    "deadline_note": "", "source_url": "https://example.gov.in"}
            sch = app_module.scheme_by_id("nmms")
            for i, r in enumerate(sch["rules"]):
                form.update({f"field_{i}": r["field"], f"op_{i}": r["op"], f"text_{i}": r["text_en"],
                             f"value_{i}": ", ".join(map(str, r["value"])) if isinstance(r["value"], list) else str(r["value"])})
            self.assertEqual(judge.post("/admin/schemes/nmms", data=form).status_code, 302)
            self.assertEqual(pathlib.Path(app_module.SCHEMES_PATH).read_text(encoding="utf-8"), before)  # file untouched
            self.assertIn("Changed by a judge", judge.get("/scheme/nmms").get_data(as_text=True))
            self.assertNotIn("Changed by a judge", other.get("/scheme/nmms").get_data(as_text=True))
            judge.post("/admin/reset")
            self.assertNotIn("Changed by a judge", judge.get("/scheme/nmms").get_data(as_text=True))
        finally:
            app_module.SANDBOX = False

    def test_one_trip_document_list(self):
        import app as app_module
        self.c.post("/find", data={"sample": "lakshmi"})
        r = app_module.match_all(dict(app_module.load_samples()[0]["profile"]), app_module.load_file_schemes())
        trip = app_module.one_trip(r, "en")
        keys = [it["key"] for g in trip["groups"] for it in g["items"]]
        self.assertEqual(len(keys), len(set(keys)))                 # each document listed once
        self.assertEqual(trip["unique"], len(keys))
        self.assertGreater(trip["total"], trip["unique"])            # several schemes share documents
        self.assertEqual(trip["groups"][0]["where"], "mee_seva")     # slow certificates come first
        income = next(it for g in trip["groups"] for it in g["items"] if it["key"] == "income")
        self.assertEqual(len(income["schemes"]), len(trip["schemes"]))  # every scheme needs it
        page = self.c.get("/documents").get_data(as_text=True)
        self.assertIn('data-schemes="', page)
        self.assertIn("Income certificate", page)
        self.assertIn("/documents", self.c.get("/results").get_data(as_text=True))
        self.c.get("/lang/te")
        self.assertIn("ఆదాయ ధృవీకరణ పత్రం", self.c.get("/documents").get_data(as_text=True))

    def test_rush_warning_when_certificate_is_slower_than_deadline(self):
        import app as app_module
        m = {"id": "x", "name": "X", "days_left": 5, "documents": [
            {"key": "caste", "name": "Caste certificate", "where": "mee_seva", "days": 15}]}
        trip = app_module.one_trip({"likely": [m], "maybe": []}, "en")
        self.assertEqual(trip["groups"][0]["items"][0]["rush"], {"name": "X", "d": 5, "n": 15})

    def test_checklists_use_document_keys(self):
        page = self.c.get("/scheme/ts-rtf").get_data(as_text=True)
        self.assertIn('value="income"', page)
        self.assertNotIn('type="checkbox" value="0"', page)

    def test_changes_page_and_source_check(self):
        from unittest import mock
        import app as app_module
        page = self.c.get("/changes").get_data(as_text=True)
        self.assertIn("How we keep the rules right", page)
        self.assertIn("scholarships.gov.in", page)
        self.assertIn('href="/changes"', self.c.get("/about").get_data(as_text=True))
        fake = {s["id"]: {"url": s["source_url"], "state": "changed" if s["id"] == "nmms" else "same",
                          "since": "2026-11-22"} for s in app_module.load_file_schemes()}
        app_module._SOURCE_CHECK.clear()
        with mock.patch.object(app_module, "check_sources", return_value=fake):
            page = self.c.post("/changes/check").get_data(as_text=True)
        self.assertIn("Official page changed since 22 Nov 2026: re-check this scheme", page)
        self.assertIn("Official page unchanged since", page)
        app_module._SOURCE_CHECK.clear()

    def test_tapped_ranges_shown_as_ranges(self):
        self.c.post("/start")
        for f, v in [("education_level", "degree"), ("community", "BC"), ("annual_income", "125000"),
                     ("marks_percent", "68")]:
            self.c.post("/questions", data={"field": f, "value": v})
        page = self.c.get("/results").get_data(as_text=True)
        self.assertIn("55–80%", page)
        self.assertNotIn("68%", page)
        self.assertNotIn("₹1,25,000", page)

    def test_share_link_reopens_same_results(self):
        import base64, json, re
        import app as app_module
        self.c.post("/start")
        for f, v in [("education_level", "professional"), ("year", "1"), ("community", "SC"), ("annual_income", "90000"),
                     ("gender", "female"), ("area", "rural"), ("disability", "false"), ("marks_percent", "88"),
                     ("college_type", "government")]:
            self.c.post("/questions", data={"field": f, "value": v})
        page = self.c.get("/results").get_data(as_text=True)
        link = re.search(r'data-copy="(http[^"]+/r/[^"]+)"', page).group(1)
        self.assertIn("https://wa.me/?text=", page)
        self.assertIn("Prapti%3A%20likely%20eligible%20for", page)
        token = link.rsplit("/", 1)[1]
        other = app.test_client()
        r = other.get("/r/" + token)
        self.assertEqual(r.status_code, 302)
        shared = other.get("/results").get_data(as_text=True)
        self.assertIn("Opened from a shared link", shared)
        strip = lambda h: re.findall(r'class="scheme-name">([^<]+)<', h)
        self.assertEqual(strip(shared), strip(page))          # same schemes, same order
        self.assertIn("Under ₹1L", shared)                      # tapped ranges survive the link
        # a hand-made link cannot inject anything
        bad = base64.urlsafe_b64encode(json.dumps({"c": "<script>", "i": "lots", "z": "Paris", "e": "phd"}).encode()).decode()
        r = other.get("/r/" + bad.rstrip("="))
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r.location.endswith("/"))              # nothing valid in it: back to home
        self.assertEqual(other.get("/r/not-base64!!").status_code, 302)
        self.assertIsNone(app_module.profile_from_token("e30")["community"])  # {} decodes to an empty profile

    def test_security_headers_and_limits(self):
        r = self.c.get("/")
        self.assertIn("frame-ancestors 'none'", r.headers["Content-Security-Policy"])
        self.assertEqual(r.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(app.config["SESSION_COOKIE_SAMESITE"], "Lax")
        big = self.c.post("/api/extract", data="x" * 70000, content_type="application/json")
        self.assertEqual(big.status_code, 413)

    def test_bad_form_values_do_not_crash(self):
        self.c.post("/start")
        r = self.c.post("/questions", data={"field": "annual_income", "value": "lots"})
        self.assertEqual(r.status_code, 302)
        r = self.c.post("/profile", data={"year": "abc", "community": "<b>x</b>", "marks_percent": "999"})
        self.assertEqual(r.status_code, 302)
        r = self.c.post("/api/match", json={"profile": {"annual_income": "100000", "year": "x"}})
        self.assertEqual(r.status_code, 200)
        r = self.c.post("/api/match", json={"profile": "oops"})
        self.assertEqual(r.status_code, 200)
    def test_sample_goes_straight_to_results(self):
        r = self.c.post("/find", data={"sample": "lakshmi"})
        self.assertTrue(r.headers["Location"].endswith("/results"))
        page = self.c.get("/results").get_data(as_text=True)
        self.assertIn("Lakshmi is likely eligible for 2 schemes", page)

    def test_text_with_gaps_asks_only_what_matters(self):
        r = self.c.post("/find", data={"text": "I am in B.Tech 1st year, we are SC, family income 80,000 a year"})
        self.assertTrue(r.headers["Location"].endswith("/questions"))
        page = self.c.get("/questions").get_data(as_text=True)
        self.assertIn("Are you a girl or a boy?", page)
        self.assertNotIn("Which community", page)  # already known

    def test_answering_and_skipping_reach_results(self):
        self.c.post("/find", data={"text": "I am in B.Tech 1st year, we are SC, family income 80,000 a year"})
        for _ in range(10):
            r = self.c.get("/questions")
            if r.status_code == 302:
                break
            page = r.get_data(as_text=True)
            field = page.split('name="field" value="')[1].split('"')[0]
            self.c.post("/questions", data={"field": field, "skip": "1"})
        self.assertTrue(r.headers["Location"].endswith("/results"))
        page = self.c.get("/results").get_data(as_text=True)
        self.assertIn("Post-Matric Scholarship (SC / ST)", page)

    def test_id_number_is_removed_and_noted(self):
        self.c.post("/find", data={"text": "aadhaar 1234 5678 9012, inter 2nd year BC 1 lakh village"})
        page = self.c.get("/questions").get_data(as_text=True)
        if "We removed a number" not in page:
            page = self.c.get("/results").get_data(as_text=True)
        self.assertIn("We removed a number", page)
        self.assertNotIn("1234 5678 9012", page)

    def test_no_banned_words_on_any_page(self):
        self.c.post("/find", data={"sample": "ravi"})
        for url in ["/", "/results", "/scheme/central-sector", "/scheme/aicte-pragati"]:
            page = self.c.get(url).get_data(as_text=True).lower()
            for word in BANNED:
                self.assertNotIn(word, page, url)

    def test_tracker_page(self):
        r = self.c.get("/tracker")
        self.assertEqual(r.status_code, 200)
        page = r.get_data(as_text=True)
        self.assertIn('id="schemes-meta"', page)
        self.assertIn("aicte-pragati", page)
        self.assertIn('href="/tracker"', self.c.get("/").get_data(as_text=True))

    def test_telugu_and_hindi(self):
        self.c.get("/lang/te")
        page = self.c.get("/").get_data(as_text=True)
        self.assertIn('<html lang="te">', page)
        self.assertIn("మీ స్కాలర్‌షిప్‌లు మీ కోసం ఎదురుచూస్తున్నాయి", page)
        self.c.post("/find", data={"sample": "lakshmi"})
        page = self.c.get("/results").get_data(as_text=True)
        self.assertIn("లక్ష్మి", page)
        self.assertIn("సంవత్సరానికి ₹1,10,000", page)
        self.c.get("/lang/hi")
        page = self.c.get("/scheme/ts-postmatric-bc-ebc").get_data(as_text=True)
        self.assertIn("पारिवारिक आय", page)
        self.assertIn("मेरे ट्रैकर में जोड़ें", page)
        self.c.get("/lang/en")

    def test_every_text_has_all_languages(self):
        import json
        with open("data/i18n.json", encoding="utf-8") as f:
            data = json.load(f)
        for key, entry in data.items():
            if key.startswith("_"):
                continue
            for lang in ("en", "te", "hi"):
                self.assertIn(lang, entry, key)

    def test_about_helper_and_print(self):
        self.assertIn("Who pays", self.c.get("/about").get_data(as_text=True))
        self.assertEqual(self.c.get("/helper").status_code, 200)
        r = self.c.post("/api/helper-check", json={"text": "Inter 2nd year BC 1 lakh village, aadhaar 1234 5678 9012"})
        d = r.get_json()
        self.assertTrue(d["removed_id"])
        self.assertIn("ts-postmatric-bc-ebc", [x["id"] for x in d["likely"]])
        page = self.c.get("/helper/print?nick=Student%201&ids=ts-rtf").get_data(as_text=True)
        self.assertIn("Documents to bring", page)

    def test_editor_needs_password_and_changes_results(self):
        import shutil, tempfile
        from engine import match
        backup = tempfile.mktemp()
        shutil.copy(match.SCHEMES_PATH, backup)
        from pathlib import Path
        log_backup = Path("data/changelog.json").read_text(encoding="utf-8")
        try:
            self.assertNotIn("admin-item", self.c.get("/admin/schemes").get_data(as_text=True))
            self.assertEqual(self.c.post("/admin/login", data={"password": "wrong"}).status_code, 401)
            self.c.post("/admin/login", data={"password": "prapti-demo"})
            form = self.c.get("/admin/schemes/ts-postmatric-bc-ebc").get_data(as_text=True)
            self.assertIn("Save and mark verified today", form)
            data = {"benefit_text": "x", "benefit_max_inr": "15000", "deadline": "2026-12-31", "deadline_note": "n",
                    "source_url": "https://telanganaepass.cgg.gov.in"}
            rules = match.load_schemes()
            sch = next(s for s in rules if s["id"] == "ts-postmatric-bc-ebc")
            for i, rule in enumerate(sch["rules"]):
                data[f"field_{i}"] = rule["field"]
                data[f"op_{i}"] = rule["op"]
                v = rule["value"]
                data[f"value_{i}"] = ", ".join(v) if isinstance(v, list) else str(v)
                data[f"text_{i}"] = rule["text_en"]
            data["value_2"] = "100000"  # rural limit below Lakshmi's ₹1.1L
            r = self.c.post("/admin/schemes/ts-postmatric-bc-ebc", data=data)
            self.assertEqual(r.status_code, 302)
            self.c.post("/find", data={"sample": "lakshmi"})
            page = self.c.get("/results").get_data(as_text=True)
            self.assertIn("1 scheme", page)
        finally:
            shutil.copy(backup, match.SCHEMES_PATH)
            Path("data/changelog.json").write_text(log_backup, encoding="utf-8")
            self.c.post("/admin/logout")

    def test_tap_only_path_and_back(self):
        r = self.c.post("/start")
        self.assertTrue(r.headers["Location"].endswith("/questions"))
        page = self.c.get("/questions").get_data(as_text=True)
        self.assertIn("What are you studying now?", page)
        self.c.post("/questions", data={"field": "education_level", "value": "degree"})
        page = self.c.get("/questions").get_data(as_text=True)
        self.assertIn("/questions/back", page)
        current = page.split('name="current" value="')[1].split('"')[0]
        self.c.post("/questions/back", data={"current": current})
        self.assertIn("What are you studying now?", self.c.get("/questions").get_data(as_text=True))

    def test_results_show_first_step_and_listen(self):
        self.c.post("/find", data={"sample": "lakshmi"})
        page = self.c.get("/results").get_data(as_text=True)
        self.assertIn("Your first step", page)
        self.assertIn("Show me how to apply", page)
        self.assertIn("data-speak", page)
        self.assertIn('id="how"', self.c.get("/scheme/ts-rtf").get_data(as_text=True))

    def test_first_visit_language_choice(self):
        fresh = app.test_client()
        self.assertIn('class="lang-pick"', fresh.get("/").get_data(as_text=True))
        fresh.get("/lang/te")
        self.assertNotIn('class="lang-pick"', fresh.get("/").get_data(as_text=True))

    def test_calendar_file(self):
        r = self.c.get("/api/ics/aicte-pragati")
        self.assertEqual(r.status_code, 200)
        self.assertIn("BEGIN:VCALENDAR", r.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
