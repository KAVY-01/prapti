"""Keeps the offline reader honest: 60 realistic messages in five writing styles."""
import unittest

from scripts.reader_eval import score
from tests.reader_cases import HOLDOUT, PRACTICE


class TestReaderAccuracy(unittest.TestCase):
    def check(self, cases):
        stated, right, invented = score(cases, show=False)
        self.assertGreaterEqual(right / stated, 0.95, f"read {right}/{stated}")
        self.assertLessEqual(invented, 1, "the reader must not fill in details nobody gave")

    def test_practice_messages(self):
        self.check(PRACTICE)

    def test_holdout_messages(self):
        self.check(HOLDOUT)
