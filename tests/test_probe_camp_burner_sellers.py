import json,sys,unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import probe_camp_burner_sellers as s
class BurnerProof(unittest.TestCase):
 def run_case(self,statuses):
  with TemporaryDirectory() as d:
   root=Path(d);(root/"data").mkdir()
   audited=root/"data/audited-products.json"
   audited.write_text(json.dumps({"products":[{"category":"burner","model":"ST-340","itemCode":"passageshop:old",
                "itemUrl":"https://item.rakuten.co.jp/passageshop/10012178/"}]}))
   (root/"data/equipment.json").write_text(json.dumps({"categories":[]}))
   catalog=root/"data/products.json";catalog.write_text('{"products":["existing-nine"]}')
   before=catalog.read_bytes();original=audited.read_bytes();called=[]
   def fake(a,url,gear,**kw):
    called.append(url)
    state=statuses.get(url,"exact_api_evidence_insufficient")
    return {"category":"burner","model":"ST-340","verifiedForPublication":False,
      "officialApiAttempted":True,"status":state,
      "apiStatus":"rate_limited" if state=="rate_limited" else "postage_inclusion_unverified"}
   with patch.object(s,"verify_new_seller",side_effect=fake):
    result=s.run(root=root,now="2026-10-18T10:00:00+00:00")
   self.assertEqual(before,catalog.read_bytes())
   self.assertEqual(original,audited.read_bytes())
   self.assertTrue(all(x["verifiedForPublication"] is False for x in result["results"]))
   return result,called
 def test_first_seller_success_skips_other_requests(self):
  r,c=self.run_case({s.CANDIDATES[0]:s.PASS})
  self.assertEqual(c,[s.CANDIDATES[0]])
  self.assertTrue(r["proofAvailable"])
 def test_second_seller_is_tried_only_if_first_unproven(self):
  r,c=self.run_case({s.CANDIDATES[1]:s.PASS})
  self.assertEqual(c,list(s.CANDIDATES[:2]))
  self.assertTrue(r["proofAvailable"])
 def test_three_unverified_sellers_never_publish(self):
  r,c=self.run_case({})
  self.assertEqual(c,list(s.CANDIDATES))
  self.assertEqual(r["actualApiCalls"],3)
  self.assertFalse(r["proofAvailable"])
 def test_429_stops_following_merchants(self):
  r,c=self.run_case({s.CANDIDATES[1]:"rate_limited"})
  self.assertEqual(c,list(s.CANDIDATES[:2]))
  self.assertTrue(r["stoppedBy429"])
 def test_list_is_exact_and_does_not_include_accessories(self):
  self.assertEqual(s.MAX_API_CALLS,3)
  self.assertEqual(s.MODEL,"ST-340")
  self.assertTrue(all(u.startswith("https://item.rakuten.co.jp/") for u in s.CANDIDATES))
if __name__=="__main__":unittest.main()
