"""The reaudited burner may enter only through the existing two-source gates."""
import unittest
import test_refresh_verified_nine_camp_offers as nine

class TenCertifiedSellers(unittest.TestCase):
 def simulate(self, **kwargs):
  return nine.NineIndependentSellers().simulate(targets=nine.renewal.TARGETS[:10], **kwargs)

 def test_new_merchant_renews_after_independent_api_and_fixed_sku_evidence(self):
  audits,catalog,report,calls=self.simulate()
  self.assertEqual(report['maximumApiCalls'],10)
  self.assertEqual(report['attempted'],10)
  self.assertEqual(len(calls),20)
  self.assertEqual(catalog['status'],'ok')
  self.assertEqual(catalog['failedCategories'],[])
  burner=next(p for p in catalog['products'] if p['category']=='burner')
  self.assertEqual(burner['model'],'ST-340')
  self.assertEqual(burner['itemCode'],'naturum:18596563')
  self.assertEqual(burner['itemUrl'],'https://item.rakuten.co.jp/naturum/3304081/')
  original=next(p for p in audits['products'] if p['model']=='ST-340')
  self.assertEqual(burner['spec'],original['spec'])
  self.assertEqual(burner['verifiedAt'],nine.NOW.isoformat())

 def test_burner_429_never_creates_a_fresh_offer(self):
  _,catalog,report,calls=self.simulate(blocked='ST-340')
  self.assertEqual(report['attempted'],10)
  self.assertTrue(report['stoppedByRateLimit'])
  self.assertNotIn(('browser','ST-340'),calls)
  self.assertEqual(len(catalog['products']),9)
  self.assertEqual(catalog['failedCategories'],['burner'])

 def test_unavailable_burner_never_reaches_the_seller_or_recommendations(self):
  _,catalog,report,calls=self.simulate(out_of_stock='ST-340')
  self.assertNotIn(('browser','ST-340'),calls)
  self.assertEqual(len(catalog['products']),9)
  self.assertEqual(catalog['status'],'partial_error')
  self.assertEqual(catalog['failedCategories'],['burner'])

if __name__=='__main__': unittest.main()
