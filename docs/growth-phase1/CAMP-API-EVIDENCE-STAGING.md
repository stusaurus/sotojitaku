# CAMP official API evidence staging (research-only)

## Why this exists
As of 2026-10-17, the 51 legacy sales audits are dated October 4–5, and the 49 published CAMP products' seven-day `verifiedAt` values are stale. GitHub-hosted seller HTML often returns a very short anti-bot response, so it does not prove the current fixed SKU, stock or cart conditions.

Official [Rakuten Ichiba Item Search API 2026-07-01](https://webservice.rakuten.co.jp/index.php/documentation/ichiba-item-search) does provide itemCode, itemPrice, availability, taxFlag, postageFlag, itemPriceMin3 and itemPriceMax3. **It does not prove a unique fixed seller SKU or the sale page's cart/option behavior.** Equal min/max price therefore remains insufficient for publication.

## Stage, do not publish
- The Worker endpoint `/api/item-evidence` (in daily-cost-jp) performs exactly **one authenticated Rakuten Item API request** by the original merchant item code, without an HTML fetch or a fuzzy replacement search. Returns numeric flags and an explicit `seller_variant_verified: false`.
- `scripts/stage_camp_api_evidence.py` attempts at most **two distinct CAMP categories per run** using existing manually audited codes. It requires identical seller URL, exact affiliate destination, exact code and shop, current product name/identity, explicitly confirmed stock, tax-included and postage-included flags, valid price and equal purchasable price range. Other cases are rejected with a reason.
- The one candidate success status is `api_confirmed_seller_variant_audit_required` with `verifiedForPublication: false`. It is not a product recommendation.
- The report is an **Actions artifact**, `camp-api-evidence-candidates`, retained for 14 days. Neither the GitHub Pages catalog nor its verified timestamps change.
- An upstream 429 stops the run after its first attempted SKU; further queries are not made. With existing CDN/restrictions, an artifact can contain only rejection/error statuses.
- No recurring schedule is enabled to avoid shared Rakuten quota abuse. The first live run is triggered once after merging the staging implementation to main. Later runs require `workflow_dispatch`. For a later manual run, `--offset 2 --limit 2` samples the next categories.

## Independent seller audit needed for publication
Each staged candidate still requires current first-party sale-page or seller-provided evidence for fixed variant and quantity, accessible stock and purchasable cart price, plus all existing manufacturer specification, safety and completeness gates. If current verified evidence cannot be gathered, do not copy candidates into `data/products.json`, alter audit dates, claim purchase readiness or enable a checkout CTA. For a seller code changed from the historical audit, first perform a new identity and SKU audit.

## Consumer impact
The existing CAMP free diagnosis, gear plan, owned/rented/0-yen paths, safety instructions and alternative guidance remain live. An unverified product is not displayed as a real-time offer, and old prices are not presented as verified.
