"""Check that the live verified FISHING catalog can complete core MVP baskets."""
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
catalog=json.loads((ROOT/"fishing/data/audited-products.json").read_text())
products=catalog.get("products",[])

required={
    "sabiki":["rod_reel","rig","bait","life_jacket_adult","bucket","fish_grip","scissors"],
    "choi_nage":["rod_reel","rig","bait","life_jacket_adult","fish_grip","scissors","pliers"],
}
budgets=["low","balanced","long_term"]

def supported(method,budget,category):
    for p in products:
        if method not in p.get("methodIds",[]): continue
        if budget not in p.get("budgetTiers",[]): continue
        if category in p.get("coverCategoryIds",[]): return True
    return False

missing=[]
for method,categories in required.items():
    for budget in budgets:
        for category in categories:
            if not supported(method,budget,category):
                missing.append(f"{method}/{budget}/{category}")

# Child PFD is a separate hard safety gate.
if not any(
    "life_jacket_child" in p.get("coverCategoryIds",[])
    and "sabiki" in p.get("methodIds",[])
    for p in products
):
    missing.append("family_child/life_jacket_child")

# At least one cooler must exist in every budget for take-home scenarios.
for budget in budgets:
    if not any(
        "cooler" in p.get("coverCategoryIds",[])
        and budget in p.get("budgetTiers",[])
        for p in products
    ):
        missing.append(f"take_home/{budget}/cooler")

if missing:
    print("MISSING CORE PRODUCT COVERAGE")
    for item in missing:
        print("-",item)
    raise SystemExit(1)

print("Core FISHING product coverage OK:",len(products),"verified products")
