import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import stage_camp_recovery_pair as recovery


class StageOnly(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "data").mkdir()
        self.files = {
            "audited-products": {"products": [
                {"category": "led_lantern", "model": "2000038854"},
                {"category": "tent", "model": "2206748"},
            ]},
            "equipment": {"categories": [
                {"id": "led_lantern"}, {"id": "tent"},
            ]},
            "products": {"products": [
                {"category": "mat", "model": "OTHER", "price": 2000}
            ]},
        }
        for key, data in self.files.items():
            (self.root / "data" / (key + ".json")).write_text(json.dumps(data))
        self.now = datetime(2026, 11, 5, tzinfo=timezone.utc)

    def fake(self, *, fail_at=None, reason="rate_limited"):
        calls = []
        def renew(audits, catalog, equipment, *, now, target_category,
                  target_model, api_fetch, browser_get, run_id):
            calls.append((target_category, target_model))
            if len(calls) == fail_at:
                return audits, catalog, {
                    "result": "previous_still_fresh",
                    "apiStatus": reason,
                    "sellerStatus": "not_attempted",
                    "publishedFreshnessChanged": False,
                }
            copy = {**catalog,
                    "products": catalog["products"] + [
                        {"category": target_category,
                         "model": target_model, "price": 6000,
                         "verifiedAt": now.isoformat()}
                    ]}
            return audits, copy, {
                "result": "renewed",
                "apiStatus": "api_confirmed_seller_variant_audit_required",
                "sellerStatus": "independent_seller_and_api_evidence_review_required",
                "publishedFreshnessChanged": True,
            }
        return renew, calls

    def test_both_confirmed_stage_only_while_original_catalog_is_unchanged(self):
        fake, calls = self.fake()
        original = (self.root / "data/products.json").read_bytes()
        report, catalog, audits = recovery.stage_pair(
            root=self.root, renew=fake, now=self.now)
        self.assertEqual(calls, list(recovery.PRIORITIES))
        self.assertEqual(report["maxApiRequests"], 2)
        self.assertEqual(report["candidateProductCount"], 3)
        self.assertEqual(report["independentlyRenewed"], 2)
        self.assertTrue(report["bothCandidatesEligibleForSnapshotReview"])
        self.assertFalse(report["verifiedForPublication"])
        self.assertEqual(len(catalog["products"]), 3)
        self.assertEqual((self.root / "data/products.json").read_bytes(),
                         original)
        self.assertNotIn("affiliateUrl", json.dumps(report))

    def test_staged_bytes_go_only_to_injected_temporary_paths(self):
        fake, _ = self.fake()
        candidate = self.root / "staged-products.json"
        audits = self.root / "staged-audits.json"
        original = (self.root / "data/products.json").read_bytes()
        result = recovery.write_stage(root=self.root, renew=fake,
                                      now=self.now,
                                      staged_catalog=candidate,
                                      staged_audits=audits,
                                      supply_targets=())
        self.assertTrue(result)
        self.assertEqual(len(json.loads(candidate.read_text())["products"]), 3)
        self.assertEqual((self.root / "data/products.json").read_bytes(),
                         original)
        self.assertTrue((self.root / "reports/camp-recovery-pair-candidate.json").exists())

    def test_quota_stop_refuses_candidate_stage_and_leaves_inputs_unchanged(self):
        fake, calls = self.fake(fail_at=1)
        staged = self.root / "candidate.json"
        result = recovery.write_stage(root=self.root, renew=fake,
                                      now=self.now,
                                      staged_catalog=staged,
                                      staged_audits=self.root / "audits.json",
                                      supply_targets=())
        self.assertFalse(result)
        self.assertEqual(len(calls), 1)
        self.assertFalse(staged.exists())
        self.assertEqual(json.loads((self.root / "data/products.json").read_text()),
                         self.files["products"])

    def test_one_success_is_not_misreported_as_both(self):
        fake, calls = self.fake(fail_at=2, reason="worker_unavailable")
        report, catalog, _ = recovery.stage_pair(root=self.root, renew=fake,
                                                  now=self.now)
        self.assertEqual(len(calls), 2)
        self.assertEqual(report["independentlyRenewed"], 1)
        self.assertFalse(report["bothCandidatesEligibleForSnapshotReview"])
        self.assertEqual(report["candidateProductCount"], 2)
        self.assertFalse(report["verifiedForPublication"])

    def test_audited_burners_and_family_tables_are_staged_only_after_proof(self):
        fake, calls = self.fake()
        original = (self.root / "data/products.json").read_bytes()
        report, candidate, _ = recovery.stage_pair(
            root=self.root, renew=fake, now=self.now,
            supply_targets=recovery.SUPPLY_TARGETS)
        self.assertEqual(calls, list(recovery.PRIORITIES) +
                         list(recovery.SUPPLY_TARGETS))
        self.assertEqual(report["maxApiRequests"], 6)
        self.assertEqual(report["supplyTargets"], 4)
        self.assertEqual(report["supplyIndependentlyRenewed"], 4)
        self.assertEqual(report["independentlyRenewed"], 6)
        self.assertTrue(report["bothCandidatesEligibleForSnapshotReview"])
        self.assertTrue(report["allRequestedTargetsRenewed"])
        self.assertFalse(report["verifiedForPublication"])
        self.assertEqual(len(candidate["products"]), 7)
        self.assertEqual((self.root / "data/products.json").read_bytes(), original)
        self.assertNotIn("affiliateUrl", json.dumps(report))

    def test_supply_rate_limit_stops_without_pretending_recovery(self):
        fake, calls = self.fake(fail_at=3, reason="rate_limited")
        report, candidate, _ = recovery.stage_pair(
            root=self.root, renew=fake, now=self.now,
            supply_targets=recovery.SUPPLY_TARGETS)
        self.assertEqual(len(calls), 3)
        self.assertTrue(report["stoppedByUpstream"])
        self.assertEqual(report["supplyIndependentlyRenewed"], 0)
        self.assertFalse(report["allRequestedTargetsRenewed"])
        self.assertEqual(len(candidate["products"]), 3)
        self.assertFalse(report["verifiedForPublication"])

    def test_worker_outage_stops_before_exhausting_supplier_budget(self):
        fake, calls = self.fake(fail_at=3, reason="worker_unavailable")
        report, _, _ = recovery.stage_pair(
            root=self.root, renew=fake, now=self.now,
            supply_targets=recovery.SUPPLY_TARGETS)
        self.assertEqual(len(calls), 3)
        self.assertTrue(report["stoppedByUpstream"])
        self.assertFalse(report["allRequestedTargetsRenewed"])

    def test_duplicate_or_unbounded_targets_rejected_before_any_api_request(self):
        fake, calls = self.fake()
        for targets in (recovery.SUPPLY_TARGETS +
                        (("table", "2205813"),),
                        recovery.SUPPLY_TARGETS + (("table", "2205811"),)):
            with self.assertRaises(ValueError):
                recovery.stage_pair(root=self.root, renew=fake,
                                    now=self.now, supply_targets=targets)
        self.assertEqual(calls, [])

    def test_naive_clock_is_never_accepted(self):
        fake, _ = self.fake()
        with self.assertRaises(ValueError):
            recovery.stage_pair(root=self.root, renew=fake,
                                now=datetime(2026, 11, 5))


if __name__ == "__main__":
    unittest.main()
