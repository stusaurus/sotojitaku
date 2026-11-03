"""Synthetic, expired baseline entries for strict CAMP renewal unit tests only.

The checked-in public catalog intentionally drops rejected or unavailable sellers.
A unit test for all nine *audited target IDs* must therefore not require all nine
to be currently advertised. Missing test baselines are explicitly marked expired;
only fresh independent API + seller proofs in the mocked renewal may restore them.
Nothing here is loaded by a product pipeline or published as live evidence.
"""
import copy
from datetime import timedelta
from urllib.parse import quote


def restore_expired_test_baselines(audits, catalog, targets, now):
    records = { (p.get("category"),p.get("model")):copy.deepcopy(p)
                for p in catalog.get("products",[]) }
    audit_records = { (a.get("category"),a.get("model")):a
                      for a in audits.get("products",[]) }
    for target in targets:
        if target in records:
            continue
        audited = audit_records.get(target)
        if not audited:
            raise AssertionError("original audited target missing: "+repr(target))
        stamped = (now-timedelta(days=8)).isoformat()
        records[target] = {
            **copy.deepcopy(audited),
            "verifiedAt": stamped,
            "listingAuditedAt": stamped,
            "price": max(1,int(audited["referencePrice"])),
            "priceAudit": True,
            "affiliateUrl": ("https://hb.afl.rakuten.co.jp/hgc/test-fixture/?pc="
                             +quote(audited["itemUrl"],safe="")),
            "image": "https://thumbnail.image.rakuten.co.jp/test-fixture.jpg",
            "shipping": "included",
            "verificationMode": "sales_page_and_official_item_api",
            "_unit_test_expired_placeholder": True,
        }
    catalog["products"]=[records[target] for target in targets]
    return catalog
