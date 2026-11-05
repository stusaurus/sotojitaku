/**
 * Evidence-backed CAMP comparison view. Receives ONLY the already validated
 * and ranked results of products.recommend; never searches or fills in offers.
 * Specification values are shown only when that exact field has an
 * independently recorded manufacturer evidence reference.
 */
const SPECS={
 tent:[['capacity','定員','people'],['weight','本体重量','grams'],['packed_size','収納サイズ','text']],
 sleeping_bag:[['comfort_temperature','快適使用温度','celsius'],['weight','重量','grams'],['packed_size','収納サイズ','text']],
 mat:[['length','長さ','cm'],['width','幅','cm'],['weight','重量','grams']],
 chair:[['weight','重量','grams'],['load_capacity','耐荷重','kg']],
 table:[['table_size','使用時サイズ','text'],['table_capacity','推奨人数','people'],['weight','重量','grams']],
 cooler:[['capacity_l','容量','liters'],['weight','重量','grams']],
 fire_pit:[['capacity','メーカー確認人数','people'],['weight','重量','grams']],
 led_lantern:[['brightness_lm','明るさ','lumens'],['runtime_hours','点灯時間','hours'],['weight','重量','grams']],
 burner:[['fuel_type','燃料','text'],['weight','重量','grams']],
 hot_sandwich_maker:[['heat_source','熱源','heat'],['weight','重量','grams']],
};

export function yen(n){
 return typeof n==='number'&&Number.isFinite(n)&&n>=0?'¥'+Math.round(n).toLocaleString('ja-JP'):null;
}
const textValue=(v,kind)=>{
 if(kind==='text')return typeof v==='string'&&v.trim()?v.trim():null;
 if(kind==='heat')return v==='direct_flame'?'直火':null;
 if(typeof v!=='number'||!Number.isFinite(v))return null;
 if(kind==='grams')return v>0?(v>=1000&&v%100===0?`${v/1000}kg`:`${v}g`):null;
 if(kind==='people')return Number.isInteger(v)&&v>0?`${v}人`:null;
 if(kind==='celsius')return v>=-50&&v<=50?`${v}℃`:null;
 if(kind==='cm')return v>0?`${v}cm`:null;
 if(kind==='kg')return v>0?`${v}kg`:null;
 if(kind==='liters')return v>0?`${v}L`:null;
 if(kind==='lumens')return v>0?`${v}lm`:null;
 if(kind==='hours')return v>0?`${v}時間`:null;
 return null;
};
function makerPeopleVerified(p){
 const proof=p?.familyCapacityEvidence;
 return !!proof&&proof.basis==='manufacturer_explicit_person_count'
  &&proof.maxPeople===p?.spec?.capacity
  &&proof.source===p?.evidence?.specification;
}
export function verifiedSpecs(p,category){
 const fields=SPECS[category]||[];
 const evidence=p?.evidence?.fields||{};
 return fields.flatMap(([key,label,kind])=>{
  // Even an attractive unverified optional weight/capacity is not a comparison claim.
  if(typeof evidence[key]!=='string'||!evidence[key].startsWith('https://'))return [];
  if(category==='fire_pit'&&key==='capacity'&&!makerPeopleVerified(p))return [];
  const value=textValue(p?.spec?.[key],kind);
  return value?[{key,label,value}]:[];
 });
}
export function compareModels(recommended,category,{targetBudget}={}){
 if(!Array.isArray(recommended)||!recommended.length)return {rows:[],fields:[],count:0};
 // Never count a second Rakuten shop for the SAME product as another option.
 const seen=new Set(),rows=[];
 for(const p of recommended.slice(0,3)){
  if(!p||typeof p.family!=='string'||!p.family||seen.has(p.family))continue;
  if(typeof p.price!=='number'||!Number.isFinite(p.price)||p.price<=0)continue;
  if(!Number.isInteger(p.units)||p.units<1||p.units>20)continue;
  seen.add(p.family);
  const total=p.price*p.units;
  const budget=Number(targetBudget);
  const difference=Number.isFinite(budget)&&budget>0?Math.round(total-budget):null;
  rows.push({
   rank:rows.length+1,itemCode:p.itemCode,
   name:p.name,units:p.units,unitPrice:p.price,totalPrice:total,
   image:typeof p.image==='string'
     &&p.image.startsWith('https://thumbnail.image.rakuten.co.jp/')
     ?p.image:null,
   difference,
   specs:verifiedSpecs(p,category),
   reason:Array.isArray(p.matchReasons)?p.matchReasons.filter(x=>typeof x==='string').slice(0,2):[],
  });
 }
 // Only fields evidenced for EVERY compared product are useful in side-by-side
 // purchase comparison; don't pretend missing specifications are comparable.
 const keys=rows.length>1?rows[0].specs.map(s=>s.key)
   .filter(key=>rows.every(row=>row.specs.some(s=>s.key===key))):[];
 return {rows,count:rows.length,fields:keys};
}
