"""Proof-aware API budget: fresh items are never falsely reverified."""
import copy
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import refresh_verified_camp_offer as renew

NOW = datetime(2026, 11, 11, 8, 0, tzinfo=timezone.utc)
CASES = (("sleeping_bag", "2000034774"), ("tent", "2206745"))

def fixture(ages=(2, 40)):
    audits, products = [], []
    for (category,model),age in zip(CASES,ages):
        verified = (NOW - timedelta(hours=age)).isoformat()
        code = "shopname:"+("1012345" if category=="sleeping_bag" else "1012346")
        url = "https://item.rakuten.co.jp/shopname/"+model+"/"
        audit = {
            "category": category, "model": model, "itemCode": code, "itemUrl": url,
            "name": "Coleman "+("寝袋" if category=="sleeping_bag" else "テント")+" "+model,
            "audited": True, "bodyConfirmed": True, "fixedVariant": True,
            "available": True, "priceAudit": True, "referencePrice": 11000,
            "condition": "new", "quantityPerListing": 1,
            "listingAuditedAt": verified,
        }
        audits.append(audit)
        products.append({**audit, "price": 12000, "verifiedAt": verified,
                         "shipping": "included",
                         "verificationMode": "sales_page_and_official_item_api"})
    equipment={"categories": [{"id": k, "include_any": ["寝袋" if k=="sleeping_bag" else "テント"], "exclude_any": []} for k,_ in CASES],
               "global_exclude_terms":[]}
    catalog={"products": products, "status":"ok", "failedCategories":[],
             "failureReasons":{}, "itemFailures":{}, "updatedAt": (NOW-timedelta(hours=2)).isoformat()}
    return {"products":audits},catalog,equipment

class QuotaAwareCooldown(unittest.TestCase):
    def test_recent_original_proof_skips_only_its_own_api_without_false_renewal(self):
        audits,existing,equipment=fixture(ages=(2,40))
        old=copy.deepcopy(existing)
        calls=[]
        def api(req):
            calls.append("api")
            return {"error":"worker_unavailable","upstream_status":429}
        a,new,report=renew.refresh_verified_offers(
            audits,existing,equipment,targets=CASES,api_fetch=api,
            browser_get=lambda url:self.fail("seller must not be visited"),
            now=NOW,skip_recent=True)
        self.assertEqual(calls,["api"])
        self.assertEqual(report["attempted"],1)
        self.assertEqual(report["skippedRecent"],1)
        self.assertTrue(report["stoppedBySharedFailure"])
        self.assertEqual(report["results"][0]["apiStatus"],"not_attempted_recent_proof")
        self.assertEqual(report["results"][1]["apiStatus"],"rate_limited")
        self.assertEqual(new["products"],old["products"])
        self.assertEqual(a,audits)
        self.assertNotEqual(new["products"][0]["verifiedAt"],NOW.isoformat())

    def test_skip_is_disabled_by_default_for_older_callers(self):
        audits,existing,equipment=fixture(ages=(2,40))
        calls=[]
        def api(req):
            calls.append(req.full_url)
            return {"error":"worker_unavailable","upstream_status":429}
        _,new,report=renew.refresh_verified_offers(
            audits,existing,equipment,targets=CASES,api_fetch=api,now=NOW)
        self.assertEqual(len(calls),1)
        self.assertEqual(report["attempted"],1)
        self.assertEqual(report["skippedRecent"],0)

    def test_cooldown_ends_at_exact_36_hour_boundary(self):
        audits,existing,equipment=fixture(ages=(36,2))
        called=[]
        _,new,report=renew.refresh_verified_offers(
            audits,existing,equipment,targets=CASES,
            api_fetch=lambda req:(called.append(1) or {"found":False}),
            now=NOW,skip_recent=True)
        self.assertEqual(len(called),1)
        self.assertEqual(report["attempted"],1)
        self.assertEqual(report["skippedRecent"],1)
        self.assertTrue(all(p["model"]!="2000034774" for p in new["products"]))
        self.assertIn("sleeping_bag",new["failedCategories"])

    def test_wrong_seller_id_and_listing_proof_mismatch_cannot_be_skipped(self):
        for change in ("itemCode","listingAuditedAt","verificationMode","price"):
            audits,existing,equipment=fixture(ages=(1,1))
            if change=="itemCode": existing["products"][0][change]="other:9999"
            elif change=="listingAuditedAt": existing["products"][0][change]="2026-01-01T00:00:00+00:00"
            elif change=="verificationMode":existing["products"][0][change]="untrusted"
            else:existing["products"][0][change]=0
            calls=[]
            _,new,report=renew.refresh_verified_offers(
                audits,existing,equipment,targets=CASES,now=NOW,skip_recent=True,
                api_fetch=lambda req:(calls.append(1) or {"error":"worker_unavailable","upstream_status":429}))
            with self.subTest(change=change):
                self.assertEqual(len(calls),1)
                self.assertEqual(report["attempted"],1)
                self.assertTrue(report["stoppedBySharedFailure"])

    def test_expired_unrelated_offer_removed_without_any_request(self):
        audits,existing,equipment=fixture(ages=(1,1))
        old=copy.deepcopy(existing["products"][1])
        old.update(category="other",model="OTHER",verifiedAt=(NOW-timedelta(days=8)).isoformat())
        existing["products"].append(old)
        called=[]
        _,new,report=renew.refresh_verified_offers(
            audits,existing,equipment,targets=CASES,now=NOW,skip_recent=True,
            api_fetch=lambda req:called.append(req))
        self.assertEqual(called,[])
        self.assertEqual(report["attempted"],0)
        self.assertEqual(report["skippedRecent"],2)
        self.assertEqual(len(new["products"]),2)
        self.assertEqual(new["updatedAt"],NOW.isoformat())
        self.assertEqual([p["verifiedAt"] for p in new["products"]],
                         [p["verifiedAt"] for p in existing["products"][:2]])

    def test_recent_proof_is_not_stretched_to_seven_days(self):
        audits,existing,equipment=fixture(ages=(168,1))
        called=[]
        _,new,report=renew.refresh_verified_offers(
            audits,existing,equipment,targets=CASES,now=NOW,skip_recent=True,
            api_fetch=lambda req:(called.append(1) or {"error":"worker_unavailable","worker_status":429}))
        self.assertEqual(len(called),1)
        self.assertEqual(report["attempted"],1)
        self.assertFalse(any(p["category"]=="sleeping_bag" for p in new["products"]))
        self.assertIn("sleeping_bag",new["failedCategories"])

if __name__=="__main__": unittest.main()
