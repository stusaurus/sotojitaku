# Approved brand assets

Source: `SOTOJITAKU_NAKAJITAKU_BRAND_ASSETS_REVISED.zip`, `READY/SOTOJITAKU/` and `READY/NAKAJITAKU/`. All PNGs are copied without recolouring, tracing or resampling.

The four SOTOJITAKU headers use `sotojitaku/mini-64.png` (1x) and `mini-128.png` (2x), displayed at 40px on desktop and 32px at widths up to 800px. A small natural beige backing maintains contrast on the existing landscapes. The existing brand text remains alongside the symbol. Logo image alt is empty because the containing link already has the brand name; its original destination and accessible label are preserved.

Main logos retain their original white background and native resolution. They are stored but not displayed over the landscape backgrounds. NAKAJITAKU is stored only; there is no NAKAJITAKU page or navigation change. No SVG, unapproved 16px adaptation or new favicon is adopted. Existing favicon, OGP, canonical metadata and analytics scripts are unchanged.

| File | SOTO native dimensions | NAKA native dimensions | Transparency |
| --- | --- | --- | --- |
| main-horizontal-original-white.png | 368 × 94 | 403 × 94 | opaque RGB |
| main-vertical-original-white.png | 591 × 449 | 609 × 452 | opaque RGB |
| main-symbol-original-white.png | 322 × 318 | 317 × 319 | opaque RGB |
| mini-32/48/64/128/512.png | matching square dimensions | matching square dimensions | RGBA, outer background transparent |
| mini-transparent-native.png | 514 × 463 | 501 × 466 | RGBA |

The PNGs preserve raster source detail. Larger versions do not add detail beyond the approved original.

Run `BRAND_BASE=http://127.0.0.1:4173/sotojitaku/ node tests/brand-header-browser.mjs` against a static server whose root contains a `sotojitaku` checkout or symlink. The PR workflow runs the same checks without deployment permissions. Production deployment remains restricted to a separately approved merge to main.
