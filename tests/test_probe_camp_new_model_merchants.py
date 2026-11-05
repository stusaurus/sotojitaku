"""Offline tests: new product research never becomes a manufactured audit."""
import json
import sys
import unittest
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import probe_camp_new_model_merchants as research


class NewMakerModelResearch(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "data").mkdir()
        for name, value in (
            ("products", {"products": [{"model": "EXISTING", "category": "mat"}]}),
            ("audited-products", {"products": [{"model": "EXISTING", "audited": True}]}),
            ("equipment", {"categories": []}),
        ):
            (self.root / "data" / (name + ".json")).write_text(json.dumps(value))
        self.original = {p.name: p.read_bytes() for p in (self.root / "data").iterdir()}
        self.now = datetime(2026, 11, 5, 5, tzinfo=timezone.utc)
        self.seller_calls = []
        self.api_calls = []

    def seller_html(self, key, *, price=10800, quantity=2,
                    multiple=False, item_id=12345678):
        model = research.SOURCES[key]["model"]
        info = {
            "itemId": item_id, "sellType": "NORMAL",
            "inventoryType": "multiple" if multiple else "single",
            "sku": [{"hidden": False}] if multiple else [],
            "purchaseInfo": {
                "purchaseBySellType": {
                    "purchaseCondition": "enabled",
                    "normalPurchase": {"price": {"minPrice": price}},
                },
                "variantMappedInventories": [{"quantity": quantity}],
            },
        }
        return '"itemInfoSku":' + json.dumps(info) + " " + model

    def seller(self, url):
        self.seller_calls.append(url)
        key = next(k for k, v in research.SOURCES.items() if v["sellerUrl"] == url)
        return url, self.seller_html(key)

    def api(self, req):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(req.full_url).query)
        code = params["itemCode"][0]
        url = params["url"][0]
        self.api_calls.append((code, url))
        model = next(v for v in research.SOURCES.values() if v["sellerUrl"] == url)
        return {
            "found": True, "lookup_method": "exact_item_code_only",
            "item_code": code, "item_url": url,
            "affiliate_url": ("https://hb.afl.rakuten.co.jp/hgc/proof/?pc=" +
                              urllib.parse.quote(url, safe="")),
            "name": model["manufacturer"] + " " + model["model"] + " 本体",
            "availability": 1, "tax_flag": 0, "postage_flag": 0,
            "price": 10800,
            "purchasable_min_price": 10800,
            "purchasable_max_price": 10800,
            "image": "https://thumbnail.image.rakuten.co.jp/proof.jpg",
        }

    def unchanged(self):
        for p in (self.root / "data").iterdir():
            self.assertEqual(p.read_bytes(), self.original[p.name])

    def test_manufacturer_weight_and_four_person_proof_are_distinct(self):
        mat = research.SOURCES["dod_mat"]
        fire = research.SOURCES["hilander_fire"]
        self.assertTrue(research.maker_gate(mat))
        self.assertTrue(research.maker_gate(fire))
        self.assertEqual(mat["makerWeightGrams"], 800)
        self.assertEqual(fire["manufacturerHeadcount"], {"minimum": 4, "maximum": 6})
        self.assertTrue(fire["manufacturerWeightConflict"])
        for altered in (
            {**mat, "makerWeightGrams": 1800},
            {**mat, "manufacturerUrl": "https://example.com/unsourced"},
            {**fire, "manufacturerHeadcount": {"minimum": 1, "maximum": 2}},
            {**fire, "manufacturerWeightConflict": False},
        ):
            self.assertFalse(research.maker_gate(altered))

    def test_two_exact_sellers_research_only_even_if_api_and_cart_match(self):
        pauses = []
        report = research.probe(
            root=self.root, seller_get=self.seller, api_fetch=self.api,
            pause=pauses.append, now=self.now)
        self.assertEqual(report["sellerBrowserRequests"], 2)
        self.assertEqual(report["officialApiRequests"], 2)
        self.assertEqual(report["maximumOfficialApiRequests"], 2)
        self.assertEqual(pauses, [3])
        self.assertEqual(
            [x["officialApiStatus"] for x in report["results"]],
            ["independent_sale_evidence_for_manual_audit_only"] * 2)
        self.assertTrue(report["results"][0]["independentlyValidatedForManualAudit"])
        self.assertFalse(report["results"][1]["independentlyValidatedForManualAudit"])
        self.assertTrue(report["results"][1]["makerWeightConflict"])
        self.assertFalse(report["verifiedForPublication"])
        self.assertEqual(
            [v[0] for v in self.api_calls],
            ["ariel-store:12345678", "hilander:12345678"])
        serialized = json.dumps(report)
        for forbidden in ("12345678", "itemCode", "affiliate_url", "10800",
                          "item.rakuten.co.jp", "stock_quantity"):
            self.assertNotIn(forbidden, serialized)
        self.unchanged()

    def test_first_429_halts_all_remainder_without_retry(self):
        def upstream(_req):
            self.api_calls.append("called")
            return {"error": "worker_unavailable", "upstream_status": 429}
        report = research.probe(
            root=self.root, seller_get=self.seller, api_fetch=upstream,
            pause=lambda _: self.fail("should stop"), now=self.now)
        self.assertEqual(len(self.seller_calls), 1)
        self.assertEqual(len(self.api_calls), 1)
        self.assertEqual(report["officialApiRequests"], 1)
        self.assertTrue(report["stoppedByUpstream"])
        self.assertEqual(report["results"][0]["officialApiStatus"], "rate_limited")
        self.unchanged()

    def test_selector_or_seller_stock_missing_prevents_any_api(self):
        def invalid(url):
            key = next(k for k,v in research.SOURCES.items() if v["sellerUrl"] == url)
            self.seller_calls.append(url)
            return url, self.seller_html(key, multiple=True)
        report = research.probe(
            root=self.root, seller_get=invalid, api_fetch=self.api,
            pause=lambda _: None, now=self.now)
        self.assertEqual(report["officialApiRequests"], 0)
        self.assertFalse(self.api_calls)
        self.assertTrue(all(not r["independentlyValidatedForManualAudit"]
                            for r in report["results"]))
        self.unchanged()

    def test_price_missing_or_conflicting_copies_fail_closed(self):
        key = "dod_mat"
        source = research.SOURCES[key]
        for html in (
            self.seller_html(key, price=None),
            self.seller_html(key) + self.seller_html(key, price=11111),
            self.seller_html(key, quantity=0),
            self.seller_html(key).replace(source["model"], "UNRELATED"),
        ):
            api_before = len(self.api_calls)
            result = research.probe_one(
                key, root=self.root,
                seller_get=lambda url, h=html: (url, h),
                api_fetch=self.api)
            self.assertFalse(result["independentlyValidatedForManualAudit"])
            self.assertEqual(result["officialApiRequests"], 0)
            self.assertEqual(len(self.api_calls), api_before)
        self.unchanged()

    def test_mismatched_affiliate_price_tax_or_shipping_never_pass(self):
        good_identity = {"itemCode": "hilander:12345678",
                         "itemUrl": research.SOURCES["hilander_fire"]["sellerUrl"]}
        s = research.SOURCES["hilander_fire"]
        def status(**kwargs):
            base = self.api(type("Request", (), {
                "full_url": "https://example.test/?itemCode=hilander%3A12345678&url=" +
                urllib.parse.quote(good_identity["itemUrl"], safe="")
            })())
            return research.verify_official_api_identity(
                s, good_identity, {**base, **kwargs}, 10800)
        self.assertEqual(status(postage_flag=1), "tax_or_shipping_unverified")
        self.assertEqual(status(tax_flag=None), "tax_or_shipping_unverified")
        self.assertEqual(status(price=9999), "seller_and_api_price_mismatch")
        self.assertEqual(status(item_code="other:12345678"),
                         "official_exact_identity_or_affiliate_mismatch")
        self.assertEqual(status(availability=0), "stock_unverified")
        self.assertEqual(status(purchasable_max_price=10900),
                         "sku_or_price_range_unverified")
        self.unchanged()

    def test_alternative_dod_seller_is_not_a_second_product_family(self):
        report = research.probe(
            root=self.root, targets=research.ALTERNATE_DOD_TARGETS,
            seller_get=self.seller, api_fetch=self.api,
            pause=lambda _: self.fail("one seller only"), now=self.now)
        self.assertEqual(report["sellerBrowserRequests"], 1)
        self.assertEqual(report["officialApiRequests"], 1)
        self.assertEqual(self.api_calls[0][0], "happynight:12345678")
        self.assertEqual(report["results"][0]["model"], "CM1-083-CA")
        self.assertFalse(report["verifiedForPublication"])
        self.unchanged()
        calls_before = len(self.seller_calls)
        with self.assertRaises(ValueError):
            research.probe(
                root=self.root, targets=("dod_mat", "dod_mat_happynight"),
                seller_get=self.seller, api_fetch=self.api, now=self.now)
        self.assertEqual(len(self.seller_calls), calls_before)

    def test_unknown_targets_and_naive_time_never_trigger_network(self):
        with self.assertRaises(ValueError):
            research.probe_one("unknown", root=self.root,
                               seller_get=self.seller, api_fetch=self.api)
        with self.assertRaises(ValueError):
            research.probe(root=self.root, seller_get=self.seller,
                           api_fetch=self.api, now=datetime(2026, 11, 5))
        self.assertFalse(self.api_calls)
        self.assertFalse(self.seller_calls)
        self.unchanged()


if __name__ == "__main__":
    unittest.main()
