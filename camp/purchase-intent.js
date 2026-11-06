/** Keep plan selection, purchased intent and link origin distinct.
 * Pure functions; do not infer checkout, transaction or sale.
 */
export function purchaseSelectionContext(category,gearPlan){
  if(typeof category!=='string'||!category||!Array.isArray(gearPlan))
    return {status:'unknown',plannedBuy:false,message:'候補を保存しました。購入予定は確認できません。'};
  const gear=gearPlan.find(row=>row&&row.id===category);
  if(gear?.status==='buy')
    return {status:'buy',plannedBuy:true,message:'今回そろえる道具の候補に追加しました。楽天で価格・在庫を確認してください。'};
  if(gear?.status==='owned')
    return {status:'owned',plannedBuy:false,message:'商品候補を保存しました。この道具は「持っている」ため、今回の買うものリストには入りません。'};
  if(gear?.status==='rent')
    return {status:'rent',plannedBuy:false,message:'商品候補を保存しました。この道具は「借りる」予定のため、今回の買うものリストには入りません。'};
  if(gear?.status==='skip')
    return {status:'skip',plannedBuy:false,message:'商品候補を保存しました。この道具は「次回でもOK」のため、今回の買うものリストには入りません。'};
  return {status:'undecided',plannedBuy:false,message:'商品候補を保存しました。今回そろえる道具にするかは、装備計画で選べます。'};
}

export function affiliateClickSource(route){
  if(route==='shopping')return 'camp_shopping_list';
  if(route==='products')return 'camp_product_card';
  return 'camp_other';
}
