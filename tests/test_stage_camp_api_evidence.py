import json
import sys
import unittest
from datetime import datetime,timezone
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import stage_camp_api_evidence as stage

ITEM="https://item.rakuten.co.jp/realshop/st-310/"
AFFILIATE="https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Frealshop%2Fst-310%2F"
AUDIT={"category":"burner","model":"ST-310","itemCode":"realshop:st-310","itemUrl":ITEM,
 "referencePrice":7480,"audited":True,"bodyConfirmed":True,"fixedVariant":True,
 "available":True,"priceAudit":True,"condition":"new","quantityPerListing":1}
EQUIPMENT={"global_exclude_terms":["中古"],"categories":[{"id":"burner","include_any":["バーナー","レギュレーターストーブ"],"exclude_any":["風防","ケース"]}]}
LIVE={"found":True,"item_url":ITEM,"affiliate_url":AFFILIATE,"item_code":AUDIT["itemCode"],
 "name":"SOTO レギュレーターストーブ ST-310","price":7480,"availability":1,
 "tax_flag":0,"postage_flag":0,"purchasable_min_price":7480,
 "purchasable_max_price":7480,"image":"https://thumbnail.image.rakuten.co.jp/seller/x.jpg",
 "seller_variant_verified":False}
NOW="2026-10-17T12:00:00+00:00"

class EvidenceSafety(unittest.TestCase):
 def evaluate(self,changes):
  return stage.validate_candidate(AUDIT,{**LIVE,**changes},EQUIPMENT,NOW)
 def test_official_api_exact_item_can_only_be_staged_for_seller_review(self):
  x=self.evaluate({})
  self.assertEqual(x['status'],'api_confirmed_seller_variant_audit_required')
  self.assertFalse(x['verifiedForPublication'])
  self.assertNotIn('verifiedAt',x)
  self.assertNotIn('listingAuditedAt',x)
  self.assertEqual(x['currentApiPrice'],7480)
 def test_wrong_rakuten_product_link_and_affiliate_pc_are_rejected(self):
  self.assertEqual(self.evaluate({'item_url':'https://item.rakuten.co.jp/realshop/other/'})['status'],'wrong_item_or_affiliate_url')
  self.assertEqual(self.evaluate({'affiliate_url':'https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Frealshop%2Fother%2F'})['status'],'wrong_item_or_affiliate_url')
 def test_changed_item_code_requires_reaudit_even_if_url_is_same(self):
  self.assertEqual(self.evaluate({'item_code':'realshop:new-sku'})['status'],'changed_item_code_needs_manual_audit')
 def test_accessory_with_model_is_rejected(self):
  self.assertEqual(self.evaluate({'name':'SOTO ST-310 専用 ケース バーナー'})['status'],'wrong_model_or_accessory')
 def test_missing_postage_tax_stock_or_price_range_is_not_inferred(self):
  cases=[('availability',None,'availability_unverified'),('postage_flag',None,'postage_inclusion_unverified'),
   ('postage_flag',1,'postage_inclusion_unverified'),('tax_flag',1,'tax_inclusion_unverified'),
   ('purchasable_max_price',None,'purchasable_range_unverified'),
   ('purchasable_max_price',9000,'variable_purchasable_price'),('price',1,'price_unverified')]
  for field,value,status in cases:
   with self.subTest(field=field,value=value):
    self.assertEqual(self.evaluate({field:value})['status'],status)
 def test_empty_or_rate_limited_remains_unconfirmed(self):
  self.assertEqual(self.evaluate({'found':False})['status'],'exact_item_not_found')
  self.assertEqual(self.evaluate({'error':'worker_unavailable','upstream_status':429})['status'],'rate_limited')
 def test_sampling_limit_is_two_one_per_distinct_category(self):
  audits=[AUDIT,{**AUDIT,'model':'ST-340'},{**AUDIT,'category':'tent','model':'TENT'},{**AUDIT,'category':'mat','model':'MAT'}]
  self.assertEqual([a['model'] for a in stage.candidate_audits(audits)],['ST-310','TENT'])
  self.assertEqual([a['model'] for a in stage.candidate_audits(audits,offset=1,limit=1)],['TENT'])
  with self.assertRaises(ValueError):stage.candidate_audits(audits,limit=100)
 def test_stage_stops_after_429_and_does_not_edit_public_catalog(self):
  with TemporaryDirectory() as d:
   root=Path(d);(root/'data').mkdir()
   audits=[AUDIT,{**AUDIT,'category':'tent','model':'TENT'}]
   (root/'data/audited-products.json').write_text(json.dumps({'products':audits}))
   (root/'data/equipment.json').write_text(json.dumps(EQUIPMENT))
   public=root/'data/products.json';public.write_text('{"products":["leave untampered"]}')
   calls=[]
   def fetch(req):
    calls.append(req.full_url)
    return {'error':'worker_unavailable','upstream_status':429}
   result=stage.stage(fetch=fetch,root=root,now=NOW)
   self.assertTrue(result['blockedByRateLimit'])
   self.assertEqual(result['attempted'],1)
   self.assertEqual(len(calls),1)
   self.assertEqual(public.read_text(),'{"products":["leave untampered"]}')
   self.assertEqual(result['results'][0]['status'],'rate_limited')

if __name__=="__main__":unittest.main()
