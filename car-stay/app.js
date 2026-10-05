import {evaluate,resultHeadline,DEFAULT_RULES} from "./engine.js";
import {recommendations} from "./products.js";

const DATA_BASE="./data/";
const VERSION=1;
const STORAGE_KEY="sotojitaku_car_stay_v1";
const qs=new URLSearchParams(location.search);
const operatorTest=qs.get("test")==="1";
const presetVehicle=qs.get("vehicle");
let analyticsEnabled=localStorage.getItem("sotojitaku_analytics_optout")!=="1";
const viewedProducts=new Set();
const $=s=>document.querySelector(s);
const panel=$("#panel"),builder=$("#builder"),hero=$("#hero"),cabin=$("#cabin"),cabinMessage=$("#cabinMessage"),progressBar=$("#progressBar"),stepLabel=$("#stepLabel"),vehicleMini=$("#vehicleMini"),buildChips=$("#buildChips"),resetTop=$("#resetTop");

let db={vehicles:[],gear:[],products:[],rules:DEFAULT_RULES};
let state={
  version:VERSION,step:0,vehicleId:null,config:{},people:[{type:"adult",height:171},{type:"adult",height:160}],
  tripStyle:null,date:"",region:"",placeType:null,weather:{status:"unknown",minC:null,maxC:null},
  ownedGear:[],devices:[],measurements:{lengthMm:null,widthMm:null},sleepEngineOn:false,openFlameInside:false
};

function track(name,params={}){
  if(!analyticsEnabled||typeof window.gtag!=="function")return;
  window.gtag("event",name,{site_id:"sotojitaku_car_stay",operator_test:operatorTest?1:0,...params});
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
function loadSaved(){try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY));if(x&&x.version===VERSION)state={...state,...x};}catch{}}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function selectedGear(){
  return db.gear.filter(g=>state.ownedGear.includes(g.gearId));
}
function currentVehicle(){return db.vehicles.find(v=>v.vehicleId===state.vehicleId);}
function vehicleConfigComplete(){
  const v=currentVehicle();
  if(!v)return false;
  if(v.config?.seatCounts?.length&&!v.config.seatCounts.includes(Number(state.config.seatCount)))return false;
  if(v.config?.trims?.length&&!v.config.trims.includes(state.config.trim))return false;
  return true;
}
function rules(){return {...DEFAULT_RULES,...db.rules};}
function inputForEngine(){
  return {people:state.people,tripStyle:state.tripStyle,placeType:state.placeType,weather:state.weather,gear:selectedGear(),devices:state.devices,measurements:state.measurements,sleepEngineOn:state.sleepEngineOn,openFlameInside:state.openFlameInside};
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
  state.step=0;save();showBuilder();track("carstay_start");
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
  if(state.step>=5)cabin.classList.add("state-ready");
  buildChips.innerHTML=chips.map(c=>"<span class='"+c[1]+"'>"+c[0]+"</span>").join("");
  const v=currentVehicle();
  vehicleMini.textContent=v?v.shortLabel:"愛車を選択";
  if(!v)cabinMessage.textContent="クルマを選ぶと、ここにあなたの一泊が育っていきます。";
  else if(state.step===0)cabinMessage.textContent=v.shortLabel+"で、一泊をつくります。";
  else if(state.step===1)cabinMessage.textContent="誰と眠るかで、必要な寝床の幅が変わります。";
  else if(state.step===2)cabinMessage.textContent="過ごし方を決めると、いらない道具も見えてきます。";
  else if(state.step===3)cabinMessage.textContent="安全な場所と気温を、道具より先に確認します。";
  else if(state.step===4)cabinMessage.textContent="家にあるものを積むほど、買うものは減っていきます。";
  else cabinMessage.textContent="あなたの小さな宿が、ここまでできました。";
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
  if(v?.config?.seatCounts?.length)config+="<div class='field'><label>乗車定員</label><select data-config='seatCount'><option value=''>選択</option>"+v.config.seatCounts.map(x=>"<option value='"+x+"' "+(Number(state.config.seatCount)===x?"selected":"")+">"+x+"人乗り</option>").join("")+"</select></div>";
  if(v?.config?.trims?.length)config+="<div class='field'><label>グレード / 仕様</label><select data-config='trim'><option value=''>選択</option>"+v.config.trims.map(x=>"<option value='"+esc(x)+"' "+(state.config.trim===x?"selected":"")+">"+esc(x)+"</option>").join("")+"</select></div>";
  panel.innerHTML=wrap("どのクルマで泊まる？","まずは愛車を選びます。未確認寸法は推測せず、必要ならあとで2か所だけ測ります。","<div class='grid'>"+cards+"</div>"+(config?"<div class='form-row' style='margin-top:18px'>"+config+"</div>":"")+"<div class='note'>"+(v&&!vehicleConfigComplete()&&config?"適合商品を正確に出すため、乗車定員・グレードなどを選んでください。":"登録がない車種でも、寝床の長さと幅を測れば判定できる設計です。")+"</div><div class='actions'>"+backButton()+"<button class='primary' data-next type='button' "+(!state.vehicleId||!vehicleConfigComplete()?"disabled":"")+">誰と泊まる？ <span>→</span></button></div>","STEP 1 · 愛車");
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
  panel.innerHTML=wrap("いつ、どこで泊まる？","場所のルールと夜の気温を安全判定の最上位に置きます。","<div class='form-row'><div class='field'><label>日付</label><input data-env='date' type='date' value='"+esc(state.date)+"'></div><div class='field'><label>地域</label><input data-env='region' placeholder='例：山梨県 富士五湖' value='"+esc(state.region)+"'></div></div><div class='field'><label>場所タイプ</label><select data-env='placeType'><option value=''>選択してください</option>"+place+"</select></div><div class='form-row'><div class='field'><label>予想最低気温 °C（分かれば）</label><input data-env='minC' type='number' inputmode='decimal' value='"+esc(state.weather.minC??"")+"'></div><div class='field'><label>予想最高気温 °C（分かれば）</label><input data-env='maxC' type='number' inputmode='decimal' value='"+esc(state.weather.maxC??"")+"'></div></div><div class='note warning'>道の駅・SA/PAは宿泊施設としてREADY判定しません。暑さ条件も、扇風機や網戸を買うだけでは解除しません。</div><div class='actions'>"+backButton()+"<button class='primary' data-next "+(!state.placeType?"disabled":"")+">家にあるもの <span>→</span></button></div>","STEP 4 · 安全");
}
function renderGear(){
  const icons={home_duvet:"🛏️",blanket:"🧣",pillow:"☁️",towel:"🧺",camp_mat:"▰",led_light:"💡",mobile_battery:"🔋",privacy_full:"🌙",fan:"🌀",electric_blanket:"♨️",portable_power:"🔌"};
  const cards=db.gear.map(g=>"<button class='gear "+(state.ownedGear.includes(g.gearId)?"selected":"")+"' data-gear='"+g.gearId+"'><span class='icon'>"+(icons[g.gearId]||"•")+"</span><b>"+esc(g.label)+"</b></button>").join("");
  panel.innerHTML=wrap("新しく買う前に、家にあるものを。","持っている物をタップしてください。ひとつの道具を複数の用途に使える場合もあります。","<div class='gear-grid'>"+cards+"</div><div class='field' style='margin-top:22px'><label><input data-device='electric_blanket' type='checkbox' "+(state.devices.includes("electric_blanket")?"checked":"")+"> 今回、電気毛布を使いたい</label></div><div class='actions'>"+backButton()+"<button class='primary' data-next>一泊を完成する <span>→</span></button></div>","STEP 5 · 手持ち");
}
function statusLabel(s){return {READY:"READY",ALMOST_READY:"ALMOST READY",CHALLENGE:"CHECK FIRST",CHANGE_PLAN:"CHANGE PLAN"}[s]||s;}
function resultCards(result){
  const sleep=result.sleep;
  const len=sleep.lengthState==="comfort"?"◎ 余裕あり":sleep.lengthState==="ok"?"○ 寝られる":sleep.lengthState==="tight"?"△ 工夫が必要":sleep.lengthState==="short"?"× 短い":"? 未確認";
  const wid=sleep.widthState==="just_right"?"○ ちょうど":sleep.widthState==="snug"?"△ ぎゅっと":sleep.widthState==="not_recommended"?"× 非推奨":sleep.widthState==="solo_unchecked"?"○ 1人":"? 未確認";
  const hasPrivacy=selectedGear().some(g=>g.capabilities?.includes("privacy_full"));
  return "<div class='result-grid'><div class='result-card'><b>寝床の長さ <span class='"+(len[0]==="×"?"dot-bad":len[0]==="△"||len[0]==="?"?"dot-warn":"dot-ok")+"'>"+len+"</span></b><p>"+(sleep.length?sleep.length+"mmで判定":"実測が必要です")+"</p></div><div class='result-card'><b>寝床の幅 <span class='"+(wid[0]==="×"?"dot-bad":wid[0]==="△"||wid[0]==="?"?"dot-warn":"dot-ok")+"'>"+wid+"</span></b><p>"+(sleep.width?sleep.width+"mm / 目安"+sleep.targetWidth+"mm":"2人以上は実測が必要です")+"</p></div><div class='result-card'><b>目隠し <span class='"+(hasPrivacy?"dot-ok":"dot-warn")+"'>"+(hasPrivacy?"◎ あり":"× 未対策")+"</span></b><p>外からの視線と光を遮る準備。</p></div><div class='result-card'><b>場所 <span class='"+(["rv_park","auto_camp","authorized_private"].includes(state.placeType)?"dot-ok":"dot-warn")+"'>"+(["rv_park","auto_camp","authorized_private"].includes(state.placeType)?"◎ 確認しやすい":"△ 要確認")+"</span></b><p>施設ごとのルールを最終確認してください。</p></div></div>";
}
function quickMeasure(result){
  if(!result.sleep.needsQuickMeasure.length)return "";
  const needL=result.sleep.needsQuickMeasure.includes("length"),needW=result.sleep.needsQuickMeasure.includes("width");
  return "<div class='measure-card'><h3>QUICK MEASURE</h3><p>分からない寸法は推測しません。メジャーで次だけ測れば、判定を更新できます。</p><div class='measure-diagram'>"+(needL&&needW?"① 寝床の長さ　／　② 一番狭い幅":needL?"① 寝床の長さ":"② 一番狭い幅")+"</div><div class='form-row'>"+(needL?"<div class='field'><label>長さ mm</label><input data-measure='lengthMm' type='number' value='"+esc(state.measurements.lengthMm??"")+"'></div>":"")+(needW?"<div class='field'><label>幅 mm</label><input data-measure='widthMm' type='number' value='"+esc(state.measurements.widthMm??"")+"'></div>":"")+"</div><button class='primary' data-recalc>測って判定を更新</button></div>";
}
function renderResult(){
  const v=currentVehicle();const result=evaluate(inputForEngine(),v,rules());state.lastResult=result;save();
  const recs=recommendations(db.products,{gaps:result.gaps,vehicleId:v.vehicleId,config:state.config});
  const gaps=result.gaps.map((g,i)=>"<div class='gap-item'><span class='free-badge'>"+(g.free?"0円対策を先に":"確認")+"</span><h3>"+(i+1)+". "+esc(gapLabel(g.id))+"</h3><p>"+esc(g.free||"条件を確認してください。")+"</p>"+renderProducts(recs[g.id]||[])+"</div>").join("");
  const noNeed=result.notNeeded.length?"<div class='no-need'><h3>今回は、買わなくていいもの</h3><div class='no-need-tags'>"+result.notNeeded.map(x=>"<span>"+esc(x)+"</span>").join("")+"</div><p class='micro'>はじめての一泊に、全部はいりません。</p></div>":"";
  const issueHtml=result.issues.length?"<div class='note "+(result.status==="CHANGE_PLAN"?"warning":"")+"'>"+result.issues.map(x=>"<b>"+esc(x.title)+"</b><br>"+esc(x.text)).join("<br><br>")+"</div>":"";
  panel.innerHTML="<div class='result-head'><span class='status'>"+statusLabel(result.status)+"</span><h2>"+esc(resultHeadline(result))+"</h2><p>"+esc(v.shortLabel)+" × "+state.people.length+"人 × "+esc(tripLabel(state.tripStyle))+"</p></div>"+issueHtml+resultCards(result)+quickMeasure(result)+(gaps?"<div class='gap-list'><p class='step-kicker'>今回、整えるところ</p>"+gaps+"</div>":"<div class='note'>大きな不足は見つかりませんでした。出発前に施設ルールと最新天気をもう一度確認してください。</div>")+noNeed+"<div class='shopping-empty'>監査済み商品が0件でも計画は完成します。商品CTAは、車種適合・販売状態・価格・リンク先を7日以内に確認できた商品だけ表示します。</div><div class='source-box'>安全判定は初心者向けの保守的な支度支援で、法令・医療上の保証ではありません。出発前に施設公式情報と最新天気を確認してください。</div><div class='actions'><button class='secondary' data-edit>条件を直す</button><button class='primary' data-new>もう一度つくる</button></div>";
  state.step=5;progressBar.style.width="100%";stepLabel.textContent="YOUR CAR STAY";track("builder_completed",{vehicle_id:v.vehicleId,status:result.status,gap_count:result.gaps.length});setCabin();
}
function gapLabel(id){return {privacy_full:"窓の目隠し",floor_step:"寝床の段差",thermal_unknown:"夜の気温・防寒",thermal_warmth:"防寒",authorized_place_unconfirmed:"泊まる場所",sleep_space:"寝床サイズ",sleep_comfort:"寝心地",power_capacity:"電源容量"}[id]||id;}
function tripLabel(id){return {sleep_only:"寝るだけ",onsen:"温泉の夜",stars:"星を見る夜",morning:"朝を楽しむ",outdoor:"アウトドア"}[id]||"一泊";}
function yen(value){return new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(value);}
function renderProducts(items){
  if(!items.length)return "";
  for(const p of items){
    if(!viewedProducts.has(p.productId)){viewedProducts.add(p.productId);track("product_view",{product_id:p.productId,vehicle_id:state.vehicleId,gap_id:(p.gapIds||[])[0]||""});}
  }
  return "<div class='product-stack'>"+items.map(p=>"<article class='product-card'><img src='"+esc(p.image)+"' alt='' loading='lazy'><div class='product-copy'><span class='fit-badge'>車種適合・販売確認済み</span><b>"+esc(p.name)+"</b><div class='product-meta'><strong>"+yen(p.price)+"</strong><small>確認 "+esc((p.verifiedAt||"").slice(0,10))+"</small></div><a class='product-cta' href='"+esc(p.affiliateUrl)+"' target='_blank' rel='nofollow sponsored noopener' data-product='"+esc(p.productId)+"'>楽天で見る <span>→</span></a></div></article>").join("")+"</div>";
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
}
function advance(){
  if(state.step===0&&(!state.vehicleId||!vehicleConfigComplete()))return;
  if(state.step===2&&!state.tripStyle)return;
  if(state.step===3&&!state.placeType)return;
  if(state.step<4){state.step++;save();render();window.scrollTo({top:0,behavior:"smooth"});}
  else renderResult();
}
panel.addEventListener("click",e=>{
  const t=e.target.closest("button,a");if(!t)return;
  if(t.dataset.vehicle){state.vehicleId=t.dataset.vehicle;state.config={};track("vehicle_selected",{vehicle_id:state.vehicleId});save();render();}
  else if(t.dataset.count){const n=Number(t.dataset.count);const old=state.people;state.people=Array.from({length:n},(_,i)=>old[i]||{type:i<2?"adult":"child",height:i<2?165:120});save();render();}
  else if(t.dataset.trip){state.tripStyle=t.dataset.trip;track("trip_style_selected",{trip_style:state.tripStyle});save();render();}
  else if(t.dataset.gear){state.ownedGear=state.ownedGear.includes(t.dataset.gear)?state.ownedGear.filter(x=>x!==t.dataset.gear):[...state.ownedGear,t.dataset.gear];track("gear_selected",{gear_id:t.dataset.gear,owned:state.ownedGear.includes(t.dataset.gear)?1:0});save();render();}
  else if(t.matches("[data-next]"))advance();
  else if(t.matches("[data-back]")){state.step=Math.max(0,state.step-1);save();render();}
  else if(t.matches("[data-recalc]")){renderResult();}
  else if(t.matches("[data-edit]")){state.step=3;save();render();}
  else if(t.matches("[data-new]"))reset();
  else if(t.dataset.product){track("affiliate_click",{product_id:t.dataset.product,vehicle_id:state.vehicleId});}
});
panel.addEventListener("input",e=>{
  const t=e.target;
  if(t.dataset.height!==undefined)state.people[Number(t.dataset.height)].height=Number(t.value)||0;
  if(t.dataset.personType!==undefined)state.people[Number(t.dataset.personType)].type=t.value;
  if(t.dataset.config){state.config[t.dataset.config]=t.dataset.config==="seatCount"?Number(t.value)||null:t.value;renderVehicle();}
  if(t.dataset.env){
    if(t.dataset.env==="date")state.date=t.value;
    if(t.dataset.env==="region")state.region=t.value;
    if(t.dataset.env==="placeType"){state.placeType=t.value;track("location_selected",{place_type:t.value});}
    if(["minC","maxC"].includes(t.dataset.env)){state.weather[t.dataset.env]=t.value===""?null:Number(t.value);state.weather.status=(state.weather.minC!==null&&state.weather.maxC!==null)?"known":"unknown";}
  }
  if(t.dataset.measure){state.measurements[t.dataset.measure]=t.value===""?null:Number(t.value);}
  if(t.dataset.device){state.devices=t.checked?[...new Set([...state.devices,t.dataset.device])]:state.devices.filter(x=>x!==t.dataset.device);}
  save();
});
$("#startBtn").addEventListener("click",start);
resetTop.addEventListener("click",reset);
$("#analyticsOpt").addEventListener("click",()=>{
  analyticsEnabled=!analyticsEnabled;
  localStorage.setItem("sotojitaku_analytics_optout",analyticsEnabled?"0":"1");
  alert(analyticsEnabled?"アクセス計測を有効にしました。":"アクセス計測を無効にしました。");
});
loadSaved();
loadData().then(()=>{
  if(presetVehicle&&db.vehicles.some(v=>v.vehicleId===presetVehicle)){
    state.vehicleId=presetVehicle;
    state.config={};
    state.step=0;
    save();
    track("seo_builder_entry",{vehicle_id:presetVehicle});
    showBuilder();
  }else if(state.vehicleId||state.step>0){
    showBuilder();
  }else{
    setCabin();
  }
}).catch(()=>{
  hero.hidden=true;builder.hidden=false;panel.innerHTML="<div class='fatal'><b>読み込みに失敗しました。</b><p>ページを再読み込みしてください。</p></div>";
});
