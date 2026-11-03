import {buildGearChecklist} from "../../engine.js";
import {productCoverageForInput} from "../../products.js";
import {starterScenario,requiredCoverageScore} from "./selection.js";

const target=document.querySelector("#starterSets");
const updated=document.querySelector("#starterUpdated");
const methodLabel={sabiki:"サビキ",choi_nage:"ちょい投げ"};

async function load(){
  const [gear,catalog]=await Promise.all([
    fetch("../../data/gear.json").then(r=>r.json()),
    fetch("../../data/audited-products.json").then(r=>r.json())
  ]);

  const now=Date.now();
  const sets=(catalog.products||[])
    .map(product=>({product,scenario:starterScenario(product,now)}))
    .filter(item=>item.scenario)
    .sort((a,b)=>{
      const ac=a.product.coverCategoryIds.length,bc=b.product.coverCategoryIds.length;
      return bc-ac||a.product.price-b.product.price;
    });

  if(!sets.length){
    target.innerHTML='<div class="live-budget-loading">現在、購入先と販売確認が有効な初心者セットはありません。診断で不足品を確認してください。</div>';
    return;
  }

  target.innerHTML=sets.map(({product,scenario})=>{
    const {method,input}=scenario;
    const checklist=buildGearChecklist(input,{methodId:method},gear);
    const byId=new Map(checklist.map(x=>[x.id,x]));
    const covered=productCoverageForInput(product,input);
    const included=covered.map(id=>byId.get(id)?.label).filter(Boolean);
    const required=checklist.filter(x=>x.priority==="required");
    const remaining=required.filter(x=>!covered.includes(x.id)).map(x=>x.label);
    const coverageScore=requiredCoverageScore(checklist,covered);

    return `<section class="starter-set-card">
      <div class="starter-set-top"><span>${escapeHtml(methodLabel[method]||method)}</span><strong>¥${Number(product.price).toLocaleString("ja-JP")}</strong></div>
      <h3>${escapeHtml(clean(product.name))}</h3>
      <div class="starter-meter" aria-label="必須カテゴリカバー率 ${coverageScore}%"><i style="width:${coverageScore}%"></i></div>
      <p class="starter-score">この例の必須カテゴリ ${coverageScore}% をカバー</p>
      <div class="starter-columns">
        <div><b>これで揃う</b>${chips(included,"good")}</div>
        <div><b>まだ必要</b>${chips(remaining,"need")}</div>
      </div>
      <a class="starter-buy" href="${escapeAttr(product.affiliateUrl)}" target="_blank" rel="sponsored noopener"
        data-product="${escapeAttr(product.productId)}" data-price="${Number(product.price)||0}">楽天で価格・在庫を見る →</a>
    </section>`;
  }).join("");

  const at=Date.parse(catalog.updatedAt||"");
  if(Number.isFinite(at)){
    updated.textContent="商品確認データ更新："+new Intl.DateTimeFormat("ja-JP",{dateStyle:"medium",timeZone:"Asia/Tokyo"}).format(new Date(at));
  }
  window.gtag?.("event","fishing_starter_set_compare_view",{set_count:sets.length,conversion_source:"fishing_guide"});

  target.querySelectorAll(".starter-buy").forEach(a=>a.addEventListener("click",()=>{
    const payload={product_id:a.dataset.product,price:Number(a.dataset.price)||0,guide_slug:"starter-set",conversion_source:"fishing_guide"};
    window.gtag?.("event","fishing_guide_product_click",payload);
    window.gtag?.("event","affiliate_click",payload);
  }));
}

function chips(items,kind){
  if(!items.length)return '<p class="starter-none">なし</p>';
  return '<div class="starter-chips">'+items.map(x=>`<span class="${kind}">${escapeHtml(x)}</span>`).join("")+'</div>';
}
function clean(v){return String(v||"").replace(/〖[^〗]*〗/g,"").replace(/\s+/g," ").trim().slice(0,90)}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function escapeAttr(v){return escapeHtml(v)}

load().catch(()=>{
  target.innerHTML='<div class="live-budget-loading">比較を読み込めませんでした。診断では確認済み商品のみを表示します。</div>';
});