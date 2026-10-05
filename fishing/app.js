import {selectPlan,buildGearChecklist,evaluateReadiness,resultHeadline} from "./engine.js";
import {buildProductRecommendations,applyProductCoverage} from "./products.js";

const $=s=>document.querySelector(s);
const hero=$("#hero"),planner=$("#planner"),panel=$("#panel"),progress=$("#progressBar");
const resetBtn=$("#resetBtn"),stepText=$("#stepText"),miniPlan=$("#miniPlan"),visualMessage=$("#visualMessage"),visualTags=$("#visualTags");

let questionsData,plansData,gearData,catalog;
let catalogSource="none";
const SHARED_CATALOG_URL="https://stusaurus.github.io/daily-cost-jp/shared/fishing-products.json";
let index=0;
let answers={owned:[]};
let localRulesConfirmed=false;

const labels={party:"だれと",fun:"楽しみ方",bait:"エサ",take_home:"持ち帰り",carry:"荷物",budget:"予算",owned:"手持ち"};
const track=(name,params={})=>{try{window.gtag?.("event",name,{conversion_source:"fishing",...params})}catch{}};

async function loadCatalog(){
  const sources=[
    {source:"shared",url:SHARED_CATALOG_URL},
    {source:"local",url:"./data/audited-products.json"},
  ];
  for(const entry of sources){
    try{
      const response=await fetch(entry.url,{cache:"no-store"});
      if(!response.ok)continue;
      const data=await response.json();
      if(Array.isArray(data?.products)&&data.products.length){
        catalogSource=entry.source;
        return data;
      }
    }catch{}
  }
  catalogSource="none";
  return {products:[],status:"unavailable"};
}

async function load(){
  const [q,p,g,c]=await Promise.all([
    fetch("./data/questions.json").then(r=>r.json()),
    fetch("./data/plans.json").then(r=>r.json()),
    fetch("./data/gear.json").then(r=>r.json()),
    loadCatalog()
  ]);
  questionsData=q;plansData=p;gearData=g;catalog=c;
  track("fishing_catalog_loaded",{catalog_source:catalogSource,product_count:c.products?.length||0});
}

function start(){
  hero.hidden=true;planner.hidden=false;resetBtn.hidden=false;
  index=0;answers={owned:[]};localRulesConfirmed=false;
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
      set.has(v)?set.delete(v):set.add(v);
      answers[q.id]=[...set];
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

function renderResult(){
  track("fishing_diagnosis_complete",{budget_tier:answers.budget,party_type:answers.party,bait_preference:answers.bait});
  const plan=selectPlan(answers,plansData);
  const rawChecklist=buildGearChecklist(answers,plan,gearData);
  const readiness=evaluateReadiness({input:answers,plan,gearData,context:{localRulesConfirmed}});
  const productResult=buildProductRecommendations(catalog.products||[],{input:answers,plan,checklist:rawChecklist,now:Date.now()});
  const checklist=applyProductCoverage(rawChecklist,productResult.selected);
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
          <div class="confirm-row">
            <input id="rulesCheck" type="checkbox" ${localRulesConfirmed?"checked":""}>
            <label for="rulesCheck">行く釣り場の公式ルールを確認した</label>
          </div>
        </div>
      </div>

      <div class="section">
        <h3 class="section-title">足りないものは、これで揃える</h3>
        ${renderProducts(productResult,rawChecklist)}
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
  track("fishing_plan_selected",{fishing_method:plan.methodId,plan_id:plan.methodId+"-"+plan.variantKey});
  $("#rulesCheck").addEventListener("change",e=>{localRulesConfirmed=e.target.checked;renderResult()});
  $("#saveBtn").addEventListener("click",()=>{
    localStorage.setItem("sotojitakuFishingPlan",JSON.stringify({answers,plan,at:new Date().toISOString()}));
    $("#saveBtn").textContent="保存しました";
  });
  $("#againBtn").addEventListener("click",()=>{index=0;renderQuestion()});
  bindAffiliateClicks();
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
        <div class="product-meta"><strong>¥${Number(p.price).toLocaleString("ja-JP")}</strong><span>確認済み</span></div>
        <a class="buy" href="${escapeAttr(p.affiliateUrl)}" target="_blank" rel="sponsored noopener" data-product="${escapeAttr(p.productId)}" data-category="${escapeAttr(p.categoryId)}">楽天で見る →</a>
      </div>
    </article>`).join("")}</div>`;
}

function productLabel(p,neededIds){
  const covers=(p.coverCategoryIds||[]).filter(x=>neededIds.has(x));
  if(covers.length>=3)return "まずはこれ · "+covers.length+"項目まとめて揃う";
  if(p.categoryId==="life_jacket_child")return "子どもの安全装備 · 子ども全員分を用意";
  if(p.categoryId==="life_jacket_adult")return "大人の安全装備 · 大人全員分を用意";
  return "この不足を埋める";
}

function bindAffiliateClicks(){
  panel.querySelectorAll(".buy").forEach(a=>a.addEventListener("click",()=>track("affiliate_click",{
    product_id:a.dataset.product,gear_category:a.dataset.category,fishing_method:selectPlan(answers,plansData)?.methodId
  })));
}
function stateLabel(s){return {owned:"持っている",needed:"必要",optional:"あると快適",covered_by_product:"セットで揃う"}[s]||s}
function cleanName(s){return String(s||"").replace(/〖[^〗]*〗/g,"").replace(/\s+/g," ").trim().slice(0,95)}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function escapeAttr(s){return escapeHtml(s)}

$("#startBtn").addEventListener("click",start);
resetBtn.addEventListener("click",reset);
load().then(()=>track("fishing_view")).catch(err=>{
  console.error(err);
  $("#startBtn").disabled=true;
  $("#startBtn").textContent="読み込みに失敗しました";
});
