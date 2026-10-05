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
