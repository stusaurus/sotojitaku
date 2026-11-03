"""Fail-closed verification for FISHING's documented partial catalog release.

The normal check_catalog.py still demands complete basket coverage.
Only the three enumerated shortages in Issue #302 can be published as
explicitly incomplete; upstream evidence and sale identity must be current.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "fishing/data/audited-products.json"
STRICT = ROOT / "fishing/scripts/check_catalog.py"
KNOWN_GAPS = {
    "choi_nage/low/rod_reel": "lumica-choi-start-g09224",
    "family_child/child_m/life_jacket_child": "shimano-vf098v-kids-m",
    "family_child/child_l/life_jacket_child": "shimano-vf098v-kids-l",
}


def utc_timestamp(value):
    try:
        date = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if date.tzinfo is None:
            raise ValueError("missing time zone")
        return date.astimezone(timezone.utc)
    except (ValueError, TypeError) as exc:
        raise ValueError("missing or invalid dated evidence") from exc


def canonical_item(value):
    try:
        url = urlsplit(str(value))
        if (url.scheme != "https" or url.hostname != "item.rakuten.co.jp"
                or url.username or url.password or url.port
                or len(url.path.strip("/").split("/")) < 2):
            return ""
        return "https://item.rakuten.co.jp/" + url.path.strip("/") + "/"
    except ValueError:
        return ""


def verify_seller_evidence(catalog, now=None):
    now = now or datetime.now(timezone.utc)
    errors = []
    products = catalog.get("products")
    if not isinstance(products, list) or not products:
        return ["empty verified catalog"]
    try:
        age = now - utc_timestamp(catalog.get("updatedAt"))
        if not timedelta(0) <= age <= timedelta(hours=48):
            errors.append("shared catalog must be updated within 48 hours")
    except ValueError:
        errors.append("shared catalog updatedAt invalid")
    if catalog.get("verifiedCount") != len(products):
        errors.append("verifiedCount differs from product count")
    seen = set()
    for product in products:
        key = product.get("productId")
        if not isinstance(key, str) or not key or key in seen:
            errors.append("missing or duplicated productId")
        seen.add(key)
        if product.get("audit", {}).get("status") != "verified_live":
            errors.append(f"{key}: unverified seller")
        try:
            age = now - utc_timestamp(product.get("verifiedAt"))
            if not timedelta(0) <= age <= timedelta(days=7):
                errors.append(f"{key}: expired or future sale verification")
        except ValueError:
            errors.append(f"{key}: invalid sale verification")
        if not isinstance(product.get("price"), int) or product["price"] <= 0:
            errors.append(f"{key}: invalid price")
        if not str(product.get("image", "")).startswith("https://"):
            errors.append(f"{key}: invalid image")
        if not isinstance(product.get("itemCode"), str) or ":" not in product["itemCode"]:
            errors.append(f"{key}: missing seller itemCode")
        target = canonical_item(product.get("itemUrl"))
        try:
            affiliate = urlsplit(str(product.get("affiliateUrl", "")))
            if (affiliate.scheme != "https" or affiliate.hostname != "hb.afl.rakuten.co.jp"
                    or affiliate.username or affiliate.password or affiliate.port):
                raise ValueError("untrusted affiliate host")
            destination = parse_qs(affiliate.query).get("pc", [""])[0]
        except ValueError:
            destination = ""
        if not target or canonical_item(destination) != target:
            errors.append(f"{key}: affiliate target differs from validated item")
        if product.get("categoryId") == "life_jacket_child":
            fit = product.get("fit") or {}
            height, weight = fit.get("heightCm") or {}, fit.get("weightKg") or {}
            size = fit.get("size")
            if not (size in ("M", "L")
                    and "child_" + size.lower() in product.get("preferenceTags", [])
                    and "child" in product.get("audiences", [])
                    and all(isinstance(height.get(f), (int, float)) for f in ("min", "max"))
                    and all(isinstance(weight.get(f), (int, float)) for f in ("min", "maxExclusive"))):
                errors.append(f"{key}: child PFD fit is not independently defined")
    return errors


def check_documented_missing(missing, catalog):
    if not missing:
        return []
    errors = []
    unknown = set(missing) - set(KNOWN_GAPS)
    if unknown:
        errors.append("unexpected required product gaps: " + ", ".join(sorted(unknown)))
    if catalog.get("status") != "partial":
        errors.append("incomplete baskets require partial catalog status")
    failures = catalog.get("failures")
    if not isinstance(failures, dict):
        return errors + ["missing failed-seed reasons"]
    for gap in set(missing) & set(KNOWN_GAPS):
        if not failures.get(KNOWN_GAPS[gap]):
            errors.append("missing upstream failure record: " + gap)
    return errors


def main():
    data = json.loads(CATALOG.read_text())
    errors = verify_seller_evidence(data)
    if errors:
        for error in errors:
            print("PARTIAL RELEASE BLOCKED:", error, file=sys.stderr)
        return 1
    strict = subprocess.run(
        [sys.executable, str(STRICT)], cwd=ROOT,
        capture_output=True, text=True, check=False,
    )
    print(strict.stdout, end="")
    if strict.stderr:
        print(strict.stderr, end="", file=sys.stderr)
    if strict.returncode == 0:
        print("STRICT FULL BASKET: all required seller categories available")
        return 0
    lines = strict.stdout.splitlines()
    if "MISSING CORE PRODUCT COVERAGE" not in lines:
        print("strict completeness audit did not enumerate known gaps", file=sys.stderr)
        return 1
    missing = [line[2:] for line in lines if line.startswith("- ")]
    if not missing:
        print("strict audit failed without missing-category evidence", file=sys.stderr)
        return 1
    errors = check_documented_missing(missing, data)
    if errors:
        for error in errors:
            print("PARTIAL RELEASE BLOCKED:", error, file=sys.stderr)
        return 1
    print("PARTIAL ONLY: unresolved required products:", ", ".join(sorted(missing)))
    print("Complete-basket audit remains FAILED; see Issue #302. Never claim a full kit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
