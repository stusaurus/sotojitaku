# CAMP first seller-page recovery proof · 2026-10-17

## Input
- Research-only official API staging run: [39034009185](https://github.com/stusaurus/sotojitaku/actions/runs/39034009185). `2000034774` was eligible for an independent seller audit; `2000032354` was not found at the previously audited exact URL/item code.
- Historic seller: `https://item.rakuten.co.jp/naturum-outdoor/2941537/`, shop code `naturum-outdoor`. A similar listing exists at `naturum/2941537/`, but it is a **different storefront** and can never be substituted without a fresh independent audit.
- The manufacturer's sleeping bag `Coleman Performer III/C5 (2000034774)` has comfort temperature at least 5°C, 1.4 kg weight and 24×41 cm packed size, per existing manufacturer-specified audits. These specifications alone do not establish current sale terms.

## What the browser probe does
1. Official API lookup by the original exact seller itemCode, once via the existing shared `/api/item-evidence` Worker route. A 429 skips all seller requests.
2. Demand exact seller item URL, affiliate `pc` destination, shop code, item code, manufacturer identity, in-stock, shipping-included, tax-included, sensible current price, and equal minimum/maximum purchasable prices.
3. Open only the **original shop's** sales page using ordinary headless Chrome in GitHub Actions. No proxy, fingerprint spoofing, captcha solving, pagination or add-to-cart requests. The page may block access; this is recorded as evidence unavailable.
4. Reuse the existing strict `refresh_worker.parse_listing`: correct normal seller sale, purchase enabled, one positive-quantity stock entry, correct fixed SKU, current displayed price, and model. Redirected storefronts are rejected.
5. Upload a single nonpublic **research-only artifact**. Even if both proofs pass, no `verifiedAt`, price, catalog item or checkout CTA is changed; separate full catalog coverage/test approval remains required.

## Outcomes
The script emits one of:
- `official_api_evidence_insufficient`: missing or invalid current API match (including 429)
- `seller_browser_fetch_failed`: browser cannot load the page
- `seller_page_redirect_or_identity_mismatch`: browser moved to another item/shop
- `seller_page_conditions_unverified`: missing proof, stock, options or price
- `independent_seller_and_api_evidence_review_required`: original URL and current page support an audit; ready for final validation, **not automatic publication**

This probe is scoped to exactly one formerly audited item. It is not run on every CI or scheduled nightly; after its initial merge-triggered execution further attempts are manual only.
