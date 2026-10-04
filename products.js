const compact=s=>String(s??'').normalize('NFKC').replace(/\s/g,'');
export function safeUrl(value,kind='item'){try{const u=new URL(value);if(u.protocol!=='https:')return false;if(kind==='affiliate'){if(u.hostname!=='hb.afl.rakuten.co.jp'||!u.pathname.startsWith('/hgc/'))return false;const dest=new URL(u.searchParams.get('pc'));return dest.protocol==='https:'&&dest.hostname==='item.rakuten.co.jp';}if(kind==='image')return u.hostname==='thumbnail.image.rakuten.co.jp';return u.hostname==='item.rakuten.co.jp';}catch{return false;}}

export function defaultPreference(category,a){
 if(a.transport==='no_car')return 'compact';
 if((a.experiences||[]).includes('easy'))return 'easy';
 if(a.budget==='comfort')return 'comfort';
 if(['30000','50000'].includes(String(a.budget)))return 'value';
 if(Number(a.children)>0&&['tent','chair','table','fire_pit','burner'].includes(category))return 'easy';
 return 'balanced';
}

export function reject(p,category,answers,equipment,now=Date.now()){
 const c=equipment.categories.find(x=>x.id===category);if(!c||p.category!==category)return 'unknown_category';
 if(!p.name||!p.itemCode||!p.family||p.audited!==true||p.bodyConfirmed!==true)return 'unverified_body';
 const name=p.name.normalize('NFKC');if([...equipment.global_exclude_terms,...c.exclude_any,'選択式','価格から','円〜','円～','最安価格','タイプ選択'].some(x=>name.includes(x)))return 'excluded';
 const identity=Array.isArray(p.identityTerms)&&p.identityTerms.length>0&&p.identityTerms.every(x=>compact(name).includes(compact(x)));if(!c.include_any.some(x=>compact(name).includes(compact(x)))&&!identity)return 'category_mismatch';
 if(p.condition!=='new'||p.fixedVariant!==true||p.available!==true||p.quantityPerListing!==1)return 'listing_conditions';
 if(!safeUrl(p.itemUrl)||!safeUrl(p.affiliateUrl,'affiliate')||!safeUrl(p.image,'image'))return 'unsafe_url';
 if(new URL(new URL(p.affiliateUrl).searchParams.get('pc')).pathname!==new URL(p.itemUrl).pathname)return 'wrong_affiliate_destination';
 if(!p.verifiedAt||!Number.isFinite(Date.parse(p.verifiedAt))||now-Date.parse(p.verifiedAt)>7*86400000)return 'stale';
 if(!Number.isFinite(p.price)||p.price<=0||p.priceAudit!==true||!Number.isFinite(p.referencePrice)||p.referencePrice<=0||p.price<p.referencePrice*0.35)return 'price_audit';
 if(!p.spec||c.required_fields.some(f=>p.spec[f]===null||p.spec[f]===undefined||p.spec[f]===''||p.spec[f]===false))return 'missing_critical_field';
 const n=Number(answers.adults)+Number(answers.children),s=p.spec;
 if(n>4)return 'outside_mvp';
 if(category==='tent'&&(!Number.isFinite(s.capacity)||s.capacity<n))return 'capacity';
 if(category==='table'){const width=Number(String(s.table_size||'').match(/[0-9.]+/)?.[0]||0),capacity=Number(s.table_capacity)||(width>=110?4:width>=75?2:1);if(capacity<n)return 'table_capacity';}
 if(category==='sleeping_bag'&&(!Number.isFinite(s.comfort_temperature)||s.comfort_temperature>(answers.season==='summer'?15:5)))return 'temperature';
 if(category==='cooler'&&(!Number.isFinite(s.capacity_l)||s.capacity_l<(answers.stay==='daytrip'?n*3:n*6)))return 'cooler_capacity';
 if(category==='hot_sandwich_maker'&&s.heat_source!=='direct_flame')return 'heat_source';
 if(category==='burner'&&!['CB','OD','butane','propane'].includes(s.fuel_type))return 'fuel';
 if(category==='led_lantern'&&(!Number.isFinite(s.runtime_hours)||s.runtime_hours<6||s.brightness_lm<100))return 'light';
 if(answers.transport==='no_car'&&(!Number.isFinite(s.weight)||s.weight>({tent:4500,chair:3000,table:2000,cooler:1500}[category]||1500)))return 'portability';
 if(Number(answers.children)>0&&p.familyRestricted===true)return 'family_restricted';
 if(!p.evidence||!safeUrl(p.evidence.listing)||!p.evidence.specification||!p.evidence.fields||c.required_fields.some(f=>typeof p.evidence.fields[f]!=='string'||!p.evidence.fields[f]))return 'no_evidence';
 if(!p.scores||['fit','beginner','comfort','portability','value','trust'].some(k=>!Number.isFinite(p.scores[k])||p.scores[k]<0||p.scores[k]>1))return 'unknown_score';
 return null;
}

function prefBonus(p,pref){
 const s=p.scores,t=Array.isArray(p.traits)?p.traits:[];
 const map={easy:s.beginner*36+s.trust*4,comfort:s.comfort*40+s.fit*4,compact:s.portability*42+s.fit*2,value:s.value*38+s.fit*4,balanced:s.fit*5+s.beginner*3};
 return (map[pref]??map.balanced)+(t.includes(pref)?18:0);
}
function budgetBonus(p,quantity,targetBudget,pref='balanced'){
 if(!Number.isFinite(targetBudget)||targetBudget<=0)return 0;
 const personsPerUnit=Math.max(1,Number(p.spec?.persons_per_unit)||1),units=Math.max(1,Math.ceil(Math.max(1,quantity||1)/personsPerUnit)),total=p.price*units,ratio=total/targetBudget,penaltyScale={comfort:.25,easy:.7,compact:.75,value:1.25}[pref]||1;
 return ratio<=1?8-Math.max(0,ratio-.75)*8:-Math.min(24,(ratio-1)*24)*penaltyScale;
}
function popularityBonus(p){
 const count=Number(p.reviewCount||p.review_count||0),avg=Number(p.reviewAverage||p.review_average||0);
 const countScore=count>0?Math.min(5,Math.log10(count+1)*1.8):0;
 const avgScore=avg>0?Math.max(0,Math.min(5,(avg-3.5)*3.33)):0;
 return countScore+avgScore;
}
function baseScore(p,w){const total=Object.values(w).reduce((s,v)=>s+v,0)||1;return Object.entries(w).reduce((s,[k,v])=>s+(p.scores[k]||0)*v,0)/total*100;}
function reasonParts(p,c,a,pref,quantity,targetBudget){
 const n=Number(a.adults)+Number(a.children),parts=[];
 if(c==='tent')parts.push(`${n}人で使える定員を確認`);
 if(c==='sleeping_bag')parts.push(`${a.season==='summer'?'夏':'春・秋'}の計画に合う快適使用温度`);
 if(c==='table')parts.push(`${n}人で使える食卓サイズ`);
 if(c==='cooler')parts.push(`${n}人・${a.stay==='daytrip'?'日帰り':'1泊'}に必要な容量を確保`);
 if(c==='hot_sandwich_maker')parts.push('直火対応を確認');
 if(c==='burner')parts.push('対応燃料と点火方式を確認');
 if(c==='led_lantern')parts.push('夜を過ごせる明るさと点灯時間');
 if(c==='mat')parts.push(`${quantity||n}人分をそろえられる寝床`);
 if(c==='chair')parts.push(`${quantity||n}人分をそろえやすい`);
 if(c==='fire_pit')parts.push('本体・設営性・安全用品との組み合わせを確認');
 const labels={easy:'扱いやすさ',comfort:'快適さ',compact:'持ち運び',value:'予算',balanced:'総合バランス'};
 parts.push(`${labels[pref]||labels.balanced}を優先`);
 if(a.transport==='no_car')parts.push('車なしの重量条件を通過');
 else if(Number(a.children)>0&&['burner','fire_pit'].includes(c))parts.push('火器は大人が操作し、子どもの動線から離して使用');else if(Number(a.children)>0)parts.push('家族の人数条件を反映');
 if(Number.isFinite(targetBudget)&&targetBudget>0){const total=p.price*Math.max(1,quantity||1);parts.push(total<=targetBudget?'この道具の予算目安内':'必要条件を優先して予算超過を表示');}
 return parts;
}
function decorate(p,badge,c,a,pref,quantity,targetBudget,score){
 const personsPerUnit=Math.max(1,Number(p.spec?.persons_per_unit)||1),units=Math.max(1,Math.ceil(Math.max(1,quantity||1)/personsPerUnit)),totalPrice=p.price*units,parts=reasonParts(p,c,a,pref,quantity,targetBudget);
 return {...p,badge,units,totalPrice,matchScore:Math.max(0,Math.min(100,Math.round(score))),matchReasons:parts,reason:parts.join('。')+'。',budgetStatus:Number.isFinite(targetBudget)&&targetBudget>0?(totalPrice<=targetBudget?'within':'over'):'open'};
}
export function recommend(products,category,a,equipment,rules,options={},now=Date.now()){
 if(typeof options==='number'){now=options;options={};}
 const quantity=Math.max(1,Number(options.quantity)||1),targetBudget=Number(options.targetBudget),pref=options.preference||defaultPreference(category,a);
 const distinct=new Map();for(const p of products){if(reject(p,category,a,equipment,now))continue;const key=new URL(p.itemUrl).pathname;const previous=distinct.get(key);if(!previous||previous.price>p.price)distinct.set(key,p);}
 const pool=[...distinct.values()],profile=a.transport==='no_car'?'no_car':a.experiences.includes('easy')?'easy_mode':a.budget==='comfort'?'comfort':'default',weights=rules.profiles[profile]||rules.profiles.default;
 const score=p=>baseScore(p,weights)+prefBonus(p,pref)+budgetBonus(p,quantity,targetBudget,pref)+popularityBonus(p);
 const ranked=[...pool].sort((x,y)=>score(y)-score(x));
 if(!ranked.length)return [];
 const result=[decorate(ranked[0],'あなたなら、まずこれ',category,a,pref,quantity,targetBudget,score(ranked[0]))],families=new Set([ranked[0].family]);
 const alternate=(kind,badge)=>[...ranked].filter(p=>!families.has(p.family)).sort((x,y)=>{
   const sx=kind==='value'?x.scores.value*70+x.scores.fit*30:kind==='comfort'?x.scores.comfort*65+x.scores.fit*35:x.scores.portability*65+x.scores.fit*35;
   const sy=kind==='value'?y.scores.value*70+y.scores.fit*30:kind==='comfort'?y.scores.comfort*65+y.scores.fit*35:y.scores.portability*65+y.scores.fit*35;
   return sy-sx;
 })[0]&&(()=>{const p=[...ranked].filter(p=>!families.has(p.family)).sort((x,y)=>{
   const sx=kind==='value'?x.scores.value*70+x.scores.fit*30:kind==='comfort'?x.scores.comfort*65+x.scores.fit*35:x.scores.portability*65+x.scores.fit*35;
   const sy=kind==='value'?y.scores.value*70+y.scores.fit*30:kind==='comfort'?y.scores.comfort*65+y.scores.fit*35:y.scores.portability*65+y.scores.fit*35;
   return sy-sx;
 })[0];families.add(p.family);return decorate(p,badge,category,a,pref,quantity,targetBudget,score(p));})();
 const a2=alternate('value','価格を抑えるなら');if(a2)result.push(a2);
 const a3=alternate(a.transport==='no_car'?'compact':'comfort',a.transport==='no_car'?'軽く運ぶなら':'快適さを上げるなら');if(a3)result.push(a3);
 return result.slice(0,3);
}
