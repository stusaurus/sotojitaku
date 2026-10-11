# FISHING 商品取得の切り分け（2026-10-11 JST）

## 実測した取得結果

正規Workerの公開エンドポイントへ、既存のOrigin/Refererで読み取りのみ実行した。購入・カート・アフィリエイトクリックは生成していない。

|問い合わせ|返却結果|解釈|
|---|---|---|
|つり具TEN 500523のURL、商品番号検索|found=false / exact_item_not_found|取得できない。販売終了を意味しない|
|同じURL、商品名「シマノ サビキ ちょい投げ セット」|found=false / error=rakuten_api_error|上流API失敗。商品なしと混同しない|
|既存掲載商品LUMICA G09224のURL・型番|found=false / error=rakuten_api_error|候補だけの問題ではない|
|シエナコンボの検索|products=[] / count=0|在庫なしを証明しない。問い合わせの成功可否に注意|

候補商品の価格・送料・正規affiliateUrlがそろっていないため、商品データ/seedは追加しない。停止済み商品を復帰させない。

## 修正

Workerの明示APIエラー、HTTP失敗、通信失敗、不正JSONを安全なコードに分類し、最終的に商品を解決できなかった場合の監査理由に残す。上流のメッセージ全文・URL・認証情報は記録しない。

問い合わせ先の優先順、次の取得元へのフォールバック、商品名/型番照合、価格/画像/affiliateUrlチェック、在庫停止、安全判定、商品推薦、デザインは維持する。公開データが欠落している場合に価格や購入リンクを捏造しない。

## 継続作業の確定状況

- PR #260は承認後マージ済み。公開後のスマホ/PC診断検証とPages公開は成功。
- GA4の3サービス別ユーザー単位ファネルを保存し、再読込後のoperator_test完全一致0、service_id各サービス完全一致、期間10/10〜10/11を確認。まだデータなしで、実利用者0件・成果・離脱率とは断定しない。
- Search Consoleで10/11朝、CAMPとCAR STAYは「URL is on Google / Page is indexed」。
- FISHINGは9:02のライブ検査合格後、登録リクエスト受理。インデックス完了は未確認。
- sitemap.xmlは9:03:29のGoogleライブ検査でPage fetch Successful、Crawl allowed Yes。一方サイトマップ報告はLast read 10/10/26、Sitemap could not be read、discovered pages 0のまま。処理原因は未特定。XMLへのインデックス登録リクエストや連続再送信はしない。
- 毎朝8:35予定のGrowth監査は、今朝確認時点でschedule実行履歴なし。予定と実行成功を区別する。

本PRは未公開。利用者数・売上・検索流入の増加は未測定。次の測定ではAPIの取得不能と実際の商品不足を分けて扱う。
