"""Read-only CAMP recovery research for the four still-failing real-catalog gates.

Reuse exact audited Rakuten Item API + original seller fixed-SKU proof. Never
write public data/products.json or audited-products.json. Each run is bounded
to at most six different previously audited seller listings and stops on
quota/Worker failure. Historical price, inventory and audit timestamps are
never used as fresh seller evidence.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from acquire import ROOT
from probe_camp_recovery_candidates import STOP_STATUSES
from refresh_verified_camp_offer import refresh_snapshot
from stage_camp_api_evidence import canonical_item_url

MAX_REQUESTS = 6
ROUNDS = {
    # Historical catalog candidates selected to address exact remaining
    # family-tent preference models, car-free solo portability, and family
    # cooler coverage. A historically audited model is NOT a live offer.
    "family": (
        ("tent", "2000038141"),  # 4.0kg solo two-person dome
        ("tent", "2000036439"),  # historical easy-pref family tent
        ("tent", "2000039087"),  # historical comfort-pref family tent
        ("tent", "2185614"),    # historical compact-pref family tent
        ("tent", "2000038429"),  # historical value-pref family tent
        ("cooler", "2238145"),  # 35L, family-capacity alternative
    ),
    # Separate, bounded verification batch to fill the other real QA gaps.
    # Two historic sleeping-bag variants are only candidates until BOTH live
    # exact official API and original seller fixed-SKU proofs pass.
    "recovery": (
        ("led_lantern", "2000038854"),
        ("burner", "ST-350"),
        ("table", "2205813"),
        ("table", "2238333"),
        ("sleeping_bag", "2000034772"),
        ("sleeping_bag", "2000038771"),
    ),
    # Separate later review. Not automatically run after the first batch:
    # the Worker must not receive an unbounded series of requests.
    "sleep": (
        ("sleeping_bag", "2000038771"),
        ("sleeping_bag", "2000034775"),
        ("sleeping_bag", "2000034777"),
        ("cooler", "2244060"),
        ("cooler", "2000037321"),
        ("tent", "2000038142"),
    ),
}
STAGED_CATALOG = Path("/tmp/camp-coverage-review-products.json")
STAGED_AUDITS = Path("/tmp/camp-coverage-review-audits.json")


def stage_round(*, root=ROOT, renew=refresh_snapshot, round_name="family",
                targets=None, now=None, api_fetch=None, browser_get=None):
    observed = now or datetime.now(timezone.utc)
    if observed.tzinfo is None:
        raise ValueError("observed_time_must_be_aware")
    observed = observed.astimezone(timezone.utc)
    selected = tuple(ROUNDS[round_name] if targets is None else targets)
    if not selected or len(selected) > MAX_REQUESTS or len(selected) != len(set(selected)):
        raise ValueError("duplicate_or_unbounded_research_targets")
    if any(target not in sum((list(group) for group in ROUNDS.values()), [])
           for target in selected):
        raise ValueError("unapproved_research_target")

    paths = {name: root / "data" / (name + ".json")
             for name in ("audited-products", "products", "equipment")}
    original = {key: path.read_bytes() for key, path in paths.items()}
    audits = json.loads(original["audited-products"])
    catalog = json.loads(original["products"])
    equipment = json.loads(original["equipment"])
    # Fail before ANY request if no precise historical seller can be audited.
    for category, model in selected:
        matched = [a for a in audits.get("products", [])
                   if a.get("category") == category and a.get("model") == model
                   and a.get("itemCode") and canonical_item_url(a.get("itemUrl"))]
        if len(matched) != 1:
            raise ValueError("historical_exact_seller_missing_or_duplicate")

    baseline = len(catalog.get("products") or [])
    rows = []
    for category, model in selected:
        audits, catalog, proof = renew(
            audits, catalog, equipment,
            target_category=category, target_model=model,
            now=observed, api_fetch=api_fetch, browser_get=browser_get,
            run_id=os.environ.get("GITHUB_RUN_ID", "unpublished_candidate"),
        )
        rows.append({
            "category": category, "model": model,
            "apiStatus": proof["apiStatus"], "sellerStatus": proof["sellerStatus"],
            "result": proof["result"],
            "publishedFreshnessChanged": proof["publishedFreshnessChanged"],
        })
        if proof["apiStatus"] in STOP_STATUSES:
            break

    # A consumer of this report must not mistake current stock/price/URL for
    # historically checked values or for a committed production catalog.
    if any(paths[key].read_bytes() != content for key, content in original.items()):
        raise AssertionError("public_catalog_mutated_during_research")
    successes = sum(row["result"] == "renewed" for row in rows)
    report = {
        "schemaVersion": 1, "type": "research_only_not_for_publication",
        "researchRound": round_name, "observedAt": observed.isoformat(),
        "maxApiRequests": MAX_REQUESTS, "attempted": len(rows),
        "independentlyRenewed": successes,
        "baselineProductCount": baseline,
        "candidateProductCount": len(catalog.get("products") or []),
        "stoppedByUpstream": bool(rows and rows[-1]["apiStatus"] in STOP_STATUSES),
        "verifiedForPublication": False, "results": rows,
    }
    return report, catalog, audits


def write_stage(*, root=ROOT, renew=refresh_snapshot, round_name="family",
                now=None, staged_catalog=STAGED_CATALOG, staged_audits=STAGED_AUDITS):
    report, catalog, audits = stage_round(
        root=root, renew=renew, round_name=round_name, now=now)
    path = root / "reports/camp-coverage-research.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    # Only positively, independently renewed candidates can be evaluated.
    # The temp files are never uploaded as artifacts or committed.
    if report["independentlyRenewed"]:
        staged_catalog.write_text(json.dumps(catalog, ensure_ascii=False,
                                             indent=2) + "\n", encoding="utf-8")
        staged_audits.write_text(json.dumps(audits, ensure_ascii=False,
                                            indent=2) + "\n", encoding="utf-8")
    print("CAMP_COVERAGE_RESEARCH", json.dumps(report, ensure_ascii=False))
    return report["independentlyRenewed"] > 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", choices=tuple(ROUNDS), default="family")
    args = parser.parse_args()
    raise SystemExit(0 if write_stage(round_name=args.round) else 2)
