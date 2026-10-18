# Daily renewal of independently verified CAMP items

## Current independently verified catalog (2026-10-17)

CAMP now has **eight independently reverified original seller listings**, each requiring its own strict API + browser evidence:

| Category | Model | Seller item code | Last checked price |
| --- | --- | --- | ---: |
| Sleeping bag | Coleman Performer III/C5 2000034774 | naturum-outdoor:10241000 | ¥5,490 |
| Tent | Coleman Tough Dome VI/3025 2206745 | naturum-outdoor:10712574 | ¥37,680 |
| Chair | Coleman Healing Chair NX Olive 2190857 | naturum-outdoor:10639044 | ¥5,090 |
| Mat | Coleman Camper Inflator Mat High Peak/Single 2000036153 | cross-one:10020252 | ¥15,238 |
| Table | Coleman Natural Puzzle Table/90 2205816 | naturum-outdoor:10697876 | ¥8,800 |
| Cooler | Coleman Ultimate Ice Cooler II 25L 2238149 | naturum-outdoor:10744086 | ¥6,990 |
| LED lantern | Coleman Quad Multi Panel Lantern plus 2218364 | naturum:18742983 | ¥10,454 |
| Fire pit | Coleman Fire Disk Solo 2000037404 | kanedestore:10014957 | ¥4,869 |

Tent/chair evidence: [GitHub Actions run #39048471797](https://github.com/stusaurus/sotojitaku/actions/runs/39048471797), artifact #12105684948. Mat/table evidence: [GitHub Actions run #39092237517](https://github.com/stusaurus/sotojitaku/actions/runs/39092237517), artifact #12123132877. Cooler/LED evidence: [GitHub Actions run #39093674946](https://github.com/stusaurus/sotojitaku/actions/runs/39093674946), artifact #12124200593. Fire pit proof: [GitHub Actions run #39098638954](https://github.com/stusaurus/sotojitaku/actions/runs/39098638954), artifact #12125493604. All eight are now included in the bounded daily renewal loop. A confirmed Rakuten 429 stops further requests for that run, rather than consuming shared quota. If any independently verified product expires without successful renewal, its old timestamp is **never extended** and it is not recommended. **Two CAMP categories remain unverified: burner and hot sandwich maker.**; full catalog diversity tests still correctly fail.


The original one-item renewal has been extended to the eight explicitly certified original merchant SKUs listed above. Other categories remain unavailable until independent current sales evidence exists.

## Automatic cycle
- GitHub Actions: [Renew one strictly verified CAMP seller offer](../../.github/workflows/refresh-verified-camp-offer.yml) runs once daily around **09:40 JST** and checks only the eight certified original SKUs (at most eight Item API requests per run), plus on initial deployment or deliberate manual dispatch.
- It uses the **exact original merchant item code** in a single read-only Rakuten Item API request. It accepts only unchanged original shop, item code, destination URL, valid matching model and seller identity; explicit stock, tax-included and shipping-included flags; a plausible price and one fixed purchasable price range.
- Only if the API passes does it open the seller's original page using standard headless Chrome **once**, without proxy, stealth, captcha bypass, carts or affiliate clicks.
- It validates `itemInfoSku` with the pre-existing strict seller rules **including itemId matching the old merchant item code**, NORMAL/allowed purchase, exactly one fixed in-stock variant, same current price and model.
- Successful independent proof regenerates `listingAuditedAt` and `verifiedAt`, seller evidence trace and current price/affiliate/image while retaining audited manufacturer specifications and compatibility logic. No existing review ratings or old price are copied.

## Failure cases
- Temporary 429, network failure or missing page HTML **do not extend the seven-day freshness clock**. An already-valid offer may remain through its original expiry; after seven days, the offer is retired automatically. The user-facing product filters still fail closed independently.
- Explicit out-of-stock, changed product/shop, changed available price, unrelated itemId, variable seller SKU, unavailable tax/shipping or accessory match **immediately retire the offer**, including during the remaining freshness window.
- When no product is sufficiently proven, the published catalog may correctly contain zero products with honest failed categories. The free diagnosis, owned items, rental/zero-purchase fallback and safety guidance remain.
- The workflow commits only test-verified changes. It fingerprints the source files and both catalogs **before** independent acquisition and rechecks them against main before publication to prevent a stale push. An Actions artifact holds sanitized reason codes; no secret/raw page is stored.

## Original bulk catalog job
The legacy audited product refresh still exists, but is now scheduled **weekly and manually**; it does not trigger when the single-product renewal changes audit timestamps. Its comprehensive CAMP quality tests still fail while category breadth remains inadequate. These tests were not made green artificially.

## Expanding recovery
Each future category requires an individually audited seller URL, exact official API item-code match, a current seller browser proof, manufacturer and safety checks and regression tests. Never add new products solely on a successful API response or backdate audits. Review successful offers with [PR #273](https://github.com/stusaurus/sotojitaku/pull/273) as the evidence baseline.
