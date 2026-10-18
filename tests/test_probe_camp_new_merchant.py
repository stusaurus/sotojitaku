import json,sys,unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import quote,parse_qs,urlparse

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import probe_camp_new_merchant as stage

def template(category,model):
 return {"category":category,"model":model,"name":model,
         "referencePrice":5000,"audited":True,"bodyConfirmed":True,"fixedVariant":True,
         "available":True,"priceAudit":True,"condition":"new","quantityPerListing":1,
         "listingAuditedAt":"2026-10-04T12:00:00+00:00"}
EQUIP={"global_exclude_terms":[],"categories":[
 {"id":"burner","include_any":["ストーブ"],"exclude_any":["ケース"]},
 {"id":"hot_sandwich_maker","include_any":["ホットサンド"],"exclude_any":["ケース"]}]}

def page(model,item_id=103000,price=8500,stock=2,sku=None):
 info={"itemId":item_id,"sellType":"NORMAL","inventoryType":"single","sku":[],
       "purchaseInfo":{"purchaseBySellType":{"purchaseCondition":"enabled",
            "normalPurchase":{"price":{"minPrice":price}}},
            "variantMappedInventories":[{"quantity":stock}]}}
 if sku is not None:
  info["sku"]=sku;info["inventoryType"]="multiple"
 return f'正規販売 本体 {model} "itemInfoSku":'+json.dumps(info)

def live(url,model,item_id=103000,price=8500):
 shop=url.split("/")[3];code=f"{shop}:{item_id}"
 return {"found":True,"lookup_method":"exact_item_code_only","item_url":url,
    "item_code":code,"affiliate_url":"https://hb.afl.rakuten.co.jp/hgc/x/?pc="+quote(url,safe=""),
    "name":f"正規品 {model} ストーブ ホットサンド メーカー",
    "price":price,"availability":1,"tax_flag":0,"postage_flag":0,
    "purchasable_min_price":price,"purchasable_max_price":price,
    "image":"https://thumbnail.image.rakuten.co.jp/stable.jpg"}

class NewSellerRequalification(unittest.TestCase):
 def test_browser_id_must_bind_exact_code_and_current_api_with_no_publication(self):
  url=stage.TARGETS[0][2];events=[]
  def fetch(req):
   events.append("api")
   q=parse_qs(urlparse(req.full_url).query)
   self.assertEqual(q["itemCode"][0],"plot-store:103000")
   self.assertEqual(q["url"][0],url)
   return live(url,"ST-310")
  def browse(item):
   events.append("browser");self.assertEqual(item,url)
   return url,page("ST-310")
  out=stage.probe_one(template("burner","ST-310"),url,EQUIP,fetch=fetch,browse=browse)
  self.assertEqual(out["status"],stage.SUCCESS)
  self.assertEqual(events,["browser","api"])
  self.assertFalse(out["verifiedForPublication"])
  self.assertTrue(out["requiresNewMerchantAudit"])
  self.assertEqual(out["newExactItemCode"],"plot-store:103000")
  self.assertNotIn("verifiedAt",out)
 def test_lost_seller_id_cannot_trigger_api_lookup(self):
  calls=[]
  url=stage.TARGETS[0][2]
  out=stage.probe_one(template("burner","ST-310"),url,EQUIP,
    fetch=lambda req:calls.append(req),browse=lambda _: (url,"ST-310 product blocked"))
  self.assertEqual(out["status"],"seller_numeric_item_id_unavailable")
  self.assertEqual(calls,[])
 def test_browser_redirect_blocks_before_api(self):
  url=stage.TARGETS[0][2];calls=[]
  out=stage.probe_one(template("burner","ST-310"),url,EQUIP,fetch=lambda req:calls.append(req),
     browse=lambda _:("https://item.rakuten.co.jp/other/abc/",page("ST-310")))
  self.assertEqual(out["status"],"seller_redirects_to_unapproved_listing")
  self.assertEqual(calls,[])
 def test_same_shop_api_wrong_item_identity_never_published(self):
  url=stage.TARGETS[0][2]
  out=stage.probe_one(template("burner","ST-310"),url,EQUIP,
    fetch=lambda req:{**live(url,"ST-310"),"item_code":"plot-store:999999"},
    browse=lambda _:(url,page("ST-310")))
  self.assertEqual(out["status"],"exact_api_evidence_insufficient")
  self.assertFalse(out["verifiedForPublication"])
 def test_seller_price_or_stock_mismatch_fails_closed(self):
  url=stage.TARGETS[0][2]
  for html in [page("ST-310",price=9900),page("ST-310",stock=0),page("ST-310",sku=[{},{}])]:
   with self.subTest(html=html[-35:]):
    out=stage.probe_one(template("burner","ST-310"),url,EQUIP,
       fetch=lambda req:live(url,"ST-310"),browse=lambda _:(url,html))
    self.assertEqual(out["status"],"fixed_sku_stock_or_price_unverified")
 def test_rate_limit_prevents_rest_of_candidate_search_and_publication(self):
  with TemporaryDirectory() as d:
   root=Path(d);(root/"data").mkdir()
   audits=[template(cat,model) for cat,model,_ in stage.TARGETS]
   source=root/"data/audited-products.json"
   source.write_text(json.dumps({"products":audits}))
   (root/"data/equipment.json").write_text(json.dumps(EQUIP))
   published=root/"data/products.json"
   published.write_text('{"products":["old eight untouched"]}')
   before=published.read_bytes()
   visited=[]
   def browse(url):
    visited.append(url)
    model=next(m for _,m,u in stage.TARGETS if u==url)
    return url,page(model)
   output=stage.run(root=root,browse=browse,fetch=lambda req:{"error":"worker_unavailable","upstream_status":429})
   self.assertTrue(output["stoppedBy429"])
   self.assertEqual(output["actualApiCalls"],1)
   self.assertEqual(len(visited),1)
   self.assertEqual(before,published.read_bytes())
   self.assertFalse(output["results"][0]["verifiedForPublication"])
 def test_cap_and_only_failed_category_has_alternative(self):
  with TemporaryDirectory() as d:
   root=Path(d);(root/"data").mkdir()
   (root/"data/audited-products.json").write_text(json.dumps({"products":[template(c,m) for c,m,u in stage.TARGETS]}))
   (root/"data/equipment.json").write_text(json.dumps(EQUIP))
   visited=[];codes=[]
   def browser(url):
    visited.append(url)
    model=next(m for c,m,u in stage.TARGETS if u==url)
    return url,page(model)
   def api(req):
    q=parse_qs(urlparse(req.full_url).query)
    url=q["url"][0];codes.append(url)
    model=next(m for c,m,u in stage.TARGETS if u==url)
    if model=="ST-310":return {"found":False}
    return live(url,model)
   report=stage.run(root=root,fetch=api,browse=browser)
   self.assertEqual(report["actualApiCalls"],3)
   self.assertEqual(report["attemptedSellerCandidates"],3)
   self.assertEqual(set(report["provenCategories"]),{"burner","hot_sandwich_maker"})
   self.assertEqual(set(visited),set(u for c,m,u in stage.TARGETS))
if __name__=="__main__": unittest.main()
