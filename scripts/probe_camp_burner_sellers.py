"""One-time audited-model requalification for three explicit SOTO ST-340 sellers.

Proof only; exact original manufacturer model, browser-derived merchant itemId,
one matching Rakuten Item API call, postage/tax/price/stock/fixed SKU gates.
The previous Passage Shop historical merchant code was unavailable. Never
publish a replacement seller automatically.
"""
import json
from datetime import datetime,timezone
from acquire import ROOT
from probe_camp_new_merchant import probe_one as verify_new_seller

CANDIDATES=(
 "https://item.rakuten.co.jp/e-kurashi/38314/",
 "https://item.rakuten.co.jp/naturum/3304081/",
 "https://item.rakuten.co.jp/beautyfive/sr4953571001128/",
)
CATEGORY="burner"
MODEL="ST-340"
MAX_API_CALLS=3
MAX_SELLER_CANDIDATES=3
PASS="new_seller_independent_proof_ready_for_manual_audit"

def run(*,root=ROOT,fetch=None,browse=None,now=None):
    audits=json.loads((root/"data/audited-products.json").read_text(encoding="utf-8"))["products"]
    gear=json.loads((root/"data/equipment.json").read_text(encoding="utf-8"))
    original=next((x for x in audits if x.get("category")==CATEGORY and x.get("model")==MODEL),None)
    if not original:
        raise ValueError("historical_manufacturer_audit_missing")
    stamp=now or datetime.now(timezone.utc).isoformat()
    results=[];api_calls=0
    for url in CANDIDATES[:MAX_SELLER_CANDIDATES]:
        result=verify_new_seller(original,url,gear,fetch=fetch,browse=browse,observed=stamp)
        results.append(result)
        api_calls+=int(result.get("officialApiAttempted",False))
        if result.get("status")==PASS or result.get("apiStatus")=="rate_limited" or api_calls>=MAX_API_CALLS:
            break
    return {
        "schemaVersion":1,"type":"research_only_new_seller_not_for_publication",
        "observedAt":stamp,"maxApiCalls":MAX_API_CALLS,
        "attemptedSellerCandidates":len(results),"actualApiCalls":api_calls,
        "stoppedBy429":bool(results and results[-1].get("apiStatus")=="rate_limited"),
        "proofAvailable":bool(results and results[-1].get("status")==PASS),
        "results":results,
    }

if __name__=="__main__":
    evidence=run()
    path=ROOT/"reports/camp-burner-new-seller-proof.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CAMP_BURNER_SELLER_PROOF",json.dumps({
        "apiCalls":evidence["actualApiCalls"],"sellerCandidates":evidence["attemptedSellerCandidates"],
        "proofAvailable":evidence["proofAvailable"],"stoppedBy429":evidence["stoppedBy429"],
        "outcomes":[{"status":r["status"],"apiStatus":r.get("apiStatus"),
                     "price":r.get("currentVerifiedApiPrice"),"model":r["model"]}
                     for r in evidence["results"]]
    },ensure_ascii=False))
