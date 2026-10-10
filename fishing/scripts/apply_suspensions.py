"""Apply local manual stops to imported catalogs without inventing verification."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def apply_suspensions(catalog, seeds):
    stopped = {s['productId']: s for s in seeds if s.get('suspended') is True}
    result = dict(catalog)
    result['products'] = [p for p in catalog['products'] if p['productId'] not in stopped]
    if stopped:
        result['status'] = 'partial'
        result['verifiedCount'] = len(result['products'])
        result['failures'] = dict(catalog.get('failures', {}))
        for product_id, seed in stopped.items():
            result['failures'][product_id] = 'manual_suspension: ' + seed.get('suspendedReason', 'review required')
    return result


if __name__ == '__main__':
    path = Path(sys.argv[1])
    seeds = [json.loads(p.read_text()) for p in (ROOT/'fishing/data/product-seeds').glob('*.json')]
    path.write_text(json.dumps(apply_suspensions(json.loads(path.read_text()), seeds), ensure_ascii=False, indent=2)+'\n')
