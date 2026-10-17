import unittest,sys,json,io,urllib.error
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from refresh_worker import parse_listing, live_item_code, body_gate, identity_gate, code_lookup_allowed, name_lookup_allowed, worker_fallback_allowed, fetch_worker_json, UpstreamUnavailable, should_open_circuit
class RateLimitCircuit(unittest.TestCase):
 def make_error(self, status, body):
  return urllib.error.HTTPError('https://example.invalid/safe',status,'upstream',None,io.BytesIO(body.encode()))
 def test_worker_upstream_429_short_circuits(self):
  def fetch(_):raise self.make_error(502,'{"error":"rakuten_api_error","upstream_status":429}')
  with self.assertRaisesRegex(UpstreamUnavailable,'upstream_rate_limited'):
   fetch_worker_json(None,fetch=fetch)
  self.assertTrue(should_open_circuit('upstream_rate_limited',1))
 def test_live_call_to_worker_attempts_once_when_wrapped_429(self):
  calls=[]
  def opener(*args,**kwargs):
   calls.append(args)
   raise self.make_error(502,'{"error":"rakuten_api_error","upstream_status":429}')
  with patch('refresh_worker.urllib.request.urlopen', side_effect=opener):
   with self.assertRaisesRegex(UpstreamUnavailable,'upstream_rate_limited'):
    fetch_worker_json(None)
  self.assertEqual(len(calls),1)
 def test_repeated_transient_failures_open_after_three(self):
  def fetch(_):raise self.make_error(502,'{"error":"rakuten_api_error"}')
  with self.assertRaisesRegex(UpstreamUnavailable,'upstream_api_unavailable'):
   fetch_worker_json(None,fetch=fetch)
  self.assertFalse(should_open_circuit('upstream_api_unavailable',1))
  self.assertFalse(should_open_circuit('upstream_api_unavailable',2))
  self.assertTrue(should_open_circuit('upstream_api_unavailable',3))
 def test_unrelated_worker_502_still_raises(self):
  def fetch(_):raise self.make_error(502,'{"error":"invalid_query"}')
  with self.assertRaises(urllib.error.HTTPError):
   fetch_worker_json(None,fetch=fetch)
 def test_permanent_403_still_raises(self):
  def fetch(_):raise self.make_error(403,'{"error":"forbidden"}')
  with self.assertRaises(urllib.error.HTTPError):
   fetch_worker_json(None,fetch=fetch)

class SalesAudit(unittest.TestCase):
 def info(self):
  return {'itemId':1,'sellType':'NORMAL','inventoryType':'single','sku':[],'purchaseInfo':{'purchaseBySellType':{'purchaseCondition':'enabled','normalPurchase':{'price':{'minPrice':1000}}},'variantMappedInventories':[{'quantity':1}]}}
 def check(self,info):return parse_listing('MODEL "itemInfoSku":'+json.dumps(info),'MODEL',1000,1)
 def test_valid_single(self):self.assertTrue(self.check(self.info()))
 def test_changed_price(self):
  x=self.info();x['purchaseInfo']['purchaseBySellType']['normalPurchase']['price']['minPrice']=500
  with self.assertRaises(ValueError):self.check(x)
 def test_two_variants(self):
  x=self.info();x['inventoryType']='multiple';x['sku']=[{},{}]
  with self.assertRaises(ValueError):self.check(x)
 def test_out_of_stock(self):
  x=self.info();x['purchaseInfo']['variantMappedInventories'][0]['quantity']=0
  with self.assertRaises(ValueError):self.check(x)
 def test_missing_data(self):
  with self.assertRaises(ValueError):parse_listing('model only','MODEL',1000,1)
 def test_live_item_code(self):
  url='https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2Fsku%2F&m=http%3A%2F%2Fm.rakuten.co.jp%2Fshop%2Fi%2F12345678%2F'
  self.assertEqual(live_item_code(url),'shop:12345678')
 def test_optional_item_id(self):
  self.assertTrue(parse_listing('MODEL "itemInfoSku":'+json.dumps(self.info()),'MODEL',1000,None))
 def equipment(self):
  return {'global_exclude_terms':['中古'],'categories':[{'id':'burner','include_any':['バーナー','レギュレーターストーブ'],'exclude_any':['風防','アシストグリップ']}]}
 def audit(self):
  return {'category':'burner','model':'ST-310','audited':True,'bodyConfirmed':True,'fixedVariant':True,'available':True,'priceAudit':True,'condition':'new','quantityPerListing':1,'referencePrice':7480}
 def test_body_gate_rejects_accessory_with_model_number(self):
  self.assertFalse(body_gate('SOTO ST-310 対応 風防 シングルバーナー用', 'burner', self.equipment()))
  self.assertTrue(body_gate('SOTO レギュレーターストーブ ST-310', 'burner', self.equipment()))
 def test_blocked_page_fallback_requires_exact_body_conditions(self):
  m={'shipping_match_name':'SOTO レギュレーターストーブ ST-310','shipping_included_price':7480,'shipping_included_image':'https://thumbnail.image.rakuten.co.jp/x.jpg'}
  self.assertTrue(worker_fallback_allowed(self.audit(),m,self.equipment(),0,'blocked'))
  m['shipping_match_name']='SOTO ST-310 対応 風防'
  self.assertFalse(worker_fallback_allowed(self.audit(),m,self.equipment(),0,'blocked'))
 def test_fallback_expires_after_seven_days(self):
  m={'shipping_match_name':'SOTO レギュレーターストーブ ST-310','shipping_included_price':7480,'shipping_included_image':'https://thumbnail.image.rakuten.co.jp/x.jpg'}
  self.assertFalse(worker_fallback_allowed(self.audit(),m,self.equipment(),8,'blocked'))
 def test_name_lookup_requires_verified_method(self):
  e={'global_exclude_terms':[],'categories':[{'id':'burner','include_any':['レギュレーターストーブ'],'exclude_any':['風防']}]}
  a={'category':'burner','model':'ST-340','identityTerms':['レギュレーターストーブ','ST-340'],'itemUrl':'https://item.rakuten.co.jp/shop/body/','referencePrice':9000}
  m={'found':True,'lookup_method':'product_name_specs_verified','shipping_match_name':'SOTO レギュレーターストーブ Range ST-340','shipping_included_url':'https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2Fbody%2F','shipping_included_price':9790,'shipping_included_image':'https://thumbnail.image.rakuten.co.jp/x.jpg'}
  self.assertTrue(name_lookup_allowed(a,m,e))
  m['lookup_method']='product_name_specs'
  self.assertFalse(name_lookup_allowed(a,m,e))
 def test_jan_code_lookup_requires_fixed_url_and_body(self):
  e={'global_exclude_terms':['風防'],'categories':[{'id':'burner','include_any':['レギュレーターストーブ'],'exclude_any':['風防','アシストグリップ']}]}
  a={'category':'burner','model':'ST-310','lookupCode':'4953571073101','identityTerms':['レギュレーターストーブ','ST-310'],'itemUrl':'https://item.rakuten.co.jp/shop/body/','referencePrice':7480}
  m={'found':True,'lookup_method':'product_code_verified','shipping_match_name':'SOTO レギュレーターストーブ ST-310','shipping_included_url':'https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2Fbody%2F','shipping_included_price':7480,'shipping_included_image':'https://thumbnail.image.rakuten.co.jp/x.jpg'}
  self.assertTrue(code_lookup_allowed(a,m,e))
  verified_by_search=dict(m,lookup_method='product_code_search_name_specs_verified')
  self.assertTrue(code_lookup_allowed(a,verified_by_search,e))
  wrong_by_search=dict(verified_by_search,shipping_included_url='https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2Fother%2F')
  self.assertFalse(code_lookup_allowed(a,wrong_by_search,e))
  unrelated_by_search=dict(verified_by_search,shipping_match_name='SOTO ST-310 専用 風防')
  self.assertFalse(code_lookup_allowed(a,unrelated_by_search,e))
  bad=dict(m);bad['shipping_match_name']='SOTO ST-310 専用 風防'
  self.assertFalse(code_lookup_allowed(a,bad,e))
  wrong=dict(m);wrong['shipping_included_url']='https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2Fother%2F'
  self.assertFalse(code_lookup_allowed(a,wrong,e))
 def test_exact_audit_identity_terms_handle_retailer_title_variants(self):
  e={'global_exclude_terms':[],'categories':[{'id':'sleeping_bag','include_any':['寝袋','シュラフ'],'exclude_any':['収納袋']}]}
  a={'category':'sleeping_bag','model':'2000034774','identityTerms':['パフォーマーIII/C5','2000034774']}
  self.assertTrue(identity_gate('Coleman パフォーマーIII/C5 オレンジ 2000034774',a,e))
  self.assertFalse(identity_gate('Coleman パフォーマーIII/C5 専用 収納袋 2000034774',a,e))
if __name__=='__main__':unittest.main()
