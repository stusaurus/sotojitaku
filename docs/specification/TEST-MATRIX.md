# End-to-End Test Matrix

## A — Couple / Spring / One night / Car / BBQ / ¥50k
Expected:
- shelter + sleep + night + walk_night
- BBQ + cold_food
- buy/rent split likely
- not forced to bonfire
- schedule includes BBQ
- product recommendations fit 2 adults

## B — Family 4 / Autumn / One night / Car / BBQ + Bonfire + Coffee / ¥100k
Expected:
- family-appropriate tent/table/cooler
- bonfire safety supporting items
- coffee gear
- children-aware simplicity/stability
- schedule not overcrowded
- completion explicitly shows selected experiences

## C — Solo / Summer / Daytrip / No car / No cooking / ¥30k
Expected:
- no tent/sleeping bag forced
- portability strongly weighted
- no cooking gear forced
- cooler only if actual food path requires it
- completion possible without overnight abilities

## D — Family 4 / Autumn / One night / Car / Tent owned / ¥50k
Expected:
- tent excluded from buy budget
- budget reallocated
- tent ability remains unlocked
- no duplicate purchase recommendation

## Regression tests
- 4 people + 2-person tent => reject
- sleeping bag temp unknown => no primary seasonal recommendation
- electric hot sandwich maker => reject for direct-flame request
- fire pit accessory only => reject
- lantern stand only => reject
- selectable "price from" product => reject in MVP
- rental listing => reject from Rakuten purchase recommendations
- unknown category => reject
- 429/5xx => finite retry only
- zero products => no dummy card
