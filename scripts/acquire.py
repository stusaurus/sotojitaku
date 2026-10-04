"""Fetch Rakuten listings and merge only exact itemCode, manually evidenced specs.
Secrets remain server-side in Actions; no browser proxy or public API credential.
A failed refresh publishes an empty catalog, never revives uncertain old listings.
"""
from __future__ import annotations
import json, os, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[1]
API='https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701'
def fetch_with_retry(req, opener=urllib.request.urlopen, sleep=time.sleep):
    for attempt in range(3):
        try:
            with opener(req,timeout=25) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code not in (429,500,502,503,504) or attempt==2: raise
            try: delay=float(e.headers.get('Retry-After','0'))
            except (TypeError,ValueError): delay=0
            sleep(min(10,max(1+attempt*2,delay)))
        except (urllib.error.URLError,TimeoutError):
            if attempt==2: raise
            sleep(1+attempt*2)
def canonical_item_url(value):
    u=urllib.parse.urlparse(value or '')
    if u.hostname=='hb.afl.rakuten.co.jp':return urllib.parse.parse_qs(u.query).get('pc',[''])[0]
    return value

def acquire():
    products=[];errors=[]
    env={k:os.environ.get(k,'').strip() for k in ['RAKUTEN_APPLICATION_ID','RAKUTEN_ACCESS_KEY','RAKUTEN_AFFILIATE_ID']}
    if not all(env.values()):
        return {'version':1,'products':[],'status':'missing_credentials','updatedAt':datetime.now(timezone.utc).isoformat()}
    equipment=json.loads((ROOT/'data/equipment.json').read_text())
    audits=json.loads((ROOT/'data/audited-products.json').read_text())['products']
    now=datetime.now(timezone.utc).isoformat()
    seen=set()
    for c in equipment['categories']:
        raw=[];category_failed=False
        for query in c['queries']:
            params={'applicationId':env['RAKUTEN_APPLICATION_ID'],'affiliateId':env['RAKUTEN_AFFILIATE_ID'],'keyword':query,'hits':30,'formatVersion':2,'availability':1}
            req=urllib.request.Request(API+'?'+urllib.parse.urlencode(params),headers={'accessKey':env['RAKUTEN_ACCESS_KEY'],'Origin':'https://stusaurus.github.io','Referer':'https://stusaurus.github.io/sotojitaku/','User-Agent':'sotojitaku-camp/1.0'})
            try:
                payload=fetch_with_retry(req)
                raw.extend(payload.get('items') or payload.get('Items') or [])
            except Exception:
                # Do not log credential-bearing request URLs or exception text.
                errors.append(c['id']);category_failed=True;break
            time.sleep(1.2)
        if category_failed:continue
        for raw_item in raw:
            item=raw_item.get('Item',raw_item);code=item.get('itemCode')
            audit=next((x for x in audits if x.get('itemCode')==code and x.get('category')==c['id']),None)
            if not audit or code in seen:continue
            title=item.get('itemName','')
            if any(x in title for x in equipment['global_exclude_terms']+c['exclude_any']):continue
            # Exact listing audit expires; a live price does not revalidate sales variants.
            try:
                age=(datetime.now(timezone.utc)-datetime.fromisoformat(audit['listingAuditedAt'].replace('Z','+00:00'))).days
                if age<0 or age>7:continue
                price=int(item.get('itemPrice',0))
                if price<=0:continue
            except (KeyError,TypeError,ValueError):continue
            imgs=item.get('mediumImageUrls') or []
            img=imgs[0] if imgs else ''
            if isinstance(img,dict):img=img.get('imageUrl','')
            if not img:continue
            p={**audit,'name':title,'price':price,'available':str(item.get('availability'))=='1','affiliateUrl':item.get('affiliateUrl',''),'itemUrl':canonical_item_url(item.get('itemUrl','')),'image':img,'verifiedAt':now,'shipping':'included' if str(item.get('postageFlag'))=='0' else 'unknown'}
            products.append(p);seen.add(code)
    return {'version':1,'products':products,'status':'partial_error' if errors else 'ok','failedCategories':list(set(errors)),'updatedAt':now}
if __name__=='__main__':
    payload=acquire();path=ROOT/'data/products.json';tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n');tmp.replace(path)
    print('catalog status:',payload['status'],'verified candidates:',len(payload['products']))
