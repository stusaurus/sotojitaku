"""Fail-closed CAR STAY Rakuten refresh.

Only a manually fit-audited exact listing can become a live recommendation.
Current sales data comes from the Rakuten Ichiba API scoped to the manually audited shop first,
then the existing Rakuten Worker as a fallback. Any mismatch removes
that product from the public catalog rather than retaining stale data.
"""
from __future__ import annotations
import json, os, re, time, unicodedata, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SEED_DIR=ROOT/'car-stay'/'data'/'product-seeds'
OUT=ROOT/'car-stay'/'data'/'audited-products.json'
WORKER='https://daily-cost-api.kiyo0625puma.workers.dev/api/product-search'
SHIPPING_LOOKUP='https://daily-cost-api.kiyo0625puma.workers.dev/api/shipping-lookup'
RAKUTEN_API='https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701'
HEADERS={
    'Origin':'https://stusaurus.github.io',
    'Referer':'https://stusaurus.github.io/sotojitaku/car-stay/',
    'User-Agent':'sotojitaku-car-stay/1.0'
}

_PAGE_CACHE={}

def fetch_json(url,headers=None):
    req=urllib.request.Request(url,headers=headers or HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req,timeout=12) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code not in (429,500,502,503,504) or attempt==2: raise
            time.sleep(1+attempt*2)
        except (urllib.error.URLError,TimeoutError):
            if attempt==2: raise
            time.sleep(1+attempt*2)

def fetch_text(url):
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=8) as r:
        raw=r.read()
    match=re.search(br'charset\s*=\s*["\']?([\w-]+)',raw[:10000],re.I)
    enc=match.group(1).decode() if match else 'utf-8'
    return raw.decode(enc,errors='replace')

def fetch_text_cached(url):
    key=canonical_item_url(url) or str(url)
    if key not in _PAGE_CACHE:
        _PAGE_CACHE[key]=fetch_text(url)
    return _PAGE_CACHE[key]

def canonical_item_url(value):
    value=str(value or '')
    u=urllib.parse.urlparse(value)
    if u.hostname=='hb.afl.rakuten.co.jp':
        value=urllib.parse.parse_qs(u.query).get('pc',[''])[0]
        u=urllib.parse.urlparse(value)
    if u.hostname!='item.rakuten.co.jp': return ''
    path=re.sub(r'/+','/',u.path).rstrip('/')+'/'
    return f'https://item.rakuten.co.jp{path}'

def rakuten_shop(value):
    u=urllib.parse.urlparse(canonical_item_url(value))
    parts=[p for p in u.path.split('/') if p]
    return parts[0] if parts else ''

def compact(value):
    return re.sub(r'\s+','',unicodedata.normalize('NFKC',str(value or ''))).lower()

def required_groups_ok(value,seed):
    n=compact(value)
    for group in seed.get('identityGroups',[]):
        if not any(compact(term) in n for term in group): return False
    return True

def identity_ok(name,seed):
    n=compact(name)
    if any(compact(x) in n for x in seed.get('forbiddenTerms',[])): return False
    return required_groups_ok(name,seed)

def safe_affiliate(url,item_url):
    try:
        u=urllib.parse.urlparse(url or '')
        if u.scheme!='https' or u.hostname!='hb.afl.rakuten.co.jp': return False
        return canonical_item_url(url)==canonical_item_url(item_url)
    except Exception:
        return False

def normalize_worker_candidate(raw):
    url=raw.get('shipping_included_url') or raw.get('url') or ''
    return {
        'name':raw.get('shipping_match_name') or raw.get('name') or '',
        'price':raw.get('shipping_included_price') or raw.get('price'),
        'url':url,
        'itemUrl':canonical_item_url(url),
        'image':raw.get('shipping_included_image') or raw.get('image') or '',
        'itemCode':raw.get('item_code') or raw.get('itemCode') or '',
        'source':'worker'
    }

def candidate_match_level(candidate,seed):
    if not candidate or not identity_ok(candidate.get('name',''),seed): return 0
    item=candidate.get('itemUrl') or canonical_item_url(candidate.get('url',''))
    expected=canonical_item_url(seed['itemUrl'])
    if item==expected: return 2
    if item and rakuten_shop(item)==rakuten_shop(expected): return 1
    return 0

def seed_queries(seed):
    queries=seed.get('searchQueries') or [seed.get('query','')]
    out=[]
    for value in queries:
        value=str(value or '').strip()
        if value and value not in out: out.append(value)
    return out

def worker_candidate(seed):
    previews=[]
    matches=[]
    for search_query in seed_queries(seed):
        query=urllib.parse.urlencode({'q':search_query,'hits':30})
        payload=fetch_json(WORKER+'?'+query)
        for raw in payload.get('products',[]):
            c=normalize_worker_candidate(raw)
            level=candidate_match_level(c,seed)
            if level: matches.append((level,c))
        previews.extend({
            'q':search_query,
            'shop':rakuten_shop(normalize_worker_candidate(raw).get('itemUrl','')),
            'name':normalize_worker_candidate(raw).get('name','')[:120],
            'itemUrl':normalize_worker_candidate(raw).get('itemUrl','')
        } for raw in (payload.get('products',[])[:3]))
        if matches: break
    if matches:
        matches.sort(key=lambda x:(-x[0],0 if safe_affiliate(x[1]['url'],x[1]['itemUrl']) else 1))
        return matches[0][1]
    print('CAR_STAY_DIAG',seed.get('productId'),json.dumps(previews[:8],ensure_ascii=False))
    for search_query in seed_queries(seed):
        lookup=fetch_json(SHIPPING_LOOKUP+'?'+urllib.parse.urlencode({'name':search_query,'brand':seed.get('brand','')}))
        if lookup.get('found') is True:
            c=normalize_worker_candidate(lookup)
            if candidate_match_level(c,seed): return c
    return None

def exact_page_info(seed):
    """Read the exact manually audited Rakuten URL and return live sale metadata.
    Returns None when Rakuten serves an interstitial/challenge without itemInfoSku.
    Explicit unavailable/wrong-listing evidence raises and fails closed.
    """
    try:
        page=fetch_text_cached(seed['itemUrl'])
    except Exception:
        return None
    marker='"itemInfoSku":'
    if marker not in page:
        return None
    info,_=json.JSONDecoder().raw_decode(page.split(marker,1)[1])
    if info.get('sellType')!='NORMAL':
        raise ValueError('wrong_sell_type')
    purchase=info.get('purchaseInfo',{})
    by_type=purchase.get('purchaseBySellType',{})
    if by_type.get('purchaseCondition')!='enabled':
        raise ValueError('unavailable')
    live=by_type.get('normalPurchase',{}).get('price',{}).get('minPrice')
    if not isinstance(live,(int,float)) or live<=0:
        raise ValueError('price_unknown')
    item_id=info.get('itemId')
    if not isinstance(item_id,int):
        raise ValueError('item_id_missing')
    return {'itemId':item_id,'price':int(live)}

def rakuten_api_exact_candidate(seed):
    env={k:os.environ.get(k,'').strip() for k in ['RAKUTEN_APPLICATION_ID','RAKUTEN_ACCESS_KEY','RAKUTEN_AFFILIATE_ID']}
    if not all(env.values()):
        return None
    page_info=exact_page_info(seed)
    if not page_info:
        return None
    item_code=f"{rakuten_shop(seed['itemUrl'])}:{page_info['itemId']}"
    params={
        'applicationId':env['RAKUTEN_APPLICATION_ID'],
        'affiliateId':env['RAKUTEN_AFFILIATE_ID'],
        'itemCode':item_code,
        'hits':1,'formatVersion':2,'availability':1,
        'elements':'itemName,itemCode,itemPrice,itemUrl,affiliateUrl,mediumImageUrls,availability,shopCode'
    }
    headers={**HEADERS,'accessKey':env['RAKUTEN_ACCESS_KEY']}
    payload=fetch_json(RAKUTEN_API+'?'+urllib.parse.urlencode(params),headers)
    for raw in payload.get('items') or payload.get('Items') or []:
        item=raw.get('Item',raw)
        item_url=canonical_item_url(item.get('itemUrl',''))
        name=item.get('itemName','')
        if item_url!=canonical_item_url(seed['itemUrl']) or not identity_ok(name,seed):
            continue
        imgs=item.get('mediumImageUrls') or []
        image=imgs[0] if imgs else ''
        if isinstance(image,dict): image=image.get('imageUrl','')
        return {
            'name':name,'price':item.get('itemPrice'),'url':item.get('affiliateUrl',''),
            'itemUrl':item_url,'image':image,'itemCode':item.get('itemCode') or item_code,
            'source':'rakuten_api_exact','pagePrice':page_info['price']
        }
    return None

def rakuten_api_candidate(seed):
    env={k:os.environ.get(k,'').strip() for k in ['RAKUTEN_APPLICATION_ID','RAKUTEN_ACCESS_KEY','RAKUTEN_AFFILIATE_ID']}
    if not all(env.values()): return None
    headers={**HEADERS,'accessKey':env['RAKUTEN_ACCESS_KEY']}
    candidates=[]
    for search_query in seed_queries(seed):
        params={
            'applicationId':env['RAKUTEN_APPLICATION_ID'],
            'affiliateId':env['RAKUTEN_AFFILIATE_ID'],
            'shopCode':rakuten_shop(seed['itemUrl']),
            'keyword':search_query,
            'hits':30,'formatVersion':2,'availability':1,'field':0,
            'elements':'itemName,itemCode,itemPrice,itemUrl,affiliateUrl,mediumImageUrls,availability,shopCode'
        }
        payload=fetch_json(RAKUTEN_API+'?'+urllib.parse.urlencode(params),headers)
        for raw in payload.get('items') or payload.get('Items') or []:
            item=raw.get('Item',raw)
            item_url=canonical_item_url(item.get('itemUrl',''))
            name=item.get('itemName','')
            level=candidate_match_level({'name':name,'itemUrl':item_url},seed)
            if not level: continue
            imgs=item.get('mediumImageUrls') or []
            image=imgs[0] if imgs else ''
            if isinstance(image,dict): image=image.get('imageUrl','')
            candidates.append((level,{
                'name':name,'price':item.get('itemPrice'),'url':item.get('affiliateUrl',''),
                'itemUrl':item_url,'image':image,'itemCode':item.get('itemCode',''),'source':'rakuten_api'
            }))
        if any(level==2 for level,_ in candidates): break
    if not candidates: return None
    candidates.sort(key=lambda pair:(-pair[0],0 if safe_affiliate(pair[1]['url'],pair[1]['itemUrl']) else 1))
    return candidates[0][1]

def page_sales_audit(seed,item_url,expected_price):
    """Return (mode, live_price).

    Vehicle/generation identity has already passed against the current API/Worker
    candidate name before this function runs. The Rakuten sales page independently
    verifies sale state and price; it does not need to repeat every fit keyword in
    server-rendered HTML.
    """
    try:
        page=fetch_text_cached(item_url)
    except Exception:
        return 'exact_feed_fallback',expected_price
    marker='"itemInfoSku":'
    if marker not in page:
        # Challenge/interstitial fallback is allowed only for the exact manually
        # audited item URL. Same-shop replacement listings still need sales evidence.
        if canonical_item_url(item_url)==canonical_item_url(seed['itemUrl']):
            return 'exact_feed_fallback',expected_price
        raise ValueError('sales_evidence_missing')
    info,_=json.JSONDecoder().raw_decode(page.split(marker,1)[1])
    if info.get('sellType')!='NORMAL': raise ValueError('wrong_sell_type')
    purchase=info.get('purchaseInfo',{})
    by_type=purchase.get('purchaseBySellType',{})
    if by_type.get('purchaseCondition')!='enabled': raise ValueError('unavailable')
    live=by_type.get('normalPurchase',{}).get('price',{}).get('minPrice')
    if not isinstance(live,(int,float)) or live<=0: raise ValueError('price_unknown')
    if isinstance(expected_price,(int,float)) and expected_price>0 and abs(live-expected_price)>max(500,expected_price*.35):
        raise ValueError('feed_page_price_mismatch')
    return 'sales_page',int(live)

def load_seeds():
    return [json.loads(p.read_text()) for p in sorted(SEED_DIR.glob('*.json'))]

def fit_audit_fresh(seed,now):
    try:
        checked=datetime.fromisoformat(seed['fitCheckedAt']+'T00:00:00+00:00')
        return 0 <= (now-checked).days <= 365
    except Exception:
        return False

def acquire():
    now_dt=datetime.now(timezone.utc); now=now_dt.isoformat()
    products=[];failures={}
    for seed in load_seeds():
        try:
            if not fit_audit_fresh(seed,now_dt): raise ValueError('fit_audit_expired')
            candidate=None
            source_errors=[]
            for source_name,source_fn in (
                ('rakuten_api_exact',rakuten_api_exact_candidate),
                ('rakuten_api_search',rakuten_api_candidate),
                ('worker',worker_candidate),
            ):
                if candidate is not None: break
                try:
                    candidate=source_fn(seed)
                except Exception as source_error:
                    source_errors.append(source_name+':'+type(source_error).__name__)
            if candidate is None:
                suffix=(' ['+','.join(source_errors)+']') if source_errors else ''
                raise ValueError('same_shop_identity_listing_not_found'+suffix)
            target_item=candidate.get('itemUrl') or canonical_item_url(candidate['url'])
            if not safe_affiliate(candidate['url'],target_item): raise ValueError('unsafe_or_wrong_affiliate')
            price=candidate.get('price')
            if not isinstance(price,(int,float)) or price<=0: raise ValueError('price_unknown')
            page_price=candidate.get('pagePrice')
            if isinstance(page_price,(int,float)) and abs(page_price-price)>max(500,price*.35):
                raise ValueError('api_page_price_mismatch')
            image=candidate.get('image','')
            if not isinstance(image,str) or not image.startswith('https://'): raise ValueError('image_unknown')
            mode,live_price=page_sales_audit(seed,target_item,int(price))
            products.append({
                'productId':seed['productId'],
                'name':candidate.get('name') or seed['name'],
                'brand':seed.get('brand',''),
                'gapIds':seed['gapIds'],
                'recommendationRole':seed.get('recommendationRole','beginner_default'),
                'score':seed.get('score',80),
                'price':int(live_price),
                'itemCode':candidate.get('itemCode',''),
                'itemUrl':target_item,
                'affiliateUrl':candidate['url'],
                'image':image,
                'verifiedAt':now,
                'fitVerifiedAt':seed['fitCheckedAt'],
                'vehicleFit':seed['vehicleFit'],
                'audit':{
                    'status':'verified_live',
                    'mode':mode,
                    'salesSource':candidate['source'],
                    'fitEvidence':seed.get('fitEvidenceUrl','')
                }
            })
        except Exception as e:
            failures[seed.get('productId','unknown')]=str(e) if isinstance(e,ValueError) else type(e).__name__
        time.sleep(.6)
    return {
        'version':1,'updatedAt':now,'status':'ok' if not failures else 'partial',
        'products':products,'failures':failures
    }

if __name__=='__main__':
    payload=acquire()
    tmp=OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    tmp.replace(OUT)
    print('CAR STAY catalog:',payload['status'],'verified:',len(payload['products']),'failed:',len(payload['failures']))
