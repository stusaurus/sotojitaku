"""Fail-closed Snow Peak official Rakuten seller proof regression tests."""
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urlparse, quote

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import probe_camp_seller_derived_item_id as proof


class OfficialSnowPeakFirePit(unittest.TestCase):
    def setUp(self):
        tmp = TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        (self.root / "data").mkdir()
        self.now = datetime(2026, 11, 5, 4, tzinfo=timezone.utc)
        self.model = "ST-032RS"
        self.page = proof.ALLOWED_TARGETS["snowpeak_fire"][2]
        self.maker = "https://ec.snowpeak.co.jp/item/SNP0120A0737"
        self.audit = {
            "model": self.model, "category": "fire_pit",
            "name": "Snow Peak 焚火台 L ST-032RS",
            "itemCode": "original-store:100001",
            "itemUrl": "https://item.rakuten.co.jp/original-store/original-item/",
            "family": "snowpeak-firepit-st032rs",
            "audited": True, "bodyConfirmed": True, "fixedVariant": True,
            "priceAudit": True, "available": True,
            "condition": "new", "quantityPerListing": 1,
            "referencePrice": 21120,
            "spec": {"capacity": 4, "weight": 5500, "packed_size": "560x640x32"},
            "familyCapacityEvidence": {
                "basis": "manufacturer_explicit_person_count",
                "maxPeople": 4, "source": self.maker,
                "manufacturerStatement": "焚火台 L [3-4人用]"
            },
            "evidence": {"specification": self.maker},
        }
        self.equipment = {
            "global_exclude_terms": [],
            "categories": [{"id": "fire_pit", "include_any": ["焚火台"],
                            "exclude_any": [], "required_fields": ["weight"]}],
        }
        for name, data in {
            "audited-products": {"products": [self.audit]},
            "products": {"products": [{"category": "tent", "model": "EXISTING"}]},
            "equipment": self.equipment,
        }.items():
            (self.root / "data" / (name + ".json")).write_text(json.dumps(data))
        self.before = {p.name: p.read_bytes() for p in (self.root / "data").iterdir()}
        self.calls = []

    def html(self, price=21120, item_id=12345678):
        info = {
            "itemId": item_id, "sellType": "NORMAL",
            "inventoryType": "single", "sku": [],
            "purchaseInfo": {
                "purchaseBySellType": {
                    "purchaseCondition": "enabled",
                    "normalPurchase": {"price": {"minPrice": price}},
                },
                "variantMappedInventories": [{"quantity": 2}],
            },
        }
        return '"itemInfoSku":' + json.dumps(info) + " スノーピーク 焚火台 L ST-032RS"

    def seller(self, url):
        self.calls.append(("seller", url))
        return url, self.html()

    def api(self, req):
        q = parse_qs(urlparse(req.full_url).query)
        code = q["itemCode"][0]
        self.calls.append(("api", code))
        return {
            "found": True, "lookup_method": "exact_item_code_only",
            "item_url": self.page, "item_code": code,
            "affiliate_url": "https://hb.afl.rakuten.co.jp/hgc/test/?pc=" +
                             quote(self.page, safe=""),
            "name": "Snow Peak 焚火台 L ST-032RS",
            "price": 21120, "availability": 1,
            "tax_flag": 0, "postage_flag": 0,
            "purchasable_min_price": 21120, "purchasable_max_price": 21120,
            "image": "https://thumbnail.image.rakuten.co.jp/test.jpg",
        }

    def unchanged(self):
        for p in (self.root / "data").iterdir():
            self.assertEqual(p.read_bytes(), self.before[p.name])

    def test_official_group_evidence_requires_exact_manufacturer_contract(self):
        self.assertTrue(proof.explicit_four_person_manufacturer_proof(self.audit))
        for mutated in (
            {"familyCapacityEvidence": None},
            {"familyCapacityEvidence": {**self.audit["familyCapacityEvidence"], "maxPeople": 3}},
            {"spec": {**self.audit["spec"], "capacity": 5}},
            {"evidence": {"specification": "https://example.com/snowpeak"}},
            {"familyCapacityEvidence": {
                **self.audit["familyCapacityEvidence"],
                "manufacturerStatement": "焚火台 L"}},
            {"familyCapacityEvidence": {
                **self.audit["familyCapacityEvidence"],
                "manufacturerStatement": None}},
        ):
            audit = {**self.audit, **mutated}
            self.assertFalse(proof.explicit_four_person_manufacturer_proof(audit))

    def test_shop_slug_is_not_claimed_as_actual_item_id_and_never_published(self):
        result = proof.probe(root=self.root, now=self.now,
                             target="snowpeak_fire", browser_get=self.seller,
                             api_fetch=self.api)
        self.assertTrue(result["sellerIdFromLivePage"])
        self.assertFalse(result["urlSlugMatchesSellerId"])
        self.assertTrue(result["manufacturerGroupSizeVerified"])
        self.assertEqual(result["rakutenApiRequests"], 1)
        self.assertEqual(result["maximumRakutenApiRequests"], 1)
        self.assertEqual(self.calls[0], ("seller", self.page))
        self.assertEqual(self.calls[1], ("api", "snowpeak-official:12345678"))
        self.assertTrue(result["independentEvidenceForManualReview"])
        self.assertFalse(result["verifiedForPublication"])
        out = json.dumps(result)
        for forbidden in ("12345678", "itemCode", "affiliateUrl", "21120",
                          "item.rakuten.co.jp"):
            self.assertNotIn(forbidden, out)
        self.unchanged()

    def test_unpriced_or_unavailable_seller_not_approved(self):
        for fragment in (
            self.html(price=None),
            self.html(price=21120).replace('"purchaseCondition": "enabled"',
                                           '"purchaseCondition": "disabled"'),
        ):
            self.calls.clear()
            result = proof.probe(root=self.root, now=self.now,
                                 target="snowpeak_fire",
                                 browser_get=lambda url, h=fragment: (url, h),
                                 api_fetch=self.api)
            self.assertFalse(result["independentEvidenceForManualReview"])
            self.assertFalse(result["verifiedForPublication"])
        self.unchanged()

    def test_xebio_listing_is_separate_retailer_but_same_model_group_proof(self):
        self.page = proof.ALLOWED_TARGETS["xebio_fire"][2]
        result = proof.probe(root=self.root, now=self.now,
                             target="xebio_fire", browser_get=self.seller,
                             api_fetch=self.api)
        self.assertEqual(self.calls[0], ("seller", self.page))
        self.assertEqual(self.calls[1], ("api", "supersportsxebio:12345678"))
        self.assertTrue(result["manufacturerGroupSizeVerified"])
        self.assertTrue(result["sellerIdFromLivePage"])
        self.assertEqual(result["rakutenApiRequests"], 1)
        self.assertFalse(result["verifiedForPublication"])
        self.unchanged()

    def test_xebio_variant_unknown_does_not_call_official_item_api(self):
        self.page = proof.ALLOWED_TARGETS["xebio_fire"][2]
        html = self.html().replace('"inventoryType": "single"',
                                   '"inventoryType": "multiple"')
        result = proof.probe(root=self.root, now=self.now, target="xebio_fire",
                             browser_get=lambda url: (url, html),
                             api_fetch=self.api)
        self.assertTrue(result["manufacturerGroupSizeVerified"])
        self.assertEqual(result["sellerStatus"], "variant_unknown")
        self.assertFalse(result["sellerIdFromLivePage"])
        self.assertEqual(result["rakutenApiRequests"], 0)
        self.assertFalse(result["independentEvidenceForManualReview"])
        self.assertFalse(self.calls)
        self.unchanged()

    def test_official_shop_unproven_shipping_never_validates_for_purchase(self):
        def api_missing_shipping(req):
            response = self.api(req)
            response["postage_flag"] = None
            return response
        result = proof.probe(root=self.root, now=self.now,
                             target="snowpeak_fire", browser_get=self.seller,
                             api_fetch=api_missing_shipping)
        self.assertEqual(result["rakutenApiRequests"], 1)
        self.assertEqual(result["apiStatus"], "postage_inclusion_unverified")
        self.assertTrue(result["manufacturerGroupSizeVerified"])
        self.assertFalse(result["independentEvidenceForManualReview"])
        self.assertFalse(result["verifiedForPublication"])
        self.unchanged()

    def test_wrong_merchant_or_missing_html_makes_no_item_api_call(self):
        for url, content in ((self.page, "焚火台 L ST-032RS"),
                             ("https://item.rakuten.co.jp/other/st-032rs/",
                              self.html())):
            self.calls.clear()
            result = proof.probe(root=self.root, now=self.now, target="snowpeak_fire",
                                 browser_get=lambda _url,u=url,h=content:(u,h),
                                 api_fetch=self.api)
            self.assertEqual(result["rakutenApiRequests"], 0)
            self.assertFalse(result["independentEvidenceForManualReview"])
            self.assertFalse(self.calls)
        self.unchanged()


if __name__ == "__main__":
    unittest.main()
