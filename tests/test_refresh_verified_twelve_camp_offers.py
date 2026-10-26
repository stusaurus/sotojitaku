"""Two requalified sellers retain independent proof and stop-on-429 rules."""
import unittest
import test_refresh_verified_nine_camp_offers as nine

class TwelveCertifiedSellers(unittest.TestCase):
 def simulate(self, **kwargs):
  return nine.NineIndependentSellers().simulate(targets=nine.renewal.TARGETS[:12], **kwargs)

 def test_requalified_sellers_keep_original_specs_and_identity(self):
  audits,catalog,report,calls=self.simulate()
  self.assertEqual(report['maximumApiCalls'],12)
  self.assertEqual(report['attempted'],12)
  self.assertEqual(len(calls),24)
  self.assertEqual(len(catalog['products']),12)
  for model,code in [('2000038141','sports-bazaar:10314223'),('2205813','naturum:18689872')]:
   product=next(p for p in catalog['products'] if p['model']==model)
   audit=next(p for p in audits['products'] if p['model']==model)
   self.assertEqual(product['spec'],audit['spec'])
   self.assertEqual(product['itemCode'],code)
   self.assertEqual(product['verificationMode'],'sales_page_and_official_item_api')

 def test_429_before_tent_prevents_both_new_offers(self):
  _,catalog,report,calls=self.simulate(blocked='2000038141')
  self.assertTrue(report['stoppedByRateLimit'])
  self.assertNotIn(('browser','2000038141'),calls)
  self.assertNotIn(('api','2205813'),calls)
  self.assertEqual(len(catalog['products']),10)

 def test_unavailable_family_table_is_not_added(self):
  _,catalog,report,calls=self.simulate(out_of_stock='2205813')
  self.assertNotIn(('browser','2205813'),calls)
  self.assertNotIn('2205813',{p['model'] for p in catalog['products']})
  self.assertEqual(len(catalog['products']),11)

if __name__=='__main__': unittest.main()
