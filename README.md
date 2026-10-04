# SOTOJITAKU CAMP

はじめてのキャンプを、あなた仕立てに。

Static, mobile-first camping experience planner. GitHub Pages serves repository root, with no build dependency. Production: https://stusaurus.github.io/sotojitaku/

## Local development

`npm run serve` → http://localhost:4173

After editing JS/CSS, run `python scripts/stamp_assets.py` to refresh content fingerprints (avoids stale browser modules after Pages deployments).

`npm run check`, `npm test`, `python -m unittest discover -s tests -p 'test_*.py' -v`

The Work-ready pack is authoritative; unmodified JSON files are in `data/`, textual source specifications in `docs/specification/`. Visual source images remain in the supplied original pack. Generated production imagery is in `assets/`.

## Planner

Q1–Q7 → provisional plan → owned gear → buy/rent/defer → recipes → budget → completion → personalized schedule → missing equipment → max-three audited recommendations. State is versioned in LocalStorage. Plan exports as UTF-8 text and schedules print. Fire safety supporting items, recipe vessels, fuel and cooling are added explicitly. Sleep needs both sleeping bag and mat. A plan is not a purchase or a rental booking.

Budget amounts in `engine.js` are illustrative planning allowances, never actual product prices. All per-person gear multiplies by party size. Purchase recommendations apply only to parties up to four. No-car users get strict weight gates.

## Product pipeline

`products.js`: category and real-body gate → sales conditions → URL safety → freshness → required specifications → user fit → evidence and score completeness → canonical URL deduplication → family diversity → maximum 3 recommendations.

Unknown listings are rejected. Zero products is a supported state and does not disrupt plans. Unverified external Rakuten searches are labeled separately and tracked as `external_search`, never `affiliate_click`.

`data/audited-products.json` stores manually evidenced exact variants, required specification quotes, listing identity and review date. Do not mark unknown sales variants as verified. `scripts/refresh_worker.py` reuses the existing daily-cost Rakuten Worker and independently checks the exact seller page, model, purchase availability, stock, fixed SKU and matching price on every refresh. Worker fuzzy matching alone is never accepted. The scheduled workflow uses this path without exposing credentials. `scripts/acquire.py` is also available for direct Rakuten acquisition against audited IDs. It never republishes a failed category's old products. Secrets belong in GitHub Actions, never the browser.

For direct Rakuten refresh, repository secrets: `RAKUTEN_APPLICATION_ID`, `RAKUTEN_ACCESS_KEY`, `RAKUTEN_AFFILIATE_ID`. API application must permit this site's URL. These secrets are optional for the direct acquisition script; scheduled refresh uses the existing Worker. Without verified live data the affected item is removed. All recommendations expire after seven days even if a refresh job stops.

## Measurement

Existing GA4 measurement ID `G-GFVSZ8YDQ5` is reused, with `site_id=sotojitaku_camp` and `operator_test=1` via `?test=1`. For a dedicated stream replace the ID consistently in `app.js`. Operator exclusion needs a GA4 report/filter using the supplied parameter. Local event emission alone is not proof of GA4 report ingestion. Opt-out is available in privacy settings.

## Deployment

GitHub Pages already uses main/root. Commits trigger Pages' managed build. CI runs syntax, scenario/product quality and finite-retry tests.
