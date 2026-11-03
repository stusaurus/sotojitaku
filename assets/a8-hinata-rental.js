/**
 * hinataレンタル / A8.net: source-owned official 300x250 creative.
 * Not a product recommendation, paid booking, quoted rental rate or gear-fit audit.
 * The original A8 HTML (including the 1x1 impression pixel) remains unchanged.
 */
export const HINATA_A8_CREATIVE = `<a href="https://px.a8.net/svt/ejp?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL" rel="nofollow">
<img border="0" width="300" height="250" alt="" src="https://www23.a8.net/svt/bgt?aid=261103070370&wid=006&eno=01&mid=s00000022571002027000&mc=1"></a>
<img border="0" width="1" height="1" src="https://www16.a8.net/0.gif?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL" alt="">`;

export const HINATA_PROGRAM = 'hinata_rental';

export function renderHinataRental(gearPlan, placement = 'gear') {
  // Show the advertisement only after a person explicitly chooses to rent.
  if (!Array.isArray(gearPlan) || !gearPlan.some(gear => gear.status === 'rent')) return '';
  if (!['gear', 'missing'].includes(placement)) throw new Error('Unsupported rental ad placement');
  const count = gearPlan.filter(gear => gear.status === 'rent').length;
  return `<section class="hinata-rental-card" data-hinata-rental data-hinata-placement="${placement}" aria-labelledby="hinata-rental-heading">
    <p class="hinata-rental-disclosure">広告｜A8.netアフィリエイト</p>
    <h2 id="hinata-rental-heading">借りる予定の道具があれば、レンタル先を確認</h2>
    <p>このプランで「借りる」を選んだ道具は<strong>${count}種類</strong>です。
    キャンプ用品レンタル「hinataレンタル」ではテント・寝袋などの貸し出しを扱っています。
    ただし、診断で選んだ道具が同じ仕様・人数分で借りられるとは限りません。</p>
    <p class="hinata-rental-note">利用日・受取場所・対象商品・在庫を確認し、<strong>商品代金＋配送代金（送料・手数料）＋補償料</strong>を含めた申込総額で判断してください。
    SOTOJITAKUの「借りる予算」は計画用の概算であり、hinataレンタルの見積額ではありません。</p>
    <div class="hinata-rental-banner">${HINATA_A8_CREATIVE}</div>
    <p class="hinata-rental-note">広告から予約した場合、当サイトに成果報酬が発生することがあります。
    購入より安いこと、在庫や配送が確保されることを保証するものではありません。
    貸出条件・キャンセル規定は申込前に公式ページで確認してください。</p>
  </section>`;
}
