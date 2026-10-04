// Authoritative data is loaded unchanged from the Work handoff.
export const STATUS = ['owned','buy','rent','skip','undecided'];
export const DEFAULT = {party_type:'couple',adults:2,children:0,season:'spring',stay:'one_night',transport:'car',experiences:['relax'],budget:'50000'};
export const ESTIMATES = {tent:[18000,3500],sleeping_bag:[4500,1000],mat:[3500,800],chair:[3000,600],table:[5000,1000],led_lantern:[3000,500],headlight:[1500,300],burner:[5500,800],cooler:[6000,1200],fire_pit:[6000,1500],hot_sandwich_maker:[3000,500],garbage_bags:[200,0],first_aid:[1000,0],rainwear:[2000,0],fire_tongs:[1200,300],heat_gloves:[1500,300],firestarter:[500,0],extinguish_water:[0,0],kettle:[1800,400],grill_net:[1500,300],tongs:[600,0],fuel:[1000,0],fire_sheet:[2000,500],long_skewer:[500,0],frying_pan:[1800,400],pot:[2000,500],mess_tin:[1800,400],dripper:[800,0],filter:[200,0],foil:[300,0],knife:[800,0],cutting_board:[500,0]};
export const EXTRA = [{id:'kettle',label:'ケトル・湯沸かし用の鍋'},{id:'grill_net',label:'BBQ用の網'},{id:'tongs',label:'食材用トング'},{id:'fuel',label:'対応する燃料・炭・薪'},{id:'fire_sheet',label:'耐熱シート（地面の保護）'},{id:'long_skewer',label:'長い串'},{id:'frying_pan',label:'フライパン'},{id:'pot',label:'鍋'},{id:'mess_tin',label:'メスティン'},{id:'dripper',label:'ドリッパー'},{id:'filter',label:'コーヒーフィルター'},{id:'foil',label:'アルミホイル'},{id:'knife',label:'調理用ナイフ'},{id:'cutting_board',label:'まな板'}];
export function totalPeople(a){ return Number(a.adults)+Number(a.children); }
export function selectedRecipes(state,data){return data.recipes.recipes.filter(r=>(state.recipes||[]).includes(r.id)&&!(state.answers.stay==='daytrip'&&r.meal==='breakfast'));}
export function desired(state,data){const a=state.answers;const ids=new Set(a.stay==='one_night'?['shelter','sleep','night','walk_night']:[]);for(const x of data.questions.questions[5].options)if(a.experiences.includes(x.id))for(const id of x.abilities||[])ids.add(id);for(const r of selectedRecipes(state,data))for(const id of r.abilities)ids.add(id);return ids;}
const has=(a,k)=>a.experiences.includes(k);
export function plan(state,data){
 const a=state.answers,n=totalPeople(a),d=desired(state,data),ids=new Set(['garbage_bags','first_aid']);
 const add=(...x)=>x.forEach(v=>ids.add(v));
 if(a.stay==='one_night')add('tent','sleeping_bag','mat','led_lantern','headlight');
 if(d.has('sleep_comfort'))add('sleeping_bag','mat');
 if(d.has('sit')||d.has('bbq')||d.has('cook')||d.has('coffee'))add('chair');
 if(d.has('bbq')||d.has('cook')||d.has('coffee'))add('table');
 if(d.has('night'))add('led_lantern','headlight');
 if(d.has('cook')||d.has('coffee')||d.has('hot_sandwich')||d.has('rice'))add('burner','fuel');
 if(d.has('coffee'))add('kettle');
 if(d.has('hot_sandwich'))add('hot_sandwich_maker');
 if(d.has('cold_food')||d.has('bbq'))add('cooler');
 if(d.has('bbq'))add('fire_pit','grill_net','tongs','fuel');
 if(d.has('bonfire')||d.has('bbq')||d.has('bonfire_food')||d.has('marshmallow'))add('fire_pit','fire_tongs','heat_gloves','firestarter','extinguish_water','fire_sheet','fuel');
 if(d.has('marshmallow'))add('long_skewer');
 for(const r of selectedRecipes(state,data)){
  add(...r.required_gear,...r.optional_gear);
  if(r.ingredients.some(i=>/肉|魚|卵|牛乳|ハム|チーズ|ソーセージ|具材/.test(i)))add('cooler');
 }
 const all=[...data.equipment.categories,...data.equipment.supporting_items,...EXTRA];
 return [...ids].map(id=>{const base=all.find(g=>g.id===id);let quantity=['sleeping_bag','mat','chair','headlight','rainwear'].includes(id)?n:1;
 const core=['garbage_bags',...(a.stay==='one_night'?['tent','sleeping_bag','mat','led_lantern','headlight']:[])].includes(id);
 const required=core||!['chair','table','first_aid'].includes(id)||d.has('sit')&&id==='chair';
 const status=state.gear[id]||'buy';const prices=ESTIMATES[id]||[1000,300];
 return {...base,id,quantity,core,required,status,estimate:prices[0]*quantity,rentalEstimate:prices[1]*quantity,priceBasis:'計画用の目安（実売価格ではありません）'};});
}
export function readiness(state,data){const p=plan(state,data),d=desired(state,data);const ready=id=>p.some(g=>g.id===id&&['owned','buy','rent'].includes(g.status));const every=ids=>ids.every(ready);
 const rules={shelter:['tent'],sleep:['sleeping_bag','mat'],sleep_comfort:['sleeping_bag','mat'],night:['led_lantern'],walk_night:['headlight'],sit:['chair'],dining:['table'],cook:['burner','fuel'],coffee:['burner','fuel','kettle'],cold_food:['cooler'],bbq:['fire_pit','grill_net','tongs','cooler','fuel','fire_tongs','heat_gloves','extinguish_water','fire_sheet','firestarter'],bonfire:['fire_pit','fire_tongs','heat_gloves','fuel','firestarter','extinguish_water','fire_sheet'],hot_sandwich:['burner','fuel','hot_sandwich_maker'],rice:['burner','fuel','mess_tin'],marshmallow:['fire_pit','fuel','fire_tongs','heat_gloves','fire_sheet','extinguish_water','firestarter','long_skewer'],bonfire_food:['fire_pit','fuel','fire_tongs','heat_gloves','fire_sheet','extinguish_water','firestarter','foil'],stargazing:['led_lantern','headlight'],child_play:[]};
 const unlocked=[...d].filter(id=>rules[id]&&every(rules[id]));
 const blocked=[...d].filter(id=>!unlocked.includes(id));
 const missingCore=p.filter(g=>g.core&&!ready(g.id));
 return {unlocked,blocked,missingCore,canComplete:missingCore.length===0&&p.every(g=>g.status!=='undecided')};
}
export function costs(state,data){const p=plan(state,data);const buy=p.filter(g=>g.status==='buy').reduce((s,g)=>s+g.estimate,0),rent=p.filter(g=>g.status==='rent').reduce((s,g)=>s+g.rentalEstimate,0);const limit=state.answers.budget==='comfort'?null:Number(state.answers.budget);return {buy,rent,total:buy+rent,limit,over:limit!==null&&buy+rent>limit};}
export function adjust(state,data){const s=structuredClone(state);const limit=costs(s,data).limit;if(limit===null)return s;
 const gear=plan(s,data).filter(g=>g.status==='buy'&&g.rental_score>=55).sort((a,b)=>(b.estimate-b.rentalEstimate)-(a.estimate-a.rentalEstimate));
 for(const g of gear){if(!costs(s,data).over)break;s.gear[g.id]='rent';}
 // Safety and desired experiences are never silently removed.
 for(const g of plan(s,data).filter(g=>!g.required&&g.status==='buy').sort((a,b)=>b.estimate-a.estimate)){if(!costs(s,data).over)break;s.gear[g.id]='skip';}
 return s;
}
export function schedule(state,data){const a=state.answers,r=readiness(state,data),p=plan(state,data),recipes=selectedRecipes(state,data);const available=id=>r.unlocked.includes(id);const out=[];
 const push=(time,title,body='',gear=[],image='relax')=>{out.push({time,title,body,gear,image,missing:p.filter(g=>gear.includes(g.id)&&['skip','undecided'].includes(g.status)).map(g=>g.label)});};
 push('11:00','キャンプ場に到着','受付・ルール・水場を確認。チェックイン時刻は施設に合わせて。');
 push('12:00',a.stay==='one_night'?'わたしたちの場所をつくる':'木陰に、今日の居場所を','急がず、荷物を下ろしてひと休み。',a.stay==='one_night'?['tent']:[],'relax');
 push('14:00',has(a,'child_play')?'子どもと、外を探検':'何もしない時間','木漏れ日や風の音を楽しむ。予定を入れない余白です。',[],has(a,'child_play')?'child_play':'relax');
 const usable=recipe=>[...recipe.required_gear,...recipe.optional_gear].every(id=>!p.some(g=>g.id===id&&['skip','undecided'].includes(g.status)));const dinner=recipes.find(x=>x.meal==='dinner');
 if(available('bbq')&&(!dinner||dinner.id==='bbq'))push(a.stay==='daytrip'?'13:00':'17:00','BBQを楽しむ','生肉は保冷し、中心まで十分に加熱。調理用と食事用のトングを分ける。',['fire_pit','cooler','grill_net'],'bbq');
 else if(dinner&&dinner.id!=='no_cook'&&usable(dinner))push(a.stay==='daytrip'?'13:00':'17:00',dinner.name+'をつくる','材料：'+dinner.ingredients.join('・'),[...dinner.required_gear,...dinner.optional_gear],'cooking');
 else push(a.stay==='daytrip'?'13:00':'17:00','気楽なごはんの時間','買ってきた食事で、料理をがんばらないキャンプ。');
 if(a.stay==='daytrip'){push('16:00','片付けて、明るいうちに帰る','ゴミの持ち帰りと忘れ物の確認。夕方以降の体験は次のお楽しみに。',['garbage_bags']);return out.sort((a,b)=>a.time.localeCompare(b.time));}
 if(available('bonfire'))push('19:00','焚き火を囲む','直火の可否と消火時刻を確認。火はテントから離し、最後は完全に消火。',['fire_pit','fire_tongs','heat_gloves','extinguish_water','fire_sheet'],'bonfire');
 if(available('stargazing'))push('20:00','星空を見上げる','晴れていれば、少しだけ空の散歩。曇りなら静かな夜を楽しむ。',['headlight'],'stargazing');
 push('21:00','おやすみなさい','静かな時間へ。火気はテント内で使わず、燃料器具は屋外に。',['sleeping_bag','mat','led_lantern','headlight'],'sleep_comfort');
 if(available('coffee'))push('翌 07:00','朝コーヒーを味わう','お湯と一杯のコーヒーで、ゆっくり始まる朝。',['burner','fuel','kettle'],'coffee');
 const breakfast=recipes.find(x=>x.meal==='breakfast'&&usable(x));push('翌 08:00',breakfast?breakfast.name+'の朝ごはん':'簡単な朝ごはん',breakfast?'材料：'+breakfast.ingredients.join('・'):'パンなど、調理のいらない朝食も。',breakfast?[...breakfast.required_gear,...breakfast.optional_gear]:[],'coffee');
 push('翌 10:00','また来たい、を持ち帰る','撤収・分別・忘れ物を確認。チェックアウト時刻は施設に合わせて。',['garbage_bags']);return out.sort((a,b)=>a.time.localeCompare(b.time));}
export function validateStored(raw,data){if(!raw||raw.version!==1||!raw.answers||!raw.gear)return null;const a=raw.answers;for(const q of data.questions.questions.filter(q=>q.type==='single'))if(!q.options.some(o=>o.id===a[q.id]))return null;if(!Number.isInteger(a.adults)||a.adults<1||a.adults>6||!Number.isInteger(a.children)||a.children<0||a.children>4||!Array.isArray(a.experiences)||!a.experiences.length)return null;const valid=data.questions.questions[5].options.map(o=>o.id);if(a.experiences.some(x=>!valid.includes(x)))return null;const ids=new Set([...data.equipment.categories,...data.equipment.supporting_items,...EXTRA].map(x=>x.id));raw.gear=Object.fromEntries(Object.entries(raw.gear).filter(([k,v])=>ids.has(k)&&STATUS.includes(v)));raw.recipes=(raw.recipes||[]).filter(x=>data.recipes.recipes.some(r=>r.id===x));return raw;}
