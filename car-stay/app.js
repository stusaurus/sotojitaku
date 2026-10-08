import {evaluate,resultHeadline,DEFAULT_RULES} from "./engine.js";
import {recommendations} from "./products.js";

const DATA_BASE="./data/";
const VERSION=1;
const STORAGE_KEY="sotojitaku_car_stay_v1";
const qs=new URLSearchParams(location.search);
const operatorTest=qs.get("test")==="1";
const presetVehicle=qs.get("vehicle");
const presetSeatCount=qs.get("seatCount");
const presetTrim=qs.get("trim");
const presetParty=Number(qs.get("party"));
const entrySource=(qs.get("from")||"direct").slice(0,30);
const entryKey=(qs.get("entry")||"").slice(0,40);
let analyticsEnabled=localStorage.getItem("sotojitaku_analytics_optout")!=="1";
const viewedProducts=new Set();
const viewedGaps=new Set();
const viewedFreeSolutions=new Set();
const completedNoProduct=new Set();
const viewedFunnelSteps=new Set();
const completedFunnelSteps=new Set();
const FUNNEL_STEP_KEYS=["vehicle","party","trip","environment","gear"];
const $=s=>document.querySelector(s);
const panel=$("#panel"),builder=$("#builder"),hero=$("#hero"),cabin=$("#cabin"),cabinMessage=$("#cabinMessage"),progressBar=$("#progressBar"),stepLabel=$("#stepLabel"),vehicleMini=$("#vehicleMini"),buildChips=$("#buildChips"),resetTop=$("#resetTop");

let db={vehicles:[],gear:[],products:[],rules:DEFAULT_RULES};
let state={
  version:VERSION,step:0,vehicleId:null,config:{},people:[{type:"adult",height:171},{type:"adult",height:160}],
  tripStyle:null,date:"",region:"",placeType:null,weather:{status:"unknown",minC:null,maxC:null},
  ownedGear:[],devices:[],powerUse:{blanketW:null,hours:null,ownedWh:null,ownedOutputW:null},floorObservation:"unknown",measurements:{lengthMm:null,widthMm:null},sleepEngineOn:false,openFlameInside:false
};

function track(name,params={}){
  if(!analyticsEnabled||typeof window.gtag!=="function")return;
  const common={site_id:"sotojitaku_car_stay",service_id:"car_stay",operator_test:operatorTest?1:0,entry_source:entrySource,entry_key:entryKey,page_path:location.pathname,transport_type:"beacon",...params};
  if(name==="affiliate_click"&&!common.affiliate)common.affiliate="rakuten";
  window.gtag("event",name,common);
  const alias={carstay_start:"journey_start",builder_completed:"journey_complete"}[name];
  if(alias)window.gtag("event",alias,common);
}
function funnelStepParams(step){
  return {
    funnel_name:"car_stay_builder",
    step_number:step+1,
    step_key:FUNNEL_STEP_KEYS[step]||"unknown",
    vehicle_id:state.vehicleId||"",
    party_count:state.people.length,
    trip_style:state.tripStyle||"",
    place_type:state.placeType||"",
    seat_count:state.config.seatCount||0,
    trim:state.config.trim||""
  };
}
function trackStepView(step=state.step){
  if(step<0||step>=FUNNEL_STEP_KEYS.length||viewedFunnelSteps.has(step))return;
  viewedFunnelSteps.add(step);
  track("carstay_step_view",funnelStepParams(step));
}
function trackStepComplete(step=state.step){
  if(step<0||step>=FUNNEL_STEP_KEYS.length||completedFunnelSteps.has(step))return;
  completedFunnelSteps.add(step);
  track("carstay_step_complete",funnelStepParams(step));
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
function loadSaved(){try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY));if(x&&x.version===VERSION)state={...state,...x,powerUse:{...state.powerUse,...(x.powerUse||{})}};}catch{}}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function selectedGear(){
  return db.gear.filter(g=>state.ownedGear.includes(g.gearId));
}
function currentVehicle(){return db.vehicles.find(v=>v.vehicleId===state.vehicleId);}
function validVehicleConfigs(v){return v?.config?.validConfigs?.length?v.config.validConfigs:null;}
function configValueMatches(key,current,expected){
  return key==="seatCount"?Number(current)===Number(expected):current===expected;
}
function vehicleConfigComplete(){
  const v=currentVehicle();
  if(!v)return false;
  const valid=validVehicleConfigs(v);
  if(valid){
    return valid.some(vc=>Object.entries(vc).every(([key,value])=>configValueMatches(key,state.config[key],value)));
  }
  if(v.config?.seatCounts?.length&&!v.config.seatCounts.includes(Number(state.config.seatCount)))return false;
  if(v.config?.trims?.length&&!v.config.trims.includes(state.config.trim))return false;
  return true;
}
function configOptions(v,key){
  const valid=validVehicleConfigs(v);
  if(!valid)return v?.config?.[key==="seatCount"?"seatCounts":"trims"]||[];
  const otherKey=key==="seatCount"?"trim":"seatCount";
  const otherValue=state.config[otherKey];
  const rows=otherValue===undefined||otherValue===null||otherValue===""?valid:valid.filter(vc=>configValueMatches(otherKey,otherValue,vc[otherKey]));
  return [...new Set(rows.map(vc=>vc[key]).filter(value=>value!==undefined&&value!==null))];
}
function sanitizeVehicleConfig(v,changedKey){
  const valid=validVehicleConfigs(v);
  if(!valid)return;
  const hasSeat=state.config.seatCount!==undefined&&state.config.seatCount!==null&&state.config.seatCount!=="";
  const hasTrim=state.config.trim!==undefined&&state.config.trim!==null&&state.config.trim!=="";
  if(hasSeat&&hasTrim&&!valid.some(vc=>configValueMatches("seatCount",state.config.seatCount,vc.seatCount)&&configValueMatches("trim",state.config.trim,vc.trim))){
    if(changedKey==="seatCount")delete state.config.trim;
    else if(changedKey==="trim")delete state.config.seatCount;
    else state.config={};
  }
}
function rules(){return {...DEFAULT_RULES,...db.rules};}
function inputForEngine(){
  return {people:state.people,tripStyle:state.tripStyle,placeType:state.placeType,weather:state.weather,gear:selectedGear(),devices:state.devices,powerUse:state.powerUse,floorObservation:state.floorObservation,measurements:state.measurements,config:state.config,sleepEngineOn:state.sleepEngineOn,openFlameInside:state.openFlameInside};
}
async function loadData(){
  const names=["vehicles.json","gear.json","rules.json","audited-products.json"];
  const rs=await Promise.all(names.map(n=>fetch(DATA_BASE+n,{cache:"no-store"})));
  if(rs.some(r=>!r.ok))throw new Error("data_load");
  const [vehicles,gear,rulesData,products]=await Promise.all(rs.map(r=>r.json()));
  db={vehicles:vehicles.vehicles||[],gear:gear.gear||[],rules:rulesData||DEFAULT_RULES,products:products.products||[]};
}
function showBuilder(){
  hero.hidden=true;builder.hidden=false;resetTop.hidden=false;window.scrollTo({top:0,behavior:"instant"});render();
}
function start(){
  state.step=0;save();track("carstay_start");showBuilder();
}
function reset(){
  localStorage.removeItem(STORAGE_KEY);location.href="./";
}
function stepPct(){return Math.min(100,((state.step+1)/5)*100);}
function setCabin(){
  const gear=selectedGear(),caps=new Set(gear.flatMap(g=>g.capabilities||[]));
  cabin.className="cabin";
  const chips=[];
  if(caps.has("warmth")||caps.has("padding")){cabin.classList.add("state-bedding");chips.push(["寝具","on"]);}else chips.push(["寝具",""]);
  if(caps.has("padding")){cabin.classList.add("state-mat");chips.push(["寝床","on"]);}else chips.push(["寝床",""]);
  if(caps.has("privacy_full")){cabin.classList.add("state-private");chips.push(["目隠し","on"]);}else chips.push(["目隠し",""]);
  const result=state.step>=5&&currentVehicle()?evaluate(inputForEngine(),currentVehicle(),rules()):null;
  if(result?.status==="READY")cabin.classList.add("state-ready");
  const scene=result?.status==="CHANGE_PLAN"?"arrival":state.step<3?"arrival":state.step===3?"dusk":(caps.has("padding")||result?.status==="READY")?"night":"dusk";
  const image=$("#sceneImage"),mobile=$("#sceneMobile");
  const asset=scene==="arrival"?"car-arrival":scene==="night"?"cabin-night":"cabin-dusk";
  const src="./assets/"+asset+".webp";
  if(image.getAttribute("src")!==src){image.src=src;mobile.srcset="./assets/"+asset+"-mobile.webp";}
  image.alt="同じ湖畔の愛車。一泊の準備を伝える情景イメージ";
  builder.dataset.status=result?.status||"building";
  $("#sceneChapter").textContent=result?.status==="CHANGE_PLAN"?"PLAN AGAIN / 条件の見直しから":result?.status==="READY"?"YOUR TINY CABIN / 一泊の支度ができました":result?"ALMOST THERE / 残る支度を確かめよう":["ARRIVE / 愛車からはじまる一泊","TOGETHER / 今夜の宿泊者","YOUR EVENING / 過ごしたい時間","DUSK / 場所と気温を確かめる","PACK LIGHT / 家にあるものから"][state.step];
  document.querySelectorAll(".step-trail li").forEach((el,i)=>{el.classList.toggle("active",i===state.step);el.classList.toggle("done",i<state.step);if(i===state.step)el.setAttribute("aria-current","step");else el.removeAttribute("aria-current");});
  buildChips.innerHTML=chips.map(c=>"<span class='"+c[1]+"'>"+c[0]+"</span>").join("");
  const v=currentVehicle();
  vehicleMini.textContent=v?v.shortLabel:"愛車を選択";
  if(!v)cabinMessage.textContent="クルマを選ぶと、ここにあなたの一泊が育っていきます。";
  else if(state.step===0)cabinMessage.textContent=v.shortLabel+"で、一泊をつくります。";
  else if(state.step===1)cabinMessage.textContent="誰と眠るかで、必要な寝床の幅が変わります。";
  else if(state.step===2)cabinMessage.textContent="過ごし方を決めると、いらない道具も見えてきます。";
  else if(state.step===3)cabinMessage.textContent="安全な場所と気温を、道具より先に確認します。";
  else if(state.step===4)cabinMessage.textContent="家にあるものを積むほど、買うものは減っていきます。";
  else cabinMessage.textContent=result.status==="CHANGE_PLAN"?"道具を買う前に、泊まる条件を見直しましょう。":result.status==="READY"?"いつもの愛車が、あなたの小さな宿になりました。":result.status==="CHALLENGE"?"確認を済ませてから、一泊の支度を進めましょう。":"小さな宿まで、あと必要なところだけ。";
}
function wrap(title,desc,body,kicker){
  return "<p class='step-kicker'>"+esc(kicker||("STEP "+(state.step+1)))+"</p><h2>"+title+"</h2><p class='desc'>"+desc+"</p>"+body;
}
function nextButton(label="次へ"){
  return "<div class='actions'><button class='primary' data-next type='button'>"+esc(label)+" <span>→</span></button></div>";
}
function backButton(){
  return state.step>0?"<button class='secondary' data-back type='button'>← 戻る</button>":"";
}
function renderVehicle(){
  const cards=db.vehicles.map(v=>"<button class='choice "+(state.vehicleId===v.vehicleId?"selected":"")+"' data-vehicle='"+esc(v.vehicleId)+"' type='button'><b>"+esc(v.shortLabel)+"</b><small>"+esc(v.generation)+"</small></button>").join("");
  let config="";
  const v=currentVehicle();
  const seats=configOptions(v,"seatCount");
  const trims=configOptions(v,"trim");
  if(seats.length)config+="<div class='field'><label>乗車定員</label><select data-config='seatCount'><option value=''>選択</option>"+seats.map(x=>"<option value='"+x+"' "+(Number(state.config.seatCount)===Number(x)?"selected":"")+">"+x+"人乗り</option>").join("")+"</select></div>";
  if(trims.length)config+="<div class='field'><label>グレード / 仕様</label><select data-config='trim'><option value=''>選択</option>"+trims.map(x=>"<option value='"+esc(x)+"' "+(state.config.trim===x?"selected":"")+">"+esc(x)+"</option>").join("")+"</select></div>";
  const configNote=v&&validVehicleConfigs(v)?"実在する乗車定員とグレードの組み合わせだけを表示しています。":"登録がない車種でも、寝床の長さと幅を測れば判定できる設計です。";
  panel.innerHTML=wrap("どのクルマで泊まる？","まずは愛車を選びます。未確認寸法は推測せず、必要ならあとで2か所だけ測ります。","<div class='grid'>"+cards+"</div>"+(config?"<div class='form-row' style='margin-top:18px'>"+config+"</div>":"")+"<div class='note'>"+(v&&!vehicleConfigComplete()&&config?"適合商品を正確に出すため、乗車定員・グレードなどを選んでください。 "+configNote:configNote)+"</div><div class='actions'>"+backButton()+"<button class='primary' data-next type='button' "+(!state.vehicleId||!vehicleConfigComplete()?"disabled":"")+">誰と泊まる？ <span>→</span></button></div>","STEP 1 · 愛車");
}
function renderPeople(){
  const count=state.people.length;
  const people=state.people.map((p,i)=>"<div class='field'><label>"+(i===0?"あなた":(i+1)+"人目")+"</label><div class='form-row'><select data-person-type='"+i+"'><option value='adult' "+(p.type==="adult"?"selected":"")+">大人</option><option value='child' "+(p.type==="child"?"selected":"")+">子ども</option></select><input data-height='"+i+"' type='number' inputmode='numeric' min='60' max='210' value='"+esc(p.height)+"' aria-label='身長'></div></div>").join("");
  panel.innerHTML=wrap("今夜は、誰と泊まる？","人数と身長から、寝床の長さ・幅を判定します。","<div class='grid'><button class='choice "+(count===1?"selected":"")+"' data-count='1'><span class='emoji'>👤</span><b>ひとり</b><small>気軽なソロ泊</small></button><button class='choice "+(count===2?"selected":"")+"' data-count='2'><span class='emoji'>👫</span><b>ふたり</b><small>幅の確認が重要</small></button><button class='choice "+(count>=3?"selected":"")+"' data-count='3'><span class='emoji'>👨‍👩‍👧</span><b>3人</b><small>家族の初泊</small></button></div><div style='margin-top:20px'>"+people+"</div><div class='actions'>"+backButton()+"<button class='primary' data-next>どんな夜？ <span>→</span></button></div>","STEP 2 · 人");
}
function renderTrip(){
  const options=[
    ["sleep_only","🌙","寝るだけ","移動や旅行の途中。眠れればOK。"],
    ["onsen","♨️","温泉のあと一泊","夕食も外で済ませ、車ではゆっくり。"],
    ["stars","⭐","星を見る夜","外で景色を楽しむ時間も。"],
    ["morning","☕","朝を楽しむ","朝景色やコーヒーまで楽しみたい。"],
    ["outdoor","🏕️","アウトドア","車外でもゆっくり過ごす。"]
  ];
  const cards=options.map(o=>"<button class='choice "+(state.tripStyle===o[0]?"selected":"")+"' data-trip='"+o[0]+"'><span class='emoji'>"+o[1]+"</span><b>"+o[2]+"</b><small>"+o[3]+"</small></button>").join("");
  panel.innerHTML=wrap("どんな一泊にしたい？","商品ではなく、過ごし方から支度を減らします。","<div class='grid'>"+cards+"</div><div class='note'>たとえば温泉旅なら、車内調理器具や大きなテーブルは最初から候補から外します。</div><div class='actions'>"+backButton()+"<button class='primary' data-next "+(!state.tripStyle?"disabled":"")+">いつ・どこ？ <span>→</span></button></div>","STEP 3 · 夜");
}
function renderEnvironment(){
  const placeOptions=[["rv_park","RVパーク"],["auto_camp","オートキャンプ場"],["authorized_private","許可済み私有地"],["road_station","道の駅（休憩・仮眠）"],["sa_pa","SA・PA（休憩・仮眠）"],["unknown","まだ未定"]];
  const place=placeOptions.map(x=>"<option value='"+x[0]+"' "+(state.placeType===x[0]?"selected":"")+">"+x[1]+"</option>").join("");
  panel.innerHTML=wrap("いつ、どこで泊まる？","場所のルールと夜の気温を安全判定の最上位に置きます。","<div class='form-row'><div class='field'><label>日付</label><input data-env='date' type='date' value='"+esc(state.date)+"'></div><div class='field'><label>地域</label><input data-env='region' placeholder='例：山梨県 富士五湖' value='"+esc(state.region)+"'></div></div><div class='field'><label>場所タイプ</label><select data-env='placeType'><option value=''>選択してください</option>"+place+"</select></div><div class='form-row'><div class='field'><label>予想最低気温 °C（分かれば）</label><input data-env='minC' type='number' inputmode='decimal' value='"+esc(state.weather.minC??"")+"'></div><div class='field'><label>予想最高気温 °C（分かれば）</label><input data-env='maxC' type='number' inputmode='decimal' value='"+esc(state.weather.maxC??"")+"'></div></div><fieldset class='safety-plan'><legend>就寝中の計画を確認</legend><label><input type='checkbox' data-safety='sleepEngineOn' "+(state.sleepEngineOn?"checked":"")+"> エンジンをかけたまま眠る予定</label><label><input type='checkbox' data-safety='openFlameInside' "+(state.openFlameInside?"checked":"")+"> 車内で火器・燃焼器具を使う予定</label><p>どちらかがある場合は、購入候補を出さず計画変更を案内します。</p></fieldset><div class='note warning'>道の駅・SA/PAは宿泊施設としてREADY判定しません。暑さ条件も、扇風機や網戸を買うだけでは解除しません。</div><div class='actions'>"+backButton()+"<button class='primary' data-next "+(!state.placeType?"disabled":"")+">家にあるもの <span>→</span></button></div>","STEP 4 · 安全");
}
function renderGear(){
  const icons={home_duvet:"🛏️",blanket:"🧣",pillow:"☁️",towel:"🧺",camp_mat:"▰",led_light:"💡",mobile_battery:"🔋",privacy_full:"🌙",fan:"🌀",electric_blanket:"♨️",portable_power:"🔌"};
  const cards=db.gear.map(g=>"<button class='gear "+(state.ownedGear.includes(g.gearId)?"selected":"")+"' data-gear='"+g.gearId+"'><span class='icon'>"+(icons[g.gearId]||"•")+"</span><b>"+esc(g.label)+"</b></button>").join("");
  const floorChoices=[["flat","ほぼ平ら","そのまま寝られそう"],["noticeable","段差が気になる","タオルなどで試したい"],["large","大きな段差・すき間","対策が必要そう"],["unknown","まだ試していない","商品はまだ出しません"]];
  const floorCards=floorChoices.map(x=>"<button class='choice "+(state.floorObservation===x[0]?"selected":"")+"' data-floor='"+x[0]+"' type='button'><b>"+x[1]+"</b><small>"+x[2]+"</small></button>").join("");
  const wantsBlanket=state.devices.includes("electric_blanket");
  const ownsPortable=state.ownedGear.includes("portable_power");
  const powerFields=wantsBlanket?"<div class='power-plan'><p class='step-kicker'>電気毛布の電力</p><p class='micro'>製品ラベルの消費電力(W)と、実際に使う時間を入力します。入力がない場合、容量を推測して商品は出しません。</p><div class='form-row'><div class='field'><label>消費電力 W</label><input data-power='blanketW' type='number' inputmode='decimal' min='1' placeholder='例 55' value='"+esc(state.powerUse.blanketW??"")+"'></div><div class='field'><label>使用時間 h</label><input data-power='hours' type='number' inputmode='decimal' min='0.5' step='0.5' placeholder='例 8' value='"+esc(state.powerUse.hours??"")+"'></div></div>"+(ownsPortable?"<p class='micro'>手持ちのポータブル電源がある場合、容量と定格出力も入れると買い替え不要か判定できます。</p><div class='form-row'><div class='field'><label>手持ち容量 Wh</label><input data-power='ownedWh' type='number' inputmode='decimal' min='1' placeholder='例 512' value='"+esc(state.powerUse.ownedWh??"")+"'></div><div class='field'><label>手持ち定格出力 W</label><input data-power='ownedOutputW' type='number' inputmode='decimal' min='1' placeholder='例 500' value='"+esc(state.powerUse.ownedOutputW??"")+"'></div></div>":"")+"</div>":"";
  panel.innerHTML=wrap("新しく買う前に、家にあるものを。","持っている物をタップしてください。ひとつの道具を複数の用途に使える場合もあります。","<div class='gear-grid'>"+cards+"</div><div style='margin-top:24px'><p class='step-kicker'>寝床を作ってみると？</p><div class='grid'>"+floorCards+"</div><p class='micro'>車種データが未確認でも、あなた自身が段差を感じた場合だけ段差対策の候補を出します。</p></div><div class='field' style='margin-top:22px'><label><input data-device='electric_blanket' type='checkbox' "+(wantsBlanket?"checked":"")+"> 今回、電気毛布を使いたい</label></div>"+powerFields+"<div class='actions'>"+backButton()+"<button class='primary' data-next>一泊を完成する <span>→</span></button></div>","STEP 5 · 手持ち");
}
function statusLabel(s){return {READY:"READY",ALMOST_READY:"ALMOST READY",CHALLENGE:"CHECK FIRST",CHANGE_PLAN:"CHANGE PLAN"}[s]||s;}
function resultCards(result){
  const sleep=result.sleep;
  const len=sleep.lengthState==="comfort"?"◎ 余裕あり":sleep.lengthState==="ok"?"○ 寝られる":sleep.lengthState==="tight"?"△ 工夫が必要":sleep.lengthState==="short"?"× 短い":"? 未確認";
  const wid=sleep.widthState==="just_right"?"○ ちょうど":sleep.widthState==="snug"?"△ ぎゅっと":sleep.widthState==="not_recommended"?"× 非推奨":sleep.widthState==="solo_unchecked"?"○ 1人":"? 未確認";
  const hasPrivacy=selectedGear().some(g=>g.capabilities?.includes("privacy_full"));
  const floorState=result.floor?.state||"unknown";
  const floorLabel=floorState==="needs_fix"?"△ 対策したい":floorState==="resolved_free"?"◎ 家の物で対応":floorState==="resolved_product"?"◎ 対策済み":floorState==="flat"?"◎ ほぼ平ら":"? 未確認";
  const floorClass=floorState==="needs_fix"||floorState==="unknown"?"dot-warn":"dot-ok";
  return "<div class='result-grid'><div class='result-card'><b>寝床の長さ <span class='"+(len[0]==="×"?"dot-bad":len[0]==="△"||len[0]==="?"?"dot-warn":"dot-ok")+"'>"+len+"</span></b><p>"+(sleep.length?sleep.length+"mmで判定":"実測が必要です")+"</p></div><div class='result-card'><b>寝床の幅 <span class='"+(wid[0]==="×"?"dot-bad":wid[0]==="△"||wid[0]==="?"?"dot-warn":"dot-ok")+"'>"+wid+"</span></b><p>"+(sleep.width?sleep.width+"mm / 目安"+sleep.targetWidth+"mm":"2人以上は実測が必要です")+"</p></div><div class='result-card'><b>寝床の段差 <span class='"+floorClass+"'>"+floorLabel+"</span></b><p>"+(floorState==="unknown"?"自宅で一度寝床を作って確認すると商品選びが正確になります。":"段差を感じた場合だけ対策候補を出します。")+"</p></div><div class='result-card'><b>目隠し <span class='"+(hasPrivacy?"dot-ok":"dot-warn")+"'>"+(hasPrivacy?"◎ あり":"× 未対策")+"</span></b><p>外からの視線と光を遮る準備。</p></div><div class='result-card'><b>場所 <span class='"+(["rv_park","auto_camp","authorized_private"].includes(state.placeType)?"dot-ok":"dot-warn")+"'>"+(["rv_park","auto_camp","authorized_private"].includes(state.placeType)?"◎ 確認しやすい":"△ 要確認")+"</span></b><p>施設ごとのルールを最終確認してください。</p></div></div>";
}
function quickMeasure(result){
  if(!result.sleep.needsQuickMeasure.length)return "";
  const needL=result.sleep.needsQuickMeasure.includes("length"),needW=result.sleep.needsQuickMeasure.includes("width");
  return "<div class='measure-card'><h3>QUICK MEASURE</h3><p>分からない寸法は推測しません。メジャーで次だけ測れば、判定を更新できます。</p><div class='measure-diagram'>"+(needL&&needW?"① 寝床の長さ　／　② 一番狭い幅":needL?"① 寝床の長さ":"② 一番狭い幅")+"</div><div class='form-row'>"+(needL?"<div class='field'><label>長さ mm</label><input data-measure='lengthMm' type='number' value='"+esc(state.measurements.lengthMm??"")+"'></div>":"")+(needW?"<div class='field'><label>幅 mm</label><input data-measure='widthMm' type='number' value='"+esc(state.measurements.widthMm??"")+"'></div>":"")+"</div><button class='primary' data-recalc>測って判定を更新</button></div>";
}
function renderResult(){
  state.step=5;
  const v=currentVehicle();const result=evaluate(inputForEngine(),v,rules());state.lastResult=result;save();
  const recs=recommendations(db.products,{gaps:result.gaps,vehicleId:v.vehicleId,config:state.config,status:result.status,measurements:state.measurements,sleep:result.sleep});
  const gaps=result.gaps.map((g,i)=>{
    const requirement=g.id==="power_capacity"&&g.requiredWh?"<p class='power-requirement'><b>必要容量の目安 "+esc(g.requiredWh)+"Wh以上</b><span>定格出力 "+esc(g.requiredOutputW||0)+"W以上 · 消費電力×時間×1.25のSOTOJITAKU目安</span></p>":"";
    return "<div class='gap-item'><span class='free-badge'>"+(g.free?"0円対策を先に":"確認")+"</span><h3>"+(i+1)+". "+esc(gapLabel(g.id))+"</h3><p>"+esc(g.free||"条件を確認してください。")+"</p>"+requirement+"</div>";
  }).join("");
  const productSections=result.gaps.filter(g=>(recs[g.id]||[]).length).map(g=>"<section class='gap-item'><h3>"+esc(gapLabel(g.id))+"が、0円対策でも足りないときだけ</h3><p>手持ち品で解決できれば購入は不要です。</p>"+renderProducts(recs[g.id]||[],g.id)+"</section>").join("");
  const readyNames={floor:"段差の対策",floor_free:"家にある物で段差対策",sleep_surface:"身体の下に敷く寝具",privacy:"全面の目隠し",power_capacity:"手持ち電源の容量"};
  const prepared=result.resolved.length?"<div class='prepared'><p class='step-kicker'>すでに整っていること</p><div class='no-need-tags'>"+[...new Set(result.resolved)].map(x=>"<span>✓ "+esc(readyNames[x]||x)+"</span>").join("")+"</div></div>":"";
  const noNeed=result.notNeeded.length?"<div class='no-need'><h3>今回は、買わなくていいもの</h3><div class='no-need-tags'>"+result.notNeeded.map(x=>"<span>"+esc(x)+"</span>").join("")+"</div><p class='micro'>はじめての一泊に、全部はいりません。</p></div>":"";
  const issueHtml=result.issues.length?"<div class='note "+(result.status==="CHANGE_PLAN"?"warning":"")+"'>"+result.issues.map(x=>"<b>"+esc(x.title)+"</b><br>"+esc(x.text)).join("<br><br>")+"</div>":"";
  const eligibleProductCount=Object.values(recs).reduce((sum,items)=>sum+(items?.length||0),0);
  const commerceNote=result.status==="CHANGE_PLAN"
    ?"<div class='shopping-empty'>今回は安全条件の変更が先です。購入候補は表示しません。</div>"
    :eligibleProductCount>0
      ?"<div class='shopping-trust'><b>表示しているのは、今の条件に合う確認済み商品だけ。</b><span>車種・仕様・販売状態・価格・楽天リンクを7日以内に確認しています。0円対策で足りる場合は、買わなくて大丈夫です。</span></div>"
      :result.gaps.length===0?"<div class='shopping-empty'>今回の支度は手持ち品で整っています。新しく買うものはありません。</div>":"<div class='shopping-empty'>この条件で安全に出せる監査済み商品はまだありません。無理に近い商品は表示せず、0円対策を優先します。</div>";
  panel.innerHTML="<div class='result-head'><span class='status'>"+statusLabel(result.status)+"</span><h2>"+esc(resultHeadline(result)).replace("、","、<br>")+"</h2><p>"+esc(v.shortLabel)+" × "+state.people.length+"人 × "+esc(tripLabel(state.tripStyle))+"</p></div>"+issueHtml+resultCards(result)+prepared+quickMeasure(result)+(gaps?"<div class='gap-list'><p class='step-kicker'>まずは0円でできること</p>"+gaps+"</div>":"<div class='note'>大きな不足は見つかりませんでした。出発前に施設ルールと最新天気をもう一度確認してください。</div>")+noNeed+commerceNote+(productSections?"<div class='needed-products'><p class='step-kicker'>それでも足りないもの</p>"+productSections+"</div>":"")+"<div class='source-box'>安全判定は初心者向けの保守的な支度支援で、法令・医療上の保証ではありません。出発前に施設公式情報と最新天気を確認してください。</div><div class='actions'><button class='secondary' data-edit>条件を直す</button><button class='primary' data-new>もう一度つくる</button></div>";
  for(const g of result.gaps){
    const gapKey=v.vehicleId+":"+g.id;
    if(!viewedGaps.has(gapKey)){
      viewedGaps.add(gapKey);
      track("gap_generated",{vehicle_id:v.vehicleId,gap_id:g.id,severity:g.severity||"",free_solution:g.free?1:0,seat_count:state.config.seatCount||0,trim:state.config.trim||""});
      if(result.status!=="CHANGE_PLAN"&&(recs[g.id]||[]).length===0){
        track("gap_product_missing",{vehicle_id:v.vehicleId,gap_id:g.id,severity:g.severity||"",seat_count:state.config.seatCount||0,trim:state.config.trim||""});
      }
    }
    if(g.free&&!viewedFreeSolutions.has(gapKey)){
      viewedFreeSolutions.add(gapKey);
      track("free_solution_view",{vehicle_id:v.vehicleId,gap_id:g.id});
    }
  }
  if(result.status==="CHANGE_PLAN"){
    track("shopping_suppressed",{vehicle_id:v.vehicleId,reason:"change_plan"});
  }else if(eligibleProductCount===0){
    const noProductKey=v.vehicleId+":"+result.status+":"+result.gaps.map(g=>g.id).sort().join(",");
    if(!completedNoProduct.has(noProductKey)){
      completedNoProduct.add(noProductKey);
      track("no_purchase_complete",{vehicle_id:v.vehicleId,status:result.status,gap_count:result.gaps.length});
    }
  }
  state.step=5;progressBar.style.width="100%";stepLabel.textContent="YOUR CAR STAY";
  track("builder_completed",{vehicle_id:v.vehicleId,status:result.status,gap_count:result.gaps.length,eligible_product_count:eligibleProductCount});
  setCabin();
}
function gapLabel(id){return {privacy_full:"窓の目隠し",floor_step:"寝床の段差",sleep_surface:"身体の下に敷くもの",thermal_unknown:"夜の気温・防寒",thermal_warmth:"防寒",authorized_place_unconfirmed:"泊まる場所",sleep_space:"寝床サイズ",sleep_comfort:"寝心地",power_capacity:"電源容量"}[id]||id;}
function tripLabel(id){return {sleep_only:"寝るだけ",onsen:"温泉の夜",stars:"星を見る夜",morning:"朝を楽しむ",outdoor:"アウトドア"}[id]||"一泊";}
function yen(value){return new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(value);}
function renderProducts(items,gapId=""){
  if(!items.length)return "";
  items.forEach((p,index)=>{
    const rank=index+1;
    const viewKey=gapId+":"+p.productId;
    if(!viewedProducts.has(viewKey)){
      viewedProducts.add(viewKey);
      track("product_view",{product_id:p.productId,vehicle_id:state.vehicleId,gap_id:gapId,price:p.price||0,recommendation_role:p.recommendationRole||"",product_rank:rank,conversion_source:"car_stay_"+gapId,fit_strategy:p.fitStrategy||"vehicle",recommended_qty:p.recommendedQty||1});
    }
  });
  return "<div class='product-stack'>"+items.map((p,index)=>{
    const measured=p.fitStrategy==="measurement";
    const fitLabel=p.fitStrategy==="power"?"必要容量を満たす":measured?"実測寸法で適合":"車種適合・販売確認済み";
    const roleLabel=p.recommendationRole==="frequent_user_upgrade"?"本格利用向け":p.recommendationRole==="beginner_alternative"?"代替候補":"初泊向け";
    const qty=p.recommendedQty||1;
    const qtyText=qty>1?"<span class='qty-badge'>"+qty+"枚使用</span>":"";
    const measureText=measured&&p.measurementPlan?"<small class='measure-fit-note'>実測スペースが "+p.measurementPlan.requiredLengthMm+"×"+p.measurementPlan.requiredWidthMm+"mm 以上のときのみ表示</small>":"";
    const fitExplanation=p.fitStrategy==="power"?"必要 "+(state.lastResult?.power?.requiredWh||0)+"Wh・"+(state.lastResult?.power?.requiredOutputW||0)+"Wに対し、容量 "+p.powerSpec.capacityWh+"Wh・定格 "+p.powerSpec.ratedOutputW+"Wを満たす候補です。":measured?"入力した寝床の長さ・幅で、"+qty+"枚を置ける寸法を確認しています。":(currentVehicle()?.shortLabel||"")+" "+(state.config.seatCount?state.config.seatCount+"人乗り ":"")+(state.config.trim||"")+"の適合確認済み候補です。";
    const firstPick=index===0?"<span class='top-pick-badge'>まず見る</span>":"";
    return "<article class='product-card "+(index===0?"top-pick":"")+"'><img src='"+esc(p.image)+"' alt='' loading='lazy'><div class='product-copy'><div class='product-badges'>"+firstPick+"<span class='pr-badge'>PR</span><span class='fit-badge'>"+fitLabel+"</span><span class='role-badge'>"+roleLabel+"</span>"+qtyText+"</div><b>"+esc(p.name)+"</b>"+measureText+"<p class='fit-explanation'>"+esc(fitExplanation)+"</p><div class='product-meta'><strong>"+yen((p.price||0)*qty)+(qty>1?" <small>（"+qty+"枚合計）</small>":"")+"</strong><small>確認 "+esc((p.verifiedAt||"").slice(0,10))+"</small></div><a class='product-cta' href='"+esc(p.affiliateUrl)+"' target='_blank' rel='nofollow sponsored noopener' data-product='"+esc(p.productId)+"' data-gap='"+esc(gapId)+"' data-price='"+esc((p.price||0)*qty)+"' data-role='"+esc(p.recommendationRole||"")+"' data-rank='"+(index+1)+"' data-source='car_stay_"+esc(gapId)+"' data-qty='"+qty+"'>楽天で確認する <span>→</span></a></div></article>";
  }).join("")+"</div>";
}
function render(){
  stepLabel.textContent=state.step<5?"STEP "+(state.step+1)+" / 5":"YOUR CAR STAY";
  progressBar.style.width=stepPct()+"%";setCabin();
  if(state.step===0)renderVehicle();
  else if(state.step===1)renderPeople();
  else if(state.step===2)renderTrip();
  else if(state.step===3)renderEnvironment();
  else if(state.step===4)renderGear();
  else renderResult();
  if(state.step<5)trackStepView(state.step);
  panel.querySelectorAll(".choice,.gear").forEach(el=>el.setAttribute("aria-pressed",String(el.classList.contains("selected"))));
  panel.querySelectorAll(".field").forEach((field,i)=>{const label=field.querySelector("label"),input=field.querySelector("input,select");if(label&&input){input.id="answer-"+i;label.htmlFor=input.id;}});
}
function advance(){
  if(state.step===0&&(!state.vehicleId||!vehicleConfigComplete()))return;
  if(state.step===2&&!state.tripStyle)return;
  if(state.step===3&&!state.placeType)return;
  trackStepComplete(state.step);
  if(state.step<4){state.step++;save();render();window.scrollTo({top:0,behavior:"smooth"});}
  else {renderResult();window.scrollTo({top:0,behavior:"instant"});}
}
panel.addEventListener("click",e=>{
  const t=e.target.closest("button,a");if(!t)return;
  if(t.dataset.vehicle){state.vehicleId=t.dataset.vehicle;state.config={};track("vehicle_selected",{vehicle_id:state.vehicleId});save();render();}
  else if(t.dataset.count){const n=Number(t.dataset.count);const old=state.people;state.people=Array.from({length:n},(_,i)=>old[i]||{type:i<2?"adult":"child",height:i<2?165:120});save();render();}
  else if(t.dataset.trip){state.tripStyle=t.dataset.trip;track("trip_style_selected",{trip_style:state.tripStyle});save();render();}
  else if(t.dataset.gear){state.ownedGear=state.ownedGear.includes(t.dataset.gear)?state.ownedGear.filter(x=>x!==t.dataset.gear):[...state.ownedGear,t.dataset.gear];track("gear_selected",{gear_id:t.dataset.gear,owned:state.ownedGear.includes(t.dataset.gear)?1:0});save();render();}
  else if(t.dataset.floor){state.floorObservation=t.dataset.floor;track("floor_observation",{vehicle_id:state.vehicleId,observation:state.floorObservation});save();render();}
  else if(t.matches("[data-next]"))advance();
  else if(t.matches("[data-back]")){state.step=Math.max(0,state.step-1);save();render();}
  else if(t.matches("[data-recalc]")){renderResult();}
  else if(t.matches("[data-edit]")){state.step=3;save();render();}
  else if(t.matches("[data-new]"))reset();
  else if(t.dataset.product){track("affiliate_click",{product_id:t.dataset.product,vehicle_id:state.vehicleId,gap_id:t.dataset.gap||"",price:Number(t.dataset.price)||0,recommendation_role:t.dataset.role||"",product_rank:Number(t.dataset.rank)||0,conversion_source:t.dataset.source||"car_stay"});}
});
panel.addEventListener("input",e=>{
  const t=e.target;
  if(t.dataset.height!==undefined)state.people[Number(t.dataset.height)].height=Number(t.value)||0;
  if(t.dataset.personType!==undefined)state.people[Number(t.dataset.personType)].type=t.value;
  if(t.dataset.config){
    state.config[t.dataset.config]=t.dataset.config==="seatCount"?Number(t.value)||null:t.value;
    sanitizeVehicleConfig(currentVehicle(),t.dataset.config);
    renderVehicle();
  }
  if(t.dataset.env){
    if(t.dataset.env==="date")state.date=t.value;
    if(t.dataset.env==="region")state.region=t.value;
    if(t.dataset.env==="placeType"){state.placeType=t.value;panel.querySelector("[data-next]").disabled=!state.placeType;track("location_selected",{place_type:t.value});}
    if(["minC","maxC"].includes(t.dataset.env)){state.weather[t.dataset.env]=t.value===""?null:Number(t.value);state.weather.status=(state.weather.minC!==null&&state.weather.maxC!==null)?"known":"unknown";}
  }
  if(t.dataset.measure){state.measurements[t.dataset.measure]=t.value===""?null:Number(t.value);}
  if(t.dataset.power){state.powerUse[t.dataset.power]=t.value===""?null:Number(t.value);}
  if(t.dataset.safety)state[t.dataset.safety]=t.checked;
  if(t.dataset.device){state.devices=t.checked?[...new Set([...state.devices,t.dataset.device])]:state.devices.filter(x=>x!==t.dataset.device);}
  save();
  if(t.dataset.device){renderGear();setCabin();}
});
$("#startBtn").addEventListener("click",start);
resetTop.addEventListener("click",reset);
$("#analyticsOpt").addEventListener("click",()=>{
  analyticsEnabled=!analyticsEnabled;
  window["ga-disable-G-GFVSZ8YDQ5"]=!analyticsEnabled;
  localStorage.setItem("sotojitaku_analytics_optout",analyticsEnabled?"0":"1");
  alert(analyticsEnabled?"アクセス計測を有効にしました。":"アクセス計測を無効にしました。");
});
$("#startBtn").disabled=true;
loadSaved();
loadData().then(()=>{
  $("#startBtn").disabled=false;
  if(presetVehicle&&db.vehicles.some(v=>v.vehicleId===presetVehicle)){
    state.vehicleId=presetVehicle;
    const v=currentVehicle();
    const candidate={};
    const seat=Number(presetSeatCount);
    if(presetSeatCount&&Number.isFinite(seat)){
      const allowed=v?.config?.seatCounts||[];
      const valid=validVehicleConfigs(v);
      if((valid&&valid.some(x=>Number(x.seatCount)===seat))||(!valid&&allowed.includes(seat)))candidate.seatCount=seat;
    }
    if(presetTrim){
      const allowed=v?.config?.trims||[];
      const valid=validVehicleConfigs(v);
      if((valid&&valid.some(x=>x.trim===presetTrim))||(!valid&&allowed.includes(presetTrim)))candidate.trim=presetTrim;
    }
    const valid=validVehicleConfigs(v);
    state.config=valid&&Object.keys(candidate).length&&!valid.some(vc=>Object.entries(candidate).every(([key,value])=>configValueMatches(key,value,vc[key])))?{}:candidate;
    if(Number.isInteger(presetParty)&&presetParty>=1&&presetParty<=3){
      const previous=state.people||[];
      state.people=Array.from({length:presetParty},(_,i)=>({type:i<2?"adult":"child",height:Number(previous[i]?.height)||(i<2?(i===0?171:160):120)}));
    }
    state.step=0;
    save();
    track("seo_builder_entry",{vehicle_id:presetVehicle,party_count:state.people.length,seat_count:state.config.seatCount||0,trim:state.config.trim||""});
    showBuilder();
  }else if(state.vehicleId||state.step>0){
    showBuilder();
  }else{
    setCabin();
  }
}).catch(()=>{
  hero.hidden=true;builder.hidden=false;panel.innerHTML="<div class='fatal'><b>読み込みに失敗しました。</b><p>ページを再読み込みしてください。</p></div>";
});
