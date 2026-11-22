"""Source watcher: flags official pages whose wording changed since the last check (no network in tests)."""
import json
import os
import tempfile
import unittest
from unittest import mock

from engine import sources


class TestSourceWatcher(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.patches = [mock.patch.object(sources, "SNAP_DIR", self.tmp),
                        mock.patch.object(sources, "INDEX_PATH", os.path.join(self.tmp, "index.json"))]
        for p in self.patches:
            p.start()
        self.schemes = [{"id": "a", "source_url": "https://example.gov.in/a"},
                        {"id": "b", "source_url": "https://example.gov.in/a"},   # two schemes, one page
                        {"id": "c", "source_url": "https://example.gov.in/c"}]
        text = "Income limit is 2 lakh per year for SC students. Last date to apply is 31 December. " * 20
        with open(os.path.join(self.tmp, "a.txt"), "w") as f:
            f.write(text)
        with open(os.path.join(self.tmp, "c.txt"), "w") as f:
            f.write(text)
        with open(os.path.join(self.tmp, "index.json"), "w") as f:
            json.dump({"https://example.gov.in/a": {"file": "a.txt", "taken": "2026-11-22"},
                       "https://example.gov.in/c": {"file": "c.txt", "taken": "2026-11-22"}}, f)
        self.text = text

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def test_page_text_drops_scripts_and_tags(self):
        self.assertEqual(sources.page_text("<p>Hi <b>there</b></p><script>x=1</script>"), "Hi there")

    def test_same_changed_and_unreachable(self):
        new = self.text.replace("2 lakh", "2.5 lakh").replace("31 December", "15 January") * 1
        new = new[: len(new) // 2] + " New rules: income limit raised, apply on the new portal. " * 30

        def fake_fetch(url, timeout=8.0):
            if url.endswith("/a"):
                return new
            raise OSError("down")
        with mock.patch.object(sources, "fetch", fake_fetch):
            r = sources.check_all(self.schemes)
        self.assertEqual(r["a"]["state"], "changed")
        self.assertEqual(r["b"]["state"], "changed")        # both schemes on that page are flagged
        self.assertEqual(r["c"]["state"], "unreachable")

    def test_tiny_change_is_not_flagged(self):
        with mock.patch.object(sources, "fetch", lambda url, timeout=8.0: self.text + " Visitors: 12345"):
            r = sources.check_all(self.schemes)
        self.assertEqual(r["a"]["state"], "same")
