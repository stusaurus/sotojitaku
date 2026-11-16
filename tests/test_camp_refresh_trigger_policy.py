"""CAMP seller refresh must not consume shared API quota on routine code merges.

Product proof is refreshed once daily or on an intentional workflow_dispatch.
The normal PR/build checks verify code changes without contacting sellers.
"""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/refresh-verified-camp-offer.yml"


class RefreshTriggerPolicyTests(unittest.TestCase):
    def test_no_automatic_api_refresh_after_main_code_push(self):
        source = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("\non:\n", source)
        triggers = source.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        self.assertIn("\n  workflow_dispatch:", triggers)
        self.assertIn("\n  schedule:", triggers)
        self.assertIn("- cron: '40 0 * * *'", triggers)
        self.assertNotIn("\n  push:", triggers)
        self.assertNotIn("\n  pull_request:", triggers)
        self.assertIn("cancel-in-progress: false", source)

    def test_original_strict_verification_and_publication_safety_remain(self):
        source = WORKFLOW.read_text(encoding="utf-8")
        for required in (
            "python scripts/refresh_verified_camp_offer.py",
            "python scripts/refresh_verified_camp_alternates.py",
            "npm run check",
            "node --test tests/verified-camp-snapshot.test.mjs",
            "git diff --cached --quiet",
            "git push origin HEAD:main",
        ):
            with self.subTest(required=required):
                self.assertIn(required, source)


if __name__ == "__main__":
    unittest.main()
