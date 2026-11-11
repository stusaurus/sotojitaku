"""Recheck three additional historically audited CAMP seller offers, strictly.

The original nine-seller refresh remains unchanged. These three different
original seller SKUs are candidates, NOT preapproved inventory. Every addition
requires a NEW exact official Item API response and independent original seller
page/cart proof from the SAME run. Missing evidence never becomes a product.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from acquire import ROOT
import stage_camp_api_evidence as stage
from refresh_verified_camp_offer import TARGETS as PRIMARY_TARGETS, refresh_snapshot, recent_original_proof

# Maximum three extra shared-Worker calls per run across all six candidates.
# Originally audited merchants only; this allowlist is not authorization
# to publish stale offers.
CANDIDATES = (
    ("led_lantern", "2000038854"),
    ("burner", "ST-350"),
    ("tent", "2000039087"),
)
# These three extra historical merchant codes address real audited gaps:
# 4kg solo/no-car tent, four-seat family table, and four-person fire pit.
# They are NOT marked purchasable unless their *current* exact API and
# original-seller cart evidence both pass the existing strict gates.
PRIORITY_GAPS = (
    ("tent", "2000038141"),
    ("table", "2205813"),
    ("fire_pit", "ST-032RS"),
)
ALLOWED_TARGETS = CANDIDATES + PRIORITY_GAPS
MAX_EXTRA_API_CALLS = 3
REQUIRED_ORIGINAL_AUDIT = (
    "audited", "bodyConfirmed", "fixedVariant", "available", "priceAudit",
)


def refresh_extra(audits_doc, existing, equipment, *, primary_report,
                  api_fetch=None, browser_get=None, now=None, run_id="local",
                  targets=CANDIDATES, skip_recent=False):
    observed = now or datetime.now(timezone.utc)
    if observed.tzinfo is None:
        raise ValueError("observed_time_must_be_aware")
    observed = observed.astimezone(timezone.utc)
    if (len(targets) > len(ALLOWED_TARGETS) or len(set(targets)) != len(targets)
            or any(x not in ALLOWED_TARGETS or x in PRIMARY_TARGETS for x in targets)):
        raise ValueError("unknown_or_duplicate_extra_seller")
    if (not isinstance(primary_report, dict)
            or primary_report.get("type") != "automatic_original_seller_proof_batch"
            or type(primary_report.get("stoppedBySharedFailure")) is not bool):
        raise ValueError("missing_trusted_primary_refresh_report")

    results = []
    api_attempts = 0
    if not primary_report["stoppedBySharedFailure"]:
        for category, model in targets:
            audit = next((a for a in audits_doc.get("products", [])
                          if a.get("category") == category and a.get("model") == model), None)
            if (not audit or not audit.get("itemCode") or not audit.get("itemUrl")
                    or any(audit.get(key) is not True for key in REQUIRED_ORIGINAL_AUDIT)
                    or audit.get("condition") != "new"
                    or audit.get("quantityPerListing") != 1):
                results.append({"category": category, "model": model,
                                "apiStatus": "not_attempted", "sellerStatus": "not_attempted",
                                "result": "original_audit_incomplete",
                                "publishedFreshnessChanged": False})
                continue
            current = next((p for p in existing.get("products", [])
                            if p.get("category") == category and p.get("model") == model), None)
            if skip_recent and current and recent_original_proof(current, audit, observed):
                # Read-only. Does not modify verifiedAt, price, stock or SKU.
                results.append({"category": category, "model": model,
                                "attempted": 0, "apiStatus": "not_attempted_recent_proof",
                                "sellerStatus": "not_attempted",
                                "result": "previous_still_fresh",
                                "publishedFreshnessChanged": False})
                continue
            if api_attempts >= MAX_EXTRA_API_CALLS:
                results.append({"category": category, "model": model,
                                "attempted": 0, "apiStatus": "not_attempted_api_budget",
                                "sellerStatus": "not_attempted",
                                "result": "deferred_to_next_bounded_run",
                                "publishedFreshnessChanged": False})
                continue
            audits_doc, existing, report = refresh_snapshot(
                audits_doc, existing, equipment, api_fetch=api_fetch,
                browser_get=browser_get, now=observed, run_id=run_id,
                target_category=category, target_model=model)
            api_attempts += 1
            results.append(report)
            if report["apiStatus"] in stage.SHARED_FAILURE_STATUSES:
                break

    blocked = primary_report["stoppedBySharedFailure"]
    stop = next((r["apiStatus"] for r in results
                 if r["apiStatus"] in stage.SHARED_FAILURE_STATUSES), None)
    report = {
        "schemaVersion": 1,
        "type": "automatic_additional_original_seller_proof_batch",
        "maximumApiCalls": MAX_EXTRA_API_CALLS,
        "attempted": api_attempts,
        "skippedRecent": sum(r.get("apiStatus") == "not_attempted_recent_proof" for r in results),
        "deferredForBudget": sum(r.get("apiStatus") == "not_attempted_api_budget" for r in results),
        "skippedBecausePrimaryWorkerFailure": blocked,
        "stoppedBySharedFailure": bool(blocked or stop),
        "stopReason": primary_report.get("stopReason") if blocked else stop,
        "renewed": sum(r.get("publishedFreshnessChanged") is True for r in results),
        "verifiedCount": len(existing.get("products") or []),
        "results": results,
    }
    return audits_doc, existing, report


def main(root=ROOT):
    root = Path(root)
    primary = json.loads((root / "reports/camp-verified-offer-refresh.json").read_text(encoding="utf-8"))
    audits_path = root / "data/audited-products.json"
    products_path = root / "data/products.json"
    audits = json.loads(audits_path.read_text(encoding="utf-8"))
    catalog = json.loads(products_path.read_text(encoding="utf-8"))
    equipment = json.loads((root / "data/equipment.json").read_text(encoding="utf-8"))
    new_audits, new_catalog, report = refresh_extra(
        audits, catalog, equipment, primary_report=primary,
        run_id=os.environ.get("GITHUB_RUN_ID", "local"),
        targets=ALLOWED_TARGETS, skip_recent=True)
    # The report never includes newly observed prices, HTML, seller cookies or tokens.
    dest = root / "reports/camp-additional-seller-refresh.json"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for path, before, after in ((audits_path, audits, new_audits),
                                (products_path, catalog, new_catalog)):
        if before != after:
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(after, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            tmp.replace(path)
    print("CAMP_ADDITIONAL_SELLER_REFRESH", json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
