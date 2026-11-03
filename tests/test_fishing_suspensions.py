import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('suspensions', Path(__file__).resolve().parents[1]/'fishing/scripts/apply_suspensions.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SuspensionTests(unittest.TestCase):
    def test_shared_catalog_cannot_restore_stopped_item_or_refresh_dates(self):
        catalog = {'products': [{'productId': 'stop'}, {'productId': 'keep', 'verifiedAt': 'old'}], 'updatedAt': 'old', 'failures': {'other': 'unresolved'}}
        result = module.apply_suspensions(catalog, [{'productId': 'stop', 'suspended': True, 'suspendedReason': 'OutOfStock'}])
        self.assertEqual(result['products'], [{'productId': 'keep', 'verifiedAt': 'old'}])
        self.assertEqual(result['updatedAt'], 'old')
        self.assertEqual(result['verifiedCount'], 1)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['failures']['other'], 'unresolved')
        self.assertEqual(len(catalog['products']), 2)

    def test_no_manual_stop_leaves_catalog_unchanged(self):
        catalog = {'products': [{'productId': 'keep'}], 'status': 'verified'}
        self.assertEqual(module.apply_suspensions(catalog, [{'productId': 'keep', 'suspended': False}]), catalog)

    def test_stop_remains_visible_even_when_upstream_already_omitted_it(self):
        result = module.apply_suspensions({'products': []}, [{'productId': 'stop', 'suspended': True}])
        self.assertIn('stop', result['failures'])
        self.assertEqual(result['products'], [])

    def test_unconfirmed_lumica_reel_must_not_be_sold_as_rod_reel(self):
        """Seller verification alone cannot establish missing bundle components."""
        seed_file = Path(__file__).resolve().parents[1]/'fishing/data/product-seeds/choi-lumica-start.json'
        seed = json.loads(seed_file.read_text())
        self.assertEqual(seed['productId'], 'lumica-choi-start-g09224')
        self.assertEqual(seed['categoryId'], 'rod_reel')
        self.assertTrue(seed['suspended'])
        self.assertIn('reel', seed['suspendedReason'].lower())
        imported = {
            'updatedAt': '2026-11-03T10:00:00Z',
            'status': 'verified',
            'products': [
                {'productId': seed['productId'], 'verifiedAt': '2026-11-03T10:00:00Z',
                 'audit': {'status': 'verified_live'}, 'price': 3720}
            ],
        }
        output = module.apply_suspensions(imported, [seed])
        self.assertEqual(output['products'], [])
        self.assertEqual(output['verifiedCount'], 0)
        self.assertEqual(output['status'], 'partial')
        self.assertEqual(output['updatedAt'], imported['updatedAt'])
        self.assertIn('manual_suspension:', output['failures'][seed['productId']])
        self.assertIn('reel', output['failures'][seed['productId']].lower())

