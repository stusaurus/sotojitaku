import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import probe_camp_next_categories as target

def mk_audit(category,model,shop,item_id):
    url=f"https://item.rakuten.co.jp/{shop}/{model.lower()}/"
    return {"category":category,"model":model,"itemCode":f"{shop}:{item_id}","itemUrl":url,
            "referencePrice":10000,"name":f"Coleman {model}",
            "audited":True,"bodyConfirmed":True,"fixedVariant":True,"available":True,
            "priceAudit":True,"condition":"new","quantityPerListing":1,
            "listingAuditedAt":"2026-10-04T00:00:00+00:00"}
TENT=mk_audit("tent","2206745","naturum-outdoor","10712574")
CHAIR=mk_audit("chair","2190857","naturum-outdoor","10639044")
EQ={"global_exclude_terms":[],"categories":[
    {"id":"tent","include_any":["テント"],"exclude_any":[]},
    {"id":"chair","include_any":["チェア"],"exclude_any":[]}]}
def live(audit,price=10000):
    url=audit["itemUrl"]
    from urllib.parse import quote
    return {"found":True,"lookup_method":"exact_item_code_only","item_url":url,
            "affiliate_url":"https://hb.afl.rakuten.co.jp/hgc/x/?pc="+quote(url,safe=""),
            "item_code":audit["itemCode"],"name":f"Coleman {audit['model']} "+("テント" if audit["category"]=="tent" else "チェア"),
            "price":price,"availability":1,"tax_flag":0,"postage_flag":0,
            "purchasable_min_price":price,"purchasable_max_price":price,
            "image":"https://thumbnail.image.rakuten.co.jp/x.jpg","seller_variant_verified":False}
def html(audit,price=10000,item_id=None,stock=1):
    info={"itemId":int(item_id or audit["itemCode"].split(":")[1]),"sellType":"NORMAL",
          "inventoryType":"single","sku":[],"purchaseInfo":{
            "purchaseBySellType":{"purchaseCondition":"enabled",
              "normalPurchase":{"price":{"minPrice":price}}},
            "variantMappedInventories":[{"quantity":stock}]}}
    return f"商品 {audit['model']} \"itemInfoSku\":"+json.dumps(info)
class StrictCategoryRecovery(unittest.TestCase):
    def test_exact_two_independent_sources_per_product_never_publish_directly(self):
        events=[]
        for audit in (TENT,CHAIR):
            def lookup(req):
                events.append("api");return live(audit)
            def browse(url):
                events.append("seller");self.assertEqual(url,audit["itemUrl"])
                return url,html(audit)
            out=target.probe_one(audit,EQ,fetch=lookup,browse=browse)
            self.assertEqual(out["status"],"independent_proof_complete_ready_for_review")
            self.assertFalse(out["verifiedForPublication"])
            self.assertEqual(out["apiCurrentPrice"],10000)
        self.assertEqual(events,["api","seller","api","seller"])
    def test_reject_invalid_url_alias_or_accessory_before_browser(self):
        audit=TENT; calls=[]
        wrong={**live(audit),"item_url":"https://item.rakuten.co.jp/other/similar/"}
        out=target.probe_one(audit,EQ,fetch=lambda req:wrong,browse=lambda url:calls.append(url))
        self.assertEqual(out["status"],"api_evidence_insufficient")
        self.assertEqual(calls,[])
    def test_429_stops_remaining_items_without_loading_seller(self):
        with TemporaryDirectory() as d:
            root=Path(d);(root/"data").mkdir()
            (root/"data/audited-products.json").write_text(json.dumps({"products":[TENT,CHAIR]}))
            (root/"data/equipment.json").write_text(json.dumps(EQ))
            events=[]
            def fetch(req):
                events.append("api");return {"error":"worker_unavailable","upstream_status":429}
            def browse(url):
                events.append("seller");return (url,"")
            out=target.probe(root=root,fetch=fetch,browse=browse)
            self.assertEqual(events,["api"])
            self.assertTrue(out["stoppedBy429"])
            self.assertEqual(out["queried"],1)
    def test_wrong_numeric_item_id_is_not_accepted_even_with_matching_model(self):
        audit=CHAIR
        out=target.probe_one(audit,EQ,fetch=lambda req:live(audit),
                             browse=lambda url:(url,html(audit,item_id="999999")))
        self.assertEqual(out["status"],"seller_item_id_or_cart_mismatch")
    def test_seller_out_of_stock_is_rejected(self):
        audit=TENT
        out=target.probe_one(audit,EQ,fetch=lambda req:live(audit),
                             browse=lambda url:(url,html(audit,stock=0)))
        self.assertEqual(out["status"],"seller_evidence_insufficient")
    def test_freshness_and_prices_are_not_written_to_public_files(self):
        with TemporaryDirectory() as d:
            root=Path(d);(root/"data").mkdir()
            (root/"data/audited-products.json").write_text(json.dumps({"products":[TENT,CHAIR]}))
            (root/"data/equipment.json").write_text(json.dumps(EQ))
            p=root/"data/products.json";p.write_text('{"products":[{"model":"old-proof"}]}')
            before=p.read_bytes()
            audits=root/"data/audited-products.json";past=audits.read_bytes()
            def fetch(req):
                return live(TENT if "2206745" in req.full_url else CHAIR)
            def browse(url):
                audit=TENT if "2206745" in url else CHAIR
                return url,html(audit)
            report=target.probe(root=root,fetch=fetch,browse=browse)
            self.assertEqual(report["queried"],2)
            self.assertEqual(report["results"][0]["status"],"independent_proof_complete_ready_for_review")
            self.assertEqual(report["results"][1]["status"],"independent_proof_complete_ready_for_review")
            self.assertEqual(before,p.read_bytes())
            self.assertEqual(past,audits.read_bytes())
if __name__=="__main__":unittest.main()
