# SOTOJITAKU HOME landscape release — 2026-10-08

HOME uses a single shared photograph across the introduction and three destination links. No image divisions, card backgrounds, borders or rounded corners. Responsive picture selects a separate continuous portrait composition below 800px.

Assets generated with the built-in image generation tool:
- assets/home-world-desktop.webp: 1536 × 1024, 326484 bytes. One accessible Japanese lakeside holiday with tent on left, ordinary compact minivan in center, seated angler on right. Shared warm light, shoreline, forest, horizon; no embedded text or brand logos.
- assets/home-world-mobile.webp: 725 × 2170, 463440 bytes. One tall connected forest/shore landscape with canopy at top, tent, parked minivan and angler arranged down the central corridor. No separate panels. Dedicated mobile art direction.

Generation briefs: photorealistic natural editorial holiday, attainable beginner atmosphere, sage/olive forest, warm ivory sky, muted green lake, correct simple tent and unbranded minivan, distant seated angler with one rod, low-detail shaded ground for text. No typography, logos, extra gear, dividing lines or collage. Desktop left/center/right composition; portrait top-to-bottom shoreline with central subjects.

QA: tests/home-browser.cjs checks 1440, 1280, 1024, 390, 375, 360px, including mobile touch and DPR 3; all three real navigation round trips, synchronous service_select analytics queue, loaded responsive asset, no horizontal overflow, copies inside clickable bounds, zero gap at destination boundaries, canonical, no page/console errors and no failed local resources. Operator traffic is blocked from production GA. Screenshots visually inspected, with narrow headline and 1024px crop corrected.

Automated suites: 135 Node tests, 147 Python tests passed. Existing tests updated to distinguish HOME from relocated CAMP. Public release and subsequent scheduled product refreshes include HOME CSS and camp/. Services retain diagnosis/recommendation implementations; CAMP HTML only gets its correct script content fingerprint.

Limit: mobile Chromium emulation, not a physical iPhone or WebKit hardware test. Actual GA ingestion/reporting is not asserted; emitted event payloads are checked.
