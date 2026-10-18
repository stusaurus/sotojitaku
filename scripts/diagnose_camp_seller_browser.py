"""Read-only Chrome evidence diagnostics for one proven and two blocked sellers.

This does not call the Rakuten API, click affiliate links or modify catalogs.
It never records seller HTML, credentials, full network errors or cookies.
"""
import json
from datetime import datetime, timezone
from urllib.parse import urlparse
from acquire import ROOT

TARGETS=(("sleeping_bag","2000034774"),("cooler","2238149"),("led_lantern","2218364"))
MAX_PAGES=3
def safe_diagnosis(category,model,url,*,browser=None):
    if browser is None:
        browser=read_with_one_chrome_navigation
    try:
        outcome=browser(url,model)
    except Exception as err:
        return {"category":category,"model":model,
                "status":"browser_exception","exceptionClass":type(err).__name__,
                "sellerEvidencePresent":False}
    output={"category":category,"model":model,
            "status":str(outcome.get("status") or "unknown")[:48],
            "exceptionClass":str(outcome.get("exceptionClass") or "")[:48],
            "sellerEvidencePresent":outcome.get("sellerEvidencePresent") is True,
            "sellerModelPresent":outcome.get("sellerModelPresent") is True,
            "sameOriginalUrl":outcome.get("sameOriginalUrl") is True,
            "httpStatus":outcome.get("httpStatus") if type(outcome.get("httpStatus")) is int else None,
            "htmlLengthBand":outcome.get("htmlLengthBand") if outcome.get("htmlLengthBand") in
                ("empty","tiny","small","normal") else "unknown"}
    return output

def read_with_one_chrome_navigation(url,model):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True,channel="chrome")
        try:
            page=browser.new_page(viewport={"width":1200,"height":800},locale="ja-JP")
            err_kind=""
            response=None
            try:
                response=page.goto(url,wait_until="domcontentloaded",timeout=19000)
            except Exception as err:
                err_kind=type(err).__name__
            try:
                html=page.content()
            except Exception:
                html=""
            # Check exact original URL but do not leak the final visited URL.
            from stage_camp_api_evidence import canonical_item_url
            same=canonical_item_url(page.url)==canonical_item_url(url)
            length=len(html)
            band="empty" if length==0 else "tiny" if length<=512 else "small" if length<=10000 else "normal"
            return {"status":"normal_navigation" if not err_kind else "navigation_exception",
                    "exceptionClass":err_kind,
                    "sellerEvidencePresent":'"itemInfoSku":' in html,
                    "sellerModelPresent":str(model) in html,
                    "sameOriginalUrl":same,
                    "httpStatus":response.status if response else None,
                    "htmlLengthBand":band}
        finally:
            browser.close()

def run(root=ROOT,browser=None,now=None):
    audit=json.loads((root/"data/audited-products.json").read_text(encoding="utf-8"))["products"]
    results=[]
    for category,model in TARGETS[:MAX_PAGES]:
        row=next((r for r in audit if r.get("category")==category and r.get("model")==model),None)
        if not row or not row.get("itemUrl"):
            results.append({"category":category,"model":model,"status":"audit_missing"})
            continue
        results.append(safe_diagnosis(category,model,row["itemUrl"],browser=browser))
    return {"schemaVersion":1,"type":"diagnostics_only_no_publication",
            "observedAt":now or datetime.now(timezone.utc).isoformat(),
            "maxSellerPages":MAX_PAGES,"results":results}

if __name__=="__main__":
    report=run()
    path=ROOT/"reports/camp-browser-diagnostics.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CAMP_BROWSER_DIAGNOSTICS",json.dumps(report,ensure_ascii=False))
