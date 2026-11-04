# STEP89｜自動商品更新後の検証付き公開を確実に実行する（2026-11-04）

## 前回の再発防止で残っていた穴

2026-11-03に公開した [PR #313](https://github.com/stusaurus/sotojitaku/pull/313) は、静的公開ワークフローが走った場合の最新main照合2回・FISHING/CAR STAY商品JSON完全一致・HOMEリンク実操作を検証できていた。

**しかし11/04の自動商品更新4コミットでは「Publish verified SOTOJITAKU site」が起動していなかった。** 前後のGitHub Actions履歴を照合すると、通常の `pages build and deployment` は出ていたが、全サービス検証付き公開は **11/03の#41652961731が最後**。原因はGitHubの仕様: 既存の4ワークフローは `GITHUB_TOKEN` を用いてmainにcommit/pushしており、通常の `push` トリガーは二次起動しない。

一次資料: [GitHub Docs / Triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)（`workflow_dispatch` と `repository_dispatch` の例外）。

## 実装した恒久対策

1. `publish-static.yml` に `workflow_run: completed` を追加。ソースに `GITHUB_TOKEN` が使われていても、更新ワークフローの成功終了から公開検証が起動する。
   - Refresh CAR STAY products
   - Sync CAR STAY shared Rakuten catalog
   - Refresh FISHING products
   - Renew nine strictly verified CAMP seller offers
2. 元ワークフローが失敗なら公開を開始しない。成功時はソース変更なしでも安全を優先して公開回帰を再検証。既存`concurrency: cancel-in-progress: true`は維持。
3. イベントが失われた場合の回復措置として、毎日08:35 UTC（17:35 JST）の定期検証付き公開を追加。`GITHUB_SHA`とorigin/mainの厳密一致は公開準備前・公開直前で引き続き必須。
4. CAMP更新ワークフローから独立した直接`deploy-pages`を削除。CAMPだけが他2サービスのQAを通らず公開できた経路を廃止。
5. 公開後の全件一致を3サービスに統一。CAMPは `data/audited-products.json` と `data/products.json` の両方をチェック（候補監査と実販売中の厳格確認済み一覧を混同しない）。FISHING、CAR STAYの既存全JSON一致を維持。
6. `tests/test_release_workflow_contract.py`に、4つの更新名・GitHubイベント・fallback・CAMP独立デプロイ禁止を回帰追加。公開後CAMP一致は`tests/camp-published-catalog.mjs`で有界リトライとJSON記録。

## 監視上の留意点

- `pages build and deployment`単独成功は、商品JSON一致・ブラウザ試遊まで通過した証拠ではない。検証付きの `Publish verified SOTOJITAKU site` が最新mainに対して成功したかを見る。
- GitHub Pages側の配信方式・外部イベントの障害まではコードで完全保証できない。公開後検証失敗は成功扱いせず、最新mainから復旧する。
- 販売商品の欠品・サイズ不明・在庫未検証は安全にfail-closedを維持。自動公開対策を品揃え増・Google検索順位増の実績とは混同しない。
