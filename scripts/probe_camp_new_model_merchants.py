"""Two NEW manufacturer-backed model candidates; research ONLY, never a catalog.

Source-backed maker specifications and discovered merchant URLs are preflight
candidates, not audited products. Sale price, SKU ID, stock, tax and shipping
must be independently proven on the *current* merchant page and the single
official Rakuten Item API result. Never infer itemCode from the URL slug.
Even a fully passing result is a manual audit candidate, not publishable.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

from acquire import ROOT
from probe_camp_seller_browser import read_seller_page_once
from probe_camp_seller_derived_item_id import page_identity
import refresh_worker as refresh
import stage_camp_api_evidence as stage

# Independent public references researched on 2026-11-05.
# Recorded maker claims are NOT a live merchant inventory claim.
SOURCES = {
    "dod_mat": {
        "category": "mat",
        "model": "CM1-083-CA",
        "manufacturer": "DOD",
        "manufacturerUrl": "https://www.dod.camp/product/cm1_083_ca/",
        "makerWeightGrams": 800,
        "makerPackagedWeightGrams": 800,
        "makerRValue": 6.2,
        "buyerProfileEvidence": "maker_explicit_weight_under_1500g",
        "family": "dod-cm1-083-ca",
        "sellerUrl": "https://item.rakuten.co.jp/ariel-store/5bvxj3o5zfifqycf3ueyejwyiu/",
    },
    "hilander_fire": {
        "category": "fire_pit",
        "model": "HCS-034",
        "manufacturer": "Hilander",
        "manufacturerUrl": "https://www.hilander-outdoor.live/pages/compare-takibitai",
        "manufacturerHeadcount": {"minimum": 4, "maximum": 6},
        "buyerProfileEvidence": "maker_explicit_4_to_6_people",
        "makerBodyWeightGrams": 5550,
        "sellerDescribedBodyWeightGrams": 6050,
        "manufacturerWeightConflict": True,
        "family": "hilander-hcs-034",
        "sellerUrl": "https://item.rakuten.co.jp/hilander/7001528/",
    },
}

MAX_API_REQUESTS = 2
MAX_BROWSER_REQUESTS = 2
STOP = frozenset({"rate_limited", "worker_unavailable"})
REPORT = "reports/camp-new-model-merchant-research.json"


def maker_gate(source):
    """Do not transfer a 4-person claim to a brand without model evidence."""
    if not isinstance(source, dict):
        return False
    category, model, url = (source.get(key) for key in
                            ("category", "model", "manufacturerUrl"))
    if (category, model, url) == (
            "mat", "CM1-083-CA", "https://www.dod.camp/product/cm1_083_ca/"):
        return (source.get("buyerProfileEvidence") ==
                "maker_explicit_weight_under_1500g"
                and type(source.get("makerWeightGrams")) is int
                and 0 < source["makerWeightGrams"] <= 1500
                and source.get("makerPackagedWeightGrams") == 800
                and source.get("makerRValue") == 6.2)
    if (category, model, url) == (
            "fire_pit", "HCS-034",
            "https://www.hilander-outdoor.live/pages/compare-takibitai"):
        group = source.get("manufacturerHeadcount")
        return (isinstance(group, dict)
                and group.get("minimum") == 4
                and group.get("maximum") == 6
                and source.get("buyerProfileEvidence") ==
                "maker_explicit_4_to_6_people"
                and source.get("manufacturerWeightConflict") is True)
    return False


def verified_seller_price(html):
    """Exact positive sale field from *every* embedded itemInfoSku copy."""
    marker = '"itemInfoSku":'
    if not isinstance(html, str) or marker not in html:
        return None
    copies = html.split(marker)[1:]
    if not 1 <= len(copies) <= 8:
        return None
    values = []
    try:
        decoder = json.JSONDecoder()
        for chunk in copies:
            info, _ = decoder.raw_decode(chunk)
            sale = info["purchaseInfo"]["purchaseBySellType"]
            field = sale["normalPurchase"]["price"]["minPrice"]
            if type(field) is not int or field <= 0:
                return None
            values.append(field)
    except (ValueError, TypeError, KeyError, AttributeError):
        return None
    return values[0] if len(set(values)) == 1 else None


def verify_official_api_identity(source, identity, live, price):
    """Only a research conclusion, never sets audited=true."""
    if not isinstance(live, dict):
        return "invalid_api_response"
    if live.get("error"):
        return "rate_limited" if live.get("upstream_status") == 429 else "worker_unavailable"
    if live.get("found") is not True:
        return "exact_item_not_found"
    expected = identity["itemUrl"]
    if (live.get("lookup_method") != "exact_item_code_only"
            or live.get("item_code") != identity["itemCode"]
            or stage.canonical_item_url(live.get("item_url")) != expected
            or stage.affiliate_destination(live.get("affiliate_url")) != expected):
        return "official_exact_identity_or_affiliate_mismatch"
    title = str(live.get("name") or "").casefold()
    if (source["model"].casefold() not in title
            or source["manufacturer"].casefold() not in title):
        # No keyword/category fallbacks for a new unaudited model.
        return "official_product_model_unverified"
    if live.get("availability") != 1:
        return "stock_unverified"
    if live.get("tax_flag") != 0 or live.get("postage_flag") != 0:
        return "tax_or_shipping_unverified"
    current = live.get("price")
    if type(current) is not int or current != price:
        return "seller_and_api_price_mismatch"
    if (live.get("purchasable_min_price") != current
            or live.get("purchasable_max_price") != current):
        return "sku_or_price_range_unverified"
    if not str(live.get("image") or "").startswith(
            "https://thumbnail.image.rakuten.co.jp/"):
        return "official_item_image_unverified"
    return "independent_sale_evidence_for_manual_audit_only"


def probe_one(key, *, seller_get=read_seller_page_once,
              api_fetch=None, root=ROOT):
    if key not in SOURCES:
        raise ValueError("unapproved_new_model")
    source = SOURCES[key]
    row = {
        "category": source["category"], "model": source["model"],
        "manufacturerSpecificationRecorded": maker_gate(source),
        "manufacturerSpecificationRecheckedLive": False,
        "makerWeightConflict": source.get("manufacturerWeightConflict", False),
        "sellerPageStatus": "not_requested",
        "officialApiStatus": "not_requested",
        "sellerPageRequests": 0, "officialApiRequests": 0,
        "independentlyValidatedForManualAudit": False,
        "verifiedForPublication": False,
    }
    if not row["manufacturerSpecificationRecorded"]:
        row["sellerPageStatus"] = "manufacturer_evidence_incomplete"
        return row
    row["sellerPageRequests"] = 1
    try:
        page_url, html = seller_get(source["sellerUrl"])
    except Exception:
        row["sellerPageStatus"] = "seller_page_unavailable"
        return row
    identity, reason = page_identity(
        page_url, html, expected_url=source["sellerUrl"], model=source["model"])
    if identity is None:
        row["sellerPageStatus"] = reason
        return row
    seller_price = verified_seller_price(html)
    if seller_price is None or identity["sellerPriceFieldPresent"] is not True:
        row["sellerPageStatus"] = "seller_price_unverified"
        return row
    row["sellerPageStatus"] = "fixed_sku_id_and_price_preflight"
    try:
        refresh.parse_listing(
            html, source["model"], seller_price,
            int(identity["itemCode"].split(":", 1)[1]))
    except (ValueError, TypeError, KeyError, AttributeError, json.JSONDecodeError):
        row["sellerPageStatus"] = "seller_cart_conditions_unverified"
        return row
    live = stage.request_exact(identity, fetch=api_fetch)
    row["officialApiRequests"] = 1
    outcome = verify_official_api_identity(source, identity, live, seller_price)
    row["officialApiStatus"] = outcome
    # A known discrepancy in maker versus merchant weight remains a real
    # blocker for an exact specification even when the sale evidence passes.
    row["independentlyValidatedForManualAudit"] = (
        outcome == "independent_sale_evidence_for_manual_audit_only"
        and not row["makerWeightConflict"]
    )
    return row


def probe(*, root=ROOT, seller_get=read_seller_page_once,
          api_fetch=None, pause=time.sleep, now=None):
    observed = now or datetime.now(timezone.utc)
    if observed.tzinfo is None:
        raise ValueError("timezone_required")
    original = {}
    for name in ("products", "audited-products", "equipment"):
        path = root / "data" / (name + ".json")
        original[name] = (path, path.read_bytes())
    attempted_api = 0
    attempted_browser = 0
    results = []
    stopped = False
    for index, key in enumerate(SOURCES):
        if index and attempted_api:
            pause(3)
        row = probe_one(key, root=root, seller_get=seller_get,
                        api_fetch=api_fetch)
        attempted_api += row["officialApiRequests"]
        attempted_browser += row["sellerPageRequests"]
        results.append(row)
        if row["officialApiStatus"] in STOP:
            stopped = True
            break
    if any(path.read_bytes() != content for path, content in original.values()):
        raise AssertionError("production_catalog_or_audits_mutated")
    return {
        "schemaVersion": 1, "type": "new_model_discovery_not_for_publication",
        "observedAt": observed.astimezone(timezone.utc).isoformat(),
        "maximumSellerBrowserRequests": MAX_BROWSER_REQUESTS,
        "maximumOfficialApiRequests": MAX_API_REQUESTS,
        "sellerBrowserRequests": attempted_browser,
        "officialApiRequests": attempted_api,
        "stoppedByUpstream": stopped,
        "verifiedForPublication": False,
        "results": results,
    }


def main(root=ROOT):
    report = probe(root=root)
    path = root / REPORT
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print("CAMP_NEW_MODEL_RESEARCH", json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
