"""Renew one independently audited CAMP offer without pretending an API check proves a fixed SKU.

One official exact-item API request, followed (only if the API is eligible)
by one ordinary Chromium visit to the *same seller*. All existing product
identity, cart-variant, stock, shipping and price gates stay strict. This
script may refresh the one proven SKU or retire it; it never auto-approves
another historical product or makes stale evidence look fresh.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from acquire import ROOT
import refresh_worker as worker
import stage_camp_api_evidence as stage
import probe_camp_seller_browser as seller

TARGET_CATEGORY = "sleeping_bag"
TARGET_MODEL = "2000034774"
# Independently proven in GitHub Actions #39042240199 and #39048471797.
# No new seller or SKU may enter the renewal loop without a strict audit.
TARGETS = (
    ("sleeping_bag", "2000034774"),
    ("tent", "2206745"),
    ("chair", "2190857"),
)
TTL = timedelta(days=7)
ADVERSE_API_STATUSES = {
    "exact_item_not_found", "wrong_item_or_affiliate_url",
    "changed_item_code_needs_manual_audit", "wrong_model_or_accessory",
    "availability_unverified", "tax_inclusion_unverified",
    "postage_inclusion_unverified", "price_unverified",
    "purchasable_range_unverified", "variable_purchasable_price",
    "image_unverified", "historical_audit_incomplete",
    "quantity_condition_unverified", "untrusted_lookup_method",
}
ADVERSE_SELLER_REASONS = {
    "wrong_listing", "unavailable", "price_mismatch",
    "inventory_unknown", "variable_listing", "selectable_listing",
    "unknown_model", "variant_unknown", "model_missing",
}

def parse_time(text):
    try:
        value = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
        if value.tzinfo is None:
            return None
        return value.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None

def valid_existing(product, observed):
    date = parse_time(product.get("verifiedAt"))
    return bool(date and date <= observed and observed - date < TTL)

def eligible_existing(product, audit):
    return (
        product.get("category") == audit["category"]
        and product.get("model") == audit["model"]
        and product.get("itemCode") == audit["itemCode"]
        and product.get("itemUrl") == audit["itemUrl"]
    )

def refresh_snapshot(audits_doc, existing, equipment, *, api_fetch=None, browser_get=None,
                     now=None, run_id="local",
                     target_category=target_category, target_model=target_model):
    observed = now or datetime.now(timezone.utc)
    if observed.tzinfo is None:
        raise ValueError("observed_time_must_be_aware")
    observed = observed.astimezone(timezone.utc)
    audited = audits_doc["products"]
    target = next((a for a in audited if a.get("category") == target_category
                   and a.get("model") == target_model), None)
    if not target or not target.get("itemCode") or not target.get("itemUrl"):
        raise ValueError("original_target_missing")
    # Keep other independently verified products only while *their own*
    # previous seller evidence is fresh; never change their timestamps.
    prior = [p for p in existing.get("products", [])
             if valid_existing(p, observed)]
    previous_target = next((p for p in prior if eligible_existing(p, target)), None)
    other = [p for p in prior if not (p.get("category") == target_category
             and p.get("model") == target_model)]

    api = stage.request_exact(target, fetch=api_fetch)
    api_status = stage.validate_candidate(target, api, equipment, observed.isoformat())["status"]
    reason = api_status
    seller_status = "not_attempted"
    replacement = None

    if api_status == "api_confirmed_seller_variant_audit_required":
        browser = browser_get or seller.read_seller_page_once
        try:
            visited_url, html = browser(target["itemUrl"])
        except Exception:
            seller_status = "seller_browser_fetch_failed"
        else:
            proof = seller.seller_audit_result(
                target, equipment, api, visited_url, html, observed.isoformat()
            )
            seller_status = proof["status"]
            if seller_status == "independent_seller_and_api_evidence_review_required":
                # This final check binds the current page's itemId to the
                # original audited merchant code, not just its model/URL.
                code = target["itemCode"].split(":", 1)[1]
                if not code.isdigit():
                    seller_status = "seller_item_id_not_numeric"
                else:
                    try:
                        worker.parse_listing(html, target["model"], api["price"], int(code))
                    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                        seller_status = "seller_item_id_mismatch"
                    else:
                        affiliate = api["affiliate_url"]
                        if stage.affiliate_destination(affiliate) != target["itemUrl"]:
                            seller_status = "affiliate_identity_mismatch"
                        else:
                            stamp = observed.isoformat()
                            # Existing safety-certified manufacturer specs and
                            # consumer fit remain untouched; current store data
                            # comes ONLY from today's two independent proofs.
                            new_audit = {
                                **target, "listingAuditedAt": stamp,
                                "listingAudit": (
                                    "Verified by the original merchant's fixed SKU, inventory and price "
                                    "plus exact official Rakuten Item API; "
                                    "GitHub Actions run " + str(run_id)
                                ),
                            }
                            replacement = {
                                **new_audit, "price": api["price"],
                                "affiliateUrl": affiliate, "image": api["image"],
                                "reviewCount": None, "reviewAverage": None,
                                "verifiedAt": stamp, "shipping": "included",
                                "verificationMode": "sales_page_and_official_item_api",
                            }
                            # Rebuild audits only after a successful proof.
                            audits_doc = {**audits_doc, "products": [
                                new_audit if a is target else a for a in audited
                            ]}
                            reason = "renewed_exact_original_seller"
    # On a definite change (out of stock, mismatched URL, tax, variant, etc),
    # immediately retire the offer even if its old verifiedAt was not yet
    # seven days old. For temporary API outages or a blocked seller page,
    # leave the last *still fresh* offer until its normal seven-day expiry.
    seller_reason = proof.get("evidenceReason") if "proof" in locals() else None
    adverse = api_status in ADVERSE_API_STATUSES or (
        seller_status == "seller_page_redirect_or_identity_mismatch"
        or seller_reason in ADVERSE_SELLER_REASONS
        or seller_status in ("seller_item_id_mismatch", "affiliate_identity_mismatch",
                             "seller_item_id_not_numeric")
    )
    target_to_keep = replacement or (previous_target if not adverse else None)
    items = other + ([target_to_keep] if target_to_keep else [])
    categories = set(c["id"] for c in equipment.get("categories", []))
    covered = {p["category"] for p in items}
    missed = sorted(categories - covered)

    failures = dict(existing.get("itemFailures") or {})
    marker = f"{target_category}:{target_model}"
    if replacement:
        failures.pop(marker, None)
    else:
        failures[marker] = reason if reason != "api_confirmed_seller_variant_audit_required" else seller_status
    statuses = existing.get("failureReasons") or {}
    reason_by_category = {
        c: (failures[marker] if c == target_category else
            statuses.get(c, "fresh_seller_evidence_missing"))
        for c in missed
    }
    data_changed = replacement is not None or items != existing.get("products", [])
    refreshed = {
        **existing,
        "products": items, "status": "partial_error" if missed else "ok",
        "failedCategories": missed, "failureReasons": reason_by_category,
        "itemFailures": failures,
        "updatedAt": observed.isoformat() if data_changed else existing.get("updatedAt"),
    }
    report = {
        "schemaVersion": 1, "model": target_model,
        "type": "automatic_original_seller_proof",
        "attempted": 1, "apiStatus": api_status, "sellerStatus": seller_status,
        "result": "renewed" if replacement else "retired" if adverse or not previous_target else "previous_still_fresh",
        "verifiedCount": len(items), "sellerPageRequested": seller_status != "not_attempted",
        "observedAt": observed.isoformat(), "publishedFreshnessChanged": replacement is not None,
    }
    return audits_doc, refreshed, report

def refresh_verified_offers(audits_doc, existing, equipment, *,
                            api_fetch=None, browser_get=None, now=None, run_id="local"):
    """Bounded three-SKU renewal; a confirmed 429 stops further API requests.

    The first check also removes expired OTHER SKUs from the snapshot,
    even when the subsequent requests are skipped for quota protection.
    """
    observed = now or datetime.now(timezone.utc)
    results = []
    limit = len(TARGETS)
    for category, model in TARGETS[:limit]:
        audits_doc, existing, result = refresh_snapshot(
            audits_doc, existing, equipment,
            api_fetch=api_fetch, browser_get=browser_get, now=observed,
            run_id=run_id, target_category=category, target_model=model,
        )
        results.append(result)
        if result["apiStatus"] == "rate_limited":
            break
    return audits_doc, existing, {
        "schemaVersion": 1,
        "type": "automatic_original_seller_proof_batch",
        "attempted": len(results), "maximumApiCalls": limit,
        "stoppedByRateLimit": bool(results and results[-1]["apiStatus"] == "rate_limited"),
        "verifiedCount": len(existing.get("products") or []),
        "results": results,
    }

def main(root=ROOT):
    audits = json.loads((root / "data/audited-products.json").read_text(encoding="utf-8"))
    catalog = json.loads((root / "data/products.json").read_text(encoding="utf-8"))
    equipment = json.loads((root / "data/equipment.json").read_text(encoding="utf-8"))
    audits_new, catalog_new, report = refresh_verified_offers(
        audits, catalog, equipment, run_id=os.environ.get("GITHUB_RUN_ID", "local")
    )
    report_path = root / "reports/camp-verified-offer-refresh.json"
    report_path.parent.mkdir(exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n",encoding="utf-8")
    # Atomic file replacement, never speculative stamps on API failure.
    for path, value in ((root/"data/audited-products.json",audits_new),
                        (root/"data/products.json",catalog_new)):
        old = json.loads(path.read_text(encoding="utf-8"))
        if old != value:
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n",encoding="utf-8")
            tmp.replace(path)
    print("CAMP_VERIFIED_OFFER_REFRESH", json.dumps(report, ensure_ascii=False))

if __name__ == "__main__":
    main()
