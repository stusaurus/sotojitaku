/**
 * Source-owned A8.net creatives for two distinct CAMP shopping choices.
 * The visitor supplied these exact advertiser ad snippets and clarified the
 * 300x250 creative is for buying, 600x500 for renting.
 * Neither creative is an actual quote, recommendation rank or booking confirmation.
 */
export const HINATA_BUY_CREATIVE = `<a href="https://px.a8.net/svt/ejp?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL" rel="nofollow">
<img border="0" width="300" height="250" alt="" src="https://www23.a8.net/svt/bgt?aid=261103070370&wid=006&eno=01&mid=s00000022571002027000&mc=1"></a>
<img border="0" width="1" height="1" src="https://www16.a8.net/0.gif?a8mat=4BGCF2+64AIGQ+4U5Q+C2GFL" alt="">`;

export const HINATA_RENT_CREATIVE = `<a href="https://px.a8.net/svt/ejp?a8mat=4BGCF2+64VY2I+4U5Q+62ENL" rel="nofollow">
<img border="0" width="600" height="500" alt="" src="https://www24.a8.net/svt/bgt?aid=261103070371&wid=006&eno=01&mid=s00000022571001019000&mc=1"></a>
<img border="0" width="1" height="1" src="https://www16.a8.net/0.gif?a8mat=4BGCF2+64VY2I+4U5Q+62ENL" alt="">`;

export const HINATA_PROGRAMS = Object.freeze({
  buy: 'hinata_purchase',
  rent: 'hinata_rental'
});

/**
 * Only display the creative for the selected action.
 * The user's plan controls display, never advertiser tracking code.
 */
export function renderHinataChoice(gearPlan, choice, placement = 'gear') {
  if (!['buy', 'rent'].includes(choice)) throw new Error('Unsupported shopping choice');
  if (!['gear', 'missing'].includes(placement)) throw new Error('Unsupported placement');
  if (!Array.isArray(gearPlan)) return '';
  const count = gearPlan.filter(gear => gear.status === choice).length;
  if (count === 0) return '';

  const buying = choice === 'buy';
  const creative = buying ? HINATA_BUY_CREATIVE : HINATA_RENT_CREATIVE;
  const title = buying
    ? '今回そろえる道具の購入先を確認する'
    : '今回は借りる道具のレンタル先を確認する';
  const guidance = buying
    ? '送料やクーポン適用条件を含めた実際の購入総額、商品の仕様・人数・返品条件を確認してください。'
    : '利用日・受取場所・対象商品・在庫・返却方法を確認し、商品代金・送料・手数料・補償料を含めた申込総額で判断してください。';
  const disclaimer = buying
    ? '掲載商品が診断条件に適合することや、楽天での購入より安いことは保証しません。'
    : '借りたい道具が貸し出されることや、購入より安いことは保証しません。';
  const budgetType = buying ? '買う予算' : '借りる予算';
  const id = 'hinata-' + choice + '-heading';

  return `<section class="hinata-choice-card hinata-choice-card--${choice}" data-hinata-choice="${choice}" data-hinata-placement="${placement}" aria-labelledby="${id}">
    <p class="hinata-choice-disclosure">広告｜A8.netアフィリエイト</p>
    <h2 id="${id}">${title}</h2>
    <p>診断で「${buying ? '今回そろえる' : '今回は借りる'}」を選んだ道具は<strong>${count}種類</strong>です。
    以下は外部サービスの広告であり、SOTOJITAKUの推奨商品一覧や価格ランキングには含めません。</p>
    <p class="hinata-choice-note">${guidance} 診断中の「${budgetType}」は計画用の目安であり、広告先の実売価格・レンタル料金ではありません。</p>
    <div class="hinata-choice-banner hinata-choice-banner--${choice}">${creative}</div>
    <p class="hinata-choice-note">${disclaimer} 最新の契約・配送・キャンセル条件を広告先でご確認ください。
    広告リンクを経由した購入・申込により、当サイトに成果報酬が発生する場合があります。</p>
  </section>`;
}
