"""Fail-closed no-network tests for four exact CAMP seller proof probes."""
import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import probe_camp_alternate_sellers as research


class AlternateMerchantResearch(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "data").mkdir()
        categories = ["led_lantern", "hot_sandwich_maker", "fire_pit", "mat"]
        models = ["2218364", "UG-3086", "2000031235", "1124667"]
        words = ["ランタン", "ホットサンド", "焚火台", "マット"]
        self.audits = {"products": [
            {
                "category": c, "model": m, "name": f"{w} {m}",
                "itemCode": f"oldshop:{101 + i}",
                "itemUrl": f"https://item.rakuten.co.jp/oldshop/{101 + i}/",
                "referencePrice": 5000, "audited": True,
                "bodyConfirmed": True, "fixedVariant": True,
                "available": True, "priceAudit": True,
                "condition": "new", "quantityPerListing": 1,
            }
            for i, (c, m, w) in enumerate(zip(categories, models, words))
        ]}
        self.equipment = {
            "global_exclude_terms": [],
            "categories": [
                {"id": c, "include_any": [w], "exclude_any": []}
                for c, w in zip(categories, words)
            ],
        }
        self.inputs = {
            "audited-products": self.audits,
            "products": {"products": [{"category": "table", "model": "BASE"}]},
            "equipment": self.equipment,
        }
        for name, value in self.inputs.items():
            (self.root / "data" / (name + ".json")).write_text(
                json.dumps(value), encoding="utf-8")
        self.bytes = {name: (self.root / "data" / (name + ".json")).read_bytes()
                      for name in self.inputs}
        self.calls = []
        self.seller_calls = []

    def fetch(self, req):
        code = parse_qs(urlparse(req.full_url).query)["itemCode"][0]
        self.calls.append(code)
        url = parse_qs(urlparse(req.full_url).query)["url"][0]
        category = "mat" if code.startswith("oldshop:") else next(
            a for a in research.ALTERNATES if a[2] == code)[0]
        target = next(a for a in self.audits["products"]
                      if a["category"] == category)
        return {
            "found": True, "lookup_method": "exact_item_code_only",
            "item_url": url, "item_code": code,
            "affiliate_url": "https://hb.afl.rakuten.co.jp/hgc/safe/?pc="
                             + __import__("urllib.parse", fromlist=["quote"]).quote(url, safe=""),
            "name": target["name"], "price": 5000,
            "availability": 1, "tax_flag": 0, "postage_flag": 0,
            "purchasable_min_price": 5000, "purchasable_max_price": 5000,
            "image": "https://thumbnail.image.rakuten.co.jp/safe.jpg",
        }

    def seller(self, url):
        self.seller_calls.append(url)
        model = next(a for a in self.audits["products"]
                     if a["model"] in ["2218364", "UG-3086", "2000031235", "1124667"]
                     and (a["model"] in ("2218364", "UG-3086", "2000031235")
                          and any(t[1] == a["model"] and t[3] == url
                                  for t in research.ALTERNATES)
                          or a["model"] == "1124667" and url == a["itemUrl"]))["model"]
        item_id = int(urlparse(url).path.strip("/").split("/")[1])
        info = {
            "itemId": item_id, "sellType": "NORMAL",
            "inventoryType": "single", "sku": [],
            "purchaseInfo": {
                "purchaseBySellType": {
                    "purchaseCondition": "enabled",
                    "normalPurchase": {"price": {"minPrice": 5000}},
                },
                "variantMappedInventories": [{"quantity": 2}],
            },
        }
        return url, '"itemInfoSku":' + json.dumps(info) + " " + model

    def check_unchanged(self):
        for name, old in self.bytes.items():
            self.assertEqual(
                (self.root / "data" / (name + ".json")).read_bytes(), old)

    def test_four_exact_independent_proofs_never_become_publication(self):
        r = research.collect(root=self.root, fetch=self.fetch,
                             browser_get=self.seller,
                             observed_at="2026-11-05T10:00:00+09:00")
        self.assertEqual(r["attempted"], 4)
        self.assertEqual(r["maxApiRequests"], 4)
        self.assertEqual(r["independentlyProvenForManualReview"], 4)
        self.assertEqual(len(self.calls), 4)
        self.assertEqual(len(self.seller_calls), 4)
        self.assertFalse(r["verifiedForPublication"])
        self.assertTrue(all(not x["verifiedForPublication"] for x in r["results"]))
        self.assertFalse(next(x for x in r["results"]
                              if x["model"] == "2000031235")["fitEvidenceComplete"])
        text = json.dumps(r)
        for forbidden in ("affiliate_url", "itemUrl", "itemCode", "currentApiPrice",
                          "5000", "alpen:7411106505"):
            self.assertNotIn(forbidden, text)
        self.check_unchanged()

    def test_worker_http_error_is_reported_without_confusing_stock_or_exposing_url(self):
        def unavailable(req):
            self.calls.append(req.full_url)
            return {
                "error": "worker_unavailable", "worker_status": 503,
                "upstream_status": 502,
                "body": {"itemCode": "do_not_expose", "price": 19999},
            }
        result = research.collect(
            root=self.root, fetch=unavailable, browser_get=self.seller,
            observed_at="2026-11-05T01:00:00Z")
        self.assertEqual(result["attempted"], 1)
        self.assertTrue(result["stoppedByUpstream"])
        first = result["results"][0]
        self.assertEqual(first["apiStatus"], "worker_unavailable")
        self.assertEqual(first["workerHttpStatus"], 503)
        self.assertEqual(first["rakutenUpstreamHttpStatus"], 502)
        self.assertFalse(first["independentSellerProof"])
        self.assertFalse(self.seller_calls)
        serialized = json.dumps(result)
        for secret in ("do_not_expose", "19999", "itemCode", "itemUrl", "https://item.rakuten.co.jp/"):
            self.assertNotIn(secret, serialized)
        self.check_unchanged()

    def test_malformed_or_fabricated_http_status_is_not_reported(self):
        def invalid(req):
            return {
                "error": "worker_unavailable",
                "worker_status": True,
                "upstream_status": "500",
            }
        result = research.collect(
            root=self.root, fetch=invalid, browser_get=self.seller,
            observed_at="2026-11-05T01:00:00Z")
        first = result["results"][0]
        self.assertIsNone(first["workerHttpStatus"])
        self.assertIsNone(first["rakutenUpstreamHttpStatus"])
        self.assertEqual(first["apiStatus"], "worker_unavailable")
        self.assertEqual(result["attempted"], 1)
        self.assertFalse(self.seller_calls)
        self.check_unchanged()

    def test_api_429_stops_without_seller_or_stock_assumption(self):
        def limited(req):
            self.calls.append(req.full_url)
            return {"error": "worker_unavailable", "upstream_status": 429}
        r = research.collect(root=self.root, fetch=limited,
                             browser_get=self.seller,
                             observed_at="2026-11-05T01:00:00Z")
        self.assertTrue(r["stoppedByUpstream"])
        self.assertEqual(r["attempted"], 1)
        self.assertEqual(r["results"][0]["apiStatus"], "rate_limited")
        self.assertFalse(self.seller_calls)
        self.check_unchanged()

    def test_seller_item_id_mismatch_never_establishes_proof(self):
        def wrong(url):
            current, body = self.seller(url)
            return current, body.replace('"itemId": ' + str(
                int(urlparse(url).path.strip("/").split("/")[1])),
                '"itemId": 999')
        r = research.collect(root=self.root, fetch=self.fetch,
                             browser_get=wrong, include_original=False,
                             proposals=research.ALTERNATES[:1],
                             observed_at="2026-11-05T01:00:00Z")
        self.assertEqual(r["independentlyProvenForManualReview"], 0)
        self.assertFalse(r["results"][0]["independentSellerProof"])
        self.assertEqual(r["results"][0]["sellerStatus"],
                         "seller_sku_or_item_id_unverified")
        self.check_unchanged()

    def test_unchanged_original_url_cannot_be_declared_new_merchant(self):
        cat, model, _, _ = research.ALTERNATES[0]
        old = self.audits["products"][0]
        with self.assertRaises(ValueError):
            research._alternate_audit(old, old["itemCode"], old["itemUrl"])
        self.assertEqual(cat, old["category"])
        self.assertEqual(model, old["model"])

    def test_mismatch_unknown_and_duplicate_targets_fail_before_fetch(self):
        bad = (
            ("led_lantern", "2218364", "wrong:999",
             "https://item.rakuten.co.jp/alpen/7411106505/"),
        )
        for proposals in (bad, research.ALTERNATES * 2):
            with self.assertRaises(ValueError):
                research.collect(root=self.root, fetch=self.fetch,
                                 proposals=proposals,
                                 observed_at="2026-11-05T01:00:00Z")
        self.assertFalse(self.calls)
        self.check_unchanged()

    def test_malformed_or_naive_time_fails_before_network(self):
        for now in ("2026-11-05T10:00:00", "wrong"):
            with self.assertRaises(ValueError):
                research.collect(root=self.root, fetch=self.fetch,
                                 observed_at=now)
        self.assertFalse(self.calls)

    def test_missing_original_model_fails_before_any_request(self):
        self.audits["products"] = self.audits["products"][1:]
        (self.root / "data/audited-products.json").write_text(
            json.dumps(self.audits))
        with self.assertRaises(ValueError):
            research.collect(root=self.root, fetch=self.fetch,
                             observed_at="2026-11-05T01:00:00Z")
        self.assertFalse(self.calls)


if __name__ == "__main__":
    unittest.main()
