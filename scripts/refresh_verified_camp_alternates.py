"""Recheck three additional historically audited CAMP seller offers, strictly.

The original nine-seller refresh remains unchanged. These three different
original seller SKUs are candidates, NOT preapproved inventory. Every addition
requires a NEW exact official Item API response and independent original seller
page/cart proof from the SAME run. Missing evidence never becomes a product.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from acquire import ROOT
import stage_camp_api_evidence as stage
from refresh_verified_camp_offer import TARGETS as PRIMARY_TARGETS, refresh_snapshot, recent_original_proof, parse_time

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
# Historical, fixed-merchant audits only. These do NOT establish current
# inventory or make a product eligible for publication. All of them must pass
# the existing same-run official exact Item API + original seller/cart gates.
RECOVERY_GAPS = (
    ("burner", "ST-340"),
    ("table", "2238333"),
    ("sleeping_bag", "2000034772"),
    ("tent", "2000038429"),
    ("tent", "2185614"),
    ("tent", "2000036439"),
)
ALLOWED_TARGETS = CANDIDATES + PRIORITY_GAPS + RECOVERY_GAPS
MAX_EXTRA_API_CALLS = 3
REQUIRED_ORIGINAL_AUDIT = (
    "audited", "bodyConfirmed", "fixedVariant", "available", "priceAudit",
)

def prioritize_recovery_targets(catalog, observed):
    """Protect aging live proof, then rotate historical gap probes fairly.

    Only existing allowlisted fixed-seller audit targets are returned. A
    missing listing is a *probe*, never a recommendation or a publication
    approval. The shared per-run three-call cap remains in refresh_extra.
    """
    if observed.tzinfo is None:
        raise ValueError("observed_time_must_be_aware")
    observed = observed.astimezone(timezone.utc)
    current = {(p.get("category"), p.get("model")): p
               for p in (catalog.get("products") or []) if isinstance(p, dict)}
    renew = []
    for target in ALLOWED_TARGETS:
        existing = current.get(target)
        if existing is None:
            continue
        stamp = parse_time(existing.get("verifiedAt"))
        if stamp is None or stamp > observed or observed - stamp >= timedelta(days=5):
            renew.append(target)

    missing_gaps = [target for target in RECOVERY_GAPS if target not in current]
    if missing_gaps:
        # Vary the first missing candidate each day so a repeatedly missing
        # original SKU cannot monopolize all calls on every scheduled run.
        offset = observed.date().toordinal() % len(missing_gaps)
        missing_gaps = missing_gaps[offset:] + missing_gaps[:offset]
    # At most three extra Item API calls are available each day. With many
    # existing offers near their 7-day expiry, the previous renew-first order
    # could repeatedly consume all three calls and never probe a category
    # with ZERO live listings (notably a missing burner). Protect the first
    # two aging offers, then reserve the third attempt for an independently
    # audited fixed merchant in a currently empty category. The usual exact
    # API + original seller/cart gates still control publication; this only
    # changes probe order, not quota or eligibility. Rotate sellers so an
    # unavailable single SKU does not monopolize that reserved slot.
    live_categories = set()
    for offer in current.values():
        verified = parse_time(offer.get("verifiedAt"))
        if (verified is not None and verified <= observed
                and observed - verified <= timedelta(days=7)):
            live_categories.add(offer.get("category"))
    empty_category_probes = [target for target in ALLOWED_TARGETS
                            if target not in current
                            and target[0] not in live_categories]
    # A genuine live snapshot with NO burner must try a burner seller even
    # when fewer than three renewals are due. Otherwise the rotating tent
    # recovery pool can consume all three slots first, as happened in the
    # preceding merchant renewal report. Never infer stock from this order.
    # An entirely empty test/snapshot retains the fair cross-category order.
    missing_burner = bool(current) and "burner" not in live_categories
    base = (renew + missing_gaps + list(CANDIDATES)
            + list(PRIORITY_GAPS) + list(RECOVERY_GAPS))
    if missing_burner:
        protected = renew[:MAX_EXTRA_API_CALLS - 1]
        if not any(category == "burner" for category, _ in protected):
            choices = [target for target in ALLOWED_TARGETS
                       if target[0] == "burner" and target not in current]
            if not choices:
                # Existing expired sellers are already in renew; promote one.
                choices = [target for target in renew if target[0] == "burner"]
            if choices:
                gap = choices[observed.date().toordinal() % len(choices)]
                base = protected + [gap] + renew[len(protected):] + missing_gaps
                base += list(CANDIDATES) + list(PRIORITY_GAPS) + list(RECOVERY_GAPS)
    elif len(renew) >= MAX_EXTRA_API_CALLS and empty_category_probes:
        gap = empty_category_probes[
            observed.date().toordinal() % len(empty_category_probes)]
        base = (renew[:MAX_EXTRA_API_CALLS - 1] + [gap]
                + renew[MAX_EXTRA_API_CALLS - 1:] + missing_gaps
                + list(CANDIDATES) + list(PRIORITY_GAPS)
                + list(RECOVERY_GAPS))
    return tuple(dict.fromkeys(base))
    return tuple(dict.fromkeys(order))


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
        targets=prioritize_recovery_targets(
            catalog, datetime.now(timezone.utc)), skip_recent=True)
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
