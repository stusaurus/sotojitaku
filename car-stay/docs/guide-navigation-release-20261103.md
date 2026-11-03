# SOTOJITAKU｜既存ガイドの入口改善と公開順序の記録（2026-11-03）

## 改善対象と実装
- SEOの対象は既存のHTMLガイド。商品情報の自動補完や新規SEOページの量産ではない。
- [PR #310](https://github.com/stusaurus/sotojitaku/pull/310) をマージ済み。HOMEにCAMP・CAR STAY・FISHING各3ページ、計9件の明示的な内部リンクを追加。
- CAR STAYの導線は `/car-stay/car/`, `/car-stay/car/n-box/mat/`, `/car-stay/car/sienta/2people/`。車名だけで用品適合を断定せず、正規ページに送る。
- 既存meta title、description、canonical、sitemap、robots、商品JSON、楽天アフィリエイト、GA4計測はこのSEO PRで変更しない。
- PR検証：Pythonのリンク実在/canonical/sitemap、ローカル320/390/1440pxでの9リンク表示・ガイド遷移、公開スモーク、ブランド統合6幅が成功。CAMPの既知選択肢不足4件のGrowth警告は未解決。

## 商品鮮度と公開順序
- HOME改修を含むマージSHA: `1e6d8f6a15b271f3bacf84de986155497b73a090`。
- 同日のCAR STAY商品更新SHA: `700401aecec8bee1bf62a9d31e3cf3e62309d747`。実証済み31件を維持し、`audited-products.json`のupdatedAtが`2026-11-03T10:03:08.722063+00:00`から`2026-11-03T12:44:19.408861+00:00`に更新された。
- [旧公開 #41638659977](https://github.com/stusaurus/sotojitaku/actions/runs/41638659977) は商品更新前のコミットで起動。古い検証日時を含む静的公開物で新CAR STAYカタログを上書きしないよう、この運営記録を**商品更新後のmainに記録**し、新しい `Publish verified SOTOJITAKU site` を起動する。
- 古い公開のキャンセルと、新しい公開実行の `Publish complete site`・`Verify published HOME editorial links and their destinations`・FISHING 13件一致/操作・CAR STAY操作の全工程成功を確認するまでは、最新公開完了とは報告しない。

## 公式GSCによる効果の扱い
- 2026-10-02〜10-29の公式28日窓ではSOTOJITAKU全体で4表示・0クリック（[横断運営 Issue #108](https://github.com/stusaurus/daily-cost-jp/issues/108)）。これはHOME改修前の限られた標本。今後の7/28日を同条件で取得し、検索語×ページ/新規訪問を検証する。
- リンクを追加しただけで、Googleインデックス・検索順位・クリック・成果報酬の向上が証明されたとは扱わない。
