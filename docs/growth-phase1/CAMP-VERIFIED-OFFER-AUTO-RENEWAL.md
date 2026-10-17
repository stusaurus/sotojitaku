# Daily renewal of the first independently verified CAMP item

The current CAMP catalog has **one** reverified Coleman Performer III/C5 (model `2000034774`) offer from the originally audited Rakuten shop `naturum-outdoor`. The other nine gear categories remain unavailable because they do not have fresh independent sale evidence.

## Automatic cycle
- GitHub Actions: [Renew one strictly verified CAMP seller offer](../../.github/workflows/refresh-verified-camp-offer.yml) runs once daily around **09:40 JST**, plus on initial deployment or deliberate manual dispatch.
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
