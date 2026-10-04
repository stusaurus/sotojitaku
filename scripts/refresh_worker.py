"""Reuse the operator's existing Rakuten Worker. Never trust its fuzzy match.
Only exact manufacturer-audited models and canonical listings may pass, after a
fresh independent sales-page audit. Missing or changed evidence empties that item.
"""
import json, re, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from acquire import ROOT, fetch_with_retry, canonical_item_url
WORKER='https://daily-cost-api.kiyo0625puma.workers.dev/api/product-search'
HEADERS={'Origin':'https://stusaurus.github.io','Referer':'https://stusaurus.github.io/sotojitaku/','User-Agent':'sotojitaku-camp/1.0'}
def parse_listing(page, model, expected_price, expected_id):
    marker='"itemInfoSku":'
    if marker not in page:raise ValueError('missing_sales_evidence')
    info,_=json.JSONDecoder().raw_decode(page.split(marker,1)[1])
    if info.get('itemId')!=expected_id or info.get('sellType')!='NORMAL':raise ValueError('wrong_listing')
    purchase=info.get('purchaseInfo',{})
    if purchase.get('purchaseBySellType',{}).get('purchaseCondition')!='enabled':raise ValueError('unavailable')
    actual=purchase.get('purchaseBySellType',{}).get('normalPurchase',{}).get('price',{}).get('minPrice')
    if actual!=expected_price:raise ValueError('price_mismatch')
    inventories=purchase.get('variantMappedInventories',[])
    if len(inventories)!=1 or inventories[0].get('quantity',0)<=0:raise ValueError('inventory_unknown')
    if info.get('inventoryType')=='multiple':
        variants=info.get('sku',[])
        if len(variants)!=1 or variants[0].get('hidden') is not False or variants[0].get('taxIncludedPrice')!=expected_price:raise ValueError('variable_listing')
        if any(len(s.get('values',[]))!=1 for s in info.get('variantSelectors',[])):raise ValueError('selectable_listing')
        attrs=variants[0].get('attributes',[])
        if not any(a.get('title')=='メーカー型番' and a.get('value')==model for a in attrs):raise ValueError('unknown_model')
    elif info.get('inventoryType')!='single' or info.get('sku'):raise ValueError('variant_unknown')
    if model not in page:raise ValueError('model_missing')
    return True

def fetch_page(url):
    req=urllib.request.Request(url,headers=HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req,timeout=25) as response:raw=response.read()
            match=re.search(br'charset\s*=\s*["\']?([\w-]+)',raw[:10000],re.I)
            return raw.decode(match.group(1).decode() if match else 'utf-8',errors='replace')
        except Exception as e:
            code=getattr(e,'code',None)
            if attempt==2 or code and code not in (429,500,502,503,504):raise
            time.sleep(1+attempt*2)

def acquire():
    now=datetime.now(timezone.utc).isoformat();products=[];failed=[]
    audits=json.loads((ROOT/'data/audited-products.json').read_text())['products']
    for audit in audits:
        try:
            # Manufacturer audit expires after one year; sales evidence is rechecked now.
            age=(datetime.now(timezone.utc)-datetime.fromisoformat(audit['listingAuditedAt'])).days
            if not 0<=age<=365:raise ValueError('spec_audit_expired')
            req=urllib.request.Request(WORKER+'?'+urllib.parse.urlencode({'q':audit['query'],'hits':5}),headers=HEADERS)
            result=fetch_with_retry(req)
            matched=next((p for p in result.get('products',[]) if p.get('product_no')==audit['model'] and canonical_item_url(p.get('shipping_included_url'))==audit['itemUrl']),None)
            if not matched or audit['model'] not in matched.get('shipping_match_name',''):raise ValueError('unmatched_listing')
            price=matched.get('shipping_included_price')
            page=fetch_page(audit['itemUrl'])
            parse_listing(page,audit['model'],price,int(audit['itemCode'].split(':')[1]))
            products.append({**audit,'name':matched['name'],'price':price,'affiliateUrl':matched['shipping_included_url'],'image':matched['shipping_included_image'].replace('_ex=128x128','_ex=500x500'),'verifiedAt':now,'shipping':'included'})
        except Exception:
            failed.append(audit['category'])
        time.sleep(1.2)
    return {'version':1,'products':products,'status':'partial_error' if failed else 'ok','failedCategories':failed,'updatedAt':now}
if __name__=='__main__':
    result=acquire();p=ROOT/'data/products.json';tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');tmp.replace(p)
    print('catalog:',result['status'],'verified:',len(result['products']))
