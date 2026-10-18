"""Probe the last 3 CAMP categories against only their original audited sellers.

Research-only. Every target has an old merchant code and original item URL.
At most six Item API requests; stop on first Rakuten 429. An ordinary Chrome
seller fetch is made only after an exact API match passes every required gate.
"""
import json
from datetime import datetime, timezone
from acquire import ROOT
from probe_camp_next_categories import probe_one
from probe_camp_cooler_led import original_seller_browser_with_one_retry

MAX_API_CALLS=6
TARGETS=(
    ("burner","ST-340"),                 # SOTO Range, passageshop
    ("fire_pit","2000037404"),           # Coleman Fire Disk Solo, kanedestore
    ("hot_sandwich_maker","1709435"),    # Coleman Cooker, sorabostore
    ("burner","ST-350"),                 # SOTO TriTrail, cheeky
    ("fire_pit","ST-032RS"),             # Snow Peak fire pit L, naturum-outdoor
    ("hot_sandwich_maker","UG-3086"),    # Captain Stag flat toaster, lb77
)
PASS="independent_proof_complete_ready_for_review"

def probe(*,root=ROOT,fetch=None,browse=None,now=None):
    audits=json.loads((root/"data/audited-products.json").read_text(encoding="utf-8"))["products"]
    equipment=json.loads((root/"data/equipment.json").read_text(encoding="utf-8"))
    observed=now or datetime.now(timezone.utc).isoformat()
    results,proven=[],set()
    for category,model in TARGETS[:MAX_API_CALLS]:
        if category in proven:
            continue
        a=next((x for x in audits if x.get("category")==category and x.get("model")==model),None)
        if not a or not a.get("itemCode") or not a.get("itemUrl"):
            results.append({"category":category,"model":model,"status":"missing_original_item_code",
                            "verifiedForPublication":False})
            continue
        result=probe_one(a,equipment,fetch=fetch,
                         browse=browse or original_seller_browser_with_one_retry,
                         now=observed)
        results.append(result)
        if result.get("status")==PASS:
            proven.add(category)
        if result.get("apiStatus")=="rate_limited":
            break
    return {
        "schemaVersion":1,"type":"research_only_not_for_publication",
        "observedAt":observed,"maxApiCalls":MAX_API_CALLS,"attempted":len(results),
        "stoppedBy429":bool(results and results[-1].get("apiStatus")=="rate_limited"),
        "provenCategories":sorted(proven),"results":results,
    }

if __name__=="__main__":
    report=probe()
    dest=ROOT/"reports/camp-final-three-evidence.json"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CAMP_FINAL_THREE_PROOF",json.dumps({
        "attempted":report["attempted"],
        "stoppedBy429":report["stoppedBy429"],
        "provenCategories":report["provenCategories"],
        "outcomes":[{"category":x["category"],"model":x["model"],
                     "status":x["status"],"apiStatus":x.get("apiStatus"),
                     "sellerStatus":x.get("sellerStatus"),"price":x.get("apiCurrentPrice")}
                    for x in report["results"]]
    },ensure_ascii=False))
