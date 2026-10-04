"""Reuse the operator's existing Rakuten Worker. Never trust its fuzzy match.
Only exact manufacturer-audited models and canonical listings may pass, after a
fresh independent sales-page audit. Missing or changed evidence empties that item.
"""
import json, re, time, unicodedata, urllib.parse, urllib.request
from datetime import datetime, timezone
from acquire import ROOT, fetch_with_retry, canonical_item_url
WORKER='https://daily-cost-api.kiyo0625puma.workers.dev/api/product-search'
SHIPPING_LOOKUP='https://daily-cost-api.kiyo0625puma.workers.dev/api/shipping-lookup'
HEADERS={'Origin':'https://stusaurus.github.io','Referer':'https://stusaurus.github.io/sotojitaku/','User-Agent':'sotojitaku-camp/1.0'}
def parse_listing(page, model, expected_price, expected_id=None):
    marker='"itemInfoSku":'
    if marker not in page:raise ValueError('missing_sales_evidence')
    info,_=json.JSONDecoder().raw_decode(page.split(marker,1)[1])
    if expected_id is not None and info.get('itemId')!=expected_id:raise ValueError('wrong_listing')
    if info.get('sellType')!='NORMAL':raise ValueError('wrong_listing')
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

def live_item_code(affiliate_url):
    try:
        parsed=urllib.parse.urlparse(affiliate_url or '')
        mobile=urllib.parse.parse_qs(parsed.query).get('m',[''])[0]
        match=re.search(r'//m\.rakuten\.co\.jp/([^/]+)/i/(\d+)/?',mobile)
        return f'{match.group(1)}:{match.group(2)}' if match else ''
    except Exception:
        return ''

def _compact(value):
    return re.sub(r'\s+','',unicodedata.normalize('NFKC',str(value or '')))

def category_for(category_id, equipment):
    return next((c for c in equipment.get('categories',[]) if c.get('id')==category_id),None)

def excluded_name(name, category_id, equipment):
    category=category_for(category_id,equipment)
    if not category:return True
    normalized=_compact(name)
    exclusions=equipment.get('global_exclude_terms',[])+category.get('exclude_any',[])
    return any(_compact(term) in normalized for term in exclusions)

def body_gate(name, category_id, equipment):
    category=category_for(category_id,equipment)
    if not category or excluded_name(name,category_id,equipment):return False
    normalized=_compact(name)
    return any(_compact(term) in normalized for term in category.get('include_any',[]))

def identity_gate(name, audit, equipment):
    category_id=audit.get('category')
    if excluded_name(name,category_id,equipment):return False
    terms=audit.get('identityTerms') or []
    term_match=bool(terms) and all(_compact(term) in _compact(name) for term in terms)
    model_match=_compact(audit.get('model')) in _compact(name)
    return (body_gate(name,category_id,equipment) and model_match) or term_match

def code_lookup_allowed(audit, matched, equipment):
    code=str(audit.get('lookupCode',''))
    if not re.fullmatch(r'\d{8,14}',code):return False
    if matched.get('found') is not True or matched.get('lookup_method')!='product_code_verified':return False
    if canonical_item_url(matched.get('shipping_included_url'))!=audit.get('itemUrl'):return False
    if not identity_gate(matched.get('shipping_match_name',''),audit,equipment):return False
    price=matched.get('shipping_included_price');ref=audit.get('referencePrice')
    if not isinstance(price,(int,float)) or price<=0 or not isinstance(ref,(int,float)) or ref<=0 or price<ref*.35:return False
    image=matched.get('shipping_included_image','')
    return isinstance(image,str) and image.startswith('https://thumbnail.image.rakuten.co.jp/')

def name_lookup_allowed(audit, matched, equipment):
    if matched.get('found') is not True or matched.get('lookup_method')!='product_name_specs_verified':return False
    if canonical_item_url(matched.get('shipping_included_url'))!=audit.get('itemUrl'):return False
    if not identity_gate(matched.get('shipping_match_name',''),audit,equipment):return False
    price=matched.get('shipping_included_price');ref=audit.get('referencePrice')
    if not isinstance(price,(int,float)) or price<=0 or not isinstance(ref,(int,float)) or ref<=0 or price<ref*.35:return False
    image=matched.get('shipping_included_image','')
    return isinstance(image,str) and image.startswith('https://thumbnail.image.rakuten.co.jp/')

def worker_fallback_allowed(audit, matched, equipment, audit_age, page):
    # The Rakuten page occasionally returns a tiny anti-bot response in Actions.
    # Never replace identity checks with fuzzy search: this path requires the exact
    # manually audited URL + exact model + a current body-name gate + fresh Worker data.
    if len(page)>512 or audit_age>7:return False
    if not all(audit.get(k) is True for k in ('audited','bodyConfirmed','fixedVariant','available','priceAudit')):return False
    if audit.get('condition')!='new' or audit.get('quantityPerListing')!=1:return False
    name=matched.get('shipping_match_name','')
    if not identity_gate(name,audit,equipment):return False
    price=matched.get('shipping_included_price')
    ref=audit.get('referencePrice')
    if not isinstance(price,(int,float)) or price<=0 or not isinstance(ref,(int,float)) or ref<=0 or price<ref*.35:return False
    image=matched.get('shipping_included_image','')
    if not isinstance(image,str) or not image.startswith('https://thumbnail.image.rakuten.co.jp/'):return False
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
    now=datetime.now(timezone.utc).isoformat();products=[];item_failures={};reasons={}
    audits=json.loads((ROOT/'data/audited-products.json').read_text())['products']
    equipment=json.loads((ROOT/'data/equipment.json').read_text())
    for audit in audits:
        try:
            # Manufacturer audit expires after one year; sales evidence is rechecked now.
            age=(datetime.now(timezone.utc)-datetime.fromisoformat(audit['listingAuditedAt'])).days
            if not 0<=age<=365:raise ValueError('spec_audit_expired')
            if audit.get('lookupCode') or audit.get('lookupName'):
                params={'code':audit.get('lookupCode',''),'name':audit.get('name',''),'brand':audit.get('brand','')}
                req=urllib.request.Request(SHIPPING_LOOKUP+'?'+urllib.parse.urlencode(params),headers=HEADERS)
                matched=fetch_with_retry(req)
                allowed=code_lookup_allowed(audit,matched,equipment) if audit.get('lookupCode') else name_lookup_allowed(audit,matched,equipment)
                if not allowed:
                    safe={'url':canonical_item_url(matched.get('shipping_included_url')),'name':matched.get('shipping_match_name'),'price':matched.get('shipping_included_price'),'method':matched.get('lookup_method')}
                    print('STRICT_AUDIT_MISS',audit['category'],audit['model'],json.dumps(safe,ensure_ascii=False))
                    raise ValueError('unmatched_listing')
            else:
                req=urllib.request.Request(WORKER+'?'+urllib.parse.urlencode({'q':audit['query'],'hits':30}),headers=HEADERS)
                result=fetch_with_retry(req)
                model_candidates=[p for p in result.get('products',[]) if p.get('product_no')==audit['model']]
                matched=next((p for p in model_candidates if canonical_item_url(p.get('shipping_included_url'))==audit['itemUrl']),None)
                if not matched or not identity_gate(matched.get('shipping_match_name',''),audit,equipment):
                    safe=[{'url':canonical_item_url(p.get('shipping_included_url')),'name':p.get('shipping_match_name'),'price':p.get('shipping_included_price')} for p in model_candidates[:10]]
                    print('AUDIT_MISS',audit['category'],audit['model'],json.dumps(safe,ensure_ascii=False))
                    raise ValueError('unmatched_listing')
            price=matched.get('shipping_included_price')
            affiliate=matched.get('shipping_included_url','')
            code=live_item_code(affiliate) or audit.get('itemCode','')
            if not code:raise ValueError('missing_item_code')
            expected_id=None
            try: expected_id=int(code.split(':',1)[1])
            except (ValueError,IndexError): pass
            page=fetch_page(audit['itemUrl'])
            verification_mode='sales_page'
            try:
                parse_listing(page,audit['model'],price,expected_id)
            except ValueError as evidence_error:
                if str(evidence_error)!='missing_sales_evidence' or not worker_fallback_allowed(audit,matched,equipment,age,page):
                    if str(evidence_error)=='missing_sales_evidence':
                        compact=re.sub(r'\s+',' ',page)
                        print('SALES_EVIDENCE_MISS',audit['category'],audit['model'],'len',len(page),'model',audit['model'] in page,'price',str(price) in compact)
                    raise
                verification_mode='exact_audit_worker_fallback'
                print('SALES_EVIDENCE_FALLBACK',audit['category'],audit['model'],canonical_item_url(affiliate))
            products.append({**audit,'itemCode':code,'name':matched.get('name') or matched.get('shipping_match_name') or audit['name'],'price':price,'affiliateUrl':affiliate,'image':matched['shipping_included_image'].replace('_ex=128x128','_ex=500x500'),'verifiedAt':now,'shipping':'included','verificationMode':verification_mode})
        except Exception as error:
            reason=('http_'+str(error.code) if hasattr(error,'code') else str(error) if isinstance(error,ValueError) else type(error).__name__)
            item_failures[f"{audit['category']}:{audit.get('model','?')}"]=reason
            reasons[audit['category']]=reason
        time.sleep(1.2)
    audited_categories={a['category'] for a in audits};covered={p['category'] for p in products};failed=sorted(audited_categories-covered)
    return {'version':1,'products':products,'status':'partial_error' if failed else 'ok','failedCategories':failed,'failureReasons':{k:v for k,v in reasons.items() if k in failed},'itemFailures':item_failures,'updatedAt':now}
if __name__=='__main__':
    result=acquire();p=ROOT/'data/products.json';tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');tmp.replace(p)
    print('catalog:',result['status'],'verified:',len(result['products']))
