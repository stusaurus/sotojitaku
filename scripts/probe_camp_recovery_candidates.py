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

PRIORITIES = (
    ("led_lantern", "2000038854"),  # Alternate to the 2218364 listing not found.
    ("tent", "2206748"),             # Family-oriented two-room tent; seller proof needed.
)
MAX_REQUESTS = 2
STOP_STATUSES = frozenset(("rate_limited", "worker_unavailable"))


def collect(*, root=ROOT, fetch=None, observed_at=None):
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
        results.append({
            "category": category, "model": model, "status": status,
            "verifiedForPublication": False,
            "nextAction": (
                "Independent current seller page SKU/price/inventory proof required"
                if status == "api_confirmed_seller_variant_audit_required"
                else "Do not publish; investigate the exact identified status"
            ),
        })
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
    report = collect()
    dest = ROOT / "reports/camp-missing-categories-research.json"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print("CAMP_MISSING_CATEGORY_RESEARCH", json.dumps({
        "apiRequests": report["apiRequests"],
        "statuses": [
            (result["category"], result["status"]) for result in report["results"]
        ],
        "verifiedForPublication": False,
    }, ensure_ascii=False))
