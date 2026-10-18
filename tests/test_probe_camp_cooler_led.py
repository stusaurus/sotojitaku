import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import probe_camp_cooler_led as probe_module

class CoolerLanternEvidence(unittest.TestCase):
    def run_scenario(self,status):
        with TemporaryDirectory() as d:
            root=Path(d);(root/"data").mkdir()
            rows=[{"category":cat,"model":model,
                   "itemCode":f"merchant:{10000+i}",
                   "itemUrl":f"https://item.rakuten.co.jp/merchant/{model.lower()}/"}
                  for i,(cat,model) in enumerate(probe_module.TARGETS)]
            audits=root/"data/audited-products.json"
            audits.write_text(json.dumps({"products":rows}))
            (root/"data/equipment.json").write_text(json.dumps({"categories":[]}))
            catalog=root/"data/products.json"
            catalog.write_text('{"products":[{"model":"remain-trusted"}]}')
            before=catalog.read_bytes(); old=audits.read_bytes()
            observed=[]
            def mock_one(audit,gear,**kwargs):
                observed.append(audit["model"])
                s=status.get(audit["model"],"api_evidence_insufficient")
                return {"category":audit["category"],"model":audit["model"],"status":s,
                        "apiStatus":"rate_limited" if s=="throttled" else "api_confirmed_seller_variant_audit_required",
                        "verifiedForPublication":False}
            with patch.object(probe_module,"probe_one",side_effect=mock_one):
                result=probe_module.probe(root=root,now="2026-10-18T03:00:00+00:00")
            self.assertEqual(before,catalog.read_bytes())
            self.assertEqual(old,audits.read_bytes())
            self.assertTrue(all(r.get("verifiedForPublication") is False for r in result["results"]))
            self.assertLessEqual(result["attempted"],4)
            return observed,result

    def test_both_primary_listings_verified_only_two_api_probes(self):
        seen,r=self.run_scenario({"2238149":"independent_proof_complete_ready_for_review",
                                  "2218364":"independent_proof_complete_ready_for_review"})
        self.assertEqual(seen,["2238149","2218364"])
        self.assertEqual(r["provenCategories"],["cooler","led_lantern"])
        self.assertEqual(r["attempted"],2)
    def test_only_failed_category_gets_backup_merchant_probe(self):
        seen,r=self.run_scenario({"2238149":"exact_item_not_found",
                                  "2218364":"independent_proof_complete_ready_for_review",
                                  "2238147":"independent_proof_complete_ready_for_review"})
        self.assertEqual(seen,["2238149","2218364","2238147"])
        self.assertEqual(r["provenCategories"],["cooler","led_lantern"])
    def test_four_requests_max_if_both_primary_listings_fail(self):
        seen,r=self.run_scenario({})
        self.assertEqual(seen,[x[1] for x in probe_module.TARGETS])
        self.assertEqual(r["attempted"],4)
        self.assertEqual(r["provenCategories"],[])
    def test_429_stops_all_other_requests(self):
        seen,r=self.run_scenario({"2238149":"throttled"})
        self.assertEqual(seen,["2238149"])
        self.assertTrue(r["stoppedBy429"])
    def test_missing_one_category_does_not_fabricate_verification(self):
        seen,r=self.run_scenario({"2218364":"independent_proof_complete_ready_for_review"})
        self.assertEqual(r["provenCategories"],["led_lantern"])
        self.assertEqual(len(seen),3)
    def test_transient_browser_timeout_retries_only_one_page_without_api(self):
        calls=[]
        def reader(url):
            calls.append(url)
            if len(calls)==1:raise TimeoutError("transient navigation")
            return (url, "page verified elsewhere")
        destination="https://item.rakuten.co.jp/seller/example/"
        result=probe_module.original_seller_browser_with_one_retry(
            destination,reader=reader,pause=lambda duration:None)
        self.assertEqual(result,(destination,"page verified elsewhere"))
        self.assertEqual(calls,[destination,destination])

    def test_repeated_navigation_failure_fails_closed_after_two(self):
        calls=[]
        def reader(url):
            calls.append(url)
            raise TimeoutError("temporary navigation failure")
        with self.assertRaises(TimeoutError):
            probe_module.original_seller_browser_with_one_retry(
                "https://item.rakuten.co.jp/seller/a/",reader=reader,pause=lambda _:None)
        self.assertEqual(len(calls),2)

    def test_successful_browser_navigation_is_not_requested_twice(self):
        calls=[]
        def reader(url):
            calls.append(url)
            return url,"valid html"
        original="https://item.rakuten.co.jp/seller/a/"
        self.assertEqual(probe_module.original_seller_browser_with_one_retry(
            original,reader=reader,pause=lambda _:None),(original,"valid html"))
        self.assertEqual(calls,[original])

    def test_original_priorities_and_calls_are_fixed(self):
        self.assertEqual(probe_module.MAX_API_CALLS,4)
        self.assertEqual(probe_module.TARGETS,(
            ("cooler","2238149"),("led_lantern","2218364"),
            ("cooler","2238147"),("led_lantern","2000038854")))
if __name__=="__main__":unittest.main()
