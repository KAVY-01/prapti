import os
import unittest

os.environ["PRAPTI_AI"] = "off"  # tests never call the API

try:
    from app import app
except ImportError:  # Flask not installed in this interpreter
    app = None

BANNED_WORDS = ("guarantee", "guaranteed")
LANGUAGES = (None, "en", "te", "hi")  # None = default (no language chosen yet, so English)


@unittest.skipIf(app is None, "Flask not installed")
class TestNoGuaranteeWording(unittest.TestCase):
    def public_get_urls(self):
        """Every GET page without URL parameters, skipping static files and the admin editor."""
        urls = set()
        for rule in app.url_map.iter_rules():
            if "GET" not in rule.methods or rule.arguments:
                continue
            if rule.endpoint == "static" or rule.rule.startswith(("/static", "/admin")):
                continue
            urls.add(rule.rule)
        return sorted(urls)

    def test_no_guarantee_wording_on_any_public_page_in_any_language(self):
        urls = self.public_get_urls()
        self.assertIn("/", urls)
        for lang in LANGUAGES:
            client = app.test_client()
            if lang:
                client.get(f"/lang/{lang}")  # language is kept in the session, set by /lang/<code>
            client.post("/find", data={"sample": "lakshmi"})  # so result pages render too
            for url in urls:
                body = client.get(url).get_data(as_text=True).lower()
                for word in BANNED_WORDS:
                    self.assertNotIn(word, body, f"'{word}' found on {url} (lang={lang or 'default'})")


if __name__ == "__main__":
    unittest.main()
