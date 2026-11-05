/**
 * Purchase readiness based on currently eligible offers, not catalog count.
 * A recorded purchase intent never implies that a safe product is available.
 * Do not use research-only audits or alternate sellers to fabricate choices.
 */
import {recommend, reject, defaultPreference} from '../products.js';

export function analyzeSupply(gear, products, answers, equipment, rules,
                              preferences={}, selections={}, now=Date.now()) {
  const candidates=Array.isArray(products)?products:[];
  const categories=new Set((equipment?.categories||[]).map(c=>c.id));
  const rows=(Array.isArray(gear)?gear:[])
    .filter(g=>g.status==='buy'&&categories.has(g.id))
    .map(g=>{
      const selection=selections?.[g.id];
      const picked=selection?candidates.find(p=>p.category===g.id
        &&p.itemCode===selection
        &&reject(p,g.id,answers,equipment,now)===null):null;
      const preference=preferences?.[g.id]||defaultPreference(g.id,answers);
      // Ranking can change, but zero eligible offers must never be presented
      // as a product recommendation.
      const hasChoice=!!picked||recommend(candidates,g.id,answers,equipment,rules,
        {quantity:g.quantity,preference},now).length>0;
      return {
        id:g.id,label:g.label,quantity:g.quantity,
        status:picked?'picked':hasChoice?'selectable':'unavailable',
      };
    });
  const picked=rows.filter(row=>row.status==='picked');
  const selectable=rows.filter(row=>row.status==='selectable');
  const unavailable=rows.filter(row=>row.status==='unavailable');
  return {rows,picked,selectable,unavailable,total:rows.length,
    pickedCount:picked.length,selectableCount:selectable.length,
    unavailableCount:unavailable.length};
}
