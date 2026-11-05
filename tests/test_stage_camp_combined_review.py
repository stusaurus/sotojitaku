"""Strict bounded two-phase CAMP research without publishing any SKU."""
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import stage_camp_combined_review as combined


class CombinedEvidence(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "data").mkdir()
        self.clock = datetime(2026, 11, 5, 4, tzinfo=timezone.utc)
        for name, value in (
            ("products", {"status": "partial_error",
                          "products": [{"category": "mat", "model": "BASE"}]}),
            ("audited-products", {"products": []}),
            ("equipment", {"categories": []}),
        ):
            (self.root / "data" / (name + ".json")).write_text(
                json.dumps(value), encoding="utf-8")
        self.before = {p.name: p.read_bytes()
                       for p in (self.root / "data").iterdir()}

    def fake(self, stop_at=None, count=6):
        calls = []

        def stage(*, root, round_name, now):
            prior = json.loads((root / "data/products.json").read_text())
            calls.append((round_name, len(prior["products"])))
            amount = 1 if stop_at == round_name else count
            rows = [{"category": "tent" if round_name == "family" else "table",
                     "model": f"{round_name}-{i}",
                     "apiStatus": "rate_limited" if stop_at == round_name and i == amount-1
                                  else "api_confirmed_seller_variant_audit_required",
                     "sellerStatus": "not_attempted" if stop_at == round_name and i == amount-1
                                     else "independent_seller_and_api_evidence_review_required",
                     "result": "previous_still_fresh" if stop_at == round_name and i == amount-1
                               else "renewed"}
                    for i in range(amount)]
            current = {**prior, "products": prior["products"] + [
                {"category": row["category"], "model": row["model"]}
                for row in rows if row["result"] == "renewed"
            ]}
            return {
                "researchRound": round_name,
                "results": rows,
                "stoppedByUpstream": stop_at == round_name,
            }, current, {"products": []}
        return stage, calls

    def assert_unchanged(self):
        for p in (self.root / "data").iterdir():
            self.assertEqual(p.read_bytes(), self.before[p.name])

    def test_two_batches_are_contiguous_and_bounded(self):
        stub, calls = self.fake()
        report, catalog, _ = combined.assemble(
            root=self.root, stage=stub, now=self.clock)
        self.assertEqual(calls, [("family", 1), ("recovery", 7)])
        self.assertEqual(report["maximumApiRequestsPerRound"], 6)
        self.assertEqual(report["maximumTotalApiRequests"], 12)
        self.assertEqual(report["attempted"], 12)
        self.assertEqual(report["independentlyRenewed"], 12)
        self.assertEqual(len(catalog["products"]), 13)
        self.assertTrue(report["bothRoundsCompleted"])
        self.assertFalse(report["verifiedForPublication"])
        self.assert_unchanged()

    def test_429_first_batch_aborts_following_batch(self):
        stub, calls = self.fake(stop_at="family")
        report, _, _ = combined.assemble(root=self.root, stage=stub, now=self.clock)
        self.assertEqual(calls, [("family", 1)])
        self.assertTrue(report["stoppedByUpstream"])
        self.assertFalse(report["bothRoundsCompleted"])
        self.assertFalse(report["verifiedForPublication"])
        self.assert_unchanged()

    def test_429_second_batch_does_not_publish_partial_result(self):
        stub, calls = self.fake(stop_at="recovery")
        candidate = self.root / "candidate.json"
        outcome = combined.write_stage(
            root=self.root, stage=stub, now=self.clock,
            candidate=candidate, audits=self.root / "audits.json")
        self.assertEqual(calls, [("family", 1), ("recovery", 7)])
        self.assertFalse(outcome)
        self.assertFalse(candidate.exists())
        report = json.loads((self.root / "reports/camp-combined-review.json").read_text())
        self.assertEqual(report["attempted"], 7)
        self.assertFalse(report["verifiedForPublication"])
        self.assert_unchanged()

    def test_full_proof_stages_only_to_injected_temporary_files(self):
        stub, _ = self.fake()
        candidate = self.root / "candidate.json"
        destination = self.root / "audits.json"
        result = combined.write_stage(
            root=self.root, stage=stub, now=self.clock,
            candidate=candidate, audits=destination)
        self.assertTrue(result)
        self.assertTrue(candidate.exists())
        self.assertEqual(len(json.loads(candidate.read_text())["products"]), 13)
        self.assertTrue(destination.exists())
        summary = (self.root / "reports/camp-combined-review.json").read_text()
        self.assertNotIn("itemUrl", summary)
        self.assertNotIn("affiliateUrl", summary)
        self.assertNotIn("price", summary)
        self.assert_unchanged()


    def test_three_batches_reuse_same_isolated_catalog_with_eighteen_call_limit(self):
        stub, calls = self.fake()
        report, catalog, _ = combined.assemble(
            root=self.root, stage=stub, now=self.clock, include_gap=True)
        self.assertEqual(calls, [("family", 1), ("recovery", 7), ("gap", 13)])
        self.assertEqual(report["maximumTotalApiRequests"], 18)
        self.assertEqual(report["maximumApiRequestsPerRound"], 6)
        self.assertEqual(report["attempted"], 18)
        self.assertEqual(report["independentlyRenewed"], 18)
        self.assertEqual(report["requestedRounds"], ["family", "recovery", "gap"])
        self.assertTrue(report["allRequestedRoundsCompleted"])
        self.assertFalse(report["verifiedForPublication"])
        self.assertEqual(len(catalog["products"]), 19)
        self.assert_unchanged()

    def test_429_third_batch_fails_closed_without_next_proof_or_publication(self):
        stub, calls = self.fake(stop_at="gap")
        candidate = self.root / "candidate.json"
        result = combined.write_stage(
            root=self.root, stage=stub, now=self.clock, include_gap=True,
            candidate=candidate, audits=self.root / "audits.json")
        self.assertFalse(result)
        self.assertFalse(candidate.exists())
        self.assertEqual(calls, [("family", 1), ("recovery", 7), ("gap", 13)])
        summary = json.loads((self.root / "reports/camp-combined-review.json").read_text())
        self.assertEqual(summary["attempted"], 13)
        self.assertTrue(summary["stoppedByUpstream"])
        self.assertFalse(summary["allRequestedRoundsCompleted"])
        self.assertFalse(summary["verifiedForPublication"])
        self.assert_unchanged()

    def test_full_eighteen_stages_only_in_injected_temp_files(self):
        stub, _ = self.fake()
        candidate = self.root / "candidate.json"
        audits = self.root / "audits.json"
        result = combined.write_stage(
            root=self.root, stage=stub, now=self.clock, include_gap=True,
            candidate=candidate, audits=audits)
        self.assertTrue(result)
        self.assertEqual(len(json.loads(candidate.read_text())["products"]), 19)
        self.assertTrue(audits.exists())
        self.assert_unchanged()

    def test_naive_time_refused_prior_to_any_probe(self):
        stub, calls = self.fake()
        with self.assertRaises(ValueError):
            combined.assemble(root=self.root, stage=stub,
                              now=datetime(2026, 11, 5))
        self.assertEqual(calls, [])
        self.assert_unchanged()


if __name__ == "__main__":
    unittest.main()
