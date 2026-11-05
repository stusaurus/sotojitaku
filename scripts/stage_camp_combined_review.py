"""Combine two or three *independently* audited, six-SKU batches in one isolated runner.

This is a temporary CI experiment, NEVER a catalog publication. Each batch
has its own six-call ceiling; upstream 429/Worker outages stop all remaining
calls. Only products with NEW official Rakuten exact-item evidence plus NEW
original merchant fixed-SKU, price, inventory and purchase proof can enter
the temporary candidate. Original public data files are not modified.

Previously produced 13-item and 14-item runner snapshots cannot simply be
concatenated: this command rechecks the exact sellers in the same observation
window before running the unchanged full recommendation QA.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from acquire import ROOT
import stage_camp_coverage_round as coverage

FIRST = "family"
SECOND = "recovery"
THIRD = "gap"
STAGED_CATALOG = Path("/tmp/camp-combined-review-products.json")
STAGED_AUDITS = Path("/tmp/camp-combined-review-audits.json")


def assemble(*, root=ROOT, stage=coverage.stage_round, now=None,
             include_gap=False):
    observed = now or datetime.now(timezone.utc)
    if observed.tzinfo is None:
        raise ValueError("observed_time_must_be_aware")
    observed = observed.astimezone(timezone.utc)
    rounds_to_check = (FIRST, SECOND, THIRD) if include_gap else (FIRST, SECOND)
    targets = [target for name in rounds_to_check for target in coverage.ROUNDS[name]]
    if len(targets) != len(set(targets)) or len(targets) > 18:
        raise ValueError("duplicate_or_unbounded_combined_targets")
    paths = {name: root / "data" / (name + ".json")
             for name in ("products", "audited-products", "equipment")}
    original = {key: path.read_bytes() for key, path in paths.items()}
    reports = []
    final_catalog = None
    final_audits = None
    with TemporaryDirectory(prefix="camp-review-") as td:
        isolated = Path(td)
        (isolated / "data").mkdir()
        for key, content in original.items():
            (isolated / "data" / (key + ".json")).write_bytes(content)
        for round_name in rounds_to_check:
            report, catalog, audits = stage(
                root=isolated, round_name=round_name, now=observed)
            reports.append(report)
            final_catalog, final_audits = catalog, audits
            if report["stoppedByUpstream"]:
                break
            # Both stages receive only the previous staged, independently
            # checked candidate; this temp directory is never committed.
            (isolated / "data/products.json").write_text(
                json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8")
            (isolated / "data/audited-products.json").write_text(
                json.dumps(audits, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8")

    if any(paths[key].read_bytes() != content
           for key, content in original.items()):
        raise AssertionError("published_data_changed_by_readonly_assembly")

    baseline = len(json.loads(original["products"])["products"])
    rows = [r for report in reports for r in report["results"]]
    completed = len(reports) == len(rounds_to_check) and not reports[-1]["stoppedByUpstream"]
    successful = sum(r["result"] == "renewed" for r in rows)
    # No supplier listing is automatically approved just because these
    # individual proofs are good: strict full-catalog recommendation QA runs
    # separately, and publication still needs explicit user approval.
    summary = {
        "schemaVersion": 1, "type": "combined_readonly_research_not_for_publication",
        "observedAt": observed.isoformat(),
        "maximumTotalApiRequests": 6 * len(rounds_to_check),
        "requestedRounds": list(rounds_to_check),
        "maximumApiRequestsPerRound": 6,
        "attempted": len(rows),
        "independentlyRenewed": successful,
        "baselineProductCount": baseline,
        "candidateProductCount": len(final_catalog.get("products") or []),
        "stoppedByUpstream": any(r["stoppedByUpstream"] for r in reports),
        "bothRoundsCompleted": completed if not include_gap else False,
        "allRequestedRoundsCompleted": completed,
        "verifiedForPublication": False,
        "rounds": reports,
    }
    return summary, final_catalog, final_audits


def write_stage(*, root=ROOT, stage=coverage.stage_round, now=None,
                candidate=STAGED_CATALOG, audits=STAGED_AUDITS,
                include_gap=False):
    report, products, audited = assemble(root=root, stage=stage, now=now,
                                        include_gap=include_gap)
    out = root / "reports/camp-combined-review.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8")
    print("CAMP_COMBINED_REVIEW", json.dumps(report, ensure_ascii=False))
    if not report["allRequestedRoundsCompleted"] or report["independentlyRenewed"] == 0:
        return False
    # The two files contain live exact-seller purchase URLs: only write them
    # to runner-local /tmp for immediate QA. Never upload them as artifacts.
    candidate.write_text(json.dumps(products, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    audits.write_text(json.dumps(audited, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    return True


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--include-gap", action="store_true",
                        help="add the third bounded six-SKU gap research batch")
    args = parser.parse_args()
    raise SystemExit(0 if write_stage(include_gap=args.include_gap) else 2)
