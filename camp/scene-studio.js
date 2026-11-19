/**
 * CAMP Scene Studio — visual projection only.
 * The authoritative seven-question answers and gear/safety engines remain in app.js/engine.js.
 * Preview controls change the artwork, never the saved plan or readiness.
 */
const PEOPLE = {solo:"ひとり",couple:"ふたり",family:"家族",friends:"友人"};
const SEASONS = {spring:"春",summer:"夏",autumn:"秋"};
const TRANSPORT = {car:"車で移動",no_car:"車なし"};
const EXPERIENCES = {relax:"のんびり",bonfire:"焚き火",bbq:"BBQ",stargazing:"星空",coffee:"朝コーヒー",cooking:"外ごはん",child_play:"外遊び",sleep_comfort:"心地よい眠り",easy:"気軽に"};
const TITLES = [
  "休日の景色は、ここから。",
  "一緒に行く人を、思い浮かべて。",
  "季節の空気まで、旅の一部。",
  "泊まるか、日帰りか。",
  "身軽な旅も、立派なキャンプ。",
  "過ごしたい時間を、選ぼう。",
  "あと少しで、あなたのキャンプ。"
];
const SCENE_TIMES = [
  {id:"morning",label:"朝"},
  {id:"evening",label:"夕方"},
  {id:"night",label:"夜"}
];
const label=(table,id,fallback)=>Object.hasOwn(table,id)?table[id]:fallback;
const safeStep=step=>Number.isInteger(step)?Math.max(0,Math.min(6,step)):0;

export function resolveCampStudio(answers={},step=0,previewTime=null){
  const a=answers||{},index=safeStep(step);
  const stay=a.stay==="daytrip"?"daytrip":"one_night";
  const experiences=Array.isArray(a.experiences)?a.experiences.filter(id=>Object.hasOwn(EXPERIENCES,id)):[];
  const natural=index<3?"morning":index>=5&&stay!=="daytrip"&&(experiences.includes("bonfire")||experiences.includes("stargazing"))?"night":"evening";
  const allowed=SCENE_TIMES.some(choice=>choice.id===previewTime)&&!(stay==="daytrip"&&previewTime==="night");
  const time=allowed?previewTime:natural;
  const variant=time==="night"&&stay==="one_night"&&experiences.includes("bonfire")?"bonfire":time;

  const adults=Number.isInteger(a.adults)?a.adults:2;
  const children=Number.isInteger(a.children)?a.children:0;
  const people=Math.max(1,Math.min(20,adults+children));
  const who=label(PEOPLE,a.party_type,"キャンプ")+ "・"+people+"人";
  const season=label(SEASONS,a.season,"季節を選ぶ");
  const duration=stay==="daytrip"?"日帰り":"1泊2日";
  const transport=label(TRANSPORT,a.transport,"移動手段を選ぶ");
  const interest=experiences.slice(0,2).map(id=>EXPERIENCES[id]);
  const chips=index===0?[who]:index===1?[who]:index===2?[who,season]:index===3?[who,season,duration]:index===4?[who,duration,transport]:[who,duration,...interest];
  const safeChips=chips.filter(Boolean).slice(0,4);
  const caption=index>=5&&interest.length?"やってみたいこと："+interest.join("・"):"選んだ内容が、少しずつ景色になっていきます。";
  return {index,time,variant,title:TITLES[index],chips:safeChips,caption,nightDisabled:stay==="daytrip"};
}

// Positions are contact points in a single camera frame (percent from top left).
const props = {
  tent: ["テント", "泊まる場所", 31, 71, 43],
  table: ["テーブル", "食事と調理の台", 54, 83, 19],
  fire_pit: ["焚き火台", "火を囲む場所", 73, 88, 14],
  led_lantern: ["ランタン", "足元の明かり", 40, 89, 5],
  kettle: ["ケトル", "お湯を沸かす道具", 58, 78, 5],
  chair: ["チェア", "くつろぐ場所", 19, 85, 14]
};
const seats = [[20,84,13],[85,78,12],[10,76,10],[91,90,15]];
const statuses = {owned:"手持ち",rent:"レンタル予定・予約要確認",buy:"購入予定・未購入",skip:"今回は見送り",undecided:"用意の仕方は未定"};
const asset = name => './world/'+name+'.webp';

export function projectWorld(answers,step,gear,partyChosen=false){
  const items=[];
  function add(id,x,y,width){
    const row=gear.find(item=>item.id===id);
    if(!row)return;
    const [name,role,px,py,size]=props[id];
    items.push({id,name,role,x:x??px,y:y??py,width:width??size,quantity:row.quantity,status:statuses[row.status]||statuses.undecided});
  }
  if(step>=3 && answers.stay==="one_night"){add("tent");add("led_lantern");}
  if(step>0||partyChosen){
    const count=gear.find(row=>row.id==="chair")?.quantity||0;
    for(const seat of seats.slice(0,count))add("chair",...seat);
  }
  if(step>=5){add("fire_pit");add("table");add("kettle");}
  return items.sort((a,b)=>a.y-b.y);
}

export function renderCampStudioScene({answers={},step=0,previewTime=null,gear=[],cost=null,partyChosen=false,review=false}={}){
  const view=resolveCampStudio(answers,step,previewTime);
  const items=projectWorld(answers,step,gear,partyChosen);
  const unique=[...new Map(items.map(item=>[item.id,item])).values()];
  const controls=SCENE_TIMES.map(({id,label})=>
    `<button type="button" class="studio-time-option" data-scene-preview="${id}" aria-pressed="${id===view.time}"${id==="night"&&view.nightDisabled?" disabled":""}>${label}</button>`).join("");
  const objects=items.map(({id,name,x,y,width})=>
    `<button class="world-object" type="button" data-inspect="${id}" aria-label="${name}の準備を確認" style="--x:${x}%;--y:${y}%;--w:${width}%"><img alt="" src="${asset(id)}"></button>`).join("");
  const season=step>=2 && Object.hasOwn(SEASONS,answers.season)?answers.season:"spring";
  const packing=step>=4 ? (answers.transport==="no_car"?"pack":"trunk") : null;
  const budget=step===6&&cost ? `道具の概算 ¥${cost.total.toLocaleString("ja-JP")} ／ ${cost.limit===null?"上限設定なし":"予算 ¥"+cost.limit.toLocaleString("ja-JP")}` : "";
  return `<section class="studio-scene" data-studio-time="${view.time}" data-studio-variant="${view.variant}" aria-label="キャンプ風景のプレビュー">
    <div class="world-frame" data-season="${season}">
      <img class="studio-image" src="${asset("lake")}" alt="森と山に囲まれた湖畔のキャンプサイト" decoding="async">
      <div class="world-tint"></div>
      ${packing?`<img class="world-pack" src="${asset(packing)}" alt="${packing==="pack"?"背負って運ぶ荷物":"車に積む収納箱"}">`:""}
      ${objects}
      <div class="world-caption"><span>湖畔のサイト</span><small class="studio-chip-row">${view.chips.join("　·　")}</small></div>
    </div>
    <div class="world-tools"><div role="group" class="world-times" aria-label="時間帯">${controls}</div>
    ${unique.length?'<button type="button" class="world-list" data-inspect="all">道具一覧</button>':''}</div>
    <div class="world-note">${budget||"配置は希望のイメージです。"} <span>時間帯の切替は診断・安全判定を変更しません。</span></div>
    <dialog class="world-dialog" aria-label="サイトの道具"><form method="dialog"><button aria-label="閉じる" autofocus>閉じる ×</button></form>
      <h2>サイトの道具</h2><ul>${unique.map(item=>`<li data-world-row="${item.id}"><strong>${item.name} ×${item.quantity}</strong><span>${item.role} ／ ${item.status}</span></li>`).join("")}</ul>
      <p>配置は計画のイメージです。確保状況や現地の安全は別途確認してください。</p>${review?'<button class="secondary" data-go="gear">装備計画を見直す →</button>':''}</dialog>
  </section>`;
}
