import copy,json,sys,unittest
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import parse_qs,quote,urlparse
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import refresh_verified_camp_offer as renewal
ROOT=Path(__file__).resolve().parents[1]
NOW=datetime.now(timezone.utc)

def fixture():
 a=json.loads((ROOT/"data/audited-products.json").read_text(encoding="utf-8"))
 p=json.loads((ROOT/"data/products.json").read_text(encoding="utf-8"))
 e=json.loads((ROOT/"data/equipment.json").read_text(encoding="utf-8"))
 assert len(renewal.TARGETS)>=9
 p["products"]=[x for x in p["products"] if (x["category"],x["model"]) in renewal.TARGETS[:9]]
 assert len(p["products"])==9
 return a,p,e

class NineIndependentSellers(unittest.TestCase):
 def simulate(self,*,blocked=None,out_of_stock=None,original=None,targets=None):
  audited,existing,gear=fixture()
  if original is not None:existing=original
  lookup={a["itemCode"]:a for a in audited["products"]
          if (a["category"],a["model"]) in renewal.TARGETS}
  byurl={a["itemUrl"]:a for a in lookup.values()}
  prices={a["model"]:max(5500,int(a["referencePrice"])+100) for a in lookup.values()}
  calls=[]
  def api(req):
   code=parse_qs(urlparse(req.full_url).query)["itemCode"][0]
   a=lookup[code];calls.append(("api",a["model"]))
   if a["model"]==blocked:return {"error":"worker_unavailable","upstream_status":429}
   url=a["itemUrl"];price=prices[a["model"]]
   return {"found":True,"lookup_method":"exact_item_code_only",
           "item_code":code,"item_url":url,
           "affiliate_url":"https://hb.afl.rakuten.co.jp/hgc/x/?pc="+quote(url,safe=""),
           "name":a["name"],"price":price,
           "availability":0 if a["model"]==out_of_stock else 1,
           "tax_flag":0,"postage_flag":0,
           "purchasable_min_price":price,"purchasable_max_price":price,
           "image":"https://thumbnail.image.rakuten.co.jp/test.jpg"}
  def browser(url):
   a=byurl[url];calls.append(("browser",a["model"]))
   item_id=int(a["itemCode"].split(":",1)[1]);price=prices[a["model"]]
   obj={"itemId":item_id,"sellType":"NORMAL","inventoryType":"single","sku":[],
        "purchaseInfo":{"purchaseBySellType":{"purchaseCondition":"enabled",
           "normalPurchase":{"price":{"minPrice":price}}},
           "variantMappedInventories":[{"quantity":2}]}}
   return url,a["name"]+' "itemInfoSku":'+json.dumps(obj)
  a,p,r=renewal.refresh_verified_offers(audited,existing,gear,api_fetch=api,
                                         browser_get=browser,now=NOW,run_id="nine-test",
                                         targets=targets or renewal.TARGETS[:9])
  return a,p,r,calls

 def test_nine_exact_original_sellers_renew_without_approving_burner(self):
  a,p,r,calls=self.simulate()
  self.assertEqual(r["maximumApiCalls"],9)
  self.assertEqual(r["attempted"],9)
  self.assertEqual(r["verifiedCount"],9)
  self.assertEqual(len(calls),18)
  self.assertEqual({x["category"] for x in p["products"]},
                   {cat for cat,_ in renewal.TARGETS[:9]})
  self.assertEqual(p["failedCategories"],["burner"])
  self.assertTrue(all(x["verifiedAt"]==NOW.isoformat() for x in p["products"]))
  self.assertTrue(all("GitHub Actions run nine-test" in x["listingAudit"] for x in p["products"]))

 def test_last_sandwich_stock_zero_retires_only_it(self):
  a,p,r,calls=self.simulate(out_of_stock="1709435")
  self.assertEqual(r["attempted"],9)
  self.assertEqual(r["verifiedCount"],8)
  self.assertIn("hot_sandwich_maker",p["failedCategories"])
  self.assertNotIn(("browser","1709435"),calls)
  self.assertIn("fire_pit",{x["category"] for x in p["products"]})

 def test_429_before_last_sandwich_does_not_forge_verification_date(self):
  _,p,r,calls=self.simulate(blocked="2000037404")
  self.assertTrue(r["stoppedByRateLimit"])
  self.assertNotIn(("api","1709435"),calls)
  original=next(x for x in fixture()[1]["products"] if x["model"]=="1709435")
  current=next(x for x in p["products"] if x["model"]=="1709435")
  self.assertEqual(original["verifiedAt"],current["verifiedAt"])

 def test_old_unvisited_sandwich_expires_if_429_before_it(self):
  old=copy.deepcopy(fixture()[1])
  target=next(x for x in old["products"] if x["model"]=="1709435")
  target["verifiedAt"]=(NOW-timedelta(days=8)).isoformat()
  _,p,r,calls=self.simulate(blocked="2000034774",original=old)
  self.assertTrue(r["stoppedByRateLimit"])
  self.assertEqual(calls,[("api","2000034774")])
  self.assertNotIn("hot_sandwich_maker",{x["category"] for x in p["products"]})

 def test_no_unverified_burner_is_added_by_target_extension(self):
  a,p,e=fixture()
  with self.assertRaisesRegex(ValueError,"unaudited_or_duplicate_target"):
   renewal.refresh_verified_offers(a,p,e,targets=renewal.TARGETS+(("burner","ST-310"),),now=NOW)
if __name__=="__main__":unittest.main()
