/** Advertiser-supplied creative preserved exactly; not audited product data. */
export const HINATA_A8_HTML = "<a href=\"https://px.a8.net/svt/ejp?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL\" rel=\"nofollow\">\n<img border=\"0\" width=\"300\" height=\"250\" alt=\"\" src=\"https://www23.a8.net/svt/bgt?aid=261103070370&wid=006&eno=01&mid=s00000022571002027000&mc=1\"></a>\n<img border=\"0\" width=\"1\" height=\"1\" src=\"https://www16.a8.net/0.gif?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL\" alt=\"\">";
export const HINATA_A8_URL = 'https://px.a8.net/svt/ejp?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL';
export function renderHinataRentalCard(rentals) {
  if (!Array.isArray(rentals) || rentals.length === 0) return '';
  return '<section class="camp-rental-ad" id="hinata-rental-ad" aria-labelledby="hinata-rental-title">'
    + '<p class="camp-rental-ad__label">広告｜A8.netアフィリエイト</p>'
    + '<h2 id="hinata-rental-title">「借りる」道具は、レンタル先も確認しよう</h2>'
    + '<p>' + rentals.length + '種類の道具を「借りる」にしています。キャンプ場での貸出と外部のレンタルを比較しましょう。</p>'
    + '<p>hinataレンタルではキャンプ用品やセットを探せます。配送地域、利用日程、送料、セット内容、返却方法、在庫を予約前に確認してください。</p>'
    + '<div class="camp-rental-ad__creative">' + HINATA_A8_HTML + '</div>'
    + '<p class="camp-rental-ad__disclaimer">これは広告です。上記の予算目安はSOTOJITAKU独自の計画用概算で、hinataレンタルの実際のレンタル価格ではありません。'
    + '在庫や貸出・配送可能性を保証しません。広告から申し込むと当サイトに成果報酬が発生する場合があります。</p>'
    + '</section>';
}
