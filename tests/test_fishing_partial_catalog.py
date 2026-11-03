"""Contract tests for partially publishable, safety-verified FISHING catalogs."""
import importlib.util
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "fishing_partial_gate", ROOT / "fishing/scripts/check_partial_catalog.py"
)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)
NOW = datetime(2026, 11, 3, 10, 0, tzinfo=timezone.utc)


def seller(product_id="fixture"):
    item = f"https://item.rakuten.co.jp/test-shop/{product_id}/"
    return {
        "productId": product_id, "categoryId": "rig",
        "itemUrl": item, "itemCode": "test-shop:123", "price": 1400,
        "affiliateUrl": "https://hb.afl.rakuten.co.jp/hgc/test/?pc=" + quote(item, safe=""),
        "image": "https://example.invalid/image.png",
        "audit": {"status": "verified_live"},
        "verifiedAt": (NOW - timedelta(minutes=10)).isoformat(),
    }


def catalog(products=None):
    products = [seller()] if products is None else products
    return {
        "status": "partial", "products": products, "verifiedCount": len(products),
        "updatedAt": (NOW - timedelta(hours=1)).isoformat(),
        "failures": {
            "lumica-choi-start-g09224": "live_identity_listing_not_found",
            "shimano-vf098v-kids-m": "HTTPError",
            "shimano-vf098v-kids-l": "HTTPError",
        },
    }


class PartialReleaseGateTests(unittest.TestCase):
    def test_fresh_verified_seller_with_exact_affiliate_target_passes(self):
        self.assertEqual(module.verify_seller_evidence(catalog(), NOW), [])
        self.assertEqual(module.check_documented_missing(list(module.KNOWN_GAPS), catalog()), [])

    def test_stale_and_future_verified_at_fail(self):
        for delta in (timedelta(days=8), -timedelta(hours=1)):
            p = seller()
            p["verifiedAt"] = (NOW - delta).isoformat()
            self.assertTrue(module.verify_seller_evidence(catalog([p]), NOW))

    def test_affiliate_cannot_point_to_a_different_rakuten_item(self):
        p = seller()
        p["affiliateUrl"] = "https://hb.afl.rakuten.co.jp/hgc/test/?pc=" + quote(
            "https://item.rakuten.co.jp/other/wrong/", safe=""
        )
        self.assertTrue(any("affiliate target" in e for e in module.verify_seller_evidence(catalog([p]), NOW)))

    def test_unexpected_gap_remains_fatal(self):
        errors = module.check_documented_missing(["sabiki/low/life_jacket_adult"], catalog())
        self.assertTrue(any("unexpected" in e for e in errors))

    def test_failure_record_and_partial_status_are_mandatory(self):
        c = catalog()
        del c["failures"]["shimano-vf098v-kids-m"]
        c["status"] = "complete"
        errors = module.check_documented_missing(["family_child/child_m/life_jacket_child"], c)
        self.assertEqual(len(errors), 2)

    def test_child_pfd_without_body_fit_is_rejected(self):
        p = seller()
        p.update(categoryId="life_jacket_child", audiences=["child"], preferenceTags=["child_m"],
                 fit={"size": "M", "heightCm": {"min": 100, "max": 120}})
        self.assertTrue(any("fit" in e for e in module.verify_seller_evidence(catalog([p]), NOW)))

    def test_duplicates_count_mismatch_and_invalid_status_fail(self):
        c = catalog([seller(), seller()])
        c["verifiedCount"] = 1
        c["products"][0]["audit"]["status"] = "unverified"
        errors = module.verify_seller_evidence(c, NOW)
        self.assertTrue(any("duplicated" in e for e in errors))
        self.assertTrue(any("verifiedCount" in e for e in errors))
        self.assertTrue(any("unverified" in e for e in errors))

    def test_old_upstream_snapshot_does_not_pass(self):
        c = catalog()
        c["updatedAt"] = (NOW - timedelta(hours=49)).isoformat()
        self.assertTrue(any("48 hours" in e for e in module.verify_seller_evidence(c, NOW)))


if __name__ == "__main__":
    unittest.main()
