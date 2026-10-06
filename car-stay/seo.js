const GA_ID="G-GFVSZ8YDQ5";
const OPT_OUT_KEY="sotojitaku_analytics_optout";
const enabled=localStorage.getItem(OPT_OUT_KEY)!=="1";

function context(){
  const parts=location.pathname.split("/").filter(Boolean);
  const carIndex=parts.indexOf("car");
  if(carIndex<0)return {vehicle_slug:"unknown",intent_slug:"unknown"};
  const vehicle=parts[carIndex+1]||"hub";
  const intent=parts[carIndex+2]||"overview";
  return {vehicle_slug:vehicle,intent_slug:intent};
}

function entryFromHref(href){
  try{
    const u=new URL(href,location.href);
    return {
      entry_key:u.searchParams.get("entry")||"",
      vehicle_id:u.searchParams.get("vehicle")||"",
      destination:u.pathname
    };
  }catch{return {entry_key:"",vehicle_id:"",destination:""};}
}

if(enabled){
  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
  const script=document.createElement("script");
  script.async=true;
  script.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(GA_ID);
  document.head.appendChild(script);

  window.gtag("js",new Date());
  window.gtag("config",GA_ID,{send_page_view:false});
  const ctx=context();
  window.gtag("event","page_view",{
    site_id:"sotojitaku_car_stay_seo",
    page_location:location.href,
    page_path:location.pathname,
    vehicle_slug:ctx.vehicle_slug,
    intent_slug:ctx.intent_slug
  });

  document.addEventListener("click",event=>{
    const link=event.target.closest("a.cta");
    if(!link)return;
    const target=entryFromHref(link.href);
    window.gtag("event","seo_cta_click",{
      site_id:"sotojitaku_car_stay_seo",
      vehicle_slug:ctx.vehicle_slug,
      intent_slug:ctx.intent_slug,
      entry_key:target.entry_key,
      vehicle_id:target.vehicle_id,
      destination:target.destination
    });
  });
}


const SEO_VEHICLES={
  "n-box":["honda-nbox-jf5-jf6"],
  "sienta":["toyota-sienta-10-15"],
  "freed":["honda-freed-gt"],
  "hustler":["suzuki-hustler-mr52s-mr92s"],
  "n-van":["honda-nvan-jj1-jj2"],
  "every":["suzuki-every-da17v","suzuki-every-da18v"]
};
const SEO_GAPS={
  mat:["floor_step","sleep_surface"],
  shade:["privacy_full"]
};

function canonicalRakuten(value){
  try{
    let u=new URL(value);
    if(u.hostname==="hb.afl.rakuten.co.jp"){
      const pc=u.searchParams.get("pc"); if(!pc)return "";
      u=new URL(pc);
    }
    if(u.protocol!=="https:"||u.hostname!=="item.rakuten.co.jp")return "";
    return u.origin+u.pathname.replace(/\/+$/,"")+"/";
  }catch{return "";}
}
function safeSeoProduct(product,vehicleIds,gaps,now=Date.now()){
  if(product?.audit?.status!=="verified_live")return false;
  const verified=Date.parse(product.verifiedAt||"");
  if(!Number.isFinite(verified)||now-verified>7*86400000)return false;
  if(!product.gapIds?.some(g=>gaps.includes(g)))return false;\n  const role=product.recommendationRole||"beginner_default";\n  if(!["beginner_default","beginner_alternative"].includes(role))return false;
  if(!Number.isFinite(product.price)||product.price<=0)return false;
  if(typeof product.image!=="string"||!product.image.startsWith("https://"))return false;
  if(canonicalRakuten(product.affiliateUrl)!==canonicalRakuten(product.itemUrl))return false;
  return (product.vehicleFit||[]).some(f=>f.status==="verified"&&vehicleIds.includes(f.vehicleId));
}
function fitLabel(product,vehicleIds){
  const fits=(product.vehicleFit||[]).filter(f=>f.status==="verified"&&vehicleIds.includes(f.vehicleId));
  const labels=[];
  const vehicleNames={"suzuki-every-da17v":"DA17V","suzuki-every-da18v":"DA18V"};
  const ids=[...new Set(fits.map(f=>vehicleNames[f.vehicleId]).filter(Boolean))];
  if(ids.length)labels.push(ids.join(" / "));
  const seats=[...new Set(fits.flatMap(f=>f.seatCounts||[]))];
  if(seats.length)labels.push(seats.join("・")+"人乗り");
  const trims=[...new Set(fits.flatMap(f=>f.trims||[]))];
  if(trims.length&&trims.length<=3)labels.push(trims.join(" / "));
  const exclusions=[...new Set(fits.flatMap(f=>f.exclusions||[]))];
  if(exclusions.length)labels.push("除外: "+exclusions.join(" / "));
  return labels.length?labels.join(" · "):"車種適合確認済み";
}
function yen(value){
  return new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(value);
}
async function renderVerifiedProducts(){
  const ctx=context();
  const vehicleIds=SEO_VEHICLES[ctx.vehicle_slug];
  const gaps=SEO_GAPS[ctx.intent_slug];
  if(!vehicleIds||!gaps)return;
  const anchor=document.querySelector(".builder-box");
  if(!anchor)return;
  try{
    const root=location.pathname.split("/car-stay/")[0]+"/car-stay/";
    const response=await fetch(root+"data/audited-products.json",{cache:"no-store"});
    if(!response.ok)return;
    const payload=await response.json();
    const items=(payload.products||[])
      .filter(p=>safeSeoProduct(p,vehicleIds,gaps))
      .sort((a,b)=>(b.score||0)-(a.score||0))
      .slice(0,3);
    if(!items.length)return;

    const section=document.createElement("section");
    section.className="section seo-products";
    section.innerHTML="<div class='seo-products-head'><div><p class='seo-products-kicker'>LIVE AUDITED PICKS</p><h2>いま確認できる適合候補</h2><p><span class='seo-pr'>PR</span> 無料対策を試したあと、それでも必要なら。販売・価格・楽天リンクを7日以内に監査できた初泊向け商品だけです。</p></div><span class='seo-products-count'>"+items.length+"件</span></div><div class='seo-product-grid'>"+items.map(p=>"<article class='seo-product-card'><img src='"+p.image.replace(/'/g,"&#39;")+"' alt='' loading='lazy'><div><div class='seo-card-badges'><span class='seo-pr'>PR</span><span class='seo-fit'>"+fitLabel(p,vehicleIds).replace(/</g,"&lt;")+"</span><span class='seo-role'>"+((p.recommendationRole||"beginner_default")==="beginner_alternative"?"代替候補":"初泊向け")+"</span></div><h3>"+String(p.name||"").replace(/[<&]/g,m=>m==="<"?"&lt;":"&amp;")+"</h3><div class='seo-product-meta'><strong>"+yen(p.price)+"</strong><small>確認 "+String(p.verifiedAt||"").slice(0,10)+"</small></div><a class='seo-buy' data-seo-product='"+p.productId+"' data-price='"+(p.price||0)+"' data-role='"+(p.recommendationRole||"")+"' href='"+p.affiliateUrl.replace(/'/g,"%27")+"' target='_blank' rel='nofollow sponsored noopener'>楽天で見る →</a></div></article>").join("")+"</div><p class='seo-products-note'>※楽天アフィリエイトを利用しています。ここは「あなた専用の最終推薦」ではありません。乗車定員・グレード・寝床・気温まで合わせる場合は下のBuilderで判定してください。</p>";
    anchor.parentNode.insertBefore(section,anchor);

    if(enabled&&window.gtag){
      for(const p of items)window.gtag("event","seo_product_view",{site_id:"sotojitaku_car_stay_seo",vehicle_slug:ctx.vehicle_slug,intent_slug:ctx.intent_slug,product_id:p.productId});
    }
    section.addEventListener("click",event=>{
      const link=event.target.closest("[data-seo-product]");
      if(!link||!enabled||!window.gtag)return;
      window.gtag("event","seo_affiliate_click",{site_id:"sotojitaku_car_stay_seo",vehicle_slug:ctx.vehicle_slug,intent_slug:ctx.intent_slug,product_id:link.dataset.seoProduct,price:Number(link.dataset.price)||0,recommendation_role:link.dataset.role||""});
    });
  }catch{}
}
renderVerifiedProducts();
