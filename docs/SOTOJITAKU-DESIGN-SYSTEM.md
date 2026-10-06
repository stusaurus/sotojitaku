# SOTOJITAKU Design System

Status: brand rule for CAMP / CAR STAY / FISHING and future SOTOJITAKU services.

## Brand thesis

SOTOJITAKU is not a collection of unrelated microsites.

Every service should feel like the same product family:
**a calm, premium outdoor preparation tool that turns uncertainty into a realistic first outing.**

Domain identity changes. Product identity does not.

## Invariants

All SOTOJITAKU services should keep these visual rules.

### 1. Hero
- immersive dark natural scene
- large Japanese serif headline
- one warm accent color
- short eyebrow
- pale/white primary CTA
- CTA uses a rounded pill shape
- the hero sells the experience, not products

### 2. Builder / diagnosis
- split-screen on desktop
- dark visual/experience pane on the left
- warm off-white control pane on the right
- visual pane changes as the user's plan becomes more concrete
- mobile collapses into visual preview above the controls

### 3. Typography
- Japanese serif for emotional headlines
- Japanese sans-serif for controls, labels, product data and safety copy
- generous line-height
- no decorative editorial typography that exists only in one service

### 4. Shape language
- controls and cards: mostly 16-24px radius
- primary CTA / purchase CTA: pill
- small status chips may also use pills
- avoid introducing a service-specific square-card system

### 5. Color
Common neutral foundation:
- warm canvas / panel: #F4F0E7 to #F5F0E6
- near-white card: #FBFAF7 to #FFFAF1
- dark text: around #17212A / #1F2420
- muted borders: sand / warm gray

Service accent:
- CAMP: forest / moss / ember
- CAR STAY: night navy / warm amber
- FISHING: deep sea / sea green / sunrise sand

Accent colors may change. Hierarchy and temperature should not.

### 6. Result page
- one strong result header
- readiness / plan status clearly visible
- sections use the same visual hierarchy
- safety is visually distinct but calm
- recommended products are more prominent than explanatory cards
- affiliate CTA is strong but not visually louder than the plan itself

### 7. Product cards
- warm-white cards
- product image + concise fit reason + price + one strong CTA
- featured bundle may be emphasized, but stays within the same radius and typography system
- avoid marketplace-like dense grids

## Service-specific motifs

CAMP:
- forest, tent, fire, daylight/nature photography

CAR STAY:
- night road, cabin glow, vehicle transformation

FISHING:
- sea light, pier, line/hook/water rings

These motifs should appear mainly in the hero and left visual pane.
They should not redefine the underlying UI system.

## Rule for future changes

Before merging a visual change, ask:
1. Would this still look like SOTOJITAKU if the service name were hidden?
2. Is the difference caused by the outdoor experience, or merely by a new design fashion?
3. Does the same component role have roughly the same shape, spacing and hierarchy across services?

If the answer to 1 is no, or 2 is design fashion, do not ship it.
