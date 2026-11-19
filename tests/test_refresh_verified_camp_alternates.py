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
    # Reconstruct the pre-recovery *in-memory* baseline even after the real
    # three sellers are successfully published. Never delete live offers or
    # mistake a previously certified SKU for an invented new listing.
    catalog["products"] = [p for p in catalog["products"]
                           if (p.get("category"), p.get("model")) not in recovery.ALLOWED_TARGETS]
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

    def test_fresh_live_extra_offer_is_not_falsely_retired_during_browser_outage(self):
        audits, existing, gear = baseline()
        current_audit = next(a for a in audits["products"]
                             if (a["category"], a["model"]) == recovery.CANDIDATES[0])
        old_stamp = (NOW - timedelta(hours=2)).isoformat()
        # A real previously certified extra offer may exist at the time a
        # temporary browser outage happens; unlike an expired listing, that
        # 7-day-valid offer must keep its original price and proof timestamp.
        fresh = {**copy.deepcopy(current_audit),
                 "verifiedAt": old_stamp, "listingAuditedAt": old_stamp,
                 "price": 5278, "shipping": "included",
                 "verificationMode": "sales_page_and_official_item_api"}
        existing["products"].append(fresh)
        audits = copy.deepcopy(audits)
        for record in audits["products"]:
            if (record["category"],record["model"]) == recovery.CANDIDATES[0]:
                record["listingAuditedAt"] = old_stamp
        def api(req):
            from urllib.parse import parse_qs, urlparse, quote
            code = parse_qs(urlparse(req.full_url).query)["itemCode"][0]
            return {"found":True, "lookup_method":"exact_item_code_only",
                    "item_code":code, "item_url":fresh["itemUrl"],
                    "affiliate_url":"https://hb.afl.rakuten.co.jp/hgc/x/?pc="+quote(fresh["itemUrl"],safe=""),
                    "name":current_audit["name"], "price":5278,
                    "availability":1,"tax_flag":0,"postage_flag":0,
                    "purchasable_min_price":5278,"purchasable_max_price":5278,
                    "image":"https://thumbnail.image.rakuten.co.jp/a.jpg"}
        def fail(url):
            raise TimeoutError("seller browser was temporarily unavailable")
        _, new, report = recovery.refresh_extra(
            audits,existing,gear,primary_report=PRIMARY,
            api_fetch=api,browser_get=fail,now=NOW,
            targets=(recovery.CANDIDATES[0],))
        kept = next(p for p in new["products"] if p["model"] == fresh["model"])
        self.assertEqual(report["renewed"],0)
        self.assertEqual(report["results"][0]["result"],"previous_still_fresh")
        self.assertEqual(kept["verifiedAt"],old_stamp)
        self.assertEqual(kept["price"],5278)

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


class GapRecoveryPriority(unittest.TestCase):
    def test_recovery_pool_is_previously_audited_fixed_seller_only(self):
        audits = json.loads((ROOT / "data/audited-products.json").read_text(encoding="utf-8"))
        by_key = {(p["category"], p["model"]): p for p in audits["products"]}
        self.assertEqual(len(set(recovery.ALLOWED_TARGETS)), len(recovery.ALLOWED_TARGETS))
        self.assertEqual(len(recovery.RECOVERY_GAPS), 6)
        self.assertEqual(recovery.MAX_EXTRA_API_CALLS, 3)
        for target in recovery.RECOVERY_GAPS:
            with self.subTest(target=target):
                p = by_key[target]
                self.assertTrue(all(p.get(k) is True for k in recovery.REQUIRED_ORIGINAL_AUDIT))
                self.assertEqual(p.get("condition"), "new")
                self.assertEqual(p.get("quantityPerListing"), 1)
                self.assertTrue(p.get("itemCode"))
                self.assertTrue(p.get("itemUrl"))
                self.assertTrue(p.get("evidence", {}).get("listing"))

    def test_aging_verified_offer_is_renewed_before_new_gap_probe(self):
        aging = recovery.PRIORITY_GAPS[0]
        catalog = {"products": [{"category": aging[0], "model": aging[1],
                                 "verifiedAt": (NOW-timedelta(days=6)).isoformat()}]}
        before = copy.deepcopy(catalog)
        targets = recovery.prioritize_recovery_targets(catalog, NOW)
        self.assertEqual(targets[0], aging)
        self.assertEqual(set(targets), set(recovery.ALLOWED_TARGETS))
        self.assertEqual(len(targets), len(set(targets)))
        self.assertEqual(catalog, before)

    def test_missing_gap_probes_rotate_without_expanding_api_budget(self):
        catalog = {"products": []}
        before = copy.deepcopy(catalog)
        first = recovery.prioritize_recovery_targets(catalog, NOW)
        next_day = recovery.prioritize_recovery_targets(catalog, NOW+timedelta(days=1))
        n = len(recovery.RECOVERY_GAPS)
        self.assertEqual(set(first[:n]), set(recovery.RECOVERY_GAPS))
        self.assertEqual(set(next_day[:n]), set(recovery.RECOVERY_GAPS))
        self.assertNotEqual(first[0], next_day[0])
        self.assertEqual(set(first), set(recovery.ALLOWED_TARGETS))
        self.assertEqual(catalog, before)

    def test_no_live_burner_gets_one_reserved_attempt_when_aging_offers_crowd_quota(self):
        # Four independently audited sellers need renewal, but only three
        # additional API calls exist. At least one call must reach the
        # *missing category* while the two oldest remain first.
        now = datetime(2026, 11, 20, 0, 0, tzinfo=timezone.utc)
        aged = [recovery.CANDIDATES[0], recovery.PRIORITY_GAPS[0],
                recovery.PRIORITY_GAPS[1], recovery.PRIORITY_GAPS[2]]
        catalog = {"products": [
            *[{"category": c, "model": m,
               "verifiedAt": (now-timedelta(days=6)).isoformat()}
              for c,m in aged],
            {"category": "sleeping_bag", "model": "already-live",
             "verifiedAt": now.isoformat()},
        ]}
        before = copy.deepcopy(catalog)
        order = recovery.prioritize_recovery_targets(catalog, now)
        self.assertEqual(order[:2], tuple(aged[:2]))
        self.assertEqual(order[2][0], "burner")
        self.assertIn(order[2], (("burner", "ST-350"), ("burner", "ST-340")))
        self.assertEqual(order[3], aged[2])
        self.assertEqual(len(set(order)), len(recovery.ALLOWED_TARGETS))
        self.assertEqual(set(order), set(recovery.ALLOWED_TARGETS))
        self.assertEqual(catalog, before)
        next_day = recovery.prioritize_recovery_targets(
            catalog, now+timedelta(days=1))
        self.assertEqual(next_day[2][0], "burner")
        self.assertNotEqual(order[2], next_day[2],
                            "Rotate two audited fixed-seller burner codes")

    def test_existing_burner_category_does_not_take_probe_slot_from_renewals(self):
        now = datetime(2026, 11, 20, 0, 0, tzinfo=timezone.utc)
        aged = [recovery.CANDIDATES[0], recovery.PRIORITY_GAPS[0],
                recovery.PRIORITY_GAPS[1], recovery.PRIORITY_GAPS[2]]
        catalog = {"products": [
            *[{"category": c, "model": m,
               "verifiedAt": (now-timedelta(days=6)).isoformat()}
              for c,m in aged],
            {"category": "sleeping_bag", "model": "live",
             "verifiedAt": now.isoformat()},
            {"category": "burner", "model": "ST-350",
             "verifiedAt": now.isoformat()},
        ]}
        order = recovery.prioritize_recovery_targets(catalog, now)
        self.assertEqual(order[:3], tuple(aged[:3]))
        self.assertEqual(recovery.MAX_EXTRA_API_CALLS, 3)
        self.assertEqual(len(order), len(set(order)))

    def test_no_unapproved_or_stale_offer_becomes_published_during_planning(self):
        order = recovery.prioritize_recovery_targets({"products": []}, NOW)
        self.assertNotIn(("burner", "ST-310"), order)
        self.assertNotIn(("led_lantern", "2218365"), order)
        self.assertEqual(recovery.MAX_EXTRA_API_CALLS, 3)
        a, old, gear = baseline()
        # Planning alone cannot bypass the original official API and seller
        # proof, nor mutate any existing catalog.
        snapshot = copy.deepcopy(old)
        recovery.prioritize_recovery_targets(old, NOW)
        self.assertEqual(old, snapshot)


if __name__ == "__main__":
    unittest.main()
