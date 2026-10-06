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
  shade:["privacy_full"],
  "7people":["floor_step","sleep_surface"]
};
const SEO_FIXED_CONFIGS={
  "freed:7people":{seatCount:7,trim:"AIR EX"}
};
const SEO_CONFIGS={
  "n-box":[
    {key:"nbox",label:"N-BOX",trim:"N-BOX"},
    {key:"custom",label:"N-BOX Custom",trim:"N-BOX Custom"},
    {key:"joy",label:"N-BOX JOY",trim:"N-BOX JOY"}
  ],
  "sienta":[
    {key:"5",label:"5人乗り",seatCount:5},
    {key:"7",label:"7人乗り",seatCount:7}
  ],
  "freed":[
    {key:"air6",label:"AIR 6人",trim:"AIR",seatCount:6},
    {key:"airex6",label:"AIR EX 6人",trim:"AIR EX",seatCount:6},
    {key:"airex7",label:"AIR EX 7人",trim:"AIR EX",seatCount:7},
    {key:"cross5",label:"CROSSTAR 5人",trim:"CROSSTAR",seatCount:5},
    {key:"cross6",label:"CROSSTAR 6人",trim:"CROSSTAR",seatCount:6}
  ]
};
const seoViewedProducts=new Set();

function html(value){
  return String(value??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}
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
  if(!product.gapIds?.some(g=>gaps.includes(g)))return false;
  const role=product.recommendationRole||"beginner_default";
  if(!["beginner_default","beginner_alternative"].includes(role))return false;
  if(!Number.isFinite(product.price)||product.price<=0)return false;
  if(typeof product.image!=="string"||!product.image.startsWith("https://"))return false;
  if(canonicalRakuten(product.affiliateUrl)!==canonicalRakuten(product.itemUrl))return false;
  return (product.vehicleFit||[]).some(f=>f.status==="verified"&&vehicleIds.includes(f.vehicleId));
}
function fitSupportsConfig(product,vehicleIds,config){
  return (product.vehicleFit||[]).some(f=>{
    if(f.status!=="verified"||!vehicleIds.includes(f.vehicleId))return false;
    if(config?.seatCount&&f.seatCounts?.length&&!f.seatCounts.includes(Number(config.seatCount)))return false;
    if(config?.trim&&f.trims?.length&&!f.trims.includes(config.trim))return false;
    if(config?.trim&&f.exclusions?.includes(config.trim))return false;
    return true;
  });
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
function builderWithConfig(anchor,config){
  const link=anchor.querySelector("a.cta");
  if(!link)return "";
  const u=new URL(link.href,location.href);
  u.searchParams.delete("seatCount");
  u.searchParams.delete("trim");
  if(config?.seatCount)u.searchParams.set("seatCount",String(config.seatCount));
  if(config?.trim)u.searchParams.set("trim",config.trim);
  link.href=u.toString();
  return link.href;
}
function configPickerNeeded(items,vehicleIds,options){
  return Boolean(options?.length&&items.some(p=>options.some(option=>!fitSupportsConfig(p,vehicleIds,option))));
}
function productCards(items,vehicleIds){
  return items.map(p=>"<article class='seo-product-card'><img src='"+html(p.image)+"' alt='' loading='lazy'><div><div class='seo-card-badges'><span class='seo-pr'>PR</span><span class='seo-fit'>"+html(fitLabel(p,vehicleIds))+"</span><span class='seo-role'>"+((p.recommendationRole||"beginner_default")==="beginner_alternative"?"代替候補":"初泊向け")+"</span></div><h3>"+html(p.name)+"</h3><div class='seo-product-meta'><strong>"+yen(p.price)+"</strong><small>確認 "+html(String(p.verifiedAt||"").slice(0,10))+"</small></div><a class='seo-buy' data-seo-product='"+html(p.productId)+"' data-price='"+Number(p.price||0)+"' data-role='"+html(p.recommendationRole||"")+"' href='"+html(p.affiliateUrl)+"' target='_blank' rel='nofollow sponsored noopener'>楽天で見る →</a></div></article>").join("");
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
    const fixedConfig=SEO_FIXED_CONFIGS[ctx.vehicle_slug+":"+ctx.intent_slug]||null;
    const matched=(payload.products||[])
      .filter(p=>safeSeoProduct(p,vehicleIds,gaps));
    const allItems=(fixedConfig?matched.filter(p=>fitSupportsConfig(p,vehicleIds,fixedConfig)):matched)
      .sort((a,b)=>(b.score||0)-(a.score||0));
    if(!allItems.length)return;

    const options=fixedConfig?[]:(SEO_CONFIGS[ctx.vehicle_slug]||[]);
    const needPicker=!fixedConfig&&configPickerNeeded(allItems,vehicleIds,options);
    const storageKey="sotojitaku_seo_fit_"+ctx.vehicle_slug;
    let selectedKey=needPicker?sessionStorage.getItem(storageKey)||"":"";
    if(!options.some(o=>o.key===selectedKey))selectedKey="";
    let selectedConfig=fixedConfig||(options.find(o=>o.key===selectedKey)||null);

    const section=document.createElement("section");
    section.className="section seo-products";
    section.innerHTML="<div class='seo-products-head'><div><p class='seo-products-kicker'>LIVE AUDITED PICKS</p><h2>いま確認できる適合候補</h2><p><span class='seo-pr'>PR</span> 無料対策を試したあと、それでも必要なら。販売・価格・楽天リンクを7日以内に監査できた初泊向け商品だけです。</p></div><span class='seo-products-count' data-product-count>—</span></div>"+(needPicker?"<div class='seo-fit-picker'><b>あなたの仕様を選ぶ</b><p>仕様が合う商品だけに絞ります。選択内容はBuilderにも引き継ぎます。</p><div class='seo-fit-options'>"+options.map(o=>"<button type='button' data-seo-fit='"+html(o.key)+"'>"+html(o.label)+"</button>").join("")+"</div></div>":"")+"<div class='seo-product-grid' data-product-grid></div><p class='seo-products-note'>※楽天アフィリエイトを利用しています。ここは購入意図が高い検索向けの短縮導線です。人数・身長・寝床・気温まで合わせる最終判定は下のBuilderで行います。</p>";
    anchor.parentNode.insertBefore(section,anchor);

    const grid=section.querySelector("[data-product-grid]");
    const count=section.querySelector("[data-product-count]");
    const paint=()=>{
      if(needPicker&&!selectedConfig){
        grid.innerHTML="<div class='seo-fit-prompt'><b>まず仕様を1つ選んでください。</b><p>違う乗車定員・グレードの商品を出さないため、選択前は購入候補を表示しません。</p></div>";
        count.textContent="仕様選択";
        builderWithConfig(anchor,null);
        return;
      }
      const visible=(selectedConfig?allItems.filter(p=>fitSupportsConfig(p,vehicleIds,selectedConfig)):allItems).slice(0,3);
      count.textContent=visible.length+"件";
      builderWithConfig(anchor,selectedConfig);
      if(!visible.length){
        grid.innerHTML="<div class='seo-fit-prompt'><b>この仕様で、いま監査を通った商品はありません。</b><p>合わない商品を代わりに出しません。下のBuilderなら手持ち品と0円対策まで含めて判定できます。</p></div>";
        return;
      }
      grid.innerHTML=productCards(visible,vehicleIds);
      if(enabled&&window.gtag){
        for(const p of visible){
          const key=ctx.vehicle_slug+":"+ctx.intent_slug+":"+selectedKey+":"+p.productId;
          if(seoViewedProducts.has(key))continue;
          seoViewedProducts.add(key);
          window.gtag("event","seo_product_view",{site_id:"sotojitaku_car_stay_seo",vehicle_slug:ctx.vehicle_slug,intent_slug:ctx.intent_slug,product_id:p.productId,price:Number(p.price)||0,recommendation_role:p.recommendationRole||"",seat_count:selectedConfig?.seatCount||0,trim:selectedConfig?.trim||""});
        }
      }
    };

    if(selectedConfig){
      section.querySelector("[data-seo-fit='"+CSS.escape(selectedConfig.key)+"']")?.classList.add("selected");
    }
    section.addEventListener("click",event=>{
      const fit=event.target.closest("[data-seo-fit]");
      if(fit){
        selectedKey=fit.dataset.seoFit;
        selectedConfig=options.find(o=>o.key===selectedKey)||null;
        sessionStorage.setItem(storageKey,selectedKey);
        section.querySelectorAll("[data-seo-fit]").forEach(btn=>btn.classList.toggle("selected",btn===fit));
        if(enabled&&window.gtag)window.gtag("event","seo_config_select",{site_id:"sotojitaku_car_stay_seo",vehicle_slug:ctx.vehicle_slug,intent_slug:ctx.intent_slug,seat_count:selectedConfig?.seatCount||0,trim:selectedConfig?.trim||""});
        paint();
        return;
      }
      const link=event.target.closest("[data-seo-product]");
      if(!link||!enabled||!window.gtag)return;
      window.gtag("event","seo_affiliate_click",{site_id:"sotojitaku_car_stay_seo",vehicle_slug:ctx.vehicle_slug,intent_slug:ctx.intent_slug,product_id:link.dataset.seoProduct,price:Number(link.dataset.price)||0,recommendation_role:link.dataset.role||"",seat_count:selectedConfig?.seatCount||0,trim:selectedConfig?.trim||""});
    });
    paint();
  }catch{}
}
renderVerifiedProducts();
