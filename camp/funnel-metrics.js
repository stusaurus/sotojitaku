/**
 * CAMP SPA measurement gate.
 *
 * Re-rendering after a preference change, status switch, or product selection
 * is NOT a new page visit. Questions have their own step_view events, and
 * product_view is a category exposure (NOT an individual SKU impression).
 *
 * This module never transmits events itself. Consumers may send approved,
 * bounded non-personal category/count metadata when the gate returns true.
 */
export function createCAMPVisitGate() {
  let lastScreen=null;
  let lastProductCategory=null;
  return function observe({route,category=null,resultCount=0}) {
    if(typeof route!=='string'||!route||route.length>64)
      return {pageView:false,categoryView:false,comparisonView:false,gapView:false,shoppingView:false};
    const pageView=route!==lastScreen;
    lastScreen=route;
    const validProduct=route==='products'&&typeof category==='string'
      &&/^[a-z_]{1,48}$/.test(category);
    const categoryView=validProduct&&(pageView||lastProductCategory!==category);
    lastProductCategory=validProduct?category:null;
    const count=Number.isInteger(resultCount)&&resultCount>=0&&resultCount<=3
      ?resultCount:0;
    return {
      pageView,
      categoryView:Boolean(categoryView),
      comparisonView:Boolean(categoryView&&count>0),
      gapView:Boolean(categoryView&&count===0),
      shoppingView:pageView&&route==='shopping',
    };
  };
}
