"""Offline regression tests for bounded, exact original CAMP recovery."""
import copy
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import refresh_verified_camp_alternates as recovery

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime.now(timezone.utc)
PRIMARY = {"type": "automatic_original_seller_proof_batch",
           "stoppedBySharedFailure": False, "stopReason": None}

def baseline():
    audits = json.loads((ROOT / "data/audited-products.json").read_text(encoding="utf-8"))
    catalog = json.loads((ROOT / "data/products.json").read_text(encoding="utf-8"))
    equipment = json.loads((ROOT / "data/equipment.json").read_text(encoding="utf-8"))
    # Keep fixture fresh in memory only; the repository files are never changed.
    for p in catalog["products"]:
        p["verifiedAt"] = (NOW - timedelta(days=1)).isoformat()
    return audits, catalog, equipment

def simulated(*, responses=None, seller_failure=None, primary=PRIMARY, targets=recovery.CANDIDATES):
    audits, existing, gear = baseline()
    original = copy.deepcopy(existing)
    rows = {a["itemCode"]: a for a in audits["products"]
            if (a["category"], a["model"]) in recovery.CANDIDATES}
    calls = []
    def api(req):
        code = parse_qs(urlparse(req.full_url).query)["itemCode"][0]
        a = rows[code]
        model = a["model"]
        calls.append(("api", model))
        if responses and model in responses:
            return responses[model]
        url = a["itemUrl"]
        price = max(int(a["referencePrice"]) + 300, 5000)
        return {
            "found": True, "lookup_method": "exact_item_code_only",
            "item_code": code, "item_url": url,
            "affiliate_url": "https://hb.afl.rakuten.co.jp/hgc/x/?pc=" + quote(url, safe=""),
            "name": a["name"], "price": price, "availability": 1,
            "tax_flag": 0, "postage_flag": 0,
            "purchasable_min_price": price, "purchasable_max_price": price,
            "image": "https://thumbnail.image.rakuten.co.jp/a.jpg",
        }
    def seller(url):
        row = next(a for a in rows.values() if a["itemUrl"] == url)
        calls.append(("seller", row["model"]))
        if row["model"] == seller_failure:
            raise TimeoutError("PRIVATE TOKEN https://example.com/?secret=123")
        price = max(int(row["referencePrice"]) + 300, 5000)
        item_id = int(row["itemCode"].split(":",1)[1])
        sale = {"itemId": item_id, "sellType": "NORMAL", "inventoryType": "single",
                "sku": [], "purchaseInfo": {
                    "purchaseBySellType": {"purchaseCondition": "enabled",
                                           "normalPurchase": {"price": {"minPrice": price}}},
                    "variantMappedInventories": [{"quantity": 3}]}}
        return url, row["name"] + ' "itemInfoSku":' + json.dumps(sale)
    new_audits, new, report = recovery.refresh_extra(
        audits, existing, gear, primary_report=primary,
        api_fetch=api, browser_get=seller, now=NOW,
        run_id="simulation", targets=targets)
    return audits, original, new_audits, new, report, calls

class OriginalSellerRecovery(unittest.TestCase):
    def test_exact_api_and_independent_cart_proof_can_add_three_distinct_models(self):
        a, old, na, new, report, calls = simulated()
        self.assertEqual(report["maximumApiCalls"], 3)
        self.assertEqual(report["attempted"], 3)
        self.assertEqual(report["renewed"], 3)
        self.assertEqual(len(calls), 6)
        self.assertEqual(len(new["products"]), len(old["products"]) + 3)
        for category, model in recovery.CANDIDATES:
            matches = [p for p in new["products"] if p["category"] == category and p["model"] == model]
            self.assertEqual(len(matches), 1, model)
            product = matches[0]
            source = next(x for x in na["products"] if x["category"] == category and x["model"] == model)
            self.assertEqual(product["verifiedAt"], NOW.isoformat())
            self.assertEqual(product["listingAuditedAt"], source["listingAuditedAt"])
            self.assertEqual(product["itemCode"], source["itemCode"])
            self.assertEqual(product["itemUrl"], source["itemUrl"])
            self.assertEqual(product["verificationMode"], "sales_page_and_official_item_api")
            self.assertIn("GitHub Actions run simulation", source["listingAudit"])
        self.assertTrue(all(p["price"] == q["price"] and p["verifiedAt"] == q["verifiedAt"]
                            for p,q in zip(old["products"], new["products"][:len(old["products"])])))
        self.assertFalse(report["stoppedBySharedFailure"])

    def test_old_stale_proof_does_not_get_extended_after_browser_failure(self):
        a, old, na, new, report, calls = simulated(seller_failure="2000038854")
        self.assertEqual(report["renewed"], 2)
        self.assertFalse(any(p["model"] == "2000038854" for p in new["products"]))
        self.assertEqual(report["results"][0]["sellerStatus"], "seller_browser_fetch_failed")
        self.assertEqual(report["results"][0]["sellerFetchFailureKind"], "timeout")
        self.assertNotIn("PRIVATE", str(report))
        self.assertEqual(na["products"][0]["listingAuditedAt"], a["products"][0]["listingAuditedAt"])

    def test_definite_no_listing_cannot_be_reactivated(self):
        a, old, na, new, report, calls = simulated(responses={
            "2000038854": {"found": False}})
        self.assertEqual(report["results"][0]["apiStatus"], "exact_item_not_found")
        self.assertFalse(any(p["model"] == "2000038854" for p in new["products"]))
        self.assertNotIn(("seller", "2000038854"), calls)

    def test_shared_worker_429_skips_later_sellers_without_invented_products(self):
        a, old, na, new, report, calls = simulated(responses={
            "2000038854": {"error": "worker_unavailable", "worker_status": 429}})
        self.assertEqual(report["attempted"], 1)
        self.assertTrue(report["stoppedBySharedFailure"])
        self.assertEqual(report["stopReason"], "rate_limited")
        self.assertEqual(calls, [("api", "2000038854")])
        self.assertEqual(new["products"], old["products"])
        self.assertEqual(na, a)

    def test_previous_primary_worker_failure_skips_all_added_requests(self):
        prior = {**PRIMARY, "stoppedBySharedFailure": True, "stopReason": "worker_unavailable"}
        a, old, na, new, report, calls = simulated(primary=prior)
        self.assertEqual(calls, [])
        self.assertTrue(report["skippedBecausePrimaryWorkerFailure"])
        self.assertEqual(report["attempted"], 0)
        self.assertEqual(new, old)
        self.assertEqual(na, a)

    def test_unknown_or_duplicate_models_cannot_enter_allowlist(self):
        a, old, gear = baseline()
        for extra in (
            recovery.CANDIDATES + (("tent","2000039087"),),
            (("burner","ST-310"),),
            (("led_lantern","2218364"),)
        ):
            with self.subTest(targets=extra), self.assertRaisesRegex(ValueError,"unknown_or_duplicate"):
                recovery.refresh_extra(a, old, gear, primary_report=PRIMARY,
                                       now=NOW, targets=extra)

    def test_missing_primary_run_report_never_starts_extra_requests(self):
        a, old, gear = baseline()
        for bad in ({}, None, {"type": "automatic_original_seller_proof_batch"}):
            with self.subTest(report=bad), self.assertRaisesRegex(ValueError,"missing_trusted"):
                recovery.refresh_extra(a, old, gear, primary_report=bad, now=NOW)

if __name__ == "__main__":
    unittest.main()
