"""Discover exact Rakuten listings for manually specified, manufacturer-audited models.
This never publishes products. It produces data/product-candidates.json for review.
"""
from __future__ import annotations
import json, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from acquire import ROOT, fetch_with_retry, canonical_item_url
from refresh_worker import WORKER, HEADERS, fetch_page

def inspect_listing(page, model, expected_price):
    marker='"itemInfoSku":'
    if marker not in page:
        raise ValueError('missing_sales_evidence')
    info,_=json.JSONDecoder().raw_decode(page.split(marker,1)[1])
    if info.get('sellType')!='NORMAL':
        raise ValueError('wrong_listing')
    purchase=info.get('purchaseInfo',{})
    if purchase.get('purchaseBySellType',{}).get('purchaseCondition')!='enabled':
        raise ValueError('unavailable')
    actual=purchase.get('purchaseBySellType',{}).get('normalPurchase',{}).get('price',{}).get('minPrice')
    if actual!=expected_price:
        raise ValueError('price_mismatch')
    inventories=purchase.get('variantMappedInventories',[])
    if len(inventories)!=1 or inventories[0].get('quantity',0)<=0:
        raise ValueError('inventory_unknown')
    if info.get('inventoryType')=='multiple':
        variants=info.get('sku',[])
        if len(variants)!=1 or variants[0].get('hidden') is not False or variants[0].get('taxIncludedPrice')!=expected_price:
            raise ValueError('variable_listing')
        if any(len(s.get('values',[]))!=1 for s in info.get('variantSelectors',[])):
            raise ValueError('selectable_listing')
    elif info.get('inventoryType')!='single' or info.get('sku'):
        raise ValueError('variant_unknown')
    if model not in page:
        raise ValueError('model_missing')
    item_id=info.get('itemId')
    if not isinstance(item_id,int):
        raise ValueError('item_id_missing')
    return item_id

def discover():
    seeds=json.loads((ROOT/'data/product-seeds.json').read_text())['products']
    now=datetime.now(timezone.utc).isoformat()
    found=[];failed={}
    def model_key(value):
        return ''.join(ch for ch in str(value or '').upper() if ch.isalnum())
    for seed in seeds:
        try:
            req=urllib.request.Request(WORKER+'?'+urllib.parse.urlencode({'q':seed['model'],'hits':20}),headers=HEADERS)
            result=fetch_with_retry(req)
            needle=model_key(seed['model'])
            def model_match(p):
                product_no=model_key(p.get('product_no'))
                text=model_key(' '.join(str(p.get(k) or '') for k in ('name','shipping_match_name')))
                return product_no==needle or (len(needle)>=5 and needle in text)
            exact=[p for p in result.get('products',[]) if model_match(p)]
            if not exact:
                raise ValueError('no_exact_model')
            accepted=None
            reasons=[]
            for p in exact:
                try:
                    url=canonical_item_url(p.get('shipping_included_url'))
                    if not url or 'item.rakuten.co.jp/' not in url:
                        raise ValueError('no_canonical_rakuten_url')
                    price=p.get('shipping_included_price')
                    if not isinstance(price,int) or price<=0:
                        raise ValueError('bad_price')
                    page=fetch_page(url)
                    item_id=inspect_listing(page,seed['model'],price)
                    shop=urllib.parse.urlparse(url).path.strip('/').split('/')[0]
                    if not shop:
                        raise ValueError('shop_missing')
                    accepted={
                        **seed,
                        'itemCode':f'{shop}:{item_id}',
                        'query':seed['model'],
                        'name':p.get('name') or p.get('shipping_match_name') or seed['model'],
                        'itemUrl':url,
                        'currentPrice':price,
                        'currentImage':(p.get('shipping_included_image') or '').replace('_ex=128x128','_ex=500x500'),
                        'affiliateUrl':p.get('shipping_included_url'),
                        'listingAuditedAt':now,
                        'listingAudit':'型番一致、本体、新品通常販売、購入可能、実SKU1種類、税込単一価格を販売ページのitemInfoSkuで自動確認。'
                    }
                    break
                except Exception as e:
                    reasons.append(str(e) if isinstance(e,ValueError) else type(e).__name__)
            if not accepted:
                raise ValueError('listing_rejected:'+','.join(reasons[:4]))
            found.append(accepted)
        except Exception as e:
            failed[seed['model']]=str(e) if isinstance(e,ValueError) else type(e).__name__
        time.sleep(1.2)
    return {'version':1,'generatedAt':now,'status':'ok' if not failed else 'partial','products':found,'failed':failed}

if __name__=='__main__':
    out=discover()
    path=ROOT/'data/product-candidates.json'
    path.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print('candidate discovery:',out['status'],'accepted:',len(out['products']),'failed:',len(out['failed']))
