"""Bounded read-only probes for newly discovered CAMP exact merchant listing IDs.

Candidate seller item codes are RESEARCH CLAIMS copied from publicly visible
store listing identifiers, not existing audited merchant contracts. Only exact
official Rakuten API and independent ordinary seller-page SKU / price / stock
proof can establish a candidate. Manufacturer specs are reused for the same
model, but new merchant offers NEVER become a published product here.

The mont-bell original exact listing is checked for a sanitized failure reason;
an unsuccessful seller proof must never be interpreted as confirmed sold-out.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from acquire import ROOT
import probe_camp_recovery_candidates as existing
import stage_camp_api_evidence as stage

# Each alternate listing is a distinct seller URL publicly observed on
# 2026-11-05. None is trusted until live API + fixed SKU proof succeeds.
ALTERNATES = (
    ("led_lantern", "2218364",
     "alpen:7411106505",
     "https://item.rakuten.co.jp/alpen/7411106505/"),
    ("hot_sandwich_maker", "UG-3086",
     "captainstagstore:4560464283785",
     "https://item.rakuten.co.jp/captainstagstore/4560464283785/"),
    ("fire_pit", "2000031235",
     "naturum:2824592",
     "https://item.rakuten.co.jp/naturum/2824592/"),
)
# No alternate retailer for this old mont-bell model was independently
# established. Recheck only to learn why the original seller cannot pass.
ORIGINAL_SELLER_DIAGNOSTIC = ("mat", "1124667")
MAX_REQUESTS = len(ALTERNATES) + 1
STOP_STATUSES = frozenset(("rate_limited", "worker_unavailable"))
SAFE_REASONS = frozenset((
    "missing_sales_evidence", "wrong_listing", "unavailable",
    "price_mismatch", "inventory_unknown", "variable_listing",
    "selectable_listing", "unknown_model", "variant_unknown",
    "model_missing", "unparseable_seller_evidence",
))
RESULT = ROOT / "reports/camp-alternate-seller-research.json"


def _find_old(audits, category, model):
    matches = [p for p in audits.get("products", [])
               if p.get("category") == category and p.get("model") == model]
    if len(matches) != 1:
        raise ValueError("missing_or_ambiguous_model_audit")
    return matches[0]


def _alternate_audit(audit, new_code, new_url):
    # The caller's *original* manufacturer evidence stays unchanged, while
    # the different store identity remains a research claim only.
    canon = stage.canonical_item_url(new_url)
    store = canon.split("/")[3] if canon else None
    item = canon.split("/")[4] if canon else None
    if not store or not item or new_code != store + ":" + item:
        raise ValueError("seller_item_code_and_path_disagree")
    if (new_code == audit.get("itemCode")
            or canon == stage.canonical_item_url(audit.get("itemUrl"))):
        raise ValueError("not_a_distinct_seller_research_candidate")
    return {**audit, "itemCode": new_code, "itemUrl": canon}


def collect(*, root=ROOT, fetch=None, browser_get=None, observed_at=None,
            proposals=ALTERNATES, include_original=True):
    observed = observed_at or datetime.now(timezone.utc).isoformat()
    try:
        timestamp = datetime.fromisoformat(str(observed).replace("Z", "+00:00"))
        if timestamp.tzinfo is None:
            raise ValueError()
    except (TypeError, ValueError):
        raise ValueError("observed_time_must_be_aware")
    original_bytes = {name: (root / "data" / (name + ".json")).read_bytes()
                      for name in ("audited-products", "products", "equipment")}
    audits = json.loads(original_bytes["audited-products"])
    equipment = json.loads(original_bytes["equipment"])
    proposals = tuple(proposals)
    if len(proposals) > len(ALTERNATES) or len(proposals) != len(set(proposals)):
        raise ValueError("duplicate_or_excessive_merchant_probes")
    if any(proposal not in ALTERNATES for proposal in proposals):
        raise ValueError("unknown_merchant_candidate")
    # Validate ALL identities before sending ANY requests.
    targets = [
        (category, model,
         _alternate_audit(_find_old(audits, category, model), code, url),
         "alternate")
        for category, model, code, url in proposals
    ]
    if include_original:
        category, model = ORIGINAL_SELLER_DIAGNOSTIC
        old = _find_old(audits, category, model)
        if not old.get("itemCode") or not stage.canonical_item_url(old.get("itemUrl")):
            raise ValueError("original_merchant_audit_missing")
        targets.append((category, model, old, "original"))
    if len(targets) > MAX_REQUESTS:
        raise ValueError("over_query_budget")

    rows = []
    for category, model, candidate, kind in targets:
        live = stage.request_exact(candidate, fetch=fetch)
        status = stage.validate_candidate(candidate, live, equipment, observed)["status"]
        # Safe numeric HTTP diagnostics: distinguish a dead Worker endpoint,
        # upstream throttling and an unknown network failure without leaking
        # request URLs, seller identity tokens, raw response or inventory.
        worker_http = live.get("worker_status") if isinstance(live, dict) else None
        upstream_http = live.get("upstream_status") if isinstance(live, dict) else None
        worker_http = worker_http if type(worker_http) is int and 100 <= worker_http <= 599 else None
        upstream_http = upstream_http if type(upstream_http) is int and 100 <= upstream_http <= 599 else None
        row = {
            "category": category, "model": model, "sellerKind": kind,
            "apiStatus": status, "sellerStatus": "not_attempted",
            "sellerEvidenceReason": None,
            "workerHttpStatus": worker_http if status in STOP_STATUSES else None,
            "rakutenUpstreamHttpStatus": upstream_http if status in STOP_STATUSES else None,
            "independentSellerProof": False,
            "fitEvidenceComplete": False if model == "2000031235" else None,
            "verifiedForPublication": False,
        }
        if status == "api_confirmed_seller_variant_audit_required":
            proof = existing.verify_current_seller(
                candidate, live, equipment, observed, browser_get=browser_get)
            row["sellerStatus"] = proof.get("sellerStatus", "seller_unverified")
            reason = proof.get("sellerEvidenceReason")
            row["sellerEvidenceReason"] = reason if reason in SAFE_REASONS else None
            row["independentSellerProof"] = (
                row["sellerStatus"]
                == "independent_api_and_seller_proof_for_manual_review"
            )
        rows.append(row)
        if status in STOP_STATUSES:
            break
    if any((root / "data" / (n + ".json")).read_bytes() != v
           for n, v in original_bytes.items()):
        raise AssertionError("immutable_catalog_input_mutated")
    return {
        "schemaVersion": 1,
        "type": "alternate_merchant_research_only_not_for_publication",
        "observedAt": timestamp.astimezone(timezone.utc).isoformat(),
        "maxApiRequests": MAX_REQUESTS,
        "attempted": len(rows),
        "independentlyProvenForManualReview": sum(
            r["independentSellerProof"] for r in rows),
        "stoppedByUpstream": bool(rows and rows[-1]["apiStatus"] in STOP_STATUSES),
        "verifiedForPublication": False,
        "results": rows,
    }


def main(root=ROOT):
    result = collect(root=root)
    path = root / "reports/camp-alternate-seller-research.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print("CAMP_ALTERNATE_SELLER_RESEARCH",
          json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
