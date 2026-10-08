from __future__ import annotations
import json, sys, urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

MAX_SHARED_AGE_DAYS=7

def parse_time(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z","+00:00"))
    except Exception:
        return datetime.fromtimestamp(0,timezone.utc)

def canonical_item_url(value):
    value=str(value or "")
    try:
        u=urllib.parse.urlparse(value)
        if u.hostname=="hb.afl.rakuten.co.jp":
            value=urllib.parse.parse_qs(u.query).get("pc",[""])[0]
            u=urllib.parse.urlparse(value)
        if u.scheme!="https" or u.hostname!="item.rakuten.co.jp":
            return ""
        path="/"+"/".join(p for p in u.path.split("/") if p)+"/"
        return "https://item.rakuten.co.jp"+path
    except Exception:
        return ""

def safe_affiliate(product):
    try:
        u=urllib.parse.urlparse(str(product.get("affiliateUrl") or ""))
        return (
            u.scheme=="https"
            and u.hostname=="hb.afl.rakuten.co.jp"
            and canonical_item_url(product.get("affiliateUrl"))==canonical_item_url(product.get("itemUrl"))
        )
    except Exception:
        return False

def load_seed_map(seed_dir):
    root=Path(seed_dir)
    seeds={}
    if not root.exists():
        return seeds
    for path in sorted(root.glob("*.json")):
        try:
            seed=json.loads(path.read_text())
        except Exception:
            continue
        pid=seed.get("productId")
        if pid and seed.get("enabled",True) is not False:
            seeds[pid]=seed
    return seeds

def shared_product_valid(product,seed,now):
    if product.get("audit",{}).get("status")!="verified_live":
        return False,"not_verified_live"
    verified=parse_time(product.get("verifiedAt"))
    age=(now-verified).total_seconds()
    if age<0 or age>MAX_SHARED_AGE_DAYS*86400:
        return False,"stale"
    if not isinstance(product.get("price"),(int,float)) or product.get("price",0)<=0:
        return False,"bad_price"
    if not isinstance(product.get("image"),str) or not product.get("image","").startswith("https://"):
        return False,"bad_image"
    if not safe_affiliate(product):
        return False,"unsafe_affiliate"
    seed_url=canonical_item_url(seed.get("itemUrl"))
    product_url=canonical_item_url(product.get("itemUrl"))
    audit_seed_url=canonical_item_url(product.get("audit",{}).get("seedItemUrl"))
    if not seed_url or product_url!=seed_url:
        return False,"seed_url_mismatch"
    if audit_seed_url and audit_seed_url!=seed_url:
        return False,"audit_seed_url_mismatch"
    return True,"ok"

def normalize_shared_product(product,seed):
    merged=dict(product)
    # CAR STAY's local seed is authoritative for fit/recommendation semantics.
    merged["gapIds"]=list(seed.get("gapIds",[]))
    merged["recommendationRole"]=seed.get("recommendationRole","beginner_default")
    merged["score"]=seed.get("score",merged.get("score",80))
    merged["fitStrategy"]=seed.get("fitStrategy","vehicle")
    if merged["fitStrategy"]=="power":
        # The audited local seed owns electrical rating and fit evidence.
        merged["powerSpec"]=seed.get("powerSpec")
    merged["measurementFit"]=seed.get("measurementFit")
    merged["vehicleFit"]=seed.get("vehicleFit",[])
    merged["fitVerifiedAt"]=seed.get("fitCheckedAt")
    audit=dict(merged.get("audit") or {})
    audit["sharedCatalog"]=True
    merged["audit"]=audit
    return merged

def merge(directory,shared_file=None,seed_dir=None):
    root=Path(directory)
    files=sorted(root.glob("*.json"))
    if not files:
        raise SystemExit("no shard catalogs found")
    products={}
    failures={}
    deferred={}
    newest=datetime.fromtimestamp(0,timezone.utc)
    runtime=0
    policy_versions=set()
    for path in files:
        payload=json.loads(path.read_text())
        newest=max(newest,parse_time(payload.get("updatedAt")))
        runtime+=float(payload.get("runtimeBudgetSeconds") or 0)
        if payload.get("auditPolicyVersion"):
            policy_versions.add(str(payload.get("auditPolicyVersion")))
        for product in payload.get("products",[]):
            pid=product.get("productId")
            if not pid:
                continue
            current=products.get(pid)
            if current is None or parse_time(product.get("verifiedAt"))>=parse_time(current.get("verifiedAt")):
                products[pid]=product
        failures.update(payload.get("failures",{}))
        deferred.update(payload.get("deferred",{}))

    shared_imported=[]
    shared_rejected={}
    shared_updated_at=None
    if shared_file and seed_dir and Path(shared_file).exists():
        try:
            shared=json.loads(Path(shared_file).read_text())
        except Exception:
            shared={}
        seed_map=load_seed_map(seed_dir)
        shared_updated_at=shared.get("updatedAt") or shared.get("generatedAt")
        newest=max(newest,parse_time(shared_updated_at))
        now=datetime.now(timezone.utc)
        for product in shared.get("products",[]) if isinstance(shared,dict) else []:
            pid=product.get("productId")
            seed=seed_map.get(pid)
            if not pid or not seed:
                if pid:
                    shared_rejected[pid]="seed_missing"
                continue
            valid,reason=shared_product_valid(product,seed,now)
            if not valid:
                shared_rejected[pid]=reason
                continue
            normalized=normalize_shared_product(product,seed)
            current=products.get(pid)
            if current is None or parse_time(normalized.get("verifiedAt"))>=parse_time(current.get("verifiedAt")):
                products[pid]=normalized
            failures.pop(pid,None)
            deferred.pop(pid,None)
            shared_imported.append(pid)

    for pid in list(products):
        failures.pop(pid,None)
        deferred.pop(pid,None)

    result={
        "version":1,
        "updatedAt":newest.isoformat(),
        "auditPolicyVersion": next(iter(policy_versions)) if len(policy_versions)==1 else ("mixed" if policy_versions else None),
        "status":"ok" if not failures and not deferred else "partial",
        "products":sorted(products.values(),key=lambda p:(
            (p.get("vehicleFit") or [{}])[0].get("vehicleId",""),
            (p.get("gapIds") or [""])[0],
            -(p.get("score") or 0)
        )),
        "failures":dict(sorted(failures.items())),
        "deferred":dict(sorted(deferred.items())),
        "runtimeBudgetSeconds":runtime,
        "shardsMerged":len(files),
        "sources":{
            "sharedUpdatedAt":shared_updated_at,
            "sharedImported":len(set(shared_imported)),
            "sharedRejected":len(shared_rejected)
        },
        "sharedRejected":dict(sorted(shared_rejected.items()))
    }
    return result

if __name__=="__main__":
    if len(sys.argv)<3:
        raise SystemExit("usage: merge_product_shards.py <input-dir> <output-file> [shared-file] [seed-dir]")
    shared_file=sys.argv[3] if len(sys.argv)>=4 else None
    seed_dir=sys.argv[4] if len(sys.argv)>=5 else None
    payload=merge(sys.argv[1],shared_file,seed_dir)
    out=Path(sys.argv[2])
    out.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n")
    print(
        "CAR STAY merged catalog:",
        "verified:",len(payload["products"]),
        "failed:",len(payload["failures"]),
        "deferred:",len(payload["deferred"]),
        "shared:",payload["sources"]["sharedImported"],
        "shards:",payload["shardsMerged"]
    )
