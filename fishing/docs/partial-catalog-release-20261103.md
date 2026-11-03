# FISHING｜安全な部分カタログ公開の運営記録（2026-11-03）

## 確認できた事実
- 最新の商品取り込みコミット: `f1dd4b8d053fce516249c056f67a18e41c70e128`
- 出典: `stusaurus/daily-cost-jp/shared-data/sotojitaku-fishing-products.json`
- 出典データの実検証日: `2026-11-03T03:26:52.727980+00:00`
- `fishing/data/audited-products.json`: **13 verified_live 商品、状態 partial**
- 実更新: https://github.com/stusaurus/sotojitaku/actions/runs/41623020656 （completed/success）
- 安全な部分公開コード: https://github.com/stusaurus/sotojitaku/pull/305
- PR CI: https://github.com/stusaurus/sotojitaku/actions/runs/41622197506 （completed/success）
- 未解決商品不足: https://github.com/stusaurus/sotojitaku/issues/302

## 何が不足しているか
1. `choi_nage/low/rod_reel`：`lumica-choi-start-g09224` の実商品同一性が未検証
2. `family_child/child_m/life_jacket_child`：`shimano-vf098v-kids-m` 取得HTTPError
3. `family_child/child_l/life_jacket_child`：`shimano-vf098v-kids-l` 取得HTTPError

`choi-shimano-complete-500527` は直接商品ページ404、`sabiki-shimano-complete-500528` は在庫切れの手動停止を継続する。5シードの失敗理由は商品カタログの `failures` に残す。

## 安全性と検証基準
- 13件の検証日は実ソースから引き継ぐ。未来の日付・未確認の価格・適合・商品URLを補完しない。
- `check_catalog.py` の完全充足判定は一切緩めない。部分公開は `check_partial_catalog.py` により3つの既知欠品に限定。
- `check_scenarios.mjs --partial-release` は現在時刻の2916パターンを検証。通常のGrowth監査は完全充足を要求し続ける。
- 家族向けPFDのM/L、身長・体重条件が販売元で確認されない限り、自動購入候補に出さない。
- 利用者画面では不足必須品を表示し、商品合計を必要総額と誤認させない。
- PR CIで差し替え前後の静的テスト、320/390/1440pxのChromium操作を成功確認。
- 現行Growth監査が赤である原因はCAMPの販売候補不足4件。FISHINGの商品不足自体は引き続きIssue #302として扱う。

## 公開の順序を確実にする
マージ直後の `Publish verified SOTOJITAKU site` は、商品更新コミットより前のHEADで起動している場合がある。新しい商品カタログの公開を古い成果物で上書きしないため、この運営記録をFISHING配下にコミットして、**商品更新後のmainをチェックアウトする新しいpublishジョブ**を起動する。ワークフローの `concurrency.cancel-in-progress` により古いpublishをキャンセルする。

新ジョブの結果とPagesの最終反映を確認するまで、公開完了・収益回復・検索流入増加を宣言しない。

## 追記｜2026-11-03 G09224の竿・リール適合性を保留
- [PR #307](https://github.com/stusaurus/sotojitaku/pull/307)で`lumica-choi-start-g09224`を明示的に手動停止。
- 販売店のセット内容には竿・仕掛け・オモリ等が記載されているが、**リール同梱を裏付ける証拠がない**。したがって`rod_reel`必須品を満たすと判定できない。商品の存在や価格だけで復帰させない。
- 同梱内容の確認先：<https://item.rakuten.co.jp/aquabeach/g09224/>
- 復帰条件：メーカー・販売元によるリール同梱の独立証拠、正確な型番/セット内容、購入可能な楽天出品とアフィリエイト遷移先一致。満たさない限り停止を維持する。
- この安全停止を追加した本番更新 [run #41631650237](https://github.com/stusaurus/sotojitaku/actions/runs/41631650237) は成功。
- 最新カタログ更新コミット：`ce8f56d5e03e97eb0e0e10b43a2376d800b768bf`。実証済み商品13件、`status=partial`、G09224は非収録で`failures`に手動停止理由あり。
- この記録の更新で、最新カタログのコミット以降のHEADを使う新しい公開ジョブを起動し、先に起動した古い公開ジョブの上書きを防止する。公開後の確認は本番検証ログで行う。
