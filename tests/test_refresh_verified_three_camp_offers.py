import json
import sys
import unittest
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import parse_qs,quote,urlparse

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import refresh_verified_camp_offer as renewal

NOW=datetime(2026,10,18,1,0,0,tzinfo=timezone.utc)
CASES=[
 ("sleeping_bag","2000034774","naturum-outdoor:10241000","シュラフ"),
 ("tent","2206745","naturum-outdoor:10712574","テント"),
 ("chair","2190857","naturum-outdoor:10639044","チェア"),
]
GEAR={"categories":[{"id":a,"include_any":[name],"exclude_any":[]} for a,_,_,name in CASES]+[{"id":"mat","include_any":["マット"],"exclude_any":[]}],"global_exclude_terms":[]}
def setup():
 audit=[]
 prior=[]
 for cat,model,code,name in CASES:
  url=f"https://item.rakuten.co.jp/naturum-outdoor/p{model}/"
  obj={"category":cat,"model":model,"itemCode":code,"itemUrl":url,"referencePrice":10000,
       "audited":True,"bodyConfirmed":True,"fixedVariant":True,"available":True,
       "priceAudit":True,"condition":"new","quantityPerListing":1,"name":f"Coleman {name} {model}"}
  audit.append(obj)
  prior.append({**obj,"price":10000,"verifiedAt":(NOW-timedelta(days=1)).isoformat(),
                "image":"https://thumbnail.image.rakuten.co.jp/old.jpg","affiliateUrl":"https://hb.afl.rakuten.co.jp/hgc/a/?pc="+quote(url,safe=""),
                "shipping":"included","verificationMode":"sales_page_and_official_item_api"})
 old={"products":prior,"status":"partial_error","failedCategories":["mat"],
      "failureReasons":{"mat":"fresh_seller_evidence_missing"},"itemFailures":{},
      "updatedAt":(NOW-timedelta(days=1)).isoformat()}
 return {"products":audit},old
class MultipleOriginalSellers(unittest.TestCase):
 def execute(self,*,blocked=None,adverse=None,now=NOW):
  audits,old=setup()
  calls=[];prices={x[1]:12000+i*1000 for i,x in enumerate(CASES)}
  def api(req):
   code=parse_qs(urlparse(req.full_url).query)["itemCode"][0]
   entry=next(x for x in CASES if x[2]==code)
   cat,model,_,name=entry
   calls.append(("api",model))
   if code==blocked:return {"error":"worker_unavailable","upstream_status":429}
   item=next(a for a in audits["products"] if a["model"]==model)
   u=item["itemUrl"];price=prices[model]
   data={"found":True,"lookup_method":"exact_item_code_only","item_url":u,
         "item_code":code,"name":f"Coleman {name} {model}","affiliate_url":"https://hb.afl.rakuten.co.jp/hgc/a/?pc="+quote(u,safe=""),
         "price":price,"availability":1,"postage_flag":0,"tax_flag":0,
         "purchasable_min_price":price,"purchasable_max_price":price,
         "image":"https://thumbnail.image.rakuten.co.jp/new.jpg"}
   if model==adverse:data["availability"]=0
   return data
  def browser(url):
   obj=next(a for a in audits["products"] if a["itemUrl"]==url)
   calls.append(("browser",obj["model"]))
   code=int(obj["itemCode"].split(":")[1]);price=prices[obj["model"]]
   info={"itemId":code,"sellType":"NORMAL","inventoryType":"single","sku":[],
     "purchaseInfo":{"purchaseBySellType":{"purchaseCondition":"enabled",
       "normalPurchase":{"price":{"minPrice":price}}},
       "variantMappedInventories":[{"quantity":2}]}}
   return url,f"本体 {obj['model']} \"itemInfoSku\":"+json.dumps(info)
  fresh,live,report=renewal.refresh_verified_offers(audits,old,GEAR,api_fetch=api,
      browser_get=browser,now=now,run_id="three-test")
  return fresh,live,report,calls
 def test_three_verified_sellers_get_independent_current_price_and_proof_time(self):
  a,p,report,calls=self.execute()
  self.assertEqual(report["attempted"],3)
  self.assertEqual(report["maximumApiCalls"],3)
  self.assertEqual(report["verifiedCount"],3)
  self.assertEqual(len(calls),6)
  self.assertEqual(len(p["products"]),3)
  self.assertEqual([x["price"] for x in p["products"]],[12000,13000,14000])
  self.assertEqual(p["failedCategories"],["mat"])
  self.assertTrue(all(x["verifiedAt"]==NOW.isoformat() for x in p["products"]))
  self.assertTrue(all("GitHub Actions run three-test" in x["listingAudit"] for x in a["products"]))
 def test_second_item_429_stops_third_and_keeps_its_original_freshness(self):
  code=CASES[1][2]
  a,p,report,calls=self.execute(blocked=code)
  self.assertEqual(report["attempted"],2)
  self.assertTrue(report["stoppedByRateLimit"])
  self.assertEqual(calls,[("api","2000034774"),("browser","2000034774"),("api","2206745")])
  chair=next(x for x in p["products"] if x["model"]=="2190857")
  self.assertEqual(chair["verifiedAt"],(NOW-timedelta(days=1)).isoformat())
  self.assertFalse(any(x["model"]=="2190857" and x.get("listingAuditedAt")==NOW.isoformat() for x in a["products"]))
 def test_out_of_stock_chair_is_retired_without_removing_valid_tent(self):
  a,p,report,calls=self.execute(adverse="2190857")
  self.assertEqual(report["attempted"],3)
  self.assertEqual(set(x["category"] for x in p["products"]),{"sleeping_bag","tent"})
  self.assertIn("chair",p["failedCategories"])
  self.assertEqual(p["failureReasons"]["chair"],"availability_unverified")
  self.assertEqual(calls.count(("browser","2190857")),0)
 def test_expired_skipped_category_is_not_kept_after_429(self):
  audits,old=setup()
  old["products"][2]["verifiedAt"]=(NOW-timedelta(days=8)).isoformat()
  calls=[]
  def api(req):
   calls.append(req.full_url)
   return {"error":"worker_unavailable","upstream_status":429}
  _,p,report=renewal.refresh_verified_offers(audits,old,GEAR,api_fetch=api,now=NOW)
  self.assertEqual(len(calls),1)
  self.assertTrue(report["stoppedByRateLimit"])
  self.assertEqual([x["category"] for x in p["products"]],["sleeping_bag","tent"])
  self.assertIn("chair",p["failedCategories"])
if __name__=="__main__":unittest.main()
