"""Fail-closed SOTOJITAKU FISHING Rakuten refresh.

Only manually audited exact Rakuten listings can become public recommendations.
The refresh resolves the exact listing, verifies identity, sale metadata, image,
price and affiliate destination, then emits a short-lived verified catalog.
Any failure removes the item instead of preserving stale product data.
"""
from __future__ import annotations

import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED_DIR = ROOT / "fishing" / "data" / "product-seeds"
OUT = ROOT / "fishing" / "data" / "audited-products.json"

ITEM_LOOKUP = "https://daily-cost-api.kiyo0625puma.workers.dev/api/item-lookup"
WORKER_SEARCH = "https://daily-cost-api.kiyo0625puma.workers.dev/api/product-search"
RAKUTEN_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701"
HEADERS = {
    "Origin": "https://stusaurus.github.io",
    "Referer": "https://stusaurus.github.io/sotojitaku/fishing/",
    "User-Agent": "sotojitaku-fishing/1.0",
}

_PAGE_CACHE: dict[str, str] = {}


def fetch_json(url: str, headers: dict[str, str] | None = None) -> dict:
    req = urllib.request.Request(url, headers=headers or HEADERS)
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=8) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 1:
                raise
        time.sleep(1 + attempt * 2)
    return {}


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=10) as response:
        raw = response.read()
    match = re.search(br'charset\s*=\s*["\']?([\w-]+)', raw[:10000], re.I)
    encoding = match.group(1).decode() if match else "utf-8"
    return raw.decode(encoding, errors="replace")


def canonical_item_url(value: str) -> str:
    value = str(value or "")
    parsed = urllib.parse.urlparse(value)
    if parsed.hostname == "hb.afl.rakuten.co.jp":
        value = urllib.parse.parse_qs(parsed.query).get("pc", [""])[0]
        parsed = urllib.parse.urlparse(value)
    if parsed.hostname != "item.rakuten.co.jp":
        return ""
    path = re.sub(r"/+", "/", parsed.path).rstrip("/") + "/"
    return f"https://item.rakuten.co.jp{path}"


def rakuten_shop(value: str) -> str:
    parsed = urllib.parse.urlparse(canonical_item_url(value))
    parts = [part for part in parsed.path.split("/") if part]
    return parts[0] if parts else ""


def compact(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(value or ""))).lower()


def identity_ok(name: str, seed: dict) -> bool:
    normalized = compact(name)
    if any(compact(term) in normalized for term in seed.get("forbiddenTerms", [])):
        return False
    for group in seed.get("identityGroups", []):
        if not any(compact(term) in normalized for term in group):
            return False
    return True


def safe_affiliate(url: str, item_url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url or "")
        return (
            parsed.scheme == "https"
            and parsed.hostname == "hb.afl.rakuten.co.jp"
            and canonical_item_url(url) == canonical_item_url(item_url)
        )
    except Exception:
        return False


def seed_queries(seed: dict) -> list[str]:
    queries = seed.get("searchQueries") or [seed.get("name", "")]
    out: list[str] = []
    for value in queries:
        value = str(value or "").strip()
        if value and value not in out:
            out.append(value)
    return out


def worker_exact_candidate(seed: dict) -> dict | None:
    expected = canonical_item_url(seed["itemUrl"])
    for query in seed_queries(seed)[:1]:
        payload = fetch_json(
            ITEM_LOOKUP
            + "?"
            + urllib.parse.urlencode({"url": seed["itemUrl"], "q": query})
        )
        if payload.get("found") is not True:
            continue
        item_url = canonical_item_url(payload.get("item_url", ""))
        name = str(payload.get("name") or "")
        if item_url != expected or not identity_ok(name, seed):
            continue
        return {
            "name": name,
            "price": payload.get("price"),
            "affiliateUrl": payload.get("affiliate_url", ""),
            "itemUrl": item_url,
            "image": payload.get("image", ""),
            "itemCode": payload.get("item_code", ""),
            "source": "worker_exact_url",
        }
    return None



def worker_search_candidate(seed: dict) -> dict | None:
    expected = canonical_item_url(seed["itemUrl"])
    for query in seed_queries(seed)[:1]:
        payload = fetch_json(
            WORKER_SEARCH + "?" + urllib.parse.urlencode({"q": query, "hits": 30})
        )
        for raw in payload.get("products", []):
            url = raw.get("shipping_included_url") or raw.get("url") or ""
            item_url = canonical_item_url(url)
            name = str(raw.get("shipping_match_name") or raw.get("name") or "")
            if item_url != expected or not identity_ok(name, seed):
                continue
            return {
                "name": name,
                "price": raw.get("shipping_included_price") or raw.get("price"),
                "affiliateUrl": url,
                "itemUrl": item_url,
                "image": raw.get("shipping_included_image") or raw.get("image") or "",
                "itemCode": raw.get("item_code") or raw.get("itemCode") or "",
                "source": "worker_search_exact_url",
            }
    return None


def page_info(seed: dict) -> dict | None:
    expected = canonical_item_url(seed["itemUrl"])
    if expected not in _PAGE_CACHE:
        try:
            _PAGE_CACHE[expected] = fetch_text(expected)
        except Exception:
            return None
    page = _PAGE_CACHE[expected]
    marker = '"itemInfoSku":'
    if marker not in page:
        return None
    info, _ = json.JSONDecoder().raw_decode(page.split(marker, 1)[1])
    if info.get("sellType") != "NORMAL":
        raise ValueError("wrong_sell_type")
    purchase = info.get("purchaseInfo", {}).get("purchaseBySellType", {})
    if purchase.get("purchaseCondition") != "enabled":
        raise ValueError("unavailable")
    live_price = purchase.get("normalPurchase", {}).get("price", {}).get("minPrice")
    item_id = info.get("itemId")
    if not isinstance(live_price, (int, float)) or live_price <= 0:
        raise ValueError("price_unknown")
    if not isinstance(item_id, int):
        raise ValueError("item_id_missing")
    return {"price": int(live_price), "itemId": item_id}


def api_exact_candidate(seed: dict) -> dict | None:
    env = {
        key: os.environ.get(key, "").strip()
        for key in (
            "RAKUTEN_APPLICATION_ID",
            "RAKUTEN_ACCESS_KEY",
            "RAKUTEN_AFFILIATE_ID",
        )
    }
    if not all(env.values()):
        return None
    info = page_info(seed)
    if not info:
        return None
    shop = rakuten_shop(seed["itemUrl"])
    item_code = f"{shop}:{info['itemId']}"
    params = {
        "applicationId": env["RAKUTEN_APPLICATION_ID"],
        "affiliateId": env["RAKUTEN_AFFILIATE_ID"],
        "itemCode": item_code,
        "hits": 1,
        "formatVersion": 2,
        "availability": 1,
        "elements": (
            "itemName,itemCode,itemPrice,itemUrl,affiliateUrl,"
            "mediumImageUrls,availability,shopCode"
        ),
    }
    headers = {**HEADERS, "accessKey": env["RAKUTEN_ACCESS_KEY"]}
    payload = fetch_json(
        RAKUTEN_API + "?" + urllib.parse.urlencode(params),
        headers=headers,
    )
    expected = canonical_item_url(seed["itemUrl"])
    for raw in payload.get("items") or payload.get("Items") or []:
        item = raw.get("Item", raw)
        item_url = canonical_item_url(item.get("itemUrl", ""))
        name = str(item.get("itemName") or "")
        if item_url != expected or not identity_ok(name, seed):
            continue
        images = item.get("mediumImageUrls") or []
        image = images[0] if images else ""
        if isinstance(image, dict):
            image = image.get("imageUrl", "")
        return {
            "name": name,
            "price": item.get("itemPrice"),
            "affiliateUrl": item.get("affiliateUrl", ""),
            "itemUrl": item_url,
            "image": image,
            "itemCode": item.get("itemCode") or item_code,
            "source": "rakuten_api_exact",
            "pagePrice": info["price"],
        }
    return None


def api_search_candidate(seed: dict) -> dict | None:
    env = {
        key: os.environ.get(key, "").strip()
        for key in (
            "RAKUTEN_APPLICATION_ID",
            "RAKUTEN_ACCESS_KEY",
            "RAKUTEN_AFFILIATE_ID",
        )
    }
    if not all(env.values()):
        return None

    expected = canonical_item_url(seed["itemUrl"])
    headers = {**HEADERS, "accessKey": env["RAKUTEN_ACCESS_KEY"]}
    shop = rakuten_shop(expected)

    for query in seed_queries(seed)[:2]:
        params = {
            "applicationId": env["RAKUTEN_APPLICATION_ID"],
            "affiliateId": env["RAKUTEN_AFFILIATE_ID"],
            "shopCode": shop,
            "keyword": query,
            "hits": 30,
            "formatVersion": 2,
            "availability": 1,
            "field": 0,
            "elements": (
                "itemName,itemCode,itemPrice,itemUrl,affiliateUrl,"
                "mediumImageUrls,availability,shopCode"
            ),
        }
        payload = fetch_json(
            RAKUTEN_API + "?" + urllib.parse.urlencode(params),
            headers=headers,
        )
        for raw in payload.get("items") or payload.get("Items") or []:
            item = raw.get("Item", raw)
            item_url = canonical_item_url(item.get("itemUrl", ""))
            name = str(item.get("itemName") or "")
            if item_url != expected or not identity_ok(name, seed):
                continue
            images = item.get("mediumImageUrls") or []
            image = images[0] if images else ""
            if isinstance(image, dict):
                image = image.get("imageUrl", "")
            return {
                "name": name,
                "price": item.get("itemPrice"),
                "affiliateUrl": item.get("affiliateUrl", ""),
                "itemUrl": item_url,
                "image": image,
                "itemCode": item.get("itemCode", ""),
                "source": "rakuten_api_search",
            }
    return None


def sales_audit(seed: dict, candidate: dict) -> tuple[str, int]:
    expected = canonical_item_url(seed["itemUrl"])
    target = canonical_item_url(candidate.get("itemUrl", ""))
    if target != expected:
        raise ValueError("wrong_exact_listing")

    feed_price = candidate.get("price")
    if not isinstance(feed_price, (int, float)) or feed_price <= 0:
        raise ValueError("price_unknown")

    info = page_info(seed)
    if info is None:
        return "exact_feed_fallback", int(feed_price)

    live_price = info["price"]
    if abs(live_price - feed_price) > max(500, feed_price * 0.35):
        raise ValueError("feed_page_price_mismatch")
    return "sales_page", int(live_price)


def load_seeds() -> list[dict]:
    return [
        json.loads(path.read_text())
        for path in sorted(SEED_DIR.glob("*.json"))
    ]


def spec_audit_fresh(seed: dict, now: datetime) -> bool:
    try:
        checked = datetime.fromisoformat(seed["specCheckedAt"] + "T00:00:00+00:00")
        return 0 <= (now - checked).days <= 365
    except Exception:
        return False


def acquire() -> dict:
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    products: list[dict] = []
    failures: dict[str, str] = {}

    for seed in load_seeds():
        product_id = seed.get("productId", "unknown")
        try:
            if not spec_audit_fresh(seed, now_dt):
                raise ValueError("spec_audit_expired")

            candidate = None
            source_errors: list[str] = []
            for source_name, source_fn in (
                ("rakuten_api_search", api_search_candidate),
                ("worker_search_exact_url", worker_search_candidate),
                ("rakuten_api_exact", api_exact_candidate),
            ):
                if candidate is not None:
                    break
                try:
                    candidate = source_fn(seed)
                except Exception as exc:
                    source_errors.append(f"{source_name}:{type(exc).__name__}")

            if candidate is None:
                detail = f" [{' '.join(source_errors)}]" if source_errors else ""
                raise ValueError("exact_listing_not_resolved" + detail)

            target = canonical_item_url(candidate["itemUrl"])
            if not identity_ok(candidate.get("name", ""), seed):
                raise ValueError("identity_mismatch")
            if not safe_affiliate(candidate.get("affiliateUrl", ""), target):
                raise ValueError("unsafe_or_wrong_affiliate")
            image = candidate.get("image", "")
            if not isinstance(image, str) or not image.startswith("https://"):
                raise ValueError("image_unknown")

            mode, live_price = sales_audit(seed, candidate)

            products.append(
                {
                    "productId": seed["productId"],
                    "name": candidate.get("name") or seed["name"],
                    "brand": seed.get("brand", ""),
                    "categoryId": seed["categoryId"],
                    "methodIds": seed.get("methodIds", []),
                    "budgetTiers": seed.get("budgetTiers", []),
                    "audiences": seed.get("audiences", []),
                    "preferenceTags": seed.get("preferenceTags", []),
                    "coverCategoryIds": seed.get(
                        "coverCategoryIds", [seed["categoryId"]]
                    ),
                    "recommendationRole": seed.get(
                        "recommendationRole", "beginner_default"
                    ),
                    "score": seed.get("score", 80),
                    "price": int(live_price),
                    "itemCode": candidate.get("itemCode", ""),
                    "itemUrl": target,
                    "affiliateUrl": candidate["affiliateUrl"],
                    "image": image,
                    "verifiedAt": now,
                    "specVerifiedAt": seed["specCheckedAt"],
                    "audit": {
                        "status": "verified_live",
                        "mode": mode,
                        "salesSource": candidate["source"],
                        "specEvidence": seed.get("specEvidenceUrl", ""),
                    },
                }
            )
        except Exception as exc:
            failures[product_id] = (
                str(exc) if isinstance(exc, ValueError) else type(exc).__name__
            )
        time.sleep(0.45)

    return {
        "version": 1,
        "updatedAt": now,
        "status": "ok" if not failures else "partial",
        "products": products,
        "failures": failures,
    }


if __name__ == "__main__":
    payload = acquire()
    temp = OUT.with_suffix(".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    temp.replace(OUT)
    print(
        "FISHING catalog:",
        payload["status"],
        "verified:",
        len(payload["products"]),
        "failed:",
        len(payload["failures"]),
    )
