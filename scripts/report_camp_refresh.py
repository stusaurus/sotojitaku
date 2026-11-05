"""Read-only, credential-free CAMP catalog coverage and evidence-age report.

This artifact distinguishes a missing or expired *proof* from a proven
unavailable product. It does not refresh offers, alter timestamps, or publish.
"""
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRESHNESS = timedelta(days=7)


def _parse_aware(value):
    try:
        date = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError, OverflowError):
        return None
    return date.astimezone(timezone.utc) if date.tzinfo is not None else None


def _recent(value, observed):
    stamp = _parse_aware(value)
    return bool(stamp is not None and stamp <= observed
                and observed - stamp < FRESHNESS)


# Keep unrecognized upstream error text out of public diagnostic artifacts.
TRANSIENT_REASONS = frozenset({
    "seller_browser_fetch_failed", "seller_evidence_missing",
    "seller_host_evidence_circuit_open", "stale_sales_evidence_unavailable",
    "upstream_rate_limited", "upstream_api_unavailable",
    "worker_unavailable", "worker_fetch_failed", "api_request_failed",
})
INVALID_LISTING_REASONS = frozenset({
    "unavailable", "wrong_listing", "wrong_model", "wrong_variant",
    "price_mismatch", "stock_unavailable", "exact_item_not_found",
})


def _failure_bucket(reason):
    if reason in TRANSIENT_REASONS:
        return "acquisition_or_evidence_failure"
    if reason in INVALID_LISTING_REASONS:
        return "listing_rejected_or_not_found"
    return "unclassified_failure"


def build_report(catalog, audited_doc=None, equipment=None, *, observed_at=None):
    """Summarize evidence without ever inferring current stock/price.

    The legacy summary fields remain stable. Optional audit and equipment
    data enable category-level counts without listing models, URLs, or SKUs.
    """
    observed = observed_at or datetime.now(timezone.utc)
    if observed.tzinfo is None:
        raise ValueError("observed_time_must_be_aware")
    observed = observed.astimezone(timezone.utc)
    failures = catalog.get("itemFailures") or {}
    counts = Counter(str(reason) if str(reason) in (TRANSIENT_REASONS | INVALID_LISTING_REASONS) else "unclassified_failure" for reason in failures.values())
    failure_buckets = Counter(_failure_bucket(str(reason)) for reason in failures.values())
    items = [p for p in (catalog.get("products") or [])
             if isinstance(p, dict)]
    result = {
        "schemaVersion": 2,
        "runUpdatedAt": catalog.get("updatedAt"),
        "observedAt": observed.isoformat(),
        "status": catalog.get("status"),
        "verifiedProductCount": len(items),
        "recentlyVerifiedProductCount": sum(
            _recent(p.get("verifiedAt"), observed) for p in items),
        "failedCategories": sorted(set(catalog.get("failedCategories") or [])),
        "failureReasonCounts": dict(sorted(counts.items())),
        "failureClassCounts": dict(sorted(failure_buckets.items())),
        "failedAuditCount": len(failures),
        "interpretation": (
            "Missing or expired evidence is not proof of unavailability. "
            "No price, inventory, or seller identity is renewed by this report."
        ),
    }
    if audited_doc is None or equipment is None:
        return result

    categories = sorted({
        c.get("id") for c in equipment.get("categories", [])
        if isinstance(c, dict) and isinstance(c.get("id"), str) and c["id"]
    })
    audit_items = [a for a in (audited_doc.get("products") or [])
                   if isinstance(a, dict)]
    audit_count = Counter(a.get("category") for a in audit_items)
    list_count = Counter(p.get("category") for p in items)
    recent_count = Counter(p.get("category") for p in items
                           if _recent(p.get("verifiedAt"), observed))
    old_audits = Counter()
    invalid_audits = Counter()
    for audit in audit_items:
        category = audit.get("category")
        stamp = _parse_aware(audit.get("listingAuditedAt"))
        if stamp is None or stamp > observed:
            invalid_audits[category] += 1
        elif observed - stamp >= FRESHNESS:
            old_audits[category] += 1

    result["categoryEvidence"] = {
        category: {
            "historicalAuditCount": audit_count[category],
            "catalogEntryCount": list_count[category],
            "recentlyVerifiedEntryCount": recent_count[category],
            "historicalAuditsOlderThanSevenDays": old_audits[category],
            "undatedOrFutureHistoricalAudits": invalid_audits[category],
        }
        for category in categories
    }
    result["categoriesWithNoRecentEvidence"] = [
        category for category in categories if recent_count[category] == 0
    ]
    result["historicalAuditsOlderThanSevenDays"] = sum(old_audits.values())
    result["undatedOrFutureHistoricalAudits"] = sum(invalid_audits.values())
    return result


if __name__ == "__main__":
    catalog = json.loads((ROOT / "data/products.json").read_text(encoding="utf-8"))
    audits = json.loads((ROOT / "data/audited-products.json").read_text(encoding="utf-8"))
    equipment = json.loads((ROOT / "data/equipment.json").read_text(encoding="utf-8"))
    report = build_report(catalog, audits, equipment)
    dest = ROOT / "reports/camp-refresh-health.json"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print("CAMP_REFRESH_HEALTH", json.dumps(report, ensure_ascii=False, sort_keys=True))
