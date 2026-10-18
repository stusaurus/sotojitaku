"""One-shot two-listing strict recheck after both original seller pages loaded in Chrome.

No new merchant, no different SKU, no publication. API and seller HTML must
both pass the exact previously audited identity/stock/fixed variant rules.
"""
import json
from datetime import datetime, timezone
from acquire import ROOT
from probe_camp_next_categories import probe_one
from probe_camp_cooler_led import original_seller_browser_with_one_retry

TARGETS=(("hot_sandwich_maker","1709435"),("hot_sandwich_maker","UG-3086"))
MAX_API_CALLS=2
SUCCESS="independent_proof_complete_ready_for_review"

def probe(*,root=ROOT,fetch=None,browse=None,now=None):
    audited=json.loads((root/"data/audited-products.json").read_text(encoding="utf-8"))["products"]
    gear=json.loads((root/"data/equipment.json").read_text(encoding="utf-8"))
    time=now or datetime.now(timezone.utc).isoformat()
    results=[]
    for category,model in TARGETS[:MAX_API_CALLS]:
        a=next((x for x in audited if x.get("category")==category and x.get("model")==model),None)
        if not a or not a.get("itemCode") or not a.get("itemUrl"):
            results.append({"category":category,"model":model,"status":"exact_original_audit_missing","verifiedForPublication":False})
            continue
        r=probe_one(a,gear,fetch=fetch,browse=browse or original_seller_browser_with_one_retry,now=time)
        results.append(r)
        if r["status"]==SUCCESS or r.get("apiStatus")=="rate_limited":
            break
    return {"schemaVersion":1,"type":"research_only_not_for_publication",
            "observedAt":time,"maxApiCalls":MAX_API_CALLS,"attempted":len(results),
            "stoppedBy429":bool(results and results[-1].get("apiStatus")=="rate_limited"),
            "recovered":bool(results and results[-1]["status"]==SUCCESS),"results":results}

if __name__=="__main__":
    result=probe()
    path=ROOT/"reports/camp-sandwich-exact-reproof.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CAMP_SANDWICH_REPROOF",json.dumps({
        "attempted":result["attempted"],"recovered":result["recovered"],
        "stoppedBy429":result["stoppedBy429"],
        "outcomes":[{"model":r["model"],"status":r["status"],
            "apiStatus":r.get("apiStatus"),"price":r.get("apiCurrentPrice")}
            for r in result["results"]]
    },ensure_ascii=False))
