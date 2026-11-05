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
from probe_camp_recovery_candidates import PRIORITIES, STOP_STATUSES

# Historically audited exact seller SKUs. Historical prices and stock are NOT
# proof of current offers; every one must pass the fresh independent API and
# ordinary seller-page checks in refresh_snapshot before entering a candidate.
SUPPLY_TARGETS = (
    ("burner", "ST-340"),
    ("burner", "ST-350"),
    ("table", "2205813"),  # Audited family-size 120 cm table (4 people)
    ("table", "2238333"),  # Independently audited 120 cm / 4-person table
)
from refresh_verified_camp_offer import refresh_snapshot

STAGED_CATALOG = Path("/tmp/camp-recovery-candidate-products.json")
STAGED_AUDITS = Path("/tmp/camp-recovery-candidate-audits.json")


def stage_pair(*, root=ROOT, renew=refresh_snapshot, now=None,
               api_fetch=None, browser_get=None, supply_targets=()):
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
    targets = tuple(PRIORITIES) + tuple(supply_targets)
    if len(targets) != len(set(targets)):
        raise ValueError("duplicate_recovery_target")
    # Prevent accidental exhaustive API scans (and avoid repeated 429 traffic).
    if len(targets) > 6:
        raise ValueError("recovery_api_budget_exceeded")
    for category, model in targets:
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
        # A confirmed 429 or Worker outage stops subsequent requests. Neither
        # can be reported as a sold-out seller or as freshly verified stock.
        if evidence["apiStatus"] in STOP_STATUSES:
            break
    successful = sum(row["result"] == "renewed" for row in results)
    core_success = all(any(
        row["category"] == category and row["model"] == model
        and row["result"] == "renewed"
        for row in results) for category, model in PRIORITIES)
    supply_success = sum(
        row["result"] == "renewed" and
        (row["category"], row["model"]) in supply_targets
        for row in results)
    # Even two successful independent proofs are a *review candidate* only.
    report = {
        "schemaVersion": 1,
        "type": "research_only_not_for_publication",
        "observedAt": observed.isoformat(),
        "maxApiRequests": len(targets),
        "attempted": len(results),
        "independentlyRenewed": successful,
        "supplyTargets": len(supply_targets),
        "supplyIndependentlyRenewed": supply_success,
        "stoppedByUpstream": bool(results and results[-1]["apiStatus"] in STOP_STATUSES),
        "baselineProductCount": before,
        "candidateProductCount": len(catalog.get("products") or []),
        "bothCandidatesEligibleForSnapshotReview": core_success,
        "allRequestedTargetsRenewed": successful == len(targets),
        "verifiedForPublication": False,
        "results": results,
    }
    return report, catalog, audits


def write_stage(*, root=ROOT, renew=refresh_snapshot, now=None,
                staged_catalog=STAGED_CATALOG, staged_audits=STAGED_AUDITS,
                supply_targets=SUPPLY_TARGETS):
    report, catalog, audits = stage_pair(
        root=root, renew=renew, now=now, supply_targets=supply_targets)
    target = root / "reports/camp-recovery-pair-candidate.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    if report["bothCandidatesEligibleForSnapshotReview"]:
        staged_catalog.write_text(json.dumps(catalog, ensure_ascii=False,
                                             indent=2) + "\n", encoding="utf-8")
        staged_audits.write_text(json.dumps(audits, ensure_ascii=False,
                                            indent=2) + "\n", encoding="utf-8")
    print("CAMP_RECOVERY_PAIR", json.dumps(report, ensure_ascii=False))
    return report["bothCandidatesEligibleForSnapshotReview"]


if __name__ == "__main__":
    raise SystemExit(0 if write_stage() else 2)
