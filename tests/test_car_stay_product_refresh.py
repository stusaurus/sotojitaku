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

if __name__=="__main__":
    unittest.main()
