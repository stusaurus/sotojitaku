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
  kettle: ["ケトル", "お湯を沸かす道具", 55, 68, 5],
  chair: ["チェア", "くつろぐ場所", 19, 85, 14]
};
// Alternate mirror/tilt poses keep the reused chair artwork varied without changing the camera.
const seats = [[20,84,13,"original"],[85,78,12,"mirrored"],[10,76,10,"angled"],[91,90,15,"mirrored-near"]];
// The transparent WebPs are tightly cropped. Reserving their real aspect ratios
// keeps both the photographic prop and its cast shadow anchored before decode.
const dimensions = {tent:[435,282],chair:[270,321],table:[364,234],kettle:[315,420],fire_pit:[274,240],led_lantern:[195,420]};
const siteChoices = ["coffee","bonfire"];
const statuses = {owned:"手持ち",rent:"レンタル予定・予約要確認",buy:"購入予定・未購入",skip:"今回は見送り",undecided:"用意の仕方は未定"};
const asset = name => './world/'+name+'.webp';
const escapeSceneText = value => String(value??"").replace(/[&<>"\']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

export function projectWorld(answers,step,gear,partyChosen=false){
  const items=[];
  function add(id,x,y,width,chairPose="original"){
    const row=gear.find(item=>item.id===id);
    if(!row)return;
    const [name,role,px,py,size]=props[id];
    items.push({id,name,role,x:x??px,y:y??py,width:width??size,chairPose,quantity:row.quantity,detail:row.detail||"",deferred:row.status==="skip"||row.status==="undecided",statusKey:Object.hasOwn(statuses,row.status)?row.status:"undecided",status:statuses[row.status]||statuses.undecided});
  }
  if(step>=3 && answers.stay==="one_night"){add("tent");add("led_lantern");}
  if(step>0||partyChosen){
    const count=gear.find(row=>row.id==="chair")?.quantity||0;
    for(const seat of seats.slice(0,count))add("chair",...seat);
  }
  if(step>=5){add("fire_pit");add("table");add("kettle");}
  return items.sort((a,b)=>(a.id==="kettle"?84:a.y)-(b.id==="kettle"?84:b.y));
}

export function renderCampStudioScene({answers={},step=0,previewTime=null,gear=[],unlocked=[],cost=null,partyChosen=false,review=false}={}){
  const view=resolveCampStudio(answers,step,previewTime);
  const items=projectWorld(answers,step,gear,partyChosen);
  const unique=[...new Map(items.map(item=>[item.id,item])).values()];
  // A proposed object does not certify safety or acquisition; deferred objects cannot cast light.
  const fireGlow=items.some(item=>item.id==="fire_pit"&&!item.deferred)&&
    ["bonfire","bbq","bonfire_food","marshmallow"].some(id=>unlocked.includes(id));
  const lanternGlow=items.some(item=>item.id==="led_lantern"&&!item.deferred);
  // Coffee steam is an aspirational scene detail, never a heat/safety claim.
  // Keep the layer mounted when toggling time so previews need no re-render.
  const coffeeSteam=unlocked.includes("coffee")&&Array.isArray(answers.experiences)&&answers.experiences.includes("coffee")&&
    items.some(item=>item.id==="kettle"&&!item.deferred);
  const controls=SCENE_TIMES.map(({id,label})=>
    `<button type="button" class="studio-time-option" data-scene-preview="${id}" aria-pressed="${id===view.time}"${id==="night"&&view.nightDisabled?" disabled":""}>${label}</button>`).join("");
  // The fire photograph contains a real flame. Keep the planning row, but never
  // put that photograph on the ground when the engine blocks the activity.
  const placed=items.filter(item=>!item.deferred&&(item.id!=="fire_pit"||fireGlow));
  const objects=placed.map(({id,name,x,y,width,chairPose,statusKey})=>{
    const [w,h]=dimensions[id];
    return `<button class="world-object" data-deferred="false" data-plan-status="${statusKey}"${id==="chair"?` data-chair-pose="${chairPose}"`:""} type="button" data-inspect="${id}" aria-label="${name}の準備を確認" style="--x:${x}%;--y:${y}%;--w:${width}%;--visual-width:${width}cqw;--art:url('${asset(id)}');--ratio:${w}/${h}"><img alt="" src="${asset(id)}" width="${w}" height="${h}"></button>`;
  }).join("");
  const editing=step===5&&!review;
  const markers=editing?`<div class="world-sites" role="group" aria-label="湖畔で体験を選ぶ">${siteChoices.map(id=>
    `<button type="button" class="world-site" data-place-experience="${id}" aria-pressed="${answers.experiences?.includes(id)===true}"><span class="world-site-label"><i aria-hidden="true"></i>${EXPERIENCES[id]}</span></button>`
  ).join("")}</div>`:"";
  const season=step>=2 && Object.hasOwn(SEASONS,answers.season)?answers.season:"spring";
  const packing=step>=4 ? (answers.transport==="no_car"?"pack":"trunk") : null;
  const budget=step===6&&cost ? `道具の概算 ¥${cost.total.toLocaleString("ja-JP")} ／ ${cost.limit===null?"上限設定なし":"予算 ¥"+cost.limit.toLocaleString("ja-JP")}` : "";
  return `<section class="studio-scene" data-studio-time="${view.time}" data-studio-variant="${view.variant}" aria-label="キャンプ風景のプレビュー">
    <div class="world-frame" data-season="${season}" data-fire-glow="${fireGlow}" data-lantern-glow="${lanternGlow}" data-table-placed="${placed.some(item=>item.id==="table")}">
      <img class="studio-image" src="${asset("lake")}" alt="森と山に囲まれた湖畔のキャンプサイト" decoding="async">
      <div class="world-tint"></div><div class="world-atmosphere" aria-hidden="true"></div><div class="world-light-spill world-fire-spill" aria-hidden="true"></div><div class="world-light-spill world-lantern-spill" aria-hidden="true"></div>${coffeeSteam?'<div class="world-coffee-steam" aria-hidden="true"></div>':""}${step>=5&&answers.stay==="one_night"&&answers.experiences?.includes("stargazing")?'<div class="world-stars" aria-hidden="true"></div>':''}
      ${packing?`<img class="world-pack" src="${asset(packing)}" alt="${packing==="pack"?"背負って運ぶ荷物":"車に積む収納箱"}">`:""}
      ${objects}${markers}
      <div class="world-caption"><span>湖畔のサイト</span><small class="studio-chip-row">${!step&&!partyChosen?"同行者を選ぶと、設営が始まります":view.chips.join("　·　")}</small></div>
    </div>
    <div class="world-tools"><div class="world-light-picker"><span class="world-light-label">光のプレビュー</span><div role="group" class="world-times" aria-label="時間帯">${controls}</div></div>
    ${unique.length?'<button type="button" class="world-list" data-inspect="all">道具一覧</button>':''}</div>
    <div class="world-note">${budget&&cost.limit?`<meter min="0" max="${cost.limit}" value="${Math.min(cost.limit,cost.total)}" aria-label="予算に占める概算額"></meter>`:""}${budget||"配置は希望のイメージです。"} <span>${editing?"湖畔の印で体験を追加・解除できます。 ":unique.length?"風景の道具をタップして準備を確認できます。 ":""}${placed.length<items.length?"準備待ち・見送りの道具は一覧で確認できます。 ":""}時間帯の切替は診断・安全判定を変更しません。</span></div>
    <dialog class="world-dialog" aria-label="サイトの道具"><form method="dialog"><button aria-label="閉じる" autofocus>閉じる ×</button></form>
      <h2 class="world-dialog-title">サイトの道具</h2><p class="world-dialog-intro">必要な数と、現在の準備方法</p>
      <ul>${unique.map(item=>`<li data-world-row="${item.id}" data-world-status="${item.statusKey}"><span class="world-detail-thumb"><img src="${asset(item.id)}" alt="" loading="lazy"></span><span class="world-detail-content"><strong class="world-detail-name">${item.name} ×${item.quantity}</strong><small class="world-detail-role">${item.role}</small><span class="world-status-pill" data-status="${item.statusKey}">${item.status}</span><small class="world-detail-remark">${escapeSceneText(item.detail)}</small></span></li>`).join("")}</ul>
      <p class="world-dialog-safety">配置は計画のイメージです。未購入・レンタル未予約の道具は確保済みではありません。現地の安全は別途確認してください。</p>${review?'<button class="secondary" data-go="gear">装備計画を見直す →</button>':''}</dialog>
  </section>`;
}

let observedScene=null;
let sceneObserver=null;

export function observeCampScene(root){
  const scene=root.querySelector(".studio-scene");
  if(scene===observedScene)return;
  sceneObserver?.disconnect();
  observedScene=scene;
  if(!scene)return;
  const lowPower=navigator.connection?.saveData||navigator.hardwareConcurrency<=2||navigator.deviceMemory<=2;
  scene.dataset.motionQuality=lowPower?"still":"normal";
  if(!("IntersectionObserver" in window)){
    scene.dataset.inView="true";
    return;
  }
  sceneObserver??=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.target===observedScene)entry.target.dataset.inView=String(entry.isIntersecting);
  });
  sceneObserver.observe(scene);
}

function canAnimate(scene){
  return scene.dataset.inView==="true"&&scene.dataset.motionQuality==="normal"&&
    !document.hidden&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&typeof Element.prototype.animate==="function";
}

function enterSite(prop){
  // Animate the photograph only. The accessible hit rectangle never moves.
  const image=prop.querySelector("img");
  const tent=prop.dataset.inspect==="tent";
  image.animate([
    {opacity:0,scale:tent?".72 .22":".94 .94",translate:tent?"0 0":"0 -5px"},
    {opacity:1,scale:"1 1",translate:"0 0"}
  ],{duration:tent?520:320,easing:"cubic-bezier(.18,.72,.22,1)"});
}

// Move just the photographic content into an inert span. Used by both the
// thumbnail and withdrawal animation, so neither can duplicate a control.
function sceneryCopy(button){
  const visual=document.createElement("span");
  visual.className="world-object";
  visual.style.cssText=button.style.cssText;
  visual.dataset.miniRole=button.dataset.inspect;
  if(button.dataset.chairPose)visual.dataset.chairPose=button.dataset.chairPose;
  visual.setAttribute("aria-hidden","true");
  visual.append(button.querySelector("img").cloneNode(true));
  return visual;
}

function leaveSite(prop,frame,key){
  const visual=sceneryCopy(prop);
  visual.dataset.departing=key;
  frame.append(visual);
  const animation=visual.animate([{opacity:1},{opacity:0,translate:"0 3px"}],{duration:200,easing:"ease-in"});
  animation.onfinish=animation.oncancel=()=>visual.remove();
}

// Keep the camera, unchanged gear and the focused placement control mounted.
export function updateQuestionScene(container,html){
  const template=document.createElement("template");
  template.innerHTML=html;
  const current=container.querySelector(".studio-scene");
  const next=template.content.querySelector(".studio-scene");
  const frame=current.querySelector(".world-frame");
  const replacement=next.querySelector(".world-frame");
  const focused=document.activeElement;
  current.dataset.studioTime=next.dataset.studioTime;
  current.dataset.studioVariant=next.dataset.studioVariant;
  frame.dataset.season=replacement.dataset.season;
  frame.dataset.fireGlow=replacement.dataset.fireGlow;
  frame.dataset.lanternGlow=replacement.dataset.lanternGlow;
  frame.dataset.tablePlaced=replacement.dataset.tablePlaced;
  const animate=canAnimate(current);
  const key=node=>node.dataset.inspect ? node.dataset.inspect+node.style.getPropertyValue("--x") : node.className;
  const departures=new Map([...frame.querySelectorAll("[data-departing]")].map(node=>[node.dataset.departing,node]));
  const previous=new Map([...frame.children].filter(node=>!node.hasAttribute("data-departing")).map(node=>[key(node),node]));
  let cursor=frame.firstElementChild;
  for(const candidate of [...replacement.children]){
    const id=key(candidate),old=previous.get(id);
    departures.get(id)?.remove();
    let node=old?.isEqualNode(candidate)?old:candidate;
    if(old&&candidate.classList.contains("world-sites")){
      for(const marker of candidate.children){
        old.querySelector('[data-place-experience="'+marker.dataset.placeExperience+'"]').setAttribute("aria-pressed",marker.getAttribute("aria-pressed"));
      }
      node=old;
    }
    if(node!==cursor)frame.insertBefore(node,cursor);
    if(old && old!==node)old.remove();
    previous.delete(id);
    cursor=node.nextElementSibling;
    if(!old&&animate&&node.classList.contains("world-object"))enterSite(node);
  }
  for(const [id,removed] of previous){
    if(animate&&removed.classList.contains("world-object"))leaveSite(removed,frame,id);
    removed.remove();
  }
  current.querySelector(".world-tools").replaceWith(next.querySelector(".world-tools"));
  current.querySelector(".world-note").replaceWith(next.querySelector(".world-note"));
  current.querySelector("dialog").replaceWith(next.querySelector("dialog"));
  if(focused?.hasAttribute("data-place-experience")&&focused.isConnected&&document.activeElement!==focused)
    focused.focus({preventScroll:true});
  const attr=["data-answer","data-experience","data-step"].find(name=>focused?.hasAttribute(name));
  const advanced=focused?.hasAttribute("data-next")||focused?.hasAttribute("data-back-question");
  const sheet=template.content.querySelector(".question-sheet");
  // Reparent the SAME polite live region during in-place multi-select updates.
  // Recreating an aria-live node on every tap can prevent screen readers from
  // announcing the newly chosen experience, even when visual focus survives.
  const oldStatus=container.querySelector(".studio-mobile-feedback-count");
  const nextStatus=sheet.querySelector(".studio-mobile-feedback-count");
  if(oldStatus&&nextStatus)nextStatus.replaceWith(oldStatus);
  container.querySelector(".question-sheet").replaceWith(sheet);
  if(attr){
    const match=[...sheet.querySelectorAll("["+attr+"]")].find(b=>b.getAttribute(attr)===focused.getAttribute(attr)&&b.dataset.delta===focused.dataset.delta);
    const target=match?.disabled ? [...sheet.querySelectorAll("[data-step]")].find(b=>b.dataset.step===match.dataset.step&&!b.disabled) : match;
    target?.focus({preventScroll:true});
  }else if(advanced){
    // A removed "next/back" button must not strand keyboard/screen-reader focus on <body>.
    const heading=sheet.querySelector(".question-title");
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  }
}

/**
 * An inert, cached-image copy of the live scene. It is only presented beside the
 * long multi-select question on narrow screens; the actual world remains the sole
 * interactive scene. No duplicate object buttons, storage writes or events.
 */
export function syncMobileWorldFeedback(root,change=null){
  const preview=root.querySelector(".studio-mobile-feedback-preview");
  const scene=root.querySelector(".sim-visual .studio-scene");
  if(!preview||!scene)return;
  const clone=scene.querySelector(".world-frame").cloneNode(true);
  clone.querySelector(".world-sites")?.remove();
  for(const exiting of clone.querySelectorAll("[data-departing]"))exiting.remove();
  for(const button of clone.querySelectorAll(".world-object"))button.replaceWith(sceneryCopy(button));
  for(const img of clone.querySelectorAll("img"))img.alt="";
  clone.setAttribute("aria-hidden","true");
  preview.dataset.studioTime=scene.dataset.studioTime;
  preview.dataset.studioVariant=scene.dataset.studioVariant;
  preview.replaceChildren(clone);
  if(change){
    const status=root.querySelector(".studio-mobile-feedback-count");
    if(status){
      // textContent avoids interpreting localized option labels as markup.
      status.textContent=change.label+(change.selected?"を追加":"を解除")+
        "（計"+change.count+"件）";
      status.closest(".studio-mobile-feedback")?.setAttribute(
        "data-choice-feedback",change.selected?"add":"remove");
    }
  }
}
