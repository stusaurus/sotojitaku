# SOTOJITAKU GA4｜収益ファネル計測契約（2026-10-08）

## 対象・状態

公開サービス：HOME / CAMP / CAR STAY / FISHING。測定ID `G-6STQ5HXRDH` はHTML上で確認済み。

本書は**コード上の計測契約**です。GA4管理画面でのイベント着信、パラメータのカスタム定義登録、実ユーザー数、購入件数を確認した記録ではありません。

## 共通イベントと実装元

| 行動 | 比較に使うイベント | 実装上の注意 |
|---|---|---|
| HOME訪問 | `page_view` | HOMEの自動ページビュー。集計範囲は `/sotojitaku/` に限定 |
| HOME→サービス | `service_select` | HOMEのクリック。従来 `service` に加え `service_id` を送る |
| 診断開始 | `journey_start` | CAMP: simulator_start、CAR STAY: carstay_start、FISHING: fishing_diagnosis_start から派生 |
| 診断完了 | `journey_complete` | CAMP: simulator_complete、CAR STAY: builder_completed、FISHING: fishing_diagnosis_complete から派生 |
| 商品表示 | `product_view` | CAMPは商品**カテゴリ表示**、CAR STAYとFISHINGは**商品単位**。イベント件数の比較は禁止 |
| 楽天クリック | `affiliate_click` | 3サービス共通。楽天の購入成立・報酬発生と同義ではない |

- サービスIDは `camp` / `car_stay` / `fishing`。
- 元の個別イベントも維持し、旧レポートを破壊しない。
- `service_select` はHOME内リンクだけを計測し、直接流入やサービス内遷移を含めない。
- 既存の `operator_test` は運営者検証の識別用。数値・文字列の表現差が残るため、GA4側で `1` に該当するものを除外。
- アクセス解析を無効化したユーザーは計測できず、計測データは全利用者の完全な母集団ではない。
- 価格、商品ID、推奨順位などは既存の送信実装と確認が必要。氏名・住所等の個人情報を送信しない。

## 指標の定義

**セッション／ユーザー単位で比較する**。CAMPのカテゴリ表示と他サービスの商品単位表示を単純にイベント件数で比較しない。

1. HOME選択率 = HOME訪問セッションのうち、`service_select` に至った割合。
2. 診断開始率 = 各サービス訪問セッションのうち、`journey_start` に至った割合。
3. 診断完了率 = `journey_start` から `journey_complete` に順序どおり到達した割合（同一セッション）。
4. 商品到達率 = 診断完了後、`product_view` が発生した割合（同一セッション・順序を守る）。
5. 楽天送客率 = 商品表示後、`affiliate_click` が発生した割合（同一セッション・順序を守る）。
6. 購入・報酬 = 楽天アフィリエイトの確定成果から別途集計。GA4だけで成約を断定しない。

**重要な制約**：診断せず売り場へ直接行く人や0円で解決する人は、結果画面からの楽天送客率の分母に一律に混ぜず、別セグメントとして扱う。0円解決は品質の成功指標にも含める。

## GA4管理画面で必要な設定

- データストリームと測定ID `G-6STQ5HXRDH` の一致を確認。
- Realtime / DebugView にて4ページと共通イベント着信を検証。デバッグ交通は本番レポートから除外。
- カスタムディメンション `service_id`、`operator_test`、必要なら `conversion_source` をイベントスコープで登録する。反映前の履歴に遡って通常のカスタムディメンションが適用されるとは限らない。
- 探索レポートで順序ありファネルを作り、HOME起点と各サービス直接流入を分ける。
- Search Console連携・楽天成果は別データソースとして管理し、未確認の売上や成約を補完しない。
- まず14日間程度、継続して基準データを集め、母数が少ないうちは変化を断定しない。

## 確認状態

- GitHubコードとGitHub Actionsの静的/ブラウザQAで確認できる事項：計測イベントの実装、公開サイトの基本動作。
- 現時点では未確認：SOTOJITAKU用GA4プロパティへの接続、実イベント着信、カスタム定義、実ユーザーのファネル集計、楽天成果照合。

収益改善の提案は必ず実際のデータを確認してから優先順位を決定する。

## 2026-10-10 第1弾改訂（PR #256・承認待ち）

CAMPの診断コードと3サービスの検索ガイドに残った旧測定IDをG-6STQ5HXRDHへ統一。運営者識別は共通スクリプトでブラウザ内に保持し、`?test=0`で解除。旧解析停止キー2種類を維持し、停止ボタンは実際の測定IDを操作する。

共通イベントに`journey_step_view`、`journey_step_complete`（step_number/step_key）、`result_view`、`plan_save`、`plan_share`を追加。保存はCAMPダウンロード/FISHING明示的保存、共有はFISHINGのみ。既存の自動保存を1回ごとに計測したり、未実装UIにイベントを捏造しない。

GA4プロパティ558239521の10/4〜10/9実測はHOME2PV、2ユーザー、2セッション。運営者除外はこの接続で未確認。service_id/operator_testのカスタム定義は取得可能フィールドにない。旧履歴を正確に分離できるとは約束しない。Search ConsoleのSOTOJITAKU接続・楽天成果は未取得。測定ID変更前後の件数をCRO改善と誤解しない。

詳しい実装・限界・30日計画：[第1弾監査報告](../growth-phase1/REPORT.md)。CAR STAYの既存builder_completedは結果再描画でも発火しうるためイベント回数ではなく同一セッションの順序付きファネルで評価する。
