# SOTOJITAKU Component Spec

## 1. Header
- Hero上では透明。
- 左に `SOTOJITAKU`、小さく `CAMP`。
- 右はmenu iconのみ。
- スクロール後は Warm Canvas の半透明〜不透明背景へ。
- 大量ナビは出さない。

## 2. Primary CTA
- 高さ56px以上。
- Deep Forest背景 / Soft White文字。
- 角丸16px。
- hover/tapは小さな明度差＋1〜2px沈む程度。
- 文言は短く、末尾矢印可。

## 3. Secondary CTA
- 背景透明またはSoft White。
- 1px Sand border。
- Deep Forest文字。
- Primaryと同時に強く見せない。

## 4. Question Sheet
- Warm Canvas。
- 上角のみ28px。
- progress → question → options の順。
- 画面下に詰め込みすぎない。
- 「診断フォーム」ではなく「キャンプを作る操作盤」に見せる。

## 5. Experience Tile
- 写真/ビジュアル優先。
- 商品写真は禁止。
- 例：焚き火台ではなく焚き火を囲む夜。
- 選択時は極薄Forest背景 / Forest border / 小さなcheck。

## 6. Product Recommendation
- バッジ → 商品画像 → 推薦理由 → 価格 → 楽天CTA。
- 価格を最大要素にしない。
- 3列ECカードの量産感を避ける。
- モバイルでは縦積み、1カードごとの余白を大きく。

## 7. Ability Chip
- 「shelter」のような内部語を出さない。
- `泊まれる` / `焚き火できる` など日本語の成果を表示。
- pill乱用禁止。必要な場面だけ使う。

## 8. Bottom Navigation
3項目のみ:
- ホーム
- 売り場
- わたしのキャンプ

## 9. Empty / Error State
- 商品0件でも体験を壊さない。
- 「条件に合う商品を安全に確認できませんでした」を表示。
- シミュレーター結果・必要装備は残す。
- ダミー商品は禁止。
