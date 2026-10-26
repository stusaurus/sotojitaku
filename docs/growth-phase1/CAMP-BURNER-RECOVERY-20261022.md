# CAMP burner comparison recovery

The public CAMP catalog had nine safely reverified offers and no eligible
burner. The 180-context audit returned no burner in all 180 contexts. This
prevented visitors who planned to cook from reaching a verified burner offer.

## Independently verified replacement seller

- Existing manufacturer model/specification audit: SOTO ST-340, unchanged.
- Seller: https://item.rakuten.co.jp/naturum/3304081/
- Exact merchant item code: `naturum:18596563`, derived from that seller page.
- Evidence: https://github.com/stusaurus/sotojitaku/actions/runs/39102282964,
  attempt 2, 2026-10-22, artifact 12416777012.
- ZIP SHA256: `b8afed4c4d68c8b4a678359dc17313dd5143d2f509cc17e3e9d8d832c84d9869`.
- Observed 2026-10-22T09:49:41.568606+00:00. Two official API calls, two seller
  candidates; stop after the successful seller; no 429 and no purchase clicks.
- Passed current fixed SKU, stock, identity, tax/postage inclusion, price and
  matching affiliate destination gates. Observed price JPY 9,790 is an audit
  observation, not a permanent published price.

The merchant audit is reviewed explicitly. The scheduled renewal now includes
this exact model/seller and still verifies the exact official API response and
the same seller page before publishing. Its price and verification timestamp
must come from that live renewal. This PR does not copy the research result
directly into the live product snapshot. Failed checks retire the offer or
allow only an already-fresh prior proof until expiry under the existing rules.
The API ceiling rises from nine to ten; a confirmed 429 still stops the batch.

Historical nine-seller tests continue to run against an explicit nine-seller
fixture. New tests cover ten successful checks, a burner 429 and an unavailable
burner. The live snapshot contract now accepts either complete or partial
category coverage while requiring its status and missing categories to match
the actual products; all freshness, seller, price, link and fixed-SKU checks
remain mandatory. Complete category coverage does not prove sufficient choice
for every profile. Existing preference-diversity failures remain visible.

No SEO title, page count, ranking scores, manufacturer specs, consumer fit,
safety questions, analytics or external promotion is changed. Search/revenue
effects need later observed data; safe recovery is not evidence of growth.
