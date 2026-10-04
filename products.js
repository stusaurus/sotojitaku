export function safeUrl(value,kind='item'){try{const u=new URL(value);if(u.protocol!=='https:')return false;if(kind==='affiliate'){if(u.hostname!=='hb.afl.rakuten.co.jp'||!u.pathname.startsWith('/hgc/'))return false;const dest=new URL(u.searchParams.get('pc'));return dest.protocol==='https:'&&dest.hostname==='item.rakuten.co.jp';}if(kind==='image')return u.hostname==='thumbnail.image.rakuten.co.jp';return u.hostname==='item.rakuten.co.jp';}catch{return false;}}
export function reject(p,category,answers,equipment,now=Date.now()){
 const c=equipment.categories.find(x=>x.id===category);if(!c||p.category!==category)return 'unknown_category';
 if(!p.name||!p.itemCode||!p.family||p.audited!==true||p.bodyConfirmed!==true)return 'unverified_body';
 const name=p.name.normalize('NFKC');if([...equipment.global_exclude_terms,...c.exclude_any,'選択式','価格から','円〜','円～','最安価格','タイプ選択'].some(x=>name.includes(x)))return 'excluded';
 const compact=s=>String(s??'').normalize('NFKC').replace(/\s/g,'');const identity=Array.isArray(p.identityTerms)&&p.identityTerms.length>0&&p.identityTerms.every(x=>compact(name).includes(compact(x)));if(!c.include_any.some(x=>compact(name).includes(compact(x)))&&!identity)return 'category_mismatch';
 if(p.condition!=='new'||p.fixedVariant!==true||p.available!==true||p.quantityPerListing!==1)return 'listing_conditions';
 if(!safeUrl(p.itemUrl)||!safeUrl(p.affiliateUrl,'affiliate')||!safeUrl(p.image,'image'))return 'unsafe_url';
 if(new URL(new URL(p.affiliateUrl).searchParams.get('pc')).pathname!==new URL(p.itemUrl).pathname)return 'wrong_affiliate_destination';
 if(!p.verifiedAt||!Number.isFinite(Date.parse(p.verifiedAt))||now-Date.parse(p.verifiedAt)>7*86400000)return 'stale';
 if(!Number.isFinite(p.price)||p.price<=0||p.priceAudit!==true||!Number.isFinite(p.referencePrice)||p.referencePrice<=0||p.price<p.referencePrice*0.35)return 'price_audit';
 if(!p.spec||c.required_fields.some(f=>p.spec[f]===null||p.spec[f]===undefined||p.spec[f]===''||p.spec[f]===false))return 'missing_critical_field';
 const n=Number(answers.adults)+Number(answers.children),s=p.spec;
 if(n>4)return 'outside_mvp';
 if(category==='tent'&&(!Number.isFinite(s.capacity)||s.capacity<n))return 'capacity';
 if(category==='table'&&(!Number.isFinite(s.table_capacity)||s.table_capacity<n))return 'table_capacity';
 if(category==='sleeping_bag'&&(!Number.isFinite(s.comfort_temperature)||s.comfort_temperature>(answers.season==='summer'?15:5)))return 'temperature';
 if(category==='cooler'&&(!Number.isFinite(s.capacity_l)||s.capacity_l<(answers.stay==='daytrip'?n*3:n*6)))return 'cooler_capacity';
 if(category==='hot_sandwich_maker'&&s.heat_source!=='direct_flame')return 'heat_source';
 if(category==='burner'&&!['CB','OD','butane','propane'].includes(s.fuel_type))return 'fuel';
 if(category==='led_lantern'&&(!Number.isFinite(s.runtime_hours)||s.runtime_hours<6||s.brightness_lm<100))return 'light';
 if(answers.transport==='no_car'&&(!Number.isFinite(s.weight)||s.weight>({tent:3000,chair:1500,table:2000,cooler:1500}[category]||1500)))return 'portability';
 if(answers.children>0&&p.childStable!==true&&['tent','chair','table','burner','fire_pit'].includes(category))return 'child_stability';
 if(!p.evidence||!safeUrl(p.evidence.listing)||!p.evidence.specification||!p.evidence.fields||c.required_fields.some(f=>typeof p.evidence.fields[f]!=='string'||!p.evidence.fields[f]))return 'no_evidence';
 if(!p.scores||['fit','beginner','comfort','portability','value','trust'].some(k=>!Number.isFinite(p.scores[k])||p.scores[k]<0||p.scores[k]>1))return 'unknown_score';
 return null;
}
export function recommend(products,category,a,equipment,rules,now=Date.now()){
 const distinct=new Map();for(const p of products){if(reject(p,category,a,equipment,now))continue;const key=new URL(p.itemUrl).pathname;const previous=distinct.get(key);if(!previous||previous.price>p.price)distinct.set(key,p);}
 const pool=[...distinct.values()];const weights=rules.profiles[a.transport==='no_car'?'no_car':a.experiences.includes('easy')?'easy_mode':a.budget==='comfort'?'comfort':'default'];
 const score=(p,w)=>Object.keys(w).reduce((s,k)=>s+p.scores[k]*w[k],0);
 const result=[],families=new Set();
 for(const [profile,badge] of [['default','迷ったらこれ'],['budget','価格重視'],['comfort','快適重視']]){
 const ranked=pool.filter(p=>!families.has(p.family)&&(profile!=='default'||p.scores.fit>=.8&&p.scores.beginner>=.7)).sort((x,y)=>score(y,profile==='default'?weights:rules.profiles[profile])-score(x,profile==='default'?weights:rules.profiles[profile]));
 if(ranked[0]){families.add(ranked[0].family);result.push({...ranked[0],badge,reason:reason(ranked[0],category,a)});}
 }return result.slice(0,3);
}
function reason(p,c,a){const n=Number(a.adults)+Number(a.children);const base={tent:`${n}人で使える定員を確認。`,sleeping_bag:`${a.season==='summer'?'夏':'春・秋'}の計画向けに快適使用温度を確認。`,table:`${n}人の食卓に合う大きさを確認。`,cooler:`${n}人の食材に合う容量を確認。`,hot_sandwich_maker:'直火で使える仕様を確認。',burner:'対応燃料と点火方式を確認。'}[c]||'本体と必要な仕様を確認。';return base+(a.transport==='no_car'?'持ち運びの重量を重視しています。':a.children>0?'家族での安定性も確認しています。':'初めての扱いやすさを重視しています。');}
