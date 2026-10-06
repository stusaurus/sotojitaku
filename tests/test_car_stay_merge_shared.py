import importlib.util
import json
import tempfile
import unittest
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

MODULE=Path(__file__).resolve().parents[1]/"car-stay"/"scripts"/"merge_product_shards.py"
spec=importlib.util.spec_from_file_location("car_stay_merge",MODULE)
merge_mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge_mod)

def affiliate_for(item_url):
    return "https://hb.afl.rakuten.co.jp/hgc/x/?pc="+urllib.parse.quote(item_url,safe="")

class SharedCatalogMergeTests(unittest.TestCase):
    def make_files(self,shared_product):
        td=tempfile.TemporaryDirectory()
        root=Path(td.name)
        shards=root/"shards"; shards.mkdir()
        seeds=root/"seeds"; seeds.mkdir()
        item_url="https://item.rakuten.co.jp/atmys/im10cm-maker/"
        (shards/"0.json").write_text(json.dumps({
            "version":1,
            "updatedAt":"2026-10-06T12:40:00+00:00",
            "auditPolicyVersion":"local-v1",
            "products":[],
            "failures":{"universal-atmys-im10cm-maker":"sales_page_unreachable"},
            "deferred":{},
            "runtimeBudgetSeconds":240
        }))
        (seeds/"universal.json").write_text(json.dumps({
            "productId":"universal-atmys-im10cm-maker",
            "itemUrl":item_url,
            "gapIds":["sleep_surface"],
            "recommendationRole":"beginner_alternative",
            "score":72,
            "fitStrategy":"measurement",
            "measurementFit":{"unitLengthMm":1900,"unitWidthMm":620,"maxUnits":2},
            "fitCheckedAt":"2026-10-06",
            "vehicleFit":[]
        }))
        shared=root/"shared.json"
        shared.write_text(json.dumps({
            "updatedAt":"2026-10-06T12:41:00+00:00",
            "products":[shared_product]
        }))
        return td,shards,seeds,shared

    def valid_product(self):
        item_url="https://item.rakuten.co.jp/atmys/im10cm-maker/"
        return {
            "productId":"universal-atmys-im10cm-maker",
            "name":"車中泊 マット 10cm",
            "price":8800,
            "itemUrl":item_url,
            "affiliateUrl":affiliate_for(item_url),
            "image":"https://thumbnail.image.rakuten.co.jp/example.jpg",
            "verifiedAt":datetime.now(timezone.utc).isoformat(),
            "gapIds":["wrong_gap"],
            "recommendationRole":"wrong",
            "score":1,
            "fitStrategy":"vehicle",
            "vehicleFit":[{"vehicleId":"wrong","status":"verified"}],
            "audit":{"status":"verified_live","seedItemUrl":item_url}
        }

    def test_valid_shared_product_clears_local_failure_and_uses_local_fit_semantics(self):
        product=self.valid_product()
        td,shards,seeds,shared=self.make_files(product)
        try:
            result=merge_mod.merge(shards,shared,seeds)
            self.assertEqual(len(result["products"]),1)
            self.assertNotIn("universal-atmys-im10cm-maker",result["failures"])
            p=result["products"][0]
            self.assertEqual(p["fitStrategy"],"measurement")
            self.assertEqual(p["gapIds"],["sleep_surface"])
            self.assertEqual(p["measurementFit"]["unitLengthMm"],1900)
            self.assertEqual(result["sources"]["sharedImported"],1)
        finally:
            td.cleanup()

    def test_mismatched_shared_item_url_is_rejected(self):
        product=self.valid_product()
        product["itemUrl"]="https://item.rakuten.co.jp/atmys/other/"
        product["affiliateUrl"]=affiliate_for(product["itemUrl"])
        td,shards,seeds,shared=self.make_files(product)
        try:
            result=merge_mod.merge(shards,shared,seeds)
            self.assertEqual(len(result["products"]),0)
            self.assertEqual(result["sharedRejected"]["universal-atmys-im10cm-maker"],"seed_url_mismatch")
        finally:
            td.cleanup()

    def test_wrong_affiliate_destination_is_rejected(self):
        product=self.valid_product()
        product["affiliateUrl"]=affiliate_for("https://item.rakuten.co.jp/atmys/other/")
        td,shards,seeds,shared=self.make_files(product)
        try:
            result=merge_mod.merge(shards,shared,seeds)
            self.assertEqual(len(result["products"]),0)
            self.assertEqual(result["sharedRejected"]["universal-atmys-im10cm-maker"],"unsafe_affiliate")
        finally:
            td.cleanup()

    def test_stale_shared_product_is_rejected(self):
        product=self.valid_product()
        product["verifiedAt"]="2026-09-01T00:00:00+00:00"
        td,shards,seeds,shared=self.make_files(product)
        try:
            result=merge_mod.merge(shards,shared,seeds)
            self.assertEqual(len(result["products"]),0)
            self.assertEqual(result["sharedRejected"]["universal-atmys-im10cm-maker"],"stale")
        finally:
            td.cleanup()

if __name__=="__main__":
    unittest.main()
