"""No-network verification that exact Rakuten item IDs come from seller HTML."""
import json
import sys
import unittest
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import probe_camp_seller_derived_item_id as research


class SellerDerivedIdentity(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "data").mkdir()
        self.clock = datetime(2026, 11, 5, 4, tzinfo=timezone.utc)
        self.model = research.MODEL
        self.sku_id = 12345678
        self.price = 12000
        self.audit = {
            "category": research.CATEGORY, "model": self.model,
            "itemCode": "oldstore:99887766",
            "itemUrl": "https://item.rakuten.co.jp/oldstore/old-model/",
            "name": "Coleman LED ランタン 2218364",
            "audited": True, "bodyConfirmed": True,
            "fixedVariant": True, "available": True, "priceAudit": True,
            "condition": "new", "quantityPerListing": 1,
            "referencePrice": 12000, "identityTerms": [self.model],
        }
        self.equipment = {"global_exclude_terms": [],
            "categories": [{"id":research.CATEGORY,
                            "include_any":["ランタン"],"exclude_any":[],
                            "required_fields":["weight"]}]}
        docs={"products":{"products":[{"category":"tent","model":"LIVE"}]},
              "audited-products":{"products":[self.audit]},
              "equipment":self.equipment}
        for name, value in docs.items():
            (self.root / "data" / (name+".json")).write_text(json.dumps(value))
        self.before={p.name:p.read_bytes() for p in
                     (self.root / "data").iterdir()}
        self.visited=[]
        self.api_calls=[]

    def html(self, **patch):
        info={
            "itemId":self.sku_id,
            "sellType":"NORMAL",
            "inventoryType":"single",
            "sku":[],
            "purchaseInfo":{
                "purchaseBySellType":{
                    "purchaseCondition":"enabled",
                    "normalPurchase":{"price":{"minPrice":self.price}},
                },
                "variantMappedInventories":[{"quantity":2}],
            },
        }
        for key,val in patch.items():
            info[key]=val
        return '"itemInfoSku":'+json.dumps(info,ensure_ascii=False)+(
            " Coleman ランタン "+self.model)

    def seller(self,url):
        self.visited.append(url)
        return url,self.html()

    def official(self,request):
        params=urllib.parse.parse_qs(urllib.parse.urlparse(request.full_url).query)
        code=params["itemCode"][0]
        self.api_calls.append(code)
        expected="alpen:"+str(self.sku_id)
        self.assertEqual(code,expected)
        item=research.SELLER_PAGE
        affiliate=("https://hb.afl.rakuten.co.jp/hgc/proof/?pc="
                   +urllib.parse.quote(item,safe=""))
        return {
            "found":True, "lookup_method":"exact_item_code_only",
            "item_url":item,"item_code":expected,
            "affiliate_url":affiliate,"name":"Coleman LED ランタン 2218364",
            "price":self.price,"availability":1,"tax_flag":0,"postage_flag":0,
            "purchasable_min_price":self.price,
            "purchasable_max_price":self.price,
            "image":"https://thumbnail.image.rakuten.co.jp/test.jpg",
        }

    def no_change(self):
        for p in (self.root / "data").iterdir():
            self.assertEqual(p.read_bytes(),self.before[p.name])

    def test_seller_page_item_id_not_url_slug_is_required(self):
        identity,reason=research.page_identity(
            research.SELLER_PAGE,self.html())
        self.assertIsNone(reason)
        self.assertEqual(identity["itemCode"],"alpen:12345678")
        self.assertNotEqual(identity["itemCode"],"alpen:7411106505")
        r=research.probe(root=self.root,browser_get=self.seller,
                         api_fetch=self.official,now=self.clock)
        self.assertEqual(r["rakutenApiRequests"],1)
        self.assertEqual(r["sellerBrowserRequests"],1)
        self.assertTrue(r["sellerIdFromLivePage"])
        self.assertFalse(r["urlSlugMatchesSellerId"])
        self.assertTrue(r["independentEvidenceForManualReview"])
        self.assertFalse(r["verifiedForPublication"])
        self.assertEqual(self.api_calls,["alpen:12345678"])
        encoded=json.dumps(r)
        for secret in ["itemCode","affiliateUrl","12345678","12000",
                       "item.rakuten.co.jp"]:
            self.assertNotIn(secret,encoded)
        self.no_change()

    def test_missing_seller_item_info_aborts_before_any_api(self):
        r=research.probe(root=self.root,
                         browser_get=lambda url:(url,"Coleman 2218364"),
                         api_fetch=self.official,now=self.clock)
        self.assertEqual(r["sellerStatus"],"missing_sales_evidence")
        self.assertEqual(r["rakutenApiRequests"],0)
        self.assertFalse(self.api_calls)
        self.no_change()

    def test_model_or_option_mismatch_fails_closed(self):
        html=self.html()
        wrong_model=html.replace(self.model,"DIFFERENT")
        changed=self.html(inventoryType="multiple",sku=[{"hidden":False}])
        for content in (wrong_model,changed):
            r=research.probe(root=self.root,
                             browser_get=lambda url,h=content:(url,h),
                             api_fetch=self.official,now=self.clock)
            self.assertFalse(r["sellerIdFromLivePage"])
            self.assertEqual(r["rakutenApiRequests"],0)
            self.assertFalse(r["independentEvidenceForManualReview"])
        self.no_change()

    def test_redirect_identity_mismatch_and_browser_block_fail_closed(self):
        r=research.probe(root=self.root,
            browser_get=lambda url:("https://item.rakuten.co.jp/other/7411106505/",
                                    self.html()),
            api_fetch=self.official,now=self.clock)
        self.assertEqual(r["sellerStatus"],"redirect_or_wrong_seller_page")
        self.assertEqual(r["rakutenApiRequests"],0)
        def blocked(_url):
            raise TimeoutError("private-token-must-not-log")
        r=research.probe(root=self.root,browser_get=blocked,
                         api_fetch=self.official,now=self.clock)
        self.assertEqual(r["sellerStatus"],"seller_browser_unavailable")
        self.assertNotIn("private-token",json.dumps(r))
        self.assertFalse(self.api_calls)
        self.no_change()

    def test_candidate_list_never_admits_unreviewed_seller_urls(self):
        with self.assertRaises(ValueError):
            research.probe(root=self.root,browser_get=self.seller,
                           api_fetch=self.official,now=self.clock,target="unknown")
        with self.assertRaises(ValueError):
            research.probe(root=self.root,browser_get=self.seller,
                           api_fetch=self.official,now=self.clock,target="led",
                           seller_page=research.ALLOWED_TARGETS["sandwich"][2])
        self.assertFalse(self.visited)
        self.assertFalse(self.api_calls)
        self.no_change()

    def test_naive_datetime_and_bad_target_never_start_requests(self):
        with self.assertRaises(ValueError):
            research.probe(root=self.root,browser_get=self.seller,
                           api_fetch=self.official,now=datetime(2026,11,5))
        with self.assertRaises(ValueError):
            research.probe(root=self.root,browser_get=self.seller,
                           api_fetch=self.official,now=self.clock,
                           seller_page="https://item.rakuten.co.jp/else/123/")
        self.assertFalse(self.visited)
        self.assertFalse(self.api_calls)
        self.no_change()


if __name__=="__main__":
    unittest.main()
