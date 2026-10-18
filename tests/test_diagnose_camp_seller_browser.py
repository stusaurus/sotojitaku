import json,sys,unittest
from pathlib import Path
from tempfile import TemporaryDirectory
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import diagnose_camp_seller_browser as d
class TestBrowserDiagnostics(unittest.TestCase):
 def test_exception_does_not_log_private_urls_or_exception_messages(self):
  def reject(url,model): raise RuntimeError("SECRET https://foo/?token=password")
  res=d.safe_diagnosis("cooler","2238149","https://item.rakuten.co.jp/foo/a/",browser=reject)
  self.assertEqual(res["exceptionClass"],"RuntimeError")
  self.assertNotIn("SECRET",json.dumps(res))
  self.assertNotIn("token",json.dumps(res))
 def test_only_redacted_boolean_evidence_and_size_bands(self):
  res=d.safe_diagnosis("cooler","2238149","https://item.rakuten.co.jp/foo/a/",
      browser=lambda url,model:{"status":"navigation_exception","exceptionClass":"TimeoutError",
       "sellerEvidencePresent":False,"sameOriginalUrl":True,
       "sellerModelPresent":True,"httpStatus":None,"htmlLengthBand":"normal",
       "html":"PRIVATE COOKIE DATA","redirectUrl":"https://blocked/?token=private"})
  self.assertFalse(res["sellerEvidencePresent"])
  self.assertEqual(res["exceptionClass"],"TimeoutError")
  self.assertNotIn("COOKIE",json.dumps(res))
  self.assertNotIn("private",json.dumps(res))
 def test_known_good_page_and_two_exact_unverified_sandwich_origins(self):
  self.assertEqual(d.TARGETS,(
    ("sleeping_bag","2000034774"),
    ("hot_sandwich_maker","1709435"),
    ("hot_sandwich_maker","UG-3086")))
 def test_probes_only_three_fixed_historic_items_without_catalog_change(self):
  with TemporaryDirectory() as temp:
   root=Path(temp);(root/"data").mkdir()
   audits=[{"category":cat,"model":model,
            "itemUrl":f"https://item.rakuten.co.jp/shop/{model}/"} for cat,model in d.TARGETS]
   (root/"data/audited-products.json").write_text(json.dumps({"products":audits}))
   live=root/"data/products.json";live.write_text('{"products":[1,2,3,4,5]}')
   urls=[]
   res=d.run(root=root,browser=lambda url,model:(urls.append(url) or {"status":"normal_navigation",
       "sameOriginalUrl":True,"sellerEvidencePresent":True}),now="2026-10-18T00:00:00+00:00")
   self.assertEqual(len(urls),3)
   self.assertEqual(res["maxSellerPages"],3)
   self.assertEqual(live.read_text(),'{"products":[1,2,3,4,5]}')
if __name__=="__main__":unittest.main()
