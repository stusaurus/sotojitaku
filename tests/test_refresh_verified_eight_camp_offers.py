import copy,json,sys,unittest
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import parse_qs,quote,urlparse
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import refresh_verified_camp_offer as renew

ROOT=Path(__file__).resolve().parents[1]
NOW=datetime(2026,10,18,6,0,0,tzinfo=timezone.utc)
def fixtures():
 audits=json.loads((ROOT/"data/audited-products.json").read_text(encoding="utf-8"))
 products=json.loads((ROOT/"data/products.json").read_text(encoding="utf-8"))
 equipment=json.loads((ROOT/"data/equipment.json").read_text(encoding="utf-8"))
 assert len(renew.TARGETS)==8 and len(products["products"])==8
 return audits,products,equipment

class EightCertifiedOriginalSellers(unittest.TestCase):
 def verify(self,*,blocked=None,unavailable=None,existing=None):
  audited,old,gear=fixtures()
  if existing is not None:old=existing
  originals={a["itemCode"]:a for a in audited["products"] if (a["category"],a["model"]) in renew.TARGETS}
  prices={v["model"]:max(6500,int(v["referencePrice"])+100) for v in originals.values()}
  pages={v["itemUrl"]:v for v in originals.values()}
  calls=[]
  def api(req):
   code=parse_qs(urlparse(req.full_url).query)["itemCode"][0]
   a=originals[code];calls.append(("api",a["model"]))
   if a["model"]==blocked:return {"error":"worker_unavailable","upstream_status":429}
   price=prices[a["model"]];u=a["itemUrl"]
   return {"found":True,"lookup_method":"exact_item_code_only","item_code":code,
     "item_url":u,"affiliate_url":"https://hb.afl.rakuten.co.jp/hgc/x/?pc="+quote(u,safe=""),
     "name":a["name"],"price":price,
     "availability":0 if a["model"]==unavailable else 1,"tax_flag":0,"postage_flag":0,
     "purchasable_min_price":price,"purchasable_max_price":price,
     "image":"https://thumbnail.image.rakuten.co.jp/current.jpg"}
  def browser(url):
   a=pages[url];calls.append(("seller",a["model"]))
   info={"itemId":int(a["itemCode"].split(":",1)[1]),"sellType":"NORMAL","inventoryType":"single","sku":[],
       "purchaseInfo":{"purchaseBySellType":{"purchaseCondition":"enabled",
       "normalPurchase":{"price":{"minPrice":prices[a["model"]]}}},
       "variantMappedInventories":[{"quantity":3}]}}
   return url,a["name"]+' "itemInfoSku":'+json.dumps(info)
  a,p,r=renew.refresh_verified_offers(audited,old,gear,
      api_fetch=api,browser_get=browser,now=NOW,run_id="eight-test")
  return a,p,r,calls

 def test_eight_item_codes_renew_independently_only_three_gaps_left_as_two(self):
  a,p,r,calls=self.verify()
  self.assertEqual(r["maximumApiCalls"],8)
  self.assertEqual(r["attempted"],8)
  self.assertEqual(r["verifiedCount"],8)
  self.assertEqual(len(calls),16)
  self.assertEqual({x["category"] for x in p["products"]},
      {cat for cat,_ in renew.TARGETS})
  self.assertEqual(set(p["failedCategories"]),{"burner","hot_sandwich_maker"})
  self.assertTrue(all(x["verifiedAt"]==NOW.isoformat() for x in p["products"]))
  self.assertTrue(all("GitHub Actions run eight-test" in x["listingAudit"] for x in p["products"]))
  self.assertIn("fire_pit",{x["category"] for x in p["products"]})

 def test_429_before_fire_pit_stops_8th_call_without_timestamp_forgery(self):
  _,p,r,calls=self.verify(blocked="2218364")
  self.assertEqual(r["attempted"],7)
  self.assertTrue(r["stoppedByRateLimit"])
  self.assertNotIn(("api","2000037404"),calls)
  old=next(x for x in fixtures()[1]["products"] if x["model"]=="2000037404")
  fire=next(x for x in p["products"] if x["model"]=="2000037404")
  self.assertEqual(fire["verifiedAt"],old["verifiedAt"])

 def test_fire_pit_out_of_stock_retires_it_and_preserves_other_seven(self):
  _,p,r,calls=self.verify(unavailable="2000037404")
  self.assertEqual(r["attempted"],8)
  self.assertEqual(r["verifiedCount"],7)
  self.assertNotIn("fire_pit",{x["category"] for x in p["products"]})
  self.assertIn("fire_pit",p["failedCategories"])
  self.assertNotIn(("seller","2000037404"),calls)

 def test_expired_fire_pit_disappears_when_first_api_is_rate_limited(self):
  old=copy.deepcopy(fixtures()[1])
  for x in old["products"]:
   if x["model"]=="2000037404":x["verifiedAt"]=(NOW-timedelta(days=8)).isoformat()
  _,p,r,calls=self.verify(blocked="2000034774",existing=old)
  self.assertEqual(calls,[("api","2000034774")])
  self.assertTrue(r["stoppedByRateLimit"])
  self.assertNotIn("fire_pit",{x["category"] for x in p["products"]})
  self.assertIn("fire_pit",p["failedCategories"])

 def test_unverified_ninth_seller_is_disallowed(self):
  a,p,e=fixtures()
  with self.assertRaisesRegex(ValueError,"unaudited_or_duplicate_target"):
   renew.refresh_verified_offers(a,p,e,targets=renew.TARGETS+(("burner","ST-340"),),now=NOW)
if __name__=="__main__":unittest.main()
