"""Read-only official Item API research for two known CAMP coverage gaps.

Only pre-audited, exact seller item codes are sampled. Success here is NOT a
sale, current stock confirmation, seller variant audit, or publication approval.
The shared Rakuten Worker receives at most two calls; a quota/outage stops early.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from acquire import ROOT
import stage_camp_api_evidence as stage
import probe_camp_seller_browser as seller
import refresh_worker as worker

PRIORITIES = (
    ("led_lantern", "2000038854"),  # Alternate to the 2218364 listing not found.
    ("tent", "2206748"),             # Family-oriented two-room tent; seller proof needed.
)
MAX_REQUESTS = 2
# Malformed shared responses are a transport/evidence failure, not proof that
# one seller is unavailable. The coverage rounds reuse this stop policy.
STOP_STATUSES = frozenset(("rate_limited", "worker_unavailable", "invalid_response"))


def verify_current_seller(audit, live, equipment, observed, browser_get=None):
    """Independent ordinary browser evidence; never upgrades published state."""
    getter = browser_get or seller.read_seller_page_once
    try:
        visited_url, html = getter(audit["itemUrl"])
    except Exception:
        return {"sellerStatus": "seller_browser_fetch_failed"}
    proof = seller.seller_audit_result(
        audit, equipment, live, visited_url, html, observed)
    status = proof["status"]
    if status != "independent_seller_and_api_evidence_review_required":
        return {"sellerStatus": status,
                "sellerEvidenceReason": proof.get("evidenceReason")}
    # Bind a current single, selectable-free SKU to the original itemCode.
    code = str(audit.get("itemCode", "")).split(":", 1)[-1]
    if not code.isdigit():
        return {"sellerStatus": "seller_item_id_unverifiable"}
    try:
        worker.parse_listing(html, audit["model"], live["price"], int(code))
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return {"sellerStatus": "seller_sku_or_item_id_unverified"}
    if stage.affiliate_destination(live.get("affiliate_url")) != audit["itemUrl"]:
        return {"sellerStatus": "affiliate_identity_mismatch"}
    return {"sellerStatus": "independent_api_and_seller_proof_for_manual_review"}


def collect(*, root=ROOT, fetch=None, observed_at=None, check_sellers=False,
            browser_get=None):
    observed = observed_at or datetime.now(timezone.utc).isoformat()
    audits = json.loads((root / "data/audited-products.json").read_text(encoding="utf-8"))
    equipment = json.loads((root / "data/equipment.json").read_text(encoding="utf-8"))
    snapshot = json.loads((root / "data/products.json").read_text(encoding="utf-8"))
    existing = {(p.get("category"), p.get("model"))
                for p in (snapshot.get("products") or []) if isinstance(p, dict)}
    results = []
    count = 0
    for category, model in PRIORITIES:
        if (category, model) in existing:
            results.append({
                "category": category, "model": model, "status": "already_in_catalog",
                "verifiedForPublication": False,
                "nextAction": "Use the separate current seller evidence and freshness checks",
            })
            continue
        audit = next((a for a in audits.get("products", [])
                      if a.get("category") == category and a.get("model") == model
                      and isinstance(a.get("itemCode"), str) and a.get("itemCode")
                      and stage.canonical_item_url(a.get("itemUrl"))),
                     None)
        if not audit:
            results.append({
                "category": category, "model": model,
                "status": "audited_exact_item_missing",
                "verifiedForPublication": False,
                "nextAction": "Manual exact seller identity review",
            })
            continue
        if count >= MAX_REQUESTS:
            raise AssertionError("over_query_budget")
        live = stage.request_exact(audit, fetch=fetch)
        count += 1
        verdict = stage.validate_candidate(audit, live, equipment, observed)
        status = verdict["status"]
        review = {
            "category": category, "model": model, "status": status,
            "verifiedForPublication": False,
            "nextAction": (
                "Independent current seller page SKU/price/inventory proof required"
                if status == "api_confirmed_seller_variant_audit_required"
                else "Do not publish; investigate the exact identified status"
            ),
        }
        if check_sellers and status == "api_confirmed_seller_variant_audit_required":
            review.update(verify_current_seller(
                audit, live, equipment, observed, browser_get=browser_get))
            review["nextAction"] = (
                "Manual source, compatibility, freshness and overall catalog review"
                if review["sellerStatus"] == "independent_api_and_seller_proof_for_manual_review"
                else "Do not publish; investigate seller-page proof status"
            )
        results.append(review)
        if status in STOP_STATUSES:
            break
    return {
        "schemaVersion": 1,
        "type": "research_only_not_for_publication",
        "observedAt": observed,
        "maxApiRequests": MAX_REQUESTS,
        "apiRequests": count,
        "stoppedByUpstream": bool(results and results[-1]["status"] in STOP_STATUSES),
        "results": results,
    }


if __name__ == "__main__":
    report = collect(check_sellers=True)
    dest = ROOT / "reports/camp-missing-categories-research.json"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print("CAMP_MISSING_CATEGORY_RESEARCH", json.dumps({
        "apiRequests": report["apiRequests"],
        "statuses": [
            (result["category"], result["status"], result.get("sellerStatus"))
            for result in report["results"]
        ],
        "verifiedForPublication": False,
    }, ensure_ascii=False))
