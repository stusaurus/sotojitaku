import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class FishingUiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index=(ROOT/"fishing/index.html").read_text()
        cls.app=(ROOT/"fishing/app.js").read_text()
        cls.questions=json.loads((ROOT/"fishing/data/questions.json").read_text())
        cls.gear=json.loads((ROOT/"fishing/data/gear.json").read_text())

    def test_canonical_and_ga_are_present(self):
        self.assertIn('https://stusaurus.github.io/sotojitaku/fishing/', self.index)
        self.assertIn('G-GFVSZ8YDQ5', self.index)

    def test_fail_closed_product_copy_is_present(self):
        self.assertIn('販売状況を確認できた商品だけを表示します', self.app)
        self.assertIn('未確認の商品を無理に出すことはしません', self.app)

    def test_all_person_life_jacket_wording(self):
        owned=next(q for q in self.questions["questions"] if q["id"]=="owned")
        labels={o["value"]:o["label"] for o in owned["options"]}
        self.assertIn("全員分", labels["life_jacket_adult"])
        self.assertIn("全員分", labels["life_jacket_child"])
        gear_labels={g["id"]:g["label"] for g in self.gear["categories"]}
        self.assertIn("全員分", gear_labels["life_jacket_adult"])
        self.assertIn("全員分", gear_labels["life_jacket_child"])

    def test_group_option_is_adult_only_to_avoid_hidden_child_safety_gap(self):
        party=next(q for q in self.questions["questions"] if q["id"]=="party")
        labels={o["value"]:o["label"] for o in party["options"]}
        self.assertEqual(labels["group"], "大人3人以上で")

    def test_result_has_local_rule_gate(self):
        self.assertIn("行く釣り場の公式ルールを確認した", self.app)
        self.assertIn("テトラ・磯・荒天・立入禁止場所", self.app)

    def test_bundle_recommendation_copy_is_present(self):
        self.assertIn("項目まとめて揃う", self.app)
        self.assertIn("rawChecklist", self.app)

    def test_shared_catalog_is_primary_with_local_fallback(self):
        self.assertIn("https://stusaurus.github.io/daily-cost-jp/shared/fishing-products.json", self.app)
        self.assertIn("./data/audited-products.json", self.app)
        self.assertIn("fishing_catalog_loaded", self.app)

if __name__=="__main__":
    unittest.main()
