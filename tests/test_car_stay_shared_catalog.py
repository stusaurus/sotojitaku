import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path

MODULE=Path(__file__).resolve().parents[1]/"car-stay"/"scripts"/"import_shared_catalog.py"
spec=importlib.util.spec_from_file_location("car_stay_shared",MODULE)
shared=importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)

class CarStaySharedCatalogTests(unittest.TestCase):
    def seed(self):
        return {
            "productId":"p1",
            "gapIds":["privacy_full"],
            "recommendationRole":"beginner_default",
            "vehicleFit":[{"vehicleId":"honda-nbox-jf5-jf6","status":"verified"}],
        }

    def product(self,verified_at,item="https://item.rakuten.co.jp/shop/item1/"):
        import urllib.parse
        aff="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+urllib.parse.quote(item,safe="")
        return {
            "productId":"p1","gapIds":["privacy_full"],"recommendationRole":"beginner_default",
            "vehicleFit":[{"vehicleId":"honda-nbox-jf5-jf6","status":"verified"}],
            "price":10000,"image":"https://example.com/a.jpg",
            "itemUrl":item,"affiliateUrl":aff,"verifiedAt":verified_at,
            "audit":{"status":"verified_live"},
        }

    def test_exact_affiliate_destination_required(self):
        import urllib.parse
        now=datetime(2026,10,6,12,tzinfo=timezone.utc)
        p=self.product(now.isoformat())
        self.assertTrue(shared.valid_product(p,self.seed(),now))
        p["affiliateUrl"]="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+urllib.parse.quote("https://item.rakuten.co.jp/shop/other/",safe="")
        self.assertFalse(shared.valid_product(p,self.seed(),now))

    def test_shared_newer_product_wins(self):
        now=datetime(2026,10,6,12,tzinfo=timezone.utc)
        old=self.product((now-timedelta(hours=2)).isoformat())
        new=self.product((now-timedelta(hours=1)).isoformat())
        new["price"]=9000
        result=shared.merge_catalogs(
            {"products":[old],"failures":{}},
            {"products":[new],"failures":{}},
            {"p1":self.seed()},
            now,
        )
        self.assertEqual(len(result["products"]),1)
        self.assertEqual(result["products"][0]["price"],9000)

    def test_shared_fit_metadata_must_match_current_seed(self):
        now=datetime(2026,10,6,12,tzinfo=timezone.utc)
        p=self.product(now.isoformat())
        p["vehicleFit"]=[{"vehicleId":"other","status":"verified"}]
        result=shared.merge_catalogs(
            {"products":[]},{"products":[p]},{"p1":self.seed()},now
        )
        self.assertEqual(result["products"],[])
        self.assertEqual(result["rejected"]["p1"],"shared_invalid_or_stale")

    def test_products_older_than_seven_days_are_rejected(self):
        now=datetime(2026,10,8,12,tzinfo=timezone.utc)
        p=self.product((now-timedelta(days=8)).isoformat())
        result=shared.merge_catalogs(
            {"products":[]},{"products":[p]},{"p1":self.seed()},now
        )
        self.assertEqual(result["products"],[])

    def test_verified_product_removes_stale_failure_entry(self):
        now=datetime(2026,10,6,12,tzinfo=timezone.utc)
        p=self.product(now.isoformat())
        result=shared.merge_catalogs(
            {"products":[],"failures":{"p1":"old_failure"}},
            {"products":[p],"failures":{"p1":"transient_error"}},
            {"p1":self.seed()},
            now,
        )
        self.assertNotIn("p1",result["failures"])

if __name__=="__main__":
    unittest.main()
