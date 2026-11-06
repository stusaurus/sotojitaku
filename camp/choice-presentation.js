/* A listing count is not proof of market-wide availability or a ranking.
 * Only comparison of at least two distinct eligible offers permits preference controls.
 */
export function eligibleChoiceCopy(count) {
  if (!Number.isInteger(count) || count < 0 || count > 3) {
    return {status:'invalid',showPreferences:false,eyebrow:'',title:'',note:''};
  }
  if (count === 0) {
    return {status:'empty',showPreferences:false,eyebrow:'',title:'',note:''};
  }
  if (count === 1) {
    return {
      status:'single',
      showPreferences:false,
      eyebrow:'ONE LISTED OPTION',
      title:'現在、条件を確認できた掲載候補は1件',
      note:'比較できる別の掲載候補がないため、好みで順位を変えることはできません。最安・最適とは断定せず、商品ページで価格・在庫・仕様を確認してください。'
    };
  }
  return {
    status:'compare',
    showPreferences:true,
    eyebrow:'BEST FOR YOUR CAMP',
    title:'あなたなら、まずこれ。',
    note:''
  };
}
