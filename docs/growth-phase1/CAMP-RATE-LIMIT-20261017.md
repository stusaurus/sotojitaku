# CAMP Rakuten API rate-limit investigation — 2026-10-17

## Observed (actual GitHub Actions)
- Last CAMP published catalog: 49 audited items, every `verifiedAt=2026-10-07T13:41:19Z`; exceeded the seven-day product eligibility window.
- Live read-only Worker probe after the deployment of daily-cost-jp PR #103: [workflow run](https://github.com/stusaurus/sotojitaku/actions/runs/39028207925).
- On both legacy `kiyo0625puma` and deployment `stuffedsaurus` Worker hosts, the exact-item lookup returned HTTP 502 / `rakuten_api_error` / **`upstream_status: 429`** for tested Coleman products. This proves Rakuten-side request limiting in those attempts, **not** whether there is a daily quota, per-second limit or transient throttling.
- The ST-310 lookup sometimes produced `exact_item_not_found` and sometimes 429; a separate shipping-lookup returned a matching URL and new Worker method `product_code_search_name_specs_verified`.
- The CAMP sales-page gate returned tiny blocked HTML responses, while the original listing audit is older than seven days. No verified fresh sale prices/variants can be asserted.

## Fail-closed containment in this PR
- Identify a definite upstream 429 even when the Worker wraps it as HTTP 502.
- Open a circuit immediately on a proven 429, or after three consecutive upstream API faults. Mark the rest of the product run as skipped due to the circuit.
- Do not keep hammering external API endpoints once limited.
- Preserve existing strict original item URL, model, variant, seller, pricing, images, shipping, suitability and **7-day stale** rejection. No timestamps, price or products are fabricated.
- Existing `npm test` and Growth audit remain red if CAMP catalog coverage is actually stale or absent; a shortened error log does not imply a healthy production catalog.

## Next operational requirements
1. Determine the real Rakuten throttling scope from official service docs/account controls or an authorized API dashboard. The public 429 status alone is not enough to infer limits. Coordinate requests across sites and jobs according to confirmed limits.
2. After throttling recovers, find independently verifiable exact active SKUs and re-audit sale page price, stock, variants, postage, affiliate destination and model. The current Worker exact item route still does not provide all proof needed to bypass the sales-page gate.
3. Only publish a new `data/products.json` when the whole actual catalog gate passes (and `npm test` is green). Verify the live Pages data and full journeys. CAR STAY and FISHING can continue their own guarded refreshes.
