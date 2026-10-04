# SOTOJITAKU CAMP — Launch Gate

## 0. Name / brand
- [ ] SOTOJITAKU / ソトジタクの最終商標確認をJ-PlatPatで実施
- [ ] GitHub repository collision check
- [ ] サイト名、OG、title、logo表記が統一

## 1. Critical user flow
- [ ] Landing → simulator_start
- [ ] Q1〜Q7
- [ ] gear_plan_generated
- [ ] owned gear selection
- [ ] gear status (buy/rent/skip)
- [ ] recipe selection
- [ ] budget adjustment
- [ ] simulator_complete
- [ ] schedule generated
- [ ] final gear list
- [ ] product view
- [ ] Rakuten affiliate click

## 2. Mandatory scenario tests
- [ ] A: 大人2 / 春 / 1泊 / 車 / BBQ / 5万円
- [ ] B: 大人2+子2 / 秋 / 1泊 / 車 / BBQ+焚き火+朝コーヒー / 10万円
- [ ] C: ソロ / 夏 / 日帰り / 車なし / 料理なし / 3万円
- [ ] D: 家族4 / 秋 / 1泊 / 車 / テント所有済み / 5万円

## 3. Ability engine
- [ ] 宿泊時 shelter/sleep/night/walk_night が必須
- [ ] 希望していないabilityは完成度を下げない
- [ ] skipした体験は肯定的な代替プランへ
- [ ] 安全コア未完成では「完成」としない

## 4. Budget engine
- [ ] MUSTをFUNより先に残す
- [ ] 高額でレンタル向きはrent提案可能
- [ ] owned itemの予算を他カテゴリへ再配分
- [ ] 予算超過時に「全部最安へ置換」しない

## 5. Product quality
- [ ] 中古/展示/開封/アウトレット/訳ありを除外
- [ ] 本体と部品・ケース・カバーを誤認しない
- [ ] 選択式価格をMVPでは除外
- [ ] unknown category = fail closed
- [ ] critical fields不足 = primary recommendation不可
- [ ] affiliate tracking差分で重複しない
- [ ] 同一product familyが3枠を占有しない
- [ ] 極端な安値を自動で「お得」としない
- [ ] API 429/5xx再試行に上限あり
- [ ] API失敗時に古い誤商品を復活させない

## 6. Recommendation
- [ ] 4人に2人用テントを出さない
- [ ] 車なしで重量級が価格だけで1位にならない
- [ ] 春秋寝袋で温度情報不明を主推薦しない
- [ ] 直火ホットサンド希望で電気式を出さない
- [ ] 「迷ったら / 価格重視 / 快適重視」が説明可能
- [ ] 同一商品3枚を機械的に並べない

## 7. Cooking / schedule
- [ ] 選択料理から必要ギアへ双方向反映
- [ ] 要冷蔵食材でcold_foodを要求
- [ ] 料理しない選択が可能
- [ ] 夕食メインを詰め込みすぎない
- [ ] 1泊2日に余白時間がある
- [ ] 不足ギアがスケジュール上でも分かる

## 8. UX / mobile
- [ ] 横スクロールなし
- [ ] タップ領域十分
- [ ] Q1〜Q7が長いフォームに見えない
- [ ] Backで回答が消えない
- [ ] LocalStorageから復帰可能
- [ ] 完成画面が最も魅力的
- [ ] 空の商品カード / ダミーボタン 0
- [ ] 商品0件でもシミュレーター継続可能

## 9. Analytics
- [ ] simulator_start
- [ ] simulator_answer
- [ ] question_complete
- [ ] gear_plan_generated
- [ ] gear_owned
- [ ] gear_buy
- [ ] gear_rent
- [ ] ability_unlock
- [ ] recipe_select
- [ ] budget_adjust
- [ ] schedule_generated
- [ ] simulator_complete
- [ ] product_view
- [ ] affiliate_click
- [ ] operator_test除外または識別

## 10. SEO
- [ ] Canonical / sitemap.xml / robots.txt
- [ ] title / description / OG
- [ ] structured data where appropriate
- [ ] thin mass-generated pagesなし
- [ ] 初心者 / 必要なもの / 予算 / ファミリー / テント / 寝袋 / 料理 / BBQ / 焚き火 / 朝ごはん の入口

## 11. Safety
- [ ] テント内火気を推奨しない
- [ ] 焚き火はキャンプ場ルール確認
- [ ] 荒天時は延期・中止を選択肢にする
- [ ] 生肉等の保冷・加熱・衛生注意

## 12. Release decision
公開可 = Critical flow + 4 scenarios + product quality + mobile + analytics がすべてPASS。
