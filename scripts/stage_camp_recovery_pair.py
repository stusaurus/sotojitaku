"""Stage independently reverified CAMP LED/tent offers for CI comparison only.

No GitHub writes or release mutations. Two current API + seller proofs must pass
before writing candidate JSON into the *runner's /tmp*, never data/ on disk.
Existing catalog and audit files remain untouched until a review step explicitly
copies staged bytes for test execution. No artifact includes live affiliate URLs.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from acquire import ROOT
from probe_camp_recovery_candidates import PRIORITIES
from refresh_verified_camp_offer import refresh_snapshot

STAGED_CATALOG = Path("/tmp/camp-recovery-candidate-products.json")
STAGED_AUDITS = Path("/tmp/camp-recovery-candidate-audits.json")


def stage_pair(*, root=ROOT, renew=refresh_snapshot, now=None,
               api_fetch=None, browser_get=None):
    observed = now or datetime.now(timezone.utc)
    if observed.tzinfo is None:
        raise ValueError("observed_time_must_be_aware")
    observed = observed.astimezone(timezone.utc)
    audits = json.loads((root / "data/audited-products.json").read_text(
        encoding="utf-8"))
    catalog = json.loads((root / "data/products.json").read_text(
        encoding="utf-8"))
    equipment = json.loads((root / "data/equipment.json").read_text(
        encoding="utf-8"))
    before = len(catalog.get("products") or [])
    results = []
    for category, model in PRIORITIES:
        audits, catalog, evidence = renew(
            audits, catalog, equipment, now=observed,
            api_fetch=api_fetch, browser_get=browser_get,
            target_category=category, target_model=model,
            run_id=os.environ.get("GITHUB_RUN_ID", "unpublished_candidate"),
        )
        results.append({
            "category": category, "model": model,
            "apiStatus": evidence["apiStatus"],
            "sellerStatus": evidence["sellerStatus"],
            "result": evidence["result"],
            "publishedFreshnessChanged": evidence["publishedFreshnessChanged"],
        })
        if evidence["apiStatus"] == "rate_limited":
            break
    successful = sum(row["result"] == "renewed" for row in results)
    # Even two successful independent proofs are a *review candidate* only.
    report = {
        "schemaVersion": 1,
        "type": "research_only_not_for_publication",
        "observedAt": observed.isoformat(),
        "maxApiRequests": len(PRIORITIES),
        "attempted": len(results),
        "independentlyRenewed": successful,
        "baselineProductCount": before,
        "candidateProductCount": len(catalog.get("products") or []),
        "bothCandidatesEligibleForSnapshotReview": successful == len(PRIORITIES),
        "verifiedForPublication": False,
        "results": results,
    }
    return report, catalog, audits


def write_stage(*, root=ROOT):
    report, catalog, audits = stage_pair(root=root)
    target = root / "reports/camp-recovery-pair-candidate.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    if report["bothCandidatesEligibleForSnapshotReview"]:
        STAGED_CATALOG.write_text(json.dumps(catalog, ensure_ascii=False,
                                             indent=2) + "\n", encoding="utf-8")
        STAGED_AUDITS.write_text(json.dumps(audits, ensure_ascii=False,
                                            indent=2) + "\n", encoding="utf-8")
    print("CAMP_RECOVERY_PAIR", json.dumps(report, ensure_ascii=False))
    return report["bothCandidatesEligibleForSnapshotReview"]


if __name__ == "__main__":
    raise SystemExit(0 if write_stage() else 2)
