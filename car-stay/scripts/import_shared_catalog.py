#!/usr/bin/env python3
"""Merge the verified CAR STAY catalog exported by daily-cost-jp.

daily-cost-jp already has the Rakuten API credentials. This importer lets
SOTOJITAKU consume that verified public artifact without requiring duplicate
Rakuten or Cloudflare deployment secrets in this repository.

Fail-closed rules:
- shared products must still exist as a current local seed
- gapIds / vehicleFit must match the local seed exactly
- audit status must be verified_live
- verifiedAt must be within seven days
- price/image/affiliate destination must be valid
- for duplicate productIds, the newest verified product wins
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SEED_DIR=ROOT/"car-stay"/"data"/"product-seeds"
CATALOG=ROOT/"car-stay"/"data"/"audited-products.json"
SHARED_URL=os.environ.get(
    "CAR_STAY_SHARED_CATALOG_URL",
    "https://raw.githubusercontent.com/stusaurus/daily-cost-jp/main/shared-data/sotojitaku-car-stay-products.json",
).strip()

def canonical_item_url(value):
    try:
        text=str(value or "")
        u=urllib.parse.urlparse(text)
        if u.hostname=="hb.afl.rakuten.co.jp":
            text=urllib.parse.parse_qs(u.query).get("pc",[""])[0]
            u=urllib.parse.urlparse(text)
        if u.scheme!="https" or u.hostname!="item.rakuten.co.jp":
            return ""
        path="/"+"/".join(part for part in u.path.split("/") if part)+"/"
        return "https://item.rakuten.co.jp"+path
    except Exception:
        return ""

def safe_affiliate(product):
    try:
        u=urllib.parse.urlparse(str(product.get("affiliateUrl") or ""))
        if u.scheme!="https" or u.hostname!="hb.afl.rakuten.co.jp":
            return False
        return bool(canonical_item_url(product.get("itemUrl"))) and (
            canonical_item_url(product.get("affiliateUrl"))==
            canonical_item_url(product.get("itemUrl"))
        )
    except Exception:
        return False

def parse_time(value):
    try:
        return datetime.fromisoformat(str(value or "").replace("Z","+00:00"))
    except Exception:
        return None

def fresh(product,now,max_days=7):
    verified=parse_time(product.get("verifiedAt"))
    if not verified:
        return False
    age=(now-verified).total_seconds()
    return 0<=age<=max_days*86400

def load_json(path):
    try:
        return json.loads(Path(path).read_text())
    except Exception:
        return {}

def load_seed_map(seed_dir=SEED_DIR):
    result={}
    for path in sorted(Path(seed_dir).glob("*.json")):
        seed=json.loads(path.read_text())
        pid=seed.get("productId")
        if pid:
            result[pid]=seed
    return result

def normalized(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"))

def matches_seed(product,seed):
    if normalized(product.get("gapIds") or [])!=normalized(seed.get("gapIds") or []):
        return False
    if normalized(product.get("vehicleFit") or [])!=normalized(seed.get("vehicleFit") or []):
        return False
    if product.get("recommendationRole","beginner_default")!=seed.get("recommendationRole","beginner_default"):
        return False
    return True

def valid_product(product,seed,now):
    if not isinstance(product,dict) or not seed:
        return False
    if product.get("audit",{}).get("status")!="verified_live":
        return False
    if not fresh(product,now):
        return False
    if not matches_seed(product,seed):
        return False
    price=product.get("price")
    if not isinstance(price,(int,float)) or price<=0:
        return False
    image=product.get("image")
    if not isinstance(image,str) or not image.startswith("https://"):
        return False
    if not safe_affiliate(product):
        return False
    if not canonical_item_url(product.get("itemUrl")):
        return False
    return True

def fetch_shared(url=SHARED_URL):
    if os.environ.get("CAR_STAY_SHARED_CATALOG_FILE"):
        return load_json(os.environ["CAR_STAY_SHARED_CATALOG_FILE"])
    req=urllib.request.Request(url,headers={"User-Agent":"sotojitaku-car-stay-shared-sync/1.0"})
    with urllib.request.urlopen(req,timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))

def merge_catalogs(local,shared,seeds,now=None):
    now=now or datetime.now(timezone.utc)
    candidates={}
    rejected={}
    for source,payload in (("local",local),("shared",shared)):
        for product in (payload.get("products") or []):
            pid=product.get("productId")
            seed=seeds.get(pid)
            if not pid or not valid_product(product,seed,now):
                if pid:
                    rejected[pid]=source+"_invalid_or_stale"
                continue
            existing=candidates.get(pid)
            if existing is None:
                candidates[pid]=product
                continue
            old=parse_time(existing.get("verifiedAt")) or datetime.min.replace(tzinfo=timezone.utc)
            new=parse_time(product.get("verifiedAt")) or datetime.min.replace(tzinfo=timezone.utc)
            if new>old:
                candidates[pid]=product

    products=sorted(candidates.values(),key=lambda p:p.get("productId",""))
    shared_failures=shared.get("failures") if isinstance(shared.get("failures"),dict) else {}
    local_failures=local.get("failures") if isinstance(local.get("failures"),dict) else {}
    failures={**local_failures,**shared_failures}
    # A currently verified product is not a failure, regardless of a stale source's miss.
    for product in products:
        failures.pop(product.get("productId"),None)
    return {
        "version":1,
        "updatedAt":now.isoformat(),
        "auditPolicyVersion":"carstay-merged-local-and-daily-cost-v1",
        "status":"ok" if not failures else "partial",
        "products":products,
        "failures":dict(sorted(failures.items())),
        "deferred":{},
        "sources":{
            "localUpdatedAt":local.get("updatedAt"),
            "sharedUpdatedAt":shared.get("updatedAt"),
            "sharedPolicy":shared.get("auditPolicyVersion"),
        },
        "rejected":dict(sorted(rejected.items())),
    }

def main():
    local=load_json(CATALOG)
    shared=fetch_shared()
    seeds=load_seed_map()
    if not isinstance(shared,dict):
        raise RuntimeError("shared_catalog_invalid")
    result=merge_catalogs(local,shared,seeds)
    tmp=CATALOG.with_suffix(".tmp")
    tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    tmp.replace(CATALOG)
    print(
        "CAR STAY shared sync:",
        "local",len(local.get("products") or []),
        "shared",len(shared.get("products") or []),
        "merged",len(result["products"]),
        "rejected",len(result["rejected"]),
    )

if __name__=="__main__":
    main()
