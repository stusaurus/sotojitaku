import copy
import json
import sys
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import refresh_verified_camp_offer as refresh

NOW=datetime(2026,10,18,4,0,tzinfo=timezone.utc)
ROOT=Path(__file__).resolve().parents[1]

def fixtures():
    audits=copy.deepcopy(json.loads((ROOT/"data/audited-products.json").read_text(encoding="utf-8")))
    catalog=copy.deepcopy(json.loads((ROOT/"data/products.json").read_text(encoding="utf-8")))
    equipment=copy.deepcopy(json.loads((ROOT/"data/equipment.json").read_text(encoding="utf-8")))
    assert len(refresh.TARGETS)>=5
    first_five=set(refresh.TARGETS[:5])
    catalog["products"]=[p for p in catalog["products"]
                         if (p["category"],p["model"]) in first_five]
    assert len(catalog["products"])==5
    return audits,catalog,equipment

def test_browser(audit, price, *, stock=2, item_code=None):
    code=int((item_code or audit["itemCode"]).split(":",1)[1])
    info={
       "itemId":code,"sellType":"NORMAL","inventoryType":"single","sku":[],
       "purchaseInfo":{"purchaseBySellType":{"purchaseCondition":"enabled",
          "normalPurchase":{"price":{"minPrice":price}}},
          "variantMappedInventories":[{"quantity":stock}]},
    }
    return audit["itemUrl"],f"正規品 {audit['model']} \"itemInfoSku\":"+json.dumps(info)

class FiveIndependentOriginalSellers(unittest.TestCase):
    def run_snapshot(self,*,blocked=None,not_in_stock=None,catalog_override=None):
        audits,catalog,equipment=fixtures()
        if catalog_override is not None:
            catalog=catalog_override
        model_of_code={a["itemCode"]:a for a in audits["products"] if (a["category"],a["model"]) in refresh.TARGETS[:5]}
        model_of_url={a["itemUrl"]:a for a in model_of_code.values()}
        calls=[]
        prices={}
        for i,(_,model) in enumerate(refresh.TARGETS[:5]):
            audited=model_of_code[next(code for code,item in model_of_code.items() if item["model"]==model)]
            prices[model]=max(10000+i*1000,int(audited["referencePrice"]))
        def api(req):
            code=parse_qs(urlparse(req.full_url).query)["itemCode"][0]
            audit=model_of_code[code]
            calls.append(("api",audit["model"]))
            if audit["model"]==blocked:
                return {"error":"worker_unavailable","upstream_status":429}
            price=prices[audit["model"]]
            return {"found":True,"lookup_method":"exact_item_code_only",
              "item_code":code,"item_url":audit["itemUrl"],
              "affiliate_url":"https://hb.afl.rakuten.co.jp/hgc/x/?pc="+quote(audit["itemUrl"],safe=""),
              "name":audit["name"],"price":price,"availability":0 if audit["model"]==not_in_stock else 1,
              "postage_flag":0,"tax_flag":0,"purchasable_min_price":price,
              "purchasable_max_price":price,"image":"https://thumbnail.image.rakuten.co.jp/current.jpg"}
        def browser(url):
            audit=model_of_url[url];calls.append(("browser",audit["model"]))
            return test_browser(audit,prices[audit["model"]])
        a,p,report=refresh.refresh_verified_offers(audits,catalog,equipment,
                     api_fetch=api,browser_get=browser,now=NOW,run_id="five-test",targets=refresh.TARGETS[:5])
        return a,p,report,calls

    def test_five_exact_independent_proofs_renew_all_prices_and_categories(self):
        a,c,report,calls=self.run_snapshot()
        self.assertEqual(report["attempted"],5)
        self.assertEqual(report["maximumApiCalls"],5)
        self.assertEqual(report["verifiedCount"],5)
        self.assertEqual(len(calls),10)
        self.assertEqual(set(p["category"] for p in c["products"]),
                         set(category for category,_ in refresh.TARGETS[:5]))
        self.assertEqual(len(set(p["price"] for p in c["products"])),5)
        self.assertTrue(all(p["price"]>=10000 for p in c["products"]))
        self.assertTrue(all(p["verifiedAt"]==NOW.isoformat() for p in c["products"]))
        self.assertTrue(all("GitHub Actions run five-test" in p["listingAudit"] for p in c["products"]))
        self.assertEqual(set(c["failedCategories"]),
                         set(x["id"] for x in fixtures()[2]["categories"])-
                         set(category for category,_ in refresh.TARGETS))

    def test_429_before_table_stops_remaining_requests_no_false_renewal(self):
        a,c,report,calls=self.run_snapshot(blocked="2000036153")
        self.assertTrue(report["stoppedByRateLimit"])
        self.assertEqual(report["attempted"],4)
        self.assertEqual(len([x for x in calls if x[0]=="api"]),4)
        self.assertNotIn(("api","2205816"),calls)
        old=json.loads((ROOT/"data/products.json").read_text())
        previous_table=next(x for x in old["products"] if x["model"]=="2205816")
        current_table=next(x for x in c["products"] if x["model"]=="2205816")
        self.assertEqual(current_table["verifiedAt"],previous_table["verifiedAt"])

    def test_out_of_stock_mat_retires_only_mat(self):
        _,c,report,calls=self.run_snapshot(not_in_stock="2000036153")
        self.assertEqual(report["attempted"],5)
        self.assertEqual(set(p["category"] for p in c["products"]),
                         {"sleeping_bag","tent","chair","table"})
        self.assertIn("mat",c["failedCategories"])
        self.assertNotIn(("browser","2000036153"),calls)

    def test_when_first_api_429_stale_unvisited_table_expires(self):
        a,old,eq=fixtures()
        item=next(x for x in old["products"] if x["model"]=="2205816")
        item["verifiedAt"]=(NOW-timedelta(days=8)).isoformat()
        _,c,report,calls=self.run_snapshot(blocked="2000034774",catalog_override=old)
        self.assertEqual(calls,[("api","2000034774")])
        self.assertTrue(report["stoppedByRateLimit"])
        self.assertNotIn("table",{p["category"] for p in c["products"]})
        self.assertIn("table",c["failedCategories"])

    def test_no_unaudited_sixth_seller_can_enter_batch(self):
        a,c,e=fixtures()
        with self.assertRaisesRegex(ValueError,"unaudited_or_duplicate_target"):
            refresh.refresh_verified_offers(a,c,e,
                targets=refresh.TARGETS+(("cooler","UNKNOWN"),),now=NOW)
if __name__=="__main__": unittest.main()
