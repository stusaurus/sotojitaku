"""Regression checks for the release guard's explicit stale-run decisions."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from check_release_head import release_is_current


class ReleaseHeadGuardTest(unittest.TestCase):
    def test_latest_main_is_eligible_for_publish(self):
        sha = "a" * 40
        self.assertTrue(release_is_current(sha, sha))

    def test_superseded_release_must_not_deploy(self):
        self.assertFalse(release_is_current("a" * 40, "b" * 40))

    def test_missing_or_short_shas_fail_closed(self):
        for release, remote in [
            ("", "a" * 40), ("a" * 40, ""), ("a" * 39, "a" * 40),
            ("A" * 40, "a" * 40), ("a" * 40, "b" * 39),
            ("a" * 40, "x" * 40)
        ]:
            with self.subTest(release=release[:6], remote=remote[:6]):
                with self.assertRaises(ValueError):
                    release_is_current(release, remote)


if __name__ == "__main__":
    unittest.main()
