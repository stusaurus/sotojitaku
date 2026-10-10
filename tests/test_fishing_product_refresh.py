# Regression coverage for strict product-model matching across Rakuten shops.
import importlib.util
import pathlib
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location(
    "fishing_refresh",
    ROOT/"fishing"/"scripts"/"refresh_products.py",
)
refresh=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(refresh)


class FishingProductRefreshTests(unittest.TestCase):
    def test_suspended_listing_cannot_be_reintroduced_by_stale_api(self):
        from datetime import datetime, timezone
        seed=self.seed(); seed["suspended"]=True; seed["suspendedReason"]="confirmed HTTP404"
        with mock.patch.object(refresh,"worker_exact_candidate") as lookup:
            product,reason=refresh.audit_one(seed,datetime.now(timezone.utc),"2026-10-10")
        self.assertIsNone(product); self.assertIn("manual_suspension",reason); lookup.assert_not_called()

    def seed(self):
        return {
            "productId":"test-product",
            "name":"DAIWA TEST 3000",
            "brand":"DAIWA",
            "itemUrl":"https://item.rakuten.co.jp/shop-a/test-3000/",
            "identityGroups":[["DAIWA","ダイワ"],["TEST"],["3000"]],
            "forbiddenTerms":["2000"],
            "searchQueries":["DAIWA TEST 3000"],
        }

    def candidate(self,url="https://item.rakuten.co.jp/shop-b/test-3000/",name="DAIWA TEST 3000"):
        return {
            "name":name,
            "price":3980,
            "affiliateUrl":"https://hb.afl.rakuten.co.jp/hgc/example/?pc="+
                __import__("urllib.parse").parse.quote(url,safe=""),
            "itemUrl":url,
            "image":"https://example.com/a.jpg",
            "itemCode":"shop-b:123",
            "source":"worker_search_identity",
        }

    def test_identity_level_prefers_exact_seed_listing(self):
        seed=self.seed()
        exact=self.candidate(url=seed["itemUrl"])
        other=self.candidate()
        self.assertEqual(refresh.candidate_identity_level(exact,seed),2)
        self.assertEqual(refresh.candidate_identity_level(other,seed),1)

    def test_identity_level_accepts_same_model_from_other_shop(self):
        self.assertEqual(refresh.candidate_identity_level(self.candidate(),self.seed()),1)

    def test_identity_level_rejects_wrong_model(self):
        wrong=self.candidate(name="DAIWA TEST 2000")
        self.assertEqual(refresh.candidate_identity_level(wrong,self.seed()),0)

    def test_sales_audit_allows_identity_feed_fallback_for_other_shop(self):
        seed=self.seed()
        candidate=self.candidate()
        with mock.patch.object(refresh,"page_info_url",return_value=None):
            mode,price=refresh.sales_audit(seed,candidate)
        self.assertEqual(mode,"identity_feed_fallback")
        self.assertEqual(price,3980)

    def test_sales_audit_rejects_wrong_identity(self):
        seed=self.seed()
        wrong=self.candidate(name="DAIWA TEST 2000")
        with self.assertRaisesRegex(ValueError,"wrong_product_identity"):
            refresh.sales_audit(seed,wrong)

    def test_worker_search_can_choose_matching_identity_from_another_shop(self):
        seed=self.seed()
        payload={
            "products":[
                {
                    "name":"DAIWA TEST 2000",
                    "price":2500,
                    "url":"https://item.rakuten.co.jp/shop-c/test-2000/",
                    "image":"https://example.com/wrong.jpg",
                },
                {
                    "name":"DAIWA TEST 3000",
                    "price":3800,
                    "url":"https://hb.afl.rakuten.co.jp/hgc/example/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop-b%2Ftest-3000%2F",
                    "image":"https://example.com/right.jpg",
                },
            ]
        }
        with mock.patch.object(refresh,"fetch_json_quick",return_value=payload):
            candidate=refresh.worker_search_candidate(seed)
        self.assertIsNotNone(candidate)
        self.assertEqual(
            candidate["itemUrl"],
            "https://item.rakuten.co.jp/shop-b/test-3000/",
        )
        self.assertEqual(candidate["source"],"worker_search_identity")


if __name__=="__main__":
    unittest.main()
