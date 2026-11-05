import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from report_camp_refresh import build_report


class CampRefreshReportTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 5, tzinfo=timezone.utc)
        self.equipment = {"categories": [
            {"id": "tent"}, {"id": "led_lantern"}, {"id": "burner"}
        ]}
        self.audits = {"products": [
            {"category": "tent", "listingAuditedAt": "2026-11-04T00:00:00Z",
             "model": "SECRET_TENT", "itemUrl": "https://example.com/private"},
            {"category": "tent", "listingAuditedAt": "2026-10-04T00:00:00Z"},
            {"category": "led_lantern", "listingAuditedAt": "2026-10-04T00:00:00Z"},
            {"category": "burner", "listingAuditedAt": "2026-11-08T00:00:00Z"},
            {"category": "burner", "listingAuditedAt": "bad"},
        ]}
        self.catalog = {
            "status": "partial_error", "updatedAt": "2026-11-04T00:00:00Z",
            "products": [
                {"category": "tent", "verifiedAt": "2026-11-04T00:00:00Z"},
                {"category": "tent", "verifiedAt": "2026-10-01T00:00:00Z"},
                {"category": "led_lantern", "verifiedAt": "2026-11-06T00:00:00Z"},
                {"category": "burner", "verifiedAt": ""},
            ],
            "failedCategories": ["burner", "led_lantern"],
            "itemFailures": {
                "burner:PRIVATE_ITEM": "seller_browser_fetch_failed",
                "led_lantern:SECRET_ITEM": "exact_item_not_found",
            },
        }

    def test_gap_and_age_are_distinct_from_unavailability(self):
        result = build_report(self.catalog, self.audits, self.equipment,
                              observed_at=self.now)
        self.assertEqual(result["verifiedProductCount"], 4)
        self.assertEqual(result["recentlyVerifiedProductCount"], 1)
        self.assertEqual(result["categoriesWithNoRecentEvidence"],
                         ["burner", "led_lantern"])
        self.assertEqual(result["categoriesWithExactlyOneRecentOffer"], ["tent"])
        self.assertEqual(result["categoriesWithFewerThanTwoRecentOffers"],
                         ["burner", "led_lantern", "tent"])
        self.assertEqual(result["historicalAuditsOlderThanSevenDays"], 2)
        self.assertEqual(result["undatedOrFutureHistoricalAudits"], 2)
        self.assertEqual(result["categoryEvidence"]["tent"], {
            "historicalAuditCount": 2,
            "catalogEntryCount": 2,
            "recentlyVerifiedEntryCount": 1,
            "historicalAuditsOlderThanSevenDays": 1,
            "undatedOrFutureHistoricalAudits": 0,
        })
        self.assertEqual(result["failureReasonCounts"], {
            "exact_item_not_found": 1, "seller_browser_fetch_failed": 1,
        })
        self.assertIn("not proof of unavailability", result["interpretation"])

    def test_diagnostic_never_discloses_model_sku_or_item_url(self):
        result = build_report(self.catalog, self.audits, self.equipment,
                              observed_at=self.now)
        output = json.dumps(result)
        for sensitive in ("SECRET_TENT", "PRIVATE_ITEM", "SECRET_ITEM",
                          "https://example.com/private"):
            self.assertNotIn(sensitive, output)
        self.assertEqual(self.catalog["products"][0]["verifiedAt"],
                         "2026-11-04T00:00:00Z")
        self.assertEqual(self.audits["products"][0]["listingAuditedAt"],
                         "2026-11-04T00:00:00Z")

    def test_failure_classes_distinguish_transient_and_rejected_listings(self):
        catalog = {"products": [], "itemFailures": {
            "secret:1": "seller_browser_fetch_failed",
            "secret:2": "upstream_rate_limited",
            "secret:3": "unavailable",
            "secret:4": "exact_item_not_found",
            "secret:5": "PRIVATE_SKU unexpected seller URL",
        }}
        result = build_report(catalog, observed_at=self.now)
        self.assertEqual(result["failureClassCounts"], {
            "acquisition_or_evidence_failure": 2,
            "listing_rejected_or_not_found": 2,
            "unclassified_failure": 1,
        })
        self.assertEqual(result["failureReasonCounts"]["unclassified_failure"], 1)
        self.assertNotIn("PRIVATE_SKU", json.dumps(result))
        self.assertNotIn("secret:", json.dumps(result))

    def test_legacy_fields_without_coverage_inputs(self):
        result = build_report(self.catalog, observed_at=self.now)
        self.assertEqual(result["failedAuditCount"], 2)
        self.assertNotIn("categoryEvidence", result)

    def test_reject_naive_observation_and_seven_day_boundary(self):
        with self.assertRaises(ValueError):
            build_report(self.catalog, observed_at=datetime(2026, 11, 5))
        audit = {"products": [{"category": "tent",
                              "listingAuditedAt": "2026-10-29T00:00:00Z"}]}
        result = build_report({"products": []}, audit, self.equipment,
                              observed_at=self.now)
        self.assertEqual(result["historicalAuditsOlderThanSevenDays"], 1)


if __name__ == "__main__":
    unittest.main()
