"""One alternate CAMP seller: derive exact itemId from its OWN current sale page.

A Rakuten product URL's last path segment is NOT an authoritative itemCode.
Never derive 'shop:slug'. Independently check the original merchant's live
single-SKU stock, price, exact model, itemId, URL; only then ask the official
Rakuten Item API for the exact discovered 'shop:itemId'. This probe does not
modify public catalog, audit timestamps or affiliate destinations.
"""
from __future__ import annotations

import json
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

from acquire import ROOT
import refresh_worker as worker
import probe_camp_seller_browser as seller
import stage_camp_api_evidence as stage

MODEL = "2218364"
CATEGORY = "led_lantern"
SELLER_PAGE = "https://item.rakuten.co.jp/alpen/7411106505/"
MAX_HTML_SIZE = 3_000_000
SAFE_REASONS = frozenset({
    "missing_sales_evidence", "wrong_listing", "unavailable", "price_mismatch",
    "inventory_unknown", "variable_listing", "selectable_listing",
    "unknown_model", "variant_unknown", "model_missing",
})
ALLOWED_TARGETS = {
    "led": (CATEGORY, MODEL, SELLER_PAGE),
    "sandwich": ("hot_sandwich_maker", "UG-3086",
                 "https://item.rakuten.co.jp/captainstagstore/4560464283785/"),
    "fire": ("fire_pit", "2000031235",
             "https://item.rakuten.co.jp/naturum/2824592/"),
}
REPORT = ROOT / "reports/camp-seller-derived-item-id.json"


def page_identity(url, html, expected_url=SELLER_PAGE, model=MODEL):
    canonical = stage.canonical_item_url(expected_url)
    if not canonical or stage.canonical_item_url(url) != canonical:
        return None, "redirect_or_wrong_seller_page"
    if not isinstance(html, str) or not html or len(html) > MAX_HTML_SIZE:
        return None, "seller_html_unavailable"
    marker = '"itemInfoSku":'
    # An itemId can be checked against Rakuten's exact API without treating
    # any missing seller price as a valid purchase condition. No publication,
    # no inventory assertion, and no 'verified' label on this intermediate ID.
    # Some Rakuten pages embed the same itemInfoSku JSON more than once.
    # A duplicate is NOT evidence of multiple variants; independently parse
    # every occurrence and require identical itemId and purchase invariants.
    # Contradictory records are strictly rejected before calling the API.
    count = html.count(marker)
    if count == 0:
        return None, "missing_sales_evidence"
    if count > 8:
        return None, "ambiguous_seller_item_id"
    if model not in html:
        return None, "model_missing"
    infos = []
    try:
        decoder = json.JSONDecoder()
        for fragment in html.split(marker)[1:]:
            info, _ = decoder.raw_decode(fragment)
            if not isinstance(info, dict):
                return None, "item_id_unverified"
            infos.append(info)
    except (ValueError, TypeError, json.JSONDecodeError):
        return None, "seller_conditions_unverified"
    ids = [info.get("itemId") for info in infos]
    if any(type(v) is not int or v < 1 or len(str(v)) > 15 for v in ids):
        return None, "item_id_unverified"
    if len(set(ids)) != 1:
        return None, "conflicting_seller_item_ids"
    item_id = ids[0]
    quantities = []
    prices = []
    for info in infos:
        if info.get("sellType") != "NORMAL":
            return None, "wrong_listing"
        purchase = info.get("purchaseInfo", {})
        if not isinstance(purchase, dict):
            return None, "seller_conditions_unverified"
        sale = purchase.get("purchaseBySellType", {})
        if not isinstance(sale, dict):
            return None, "seller_conditions_unverified"
        if sale.get("purchaseCondition") != "enabled":
            return None, "unavailable"
        if info.get("inventoryType") != "single" or info.get("sku"):
            return None, "variant_unknown"
        inventories = purchase.get("variantMappedInventories", [])
        if (not isinstance(inventories, list) or len(inventories) != 1
                or not isinstance(inventories[0], dict)
                or type(inventories[0].get("quantity")) is not int
                or inventories[0]["quantity"] <= 0):
            return None, "inventory_unknown"
        quantities.append(inventories[0]["quantity"])
        normal = sale.get("normalPurchase", {})
        price_box = normal.get("price", {}) if isinstance(normal, dict) else {}
        prices.append(price_box.get("minPrice") if isinstance(price_box, dict) else None)
    if len(set(quantities)) != 1:
        return None, "conflicting_seller_inventory"
    observed_prices = [v for v in prices if type(v) is int and v > 0]
    if len(set(observed_prices)) > 1:
        return None, "conflicting_seller_price"
    # Only an exact positive integer from every copy counts as seller price
    # evidence, and even then official SKU/price/stock proof remains mandatory.
    price_present = len(observed_prices) == len(infos)
    shop = urllib.parse.urlparse(canonical).path.split("/")[1]
    # This is ONLY a research identity. Seller price must still independently
    # equal the official API price in seller_audit_result and parse_listing.
    return {"itemCode": shop + ":" + str(item_id),
            "itemUrl": canonical, "sellerPriceFieldPresent": price_present}, None


def probe(*, root=ROOT, browser_get=None, api_fetch=None, now=None,
          seller_page=None, target="led"):
    if target not in ALLOWED_TARGETS:
        raise ValueError("unapproved_target")
    category, model, approved_url = ALLOWED_TARGETS[target]
    seller_page = seller_page if seller_page is not None else approved_url
    observed = now or datetime.now(timezone.utc)
    if observed.tzinfo is None:
        raise ValueError("timezone_required")
    observed = observed.astimezone(timezone.utc)
    paths = {name: root / "data" / (name + ".json")
             for name in ("audited-products", "products", "equipment")}
    raw = {key: p.read_bytes() for key, p in paths.items()}
    audits = json.loads(raw["audited-products"]).get("products") or []
    matches = [a for a in audits if a.get("category") == category
               and a.get("model") == model]
    if len(matches) != 1:
        raise ValueError("unique_historical_manufacturer_model_required")
    original = matches[0]
    if stage.canonical_item_url(seller_page) != approved_url:
        raise ValueError("unapproved_seller_url")
    equipment = json.loads(raw["equipment"])
    result = {
        "schemaVersion": 1, "type": "exact_seller_id_research_only",
        "observedAt": observed.isoformat(),
        "model": model, "category": category,
        "sellerBrowserRequests": 1, "maximumSellerBrowserRequests": 1,
        "rakutenApiRequests": 0, "maximumRakutenApiRequests": 1,
        "sellerStatus": "not_verified",
        "sellerIdFromLivePage": False,
        "urlSlugMatchesSellerId": None,
        "sellerPriceFieldPresent": None,
        "apiStatus": "not_requested",
        "independentEvidenceForManualReview": False,
        "manufacturerGroupSizeVerified": False if category == "fire_pit" else None,
        "verifiedForPublication": False,
    }
    getter = browser_get or seller.read_seller_page_once
    try:
        visited, html = getter(seller_page)
    except Exception:
        result["sellerStatus"] = "seller_browser_unavailable"
    else:
        identity, reason = page_identity(visited, html, seller_page, model)
        if identity is None:
            result["sellerStatus"] = reason
        else:
            result["sellerStatus"] = "seller_item_id_observed_not_purchase_verified"
            result["sellerIdFromLivePage"] = True
            result["sellerPriceFieldPresent"] = identity["sellerPriceFieldPresent"]
            result["urlSlugMatchesSellerId"] = (
                urllib.parse.urlparse(identity["itemUrl"]).path.rstrip("/").split("/")[-1]
                == identity["itemCode"].split(":", 1)[1]
            )
            candidate = {**original, **identity}
            live = stage.request_exact(candidate, fetch=api_fetch)
            result["rakutenApiRequests"] = 1
            verdict = stage.validate_candidate(
                candidate, live, equipment, observed.isoformat())
            result["apiStatus"] = verdict["status"]
            if result["apiStatus"] == "api_confirmed_seller_variant_audit_required":
                proof = seller.seller_audit_result(
                    candidate, equipment, live, visited, html, observed.isoformat())
                proof_ok = (proof.get("status") ==
                            "independent_seller_and_api_evidence_review_required")
                if proof_ok:
                    # Enforce exact embedded itemId as well as page URL:
                    # the legacy seller_audit_result verifies price but does
                    # not itself bind itemId to the official API identity.
                    try:
                        worker.parse_listing(
                            html, model, live["price"],
                            int(identity["itemCode"].split(":", 1)[1]))
                    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                        proof_ok = False
                result["independentEvidenceForManualReview"] = proof_ok
                result["sellerStatus"] = (
                    "independent_original_seller_proof_for_manual_review" if proof_ok
                    else "seller_price_or_conditions_unverified"
                )
    if any(path.read_bytes() != raw[key] for key, path in paths.items()):
        raise AssertionError("production_catalog_mutated")
    return result


def main(root=ROOT, target="led"):
    result = probe(root=root, target=target)
    suffix = "" if target == "led" else "-" + target
    path = root / ("reports/camp-seller-derived-item-id" + suffix + ".json")
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print("CAMP_SELLER_DERIVED_ITEM_ID", json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", choices=tuple(ALLOWED_TARGETS), default="led")
    main(target=parser.parse_args().candidate)
