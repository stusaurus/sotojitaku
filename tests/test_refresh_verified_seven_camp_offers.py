import copy
import json
import sys
import unittest
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import parse_qs,quote,urlparse

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import refresh_verified_camp_offer as renewal

ROOT=Path(__file__).resolve().parents[1]
NOW=datetime(2026,10,18,5,0,0,tzinfo=timezone.utc)

def fixtures():
    audit=copy.deepcopy(json.loads((ROOT/"data/audited-products.json").read_text(encoding="utf-8")))
    catalog=copy.deepcopy(json.loads((ROOT/"data/products.json").read_text(encoding="utf-8")))
    equipment=copy.deepcopy(json.loads((ROOT/"data/equipment.json").read_text(encoding="utf-8")))
    assert len(renewal.TARGETS)==7 and len(catalog["products"])==7
    return audit,catalog,equipment

class SevenSellerRenewal(unittest.TestCase):
    def run_simulation(self,blocked=None,out_of_stock=None,catalog=None):
        audits,original,gear=fixtures()
        if catalog is None:catalog=original
        active={a["itemCode"]:a for a in audits["products"]
                if (a["category"],a["model"]) in renewal.TARGETS}
        by_url={a["itemUrl"]:a for a in active.values()}
        prices={a["model"]:max(5000,int(a["referencePrice"])+100)
                for a in active.values()}
        calls=[]
        def api(req):
            code=parse_qs(urlparse(req.full_url).query)["itemCode"][0]
            a=active[code]
            calls.append(("api",a["model"]))
            if a["model"]==blocked:
                return {"error":"worker_unavailable","upstream_status":429}
            price=prices[a["model"]]; url=a["itemUrl"]
            return {"found":True,"lookup_method":"exact_item_code_only","item_code":code,
                    "item_url":url,"affiliate_url":"https://hb.afl.rakuten.co.jp/hgc/x/?pc="+quote(url,safe=""),
                    "name":a["name"],"price":price,
                    "availability":0 if a["model"]==out_of_stock else 1,
                    "tax_flag":0,"postage_flag":0,
                    "purchasable_min_price":price,"purchasable_max_price":price,
                    "image":"https://thumbnail.image.rakuten.co.jp/current.jpg"}
        def browse(url):
            a=by_url[url];calls.append(("browser",a["model"]))
            price=prices[a["model"]]
            data={"itemId":int(a["itemCode"].split(":",1)[1]),"sellType":"NORMAL",
                  "inventoryType":"single","sku":[],
                  "purchaseInfo":{"purchaseBySellType":{"purchaseCondition":"enabled",
                      "normalPurchase":{"price":{"minPrice":price}}},
                      "variantMappedInventories":[{"quantity":3}]}}
            return url,("販売中 "+a["model"]+' "itemInfoSku":'+json.dumps(data))
        a,c,report=renewal.refresh_verified_offers(audits,catalog,gear,
               api_fetch=api,browser_get=browse,now=NOW,run_id="seven-test")
        return a,c,report,calls

    def test_seven_original_shop_codes_are_independently_verified(self):
        a,c,report,calls=self.run_simulation()
        self.assertEqual(report["maximumApiCalls"],7)
        self.assertEqual(report["attempted"],7)
        self.assertEqual(report["verifiedCount"],7)
        self.assertEqual(len(calls),14)
        self.assertEqual({x["category"] for x in c["products"]},
                         {category for category,model in renewal.TARGETS})
        self.assertEqual(set(c["failedCategories"]),{"burner","fire_pit","hot_sandwich_maker"})
        self.assertTrue(all(p["verifiedAt"]==NOW.isoformat() for p in c["products"]))
        self.assertTrue(all("GitHub Actions run seven-test" in p["listingAudit"] for p in c["products"]))
        self.assertTrue(all(p["price"]>0 for p in c["products"]))
    def test_cooler_429_stops_lantern_call_and_keeps_its_old_timestamp(self):
        a,c,report,calls=self.run_simulation(blocked="2238149")
        self.assertTrue(report["stoppedByRateLimit"])
        self.assertEqual(report["attempted"],6)
        self.assertEqual(len([x for x in calls if x[0]=="api"]),6)
        self.assertNotIn(("api","2218364"),calls)
        original=fixtures()[1]
        old=next(p for p in original["products"] if p["model"]=="2218364")
        lantern=next(p for p in c["products"] if p["model"]=="2218364")
        self.assertEqual(lantern["verifiedAt"],old["verifiedAt"])
    def test_lantern_out_of_stock_immediately_retires_only_lantern(self):
        a,c,report,calls=self.run_simulation(out_of_stock="2218364")
        self.assertEqual(report["attempted"],7)
        self.assertEqual(report["verifiedCount"],6)
        self.assertIn("led_lantern",c["failedCategories"])
        self.assertNotIn("led_lantern",{p["category"] for p in c["products"]})
        self.assertNotIn(("browser","2218364"),calls)
        self.assertIn("cooler",{p["category"] for p in c["products"]})
    def test_unvisited_expired_lantern_is_removed_even_when_earlier_api_is_429(self):
        original=fixtures()[1]
        for p in original["products"]:
            if p["model"]=="2218364":
                p["verifiedAt"]=(NOW-timedelta(days=8)).isoformat()
        a,c,report,calls=self.run_simulation(blocked="2000034774",catalog=original)
        self.assertEqual(calls,[("api","2000034774")])
        self.assertTrue(report["stoppedByRateLimit"])
        self.assertNotIn("led_lantern",{p["category"] for p in c["products"]})
        self.assertIn("led_lantern",c["failedCategories"])
    def test_unaudited_eighth_target_is_rejected_before_requests(self):
        audits,catalog,gear=fixtures()
        with self.assertRaisesRegex(ValueError,"unaudited_or_duplicate_target"):
            renewal.refresh_verified_offers(audits,catalog,gear,
                 targets=renewal.TARGETS+(("fire_pit","UNVERIFIED"),),now=NOW)
if __name__=="__main__":unittest.main()
