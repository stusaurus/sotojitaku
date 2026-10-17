"""One-item browser seller-page proof probe; never publishes CAMP products.

The API and seller's current page are checked independently. No bot evasion,
proxy, cart modification, affiliate clicks, or unverified catalog timestamps.
"""
import json
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

from acquire import ROOT
import refresh_worker as refresh
import stage_camp_api_evidence as stage

TARGET_MODEL = "2000034774"
MAX_HTML_CHARS = 3_000_000
ALLOWED_REASONS = {
    "missing_sales_evidence", "wrong_listing", "unavailable", "price_mismatch",
    "inventory_unknown", "variable_listing", "selectable_listing", "unknown_model",
    "variant_unknown", "model_missing",
}

def seller_audit_result(audit, equipment, live, visited_url, page_html, observed_at):
    candidate = stage.validate_candidate(audit, live, equipment, observed_at)
    base = {
        "schemaVersion": 1,
        "type": "research_only_not_for_publication",
        "category": audit["category"],
        "model": audit["model"],
        "observedAt": observed_at,
        "verifiedForPublication": False,
        "officialApiStatus": candidate["status"],
    }
    if candidate["status"] != "api_confirmed_seller_variant_audit_required":
        return {**base, "status": "official_api_evidence_insufficient"}
    expected = stage.canonical_item_url(audit["itemUrl"])
    current = stage.canonical_item_url(visited_url)
    if not expected or expected != current:
        return {**base, "status": "seller_page_redirect_or_identity_mismatch"}
    if not isinstance(page_html, str) or len(page_html) > MAX_HTML_CHARS:
        return {**base, "status": "seller_page_unavailable"}
    try:
        # Keep the original strict proof: itemInfoSku's NORMAL sale type,
        # enabled purchase condition, *exact* price, one in-stock unit/variant,
        # verified manufacturer model and fixed seller-cart options.
        refresh.parse_listing(page_html, audit["model"], live["price"])
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        reason = str(error)
        return {
            **base, "status": "seller_page_conditions_unverified",
            "evidenceReason": reason if reason in ALLOWED_REASONS else "unparseable_seller_evidence",
        }
    return {
        **base, "status": "independent_seller_and_api_evidence_review_required",
        "sellerConditionsValidated": True,
        "officialPrice": live["price"],
        # Product spec/identity, snapshots, overall catalog coverage and
        # publishing are still separate quality gates.
        "verifiedForPublication": False,
    }

def collect(*, root=ROOT, api_fetch=None, browser_get=None, now=None):
    audited = json.loads((root / "data/audited-products.json").read_text(encoding="utf-8"))["products"]
    audit = next((row for row in audited if row.get("model") == TARGET_MODEL and row.get("category") == "sleeping_bag"), None)
    if not audit:
        raise ValueError("audited_target_not_found")
    equipment = json.loads((root / "data/equipment.json").read_text(encoding="utf-8"))
    observed = now or datetime.now(timezone.utc).isoformat()
    live = stage.request_exact(audit, fetch=api_fetch)
    candidate = stage.validate_candidate(audit, live, equipment, observed)
    if candidate["status"] != "api_confirmed_seller_variant_audit_required":
        return {
            "schemaVersion": 1, "type": "research_only_not_for_publication",
            "category": audit["category"], "model": audit["model"], "observedAt": observed,
            "verifiedForPublication": False, "status": "official_api_evidence_insufficient",
            "officialApiStatus": candidate["status"],
        }
    if browser_get is None:
        browser_get = read_seller_page_once
    try:
        current_url, html = browser_get(audit["itemUrl"])
    except Exception:
        # Do not leak network exception messages or retry blocked seller pages.
        return {
            "schemaVersion": 1, "type": "research_only_not_for_publication",
            "category": audit["category"], "model": audit["model"], "observedAt": observed,
            "verifiedForPublication": False, "officialApiStatus": candidate["status"],
            "status": "seller_browser_fetch_failed",
        }
    return seller_audit_result(audit, equipment, live, current_url, html, observed)

def read_seller_page_once(url):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel="chrome")
        try:
            page = browser.new_page(viewport={"width": 1200, "height": 800}, locale="ja-JP")
            # Standard browser only; no stealth, proxies, captcha solving or
            # repeated blocked-page requests.
            page.goto(url, wait_until="domcontentloaded", timeout=25000)
            page.wait_for_timeout(900)
            return page.url, page.content()
        finally:
            browser.close()

if __name__ == "__main__":
    result = collect()
    output = ROOT / "reports/camp-seller-page-browser-proof.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("CAMP_SELLER_BROWSER_PROOF", json.dumps({
        "status": result["status"],
        "officialApiStatus": result.get("officialApiStatus"),
        "evidenceReason": result.get("evidenceReason"),
        "verifiedForPublication": False
    }, ensure_ascii=False))
