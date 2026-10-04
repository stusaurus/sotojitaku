# Work execution prompt — SOTOJITAKU CAMP

Implement SOTOJITAKU CAMP end-to-end in a new GitHub repository:
`stusaurus/sotojitaku`

Use the accompanying Work-ready pack as authoritative product/design input.

## First principle
Do not redesign the concept from scratch.
Do not convert it into a generic affiliate comparison site.
The product is:
**a service where a beginner builds a complete camping experience, then sees only the missing products needed to realize it.**

## Read first
1. README / existing prework files
2. WORK-DESIGN-HANDOFF.md
3. design-tokens.json
4. screen-specs.json
5. scene-map.json
6. component-spec.md
7. responsive-rules.md
8. COPY-DECK.md
9. VISUAL-ASSET-BRIEF.md
10. TEST-MATRIX.md
11. launch-checklist.md

## Implementation priorities
Follow implementation-order.md.

Highest visual priority:
1. Home HERO
2. Q6 "何をしたい？"
3. Completion "キャンプ、できた。"

Do not expand the rest of the site until these three feel premium and distinct.

## Technical direction
- GitHub Pages compatible
- Cloudflare Worker only where external API/backend proxying is necessary
- no Netlify
- LocalStorage for MVP state persistence
- reuse robust Rakuten acquisition / throttle / retry / affiliate handling patterns from existing stusaurus repositories
- fail closed for product classification
- mobile first

## Design acceptance
Must feel like:
**上質なアウトドア専門誌 × セレクトショップ × 休日の体験サービス**

Must not feel like:
- Rakuten portal
- generic comparison table
- template camping blog
- generic SaaS form
- children's learning site

## UX acceptance
The emotional flow must be:
「何を買えばいいか分からない」
→「これが必要なんだ」
→「これがあると焚き火できる」
→「自分でもキャンプできそう」
→「足りないものだけ見よう」

## Release gate
Do not report completion until:
- 4 scenario tests pass end-to-end
- no dummy buttons/products
- mobile has no horizontal overflow
- GA4 events fire
- affiliate clicks are measurable
- product gates reject false positives
- LocalStorage recovery works
- the launch checklist's critical sections pass

When implementation choices are ambiguous, preserve the concept and simplify rather than adding features.

## Visual source of truth
Before implementing UI, inspect:
- `VISUAL-REFERENCE.md`
- all images in `visual-references/`

Treat these images as the primary visual baseline, not optional mood-board material.
If code technically works but visually falls materially below these references, the implementation is not complete.
