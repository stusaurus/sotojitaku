"""Static safety contracts: never reintroduce this release's three regressions."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class ReleaseWorkflowContractTest(unittest.TestCase):
    def test_publishing_has_two_latest_main_guards_and_matching_catalog_gate(self):
        workflow = read(".github/workflows/publish-static.yml")
        self.assertIn("cancel-in-progress: true", workflow)
        # If a docs-only commit supersedes this release, a replacement must
        # still be scheduled; no path-filtered main pushes.
        self.assertIn("branches: [main]", workflow)
        self.assertNotIn("    paths:", workflow)
        self.assertIn("id: release_head\n", workflow)
        self.assertIn("id: release_head_final\n", workflow)
        self.assertIn(
            "if: steps.release_head_final.outputs.publish == 'true'\n"
            "        id: deployment",
            workflow,
        )
        self.assertIn("node tests/car-stay-published-catalog.mjs", workflow)
        self.assertIn("node tests/camp-published-catalog.mjs", workflow)
        self.assertIn("node tests/fishing-published-catalog.mjs", workflow)
        self.assertIn("node tests/home-guide-browser.cjs", workflow)

    def test_automated_refreshes_trigger_certified_release_without_push_event(self):
        publish = read(".github/workflows/publish-static.yml")
        self.assertIn("  workflow_run:\n", publish)
        self.assertIn("    types: [completed]", publish)
        self.assertIn("    branches: [main]", publish)
        for workflow in (
            "Refresh CAR STAY products",
            "Sync CAR STAY shared Rakuten catalog",
            "Refresh FISHING products",
            "Renew nine strictly verified CAMP seller offers",
        ):
            self.assertIn("      - " + workflow, publish)
        self.assertIn(
            "github.event.workflow_run.conclusion == 'success'", publish
        )
        # Scheduled reconciliation protects against missed completion events.
        self.assertIn("  schedule:\n", publish)
        self.assertIn("cron: '35 8 * * *'", publish)

    def test_camp_renewal_cannot_bypass_all_service_deployment_gate(self):
        refresh = read(".github/workflows/refresh-verified-camp-offer.yml")
        self.assertIn("git push origin HEAD:main", refresh)
        self.assertNotIn("actions/deploy-pages@", refresh)
        self.assertNotIn("actions/upload-pages-artifact@", refresh)
        self.assertNotIn("pages: write", refresh)
        self.assertNotIn("id-token: write", refresh)
        self.assertIn(
            "node tests/camp-published-catalog.mjs",
            read(".github/workflows/publish-static.yml")
        )

    def test_fingerprint_job_cannot_write_automated_commits_to_main(self):
        workflow = read(".github/workflows/stamp-assets.yml")
        self.assertIn("contents: read", workflow)
        self.assertNotIn("contents: write", workflow)
        self.assertNotIn("git push", workflow)
        self.assertIn("python scripts/stamp_assets.py", workflow)
        self.assertIn("node --test tests/assets.test.mjs", workflow)

    def test_preview_and_live_have_independent_non_skipped_gates(self):
        workflow = read(".github/workflows/public-smoke.yml")
        self.assertIn("if: github.event_name == 'pull_request'", workflow)
        self.assertIn(
            "HOME_BASE=http://127.0.0.1:4173/sotojitaku/ "
            "node tests/home-guide-browser.cjs", workflow,
        )
        self.assertIn(
            "SOTOJITAKU_BASE: https://stusaurus.github.io/sotojitaku/",
            workflow,
        )
        smoke = read("tests/public-smoke.cjs")
        self.assertNotIn("REQUIRE_HOME_GUIDES", smoke)
        self.assertIn("assert.equal(await cards.count(),3", smoke)
        self.assertIn("missing stable published editorial entries", smoke)
        self.assertIn("assert.ok(guideLinks.length>=guides.length", smoke)

    def test_brand_preview_stamps_css_before_testing(self):
        workflow = read(".github/workflows/verify-brand-logos.yml")
        self.assertLess(
            workflow.index("- run: python scripts/stamp_assets.py"),
            workflow.index("- run: npm run check && npm run test:non-camp-live"),
        )


if __name__ == "__main__":
    unittest.main()
