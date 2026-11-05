import json
import sys
import unittest
import urllib.parse
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import probe_camp_recovery_candidates as probe


def audit(category, model):
    return {
        "category": category, "model": model,
        "itemCode": "seller:10001" if category == "led_lantern" else "seller:10002",
        "itemUrl": ("https://item.rakuten.co.jp/seller/10001/"
                    if category == "led_lantern"
                    else "https://item.rakuten.co.jp/seller/10002/"),
        "referencePrice": 5000, "audited": True, "bodyConfirmed": True,
        "fixedVariant": True, "available": True, "priceAudit": True,
        "condition": "new", "quantityPerListing": 1,
    }


class ResearchOnly(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "data").mkdir()
        self.audits = {"products": [
            audit("led_lantern", "2000038854"),
            audit("tent", "2206748"),
        ]}
        self.equipment = {"categories": [
            {"id": "led_lantern", "include_any": ["ランタン"], "exclude_any": []},
            {"id": "tent", "include_any": ["テント"], "exclude_any": []},
        ], "global_exclude_terms": []}
        self.catalog = {"products": [{"category": "chair", "model": "OTHER"}],
                        "updatedAt": "2026-10-05T00:00:00Z"}
        self.persist()

    def persist(self):
        for name, data in [
            ("audited-products", self.audits),
            ("equipment", self.equipment),
            ("products", self.catalog),
        ]:
            (self.root / "data" / (name + ".json")).write_text(json.dumps(data))

    def mock_api(self, req):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(req.full_url).query)
        code = query["itemCode"][0]
        target = next(a for a in self.audits["products"] if a["itemCode"] == code)
        url = target["itemUrl"]
        name = (f"Coleman ランタン {target['model']}"
                if target["category"] == "led_lantern"
                else f"Coleman テント {target['model']}")
        return {
            "found": True, "lookup_method": "exact_item_code_only",
            "item_url": url,
            "affiliate_url": ("https://hb.afl.rakuten.co.jp/hgc/xxx/?pc="
                              + urllib.parse.quote(url, safe="")),
            "item_code": code, "name": name, "price": 6000,
            "availability": 1, "tax_flag": 0, "postage_flag": 0,
            "purchasable_min_price": 6000,
            "purchasable_max_price": 6000,
            "image": "https://thumbnail.image.rakuten.co.jp/model.jpg",
        }

    def collect(self, fetch):
        return probe.collect(root=self.root, fetch=fetch,
                             observed_at="2026-11-05T00:00:00Z")

    def test_two_official_evidence_results_still_cannot_be_published(self):
        original = (self.root / "data/products.json").read_bytes()
        calls = []
        def fetch(req):
            calls.append(req.full_url)
            return self.mock_api(req)
        result = self.collect(fetch)
        self.assertEqual(result["apiRequests"], 2)
        self.assertEqual(len(calls), 2)
        self.assertEqual([r["status"] for r in result["results"]],
                         ["api_confirmed_seller_variant_audit_required"] * 2)
        self.assertTrue(all(r["verifiedForPublication"] is False
                            for r in result["results"]))
        self.assertTrue(all("seller page" in r["nextAction"]
                            for r in result["results"]))
        self.assertEqual((self.root / "data/products.json").read_bytes(), original)
        serialized = json.dumps(result)
        self.assertNotIn("verifiedAt", serialized)
        self.assertNotIn("listingAuditedAt", serialized)
        self.assertNotIn("currentApiPrice", serialized)

    def test_429_stops_after_one_call_without_hammering_worker(self):
        calls = []
        def fetch(req):
            calls.append(req.full_url)
            return {"error": "worker_unavailable", "upstream_status": 429}
        result = self.collect(fetch)
        self.assertEqual(len(calls), 1)
        self.assertTrue(result["stoppedByUpstream"])
        self.assertEqual(result["results"][0]["status"], "rate_limited")
        self.assertEqual(result["apiRequests"], 1)

    def test_worker_outage_stops_before_next_item(self):
        result = self.collect(lambda _: {"error": "worker_unavailable"})
        self.assertTrue(result["stoppedByUpstream"])
        self.assertEqual(result["apiRequests"], 1)
        self.assertEqual(result["results"][0]["status"], "worker_unavailable")

    def test_invalid_and_missing_historical_code_cannot_be_queried(self):
        self.audits["products"][0]["itemCode"] = ""
        self.persist()
        called = []
        def fetch(req):
            called.append(req.full_url)
            return {"found": False}
        result = self.collect(fetch)
        self.assertEqual([r["status"] for r in result["results"]],
                         ["audited_exact_item_missing", "exact_item_not_found"])
        self.assertEqual(len(called), 1)

    def test_same_model_already_live_not_requeried(self):
        self.catalog["products"].append({
            "category": "led_lantern", "model": "2000038854"})
        self.persist()
        calls = []
        def fetch(req):
            calls.append(req.full_url)
            return {"found": False}
        result = self.collect(fetch)
        self.assertEqual(result["apiRequests"], 1)
        self.assertEqual(result["results"][0]["status"], "already_in_catalog")
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
