import json,sys,unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import probe_camp_final_three as proof

class LastThreeProofs(unittest.TestCase):
    def scenario(self,outcomes):
        with TemporaryDirectory() as d:
            root=Path(d);(root/"data").mkdir()
            audits=[{"category":cat,"model":model,"itemCode":f"realshop:{i+10111}",
                     "itemUrl":f"https://item.rakuten.co.jp/realshop/{model.lower()}/"}
                    for i,(cat,model) in enumerate(proof.TARGETS)]
            audit_path=root/"data/audited-products.json"
            audit_path.write_text(json.dumps({"products":audits}))
            (root/"data/equipment.json").write_text(json.dumps({"categories":[]}))
            cat_path=root/"data/products.json"
            cat_path.write_text('{"products":["existing seven"]}')
            before=cat_path.read_bytes()
            before_audit=audit_path.read_bytes()
            visited=[]
            def check(row,gear,**kwargs):
                visited.append((row["category"],row["model"]))
                status=outcomes.get(row["model"],"api_evidence_insufficient")
                return {"category":row["category"],"model":row["model"],
                        "status":status,"apiStatus":"rate_limited" if status=="rate_limited" else "api_confirmed_seller_variant_audit_required",
                        "verifiedForPublication":False}
            with patch.object(proof,"probe_one",side_effect=check):
                report=proof.probe(root=root,now="2026-10-18T05:00:00+00:00")
            self.assertEqual(before,cat_path.read_bytes())
            self.assertEqual(before_audit,audit_path.read_bytes())
            self.assertTrue(all(x.get("verifiedForPublication") is False for x in report["results"]))
            self.assertLessEqual(report["attempted"],6)
            self.assertEqual(report["maxApiCalls"],6)
            return report,visited
    def test_all_three_primary_sellers_succeed_without_backup_calls(self):
        rows,seen=self.scenario({"ST-340":proof.PASS,"2000037404":proof.PASS,"1709435":proof.PASS})
        self.assertEqual(rows["attempted"],3)
        self.assertEqual(set(rows["provenCategories"]),{"burner","fire_pit","hot_sandwich_maker"})
        self.assertEqual([x[1] for x in seen],["ST-340","2000037404","1709435"])
    def test_only_missing_category_gets_single_backup(self):
        rows,seen=self.scenario({"ST-340":proof.PASS,"2000037404":proof.PASS,"UG-3086":proof.PASS})
        self.assertEqual([x[1] for x in seen],["ST-340","2000037404","1709435","UG-3086"])
        self.assertEqual(set(rows["provenCategories"]),{"burner","fire_pit","hot_sandwich_maker"})
    def test_all_primaries_fail_and_backups_limit_to_six(self):
        rows,seen=self.scenario({})
        self.assertEqual([x[1] for x in seen],[m for _,m in proof.TARGETS])
        self.assertEqual(rows["attempted"],6)
        self.assertEqual(rows["provenCategories"],[])
    def test_first_429_stops_other_categories(self):
        rows,seen=self.scenario({"ST-340":"rate_limited"})
        self.assertEqual(seen,[("burner","ST-340")])
        self.assertTrue(rows["stoppedBy429"])
    def test_second_429_stops_backup_and_remaining_sellers(self):
        rows,seen=self.scenario({"2000037404":"rate_limited"})
        self.assertEqual([x[1] for x in seen],["ST-340","2000037404"])
        self.assertTrue(rows["stoppedBy429"])
    def test_non_evidence_cannot_mark_category_proven(self):
        rows,seen=self.scenario({"ST-340":proof.PASS,
                                 "1709435":proof.PASS})
        self.assertEqual(set(rows["provenCategories"]),{"burner","hot_sandwich_maker"})
        self.assertIn(("fire_pit","ST-032RS"),seen)
if __name__=="__main__":unittest.main()
