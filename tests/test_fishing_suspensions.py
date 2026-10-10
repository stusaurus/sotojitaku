import importlib.util
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
