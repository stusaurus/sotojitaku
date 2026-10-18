"""Research-only original seller proofs for CAMP mat and table categories.

Probe the audited mat and table first; a different historic mat is tried
only if the first cannot be independently verified. No product publication,
seller substitution, paid clicks, cart interaction or API rate-limit bypass.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone

from acquire import ROOT
from probe_camp_next_categories import probe_one

MAX_API_REQUESTS=3
TARGETS=(
    ("mat","2000036153"),       # Coleman high-peak single mat, cross-one
    ("table","2205816"),        # Coleman natural puzzle table 90, naturum-outdoor
    ("mat","2000038137"),       # only if initial mat fails exact proof
)

def probe(*, root=ROOT, fetch=None, browse=None, now=None):
    audits=json.loads((root/"data/audited-products.json").read_text(encoding="utf-8"))["products"]
    gear=json.loads((root/"data/equipment.json").read_text(encoding="utf-8"))
    observed=now or datetime.now(timezone.utc).isoformat()
    results=[]
    proven_categories=set()
    for category, model in TARGETS[:MAX_API_REQUESTS]:
        if category in proven_categories:
            continue
        audit=next((a for a in audits if a.get("category")==category and a.get("model")==model),None)
        if not audit or not audit.get("itemCode") or not audit.get("itemUrl"):
            results.append({"category":category,"model":model,"status":"missing_exact_audit",
                            "verifiedForPublication":False})
            continue
        row=probe_one(audit,gear,fetch=fetch,browse=browse,now=observed)
        results.append(row)
        if row.get("status")=="independent_proof_complete_ready_for_review":
            proven_categories.add(category)
        if row.get("apiStatus")=="rate_limited":
            break
    return {
        "schemaVersion":1, "type":"research_only_not_for_publication",
        "observedAt":observed, "maximumApiRequests":MAX_API_REQUESTS,
        "attempted":len(results),
        "stoppedBy429":bool(results and results[-1].get("apiStatus")=="rate_limited"),
        "provenCategories":sorted(proven_categories), "results":results,
    }

if __name__=="__main__":
    report=probe()
    output=ROOT/"reports/camp-mat-table-proof.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CAMP_MAT_TABLE_PROOF",json.dumps({
        "attempted":report["attempted"],"stoppedBy429":report["stoppedBy429"],
        "provenCategories":report["provenCategories"],
        "outcomes":[{"category":row["category"],"model":row["model"],
                     "status":row["status"],"apiStatus":row.get("apiStatus"),
                     "sellerStatus":row.get("sellerStatus"),
                     "apiPrice":row.get("apiCurrentPrice")} for row in report["results"]]
    },ensure_ascii=False))
