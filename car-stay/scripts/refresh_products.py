"""Fail-closed CAR STAY Rakuten refresh.

Only a manually fit-audited exact listing can become a live recommendation.
Current sales data comes from the existing Rakuten Worker first and, when repository
credentials are available, the Rakuten Ichiba API as a fallback. Any mismatch removes
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

def fetch_json(url,headers=None):
    req=urllib.request.Request(url,headers=headers or HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req,timeout=25) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code not in (429,500,502,503,504) or attempt==2: raise
            time.sleep(1+attempt*2)
        except (urllib.error.URLError,TimeoutError):
            if attempt==2: raise
            time.sleep(1+attempt*2)

def fetch_text(url):
    req=urllib.request.Request(url,headers=HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req,timeout=25) as r:
                raw=r.read()
            match=re.search(br'charset\s*=\s*["\']?([\w-]+)',raw[:10000],re.I)
            enc=match.group(1).decode() if match else 'utf-8'
            return raw.decode(enc,errors='replace')
        except urllib.error.HTTPError as e:
            if e.code not in (429,500,502,503,504) or attempt==2: raise
            time.sleep(1+attempt*2)
        except (urllib.error.URLError,TimeoutError):
            if attempt==2: raise
            time.sleep(1+attempt*2)

def canonical_item_url(value):
    value=str(value or '')
    u=urllib.parse.urlparse(value)
    if u.hostname=='hb.afl.rakuten.co.jp':
        value=urllib.parse.parse_qs(u.query).get('pc',[''])[0]
        u=urllib.parse.urlparse(value)
    if u.hostname!='item.rakuten.co.jp': return ''
    path=re.sub(r'/+','/',u.path).rstrip('/')+'/'
    return f'https://item.rakuten.co.jp{path}'

def compact(value):
    return re.sub(r'\s+','',unicodedata.normalize('NFKC',str(value or ''))).lower()

def identity_ok(name,seed):
    n=compact(name)
    if any(compact(x) in n for x in seed.get('forbiddenTerms',[])): return False
    for group in seed.get('identityGroups',[]):
        if not any(compact(term) in n for term in group): return False
    return True

def safe_affiliate(url,item_url):
    try:
        u=urllib.parse.urlparse(url or '')
        if u.scheme!='https' or u.hostname!='hb.afl.rakuten.co.jp': return False
        return canonical_item_url(url)==canonical_item_url(item_url)
    except Exception:
        return False

def normalize_worker_candidate(raw):
    return {
        'name':raw.get('shipping_match_name') or raw.get('name') or '',
        'price':raw.get('shipping_included_price') or raw.get('price'),
        'url':raw.get('shipping_included_url') or raw.get('url') or '',
        'image':raw.get('shipping_included_image') or raw.get('image') or '',
        'itemCode':raw.get('item_code') or raw.get('itemCode') or '',
        'source':'worker'
    }

def worker_candidate(seed):
    query=urllib.parse.urlencode({'q':seed['query'],'hits':30})
    payload=fetch_json(WORKER+'?'+query)
    exact=[]
    for raw in payload.get('products',[]):
        c=normalize_worker_candidate(raw)
        if canonical_item_url(c['url'])==canonical_item_url(seed['itemUrl']) and identity_ok(c['name'],seed):
            exact.append(c)
    if exact:
        exact.sort(key=lambda x:0 if safe_affiliate(x['url'],seed['itemUrl']) else 1)
        return exact[0]
    lookup=fetch_json(SHIPPING_LOOKUP+'?'+urllib.parse.urlencode({'name':seed['query'],'brand':seed.get('brand','')}))
    if lookup.get('found') is True:
        c=normalize_worker_candidate(lookup)
        if canonical_item_url(c['url'])==canonical_item_url(seed['itemUrl']) and identity_ok(c['name'],seed):
            return c
    return None

def rakuten_api_candidate(seed):
    env={k:os.environ.get(k,'').strip() for k in ['RAKUTEN_APPLICATION_ID','RAKUTEN_ACCESS_KEY','RAKUTEN_AFFILIATE_ID']}
    if not all(env.values()): return None
    params={
        'applicationId':env['RAKUTEN_APPLICATION_ID'],
        'affiliateId':env['RAKUTEN_AFFILIATE_ID'],
        'keyword':seed['query'],
        'hits':30,'formatVersion':2,'availability':1
    }
    headers={**HEADERS,'accessKey':env['RAKUTEN_ACCESS_KEY']}
    payload=fetch_json(RAKUTEN_API+'?'+urllib.parse.urlencode(params),headers)
    for raw in payload.get('items') or payload.get('Items') or []:
        item=raw.get('Item',raw)
        item_url=canonical_item_url(item.get('itemUrl',''))
        name=item.get('itemName','')
        if item_url!=canonical_item_url(seed['itemUrl']) or not identity_ok(name,seed): continue
        imgs=item.get('mediumImageUrls') or []
        image=imgs[0] if imgs else ''
        if isinstance(image,dict): image=image.get('imageUrl','')
        return {
            'name':name,'price':item.get('itemPrice'),'url':item.get('affiliateUrl',''),
            'image':image,'itemCode':item.get('itemCode',''),'source':'rakuten_api'
        }
    return None

def page_sales_audit(seed,expected_price):
    """Return (mode, live_price). Exact URL + identity is mandatory.
    Rakuten occasionally sends tiny anti-bot responses in Actions; that case may use
    exact Worker/API evidence, but a real page that contradicts the audit always fails.
    """
    try:
        page=fetch_text(seed['itemUrl'])
    except Exception:
        return 'exact_feed_fallback',expected_price
    if not identity_ok(page,seed):
        # Promotional page text can be large; if none of the required vehicle terms exist,
        # never accept the listing.
        raise ValueError('page_identity_mismatch')
    marker='"itemInfoSku":'
    if marker not in page:
        if len(page)<1024: return 'exact_feed_fallback',expected_price
        return 'page_identity_only',expected_price
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
            candidate=worker_candidate(seed)
            if candidate is None:
                candidate=rakuten_api_candidate(seed)
            if candidate is None: raise ValueError('exact_listing_not_found')
            if not safe_affiliate(candidate['url'],seed['itemUrl']): raise ValueError('unsafe_or_wrong_affiliate')
            price=candidate.get('price')
            if not isinstance(price,(int,float)) or price<=0: raise ValueError('price_unknown')
            image=candidate.get('image','')
            if not isinstance(image,str) or not image.startswith('https://'): raise ValueError('image_unknown')
            mode,live_price=page_sales_audit(seed,int(price))
            products.append({
                'productId':seed['productId'],
                'name':candidate.get('name') or seed['name'],
                'brand':seed.get('brand',''),
                'gapIds':seed['gapIds'],
                'recommendationRole':seed.get('recommendationRole','beginner_default'),
                'score':seed.get('score',80),
                'price':int(live_price),
                'itemCode':candidate.get('itemCode',''),
                'itemUrl':canonical_item_url(seed['itemUrl']),
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
