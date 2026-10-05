# SOTOJITAKU FISHING — Foundation Spec

Status: Draft 0.1
Branch: feature/fishing-foundation
Purpose: lock the product thesis before implementation.

## 1. Product thesis

SOTOJITAKU FISHING is not a fishing gear catalog and not a generic "beginner set ranking".

It should help a complete beginner turn the vague thought "I want to try fishing" into one realistic first outing.

Core brand idea inherited from SOTOJITAKU:
- Start from the experience the user wants.
- Use what the user already owns.
- Fill only the gaps.
- Recommend concrete purchasable products only when they are actually needed.
- Make the user feel "I can do this" before asking them to buy.

Primary promise:
**はじめての釣りを、あなた仕立てに。**

Working subcopy:
**何を釣るか決まっていなくても大丈夫。誰と、どこで、どう楽しみたいかから、最初の一匹までの支度をつくります。**

## 2. Market gap to target

Existing beginner fishing content is strong at:
- "beginner set" rankings
- tackle explanations
- individual fishing-method tutorials
- rod/reel recommendations
- species-specific guides

The gap SOTOJITAKU FISHING should own:
**experience -> method -> complete first-trip setup -> owned-item removal -> exact missing-item recommendations -> shopping list**

The site should answer the beginner's real sequence:
1. What kind of fishing should I try?
2. Can I do it with my family / alone / without touching worms?
3. What exactly do I need?
4. What do I already have?
5. What am I still missing?
6. Which actual product should I buy?
7. What should I do on the day?

## 3. MVP scope

### Initial environments
Focus on shore-based, beginner-friendly fishing:
- managed sea fishing park / fishing pier
- safe harbor / stable quay where fishing is permitted
- easy beach / shore conditions where beginner suitability is reasonable

Do not position the MVP around:
- offshore / boat fishing
- rock fishing
- advanced surf casting
- big-game targets
- night-first plans
- tetrapod climbing
- any plan requiring advanced safety judgment

### Initial fishing methods

#### A. Sabiki
Best for:
- families
- children
- users who want a high chance of seeing fish
- users who do not want complex casting
- users who want horse mackerel / sardine / mackerel type targets

#### B. Choi-nage
Best for:
- users who want to cast
- users who want whiting / goby / flatfish-type shore fishing
- users who are comfortable with bait or artificial bait substitutes

### Phase 1.5 candidates
- simple light lure fishing
- managed trout fishing
- float fishing / simple drop rig

Do not add these until product matching and beginner safety are reliable.

## 4. Core diagnostic questions

The first version should ask only questions that change the plan or the shopping basket.

1. Who are you going with?
   - alone
   - two adults
   - family with child
   - group

2. What sounds most fun?
   - catch several small fish
   - cast and wait for a bite
   - I do not know; choose for me

3. How do you feel about bait?
   - normal bait is fine
   - I do not want worms
   - I want the least smell / mess possible

4. Do you want to take fish home?
   - yes
   - no / catch and release
   - undecided

5. How much gear do you want to carry?
   - compact
   - normal
   - comfort first

6. What is your starting budget for missing items?
   - low
   - balanced
   - buy once / use longer

7. What do you already own?
   - cooler
   - bucket
   - scissors
   - towel
   - bag
   - life jacket
   - pliers / fish grip
   - rod / reel / line
   - none

8. Is a child joining?
   - yes / no

The system should infer a recommended first plan rather than forcing the user to know species, rig names, rod power, reel size, line number, etc.

## 5. Output model

The result page should be a "first fishing plan", not a gear list.

### Header
Example:
**あなたの最初の一匹プラン**
**サビキで、家族と気軽にアジ・イワシを狙う。**

### Sections
1. Why this plan fits
2. Readiness status
3. What you already have
4. What you still need
5. Exact product recommendations
6. Day-of checklist
7. 3-minute setup guide
8. Safety / local-rule checks
9. "これで行く" saved plan

### Readiness states
Reuse SOTOJITAKU states:
- READY
- ALMOST
- CHANGE PLAN

CHANGE PLAN should be used when the chosen conditions create too much beginner risk or incompatibility.

## 6. Gear model

### Core tackle
- rod
- reel
- pre-spooled line or line
- rig / hooks / sinker / cage as relevant

### Bait / lure
- sabiki chum
- artificial worm / bait alternative where suitable
- spare rigs

### Safety
- life jacket
- suitable footwear guidance
- child-specific safety requirements
- optional headlamp only for non-MVP later use

### Fish handling
- fish grip
- pliers / hook remover
- scissors
- towel

### Water / cleanup
- water bucket + rope
- trash bags
- wet wipes / hand-cleaning option

### Take-home
- cooler
- ice / cold pack guidance
- storage bags

### Carrying / convenience
- tackle bag
- compact rod case
- chair only if the plan meaningfully benefits

## 7. Product recommendation rules

A product may be shown as a primary recommendation only when all of the following are true:
- it matches the fishing method
- it matches beginner use
- it is currently purchasable
- the product page clearly identifies the relevant specification
- the price is reasonable for the selected budget tier
- no obvious safety or compatibility issue exists
- the product is not merely keyword-matched
- a valid affiliate destination can be generated

For core tackle, prefer known fishing brands or specialist-shop starter combinations over suspiciously cheap generic bundles when quality is unclear.

Recommendation slots per required category:
- 1 "まずはこれ" primary
- up to 1 "長く使うなら" upgrade
- optional budget alternative only if it is genuinely acceptable

Avoid large carousels. The goal is decision completion, not browsing.

## 8. Revenue design

Primary conversion:
**plan -> missing item -> exact product -> 楽天で見る / これにする**

Revenue should come from a complete but necessary basket rather than pushing random products.

High-value categories:
- rod/reel starter tackle
- life jacket
- cooler
- tackle bag / case

Repeat-purchase categories:
- rigs
- hooks
- bait / chum
- line
- small accessories

Important:
Do not recommend gear the user already owns.
Do not inflate basket size for affiliate revenue.

## 9. Analytics

Track at minimum:
- fishing_view
- fishing_diagnosis_start
- fishing_question_answer
- fishing_diagnosis_complete
- fishing_plan_selected
- fishing_owned_item_toggle
- fishing_product_view
- fishing_product_select
- affiliate_click

Recommended event parameters:
- fishing_method
- party_type
- child_present
- bait_preference
- take_home
- budget_tier
- gear_category
- product_id
- recommendation_tier
- plan_id
- conversion_source

## 10. SEO entry pages

Initial intent pages should support the product rather than become an article farm.

Priority themes:
- 釣り 初心者 何から
- 海釣り 初心者 道具
- サビキ 初心者 一式
- ちょい投げ 初心者
- 子供 釣り 初心者
- 虫エサ 苦手 釣り
- 釣った魚 持ち帰り 道具

Each page should end in a plan CTA:
**自分の条件で、必要なものだけ出す**

## 11. Safety and rules

Safety is a hard gate, not optional editorial copy.

Required principles:
- life jacket is treated as a core safety item for beginner waterside fishing plans
- child plans always elevate life-jacket prominence
- prohibit / discourage unsafe beginner contexts
- remind users that fishing rules, prohibited areas, seasons, methods and size restrictions vary by location
- do not imply that any harbor, seawall or shore is automatically legal to fish
- do not generate a "safe to fish here" claim without authoritative location-specific verification

## 12. Visual direction

Keep the SOTOJITAKU family resemblance, but do not make it look like CAMP with fish icons.

Desired feeling:
**上質なフィッシング雑誌 × 海辺の休日 × 道具を選ぶ楽しさ**

Visual keywords:
- early morning sea light
- muted navy / sea green / sand
- clean white space
- tactile tackle details
- beginner-friendly, not macho
- no cluttered "釣具屋チラシ" feeling

The hero should sell the first outing, not the products.

## 13. MVP acceptance criteria

A first-time user should be able to:
1. finish diagnosis without knowing fishing terminology
2. receive one clear recommended fishing plan
3. see why that plan fits
4. remove already-owned items
5. see every remaining required category
6. select a concrete product for each monetizable missing category
7. understand the minimum day-of sequence
8. see safety and local-rule checks before leaving
9. save / revisit the plan
10. click to Rakuten with attribution

## 14. Implementation structure

Planned public path:
`/fishing/`

Suggested files:
- fishing/index.html
- fishing/style.css
- fishing/app.js
- fishing/engine.js
- fishing/products.js
- fishing/data/questions.json
- fishing/data/plans.json
- fishing/data/equipment.json
- fishing/data/product-rules.json
- fishing/seo.js
- fishing/seo.css
- fishing/tests/

Do not modify CAMP behavior while building FISHING.

## 15. Immediate next build steps

1. Lock questions and answer values.
2. Define plan engine for sabiki vs choi-nage.
3. Define equipment requirements per plan and condition.
4. Build a verified product candidate pool.
5. Define exact recommendation filters.
6. Create screen/copy specification.
7. Implement /fishing/ on the feature branch.
8. Run mobile-first QA.
9. Add sitemap / navigation only after the page passes QA.
