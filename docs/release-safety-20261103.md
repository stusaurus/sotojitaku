# STEP88｜SOTOJITAKU公開事故の再発防止（2026-11-03）

## 実際に起きた3事象と恒久措置

| 事象 | 原因 | 実装・再発を検出するテスト |
|---|---|---|
| PR中の未公開ホーム改善を本番URLで評価し、誤失敗 | PRコードと現在公開中のコードの区別が曖昧 | PRプレビューは`/sotojitaku/`相当のローカルサーバー＋`tests/home-guide-browser.cjs`で新規10リンクを必須検証。本番スモークは既存9リンク以上のベースラインを必須チェック。新しい10リンクは正式公開後の実URLでも検証 |
| `home.css`修正後の`?v=...`が旧ハッシュでCI失敗 | HTML識別子を人手で更新し、source-before-stampをテスト | PR previewの各ランナーで`scripts/stamp_assets.py`を先に実行し、`assets.test.mjs`で実バイト一致。公開後のブラウザも実配信CSSのSHA-256先頭12桁とHTMLリンクを照合。fingerprint専用CIはread-onlyでmainへ余計な自動コミットを作らない |
| CAR STAYの在庫自動更新中に旧Pagesジョブが先行 | 同時にmainが進み、旧実行が静的サイトを上書きしかけた | `scripts/check_release_head.py`で最新main SHAを公開準備前・deploy直前の2回確認。旧版は公開せず、取得不能は失敗。既存concurrency`cancel-in-progress`維持。公開後CAR STAY JSONを検証済みソースと完全一致、FISHING も既存の完全一致を保護 |

## 何を確認すると「公開成功」なのか

1. **PRで検証**：`python -m unittest discover -s tests -p 'test_*.py'`、`npm run test:non-camp-live`、ページ幅320/390/1440で新導線に実移動、ブランド統合6幅を確認。
2. **公開直前**：`git ls-remote origin refs/heads/main`と`GITHUB_SHA`の一致。更新されていたら旧実行は**SKIP**、新main由来のジョブに委ねる。取得失敗は**FAIL**として安全停止。
3. **本番へdeploy**：毎回HTMLの資産識別子をそのランナーで再計算し、検証済み静的ファイルだけを`deploy-pages`で公開。
4. **公開後の実証**：HOMEの10リンク＋CSS fingerprintを実URLの320/390/1440で確認。FISHING・CAR STAY双方のJSON全一致、診断操作、ポータブル電源計算のUIと安全性を別々に確認する。

**注意：** GitHub Actions側の再実行・サービス障害・プラットフォーム側GitHub Pagesデプロイは完全には制御できない。新設の保護は古いコードをデプロイするリスクを下げ、検証失敗を自動検出する仕組み。すべてのエラーの不発生を保証するものではない。

## 運用者への指針

- `main`へ「ハッシュ更新だけ」の自動コミットを繰り返さず、実行中のPagesアーティファクトをstamping。PRの静的検証でも同じ工程で再生成。
- 旧バージョンの公開ジョブがキャンセル/スキップされた場合、そのジョブを単独で再実行せず、**最新mainから**ワークフローを実行。正常な旧ジョブ破棄を不具合扱いしない。
- 公開後JSONの一致が確認できなかったら、価格・在庫・期限を偽造して通過させない。GitHub Pagesの伝播遅延を検査したうえで最新版の再公開を行う。
- 商品不足によるGrowth監査の本物のエラー（CAMP LEDランタン、家族向けテントの選択肢、FISHINGの子どもPFD等）は**別Issue**として保持し、公開制御修正のついでに消さない。
- ホームの既存SEO導線とCAR STAY電源計算機への新リンクを公開しても、GSCの表示・クリック増加は未証明。検索成果は公式finalの新しい7/28日窓で別途測定。
