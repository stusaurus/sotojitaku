import copy
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import refresh_verified_camp_offer as runner

NOW=datetime(2026,10,18,0,0,0,tzinfo=timezone.utc)
URL="https://item.rakuten.co.jp/naturum-outdoor/2941537/"
MODEL="2000034774"
CODE="naturum-outdoor:10241000"
AFF="https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fnaturum-outdoor%2F2941537%2F"
AUDIT={"category":"sleeping_bag","model":MODEL,"itemCode":CODE,"itemUrl":URL,
       "referencePrice":6380,"audited":True,"bodyConfirmed":True,"fixedVariant":True,
       "available":True,"priceAudit":True,"condition":"new","quantityPerListing":1,
       "identityTerms":["パフォーマーIII/C5",MODEL],"listingAuditedAt":"2026-10-17T14:47:35+00:00",
       "listingAudit":"GitHub Actions run 39042240199"}
EQUIPMENT={"global_exclude_terms":["中古"],"categories":[
    {"id":"sleeping_bag","include_any":["シュラフ","寝袋"],"exclude_any":["ケース"]},
    {"id":"tent","include_any":["テント"],"exclude_any":[]},
]}
LIVE={"found":True,"lookup_method":"exact_item_code_only","item_url":URL,
      "affiliate_url":AFF,"item_code":CODE,"name":"コールマン シュラフ パフォーマーIII/C5 2000034774",
      "availability":1,"tax_flag":0,"postage_flag":0,"price":5800,
      "purchasable_min_price":5800,"purchasable_max_price":5800,
      "image":"https://thumbnail.image.rakuten.co.jp/new.jpg","seller_variant_verified":False}
def page(price=5800,stock=3,item_id=10241000,extra=None):
    info={"itemId":item_id,"sellType":"NORMAL","inventoryType":"single","sku":[],
          "purchaseInfo":{"purchaseBySellType":{"purchaseCondition":"enabled",
                         "normalPurchase":{"price":{"minPrice":price}}},
                         "variantMappedInventories":[{"quantity":stock}]}}
    if extra:info.update(extra)
    return f'販売中のシュラフ 2000034774 "itemInfoSku":'+json.dumps(info,ensure_ascii=False)
def payload(*,verified=None):
    date=verified if verified is not None else NOW-timedelta(days=2)
    previous={**AUDIT,"verifiedAt":date.isoformat(),"price":5490,
              "affiliateUrl":AFF,"image":"https://thumbnail.image.rakuten.co.jp/old.jpg",
              "verificationMode":"sales_page_and_official_item_api","shipping":"included"}
    return {"version":1,"products":[previous],"status":"partial_error",
            "failedCategories":["tent"],"failureReasons":{"tent":"fresh_seller_evidence_missing"},
            "itemFailures":{"tent:1":"not_reverified"},
            "updatedAt":date.isoformat()}

class LiveRenewal(unittest.TestCase):
    def run_one(self,api=None,browser=None,at=NOW,catalog=None):
        calls=[]
        def official(req):
            calls.append("api")
            return copy.deepcopy(LIVE if api is None else api)
        def seller(url):
            calls.append("browser")
            return browser if browser is not None else (URL,page())
        a,c,r=runner.refresh_snapshot({"products":[copy.deepcopy(AUDIT)]},
                copy.deepcopy(catalog or payload()),EQUIPMENT,api_fetch=official,
                browser_get=seller,now=at,run_id="12345")
        return a,c,r,calls

    def test_proven_exact_code_renews_price_and_timestamp_once(self):
        audits,catalog,report,calls=self.run_one()
        self.assertEqual(calls,["api","browser"])
        self.assertEqual(report["result"],"renewed")
        self.assertTrue(report["publishedFreshnessChanged"])
        self.assertEqual(len(catalog["products"]),1)
        p=catalog["products"][0]
        self.assertEqual(p["price"],5800)
        self.assertEqual(p["verifiedAt"],NOW.isoformat())
        self.assertEqual(audits["products"][0]["listingAuditedAt"],NOW.isoformat())
        self.assertIn("GitHub Actions run 12345",audits["products"][0]["listingAudit"])
        self.assertEqual(p["affiliateUrl"],AFF)
        self.assertEqual(p["reviewCount"],None)
        self.assertEqual(catalog["failedCategories"],["tent"])
        self.assertNotIn("sleeping_bag",catalog["failedCategories"])

    def test_upstream_429_retains_valid_last_proof_without_timestamp_change(self):
        _,catalog,report,calls=self.run_one(api={"error":"worker_unavailable","upstream_status":429})
        self.assertEqual(calls,["api"])
        self.assertEqual(report["apiStatus"],"rate_limited")
        self.assertEqual(report["result"],"previous_still_fresh")
        self.assertFalse(report["publishedFreshnessChanged"])
        self.assertEqual(catalog["products"][0]["price"],5490)
        self.assertEqual(catalog["products"][0]["verifiedAt"],(NOW-timedelta(days=2)).isoformat())

    def test_429_after_seven_days_retires_offer_rather_than_extend_it(self):
        prior=payload(verified=NOW-timedelta(days=8))
        _,catalog,report,calls=self.run_one(api={"error":"worker_unavailable","upstream_status":429},catalog=prior)
        self.assertEqual(calls,["api"])
        self.assertEqual(report["result"],"retired")
        self.assertEqual(catalog["products"],[])
        self.assertIn("sleeping_bag",catalog["failedCategories"])

    def test_invalid_current_stock_retires_immediately_even_before_expiry(self):
        _,catalog,report,calls=self.run_one(api={**LIVE,"availability":0})
        self.assertEqual(calls,["api"])
        self.assertEqual(report["result"],"retired")
        self.assertEqual(catalog["products"],[])

    def test_blocked_seller_page_does_not_falsely_renew_fresh_price(self):
        _,catalog,report,calls=self.run_one(browser=(URL,"Access denied"))
        self.assertEqual(calls,["api","browser"])
        self.assertEqual(report["result"],"previous_still_fresh")
        self.assertEqual(catalog["products"][0]["verifiedAt"],(NOW-timedelta(days=2)).isoformat())

    def test_wrong_seller_id_and_redirect_retire_old_offer(self):
        for bad in [(URL,page(item_id=11111111)),("https://item.rakuten.co.jp/other-shop/2941537/",page())]:
            with self.subTest(bad=bad[0]):
                _,catalog,report,calls=self.run_one(browser=bad)
                self.assertEqual(report["result"],"retired")
                self.assertEqual(catalog["products"],[])
                self.assertFalse(report["publishedFreshnessChanged"])
                self.assertEqual(calls,["api","browser"])

    def test_seller_price_changed_within_live_api_window_is_not_reused(self):
        _,catalog,report,calls=self.run_one(browser=(URL,page(price=7000)))
        self.assertEqual(report["result"],"retired")
        self.assertEqual(catalog["products"],[])
        self.assertEqual(calls,["api","browser"])

    def test_blocked_browser_network_preserves_only_unexpired_last_proof(self):
        _,cat,report,calls=self.run_one(browser=("unvisited","Access denied"))
        self.assertEqual(report["sellerStatus"],"seller_page_redirect_or_identity_mismatch")
        self.assertEqual(cat["products"],[])

    def test_last_known_valid_unrelated_product_keeps_own_proof_time(self):
        prev=payload()
        other={**prev["products"][0],"category":"tent","model":"TENT1"}
        prev["products"].append(other)
        _,new,_,_=self.run_one(catalog=prev)
        self.assertEqual(len(new["products"]),2)
        self.assertEqual(new["products"][0]["model"],"TENT1")
        self.assertEqual(new["products"][0]["verifiedAt"],other["verifiedAt"])

    def test_no_unrelated_file_writes_on_rate_limit(self):
        with TemporaryDirectory() as d:
            root=Path(d);(root/"data").mkdir()
            audit={"products":[AUDIT]};snapshot=payload()
            (root/"data/audited-products.json").write_text(json.dumps(audit))
            (root/"data/products.json").write_text(json.dumps(snapshot))
            (root/"data/equipment.json").write_text(json.dumps(EQUIPMENT))
            original=(root/"data/products.json").read_bytes()
            original_audit=(root/"data/audited-products.json").read_bytes()
            # The pure refresh decision remains read-only; no stale
            # timestamp is generated before a valid seller/API proof.
            a,c,report,calls=self.run_one(api={"error":"worker_unavailable","upstream_status":429})
            self.assertEqual(c["products"][0]["verifiedAt"],snapshot["products"][0]["verifiedAt"])
            self.assertEqual(a,audit)
            self.assertEqual((root/"data/products.json").read_bytes(),original)
            self.assertEqual((root/"data/audited-products.json").read_bytes(),original_audit)

if __name__=="__main__":unittest.main()
