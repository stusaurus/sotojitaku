import {selectPlan,buildGearChecklist,evaluateReadiness,resultHeadline} from "./engine.js";
import {buildProductRecommendations,applyProductCoverage} from "./products.js";

const $=s=>document.querySelector(s);
const hero=$("#hero"),planner=$("#planner"),panel=$("#panel"),progress=$("#progressBar");
const resetBtn=$("#resetBtn"),savedBtn=$("#savedBtn"),stepText=$("#stepText"),miniPlan=$("#miniPlan"),visualMessage=$("#visualMessage"),visualTags=$("#visualTags");

let questionsData,plansData,gearData,howtoData,catalog;
let index=0;
let answers={owned:[]};
let localRulesConfirmed=false;
let currentResultKey="";
const viewedProducts=new Set();

const labels={party:"だれと",fun:"楽しみ方",bait:"エサ",take_home:"持ち帰り",carry:"荷物",budget:"予算",owned:"手持ち"};
const track=(name,params={})=>{try{window.gtag?.("event",name,{conversion_source:"fishing",...params})}catch{}};

async function load(){
  const [q,p,g,h,c]=await Promise.all([
    fetch("./data/questions.json").then(r=>r.json()),
    fetch("./data/plans.json").then(r=>r.json()),
    fetch("./data/gear.json").then(r=>r.json()),
    fetch("./data/howto.json").then(r=>r.json()),
    fetch("./data/audited-products.json").then(r=>r.json()).catch(()=>({products:[]}))
  ]);
  questionsData=q;plansData=p;gearData=g;howtoData=h;catalog=c;
}

function start(){
  hero.hidden=true;planner.hidden=false;resetBtn.hidden=false;
  index=0;answers={owned:[]};localRulesConfirmed=false;currentResultKey="";viewedProducts.clear();
  track("fishing_diagnosis_start");
  renderQuestion();
  scrollTo({top:0,behavior:"smooth"});
}
function reset(){hero.hidden=false;planner.hidden=true;resetBtn.hidden=true;index=0;answers={owned:[]};localRulesConfirmed=false;scrollTo({top:0,behavior:"smooth"})}

function optionLabel(qid,value){
  const q=questionsData.questions.find(x=>x.id===qid);
  return q?.options.find(o=>o.value===value)?.label||value;
}
function updateVisual(){
  const tags=[];
  for(const q of questionsData.questions.slice(0,index+1)){
    const value=answers[q.id];
    if(Array.isArray(value)){if(value.length)tags.push("手持ち "+value.length+"点")}
    else if(value)tags.push(optionLabel(q.id,value));
  }
  visualTags.innerHTML=tags.slice(-5).map(t=>`<span>${escapeHtml(t)}</span>`).join("");
  const preview=selectPlan(answers,plansData);
  if(index>=1&&preview){
    miniPlan.textContent=preview.methodName+"が近そう";
    visualMessage.textContent=preview.headline;
  }else{
    miniPlan.textContent="まだ何も決めなくて大丈夫";
    visualMessage.textContent="答えるほど、あなたの最初の釣りが見えてきます。";
  }
}

function renderQuestion(){
  const questions=questionsData.questions;
  const q=questions[index];
  stepText.textContent=String(index+1).padStart(2,"0")+" / "+String(questions.length).padStart(2,"0");
  progress.style.width=((index+1)/questions.length*100)+"%";
  updateVisual();
  const isMulti=q.type==="multi";
  const selected=isMulti?(answers[q.id]||[]):answers[q.id];
  panel.innerHTML=`
    <p class="kicker">QUESTION ${String(index+1).padStart(2,"0")} · ${labels[q.id]||""}</p>
    <h2>${escapeHtml(q.label)}</h2>
    <p class="desc">${isMulti?"持っているものは全部選んでください。何もなければ、そのまま進めます。":"専門用語はありません。いちばん近いものを選んでください。"}</p>
    ${isMulti?'<p class="multi-note">複数選択できます</p>':""}
    <div class="choice-grid">
      ${q.options.map(o=>{
        const on=isMulti?selected.includes(o.value):selected===o.value;
        return `<button class="choice ${on?"selected":""}" data-value="${o.value}" type="button"><b>${escapeHtml(o.label)}</b></button>`
      }).join("")}
    </div>
    <div class="actions">
      ${index?'<button class="secondary" id="backBtn" type="button">← 戻る</button>':""}
      <button class="primary" id="nextBtn" type="button">${index===questions.length-1?"プランを見る":"次へ →"}</button>
    </div>
  `;
  panel.querySelectorAll(".choice").forEach(btn=>btn.addEventListener("click",()=>{
    const v=btn.dataset.value;
    if(isMulti){
      const set=new Set(answers[q.id]||[]);
      const removing=set.has(v);
      removing?set.delete(v):set.add(v);
      answers[q.id]=[...set];
      if(q.id==="owned")track("fishing_owned_item_toggle",{gear_category:v,toggle_action:removing?"remove":"add"});
    }else answers[q.id]=v;
    track("fishing_question_answer",{question_id:q.id,answer_value:v});
    renderQuestion();
  }));
  $("#backBtn")?.addEventListener("click",()=>{index--;renderQuestion()});
  $("#nextBtn").addEventListener("click",()=>{
    if(!isMulti&&!answers[q.id]){
      panel.querySelector(".desc").textContent="1つ選んでから進んでください。";
      return;
    }
    if(index<questions.length-1){index++;renderQuestion()}
    else renderResult();
  });
}

function renderResult({trackDiagnosis=true}={}){
  const resultKey=JSON.stringify(answers);
  const isNewResult=resultKey!==currentResultKey;
  if(trackDiagnosis&&isNewResult){
    track("fishing_diagnosis_complete",{budget_tier:answers.budget,party_type:answers.party,bait_preference:answers.bait});
  }
  const plan=selectPlan(answers,plansData);
  const rawChecklist=buildGearChecklist(answers,plan,gearData);
  const readiness=evaluateReadiness({input:answers,plan,gearData,context:{localRulesConfirmed}});
  const productResult=buildProductRecommendations(catalog.products||[],{input:answers,plan,checklist:rawChecklist,now:Date.now()});
  const checklist=applyProductCoverage(rawChecklist,productResult.selected);
  const basket=basketSummary(rawChecklist,productResult.selected);
  const methodLabel=plan.variant?.name||plan.methodName;
  stepText.textContent="YOUR FIRST PLAN";
  miniPlan.textContent=methodLabel;
  visualMessage.textContent="最初の一匹まで、必要なものだけ。";
  visualTags.innerHTML=[methodLabel,...plan.targets.slice(0,3)].map(t=>`<span>${escapeHtml(t)}</span>`).join("");

  panel.innerHTML=`
    <div class="result-wrap">
      <div class="result-hero">
        <span class="status">${readiness.status}</span>
        <h2>あなたの最初の一匹プラン。<br>${escapeHtml(methodLabel)}</h2>
        <p>${escapeHtml(plan.headline)} 難しい釣り方から始めず、今の条件で成立しやすい形を選びました。</p>
        <div class="target-tags">${plan.targets.map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div>
      </div>

      <div class="section">
        <h3 class="section-title">この釣りが、あなたに合う理由</h3>
        ${renderFitReasons(plan)}
      </div>

      <div class="section">
        <h3 class="section-title">いまの支度</h3>
        <div class="checklist">
          ${checklist.filter(x=>x.priority==="required").map(x=>`
            <div class="check"><b>${escapeHtml(x.label)}</b><span class="${x.state}">${stateLabel(x.state)}</span></div>
          `).join("")}
        </div>
      </div>

      <div class="section">
        <h3 class="section-title">出発前の安全確認</h3>
        <div class="safety-box">
          釣り禁止区域・利用時間・採捕ルール・足場・天候は場所ごとに違います。テトラ・磯・荒天・立入禁止場所は、この初心者プランの対象外です。
          ${renderChildPfdSafety()}
          <div class="confirm-row">
            <input id="rulesCheck" type="checkbox" ${localRulesConfirmed?"checked":""}>
            <label for="rulesCheck">行く釣り場の公式ルールを確認した</label>
          </div>
        </div>
      </div>

      <div class="section">
        <h3 class="section-title">足りないものは、これで揃える</h3>
        ${renderQuantityGuidance()}
        ${renderBasketSummary(basket)}
        ${renderProducts(productResult,rawChecklist)}
      </div>

      <div class="section">
        <h3 class="section-title">3分セットアップ</h3>
        ${renderFirstTripGuide(plan)}
      </div>

      <div class="section">
        <h3 class="section-title">判定</h3>
        <div class="safety-box"><strong>${escapeHtml(resultHeadline(readiness))}</strong><br>${readiness.status==="CHALLENGE"?"釣り場の公式ルールを確認するとREADY判定へ進めます。":"必要な装備を揃え、当日の天候を確認して出発してください。"}</div>
      </div>

      <div class="save-row">
        <button id="saveBtn" class="save" type="button">このプランを保存</button>
        <button id="againBtn" class="restart" type="button">条件を変える</button>
      </div>
    </div>
  `;
  progress.style.width="100%";
  if(trackDiagnosis&&isNewResult){
    const planId=plan.methodId+"-"+plan.variantKey;
    track("fishing_plan_selected",{fishing_method:plan.methodId,plan_id:planId});
    track("fishing_basket_view",{
      fishing_method:plan.methodId,
      plan_id:planId,
      product_count:basket.count,
      displayed_total:basket.total,
      budget_tier:answers.budget,
      party_type:answers.party
    });
    currentResultKey=resultKey;
  }
  $("#rulesCheck").addEventListener("change",e=>{localRulesConfirmed=e.target.checked;renderResult({trackDiagnosis:false})});
  $("#saveBtn").addEventListener("click",()=>{
    try{
      localStorage.setItem("sotojitakuFishingPlan",JSON.stringify({version:1,answers,at:new Date().toISOString()}));
      $("#saveBtn").textContent="保存しました";
      savedBtn.hidden=false;
      track("fishing_plan_saved",{fishing_method:plan.methodId,plan_id:plan.methodId+"-"+plan.variantKey});
    }catch{}
  });
  $("#againBtn").addEventListener("click",()=>{index=0;currentResultKey="";renderQuestion()});
  trackProductViews(productResult.selected,plan);
  bindAffiliateClicks();
}

function renderChildPfdSafety(){
  if(answers.party!=="family_child")return "";
  return `<div class="child-fit-note"><strong>子ども用ライフジャケットはサイズ確認が必要です。</strong><br>体格に合うサイズをメーカー表記で確認し、可能なら試着してください。この診断ではサイズが分からないまま特定商品をおすすめしません。</div>`;
}

function renderProducts(productResult,checklist){
  const neededIds=new Set(checklist.filter(x=>x.monetizable&&x.state!=="owned"&&x.state!=="covered_by_product").map(x=>x.id));
  const selected=productResult.selected||[];
  if(!selected.length){
    return `<div class="empty-products">販売状況を確認できた商品だけを表示します。現在、条件に合う確認済み商品がありません。未確認の商品を無理に出すことはしません。</div>`;
  }
  return `<div class="product-list">${selected.map(p=>`
    <article class="product-card">
      <img src="${escapeAttr(p.image)}" alt="" loading="lazy">
      <div class="product-copy">
        <div class="product-label">${productLabel(p,neededIds)}</div>
        <h3>${escapeHtml(cleanName(p.name))}</h3>
        <div class="product-meta"><strong>¥${Number(p.price).toLocaleString("ja-JP")}</strong><span>販売確認済み</span></div>
        ${renderQuantityNote(p)}
        ${renderCoverage(p,checklist)}
        <a class="buy" href="${escapeAttr(p.affiliateUrl)}" target="_blank" rel="sponsored noopener" data-product="${escapeAttr(p.productId)}" data-category="${escapeAttr(p.categoryId)}" data-price="${Number(p.price)||0}" data-role="${escapeAttr(p.recommendationRole||"")}">楽天で価格・在庫を見る →</a>
      </div>
    </article>`).join("")}</div>`;
}

function renderFitReasons(plan){
  const reasons=[];
  if(answers.party==="family_child")reasons.push("子どもと一緒でも、最初の動作をシンプルにしやすい");
  else if(answers.party==="solo")reasons.push("ひとりでも準備の手順を組み立てやすい");
  else reasons.push("同行者と役割を分けながら始めやすい");

  if(answers.fun==="easy_catch")reasons.push("まずは魚の反応を感じる体験を優先している");
  if(answers.fun==="cast_wait")reasons.push("投げる楽しさと、アタリを待つ時間を味わえる");
  if(answers.fun==="choose_for_me")reasons.push("専門用語を知らなくても成立しやすい入口を選んでいる");

  if(answers.bait==="no_worm")reasons.push(plan.methodId==="sabiki"?"虫エサを使わず始めやすい":"人工エサで虫エサを避けられる");
  if(answers.bait==="low_mess")reasons.push("におい・汚れを抑えやすい支度に寄せている");
  if(answers.carry==="compact")reasons.push("荷物を増やしすぎない構成にしている");

  return `<div class="reason-grid">${reasons.slice(0,3).map((reason,i)=>`
    <div class="reason-card"><span>0${i+1}</span><p>${escapeHtml(reason)}</p></div>
  `).join("")}</div>`;
}

function renderFirstTripGuide(plan){
  const guide=howtoData?.methods?.[plan.methodId];
  if(!guide)return "";
  const extra=answers.take_home!=="no"
    ?'<li>持ち帰るなら、クーラーボックスと保冷手段を出発前に準備する</li>'
    :"";
  return `<div class="first-trip-guide">
    <div class="setup-steps">
      ${guide.setup.map((step,i)=>`<div class="setup-step"><b>${i+1}</b><p>${escapeHtml(step)}</p></div>`).join("")}
    </div>
    <div class="dayof-card">
      <h4>当日の持ち出しチェック</h4>
      <ul>${guide.dayOf.map(item=>`<li>${escapeHtml(item)}</li>`).join("")}${extra}</ul>
      <p class="first-bite"><strong>反応がないとき：</strong>${escapeHtml(guide.firstBite)}</p>
    </div>
  </div>`;
}

function basketSummary(checklist,selected){
  const requiredIds=new Set((checklist||[])
    .filter(x=>x.monetizable&&x.priority==="required"&&x.state!=="owned")
    .map(x=>x.id));
  const requiredProducts=(selected||[]).filter(p=>
    (p.effectiveCoverCategoryIds||p.coverCategoryIds||[p.categoryId]).some(id=>requiredIds.has(id))
  );
  const unique=[...new Map(requiredProducts.map(p=>[p.productId,p])).values()];
  return {
    count:unique.length,
    total:unique.reduce((sum,p)=>sum+(Number(p.price)||0),0),
    optionalCount:Math.max(0,(selected||[]).length-unique.length)
  };
}

function renderQuantityGuidance(){
  const multi=answers.party!=="solo";
  const rodText=multi
    ?"竿・リールの商品は1セット＝1本分です。複数人が同時に竿を持つなら、実際に同時使用する本数分を用意してください。"
    :"竿・リールの商品は1セット＝1本分です。";
  const safetyText=answers.party==="family_child"
    ?" 大人用・子ども用ライフジャケットは、それぞれ同行者全員分が必要です。"
    :multi?" ライフジャケットは同行する大人全員分が必要です。":"";
  return `<div class="quantity-guidance"><strong>購入数量の考え方</strong><p>${escapeHtml(rodText+safetyText)}</p></div>`;
}

function renderBasketSummary(basket){
  if(!basket.count)return "";
  return `<div class="basket-summary">
    <div><span>必須の購入候補</span><strong>${basket.count}点</strong></div>
    <div><span>表示商品の1点ずつ合計</span><strong>¥${basket.total.toLocaleString("ja-JP")}</strong></div>
    <p>送料・ポイント・価格変動は楽天の商品ページで確認してください。ライフジャケットは同行者全員分が必要で、人数分の追加数量はこの合計に含めていません。${basket.optionalCount?" 「あると快適」な任意品もこの合計に含めていません。":""}</p>
  </div>`;
}

function renderQuantityNote(product){
  if(product.categoryId==="life_jacket_child"){
    return '<p class="product-quantity">数量：子どもの人数分を用意してください</p>';
  }
  if(product.categoryId==="life_jacket_adult"){
    if(answers.party==="solo")return '<p class="product-quantity">数量：大人1人分</p>';
    if(answers.party==="pair")return '<p class="product-quantity">数量：大人2人分を用意してください</p>';
    return '<p class="product-quantity">数量：大人の人数分を用意してください</p>';
  }
  return "";
}

function renderCoverage(product,checklist){
  const byId=new Map((checklist||[]).map(x=>[x.id,x]));
  const covers=(product.effectiveCoverCategoryIds||product.coverCategoryIds||[product.categoryId])
    .map(id=>byId.get(id))
    .filter(Boolean);
  const fills=covers.filter(x=>x.state!=="owned").map(x=>x.label);
  const overlaps=covers.filter(x=>x.state==="owned").map(x=>x.label);
  return `<div class="coverage-block">
    ${fills.length?`<div class="coverage-row"><span>これで揃う</span><div>${fills.map(x=>`<b>${escapeHtml(x)}</b>`).join("")}</div></div>`:""}
    ${overlaps.length?`<div class="coverage-row overlap"><span>手持ちと重複</span><div>${overlaps.map(x=>`<b>${escapeHtml(x)}</b>`).join("")}</div></div>`:""}
  </div>`;
}

function productLabel(p,neededIds){
  const covers=(p.effectiveCoverCategoryIds||p.coverCategoryIds||[]).filter(x=>neededIds.has(x));
  if(covers.length>=3)return "まずはこれ · "+covers.length+"項目まとめて揃う";
  if(p.categoryId==="life_jacket_child")return "子どもの安全装備 · 子ども全員分を用意";
  if(p.categoryId==="life_jacket_adult")return "大人の安全装備 · 大人全員分を用意";
  return "この不足を埋める";
}

function trackProductViews(products,plan){
  for(const p of products||[]){
    const key=plan.methodId+":"+p.productId;
    if(viewedProducts.has(key))continue;
    viewedProducts.add(key);
    track("fishing_product_view",{
      product_id:p.productId,
      gear_category:p.categoryId,
      fishing_method:plan.methodId,
      price:Number(p.price)||0,
      recommendation_role:p.recommendationRole||""
    });
  }
}
function bindAffiliateClicks(){
  panel.querySelectorAll(".buy").forEach(a=>a.addEventListener("click",()=>{
    const payload={
      product_id:a.dataset.product,
      gear_category:a.dataset.category,
      fishing_method:selectPlan(answers,plansData)?.methodId,
      price:Number(a.dataset.price)||0,
      recommendation_role:a.dataset.role||"",
      budget_tier:answers.budget,
      party_type:answers.party
    };
    track("fishing_product_select",payload);
    track("affiliate_click",payload);
  }));
}
function readSavedPlan(){
  try{
    const raw=localStorage.getItem("sotojitakuFishingPlan");
    if(!raw)return null;
    const saved=JSON.parse(raw);
    const a=saved?.answers;
    const required=["party","fun","bait","take_home","carry","budget"];
    if(!a||required.some(k=>typeof a[k]!=="string")||!Array.isArray(a.owned))return null;
    return saved;
  }catch{return null}
}

function refreshSavedButton(){
  savedBtn.hidden=!readSavedPlan();
}

function openSavedPlan(){
  const saved=readSavedPlan();
  if(!saved)return refreshSavedButton();
  answers={...saved.answers,owned:[...saved.answers.owned]};
  hero.hidden=true;
  planner.hidden=false;
  resetBtn.hidden=false;
  localRulesConfirmed=false;
  currentResultKey="";
  viewedProducts.clear();
  track("fishing_saved_plan_open",{saved_age_days:Math.max(0,Math.floor((Date.now()-Date.parse(saved.at||0))/86400000))||0});
  renderResult({trackDiagnosis:false});
  scrollTo({top:0,behavior:"smooth"});
}

function stateLabel(s){return {owned:"持っている",needed:"必要",optional:"あると快適",covered_by_product:"セットで揃う"}[s]||s}
function cleanName(s){return String(s||"").replace(/〖[^〗]*〗/g,"").replace(/\s+/g," ").trim().slice(0,95)}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function escapeAttr(s){return escapeHtml(s)}

$("#startBtn").addEventListener("click",start);
savedBtn.addEventListener("click",openSavedPlan);
resetBtn.addEventListener("click",reset);
load().then(()=>{refreshSavedButton();track("fishing_view")}).catch(err=>{
  console.error(err);
  $("#startBtn").disabled=true;
  $("#startBtn").textContent="読み込みに失敗しました";
});
