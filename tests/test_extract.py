import unittest

from engine.extract import extract, scrub_ids


class TestExtract(unittest.TestCase):
    def test_english(self):
        p = extract("I'm in Inter 2nd year in Warangal, we are BC, income around 1 lakh, got 72% in 10th")["profile"]
        self.assertEqual(p["education_level"], "inter")
        self.assertEqual(p["year"], 2)
        self.assertEqual(p["community"], "BC")
        self.assertEqual(p["annual_income"], 100000)
        self.assertEqual(p["district"], "Warangal")
        self.assertEqual(p["marks_percent"], 72)

    def test_telugu(self):
        p = extract("నేను డిగ్రీ మొదటి సంవత్సరం, మా ఊరు నల్గొండ, మేము SC, మా ఆదాయం 80 వేలు.")["profile"]
        self.assertEqual(p["education_level"], "degree")
        self.assertEqual(p["year"], 1)
        self.assertEqual(p["community"], "SC")
        self.assertEqual(p["annual_income"], 80000)
        self.assertEqual(p["area"], "rural")
        self.assertEqual(p["district"], "Nalgonda")

    def test_hindi(self):
        p = extract("मैं हैदराबाद में B.Tech कर रही हूँ, हम minority हैं, family income 1.5 लाख है।")["profile"]
        self.assertEqual(p["education_level"], "professional")
        self.assertEqual(p["community"], "Minority")
        self.assertEqual(p["annual_income"], 150000)
        self.assertEqual(p["gender"], "female")
        self.assertEqual(p["area"], "urban")

    def test_unknown_stays_none(self):
        p = extract("hello")["profile"]
        self.assertTrue(all(v is None for v in p.values()))

    def test_id_numbers_removed(self):
        r = extract("my aadhaar is 1234 5678 9012 and PAN ABCDE1234F, inter BC 1 lakh")
        self.assertTrue(r["removed_id"])
        clean, removed = scrub_ids("call 9876543210")
        self.assertTrue(removed)
        self.assertNotIn("9876543210", clean)
        self.assertEqual(r["profile"]["community"], "BC")


class TestMisreadings(unittest.TestCase):
    """Words that used to be read as the wrong detail."""

    def p(self, text):
        return extract(text, use_ai=False)["profile"]

    def test_course_names_are_not_communities(self):
        self.assertEqual(self.p("I am doing B.Sc first year, BC, income 1 lakh")["community"], "BC")
        self.assertIsNone(self.p("I study BCA 2nd year")["community"])
        self.assertIsNone(self.p("studying at St. Ann's college, BCom")["community"])

    def test_everyday_words_are_not_courses(self):
        self.assertEqual(self.p("I'm a BC girl in inter")["education_level"], "inter")
        self.assertEqual(self.p("I want to be a teacher, doing degree")["education_level"], "degree")
        self.assertEqual(self.p("I am in class 9 and have 11 siblings")["education_level"], "class_9")
        self.assertEqual(self.p("I am in 10th class, income 12,000")["education_level"], "class_10")

    def test_monthly_income_becomes_yearly(self):
        self.assertEqual(self.p("income 12,000 per month")["annual_income"], 144000)
        self.assertEqual(self.p("మా ఆదాయం నెలకు 8 వేలు")["annual_income"], 96000)
        self.assertEqual(self.p("family income 1.5 lakh")["annual_income"], 150000)


if __name__ == "__main__":
    unittest.main()
