# CAMP candidate recovery audit — 2026-10-22

This extends Draft PR #291. It is not a deployment or a claim of search growth.
The original four engine coverage/diversity tests remain mandatory and unchanged.

## Published catalog baseline

Counts use the actual `reject` and `recommend` implementation and existing
engine-test profiles: car solo (spring, 1 night), walking solo (same), and
car family (2 adults + 2 children, autumn, 1 night, BBQ/bonfire/coffee).
Each count is identical for easy, comfort, compact and value: preferences
change scores, not the eligible inventory. One candidate cannot provide
meaningfully different recommendations. Counts are offers, not users or units.

| Category | Car solo | Walking solo | Car family four |
| --- | ---: | ---: | ---: |
| tent | 1 | 0 | 1 |
| sleeping_bag | 1 | 1 | 1 |
| mat | 1 | 0 | 1 |
| chair | 1 | 1 | 1 |
| table | 1 | 0 | 0 |
| led_lantern | 1 | 1 | 1 |
| burner | 0 | 0 | 0 |
| cooler | 1 | 1 | 1 |
| fire_pit | 1 | 1 | 0 |
| hot_sandwich_maker | 1 | 1 | 1 |

Missing current offers and unsuitable products are different:

- Historical unpublished products marked `not_reverified` lack fresh seller
  evidence. This is not evidence of stock zero or discontinued manufacture.
- The published tent/mat/table fail walking weight gates. No limit is raised.
- Published table and fire pit lack four-person suitability. No capacity is
  inferred from a photograph, price, category or arbitrary dimensions.
- Walking restoration candidates: tent 2000038141, mat 1124667, table
  2000038844. Family tent/table/cooler/fire-pit alternatives still need
  independently current seller and manufacturer evidence before publication.

## Two additional requalified original sellers

Official exact-item API observed 2026-10-22T10:15:28.506507Z; exactly two calls,
no retries, no 429. Both results passed identity, original merchant URL,
affiliate destination, availability=1, tax_flag=0, postage_flag=0 and identical
purchasable price bounds. Browser review of the same URLs followed that
observation and completed before 10:23:23Z. No cart/purchase/affiliate click.

### Walking solo tent

- Model 2000038141; `sports-bazaar:10314223`.
- Seller: https://item.rakuten.co.jp/sports-bazaar/s-40coleman-2000038141/
- API and seller price JPY 15,720. NORMAL sale and enabled purchase condition.
- Current embedded public `itemInfoSku`: itemId 10314223, one non-hidden SKU
  6785578, stock 54, exact manufacturer model, taxIncludedPrice 15720.
  Both selector axes contain a single `-` option, not alternative products.
- Manufacturer: https://ec.coleman.co.jp/item/2000038141.html
  1–2 persons, 4 kg, packed diameter 19 x 49 cm. Existing specs unchanged.

### Four-person family table

- Model 2205813; `naturum:18689872`.
- Seller: https://item.rakuten.co.jp/naturum/3454308/
- API and seller price JPY 10,890. NORMAL sale and enabled purchase condition.
- Current embedded public `itemInfoSku`: itemId 18689872, inventoryType single,
  empty SKU list, one inventory entry (SKU 3454308), stock 6; minPrice 10890;
  payment.taxIncluded=true; shipping.postageIncluded=true, singleItemShipping=0.
- Manufacturer dimensions, mass and packing:
  https://ec.coleman.co.jp/category/ITEM_LIST/2205813.html
- Explicit four-person suitability is on the manufacturer's model-specific
  120 section, not inferred from dimensions:
  https://ec.coleman.co.jp/sc/natural_puzzle.html
  The existing table_capacity=4 is retained and its missing field-level
  evidence link is supplied. The 150 is described as more spacious for four;
  the 90 is described for two or three. These distinctions are preserved.

This PR adds these two exact sellers to the existing strict renewal allowlist.
Fresh prices, affiliate URLs and verifiedAt must be obtained again by that
renewal before publication; research prices are not copied into products.json.
The bounded ceiling becomes 12; any confirmed 429 stops remaining calls.
Seven-day expiry, fixed quantity, single SKU, exact model, shipping and fit
rules remain unchanged. Historical nine/ten tests retain their original scope.
New twelve-seller tests cover successful independent checks, a 429 before the
walking tent (therefore no later family-table call), and unavailable table.

## Still required for completion

The published catalog remains nine offers until a fully verified snapshot is
built and all original quality gates pass. This PR does not resolve the
four existing full-engine failures by itself. In particular, family tent
preference IDs are not rewritten and diversity tests are not disabled.

Additional bounded exact API observations on the same day returned eligible
API evidence for family tents 2000036439, 2000039087, 2185614, 2000038429,
fire pit ST-032RS, walking mat 1124667 and walking table 2000038844.
Those API results alone are insufficient: current seller fixed-SKU proof,
model-specific manufacturer specs, and suitability review remain separate.
They are not added to the renewal allowlist or counted as published choices.

Keep Draft until all original CI tests, actual product build, 180-context
audit, three viewport browser tests, Lighthouse and purchase-path checks pass.
Do not merge a partial recovery merely because isolated renewal tests pass.
