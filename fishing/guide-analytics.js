(()=>{
  if(window.SOTOJITAKU_ANALYTICS?.optedOut)return;
  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
  window.gtag("set",{service_id:"fishing",operator_test:window.SOTOJITAKU_ANALYTICS?.operatorTest?"1":"0"});
  const measurementId="G-6STQ5HXRDH";
  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
  const script=document.createElement("script");
  script.async=true;
  script.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(measurementId);
  document.head.appendChild(script);
  window.gtag("js",new Date());
  window.gtag("config",measurementId,{send_page_view:true});

  const parts=location.pathname.split("/").filter(Boolean);
  const guideIndex=parts.indexOf("guides");
  const slug=guideIndex>=0?(parts[guideIndex+1]||"hub"):"unknown";
  window.gtag("event","fishing_guide_view",{guide_slug:slug,conversion_source:"fishing_guide"});

  document.addEventListener("click",event=>{
    const link=event.target.closest("a");
    if(!link)return;
    const href=link.getAttribute("href")||"";
    if(link.classList.contains("button")||href.endsWith("/fishing/")||href==="../"||href==="../../"){
      window.gtag("event","fishing_guide_cta",{
        guide_slug:slug,
        link_text:(link.textContent||"").trim().slice(0,80),
        destination:link.href,
        conversion_source:"fishing_guide"
      });
    }
  });
})();