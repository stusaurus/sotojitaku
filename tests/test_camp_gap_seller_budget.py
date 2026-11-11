"""Strict, quota-bounded next category gap verification (offline only).

No successful result below claims a SKU is actually on sale. Real product
publication requires the normal fresh official Item API and original seller
HTML in GitHub Actions.
"""
import copy
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import refresh_verified_camp_alternates as renewal

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)
ORIGINAL = renewal.CANDIDATES
GAPS = renewal.PRIORITY_GAPS

def fixtures(age_hours=2):
    audits = json.loads((ROOT / "data/audited-products.json").read_text(encoding="utf-8"))
    equipment = json.loads((ROOT / "data/equipment.json").read_text(encoding="utf-8"))
    # Never read current catalog into the fixture. The test must keep working
    # even AFTER the three new gap products are verified in live main.
    stamp = (NOW - timedelta(hours=age_hours)).isoformat()
    original = []
    for category,model in ORIGINAL:
        audit = next(a for a in audits["products"]
                     if a["category"] == category and a["model"] == model)
        audit["listingAuditedAt"] = stamp
        original.append({
            **copy.deepcopy(audit),
            "verifiedAt": stamp,
            "price": max(5000, int(audit["referencePrice"])),
            "shipping": "included",
            "verificationMode": "sales_page_and_official_item_api",
            "image": "https://thumbnail.image.rakuten.co.jp/test.jpg",
            "affiliateUrl": "https://hb.afl.rakuten.co.jp/hgc/x/?pc="+quote(audit["itemUrl"],safe=""),
        })
    missing = sorted({c["id"] for c in equipment["categories"]}
                     - {p["category"] for p in original})
    catalog = {
        "products": original,
        "updatedAt": stamp,
        "status": "partial_error",
        "failedCategories": missing,
        "failureReasons": {c:"fresh_seller_evidence_missing" for c in missing},
        "itemFailures": {},
    }
    return audits,catalog,equipment

def simulate(age_hours=2, responses=None, seller_block=None, targets=renewal.ALLOWED_TARGETS):
    audits,catalog,gear = fixtures(age_hours=age_hours)
    original=copy.deepcopy(catalog)
    original_audits=copy.deepcopy(audits)
    mapped={a["itemCode"]: a for a in audits["products"]
            if (a["category"],a["model"]) in renewal.ALLOWED_TARGETS}
    calls=[]
    def api(req):
        code=parse_qs(urlparse(req.full_url).query)["itemCode"][0]
        a=mapped[code]
        model=a["model"]
        calls.append(("api",model))
        if responses and model in responses:
            return responses[model]
        url=a["itemUrl"]
        price=max(5000,int(a["referencePrice"])+200)
        return {
            "found":True, "lookup_method":"exact_item_code_only",
            "item_code":code, "item_url":url,
            "affiliate_url":"https://hb.afl.rakuten.co.jp/hgc/x/?pc="+quote(url,safe=""),
            "name":a["name"], "price":price, "availability":1,
            "tax_flag":0, "postage_flag":0,
            "purchasable_min_price":price, "purchasable_max_price":price,
            "image":"https://thumbnail.image.rakuten.co.jp/test.jpg",
        }
    def browser(url):
        a=next(a for a in mapped.values() if a["itemUrl"]==url)
        calls.append(("browser",a["model"]))
        if a["model"]==seller_block:
            raise TimeoutError("PRIVATE URL https://example.org/?token=SECRET")
        price=max(5000,int(a["referencePrice"])+200)
        item_id=int(a["itemCode"].split(":",1)[1])
        cart={"itemId":item_id,"sellType":"NORMAL","inventoryType":"single",
              "sku":[],"purchaseInfo":{
                  "purchaseBySellType":{
                      "purchaseCondition":"enabled","normalPurchase":{"price":{"minPrice":price}}},
                  "variantMappedInventories":[{"quantity":3}]}}
        return url, a["name"]+' "itemInfoSku":'+json.dumps(cart)
    newaudits,new,report=renewal.refresh_extra(
        audits,catalog,gear,primary_report={
            "type":"automatic_original_seller_proof_batch",
            "stoppedBySharedFailure":False,
            "stopReason":None,
        },api_fetch=api,browser_get=browser,now=NOW,
        run_id="synthetic-proof-not-live",targets=targets,skip_recent=True)
    return original_audits,original,newaudits,new,report,calls

class GapBudgetProof(unittest.TestCase):
    def test_three_recent_exact_existing_sellers_skip_and_three_gaps_are_probed(self):
        audits,original,newaudits,new,report,calls=simulate()
        self.assertEqual(report["maximumApiCalls"],3)
        self.assertEqual(report["skippedRecent"],3)
        self.assertEqual(report["attempted"],3)
        self.assertEqual(report["renewed"],3)
        self.assertFalse(report["stoppedBySharedFailure"])
        self.assertEqual([x for x in calls if x[0]=="api"],
                         [("api",model) for _,model in GAPS])
        self.assertEqual(len(calls),6)
        self.assertEqual(len(new["products"]),6)
        for category,model in ORIGINAL:
            before=next(p for p in original["products"] if p["model"]==model)
            after=next(p for p in new["products"] if p["model"]==model)
            self.assertEqual(after["verifiedAt"],before["verifiedAt"])
            self.assertEqual(after["price"],before["price"])
        for category,model in GAPS:
            p=next(p for p in new["products"] if p["model"]==model)
            audit=next(a for a in newaudits["products"] if a["model"]==model)
            self.assertEqual(p["verifiedAt"],NOW.isoformat())
            self.assertEqual(p["listingAuditedAt"],audit["listingAuditedAt"])
            self.assertEqual(p["itemCode"],audit["itemCode"])
            self.assertEqual(p["itemUrl"],audit["itemUrl"])
            self.assertEqual(p["verificationMode"],"sales_page_and_official_item_api")
        self.assertEqual(len(set(p["family"] for p in new["products"])),6)

    def test_when_first_three_proofs_age_out_extra_requests_stop_at_three(self):
        audits,original,newaudits,new,report,calls=simulate(age_hours=40)
        self.assertEqual(report["attempted"],3)
        self.assertEqual(report["skippedRecent"],0)
        self.assertEqual(report["deferredForBudget"],3)
        self.assertEqual([x for x in calls if x[0]=="api"],
                         [("api",model) for _,model in ORIGINAL])
        self.assertEqual(len(new["products"]),3)

    def test_one_429_stops_entire_batch_and_keeps_existing_proofs_unchanged(self):
        blocked_model=GAPS[0][1]
        audits,original,newaudits,new,report,calls=simulate(
            responses={blocked_model:{"error":"worker_unavailable","upstream_status":429}})
        self.assertTrue(report["stoppedBySharedFailure"])
        self.assertEqual(report["stopReason"],"rate_limited")
        self.assertEqual(report["attempted"],1)
        self.assertEqual(report["skippedRecent"],3)
        self.assertEqual(calls,[("api",blocked_model)])
        self.assertEqual(new["products"],original["products"])
        self.assertEqual(newaudits,audits)
        self.assertFalse(any(x["model"]==GAPS[1][1] for x in new["products"]))

    def test_not_found_or_blocked_seller_never_enters_catalog(self):
        first=GAPS[0][1]; second=GAPS[1][1]
        audits,orig,newaudits,new,report,calls=simulate(
            responses={first:{"found":False}},seller_block=second)
        self.assertEqual(report["attempted"],3)
        self.assertEqual(report["renewed"],1)
        self.assertEqual(report["results"][3]["apiStatus"],"exact_item_not_found")
        self.assertEqual(report["results"][4]["sellerStatus"],"seller_browser_fetch_failed")
        self.assertFalse(any(p["model"] in (first,second) for p in new["products"]))
        self.assertNotIn(("browser",first),calls)
        self.assertNotIn("PRIVATE",str(report))
        self.assertNotIn("SECRET",str(report))

    def test_mismatched_price_or_seller_cannot_be_published(self):
        audits,catalog,gear=fixtures()
        bad=GAPS[0]
        import refresh_verified_camp_offer as single
        audit=next(a for a in audits["products"] if a["model"]==bad[1])
        price=int(audit["referencePrice"])+200
        api={"found":True,"lookup_method":"exact_item_code_only",
             "item_code":audit["itemCode"],"item_url":audit["itemUrl"],
             "affiliate_url":"https://hb.afl.rakuten.co.jp/hgc/x/?pc="+quote(audit["itemUrl"],safe=""),
             "name":audit["name"],"price":price,
             "purchasable_min_price":price,"purchasable_max_price":price,
             "availability":1,"tax_flag":0,"postage_flag":0,
             "image":"https://thumbnail.image.rakuten.co.jp/test.jpg"}
        def fake_browse(url):
            return url, audit["name"]+' "itemInfoSku":'+json.dumps({
                "itemId":int(audit["itemCode"].split(":",1)[1]),
                "sellType":"NORMAL","inventoryType":"single","sku":[],
                "purchaseInfo":{"purchaseBySellType":{"purchaseCondition":"enabled",
                    "normalPurchase":{"price":{"minPrice":price+100}}},
                    "variantMappedInventories":[{"quantity":2}]}})
        _,new,report=single.refresh_snapshot(
            audits,catalog,gear,
            target_category=bad[0],target_model=bad[1],
            api_fetch=lambda req:api,browser_get=fake_browse,now=NOW)
        self.assertFalse(any(p["model"]==bad[1] for p in new["products"]))
        self.assertFalse(report["publishedFreshnessChanged"])

    def test_future_or_expired_original_proof_must_never_be_skipped(self):
        for hours in (-1,8*24):
            with self.subTest(hours=hours):
                a,b,na,new,report,calls=simulate(age_hours=hours)
                self.assertEqual(report["attempted"],3)
                self.assertEqual(report["skippedRecent"],0)
                self.assertEqual(report["deferredForBudget"],3)

if __name__=="__main__":
    unittest.main()
