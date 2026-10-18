"""Research-only requalification when old seller item codes disappear.

For three explicitly chosen seller URLs, FIRST read normal seller HTML
(no purchase, no affiliate click), extract the seller's own positive numeric
itemId, THEN make exactly one official Item API request using the derived
same-shop merchant code. Strictly verify identity, inventory, fixed variants,
current price and tax/shipping. Never auto-publish a new merchant listing.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone

from acquire import ROOT
from probe_camp_cooler_led import original_seller_browser_with_one_retry
from refresh_worker import identity_gate, parse_listing
from stage_camp_api_evidence import canonical_item_url, affiliate_destination, request_exact, validate_candidate

TARGETS=(
    ("burner","ST-310","https://item.rakuten.co.jp/plot-store/3466-st-310/"),
    ("hot_sandwich_maker","UG-3086","https://item.rakuten.co.jp/captainstagstore/4560464283785/"),
    ("burner","ST-340","https://item.rakuten.co.jp/passageshop/10012178/"),
)
MAX_API_CALLS=3
MAX_BROWSER_ITEMS=3
SUCCESS="new_seller_independent_proof_ready_for_manual_audit"

def seller_data(page):
    try:
        marker='"itemInfoSku":'
        if not isinstance(page,str) or marker not in page or len(page)>3_000_000:
            return None
        obj,_=json.JSONDecoder().raw_decode(page.split(marker,1)[1])
        item_id=obj.get("itemId")
        if type(item_id) is not int or item_id<=0:
            return None
        return obj
    except (ValueError,TypeError,KeyError,OverflowError):
        return None

def probe_one(audit, new_url, equipment, *, fetch=None, browse=None, observed=None):
    observed=observed or datetime.now(timezone.utc).isoformat()
    base={"category":audit["category"],"model":audit["model"],
          "verifiedForPublication":False,"sellerBrowserAttempted":False,"officialApiAttempted":False}
    expected=canonical_item_url(new_url)
    if not expected or expected!=new_url:
        return {**base,"status":"invalid_candidate_seller_url"}
    if not all(audit.get(field) is True for field in
            ("audited","bodyConfirmed","fixedVariant","available","priceAudit")):
        return {**base,"status":"historical_manufacturer_audit_incomplete"}
    if audit.get("condition")!="new" or audit.get("quantityPerListing")!=1:
        return {**base,"status":"historical_unit_audit_incomplete"}
    browser=browse or original_seller_browser_with_one_retry
    try:
        visited,html=browser(expected)
    except Exception:
        return {**base,"status":"seller_browser_failed","sellerBrowserAttempted":True}
    base={**base,"sellerBrowserAttempted":True}
    if canonical_item_url(visited)!=expected:
        return {**base,"status":"seller_redirects_to_unapproved_listing"}
    if audit["model"] not in html:
        return {**base,"status":"model_not_visible_on_seller_page"}
    seller=seller_data(html)
    if not seller:
        return {**base,"status":"seller_numeric_item_id_unavailable"}
    shop=expected.split("/")[3]
    code=f'{shop}:{seller["itemId"]}'
    provisional={**audit,"itemUrl":expected,"itemCode":code}
    try:
        live=request_exact(provisional,fetch=fetch)
    except Exception:
        return {**base,"status":"official_api_unavailable","officialApiAttempted":True}
    status=validate_candidate(provisional,live,equipment,observed)["status"]
    base={**base,"officialApiAttempted":True,"apiStatus":status}
    if status!="api_confirmed_seller_variant_audit_required":
        return {**base,"status":"exact_api_evidence_insufficient"}
    try:
        parse_listing(html,audit["model"],live["price"],seller["itemId"])
    except (ValueError,TypeError,KeyError,json.JSONDecodeError):
        return {**base,"status":"fixed_sku_stock_or_price_unverified"}
    if affiliate_destination(live["affiliate_url"])!=expected:
        return {**base,"status":"affiliate_destination_mismatch"}
    if not identity_gate(live["name"],provisional,equipment):
        return {**base,"status":"product_identity_unverified"}
    return {**base,
        "status":SUCCESS,
        "newExactItemCode":code,"newExactSellerUrl":expected,
        "currentVerifiedApiPrice":live["price"],
        "affiliateUrl":live["affiliate_url"],"image":live["image"],
        # A new merchant means a *new* listing audit. Old vendor's date
        # cannot be reused, and nothing gets published by this job.
        "requiresNewMerchantAudit":True,
    }

def run(*, root=ROOT, fetch=None, browse=None, now=None):
    audited=json.loads((root/"data/audited-products.json").read_text(encoding="utf-8"))["products"]
    gear=json.loads((root/"data/equipment.json").read_text(encoding="utf-8"))
    observed=now or datetime.now(timezone.utc).isoformat()
    results=[];proven=set();api_count=0
    for category,model,url in TARGETS[:MAX_BROWSER_ITEMS]:
        if category in proven:
            continue
        audit=next((a for a in audited if a.get("category")==category and a.get("model")==model),None)
        if not audit:
            results.append({"category":category,"model":model,"status":"historical_model_not_audited","verifiedForPublication":False})
            continue
        result=probe_one(audit,url,gear,fetch=fetch,browse=browse,observed=observed)
        api_count+=int(result.get("officialApiAttempted",False))
        results.append(result)
        if result["status"]==SUCCESS:
            proven.add(category)
        if result.get("apiStatus")=="rate_limited" or api_count>=MAX_API_CALLS:
            break
    return {
        "schemaVersion":1,"type":"research_only_new_merchants_not_for_publication",
        "observedAt":observed,"maxApiCalls":MAX_API_CALLS,"maxSellerPages":MAX_BROWSER_ITEMS,
        "actualApiCalls":api_count,"attemptedSellerCandidates":len(results),
        "stoppedBy429":bool(results and results[-1].get("apiStatus")=="rate_limited"),
        "provenCategories":sorted(proven),"results":results,
    }

if __name__=="__main__":
    result=run()
    dest=ROOT/"reports/camp-new-merchant-requalification.json"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CAMP_NEW_MERCHANT_PROOF",json.dumps({
        "apiCalls":result["actualApiCalls"],"sellerCandidates":result["attemptedSellerCandidates"],
        "stoppedBy429":result["stoppedBy429"],"provenCategories":result["provenCategories"],
        "outcomes":[{"category":r["category"],"model":r["model"],"status":r["status"],
          "apiStatus":r.get("apiStatus"),"price":r.get("currentVerifiedApiPrice")}
          for r in result["results"]]
    },ensure_ascii=False))
