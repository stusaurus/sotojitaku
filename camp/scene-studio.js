/**
 * CAMP Scene Studio — visual projection only.
 * The authoritative seven-question answers and gear/safety engines remain in app.js/engine.js.
 * Preview controls change the artwork, never the saved plan or readiness.
 */
const PHOTOS = Object.freeze({
  morning: {desktop:"scene-morning-desktop.webp",mobile:"morning-portrait.webp",label:"朝の光"},
  evening: {desktop:"scene-afternoon-hd.webp",mobile:"evening-portrait.webp",label:"夕方の光"},
  night: {desktop:"scene-evening-hd.webp",mobile:"evening-portrait.webp",label:"静かな夜"},
  bonfire: {desktop:"scene-bonfire-hd.webp",mobile:"evening-bonfire-portrait.webp",label:"焚き火の夜"}
});
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
  const photo=PHOTOS[variant];
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
  return {index,time,variant,photo,title:TITLES[index],chips:safeChips,caption,nightDisabled:stay==="daytrip"};
}

export function renderCampStudioScene({answers={},step=0,previewTime=null}={}){
  const view=resolveCampStudio(answers,step,previewTime);
  const controls=SCENE_TIMES.map(choice=>{
    const active=view.time===choice.id;
    const disabled=choice.id==="night"&&view.nightDisabled;
    return '<button type="button" class="studio-time-option" data-scene-preview="'+choice.id+'" aria-pressed="'+String(active)+'"'+(disabled?' disabled title="日帰りは明るいうちに撤収します"':'')+'>'+choice.label+'</button>';
  }).join("");
  return '<section class="studio-scene" data-studio-time="'+view.time+'" data-studio-variant="'+view.variant+'" aria-label="キャンプ風景のプレビュー">'
    +'<picture class="studio-photo">'
    +'<source media="(max-width:760px)" srcset="../assets/'+view.photo.mobile+'">'
    +'<img class="studio-image" src="../assets/'+view.photo.desktop+'" alt="'+view.photo.label+'のキャンプ風景イメージ" width="1600" height="1000" fetchpriority="high" decoding="async">'
    +'</picture><div class="studio-wash" aria-hidden="true"></div><div class="studio-glow" aria-hidden="true"></div>'
    +'<div class="studio-topline"><span class="studio-overline">SOTOJITAKU / SCENE STUDIO</span><span class="studio-step">0'+(view.index+1)+' / 07</span></div>'
    +'<div class="studio-body"><span class="studio-kicker">YOUR WEEKEND, TAKING SHAPE</span>'
    +'<h2>'+view.title+'</h2><p class="studio-description">'+view.caption+'</p>'
    +'<div class="studio-chip-row" aria-label="選択中の計画">'+view.chips.map(c=>'<span class="studio-chip">'+c+'</span>').join("")+'</div>'
    +'<div class="studio-preview-bar"><span class="studio-preview-label">風景を眺める</span><div class="studio-time-controls" role="group" aria-label="風景の時間帯を切り替える">'+controls+'</div></div>'
    +'<p class="studio-disclaimer">風景はイメージです。時間帯の切替は診断・安全判定を変更しません。</p>'
    +'</div></section>';
}
