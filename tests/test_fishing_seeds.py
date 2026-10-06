import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SEED_DIR=ROOT/"fishing"/"data"/"product-seeds"

class FishingSeedCoverageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.seeds=[json.loads(p.read_text()) for p in sorted(SEED_DIR.glob("*.json"))]

    def supports(self,method,budget,category):
        return any(
            method in s.get("methodIds",[])
            and budget in s.get("budgetTiers",[])
            and category in s.get("coverCategoryIds",[])
            for s in self.seeds
        )

    def test_core_matrix_has_seed_coverage(self):
        required={
            "sabiki":["rod_reel","rig","bait","life_jacket_adult","bucket","fish_grip","scissors","cooler"],
            "choi_nage":["rod_reel","rig","bait","life_jacket_adult","fish_grip","scissors","pliers","cooler"],
        }
        missing=[]
        for method,categories in required.items():
            for budget in ("low","balanced","long_term"):
                for category in categories:
                    if not self.supports(method,budget,category):
                        missing.append(f"{method}/{budget}/{category}")
        self.assertEqual(missing,[])

    def test_child_pfd_is_not_required_for_catalog_coverage_without_fit_input(self):
        gear=json.loads((ROOT/"fishing"/"data"/"gear.json").read_text())
        child=next(g for g in gear["categories"] if g["id"]=="life_jacket_child")
        self.assertFalse(child["monetizable"])
        self.assertTrue(child["safety"])
        self.assertTrue(child["fit_sensitive"])

    def test_exact_rakuten_urls_are_unique(self):
        urls=[s["itemUrl"] for s in self.seeds]
        self.assertEqual(len(urls),len(set(urls)))
        for url in urls:
            self.assertTrue(url.startswith("https://item.rakuten.co.jp/"))
            self.assertTrue(url.endswith("/"))

    def test_bundle_metadata_is_consistent(self):
        for seed in self.seeds:
            self.assertIn(seed["categoryId"],seed.get("coverCategoryIds",[]))
            self.assertTrue(seed.get("identityGroups"))
            self.assertTrue(seed.get("specCheckedAt"))
            self.assertTrue(seed.get("specEvidenceUrl"))

if __name__=="__main__":
    unittest.main()
