import importlib.util
import unittest
from pathlib import Path

MODULE=Path(__file__).resolve().parents[1]/"car-stay"/"scripts"/"refresh_products.py"
spec=importlib.util.spec_from_file_location("car_stay_refresh",MODULE)
refresh=importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

class CarStayProductRefreshTests(unittest.TestCase):
    def test_canonical_direct_item(self):
        self.assertEqual(
            refresh.canonical_item_url("https://item.rakuten.co.jp/shop/item123/"),
            "https://item.rakuten.co.jp/shop/item123/"
        )

    def test_canonical_affiliate_target(self):
        url="https://hb.afl.rakuten.co.jp/hgc/test/?pc="+__import__("urllib.parse").parse.quote("https://item.rakuten.co.jp/shop/item123/",safe="")
        self.assertEqual(refresh.canonical_item_url(url),"https://item.rakuten.co.jp/shop/item123/")

    def test_identity_requires_every_group(self):
        seed={"identityGroups":[["N-BOX","NBOX"],["JF5"],["JF6"],["サンシェード"]],"forbiddenTerms":["JF3"]}
        self.assertTrue(refresh.identity_ok("N-BOX JF5 JF6 サンシェード",seed))
        self.assertFalse(refresh.identity_ok("N-BOX JF5 サンシェード",seed))
        self.assertFalse(refresh.identity_ok("N-BOX JF3 JF5 JF6 サンシェード",seed))

    def test_affiliate_must_target_exact_listing(self):
        import urllib.parse
        item="https://item.rakuten.co.jp/shop/item123/"
        good="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+urllib.parse.quote(item,safe="")
        bad="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+urllib.parse.quote("https://item.rakuten.co.jp/shop/other/",safe="")
        self.assertTrue(refresh.safe_affiliate(good,item))
        self.assertFalse(refresh.safe_affiliate(bad,item))

    def test_same_shop_identity_listing_is_allowed_but_other_shop_is_not(self):
        seed={"itemUrl":"https://item.rakuten.co.jp/hobbyman/old-slug/","identityGroups":[["N-VAN"],["JJ1"],["JJ2"],["サンシェード"]],"forbiddenTerms":[]}
        same={"name":"N-VAN JJ1 JJ2 サンシェード フルセット","itemUrl":"https://item.rakuten.co.jp/hobbyman/new-slug/"}
        other={"name":"N-VAN JJ1 JJ2 サンシェード フルセット","itemUrl":"https://item.rakuten.co.jp/another-shop/new-slug/"}
        self.assertEqual(refresh.candidate_match_level(same,seed),1)
        self.assertEqual(refresh.candidate_match_level(other,seed),0)

    def test_seed_queries_keep_search_broad_but_deduplicated(self):
        seed={"query":"very specific","searchQueries":["NBOX JF5 サンシェード","NBOX JF5 サンシェード","NBOX JF5"]}
        self.assertEqual(refresh.seed_queries(seed),["NBOX JF5 サンシェード","NBOX JF5"])

    def test_exact_url_can_fallback_when_rakuten_returns_interstitial(self):
        seed={"itemUrl":"https://item.rakuten.co.jp/shop/item123/","identityGroups":[["N-BOX"],["JF5"]]}
        original=refresh.fetch_text
        try:
            refresh.fetch_text=lambda _:"<html><title>Rakuten</title></html>"
            mode,price=refresh.page_sales_audit(seed,seed["itemUrl"],12345)
            self.assertEqual(mode,"exact_feed_fallback")
            self.assertEqual(price,12345)
        finally:
            refresh.fetch_text=original

    def test_rakuten_api_search_is_scoped_to_seed_shop(self):
        import os, urllib.parse
        seed={"itemUrl":"https://item.rakuten.co.jp/hobbyman/item123/","query":"N-VAN JJ1","identityGroups":[["N-VAN"],["JJ1"]],"forbiddenTerms":[]}
        seen=[]
        original_fetch=refresh.fetch_json
        old={k:os.environ.get(k) for k in ["RAKUTEN_APPLICATION_ID","RAKUTEN_ACCESS_KEY","RAKUTEN_AFFILIATE_ID"]}
        try:
            os.environ["RAKUTEN_APPLICATION_ID"]="app"
            os.environ["RAKUTEN_ACCESS_KEY"]="key"
            os.environ["RAKUTEN_AFFILIATE_ID"]="aff"
            def fake(url,headers=None):
                seen.append(urllib.parse.parse_qs(urllib.parse.urlparse(url).query))
                return {"items":[]}
            refresh.fetch_json=fake
            refresh.rakuten_api_candidate(seed)
            self.assertEqual(seen[0]["shopCode"],["hobbyman"])
        finally:
            refresh.fetch_json=original_fetch
            for k,v in old.items():
                if v is None: os.environ.pop(k,None)
                else: os.environ[k]=v

    def test_rakuten_api_prefers_exact_seed_url_over_similar_same_shop_item(self):
        import os
        seed={
            "itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/",
            "query":"N-VAN JJ1 サンシェード",
            "identityGroups":[["N-VAN"],["JJ1"],["サンシェード"]],
            "forbiddenTerms":[]
        }
        old={k:os.environ.get(k) for k in ["RAKUTEN_APPLICATION_ID","RAKUTEN_ACCESS_KEY","RAKUTEN_AFFILIATE_ID"]}
        original=refresh.fetch_json
        try:
            os.environ["RAKUTEN_APPLICATION_ID"]="app"
            os.environ["RAKUTEN_ACCESS_KEY"]="key"
            os.environ["RAKUTEN_AFFILIATE_ID"]="aff"
            refresh.fetch_json=lambda url,headers=None:{"items":[
                {"itemName":"N-VAN JJ1 サンシェード フロント","itemUrl":"https://item.rakuten.co.jp/hobbyman/similar/","itemPrice":9000,"affiliateUrl":"https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fhobbyman%2Fsimilar%2F","mediumImageUrls":["https://example.com/a.jpg"]},
                {"itemName":"N-VAN JJ1 サンシェード フルセット","itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/","itemPrice":12000,"affiliateUrl":"https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fhobbyman%2Fexact%2F","mediumImageUrls":["https://example.com/b.jpg"]}
            ]}
            candidate=refresh.rakuten_api_candidate(seed)
            self.assertEqual(candidate["itemUrl"],seed["itemUrl"])
        finally:
            refresh.fetch_json=original
            for k,v in old.items():
                if v is None: os.environ.pop(k,None)
                else: os.environ[k]=v

if __name__=="__main__":
    unittest.main()
