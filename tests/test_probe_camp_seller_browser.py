import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import probe_camp_seller_browser as proof

URL="https://item.rakuten.co.jp/naturum-outdoor/2941537/"
MODEL="2000034774"
AFF="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+__import__("urllib.parse",fromlist=["quote"]).quote(URL,safe="")
AUDIT={"category":"sleeping_bag","model":MODEL,"itemUrl":URL,"itemCode":"naturum-outdoor:10241000","referencePrice":6380,
 "audited":True,"bodyConfirmed":True,"fixedVariant":True,"available":True,
 "priceAudit":True,"condition":"new","quantityPerListing":1}
EQUIPMENT={"categories":[{"id":"sleeping_bag","include_any":["シュラフ","寝袋"],"exclude_any":["収納袋"]}],"global_exclude_terms":["中古"]}
LIVE={"found":True,"lookup_method":"exact_item_code_only","item_url":URL,"affiliate_url":AFF,
 "item_code":AUDIT["itemCode"],"name":"コールマン シュラフ パフォーマーIII/C5 オレンジ 2000034774",
 "availability":1,"price":6380,"tax_flag":0,"postage_flag":0,
 "purchasable_min_price":6380,"purchasable_max_price":6380,
 "image":"https://thumbnail.image.rakuten.co.jp/a.jpg"}
NOW="2026-10-17T14:00:00+00:00"
def sale(*,inventory=1,price=6380,sku=None):
 info={"sellType":"NORMAL","inventoryType":"single","sku":[],"purchaseInfo":{
  "purchaseBySellType":{"purchaseCondition":"enabled","normalPurchase":{"price":{"minPrice":price}}},
  "variantMappedInventories":[{"quantity":inventory}]
 }}
 if sku is not None:
  info["inventoryType"]="multiple"
  info["sku"]=sku
 return '商品ページ 2000034774 "itemInfoSku":'+json.dumps(info,ensure_ascii=False)
class SellerProof(unittest.TestCase):
 def test_valid_current_seller_and_official_api_remain_nonpublished_review_only(self):
  r=proof.seller_audit_result(AUDIT,EQUIPMENT,LIVE,URL,sale(),NOW)
  self.assertEqual(r["status"],"independent_seller_and_api_evidence_review_required")
  self.assertTrue(r["sellerConditionsValidated"])
  self.assertFalse(r["verifiedForPublication"])
  self.assertNotIn("verifiedAt",r)
 def test_blocked_small_page_never_certifies_variant(self):
  r=proof.seller_audit_result(AUDIT,EQUIPMENT,LIVE,URL,"Access denied",NOW)
  self.assertEqual(r["status"],"seller_page_conditions_unverified")
  self.assertEqual(r["evidenceReason"],"missing_sales_evidence")
 def test_missing_inventory_and_variable_seller_sku_are_rejected(self):
  for html,reason in [(sale(inventory=0),"inventory_unknown"),(sale(price=3200),"price_mismatch"),
    (sale(sku=[{},{}]),"variable_listing")]:
   with self.subTest(reason=reason):
    r=proof.seller_audit_result(AUDIT,EQUIPMENT,LIVE,URL,html,NOW)
    self.assertEqual(r["status"],"seller_page_conditions_unverified")
    self.assertEqual(r["evidenceReason"],reason)
 def test_redirect_to_different_shop_is_not_accepted(self):
  r=proof.seller_audit_result(AUDIT,EQUIPMENT,LIVE,"https://item.rakuten.co.jp/naturum/2941537/",sale(),NOW)
  self.assertEqual(r["status"],"seller_page_redirect_or_identity_mismatch")
 def test_api_rate_limit_skips_browser_entirely(self):
  with TemporaryDirectory() as d:
   root=Path(d);(root/"data").mkdir()
   (root/"data/audited-products.json").write_text(json.dumps({"products":[AUDIT]}))
   (root/"data/equipment.json").write_text(json.dumps(EQUIPMENT))
   public=root/"data/products.json";public.write_text('{"products":["untouched"]}')
   calls=[]
   def browser(*args):
    calls.append("seller");return URL,sale()
   r=proof.collect(root=root,api_fetch=lambda req:{"error":"worker_unavailable","upstream_status":429},browser_get=browser,now=NOW)
   self.assertEqual(calls,[])
   self.assertEqual(r["officialApiStatus"],"rate_limited")
   self.assertFalse(r["verifiedForPublication"])
   self.assertEqual(public.read_text(),'{"products":["untouched"]}')
 def test_one_api_and_browser_call_for_success(self):
  with TemporaryDirectory() as d:
   root=Path(d);(root/"data").mkdir()
   (root/"data/audited-products.json").write_text(json.dumps({"products":[AUDIT]}))
   (root/"data/equipment.json").write_text(json.dumps(EQUIPMENT))
   calls=[]
   def api(req):
    calls.append("api")
    return LIVE
   def browser(url):
    calls.append("seller")
    self.assertEqual(url,URL)
    return URL,sale()
   r=proof.collect(root=root,api_fetch=api,browser_get=browser,now=NOW)
   self.assertEqual(calls,["api","seller"])
   self.assertEqual(r["status"],"independent_seller_and_api_evidence_review_required")
if __name__=="__main__":unittest.main()
