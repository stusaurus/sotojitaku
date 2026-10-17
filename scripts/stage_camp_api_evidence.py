"""Stage *review candidates* from the 2026 Rakuten Item API via the shared Worker.

This does NOT refresh data/products.json. A seller's current fixed variants,
stock quantity, and cart total cannot be certified by the public Item API
alone. The returned JSON is only an isolated GitHub Actions review artifact.
"""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from acquire import ROOT
from refresh_worker import identity_gate

WORKER = "https://daily-cost-api.stuffedsaurus.workers.dev/api/item-evidence"
HEADERS = {
    "Origin": "https://stusaurus.github.io",
    "Referer": "https://stusaurus.github.io/sotojitaku/",
    "User-Agent": "sotojitaku-camp-evidence-stage/1.0",
}
MAX_QUERIES = 2

def candidate_audits(audits, *, offset=0, limit=MAX_QUERIES):
    if not isinstance(limit, int) or not 1 <= limit <= MAX_QUERIES:
        raise ValueError('max_two_queries_per_execution')
    if not isinstance(offset, int) or offset < 0:
        raise ValueError('offset_must_be_nonnegative')
    # First pass deliberately samples *different categories*, not dozens of
    # SKUs of the same category. A manual later run can rotate the offset.
    selected = []
    seen = set()
    for audit in audits:
        if not audit.get('itemCode') or not audit.get('itemUrl'):
            continue
        if audit['category'] not in seen:
            selected.append(audit)
            seen.add(audit['category'])
    return selected[offset:offset+limit]

def canonical_item_url(url):
    try:
        parsed=urllib.parse.urlparse(str(url))
        if parsed.scheme != 'https' or parsed.netloc != 'item.rakuten.co.jp':
            return None
        parts=parsed.path.strip('/').split('/')
        if len(parts)!=2 or not all(parts):
            return None
        if parsed.query or parsed.fragment:
            return None
        return f'https://item.rakuten.co.jp/{parts[0]}/{parts[1]}/'
    except (TypeError,ValueError):
        return None

def affiliate_destination(url):
    try:
        parsed=urllib.parse.urlparse(str(url))
        if parsed.scheme != 'https' or parsed.netloc != 'hb.afl.rakuten.co.jp' or not parsed.path.startswith('/hgc/'):
            return None
        pc=urllib.parse.parse_qs(parsed.query).get('pc',[None])[0]
        return canonical_item_url(pc)
    except (TypeError,ValueError):
        return None

def request_exact(audit, fetch=None):
    params={'url':audit['itemUrl'],'itemCode':audit['itemCode']}
    req=urllib.request.Request(WORKER+'?'+urllib.parse.urlencode(params),headers=HEADERS)
    if fetch is not None:
        return fetch(req)
    try:
        with urllib.request.urlopen(req,timeout=30) as r:
            return json.loads(r.read(100000).decode('utf-8'))
    except urllib.error.HTTPError as err:
        try:
            body=json.loads(err.read(4096).decode('utf-8'))
        except (UnicodeError,ValueError):
            body={}
        return {'error':'worker_unavailable','upstream_status':body.get('upstream_status'),'worker_status':err.code}
    except (urllib.error.URLError,TimeoutError,UnicodeError,ValueError):
        return {'error':'worker_unavailable','upstream_status':None,'worker_status':None}

def validate_candidate(audit, live, equipment, observed_at):
    # Do not update listingAuditedAt, verifiedAt or any live catalog product.
    base={'category':audit.get('category'),'model':audit.get('model'),'evidenceObservedAt':observed_at}
    def outcome(status, **extra): return {**base,'status':status,**extra}
    if not isinstance(live,dict):
        return outcome('invalid_response')
    if live.get('error'):
        if live.get('upstream_status') == 429:
            return outcome('rate_limited')
        return outcome('worker_unavailable')
    if live.get('found') is not True:
        return outcome('exact_item_not_found')
    if live.get('lookup_method') != 'exact_item_code_only':
        return outcome('untrusted_lookup_method')
    expected=canonical_item_url(audit.get('itemUrl'))
    actual=canonical_item_url(live.get('item_url'))
    if not expected or actual!=expected or affiliate_destination(live.get('affiliate_url'))!=expected:
        return outcome('wrong_item_or_affiliate_url')
    code=live.get('item_code')
    if code!=audit.get('itemCode') or not str(code).startswith(expected.split('/')[3]+':'):
        return outcome('changed_item_code_needs_manual_audit')
    if not identity_gate(live.get('name',''),audit,equipment):
        return outcome('wrong_model_or_accessory')
    if live.get('availability')!=1:
        return outcome('availability_unverified')
    if live.get('tax_flag')!=0:
        return outcome('tax_inclusion_unverified')
    if live.get('postage_flag')!=0:
        return outcome('postage_inclusion_unverified')
    price=live.get('price')
    reference=audit.get('referencePrice')
    if type(price) is not int or price<=0 or type(reference) not in (int,float) or reference<=0 or price<reference*.35:
        return outcome('price_unverified')
    min_price,max_price=live.get('purchasable_min_price'),live.get('purchasable_max_price')
    if type(min_price) is not int or type(max_price) is not int:
        return outcome('purchasable_range_unverified')
    if min_price!=price or max_price!=price:
        return outcome('variable_purchasable_price')
    if not str(live.get('image','')).startswith('https://thumbnail.image.rakuten.co.jp/'):
        return outcome('image_unverified')
    if not all(audit.get(field) is True for field in ('audited','bodyConfirmed','fixedVariant','available','priceAudit')):
        return outcome('historical_audit_incomplete')
    if audit.get('condition')!='new' or audit.get('quantityPerListing')!=1:
        return outcome('quantity_condition_unverified')
    # Important: equal Item API min/max still cannot prove there are no
    # selectable options. The seller HTML/cart must be independently rechecked.
    return outcome(
        'api_confirmed_seller_variant_audit_required',
        itemCode=code,itemUrl=expected,currentApiPrice=price,
        postageFlag=0,taxFlag=0,availability=1,
        verifiedForPublication=False,
    )

def stage(*, max_queries=MAX_QUERIES,offset=0, fetch=None, now=None, root=ROOT):
    audits=json.loads((root/'data/audited-products.json').read_text(encoding='utf-8'))['products']
    equipment=json.loads((root/'data/equipment.json').read_text(encoding='utf-8'))
    sampled=candidate_audits(audits,offset=offset,limit=max_queries)
    now=now or datetime.now(timezone.utc).isoformat()
    results=[]
    for audit in sampled:
        live=request_exact(audit,fetch=fetch)
        result=validate_candidate(audit,live,equipment,now)
        results.append(result)
        if result['status']=='rate_limited':
            break
    return {
        'schemaVersion':1,
        'type':'research_only_not_for_publication',
        'generatedAt':now,
        'maxApiRequests':MAX_QUERIES,
        'attempted':len(results),
        'blockedByRateLimit':bool(results and results[-1]['status']=='rate_limited'),
        'results':results,
    }

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--offset',type=int,default=0)
    parser.add_argument('--limit',type=int,default=MAX_QUERIES)
    args=parser.parse_args()
    result=stage(max_queries=args.limit,offset=args.offset)
    dest=ROOT/'reports/camp-api-evidence-candidates.json'
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('CAMP_API_EVIDENCE',json.dumps({
        'attempted':result['attempted'],
        'blockedByRateLimit':result['blockedByRateLimit'],
        'statuses':[row['status'] for row in result['results']]
    },ensure_ascii=False))
