const DATA_ROOT=new URL("./data/",import.meta.url);
const MAX_AGE_MS=7*86400000;
const esc=value=>String(value??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const yen=value=>new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(value);

function canonicalRakuten(value){
  try{
    let u=new URL(value);
    if(u.hostname==="hb.afl.rakuten.co.jp"){
      const pc=u.searchParams.get("pc");
      if(!pc)return "";
      u=new URL(pc);
    }
    if(u.protocol!=="https:"||u.hostname!=="item.rakuten.co.jp")return "";
    return u.origin+u.pathname.replace(/\/+$/,"")+"/";
  }catch{return "";}
}
function affiliateSafe(product){
  try{
    const u=new URL(product.affiliateUrl||"");
    return u.protocol==="https:"&&u.hostname==="hb.afl.rakuten.co.jp"&&canonicalRakuten(product.affiliateUrl)===canonicalRakuten(product.itemUrl);
  }catch{return false;}
}
function fresh(product,now=Date.now()){
  const ts=Date.parse(product.verifiedAt||"");
  return Number.isFinite(ts)&&now>=ts&&now-ts<=MAX_AGE_MS;
}
function coversAll(restricted,all){
  if(!restricted?.length)return true;
  if(!all?.length)return false;
  const set=new Set(restricted.map(String));
  return all.every(x=>set.has(String(x)));
}
function universalFit(fit,vehicle){
  if(!fit||fit.status!=="verified")return false;
  const config=vehicle.config||{};
  if(!coversAll(fit.seatCounts,config.seatCounts))return false;
  if(!coversAll(fit.trims,config.trims))return false;
  if(fit.exclusions?.length){
    const possible=[...(config.trims||[]),...(config.seatCounts||[]).map(String)];
    if(possible.some(x=>fit.exclusions.includes(x)))return false;
    if(!config.trims?.length&&!config.seatCounts?.length)return false;
  }
  return true;
}
function eligible(product,{vehicle,gapId,now}){
  if(product.audit?.status!=="verified_live"||!fresh(product,now))return false;
  if(!product.gapIds?.includes(gapId))return false;
  if(product.recommendationRole==="frequent_user_upgrade")return false;
  if(!Number.isFinite(product.price)||product.price<=0||!affiliateSafe(product))return false;
  if(typeof product.image!=="string"||!product.image.startsWith("https://"))return false;
  return product.vehicleFit?.some(f=>f.vehicleId===vehicle.vehicleId&&universalFit(f,vehicle));
}
function rank(products){
  const roles={beginner_default:3,beginner_alternative:2};
  return products.sort((a,b)=>(roles[b.recommendationRole]||0)-(roles[a.recommendationRole]||0)||(b.score||0)-(a.score||0)).slice(0,3);
}
function track(name,params={}){
  if(typeof window.gtag!=="function")return;
  window.gtag("event",name,{site_id:"sotojitaku_car_stay_seo",conversion_source:"car_stay_seo_direct",...params});
}
function productCard(p,index){
  return '<article class="seo-product-card">'+
    '<img src="'+esc(p.image)+'" alt="" loading="lazy">'+
    '<div class="seo-product-copy">'+
      '<div class="seo-product-badges"><span>PR</span><b>適合・販売確認済み</b></div>'+
      '<h3>'+esc(p.name)+'</h3>'+
      '<div class="seo-product-price"><strong>'+yen(p.price)+'</strong><small>確認 '+esc((p.verifiedAt||"").slice(0,10))+'</small></div>'+
      '<a class="seo-product-cta" href="'+esc(p.affiliateUrl)+'" target="_blank" rel="nofollow sponsored noopener" data-direct-product="'+esc(p.productId)+'" data-rank="'+(index+1)+'">楽天で見る <span>→</span></a>'+
    '</div></article>';
}
function render(slot,products){
  slot.hidden=false;
  const vehicle=slot.dataset.vehicle||"";
  const gap=slot.dataset.gap||"";
  slot.innerHTML=
    '<div class="seo-product-head">'+
      '<p class="eyebrow">LIVE AUDITED · PR</p>'+
      '<h2>現在、適合まで確認できている候補</h2>'+
      '<p>このページの車種で<strong>選択仕様をまたいで適合を確認できる商品だけ</strong>を表示します。仕様ごとに適合が分かれる商品はここでは出さず、Builderで絞ります。価格・販売状態・楽天リンクは7日以内の監査データです。</p>'+
    '</div>'+
    '<div class="seo-product-grid">'+products.map(productCard).join("")+'</div>'+
    '<p class="seo-product-note">商品を買っても暑さ・宿泊場所などの安全判定は変わりません。初泊全体の確認はBuilderで行えます。</p>';
  products.forEach((p,index)=>track("seo_product_view",{product_id:p.productId,vehicle_id:vehicle,gap_id:gap,product_rank:index+1,price:p.price||0}));
  slot.addEventListener("click",event=>{
    const link=event.target.closest("[data-direct-product]");
    if(!link)return;
    const product=products.find(p=>p.productId===link.dataset.directProduct);
    track("affiliate_click",{product_id:link.dataset.directProduct,vehicle_id:vehicle,gap_id:gap,product_rank:Number(link.dataset.rank)||0,price:product?.price||0});
  });
}
async function init(){
  const slots=[...document.querySelectorAll("[data-seo-products]")];
  if(!slots.length)return;
  try{
    const [productResponse,vehicleResponse]=await Promise.all([
      fetch(new URL("audited-products.json",DATA_ROOT),{cache:"no-store"}),
      fetch(new URL("vehicles.json",DATA_ROOT),{cache:"no-store"})
    ]);
    if(!productResponse.ok||!vehicleResponse.ok)return;
    const catalog=await productResponse.json();
    const vehicleData=await vehicleResponse.json();
    const vehicles=vehicleData.vehicles||[];
    const now=Date.now();
    for(const slot of slots){
      const vehicle=vehicles.find(v=>v.vehicleId===slot.dataset.vehicle);
      if(!vehicle)continue;
      const products=rank((catalog.products||[]).filter(p=>eligible(p,{vehicle,gapId:slot.dataset.gap,now})));
      if(products.length)render(slot,products);
    }
  }catch{
    // Fail closed: SEO article remains useful without shopping UI.
  }
}
init();
