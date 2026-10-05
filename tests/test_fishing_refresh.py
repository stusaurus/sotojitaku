import importlib.util
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location(
    "fishing_refresh",
    ROOT/"fishing"/"scripts"/"refresh_products.py"
)
mod=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

class FishingRefreshRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.seed={
            "itemUrl":"https://item.rakuten.co.jp/shop-a/old-item/",
            "identityGroups":[["ダイワ","DAIWA"],["240C"]],
            "forbiddenTerms":["中古"],
        }

    def test_exact_url_is_highest_match(self):
        c={"name":"ダイワ フィッシュホルダー 240C","itemUrl":"https://item.rakuten.co.jp/shop-a/old-item/"}
        self.assertEqual(mod.candidate_match_level(c,self.seed),2)

    def test_same_shop_identity_replacement_is_allowed(self):
        c={"name":"DAIWA フィッシュホルダー 240C","itemUrl":"https://item.rakuten.co.jp/shop-a/new-item/"}
        self.assertEqual(mod.candidate_match_level(c,self.seed),1)

    def test_other_shop_is_rejected_even_with_same_identity(self):
        c={"name":"DAIWA フィッシュホルダー 240C","itemUrl":"https://item.rakuten.co.jp/shop-b/new-item/"}
        self.assertEqual(mod.candidate_match_level(c,self.seed),0)

    def test_forbidden_term_is_rejected(self):
        c={"name":"中古 ダイワ フィッシュホルダー 240C","itemUrl":"https://item.rakuten.co.jp/shop-a/new-item/"}
        self.assertEqual(mod.candidate_match_level(c,self.seed),0)

if __name__=="__main__":
    unittest.main()
