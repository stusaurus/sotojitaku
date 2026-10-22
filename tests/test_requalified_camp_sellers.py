"""Requalified alternatives keep exact seller, expiry and stock proof rules."""
import unittest
import test_refresh_verified_nine_camp_offers as nine

class RequalifiedSellers(unittest.TestCase):
 def test_every_allowlisted_seller_requires_both_sources(self):
  audits,catalog,report,calls=nine.NineIndependentSellers().simulate(targets=nine.renewal.TARGETS)
  self.assertEqual(report['maximumApiCalls'],18)
  self.assertEqual(report['attempted'],18)
  self.assertEqual(len(catalog['products']),18)
  for product in catalog['products']:
   original=next(a for a in audits['products'] if (a['category'],a['model'])==(product['category'],product['model']))
   self.assertEqual(product['spec'],original['spec'])
   self.assertEqual(product['itemCode'],original['itemCode'])
   self.assertIn(('api',product['model']),calls)
   self.assertIn(('browser',product['model']),calls)
  self.assertNotIn(('mat','1124667'),nine.renewal.TARGETS,'current seller SKU stock zero despite API availability')

 def test_rate_limit_stops_before_remaining_family_alternatives(self):
  _,catalog,report,calls=nine.NineIndependentSellers().simulate(targets=nine.renewal.TARGETS,blocked='2000039087')
  self.assertTrue(report['stoppedByRateLimit'])
  self.assertNotIn(('browser','2000039087'),calls)
  self.assertNotIn(('api','2185614'),calls)
  self.assertNotIn('2000039087',{p['model'] for p in catalog['products']})

if __name__=='__main__':unittest.main()
