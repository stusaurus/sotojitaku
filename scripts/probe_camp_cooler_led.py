"""Read-only current seller evidence for one CAMP cooler and one LED lantern.

Use only historical exact merchant codes, no substitutes. Confirm official
item API before using an ordinary browser for original seller HTML.
"""
import json
from datetime import datetime, timezone
import time
from acquire import ROOT
from probe_camp_next_categories import probe_one
from probe_camp_seller_browser import read_seller_page_once

MAX_API_CALLS = 4
# Original audited listings only. Backup for each category is checked only
# when its primary original merchant listing cannot be verified.
TARGETS = (
    ("cooler", "2238149"),        # Coleman Ultimate Ice Cooler II 25L
    ("led_lantern", "2218364"),   # Coleman Quad Multi Panel Lantern plus
    ("cooler", "2238147"),        # Coleman Ultimate Ice Cooler II 15L
    ("led_lantern", "2000038854"), # Coleman Battery Guard LED 600
)
PASS = "independent_proof_complete_ready_for_review"

def original_seller_browser_with_one_retry(url, reader=None, pause=None):
    """Retry only a browser/network exception, not failed sales evidence.

    Ordinary Chrome page navigation only. Never bypass access controls,
    retry a rejected SKU, or make another official Rakuten API request.
    """
    reader = reader or read_seller_page_once
    pause = pause or time.sleep
    try:
        return reader(url)
    except Exception:
        pause(2)
        return reader(url)

def probe(*, root=ROOT, fetch=None, browse=None, now=None):
    audits = json.loads((root/"data/audited-products.json").read_text(encoding="utf-8"))["products"]
    equipment = json.loads((root/"data/equipment.json").read_text(encoding="utf-8"))
    observed = now or datetime.now(timezone.utc).isoformat()
    results, proven = [], set()
    for category, model in TARGETS[:MAX_API_CALLS]:
        if category in proven:
            continue
        row = next((a for a in audits if a.get("category")==category and a.get("model")==model), None)
        if not row or not row.get("itemCode") or not row.get("itemUrl"):
            results.append({"category":category,"model":model,"status":"missing_original_item_code",
                            "verifiedForPublication":False})
            continue
        result=probe_one(row,equipment,fetch=fetch,
                         browse=browse or original_seller_browser_with_one_retry,
                         now=observed)
        results.append(result)
        if result.get("status")==PASS:
            proven.add(category)
        if result.get("apiStatus")=="rate_limited":
            break
    return {
        "schemaVersion":1,"type":"research_only_not_for_publication",
        "observedAt":observed,"maxApiCalls":MAX_API_CALLS,
        "attempted":len(results),
        "stoppedBy429":bool(results and results[-1].get("apiStatus")=="rate_limited"),
        "provenCategories":sorted(proven),"results":results,
    }

if __name__ == "__main__":
    result=probe()
    path=ROOT/"reports/camp-cooler-led-proof.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CAMP_COOLER_LED_PROOF",json.dumps({
        "attempted":result["attempted"],
        "stoppedBy429":result["stoppedBy429"],
        "provenCategories":result["provenCategories"],
        "results":[{"category":r["category"],"model":r["model"],
                    "status":r["status"],"apiStatus":r.get("apiStatus"),
                    "sellerStatus":r.get("sellerStatus"),
                    "price":r.get("apiCurrentPrice")} for r in result["results"]],
    },ensure_ascii=False))
