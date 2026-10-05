from __future__ import annotations
import json, sys
from datetime import datetime, timezone
from pathlib import Path

def parse_time(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z","+00:00"))
    except Exception:
        return datetime.fromtimestamp(0,timezone.utc)

def merge(directory):
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
    for pid in list(products):
        failures.pop(pid,None)
        deferred.pop(pid,None)
    result={
        "version":1,
        "updatedAt":newest.isoformat(),
        "auditPolicyVersion": next(iter(policy_versions)) if len(policy_versions)==1 else ("mixed" if policy_versions else None),
        "status":"ok" if not failures and not deferred else "partial",
        "products":sorted(products.values(),key=lambda p:(p.get("vehicleFit",[{}])[0].get("vehicleId",""),p.get("gapIds",[""])[0],-(p.get("score") or 0))),
        "failures":dict(sorted(failures.items())),
        "deferred":dict(sorted(deferred.items())),
        "runtimeBudgetSeconds":runtime,
        "shardsMerged":len(files)
    }
    return result

if __name__=="__main__":
    if len(sys.argv)<3:
        raise SystemExit("usage: merge_product_shards.py <input-dir> <output-file>")
    payload=merge(sys.argv[1])
    out=Path(sys.argv[2])
    out.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n")
    print("CAR STAY merged catalog:","verified:",len(payload["products"]),"failed:",len(payload["failures"]),"deferred:",len(payload["deferred"]),"shards:",payload["shardsMerged"])
