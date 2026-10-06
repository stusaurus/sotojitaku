import {selectPlan,buildGearChecklist} from "../../engine.js";
import {buildProductRecommendations} from "../../products.js";

const target=document.querySelector("#liveBudget");
const updated=document.querySelector("#budgetUpdated");

const scenarios=[
  {
    label:"LOW",
    title:"まず安く・サビキ",
    note:"持ち帰らない",
    input:{party:"solo",fun:"easy_catch",bait:"okay",take_home:"no",carry:"compact",budget:"low",owned:[]}
  },
  {
    label:"BALANCED",
    title:"バランス・サビキ",
    note:"持ち帰る",
    input:{party:"solo",fun:"easy_catch",bait:"low_mess",take_home:"yes",carry:"compact",budget:"balanced",owned:[]}
  },
  {
    label:"LONG TERM",
    title:"長く使う・ちょい投げ",
    note:"持ち帰る・虫エサなし",
    input:{party:"solo",fun:"cast_wait",bait:"no_worm",take_home:"yes",carry:"compact",budget:"long_term",owned:[]}
  }
];

const money=n=>"¥"+Number(n||0).toLocaleString("ja-JP");

async function load(){
  const [plans,gear,catalog]=await Promise.all([
    fetch("../../data/plans.json").then(r=>r.json()),
    fetch("../../data/gear.json").then(r=>r.json()),
    fetch("../../data/audited-products.json").then(r=>r.json())
  ]);

  const cards=scenarios.map(s=>{
    const plan=selectPlan(s.input,plans);
    const checklist=buildGearChecklist(s.input,plan,gear);
    const result=buildProductRecommendations(catalog.products||[],{
      input:s.input,plan,checklist,now:Date.now()
    });
    const requiredIds=new Set(checklist
      .filter(x=>x.monetizable&&x.priority==="required"&&x.state!=="owned")
      .map(x=>x.id));
    const products=[...new Map(result.selected
      .filter(p=>(p.effectiveCoverCategoryIds||p.coverCategoryIds||[p.categoryId]).some(id=>requiredIds.has(id)))
      .map(p=>[p.productId,p])).values()];
    const total=products.reduce((sum,p)=>sum+(Number(p.price)||0),0);
    return {...s,plan,products,total,unresolved:result.unresolvedRequiredCategoryIds||result.unresolvedCategoryIds||[]};
  });

  target.innerHTML=cards.map(card=>{
    const itemNames=card.products.slice(0,4).map(p=>clean(p.name)).join("・");
    const status=card.unresolved.length?"一部未解決":"現在の確認済み商品で成立";
    return `<section class="live-budget-card">
      <span class="live-budget-label">${escapeHtml(card.label)}</span>
      <h3>${escapeHtml(card.title)}</h3>
      <p class="live-budget-note">${escapeHtml(card.note)} · ${escapeHtml(card.plan.methodName)}</p>
      <strong class="live-budget-price">${money(card.total)}</strong>
      <p class="live-budget-status">${escapeHtml(status)} · ${card.products.length}商品</p>
      <p class="live-budget-items">${escapeHtml(itemNames)}</p>
    </section>`;
  }).join("");

  const at=Date.parse(catalog.updatedAt||"");
  if(Number.isFinite(at)){
    updated.textContent="商品確認データ更新："+new Intl.DateTimeFormat("ja-JP",{dateStyle:"medium",timeZone:"Asia/Tokyo"}).format(new Date(at));
  }
  window.gtag?.("event","fishing_budget_examples_view",{
    scenario_count:cards.length,
    conversion_source:"fishing_guide"
  });
}

function clean(value){return String(value||"").replace(/〖[^〗]*〗/g,"").replace(/\s+/g," ").trim().slice(0,42)}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

load().catch(()=>{
  target.innerHTML='<div class="live-budget-loading">現在の価格例を読み込めませんでした。診断では確認済み商品のみを表示します。</div>';
});