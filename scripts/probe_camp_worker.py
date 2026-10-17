"""Read-only Worker contract probe. No affiliate clicks, purchases or secret logging.

Run in GitHub Actions (outbound network allowed) to inspect the *actual*
deployed Worker schema and exact Rakuten item responses before changing
product validation or audit timestamps.
"""
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKER = ""
WORKER_HOSTS = [
    "https://daily-cost-api.kiyo0625puma.workers.dev",
    "https://daily-cost-api.stuffedsaurus.workers.dev",
]
HEADERS = {
    "Origin": "https://stusaurus.github.io",
    "Referer": "https://stusaurus.github.io/sotojitaku/",
    "User-Agent": "sotojitaku-camp-worker-contract-probe/1.0",
}
SAMPLES = ["2000039087", "2000038429", "ST-310", "2000034774"]


def request(endpoint, params):
    url = WORKER + endpoint + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            return response.status, json.loads(response.read(500_000).decode())
    except urllib.error.HTTPError as error:
        # Only retain publicly safe machine status fields. Never print upstream
        # messages, request URLs or authentication/affiliate credentials.
        try:
            body = json.loads(error.read(20_000).decode("utf-8"))
            safe = {k: body.get(k) for k in ("error", "upstream_status", "reason")}
        except (ValueError, UnicodeError):
            safe = {}
        return error.code, safe
    except (TimeoutError, urllib.error.URLError, ValueError):
        return 0, {}


def canonical_affiliate_url(affiliate):
    try:
        parsed = urllib.parse.urlparse(affiliate)
        if parsed.scheme != "https" or parsed.netloc != "hb.afl.rakuten.co.jp":
            return ""
        return urllib.parse.parse_qs(parsed.query).get("pc", [""])[0]
    except (TypeError, ValueError):
        return ""


def item_flags(product, audit):
    return {
        "found": product.get("found") is True,
        "lookup_method": product.get("lookup_method"),
        "exact_item_url": product.get("item_url") == audit["itemUrl"],
        "exact_item_code": product.get("item_code") == audit.get("itemCode"),
        "affiliate_matches_item": canonical_affiliate_url(product.get("affiliate_url")) == audit["itemUrl"],
        "available": product.get("availability") == 1,
        "price_valid": isinstance(product.get("price"), int) and product["price"] > 0,
        "image_https": str(product.get("image", "")).startswith("https://"),
        "model_in_title": audit["model"].casefold() in str(product.get("name", "")).casefold(),
    }


audits = json.loads((ROOT / "data/audited-products.json").read_text())["products"]
for WORKER in WORKER_HOSTS:
    print('WORKER_HOST', WORKER.split('//', 1)[-1])
    status, health = request("/health", {})
    print("WORKER_HEALTH", json.dumps({
        "http": status, "ok": health.get("ok"), "matching": health.get("matching"),
    }, ensure_ascii=False))
    for model in SAMPLES:
        audit = next(p for p in audits if p.get("model") == model)
        status, item = request("/api/item-lookup", {
            "url": audit["itemUrl"], "itemCode": audit.get("itemCode", ""), "q": audit.get("model", ""),
        })
        print("EXACT_ITEM", model, json.dumps({
            "http": status, **item_flags(item, audit),
            "reason": item.get("reason"), "upstream_error": item.get("error"),
            "upstream_status": item.get("upstream_status"),
        }, ensure_ascii=False))
        status, lookup = request("/api/shipping-lookup", {
            "code": audit.get("lookupCode", ""), "name": audit.get("name", ""),
            "brand": audit.get("brand", ""),
        })
        matched = lookup.get("shipping_included_url", "")
        print("SHIPPING_LOOKUP", model, json.dumps({
            "http": status, "found": lookup.get("found"),
            "method": lookup.get("lookup_method"),
            "exact_item_url": canonical_affiliate_url(matched) == audit["itemUrl"],
            "upstream_error": lookup.get("error"),
            "upstream_status": lookup.get("upstream_status"),
        }, ensure_ascii=False))
