"""Requalified alternatives keep exact seller, expiry and stock proof rules."""
import unittest
import test_refresh_verified_nine_camp_offers as nine

class RequalifiedSellers(unittest.TestCase):
 def test_every_allowlisted_seller_requires_both_sources(self):
  audits,catalog,report,calls=nine.NineIndependentSellers().simulate(targets=nine.renewal.TARGETS)
  self.assertEqual(report['maximumApiCalls'],20)
  self.assertEqual(report['attempted'],20)
  self.assertEqual(len(catalog['products']),20)
  for product in catalog['products']:
   original=next(a for a in audits['products'] if (a['category'],a['model'])==(product['category'],product['model']))
   self.assertEqual(product['spec'],original['spec'])
   self.assertEqual(product['itemCode'],original['itemCode'])
   self.assertIn(('api',product['model']),calls)
   self.assertIn(('browser',product['model']),calls)
  self.assertNotIn(('mat','1124667'),nine.renewal.TARGETS,'current seller SKU stock zero despite API availability')
  self.assertNotIn(('cooler','2244060'),nine.renewal.TARGETS,'day-use model has no independently confirmed overnight suitability')
  self.assertEqual(next(p for p in catalog['products'] if p['model']=='2205811')['itemCode'],'naturum:18689873')
  self.assertEqual(next(p for p in catalog['products'] if p['model']=='2238145')['itemCode'],'naturum-outdoor:10744082')

 def test_unavailable_second_family_table_never_enters_snapshot(self):
  _,catalog,_,calls=nine.NineIndependentSellers().simulate(targets=nine.renewal.TARGETS,out_of_stock='2205811')
  self.assertNotIn(('browser','2205811'),calls)
  self.assertNotIn('2205811',{p['model'] for p in catalog['products']})

 def test_rate_limit_at_second_table_stops_later_overnight_cooler(self):
  _,catalog,report,calls=nine.NineIndependentSellers().simulate(targets=nine.renewal.TARGETS,blocked='2205811')
  self.assertTrue(report['stoppedByRateLimit'])
  self.assertNotIn(('api','2238145'),calls)
  self.assertNotIn('2238145',{p['model'] for p in catalog['products']})

 def test_rate_limit_stops_before_remaining_family_alternatives(self):
  _,catalog,report,calls=nine.NineIndependentSellers().simulate(targets=nine.renewal.TARGETS,blocked='2000039087')
  self.assertTrue(report['stoppedByRateLimit'])
  self.assertNotIn(('browser','2000039087'),calls)
  self.assertNotIn(('api','2185614'),calls)
  self.assertNotIn('2000039087',{p['model'] for p in catalog['products']})

if __name__=='__main__':unittest.main()
