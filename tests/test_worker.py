import unittest,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from refresh_worker import parse_listing, live_item_code
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
if __name__=='__main__':unittest.main()
