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

    def test_saved_plan_return_flow(self):
        self.assertIn('id="savedBtn"', self.index)
        self.assertIn("readSavedPlan", self.app)
        self.assertIn("openSavedPlan", self.app)
        self.assertIn("fishing_saved_plan_open", self.app)
        self.assertIn("fishing_plan_saved", self.app)
        self.assertIn("renderResult({trackDiagnosis:false})", self.app)

    def test_rule_toggle_does_not_duplicate_diagnosis_completion(self):
        self.assertIn('renderResult({trackDiagnosis:false})', self.app)
        self.assertIn('if(trackDiagnosis&&isNewResult)', self.app)

    def test_first_trip_guidance_is_present(self):
        self.assertIn("renderFitReasons", self.app)
        self.assertIn("renderFirstTripGuide", self.app)
        self.assertTrue((ROOT/"fishing/data/howto.json").exists())
        howto=json.loads((ROOT/"fishing/data/howto.json").read_text())
        self.assertGreaterEqual(len(howto["methods"]["sabiki"]["setup"]), 5)
        self.assertGreaterEqual(len(howto["methods"]["choi_nage"]["setup"]), 5)

    def test_result_coverage_uses_effective_bundle_coverage(self):
        self.assertIn("product.effectiveCoverCategoryIds||product.coverCategoryIds", self.app)
        self.assertIn("p.effectiveCoverCategoryIds||p.coverCategoryIds", self.app)

    def test_life_jacket_quantity_and_total_disclaimer_are_present(self):
        self.assertIn("子どもの人数分を用意してください", self.app)
        self.assertIn("大人2人分を用意してください", self.app)
        self.assertIn("人数分の追加数量はこの合計に含めていません", self.app)

    def test_basket_and_click_revenue_events_are_present(self):
        self.assertIn('track("fishing_basket_view"', self.app)
        self.assertIn("recommendation_role:a.dataset.role", self.app)
        self.assertIn("budget_tier:answers.budget", self.app)

if __name__=="__main__":
    unittest.main()
