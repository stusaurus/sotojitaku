import {selectPlan,buildGearChecklist,evaluateReadiness,resultHeadline} from "./engine.js";
import {buildProductRecommendations,applyProductCoverage} from "./products.js";

const $=s=>document.querySelector(s);
const hero=$("#hero"),planner=$("#planner"),panel=$("#panel"),progress=$("#progressBar");
const resetBtn=$("#resetBtn"),savedBtn=$("#savedBtn"),stepText=$("#stepText"),miniPlan=$("#miniPlan"),visualMessage=$("#visualMessage"),visualTags=$("#visualTags");
const progressText=$("#progressText"),progressLine=$("#progressLine");
const DRAFT_KEY="sotojitakuFishingDraft";

let questionsData,plansData,gearData,howtoData,catalog;
let index=0;
let answers={owned:[]};
let localRulesConfirmed=false;
let currentResultKey="";
const viewedProducts=new Set();

const labels={party:"だれと",fun:"楽しみ方",bait:"エサ",take_home:"持ち帰り",carry:"荷物",budget:"予算",owned:"手持ち"};

function readSharedPlanHash(){
  try{
    if(!location.hash.startsWith("#plan="))return null;
    const payload=JSON.parse(decodeURIComponent(location.hash.slice(6)));
    if(payload?.v!==1||!payload?.a||typeof payload.a!=="object")return null;
    return payload.a;
  }catch{return null}
}

function normalizePlanAnswers(candidate){
  if(!candidate||!questionsData)return null;
  const normalized={owned:[]};
  for(const q of questionsData.questions){
    const allowed=new Set(q.options.map(o=>o.value));
    if(q.type==="multi"){
      normalized[q.id]=Array.isArray(candidate[q.id])
        ?[...new Set(candidate[q.id].filter(v=>allowed.has(v)))]
        :[];
      continue;
    }
    if(!allowed.has(candidate[q.id]))return null;
    normalized[q.id]=candidate[q.id];
  }
  if(candidate.child_fit&&["m_all","l_all","unknown_mixed"].includes(candidate.child_fit)){
    normalized.child_fit=candidate.child_fit;
  }
  return normalized;
}

function sharePlanUrl(){
  const payload={v:1,a:{...answers,owned:[...(answers.owned||[])]}};
  return location.origin+location.pathname+"#plan="+encodeURIComponent(JSON.stringify(payload));
}

function copyTextFallback(value){
  const input=document.createElement("textarea");
  input.value=value;
  input.setAttribute("readonly","");
  input.style.position="fixed";
  input.style.opacity="0";
  document.body.appendChild(input);
  input.select();
  const ok=document.execCommand?.("copy")===true;
  input.remove();
  return ok;
}

async function shareCurrentPlan(){
  const url=sharePlanUrl();
  const plan=selectPlan(answers,plansData);
  const label=plan?.variant?.name||plan?.methodName||"最初の一匹プラン";
  try{
    if(typeof navigator.share==="function"){
      await navigator.share({
        title:"SOTOJITAKU FISHING",
        text:"私の最初の一匹プラン："+label,
        url
      });
      track("fishing_plan_share",{share_method:"native",fishing_method:plan?.methodId||""});
      return "native";
    }
  }catch(err){
    if(err?.name==="AbortError")return "cancelled";
  }
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(url);
      track("fishing_plan_share",{share_method:"clipboard",fishing_method:plan?.methodId||""});
      return "clipboard";
    }
  }catch{}
  if(copyTextFallback(url)){
    track("fishing_plan_share",{share_method:"fallback_copy",fishing_method:plan?.methodId||""});
    return "fallback_copy";
  }
  return "failed";
}

function clearSharedPlanHash(){
  if(location.hash.startsWith("#plan=")){
    history.replaceState(null,"",location.pathname+location.search);
  }
}

function readEntryAttribution(){
  if(location.hash.startsWith("#plan=")){
    return {entry_source:"share",entry_guide_slug:""};
  }
  const key="sotojitakuFishingEntry";
  try{
    const raw=sessionStorage.getItem(key);
    if(raw){
      const saved=JSON.parse(raw);
      const age=Date.now()-Number(saved?.at||0);
      if(saved?.source==="guide"&&saved?.guide_slug&&age>=0&&age<=86400000){
        return {entry_source:"guide",entry_guide_slug:String(saved.guide_slug).slice(0,80)};
      }
      sessionStorage.removeItem(key);
    }
  }catch{}
  try{
    const ref=new URL(document.referrer);
    if(ref.origin===location.origin&&ref.pathname.includes("/fishing/guides/")){
      const parts=ref.pathname.split("/").filter(Boolean);
      const i=parts.indexOf("guides");
      const slug=i>=0?(parts[i+1]||"hub"):"hub";
      return {entry_source:"guide",entry_guide_slug:slug};
    }
  }catch{}
  return {entry_source:"direct",entry_guide_slug:""};
}
const entryAttribution=readEntryAttribution();
const track=(name,params={})=>{try{window.gtag?.("event",name,{conversion_source:"fishing",...entryAttribution,...params})}catch{}};

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

function readDraft(){
  try{
    const raw=localStorage.getItem(DRAFT_KEY);
    if(!raw)return null;
    const draft=JSON.parse(raw);
    if(!draft||draft.version!==1||!draft.answers||!Number.isInteger(draft.index))return null;
    return draft;
  }catch{return null}
}
function persistDraft(){
  try{
    localStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,index,answers,at:new Date().toISOString()}));
  }catch{}
  refreshSavedButton();
}
function clearDraft(){
  try{localStorage.removeItem(DRAFT_KEY)}catch{}
}
function start(){
  clearSharedPlanHash();
  hero.hidden=true;planner.hidden=false;resetBtn.hidden=false;
  index=0;answers={owned:[]};localRulesConfirmed=false;currentResultKey="";viewedProducts.clear();
  persistDraft();
  track("fishing_diagnosis_start");
  renderQuestion();
  scrollTo({top:0,behavior:"smooth"});
}
function resumeDraft(){
  const draft=readDraft();
  if(!draft)return openSavedPlan();
  answers={...draft.answers,owned:[...(draft.answers.owned||[])]};
  index=Math.max(0,Math.min(draft.index,questionsData.questions.length-1));
  hero.hidden=true;planner.hidden=false;resetBtn.hidden=false;
  localRulesConfirmed=false;currentResultKey="";viewedProducts.clear();
  track("fishing_diagnosis_resume",{question_index:index+1});
  renderQuestion();
  scrollTo({top:0,behavior:"smooth"});
}
function reset(){
  clearSharedPlanHash();clearDraft();
  hero.hidden=false;planner.hidden=true;resetBtn.hidden=true;
  index=0;answers={owned:[]};localRulesConfirmed=false;currentResultKey="";
  refreshSavedButton();
  scrollTo({top:0,behavior:"smooth"});
}

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
  const captions=[
    ["まだ何もない。","ここから、最初の一匹がはじまる。"],
    ["だれと行くかで、","釣りの一日も変わります。"],
    ["やってみたい時間を、","少しずつ形に。"],
    ["エサも、無理のないものから。","初めてでも扱いやすく。"],
    ["持ち帰るかどうかで、","必要な道具を整えます。"],
    ["荷物は、できるだけ軽く。","必要なものだけを。"],
    ["全部買わなくて大丈夫。","手持ちを活かして仕上げます。"]
  ];
  const preview=selectPlan(answers,plansData);
  miniPlan.textContent=preview&&index>=1?preview.methodName+"が近そう":"BUILD YOUR FISHING";
  const caption=captions[index]||captions[captions.length-1];
  visualMessage.innerHTML=escapeHtml(caption[0])+"<br>"+escapeHtml(caption[1]);
}
function renderQuestion(){
  const questions=questionsData.questions;
  const q=questions[index];
  const stepLabel=String(index+1).padStart(2,"0")+" / "+String(questions.length).padStart(2,"0");
  stepText.textContent=stepLabel;
  if(progressText)progressText.textContent=stepLabel;
  progress.style.width=((index+1)/questions.length*100)+"%";
  if(progressLine)progressLine.innerHTML=questions.map((_,i)=>'<i class="'+(i<=index?"active":"")+'"></i>').join("");
  updateVisual();
  const isMulti=q.type==="multi";
  const selected=isMulti?(answers[q.id]||[]):answers[q.id];
  panel.innerHTML=`
    <p class="kicker">QUESTION ${String(index+1).padStart(2,"0")} · ${labels[q.id]||""}</p>
    <h2>${escapeHtml(q.label)}</h2>
    <p class="desc">${isMulti?"持っているものは全部選んでください。何もなければ、そのまま進めます。":"専門用語はありません。いちばん近いものを選んでください。"}</p>
    ${isMulti?'<p class="multi-note">複数選択できます</p>':""}
    <div class="choice-grid ${isMulti?"choice-grid-multi":""}">
      ${q.options.map(o=>{
        const on=isMulti?selected.includes(o.value):selected===o.value;
        return `<button class="choice ${on?"selected":""}" data-value="${o.value}" type="button" aria-pressed="${on}"><span>${escapeHtml(o.label)}</span><span class="checkmark" aria-hidden="true">${on?"✓":""}</span></button>`
      }).join("")}
    </div>
    <div class="actions">
      <button class="primary" id="nextBtn" type="button">${index===questions.length-1?"プランを見る":"次へ →"}</button>
    </div>
    <button class="question-back" id="backBtn" type="button">← ${index?"ひとつ戻る":"ホームへ"}</button>
    <p class="draft-note">選んだ内容は、このブラウザに保存されます。</p>
  `;
  panel.querySelectorAll(".choice").forEach(btn=>btn.addEventListener("click",()=>{
    const v=btn.dataset.value;
    if(isMulti){
      const set=new Set(answers[q.id]||[]);
      const removing=set.has(v);
      removing?set.delete(v):set.add(v);
      answers[q.id]=[...set];
      if(q.id==="owned")track("fishing_owned_item_toggle",{gear_category:v,toggle_action:removing?"remove":"add"});
    }else{
      answers[q.id]=v;
      if(q.id==="party"&&v!=="family_child")delete answers.child_fit;
    }
    track("fishing_question_answer",{question_id:q.id,answer_value:v});
    persistDraft();
    renderQuestion();
  }));
  $("#backBtn")?.addEventListener("click",()=>{
    if(index===0){reset();return}
    index--;persistDraft();renderQuestion();
  });
  $("#nextBtn").addEventListener("click",()=>{
    if(!isMulti&&!answers[q.id]){
      panel.querySelector(".desc").textContent="1つ選んでから進んでください。";
      return;
    }
    if(index<questions.length-1){index++;persistDraft();renderQuestion()}
    else{persistDraft();renderResult()}
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
        ${renderBudgetSwitch(plan,rawChecklist,productResult)}
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
        <button id="shareBtn" class="share" type="button">同行者に共有</button>
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
      optional_product_count:basket.optionalCount,
      displayed_total:basket.total,
      budget_tier:answers.budget,
      party_type:answers.party
    });
    currentResultKey=resultKey;
  }
  $("#rulesCheck").addEventListener("change",e=>{localRulesConfirmed=e.target.checked;renderResult({trackDiagnosis:false})});
  panel.querySelectorAll("[data-child-fit]").forEach(btn=>btn.addEventListener("click",e=>{
    const fit=e.currentTarget.dataset.childFit;
    if(!["m_all","l_all","unknown_mixed"].includes(fit))return;
    answers.child_fit=fit;
    currentResultKey=JSON.stringify(answers);
    track("fishing_child_pfd_fit_select",{
      fit_choice:fit,
      party_type:answers.party
    });
    renderResult({trackDiagnosis:false});
  }));
  $("#budgetSwitchBtn")?.addEventListener("click",e=>{
    const from=answers.budget;
    const to=e.currentTarget.dataset.nextBudget;
    if(!to||to===from)return;
    answers.budget=to;
    track("fishing_budget_switch",{
      fishing_method:plan.methodId,
      from_budget:from,
      to_budget:to,
      ...entryAttribution
    });
    renderResult({trackDiagnosis:false});
  });
  $("#saveBtn").addEventListener("click",()=>{
    try{
      localStorage.setItem("sotojitakuFishingPlan",JSON.stringify({version:1,answers,at:new Date().toISOString()}));
      clearDraft();
      $("#saveBtn").textContent="保存しました";
      savedBtn.hidden=false;
      track("fishing_plan_saved",{fishing_method:plan.methodId,plan_id:plan.methodId+"-"+plan.variantKey});
    }catch{}
  });
  $("#shareBtn").addEventListener("click",async()=>{
    const method=await shareCurrentPlan();
    const btn=$("#shareBtn");
    if(!btn)return;
    if(method==="clipboard"||method==="fallback_copy")btn.textContent="共有リンクをコピーしました";
    else if(method==="failed")btn.textContent="共有リンクを作れませんでした";
  });
  $("#againBtn").addEventListener("click",()=>{clearSharedPlanHash();index=0;currentResultKey="";renderQuestion()});
  trackProductViews(productResult.selected,plan,rawChecklist);
  bindAffiliateClicks();
}

function renderChildPfdSafety(){
  if(answers.party!=="family_child")return "";
  if((answers.owned||[]).includes("life_jacket_child")){
    return `<div class="child-fit-note"><strong>子ども用ライフジャケットは「持っている」を選択済みです。</strong><br>出発前に、子ども全員が体格に合うサイズを着用できるか、股ベルト・バックルを含めて再確認してください。</div>`;
  }
  const fit=answers.child_fit||"";
  const choices=[
    {
      value:"m_all",
      title:"子ども全員が M の範囲",
      detail:"体重15〜25kg未満 ＋ 身長100〜120cm"
    },
    {
      value:"l_all",
      title:"子ども全員が L の範囲",
      detail:"体重25〜40kg未満 ＋ 身長120〜150cm"
    },
    {
      value:"unknown_mixed",
      title:"子どもごとに違う／範囲外／わからない",
      detail:"商品は自動選択せず、個別にサイズ確認"
    }
  ];
  return `<div class="child-fit-note">
    <strong>子ども用ライフジャケットは、体重と身長の両方で確認します。</strong>
    <p>SHIMANO VF-098Vの公式目安に合わせ、全員が同じ範囲に入る場合だけ商品を自動推薦します。境界・範囲外・複数サイズが必要な場合は自動推薦しません。</p>
    <div class="child-fit-options">
      ${choices.map(choice=>`<button type="button" class="child-fit-choice ${fit===choice.value?"selected":""}" data-child-fit="${choice.value}"><b>${choice.title}</b><span>${choice.detail}</span></button>`).join("")}
    </div>
    ${fit==="unknown_mixed"
      ?'<p class="child-fit-warning">この条件では安全のため特定商品を出しません。子どもごとにメーカーサイズ表を確認し、可能なら試着してください。</p>'
      :fit
        ?'<p class="child-fit-confirmed">選んだ体格範囲に合う販売確認済み商品だけを、下の必須品に追加します。</p>'
        :'<p class="child-fit-warning">体格を選ぶまで、子ども用ライフジャケットの商品は表示しません。</p>'}
    <a class="child-fit-link" href="https://fish.shimano.com/ja-JP/product/wear_footwear/lifevest_vest/floatingvestsolidtype/a155f00000cb4xzqar.html" target="_blank" rel="noopener">SHIMANO公式サイズ表を確認 ↗</a>
  </div>`;
}

function requiredGapCoverCount(product,checklist){
  const byId=new Map((checklist||[]).map(x=>[x.id,x]));
  return (product.effectiveCoverCategoryIds||product.coverCategoryIds||[product.categoryId]).filter(id=>{
    const item=byId.get(id);
    return item?.monetizable&&item.priority==="required"&&item.state!=="owned";
  }).length;
}

function productCoversRequiredGap(product,checklist){
  return requiredGapCoverCount(product,checklist)>0;
}

function renderProductCards(products,neededIds,checklist,{optional=false}={}){
  return `<div class="product-list">${products.map((p,index)=>{
    const gapCount=requiredGapCoverCount(p,checklist);
    const featured=!optional&&gapCount>=3;
    return `
    <article class="product-card ${optional?"product-card-optional":""} ${featured?"product-card-featured":""}">
      <img src="${escapeAttr(p.image)}" alt="" loading="lazy">
      <div class="product-copy">
        ${featured?`<div class="bundle-badge">最短で揃える <b>必須${gapCount}項目</b></div>`:""}
        <div class="product-label">${optional?"あると快適":productLabel(p,neededIds)}</div>
        <h3>${escapeHtml(cleanName(p.name))}</h3>
        <div class="product-meta"><strong>¥${Number(p.price).toLocaleString("ja-JP")}</strong><span>販売確認済み</span></div>
        ${renderQuantityNote(p)}
        ${renderCoverage(p,checklist)}
        <a class="buy ${featured?"buy-featured":""}" href="${escapeAttr(p.affiliateUrl)}" target="_blank" rel="sponsored noopener" data-product="${escapeAttr(p.productId)}" data-category="${escapeAttr(p.categoryId)}" data-price="${Number(p.price)||0}" data-role="${escapeAttr(p.recommendationRole||"")}" data-priority="${optional?"optional":"required"}" data-position="${index+1}" data-cover-count="${gapCount}">${featured?"このセットを楽天で見る":"楽天で価格・在庫を見る"} →</a>
      </div>
    </article>`}).join("")}</div>`;
}

function renderProducts(productResult,checklist){
  const neededIds=new Set(checklist.filter(x=>x.monetizable&&x.state!=="owned"&&x.state!=="covered_by_product").map(x=>x.id));
  const requiredGaps=checklist.filter(x=>x.monetizable&&x.priority==="required"&&x.state!=="owned");
  const nonShoppingRequiredGaps=checklist.filter(x=>!x.monetizable&&x.priority==="required"&&x.state!=="owned");
  const selected=productResult.selected||[];
  const requiredProducts=selected.filter(p=>productCoversRequiredGap(p,checklist));
  const optionalProducts=selected.filter(p=>!productCoversRequiredGap(p,checklist));

  if(!requiredGaps.length){
    const stillNeeded=nonShoppingRequiredGaps.length
      ?`<div class="purchase-complete purchase-complete-attention"><strong>楽天で選ぶ必須品はありません。</strong><p>ただし、上の「いまの支度」に未準備の持参品・安全装備が残っています。特にサイズ確認が必要な安全装備は、自動で商品を選ばず現地条件と体格に合うものを準備してください。</p></div>`
      :`<div class="purchase-complete"><strong>必須の買い足しはありません。</strong><p>選んだ手持ち品で、必要な道具は揃っています。</p></div>`;
    return `${stillNeeded}${
      optionalProducts.length?`<details class="optional-products"><summary>余裕があれば追加 <span>${optionalProducts.length}点</span></summary>${renderProductCards(optionalProducts,neededIds,checklist,{optional:true})}</details>`:""
    }`;
  }

  if(!requiredProducts.length){
    return `<div class="empty-products">販売状況を確認できた商品だけを表示します。現在、必須品に合う確認済み商品がありません。未確認の商品を無理に出すことはしません。</div>`;
  }

  return `<div class="purchase-group">
    <div class="purchase-group-head"><div><span>まず揃える</span><strong>必須品だけを先に</strong></div><b>${requiredProducts.length}点</b></div>
    ${renderProductCards(requiredProducts,neededIds,checklist)}
  </div>${
    optionalProducts.length?`<details class="optional-products"><summary>余裕があれば追加 <span>${optionalProducts.length}点</span></summary>${renderProductCards(optionalProducts,neededIds,checklist,{optional:true})}</details>`:""
  }`;
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

function budgetLabel(tier){
  return {
    low:"まずは安く始めたい",
    balanced:"価格と使いやすさのバランス",
    long_term:"長く使えるものを選びたい"
  }[tier]||"今の予算感";
}

function budgetSwitchConfig(tier){
  if(tier==="low")return {
    next:"balanced",
    note:"低予算向けの商品で、必要品全体を組んでいます。",
    cta:"使いやすさも重視する構成を見る"
  };
  if(tier==="long_term")return {
    next:"balanced",
    note:"長く使う前提の候補を優先して、必要品全体を組んでいます。",
    cta:"価格とのバランス構成を見る"
  };
  return {
    next:"low",
    note:"価格と使いやすさの両方を見ながら、必要品全体を組んでいます。",
    cta:"もっと安く始める構成を見る"
  };
}

function productSelectionSignature(result){
  return (result?.selected||[]).map(p=>p.productId).filter(Boolean).sort().join("|");
}

function renderBudgetSwitch(plan,checklist,currentResult){
  const config=budgetSwitchConfig(answers.budget);
  const alternateInput={...answers,budget:config.next};
  const alternateResult=buildProductRecommendations(catalog.products||[],{
    input:alternateInput,
    plan,
    checklist,
    now:Date.now()
  });
  const sameProducts=productSelectionSignature(currentResult)===productSelectionSignature(alternateResult);
  if(sameProducts){
    return `<div class="budget-switch budget-switch-static">
      <div class="budget-switch-copy">
        <span>いまの買い方</span>
        <strong>${escapeHtml(budgetLabel(answers.budget))}</strong>
        <p>${escapeHtml(config.note)}</p>
      </div>
      <span class="budget-switch-status">別予算でも、現在の確認済み商品では同じ構成が最適です</span>
    </div>`;
  }

  const alternateBasket=basketSummary(checklist,alternateResult.selected);
  const alternateTotal=alternateBasket.count
    ?`¥${alternateBasket.total.toLocaleString("ja-JP")}目安`
    :"買い足しなし";
  return `<div class="budget-switch">
    <div class="budget-switch-copy">
      <span>いまの買い方</span>
      <strong>${escapeHtml(budgetLabel(answers.budget))}</strong>
      <p>${escapeHtml(config.note)}</p>
    </div>
    <button id="budgetSwitchBtn" type="button" data-next-budget="${escapeAttr(config.next)}">
      <span>${escapeHtml(config.cta)} →</span>
      <b>${escapeHtml(alternateTotal)}</b>
    </button>
  </div>`;
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

function trackProductViews(products,plan,checklist){
  let requiredPosition=0;
  let optionalPosition=0;
  for(const p of products||[]){
    const priority=productCoversRequiredGap(p,checklist)?"required":"optional";
    const position=priority==="required"?++requiredPosition:++optionalPosition;
    const key=plan.methodId+":"+p.productId+":"+priority;
    if(viewedProducts.has(key))continue;
    viewedProducts.add(key);
    track("fishing_product_view",{
      product_id:p.productId,
      gear_category:p.categoryId,
      fishing_method:plan.methodId,
      price:Number(p.price)||0,
      recommendation_role:p.recommendationRole||"",
      purchase_priority:priority,
      basket_position:position,
      bundle_cover_count:requiredGapCoverCount(p,checklist)
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
      purchase_priority:a.dataset.priority||"",
      basket_position:Number(a.dataset.position)||0,
      bundle_cover_count:Number(a.dataset.coverCount)||0,
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
  const draft=readDraft();
  const saved=readSavedPlan();
  savedBtn.hidden=!draft&&!saved;
  if(!savedBtn.hidden)savedBtn.textContent=draft?"つづきから":"保存したプランを見る";
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
savedBtn.addEventListener("click",()=>readDraft()?resumeDraft():openSavedPlan());
resetBtn.addEventListener("click",reset);
load().then(()=>{
  refreshSavedButton();
  track("fishing_view");
  const shared=normalizePlanAnswers(readSharedPlanHash());
  if(shared){
    answers=shared;
    hero.hidden=true;
    planner.hidden=false;
    resetBtn.hidden=false;
    localRulesConfirmed=false;
    currentResultKey="";
    viewedProducts.clear();
    const plan=selectPlan(answers,plansData);
    track("fishing_shared_plan_open",{
      fishing_method:plan?.methodId||"",
      budget_tier:answers.budget,
      party_type:answers.party
    });
    renderResult({trackDiagnosis:false});
    scrollTo({top:0,behavior:"smooth"});
  }
}).catch(err=>{
  console.error(err);
  $("#startBtn").disabled=true;
  $("#startBtn").textContent="読み込みに失敗しました";
});
