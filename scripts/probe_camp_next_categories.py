"""Verify at most two *original*, independently audited CAMP seller pages.

This is a read-only evidence probe for a Coleman family tent and a chair.
Exact Item API result must pass all hard gates BEFORE loading a seller page.
Do not publish catalog or edit product/audit timestamps based on this probe.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from acquire import ROOT
import stage_camp_api_evidence as api
import probe_camp_seller_browser as seller
import refresh_worker

# Intentionally fixed, originally audited merchants: never substitute a
# visually similar listing or a different Rakuten storefront.
TARGETS = (("tent", "2206745"), ("chair", "2190857"))
MAX_ITEMS = 2

def probe_one(audit, equipment, *, fetch=None, browse=None, now=None):
    observed = now or datetime.now(timezone.utc).isoformat()
    output = {
        "category": audit["category"], "model": audit["model"],
        "observedAt": observed, "verifiedForPublication": False,
        "sellerStatus": "not_attempted",
    }
    try:
        live = api.request_exact(audit, fetch=fetch)
    except Exception:
        # Never log untrusted exception messages, URLs, tokens or API bodies.
        return {**output, "status": "api_unavailable"}
    check = api.validate_candidate(audit, live, equipment, observed)
    output["apiStatus"] = check["status"]
    if check["status"] != "api_confirmed_seller_variant_audit_required":
        return {**output, "status": "api_evidence_insufficient"}
    browser = browse or seller.read_seller_page_once
    try:
        observed_url, html = browser(audit["itemUrl"])
    except Exception:
        return {**output, "status": "seller_page_unavailable", "sellerStatus": "browser_failed"}
    validation = seller.seller_audit_result(audit, equipment, live, observed_url, html, observed)
    output["sellerStatus"] = validation["status"]
    if validation["status"] != "independent_seller_and_api_evidence_review_required":
        return {
            **output, "status": "seller_evidence_insufficient",
            "reason": validation.get("evidenceReason"),
        }
    # An independent exact ID match is compulsory even if the normal HTML
    # already names the model and a single fixed variant.
    item_id = str(audit["itemCode"]).split(":",1)[-1]
    if not item_id.isdecimal():
        return {**output, "status": "seller_code_not_numeric"}
    try:
        refresh_worker.parse_listing(html,audit["model"],live["price"],int(item_id))
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return {**output, "status": "seller_item_id_or_cart_mismatch"}
    return {
        **output, "status": "independent_proof_complete_ready_for_review",
        "verifiedForPublication": False,
        "sellerVerified": True, "apiCurrentPrice": live["price"],
        "originalItemCode": audit["itemCode"], "originalItemUrl": audit["itemUrl"],
        "affiliateUrl": live["affiliate_url"], "image": live["image"],
    }

def probe(*, root=ROOT, fetch=None, browse=None, now=None):
    audits = json.loads((root/"data/audited-products.json").read_text(encoding="utf-8"))["products"]
    equipment = json.loads((root/"data/equipment.json").read_text(encoding="utf-8"))
    observed = now or datetime.now(timezone.utc).isoformat()
    results = []
    for category, model in TARGETS[:MAX_ITEMS]:
        audit = next((a for a in audits if a.get("category")==category and a.get("model")==model),None)
        if not audit or not audit.get("itemCode") or not audit.get("itemUrl"):
            results.append({"category": category, "model": model, "status": "audit_not_found",
                            "verifiedForPublication": False})
            continue
        evidence = probe_one(audit,equipment,fetch=fetch,browse=browse,now=observed)
        results.append(evidence)
        if evidence.get("apiStatus") == "rate_limited":
            break
    return {
        "schemaVersion": 1, "type": "research_only_not_for_publication",
        "queried": len(results), "maxApiRequests": MAX_ITEMS,
        "stoppedBy429": bool(results and results[-1].get("apiStatus")=="rate_limited"),
        "observedAt": observed, "results": results,
    }

if __name__=="__main__":
    report=probe()
    output=ROOT/"reports/camp-next-categories-proof.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CAMP_NEXT_CATEGORY_PROOF",json.dumps({
        "queried": report["queried"],"stoppedBy429": report["stoppedBy429"],
        "results":[{"category":r["category"],"model":r["model"],"status":r["status"],
                    "apiStatus":r.get("apiStatus"),"sellerStatus":r.get("sellerStatus"),
                    "apiPrice":r.get("apiCurrentPrice")} for r in report["results"]]
    },ensure_ascii=False))
