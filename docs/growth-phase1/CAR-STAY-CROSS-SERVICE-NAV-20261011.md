# CAR STAY検索ページのCAMP誤リンク修正（2026-10-11）

## 発見

GitHub `main` のHTMLを直接確認したところ、CAR STAYの車種SEOハブ（`/car-stay/car/`）と6車種の概要ページ（N-BOX・シエンタ・FREED・ハスラー・N-VAN・エブリイ）に、リンクラベルが `CAMP` なのに実際の遷移先が `/sotojitaku/`（ブランドHOME）となる誤配線があった。

- ハブ: `href="../../"` は `/sotojitaku/` を指す
- 車種ページ: `href="../../../"` も `/sotojitaku/` を指す
- 期待されるCAMPの入口は `https://stusaurus.github.io/sotojitaku/camp/`

### 今回の修正

7ページの既存ナビゲーション `CAMP` の `href` だけを修正。

- ハブ `../../camp/`
- 車種概要6ページ `../../../camp/`

元のページデザイン、文言、SEO本文、canonical、カタログ、車種適合判定、商品推薦、GA4、アフィリエイト計測には触れない。

回帰テストでは7ページのURLをcanonical基準で解決し、リンク先が `/sotojitaku/camp/` であることを検証する。

## 計測・効果の限界

- 検索流入・クリック率・収益増加を測定した修正ではない。既存の誤リンクを正常化しただけ。
- Search Consoleのsitemap取得問題やFISHINGの竿・リール不足は別課題。未確認の原因に基づいてrobots/sitemapや商品データを変更しない。
- 公開URLはブラウザによる今回の直接取得ができなかった。コード上の誤配線と新しい静的テストが今回の証拠。
- PRをマージ/公開しない。PR #262の商品ガード、#263の計測隔離とは独立した変更。
