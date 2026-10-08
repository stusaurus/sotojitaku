"""Regression tests for CAR STAY shared-feed power specifications."""
import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def load_module(name, rel):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

shards = load_module("car_stay_merge_shards", "car-stay/scripts/merge_product_shards.py")
sync = load_module("car_stay_shared_sync", "car-stay/scripts/import_shared_catalog.py")

class PowerSpecFromSeedTests(unittest.TestCase):
    def setUp(self):
        self.spec = {
            "capacityWh": 512,
            "ratedOutputW": 500,
            "evidenceUrl": "https://www.example.com/verified-spec",
        }
        self.seed = {
            "productId": "power-test",
            "itemUrl": "https://item.rakuten.co.jp/test-shop/123/",
            "gapIds": ["power_capacity"],
            "fitStrategy": "power",
            "recommendationRole": "beginner_default",
            "vehicleFit": [],
            "powerSpec": self.spec,
        }
        self.product = {
            "productId": "power-test",
            "itemUrl": self.seed["itemUrl"],
            "affiliateUrl": "https://hb.afl.rakuten.co.jp/hgc/test/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Ftest-shop%2F123%2F",
            "image": "https://example.com/product.jpg",
            "price": 59900,
            "verifiedAt": "2026-10-08T00:00:00+00:00",
            "audit": {"status": "verified_live"},
            "gapIds": ["power_capacity"],
            "fitStrategy": "power",
            "recommendationRole": "beginner_default",
            "vehicleFit": [],
        }

    def test_shard_merger_inherits_seed_power_spec(self):
        product = shards.normalize_shared_product(self.product, self.seed)
        self.assertEqual(product["powerSpec"], self.spec)
        self.assertEqual(product["price"], self.product["price"])
        self.assertEqual(product["affiliateUrl"], self.product["affiliateUrl"])

    def test_shared_sync_inherits_seed_power_spec(self):
        result = sync.merge_catalogs(
            {"products": []}, {"products": [self.product]},
            {"power-test": self.seed},
            now=datetime(2026, 10, 8, 9, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(len(result["products"]), 1)
        self.assertEqual(result["products"][0]["powerSpec"], self.spec)

if __name__ == "__main__":
    unittest.main()
