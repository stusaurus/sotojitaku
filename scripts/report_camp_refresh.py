"""Produce a bounded, credential-free CAMP catalog refresh diagnostic artifact."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build_report(catalog):
    failures = catalog.get('itemFailures') or {}
    counts = Counter(str(reason) for reason in failures.values())
    return {
        'schemaVersion': 1,
        'runUpdatedAt': catalog.get('updatedAt'),
        'status': catalog.get('status'),
        'verifiedProductCount': len(catalog.get('products') or []),
        'failedCategories': sorted(set(catalog.get('failedCategories') or [])),
        'failureReasonCounts': dict(sorted(counts.items())),
        'failedAuditCount': len(failures),
    }


if __name__ == '__main__':
    catalog = json.loads((ROOT / 'data/products.json').read_text(encoding='utf-8'))
    report = build_report(catalog)
    dest = ROOT / 'reports/camp-refresh-health.json'
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('CAMP_REFRESH_HEALTH', json.dumps(report, ensure_ascii=False, sort_keys=True))
