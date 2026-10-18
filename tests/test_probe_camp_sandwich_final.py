import json,sys,unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import probe_camp_sandwich_final as s
class SandwichExactRecheck(unittest.TestCase):
 def check(self,outcomes):
  with TemporaryDirectory() as d:
   root=Path(d);(root/"data").mkdir()
   row=[{"category":c,"model":m,"itemCode":f"shop:{i+13333}",
         "itemUrl":f"https://item.rakuten.co.jp/shop/{m}/"} for i,(c,m) in enumerate(s.TARGETS)]
   (root/"data/audited-products.json").write_text(json.dumps({"products":row}))
   (root/"data/equipment.json").write_text(json.dumps({"categories":[]}))
   file=root/"data/products.json";file.write_text('{"products":[1,2,3,4,5,6,7,8]}')
   orig=file.read_bytes();visited=[]
   def check(a,g,**kwargs):
    visited.append(a["model"])
    state=outcomes.get(a["model"],"seller_page_unavailable")
    return {"category":a["category"],"model":a["model"],
            "status":state,"apiStatus":"rate_limited" if state=="rate_limited" else "api_confirmed_seller_variant_audit_required",
            "verifiedForPublication":False}
   with patch.object(s,"probe_one",side_effect=check):
    outcome=s.probe(root=root,now="2026-10-18T07:00:00+00:00")
   self.assertEqual(file.read_bytes(),orig)
   self.assertTrue(all(x["verifiedForPublication"] is False for x in outcome["results"]))
   return outcome,visited
 def test_first_original_seller_passes_and_second_is_not_requested(self):
  r,called=self.check({"1709435":s.SUCCESS})
  self.assertTrue(r["recovered"]);self.assertEqual(called,["1709435"])
 def test_second_original_seller_is_tried_only_after_first_fails(self):
  r,called=self.check({"UG-3086":s.SUCCESS})
  self.assertTrue(r["recovered"]);self.assertEqual(called,["1709435","UG-3086"])
 def test_429_stops_without_further_calls(self):
  r,called=self.check({"1709435":"rate_limited"})
  self.assertTrue(r["stoppedBy429"]);self.assertEqual(called,["1709435"])
 def test_neither_seller_proof_is_not_misrepresented_as_recovery(self):
  r,called=self.check({})
  self.assertFalse(r["recovered"]);self.assertEqual(r["attempted"],2)
 def test_exact_model_list_is_small(self):
  self.assertEqual(s.TARGETS,(("hot_sandwich_maker","1709435"),("hot_sandwich_maker","UG-3086")))
  self.assertEqual(s.MAX_API_CALLS,2)
if __name__=="__main__":unittest.main()
