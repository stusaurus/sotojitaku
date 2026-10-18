import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import probe_camp_mat_table as stage

class MatTableProof(unittest.TestCase):
 def run_stage(self,statuses,stop_after=None):
  with TemporaryDirectory() as d:
   root=Path(d);(root/"data").mkdir()
   products=[{"category":cat,"model":model,"itemCode":f"seller:{i+12345}",
              "itemUrl":f"https://item.rakuten.co.jp/seller/{model.lower()}/"}
              for i,(cat,model) in enumerate(stage.TARGETS)]
   (root/"data/audited-products.json").write_text(json.dumps({"products":products}))
   (root/"data/equipment.json").write_text(json.dumps({"categories":[]}))
   public=root/"data/products.json";public.write_text('{"products":[{"model":"validated-old"}]}')
   original=public.read_bytes()
   original_audit=(root/"data/audited-products.json").read_bytes()
   calls=[]
   def fake_one(audit, equipment, **kwargs):
    calls.append(audit["model"])
    reason=statuses.get(audit["model"],"api_evidence_insufficient")
    return {"category":audit["category"],"model":audit["model"],
            "status":reason,
            "apiStatus":"rate_limited" if reason=="throttled" else "api_confirmed_seller_variant_audit_required",
            "verifiedForPublication":False}
   with patch.object(stage,"probe_one",side_effect=fake_one):
    report=stage.probe(root=root,now="2026-10-18T01:00:00+00:00")
   self.assertEqual(original,public.read_bytes())
   self.assertEqual(original_audit,(root/"data/audited-products.json").read_bytes())
   self.assertEqual(report["maximumApiRequests"],3)
   self.assertTrue(all(row.get("verifiedForPublication") is False for row in report["results"]))
   return report,calls
 def test_mat_and_table_success_skips_second_mat(self):
  report,calls=self.run_stage({"2000036153":"independent_proof_complete_ready_for_review",
                              "2205816":"independent_proof_complete_ready_for_review"})
  self.assertEqual(calls,["2000036153","2205816"])
  self.assertEqual(report["attempted"],2)
  self.assertEqual(report["provenCategories"],["mat","table"])
 def test_mat_failure_allows_only_one_alternative_same_category(self):
  report,calls=self.run_stage({"2205816":"independent_proof_complete_ready_for_review",
                              "2000038137":"independent_proof_complete_ready_for_review"})
  self.assertEqual(calls,["2000036153","2205816","2000038137"])
  self.assertEqual(report["attempted"],3)
  self.assertEqual(report["provenCategories"],["mat","table"])
 def test_429_stops_other_categories_immediately(self):
  report,calls=self.run_stage({"2000036153":"throttled"})
  self.assertEqual(calls,["2000036153"])
  self.assertTrue(report["stoppedBy429"])
  self.assertEqual(report["provenCategories"],[])
 def test_both_mats_fail_never_declare_mat_recovered(self):
  report,calls=self.run_stage({"2205816":"independent_proof_complete_ready_for_review"})
  self.assertEqual(len(calls),3)
  self.assertEqual(report["provenCategories"],["table"])
 def test_target_selection_is_exact_audited_models_not_all_51(self):
  self.assertEqual(stage.TARGETS,(("mat","2000036153"),("table","2205816"),("mat","2000038137")))
  self.assertEqual(stage.MAX_API_REQUESTS,3)
if __name__=="__main__":unittest.main()
