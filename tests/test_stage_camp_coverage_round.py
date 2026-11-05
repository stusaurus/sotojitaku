"""No-network fail-closed tests for extra CAMP product supply research."""
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import stage_camp_coverage_round as coverage


class BoundedCoverageResearch(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "data").mkdir()
        self.clock = datetime(2026, 11, 5, 1, tzinfo=timezone.utc)
        self.audits = {"products": [
            {"category": category, "model": model,
             "itemCode": f"testshop:{n+10000}",
             "itemUrl": f"https://item.rakuten.co.jp/testshop/{n+10000}/"}
            for n, (category, model) in enumerate(
                dict.fromkeys(sum((list(g) for g in coverage.ROUNDS.values()), [])))
        ]}
        self.catalog = {"products": [{"category": "chair", "model": "BASE"}]}
        for name, value in (
            ("audited-products", self.audits),
            ("products", self.catalog),
            ("equipment", {"categories": [{"id": "tent"}, {"id": "cooler"}]}),
        ):
            (self.root / "data" / (name + ".json")).write_text(json.dumps(value))
        self.before = (self.root / "data/products.json").read_bytes()

    def mock_renew(self, *, fail_at=0, reason="rate_limited"):
        calls = []

        def renew(audits, catalog, equipment, *, target_category, target_model,
                  now, api_fetch, browser_get, run_id):
            calls.append((target_category, target_model))
            if len(calls) == fail_at:
                return audits, catalog, {
                    "apiStatus": reason, "sellerStatus": "not_attempted",
                    "result": "previous_still_fresh",
                    "publishedFreshnessChanged": False,
                }
            return audits, {
                **catalog, "products": catalog["products"] + [
                    {"category": target_category, "model": target_model,
                     "verifiedAt": now.isoformat()}
                ]}, {
                "apiStatus": "api_confirmed_seller_variant_audit_required",
                "sellerStatus": "independent_seller_and_api_evidence_review_required",
                "result": "renewed", "publishedFreshnessChanged": True,
            }
        return renew, calls

    def test_family_round_is_six_distinct_historical_exact_sellers_only(self):
        renew, calls = self.mock_renew()
        report, catalog, _ = coverage.stage_round(
            root=self.root, renew=renew, now=self.clock)
        self.assertEqual(calls, list(coverage.ROUNDS["family"]))
        self.assertEqual(report["maxApiRequests"], 6)
        self.assertEqual(report["attempted"], 6)
        self.assertEqual(report["independentlyRenewed"], 6)
        self.assertEqual(len(catalog["products"]), 7)
        self.assertFalse(report["verifiedForPublication"])
        self.assertEqual(self.before, (self.root / "data/products.json").read_bytes())
        text = json.dumps(report)
        for secret in ("itemCode", "itemUrl", "affiliateUrl", "price", "stock"):
            self.assertNotIn(secret, text)

    def test_sleep_round_is_separate_and_not_chained_automatically(self):
        renew, calls = self.mock_renew()
        report, _, _ = coverage.stage_round(
            root=self.root, renew=renew, round_name="sleep", now=self.clock)
        self.assertEqual(calls, list(coverage.ROUNDS["sleep"]))
        self.assertEqual(report["attempted"], 6)

    def test_quota_stop_blocks_subsequent_seller_requests(self):
        renew, calls = self.mock_renew(fail_at=2)
        report, catalog, _ = coverage.stage_round(
            root=self.root, renew=renew, now=self.clock)
        self.assertEqual(len(calls), 2)
        self.assertTrue(report["stoppedByUpstream"])
        self.assertEqual(report["independentlyRenewed"], 1)
        self.assertEqual(len(catalog["products"]), 2)
        self.assertEqual(self.before, (self.root / "data/products.json").read_bytes())

    def test_worker_outage_stops_without_claiming_sold_out(self):
        renew, calls = self.mock_renew(fail_at=1, reason="worker_unavailable")
        report, _, _ = coverage.stage_round(
            root=self.root, renew=renew, now=self.clock)
        self.assertEqual(len(calls), 1)
        self.assertTrue(report["stoppedByUpstream"])
        self.assertEqual(report["independentlyRenewed"], 0)
        self.assertEqual(report["results"][0]["apiStatus"], "worker_unavailable")

    def test_missing_or_bad_historical_identity_fails_before_api(self):
        renew, calls = self.mock_renew()
        self.audits["products"][0]["itemUrl"] = "https://not-rakuten.example/item/"
        (self.root / "data/audited-products.json").write_text(json.dumps(self.audits))
        with self.assertRaises(ValueError):
            coverage.stage_round(root=self.root, renew=renew, now=self.clock)
        self.assertFalse(calls)

    def test_unknown_duplicate_and_excessive_targets_are_refused(self):
        renew, calls = self.mock_renew()
        valid = coverage.ROUNDS["family"]
        for targets in (
            (valid[0], valid[0]),
            valid + (coverage.ROUNDS["sleep"][0],),
            (("tent", "MADE-UP"),),
        ):
            with self.assertRaises(ValueError):
                coverage.stage_round(root=self.root, renew=renew, now=self.clock,
                                     targets=targets)
        self.assertFalse(calls)

    def test_no_positive_proof_creates_no_candidate_to_publish(self):
        renew, _ = self.mock_renew(fail_at=1, reason="rate_limited")
        candidate = self.root / "candidate.json"
        ok = coverage.write_stage(
            root=self.root, renew=renew, now=self.clock,
            staged_catalog=candidate, staged_audits=self.root / "audits.json")
        self.assertFalse(ok)
        self.assertFalse(candidate.exists())
        report = json.loads(
            (self.root / "reports/camp-coverage-research.json").read_text())
        self.assertFalse(report["verifiedForPublication"])
        self.assertEqual(self.before, (self.root / "data/products.json").read_bytes())

    def test_partial_proof_stages_only_to_temporary_injected_files(self):
        renew, _ = self.mock_renew(fail_at=2)
        candidate = self.root / "candidate.json"
        ok = coverage.write_stage(
            root=self.root, renew=renew, now=self.clock,
            staged_catalog=candidate, staged_audits=self.root / "audits.json")
        self.assertTrue(ok)
        self.assertEqual(len(json.loads(candidate.read_text())["products"]), 2)
        self.assertEqual(self.before, (self.root / "data/products.json").read_bytes())


    def test_gap_round_uses_six_distinct_approved_historical_seller_codes(self):
        renew, calls = self.mock_renew()
        report, catalog, _ = coverage.stage_round(
            root=self.root, renew=renew, round_name="gap", now=self.clock)
        self.assertEqual(calls, list(coverage.ROUNDS["gap"]))
        self.assertEqual(report["maxApiRequests"], 6)
        self.assertEqual(report["independentlyRenewed"], 6)
        self.assertEqual(len(catalog["products"]), 7)
        self.assertFalse(report["verifiedForPublication"])
        self.assertEqual(self.before, (self.root / "data/products.json").read_bytes())

    def test_missing_gap_seller_code_aborts_before_any_live_request(self):
        self.audits["products"] = [
            a for a in self.audits["products"]
            if not (a["category"] == "mat" and a["model"] == "1124667")
        ]
        (self.root / "data/audited-products.json").write_text(
            json.dumps(self.audits))
        renew, calls = self.mock_renew()
        with self.assertRaises(ValueError):
            coverage.stage_round(root=self.root, renew=renew,
                                 round_name="gap", now=self.clock)
        self.assertFalse(calls)

    def test_priority_stage_only_three_previously_audited_original_merchant_ids(self):
        calls = []
        renew, reqs = self.mock_renew()
        report, catalog, _ = coverage.stage_round(
            root=self.root, renew=renew, round_name="priority",
            now=self.clock, pause=calls.append)
        self.assertEqual(
            list(coverage.ROUNDS["priority"]),
            [("hot_sandwich_maker", "UG-3086"),
             ("led_lantern", "2218364"),
             ("burner", "ST-340")])
        self.assertEqual(reqs, list(coverage.ROUNDS["priority"]))
        self.assertEqual(calls, [3, 3])
        self.assertEqual(report["attempted"], 3)
        self.assertEqual(report["independentlyRenewed"], 3)
        self.assertEqual(report["maxApiRequests"], 3)
        self.assertEqual(len(catalog["products"]), 4)
        self.assertFalse(report["verifiedForPublication"])
        self.assertEqual(self.before, (self.root / "data/products.json").read_bytes())

    def test_priority_429_stops_before_next_request_or_pacing(self):
        renew, requests = self.mock_renew(fail_at=2, reason="rate_limited")
        pauses = []
        report, catalog, _ = coverage.stage_round(
            root=self.root, renew=renew, round_name="priority",
            now=self.clock, pause=pauses.append)
        self.assertEqual(len(requests), 2)
        self.assertEqual(pauses, [3])
        self.assertTrue(report["stoppedByUpstream"])
        self.assertEqual(report["independentlyRenewed"], 1)
        self.assertEqual(len(catalog["products"]), 2)
        self.assertEqual(self.before, (self.root / "data/products.json").read_bytes())

    def test_priority_missing_audited_seller_aborts_without_api_request(self):
        self.audits["products"] = [
            a for a in self.audits["products"]
            if not (a["category"] == "led_lantern" and a["model"] == "2218364")]
        (self.root / "data/audited-products.json").write_text(
            json.dumps(self.audits))
        renew, requests = self.mock_renew()
        with self.assertRaises(ValueError):
            coverage.stage_round(
                root=self.root, renew=renew, round_name="priority",
                now=self.clock, pause=lambda _: None)
        self.assertFalse(requests)

    def test_naive_time_is_invalid(self):
        renew, calls = self.mock_renew()
        with self.assertRaises(ValueError):
            coverage.stage_round(root=self.root, renew=renew,
                                 now=datetime(2026, 11, 5, 1))
        self.assertFalse(calls)


if __name__ == "__main__":
    unittest.main()
