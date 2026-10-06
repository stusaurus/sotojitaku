import importlib.util
import unittest
from pathlib import Path

MODULE=Path(__file__).resolve().parents[1]/"car-stay"/"scripts"/"refresh_products.py"
spec=importlib.util.spec_from_file_location("car_stay_refresh",MODULE)
refresh=importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

class CarStayProductRefreshTests(unittest.TestCase):
    # CAR STAY privacy-source resilience is regression-tested below.
    def setUp(self):
        refresh._PAGE_CACHE.clear()

    def test_canonical_direct_item(self):
        self.assertEqual(
            refresh.canonical_item_url("https://item.rakuten.co.jp/shop/item123/"),
            "https://item.rakuten.co.jp/shop/item123/"
        )

    def test_canonical_affiliate_target(self):
        url="https://hb.afl.rakuten.co.jp/hgc/test/?pc="+__import__("urllib.parse").parse.quote("https://item.rakuten.co.jp/shop/item123/",safe="")
        self.assertEqual(refresh.canonical_item_url(url),"https://item.rakuten.co.jp/shop/item123/")

    def test_identity_requires_every_group(self):
        seed={"identityGroups":[["N-BOX","NBOX"],["JF5"],["JF6"],["サンシェード"]],"forbiddenTerms":["JF3"]}
        self.assertTrue(refresh.identity_ok("N-BOX JF5 JF6 サンシェード",seed))
        self.assertFalse(refresh.identity_ok("N-BOX JF5 サンシェード",seed))
        self.assertFalse(refresh.identity_ok("N-BOX JF3 JF5 JF6 サンシェード",seed))

    def test_affiliate_must_target_exact_listing(self):
        import urllib.parse
        item="https://item.rakuten.co.jp/shop/item123/"
        good="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+urllib.parse.quote(item,safe="")
        bad="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+urllib.parse.quote("https://item.rakuten.co.jp/shop/other/",safe="")
        self.assertTrue(refresh.safe_affiliate(good,item))
        self.assertFalse(refresh.safe_affiliate(bad,item))

    def test_same_shop_identity_listing_is_allowed_but_other_shop_is_not(self):
        seed={"itemUrl":"https://item.rakuten.co.jp/hobbyman/old-slug/","identityGroups":[["N-VAN"],["JJ1"],["JJ2"],["サンシェード"]],"forbiddenTerms":[]}
        same={"name":"N-VAN JJ1 JJ2 サンシェード フルセット","itemUrl":"https://item.rakuten.co.jp/hobbyman/new-slug/"}
        other={"name":"N-VAN JJ1 JJ2 サンシェード フルセット","itemUrl":"https://item.rakuten.co.jp/another-shop/new-slug/"}
        self.assertEqual(refresh.candidate_match_level(same,seed),1)
        self.assertEqual(refresh.candidate_match_level(other,seed),0)

    def test_seed_queries_keep_search_broad_but_deduplicated(self):
        seed={"query":"very specific","searchQueries":["NBOX JF5 サンシェード","NBOX JF5 サンシェード","NBOX JF5"]}
        self.assertEqual(refresh.seed_queries(seed),["NBOX JF5 サンシェード","NBOX JF5"])

    def test_exact_url_can_fallback_when_rakuten_returns_interstitial(self):
        seed={"itemUrl":"https://item.rakuten.co.jp/shop/item123/","identityGroups":[["N-BOX"],["JF5"]]}
        original=refresh.fetch_text
        try:
            refresh.fetch_text=lambda _:"<html><title>Rakuten</title></html>"
            mode,price=refresh.page_sales_audit(seed,seed["itemUrl"],12345)
            self.assertEqual(mode,"exact_feed_fallback")
            self.assertEqual(price,12345)
        finally:
            refresh.fetch_text=original

    def test_rakuten_api_search_is_scoped_to_seed_shop(self):
        import os, urllib.parse
        seed={"itemUrl":"https://item.rakuten.co.jp/hobbyman/item123/","query":"N-VAN JJ1","identityGroups":[["N-VAN"],["JJ1"]],"forbiddenTerms":[]}
        seen=[]
        original_fetch=refresh.fetch_json
        old={k:os.environ.get(k) for k in ["RAKUTEN_APPLICATION_ID","RAKUTEN_ACCESS_KEY","RAKUTEN_AFFILIATE_ID"]}
        try:
            os.environ["RAKUTEN_APPLICATION_ID"]="app"
            os.environ["RAKUTEN_ACCESS_KEY"]="key"
            os.environ["RAKUTEN_AFFILIATE_ID"]="aff"
            def fake(url,headers=None):
                seen.append(urllib.parse.parse_qs(urllib.parse.urlparse(url).query))
                return {"items":[]}
            refresh.fetch_json=fake
            refresh.rakuten_api_candidate(seed)
            self.assertEqual(seen[0]["shopCode"],["hobbyman"])
            self.assertEqual(seen[0]["field"],["0"])
        finally:
            refresh.fetch_json=original_fetch
            for k,v in old.items():
                if v is None: os.environ.pop(k,None)
                else: os.environ[k]=v

    def test_sales_payload_does_not_repeat_fit_identity(self):
        seed={"itemUrl":"https://item.rakuten.co.jp/shop/item123/","identityGroups":[["N-BOX"],["JF5"]]}
        payload={"sellType":"NORMAL","purchaseInfo":{"purchaseBySellType":{"purchaseCondition":"enabled","normalPurchase":{"price":{"minPrice":12345}}}}}
        page='<html><script>"itemInfoSku":'+__import__("json").dumps(payload)+'</script></html>'
        original=refresh.fetch_text
        try:
            refresh.fetch_text=lambda _:page
            mode,price=refresh.page_sales_audit(seed,seed["itemUrl"],12345)
            self.assertEqual(mode,"sales_page")
            self.assertEqual(price,12345)
        finally:
            refresh.fetch_text=original

    def test_rakuten_api_prefers_exact_seed_url_over_similar_same_shop_item(self):
        import os
        seed={
            "itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/",
            "query":"N-VAN JJ1 サンシェード",
            "identityGroups":[["N-VAN"],["JJ1"],["サンシェード"]],
            "forbiddenTerms":[]
        }
        old={k:os.environ.get(k) for k in ["RAKUTEN_APPLICATION_ID","RAKUTEN_ACCESS_KEY","RAKUTEN_AFFILIATE_ID"]}
        original=refresh.fetch_json
        try:
            os.environ["RAKUTEN_APPLICATION_ID"]="app"
            os.environ["RAKUTEN_ACCESS_KEY"]="key"
            os.environ["RAKUTEN_AFFILIATE_ID"]="aff"
            refresh.fetch_json=lambda url,headers=None:{"items":[
                {"itemName":"N-VAN JJ1 サンシェード フロント","itemUrl":"https://item.rakuten.co.jp/hobbyman/similar/","itemPrice":9000,"affiliateUrl":"https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fhobbyman%2Fsimilar%2F","mediumImageUrls":["https://example.com/a.jpg"]},
                {"itemName":"N-VAN JJ1 サンシェード フルセット","itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/","itemPrice":12000,"affiliateUrl":"https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fhobbyman%2Fexact%2F","mediumImageUrls":["https://example.com/b.jpg"]}
            ]}
            candidate=refresh.rakuten_api_candidate(seed)
            self.assertEqual(candidate["itemUrl"],seed["itemUrl"])
        finally:
            refresh.fetch_json=original
            for k,v in old.items():
                if v is None: os.environ.pop(k,None)
                else: os.environ[k]=v

    def test_worker_fallback_tries_all_search_queries_with_short_probes(self):
        seed={"itemUrl":"https://item.rakuten.co.jp/hobbyman/item123/","searchQueries":["first query","second query"],"identityGroups":[["N-VAN"]],"forbiddenTerms":[]}
        seen=[]
        original=refresh.fetch_json_quick
        try:
            def fake(url,headers=None,timeout=4):
                seen.append((url,timeout))
                if "product-search" in url: return {"products":[]}
                return {"found":False}
            refresh.fetch_json_quick=fake
            refresh.worker_candidate(seed)
            product_calls=[pair for pair in seen if "product-search" in pair[0]]
            self.assertEqual(len(product_calls),2)
            self.assertIn("first+query",product_calls[0][0])
            self.assertIn("second+query",product_calls[1][0])
            self.assertTrue(all(timeout==5 for _,timeout in seen))
        finally:
            refresh.fetch_json_quick=original

    def test_exact_page_info_reads_live_item_id_and_price(self):
        import json
        seed={"itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/"}
        payload={"itemId":12345678,"sellType":"NORMAL","purchaseInfo":{"purchaseBySellType":{"purchaseCondition":"enabled","normalPurchase":{"price":{"minPrice":12980}}}}}
        original=refresh.fetch_text
        try:
            refresh.fetch_text=lambda _:'<html>"itemInfoSku":'+json.dumps(payload)+'</html>'
            self.assertEqual(refresh.exact_page_info(seed),{"itemId":12345678,"price":12980})
        finally:
            refresh.fetch_text=original

    def test_exact_api_candidate_tries_url_slug_then_numeric_page_item_id(self):
        import os, urllib.parse
        seed={"itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/","identityGroups":[["N-VAN"],["JJ1"],["JJ2"],["サンシェード"]],"forbiddenTerms":[]}
        old={k:os.environ.get(k) for k in ["RAKUTEN_APPLICATION_ID","RAKUTEN_ACCESS_KEY","RAKUTEN_AFFILIATE_ID"]}
        original_info=refresh.exact_page_info
        original_fetch=refresh.fetch_json
        seen=[]
        try:
            os.environ["RAKUTEN_APPLICATION_ID"]="app"
            os.environ["RAKUTEN_ACCESS_KEY"]="key"
            os.environ["RAKUTEN_AFFILIATE_ID"]="aff"
            refresh.exact_page_info=lambda _:{"itemId":12345678,"price":12980}
            def fake(url,headers=None):
                params=urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
                seen.append(params)
                if params["itemCode"]==["hobbyman:exact"]:
                    return {"items":[]}
                return {"items":[{"itemName":"N-VAN JJ1 JJ2 サンシェード フルセット","itemCode":"hobbyman:12345678","itemPrice":12980,"itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/","affiliateUrl":"https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fhobbyman%2Fexact%2F","mediumImageUrls":["https://example.com/p.jpg"]}]}
            refresh.fetch_json=fake
            candidate=refresh.rakuten_api_exact_candidate(seed)
            self.assertEqual([q["itemCode"][0] for q in seen],["hobbyman:exact","hobbyman:12345678"])
            self.assertEqual(candidate["itemUrl"],seed["itemUrl"])
            self.assertEqual(candidate["source"],"rakuten_api_exact")
            self.assertEqual(candidate["pagePrice"],12980)
        finally:
            refresh.exact_page_info=original_info
            refresh.fetch_json=original_fetch
            for k,v in old.items():
                if v is None: os.environ.pop(k,None)
                else: os.environ[k]=v


    def test_hustler_vehicle_mattress_does_not_accept_luggage_mat(self):
        seed={
            "identityGroups":[["Levolva"],["ハスラー"],["MR52S"],["MR92S"],["LVMR-13","車中泊マット"]],
            "forbiddenTerms":["ラゲッジマット","ラゲッジルームカバー"]
        }
        good="Levolva ハスラー MR52S MR92S スマート車中泊マットDX LVMR-13"
        bad="Levolva MR52S MR92S ハスラー 専用ラゲッジルームカバー 防水ラゲッジマット"
        self.assertTrue(refresh.identity_ok(good,seed))
        self.assertFalse(refresh.identity_ok(bad,seed))

    def test_acquire_falls_back_to_worker_when_rakuten_api_raises(self):
        import urllib.parse
        seed={
            "productId":"fallback-item","name":"N-VAN shade","brand":"Test",
            "itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/",
            "gapIds":["privacy_full"],"fitCheckedAt":"2026-10-05",
            "vehicleFit":[{"vehicleId":"honda-nvan-jj1-jj2","status":"verified"}]
        }
        item=seed["itemUrl"]
        affiliate="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+urllib.parse.quote(item,safe="")
        candidate={"name":"N-VAN shade","price":10000,"url":affiliate,"itemUrl":item,"image":"https://example.com/x.jpg","itemCode":"hobbyman:1","source":"worker"}
        originals=(refresh.load_seeds,refresh.worker_exact_item_candidate,refresh.rakuten_api_exact_candidate,refresh.rakuten_api_candidate,refresh.worker_candidate,refresh.page_sales_audit,refresh.time.sleep)
        try:
            refresh.load_seeds=lambda:[seed]
            refresh.worker_exact_item_candidate=lambda _seed:None
            refresh.rakuten_api_exact_candidate=lambda _seed:(_ for _ in ()).throw(RuntimeError("api down"))
            refresh.rakuten_api_candidate=lambda _seed:(_ for _ in ()).throw(RuntimeError("api down"))
            refresh.worker_candidate=lambda _seed:candidate
            refresh.page_sales_audit=lambda _seed,_url,_price:("exact_feed_fallback",_price)
            refresh.time.sleep=lambda _seconds:None
            result=refresh.acquire()
            self.assertEqual(len(result["products"]),1)
            self.assertEqual(result["products"][0]["audit"]["salesSource"],"worker")
        finally:
            (refresh.load_seeds,refresh.worker_exact_item_candidate,refresh.rakuten_api_exact_candidate,refresh.rakuten_api_candidate,refresh.worker_candidate,refresh.page_sales_audit,refresh.time.sleep)=originals

    def test_freed_gt_current_seed_identity(self):
        seed={
            "identityGroups":[["フリード","FREED"],["GT系","GT1","GT2","GT3","GT4","GT5","GT6","GT7","GT8"],["サンシェード"],["8PCS","8枚","全窓","フルセット"]],
            "forbiddenTerms":["GB5","GB6","GB7","GB8"]
        }
        self.assertTrue(refresh.identity_ok("SUNVIC フリード GT系 サンシェード 8PCS",seed))
        self.assertFalse(refresh.identity_ok("フリード GB5 サンシェード 8PCS",seed))

    def test_nbox_exact_product_identifier_is_first_query(self):
        seed={"query":"nboxjf5-flatc","searchQueries":["nboxjf5-flatc","NBOX JF5 JF6 4個セット"]}
        self.assertEqual(refresh.seed_queries(seed)[0],"nboxjf5-flatc")

    def test_nvan_jj1_slash_2_title_is_valid_for_jj1_jj2_fit(self):
        seed={
            "identityGroups":[["Levolva"],["N-VAN","NVAN","N VAN"],["JJ1/2","JJ1/2系","JJ1/JJ2","JJ1系","JJ2系"],["車中泊マット","専用マットレス"],["LVMR-11","ラゲッジマット"]],
            "forbiddenTerms":["N-WGN"]
        }
        title="Levolva JJ1/2系 NVAN NVAN＋STYLE 専用マットレス 車中泊マット＆ラゲッジマット"
        self.assertTrue(refresh.identity_ok(title,seed))

    def test_freed_crosstar_5_cellutane_title_matches_without_old_gb_models(self):
        seed={
            "identityGroups":[["CELLUTANE"],["フリード","FREED"],["クロスター","クロスタ","CROSSTAR"],["5人乗り"],["車中泊マット","車中泊マットレス"]],
            "forbiddenTerms":["6人乗り","7人乗り","GB5","GB6","GB7","GB8"]
        }
        title="CELLUTANE A1609a-5-602BK [車中泊マット フリードクロスタGT6/8/2/4 5人乗り用]"
        self.assertTrue(refresh.identity_ok(title,seed))

    def test_sienta_10_five_seat_cartist_title_matches_without_seven_seat(self):
        seed={
            "identityGroups":[["Cartist"],["シエンタ","SIENTA"],["10系"],["5人乗り"],["車中泊"],["マット","ベッド","ベット"]],
            "forbiddenTerms":["7人乗り","170系"]
        }
        title="Cartist トヨタ 新型 シエンタ 10系 5人乗り 専用 車中泊 マット 折りたたみ 車用ベッド"
        self.assertTrue(refresh.identity_ok(title,seed))
        self.assertFalse(refresh.identity_ok(title+" 7人乗り",seed))

    def test_hustler_atmys_current_floor_seed_rejects_old_generation(self):
        seed={"identityGroups":[["ハスラー","HUSTLER"],["MR52S"],["MR92S"],["段差解消","シートフラットクッション"],["車中泊","マット"]],"forbiddenTerms":["MR31S","MR41S"]}
        good="車マット 新型 ハスラー MR52S MR92S Jスタイル 対応 シートフラットクッション 段差解消 車中泊 マット"
        self.assertTrue(refresh.identity_ok(good,seed))
        self.assertFalse(refresh.identity_ok(good+" MR41S",seed))

    def test_nvan_hobbyman_floor_seed_requires_current_jj_fit(self):
        seed={"identityGroups":[["N-VAN","NVAN","N VAN"],["JJ1/2","JJ1","JJ2"],["車中泊ベッド","車中泊"],["マット","ベッドキット"]],"forbiddenTerms":["N-WGN"]}
        good="N-VAN JJ1/2系 N-VAN+スタイル JJ1/2系対応 車中泊ベッド マット ベッドキット"
        self.assertTrue(refresh.identity_ok(good,seed))
        self.assertFalse(refresh.identity_ok("N-WGN JJ1 車中泊ベッド マット",seed))

    def test_every_levolva_floor_seed_rejects_wagon_fit(self):
        seed={"identityGroups":[["Levolva"],["エブリイ","EVERY"],["DA17V"],["DA18V"],["車中泊マット","専用マットレス"]],"forbiddenTerms":["DA17W","DA18W"]}
        good="Levolva DA17V DA18V エブリイ バン 専用マットレス 車中泊マット"
        self.assertTrue(refresh.identity_ok(good,seed))
        self.assertFalse(refresh.identity_ok(good+" DA18W",seed))

    def test_freed_cartist_five_seat_seed_never_crosses_to_six_or_seven_seat(self):
        seed={"identityGroups":[["Cartist"],["フリード","FREED"],["GT","GT2","GT4","GT6","GT8"],["5人乗り"],["車中泊"],["マット","ベッド"]],"forbiddenTerms":["6人乗り","7人乗り"]}
        good="Cartist ホンダ 新型 フリード GT系 5人乗り 専用 車中泊 マット 車用ベッド"
        self.assertTrue(refresh.identity_ok(good,seed))
        self.assertFalse(refresh.identity_ok(good+" 7人乗り",seed))

    def test_worker_exact_item_candidate_requires_exact_url_and_identity(self):
        import urllib.parse
        seed={
            "itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/",
            "searchQueries":["N-VAN JJ1 サンシェード"],
            "identityGroups":[["N-VAN"],["JJ1"],["サンシェード"]],
            "forbiddenTerms":[]
        }
        affiliate="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+urllib.parse.quote(seed["itemUrl"],safe="")
        original=refresh.fetch_json_quick
        try:
            refresh.fetch_json_quick=lambda url,headers=None,timeout=4:{
                "found":True,
                "name":"N-VAN JJ1 サンシェード フルセット",
                "price":5980,
                "item_url":seed["itemUrl"],
                "affiliate_url":affiliate,
                "image":"https://example.com/item.jpg",
                "item_code":"hobbyman:123"
            }
            candidate=refresh.worker_exact_item_candidate(seed)
            self.assertEqual(candidate["itemUrl"],seed["itemUrl"])
            self.assertEqual(candidate["source"],"worker_exact_url")

            refresh.fetch_json_quick=lambda url,headers=None,timeout=4:{
                "found":True,
                "name":"N-VAN JJ1 サンシェード フルセット",
                "price":5980,
                "item_url":"https://item.rakuten.co.jp/hobbyman/other/",
                "affiliate_url":affiliate,
                "image":"https://example.com/item.jpg"
            }
            self.assertIsNone(refresh.worker_exact_item_candidate(seed))
        finally:
            refresh.fetch_json_quick=original

    def test_worker_exact_item_candidate_returns_none_when_endpoint_has_no_exact_item(self):
        seed={
            "itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/",
            "searchQueries":["N-VAN JJ1"],
            "identityGroups":[["N-VAN"]],
            "forbiddenTerms":[]
        }
        original=refresh.fetch_json_quick
        try:
            refresh.fetch_json_quick=lambda url,headers=None,timeout=4:{"found":False,"reason":"exact_item_not_found"}
            self.assertIsNone(refresh.worker_exact_item_candidate(seed))
        finally:
            refresh.fetch_json_quick=original

    def test_worker_exact_url_lookup_runs_once_with_first_query_and_four_second_budget(self):
        import urllib.parse
        seed={
            "itemUrl":"https://item.rakuten.co.jp/shop/exact/",
            "query":"fallback",
            "searchQueries":["exact-model-code","broad vehicle phrase"],
            "identityGroups":[["N-BOX"],["JF5"]],"forbiddenTerms":[]
        }
        seen=[]
        original=refresh.fetch_json_quick
        try:
            def fake(url,headers=None,timeout=4):
                seen.append((urllib.parse.parse_qs(urllib.parse.urlparse(url).query),timeout))
                return {"found":False}
            refresh.fetch_json_quick=fake
            self.assertIsNone(refresh.worker_exact_item_candidate(seed))
            self.assertEqual(len(seen),1)
            self.assertEqual(seen[0][0]["q"],["exact-model-code"])
            self.assertEqual(seen[0][1],4)
        finally:
            refresh.fetch_json_quick=original

    def test_every_cartist_van_seed_rejects_wagon(self):
        seed={"identityGroups":[["Cartist"],["エブリイ","EVERY"],["DA17V"],["DA18V"],["車中泊"],["マット","ベッド"]],"forbiddenTerms":["DA17W","DA18W","ワゴン"]}
        good="Cartist スズキ エブリイ バン DA17V DA18V 車中泊 マット ベッド"
        self.assertTrue(refresh.identity_ok(good,seed))
        self.assertFalse(refresh.identity_ok(good+" DA18W ワゴン",seed))

    def test_sienta_seven_seat_full_mat_seed_rejects_other_seat_counts(self):
        seed={"identityGroups":[["シエンタ"],["MXPC10G","MXPL10G","MXPL15G"],["7人乗り"],["全席用"],["車中泊","フラットマット"]],"forbiddenTerms":["5人乗り","6人乗り","助手席用","福祉仕様"]}
        good="シエンタ MXPC10G MXPL10G MXPL15G 7人乗り 全席用 車中泊フラットマット"
        self.assertTrue(refresh.identity_ok(good,seed))
        self.assertFalse(refresh.identity_ok(good+" 5人乗り",seed))
        self.assertFalse(refresh.identity_ok(good+" 助手席用",seed))

    def test_runtime_budget_retains_only_fresh_unprocessed_previous_items(self):
        from datetime import datetime, timezone, timedelta
        now=datetime.now(timezone.utc)
        fresh={"productId":"fresh","verifiedAt":(now-timedelta(days=2)).isoformat()}
        stale={"productId":"stale","verifiedAt":(now-timedelta(days=8)).isoformat()}
        self.assertTrue(refresh.previous_product_fresh(fresh,now))
        self.assertFalse(refresh.previous_product_fresh(stale,now))

    def test_zero_runtime_budget_keeps_fresh_previous_without_network_calls(self):
        from datetime import datetime, timezone
        now=datetime.now(timezone.utc).isoformat()
        seed={"productId":"keep","fitCheckedAt":"2026-10-05"}
        old={"productId":"keep","verifiedAt":now,"audit":{"status":"verified_live"}}
        originals=(refresh.load_seeds,refresh.load_previous_products,refresh.time.monotonic)
        try:
            refresh.load_seeds=lambda:[seed]
            refresh.load_previous_products=lambda:[old]
            refresh.time.monotonic=lambda:0
            result=refresh.acquire(runtime_budget_seconds=0)
            self.assertEqual([p["productId"] for p in result["products"]],["keep"])
            self.assertEqual(result["deferred"]["keep"],"runtime_budget_retained_previous")
            self.assertEqual(result["failures"],{})
        finally:
            refresh.load_seeds,refresh.load_previous_products,refresh.time.monotonic=originals

    def test_refresh_order_prioritizes_previous_live_products_oldest_first(self):
        from datetime import datetime, timezone, timedelta
        now=datetime(2026,10,5,tzinfo=timezone.utc)
        seeds=[{"productId":"new-a"},{"productId":"live-newer"},{"productId":"live-older"},{"productId":"new-b"}]
        previous={
            "live-newer":{"productId":"live-newer","verifiedAt":(now-timedelta(days=1)).isoformat()},
            "live-older":{"productId":"live-older","verifiedAt":(now-timedelta(days=5)).isoformat()}
        }
        ordered=refresh.order_seeds_for_refresh(seeds,previous,now)
        self.assertEqual([x["productId"] for x in ordered[:2]],["live-older","live-newer"])
        self.assertEqual(set(x["productId"] for x in ordered[2:]),{"new-a","new-b"})

    def test_unresolved_refresh_order_rotates_by_day(self):
        from datetime import datetime, timezone
        seeds=[{"productId":"a"},{"productId":"b"},{"productId":"c"}]
        day1=refresh.order_seeds_for_refresh(seeds,{},datetime(2026,1,1,tzinfo=timezone.utc))
        day2=refresh.order_seeds_for_refresh(seeds,{},datetime(2026,1,2,tzinfo=timezone.utc))
        self.assertEqual([x["productId"] for x in day1],["a","b","c"])
        self.assertEqual([x["productId"] for x in day2],["b","c","a"])

    def test_transient_source_failure_keeps_previous_fresh_product_without_refreshing_timestamp(self):
        from datetime import datetime, timezone
        import urllib.error
        seed={
            "productId":"keep-me","name":"N-VAN shade","brand":"Test",
            "itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/",
            "gapIds":["privacy_full"],"fitCheckedAt":datetime.now(timezone.utc).date().isoformat(),
            "vehicleFit":[{"vehicleId":"honda-nvan-jj1-jj2","status":"verified"}]
        }
        verified=datetime.now(timezone.utc).isoformat()
        previous={"productId":"keep-me","name":"old verified item","price":5980,"verifiedAt":verified,"audit":{"status":"verified_live"}}
        originals=(refresh.load_seeds,refresh.load_previous_products,refresh.worker_exact_item_candidate,refresh.rakuten_api_exact_candidate,refresh.rakuten_api_candidate,refresh.worker_candidate,refresh.time.sleep)
        try:
            refresh.load_seeds=lambda:[seed]
            refresh.load_previous_products=lambda:[previous]
            def down(_seed):
                raise urllib.error.URLError("temporary source outage")
            refresh.worker_exact_item_candidate=down
            refresh.rakuten_api_exact_candidate=down
            refresh.rakuten_api_candidate=down
            refresh.worker_candidate=down
            refresh.time.sleep=lambda _seconds:None
            result=refresh.acquire(runtime_budget_seconds=30)
            self.assertEqual([p["productId"] for p in result["products"]],["keep-me"])
            self.assertEqual(result["products"][0]["verifiedAt"],verified)
            self.assertEqual(result["deferred"]["keep-me"],"transient_source_failure_retained_previous")
        finally:
            (refresh.load_seeds,refresh.load_previous_products,refresh.worker_exact_item_candidate,refresh.rakuten_api_exact_candidate,refresh.rakuten_api_candidate,refresh.worker_candidate,refresh.time.sleep)=originals

    def test_explicit_unavailable_product_is_not_carried_forward(self):
        from datetime import datetime, timezone
        import urllib.parse
        seed={
            "productId":"remove-me","name":"N-VAN shade","brand":"Test",
            "itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/",
            "gapIds":["privacy_full"],"fitCheckedAt":datetime.now(timezone.utc).date().isoformat(),
            "vehicleFit":[{"vehicleId":"honda-nvan-jj1-jj2","status":"verified"}]
        }
        previous={"productId":"remove-me","name":"old verified item","price":5980,"verifiedAt":datetime.now(timezone.utc).isoformat(),"audit":{"status":"verified_live"}}
        affiliate="https://hb.afl.rakuten.co.jp/hgc/x/?pc="+urllib.parse.quote(seed["itemUrl"],safe="")
        candidate={"name":"N-VAN shade","price":5980,"url":affiliate,"itemUrl":seed["itemUrl"],"image":"https://example.com/item.jpg","itemCode":"hobbyman:1","source":"worker_exact_url"}
        originals=(refresh.load_seeds,refresh.load_previous_products,refresh.worker_exact_item_candidate,refresh.rakuten_api_exact_candidate,refresh.rakuten_api_candidate,refresh.worker_candidate,refresh.page_sales_audit,refresh.time.sleep)
        try:
            refresh.load_seeds=lambda:[seed]
            refresh.load_previous_products=lambda:[previous]
            refresh.worker_exact_item_candidate=lambda _seed:candidate
            refresh.rakuten_api_exact_candidate=lambda _seed:None
            refresh.rakuten_api_candidate=lambda _seed:None
            refresh.worker_candidate=lambda _seed:None
            refresh.page_sales_audit=lambda *_args:(_ for _ in ()).throw(ValueError("unavailable"))
            refresh.time.sleep=lambda _seconds:None
            result=refresh.acquire(runtime_budget_seconds=30)
            self.assertEqual(result["products"],[])
            self.assertNotIn("remove-me",result["deferred"])
            self.assertEqual(result["failures"]["remove-me"],"unavailable")
        finally:
            (refresh.load_seeds,refresh.load_previous_products,refresh.worker_exact_item_candidate,refresh.rakuten_api_exact_candidate,refresh.rakuten_api_candidate,refresh.worker_candidate,refresh.page_sales_audit,refresh.time.sleep)=originals


    def test_privacy_seeds_are_not_single_shop_dependencies_for_nbox_and_hustler(self):
        import json
        from pathlib import Path
        seed_dir=Path(__file__).resolve().parents[1]/"car-stay"/"data"/"product-seeds"
        seeds=[json.loads(p.read_text()) for p in seed_dir.glob("*.json")]
        cases={
            "honda-nbox-jf5-jf6":set(),
            "suzuki-hustler-mr52s-mr92s":set(),
        }
        for seed in seeds:
            if "privacy_full" not in seed.get("gapIds",[]): continue
            shop=refresh.rakuten_shop(seed.get("itemUrl",""))
            for fit in seed.get("vehicleFit",[]):
                vehicle_id=fit.get("vehicleId")
                if vehicle_id in cases and fit.get("status")=="verified" and shop:
                    cases[vehicle_id].add(shop)
        self.assertGreaterEqual(len(cases["honda-nbox-jf5-jf6"]),2)
        self.assertGreaterEqual(len(cases["suzuki-hustler-mr52s-mr92s"]),2)


    def test_nvan_nomad_all_seat_seed_requires_jj_and_rejects_ev(self):
        seed={
            "identityGroups":[["N-VAN","NVAN","N VAN"],["JJ1/JJ2","JJ1","JJ2"],["全席用"],["フラットマット","車中泊マット"],["NOMAD BASE","セルタン","CELLUTANE"]],
            "forbiddenTerms":["EVモデル","N-VAN e:"]
        }
        good="N-VAN エヌバン JJ1/JJ2専用 フラットマット 車中泊マット 全席用 NOMAD BASE セルタン"
        bad=good+" EVモデル"
        self.assertTrue(refresh.identity_ok(good,seed))
        self.assertFalse(refresh.identity_ok(bad,seed))

    def test_fresh_previous_product_is_retained_when_current_search_only_misses(self):
        from datetime import datetime, timezone
        seed={
            "productId":"keep-on-search-miss","name":"FREED floor","brand":"Test",
            "itemUrl":"https://item.rakuten.co.jp/jroad/exact/",
            "gapIds":["sleep_surface"],"fitCheckedAt":datetime.now(timezone.utc).date().isoformat(),
            "vehicleFit":[{"vehicleId":"honda-freed-gt","status":"verified","seatCounts":[5],"trims":["CROSSTAR"]}]
        }
        verified=datetime.now(timezone.utc).isoformat()
        previous={"productId":"keep-on-search-miss","name":"previous verified","price":9580,"verifiedAt":verified,"audit":{"status":"verified_live"}}
        originals=(refresh.load_seeds,refresh.load_previous_products,refresh.worker_exact_item_candidate,refresh.rakuten_api_exact_candidate,refresh.rakuten_api_candidate,refresh.worker_candidate,refresh.time.sleep)
        try:
            refresh.load_seeds=lambda:[seed]
            refresh.load_previous_products=lambda:[previous]
            refresh.worker_exact_item_candidate=lambda _seed:None
            refresh.rakuten_api_exact_candidate=lambda _seed:None
            refresh.rakuten_api_candidate=lambda _seed:None
            refresh.worker_candidate=lambda _seed:None
            refresh.time.sleep=lambda _seconds:None
            result=refresh.acquire(runtime_budget_seconds=30)
            self.assertEqual([p["productId"] for p in result["products"]],["keep-on-search-miss"])
            self.assertEqual(result["products"][0]["verifiedAt"],verified)
            self.assertEqual(result["deferred"]["keep-on-search-miss"],"transient_source_failure_retained_previous")
            self.assertEqual(result["failures"]["keep-on-search-miss"],"same_shop_identity_listing_not_found")
        finally:
            (refresh.load_seeds,refresh.load_previous_products,refresh.worker_exact_item_candidate,refresh.rakuten_api_exact_candidate,refresh.rakuten_api_candidate,refresh.worker_candidate,refresh.time.sleep)=originals

    def test_freed_gt_six_seat_atmys_seed_is_conservative_and_current_generation_only(self):
        import json
        from pathlib import Path
        path=Path(__file__).resolve().parents[1]/"car-stay"/"data"/"product-seeds"/"freed-floor-6-atmys.json"
        seed=json.loads(path.read_text())
        fit=seed["vehicleFit"][0]
        self.assertEqual(fit["vehicleId"],"honda-freed-gt")
        self.assertEqual(fit["seatCounts"],[6])
        self.assertEqual(seed["recommendationRole"],"beginner_alternative")
        self.assertTrue(refresh.identity_ok("新型 フリード GT1/8 AIR CROSSTAR シートフラットクッション 段差解消 車中泊マット",seed))
        self.assertFalse(refresh.identity_ok("フリード GB5 GT1/8 段差解消 車中泊マット",seed))

    def test_nvan_dedicated_bed_search_starts_with_exact_product_number(self):
        import json
        from pathlib import Path
        path=Path(__file__).resolve().parents[1]/"car-stay"/"data"/"product-seeds"/"nvan-floor-hobbyman.json"
        seed=json.loads(path.read_text())
        self.assertEqual(seed["searchQueries"][0],"02k-a005-ca")
        self.assertEqual(seed["itemUrl"],"https://item.rakuten.co.jp/hobbyman/n-van-kurumat/")

    def test_same_shop_replacement_cannot_fallback_when_sales_page_is_unreachable(self):
        seed={"itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/","identityGroups":[["N-VAN"],["JJ1"]]}
        original=refresh.fetch_text_cached
        try:
            def boom(_): raise RuntimeError("blocked")
            refresh.fetch_text_cached=boom
            with self.assertRaisesRegex(ValueError,"sales_page_unreachable"):
                refresh.page_sales_audit(seed,"https://item.rakuten.co.jp/hobbyman/replacement/",12345)
        finally:
            refresh.fetch_text_cached=original

    def test_exact_seed_listing_may_use_feed_fallback_when_sales_page_is_unreachable(self):
        seed={"itemUrl":"https://item.rakuten.co.jp/hobbyman/exact/","identityGroups":[["N-VAN"],["JJ1"]]}
        original=refresh.fetch_text_cached
        try:
            def boom(_): raise RuntimeError("blocked")
            refresh.fetch_text_cached=boom
            mode,price=refresh.page_sales_audit(seed,seed["itemUrl"],12345)
            self.assertEqual(mode,"exact_feed_fallback")
            self.assertEqual(price,12345)
        finally:
            refresh.fetch_text_cached=original

    def test_fit_audit_uses_japan_calendar_date(self):
        from datetime import datetime, timezone
        now=datetime(2026,10,5,22,30,tzinfo=timezone.utc)  # 2026-10-06 07:30 JST
        self.assertTrue(refresh.fit_audit_fresh({"fitCheckedAt":"2026-10-06"},now))
        self.assertFalse(refresh.fit_audit_fresh({"fitCheckedAt":"2026-10-07"},now))

    def test_sales_page_unreachable_is_treated_as_transient_for_fresh_previous_item(self):
        self.assertTrue(refresh.transient_audit_failure("sales_page_unreachable"))
        self.assertFalse(refresh.transient_audit_failure("unavailable"))

    def test_rakuten_item_slug_comes_from_audited_item_url(self):
        self.assertEqual(refresh.rakuten_item_slug("https://item.rakuten.co.jp/suwariba/o023/"),"o023")
        self.assertEqual(refresh.rakuten_item_slug("https://item.rakuten.co.jp/premoa/4982323269905/"),"4982323269905")

    def test_exact_api_lookup_tries_shop_and_url_slug_without_sales_page_item_id(self):
        import os, urllib.parse
        seed={
            "itemUrl":"https://item.rakuten.co.jp/suwariba/o023/",
            "identityGroups":[["N-VAN"],["JJ1"],["JJ2"],["全席用"],["車中泊マット"]],
            "forbiddenTerms":[]
        }
        old={k:os.environ.get(k) for k in ["RAKUTEN_APPLICATION_ID","RAKUTEN_ACCESS_KEY","RAKUTEN_AFFILIATE_ID"]}
        original_fetch,original_page=refresh.fetch_json,refresh.exact_page_info
        seen=[]
        try:
            os.environ["RAKUTEN_APPLICATION_ID"]="app"
            os.environ["RAKUTEN_ACCESS_KEY"]="key"
            os.environ["RAKUTEN_AFFILIATE_ID"]="aff"
            refresh.exact_page_info=lambda _seed:None
            def fake(url,headers=None):
                seen.append(urllib.parse.parse_qs(urllib.parse.urlparse(url).query))
                return {"items":[{
                    "itemName":"N-VAN JJ1 JJ2 全席用 車中泊マット",
                    "itemCode":"suwariba:o023",
                    "itemPrice":19900,
                    "itemUrl":"https://item.rakuten.co.jp/suwariba/o023/",
                    "affiliateUrl":"https://hb.afl.rakuten.co.jp/hgc/x/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fsuwariba%2Fo023%2F",
                    "mediumImageUrls":["https://example.com/o023.jpg"],
                    "shopCode":"suwariba"
                }]}
            refresh.fetch_json=fake
            candidate=refresh.rakuten_api_exact_candidate(seed)
            self.assertEqual(seen[0]["itemCode"],["suwariba:o023"])
            self.assertEqual(candidate["itemUrl"],seed["itemUrl"])
            self.assertEqual(candidate["itemCode"],"suwariba:o023")
        finally:
            refresh.fetch_json,refresh.exact_page_info=original_fetch,original_page
            for k,v in old.items():
                if v is None: os.environ.pop(k,None)
                else: os.environ[k]=v

    def test_explicit_rakuten_item_code_is_tried_before_url_slug(self):
        import os, urllib.parse
        seed={
            "itemUrl":"https://item.rakuten.co.jp/atmys/kurumat-black-hustler-mr52s-1/",
            "rakutenItemCode":"atmys:01k-g018-ca",
            "identityGroups":[["ハスラー"],["MR52S"],["MR92S"],["段差解消","シートフラットクッション"]],
            "forbiddenTerms":[]
        }
        old={k:os.environ.get(k) for k in ["RAKUTEN_APPLICATION_ID","RAKUTEN_ACCESS_KEY","RAKUTEN_AFFILIATE_ID"]}
        original_fetch,original_page=refresh.fetch_json,refresh.exact_page_info
        seen=[]
        try:
            os.environ["RAKUTEN_APPLICATION_ID"]="app"
            os.environ["RAKUTEN_ACCESS_KEY"]="key"
            os.environ["RAKUTEN_AFFILIATE_ID"]="aff"
            refresh.exact_page_info=lambda _seed:None
            def fake(url,headers=None):
                seen.append(urllib.parse.parse_qs(urllib.parse.urlparse(url).query))
                return {"items":[]}
            refresh.fetch_json=fake
            refresh.rakuten_api_exact_candidate(seed)
            self.assertEqual(seen[0]["itemCode"],["atmys:01k-g018-ca"])
        finally:
            refresh.fetch_json,refresh.exact_page_info=original_fetch,original_page
            for k,v in old.items():
                if v is None: os.environ.pop(k,None)
                else: os.environ[k]=v

    def test_worker_exact_lookup_passes_explicit_item_code(self):
        import urllib.parse
        seed={
            "itemUrl":"https://item.rakuten.co.jp/hobbyman/n-van-kurumat/",
            "query":"N-VAN JJ1 JJ2 車中泊ベッド",
            "searchQueries":["N-VAN JJ1/2 専用 車中泊ベッド"],
            "rakutenItemCode":"hobbyman:02k-a005-ca",
            "identityGroups":[["N-VAN"],["JJ1"],["JJ2"],["車中泊"]],
            "forbiddenTerms":[]
        }
        seen=[]
        original=refresh.fetch_json_quick
        try:
            def fake(url,headers=None,timeout=4):
                seen.append(urllib.parse.parse_qs(urllib.parse.urlparse(url).query))
                return {
                    "found":True,
                    "name":"N-VAN JJ1 JJ2 車中泊ベッド マット",
                    "price":19800,
                    "item_url":seed["itemUrl"],
                    "affiliate_url":"https://hb.afl.rakuten.co.jp/hgc/x/?pc="+urllib.parse.quote(seed["itemUrl"],safe=""),
                    "image":"https://example.com/nvan.jpg",
                    "item_code":seed["rakutenItemCode"]
                }
            refresh.fetch_json_quick=fake
            candidate=refresh.worker_exact_item_candidate(seed)
            self.assertEqual(seen[0]["itemCode"],[seed["rakutenItemCode"]])
            self.assertEqual(candidate["itemUrl"],seed["itemUrl"])
        finally:
            refresh.fetch_json_quick=original

    def test_candidate_title_can_be_broader_than_final_page_fit_identity(self):
        seed={
            "identityGroups":[["N-VAN"],["JJ1"],["JJ2"],["ベッドキット"]],
            "candidateIdentityGroups":[["N-VAN"],["ベッドキット"]],
            "forbiddenTerms":["N-WGN"]
        }
        self.assertTrue(refresh.identity_ok("N-VAN ベッドキット Full type 車中泊マット",seed))
        self.assertFalse(refresh.required_groups_ok("N-VAN ベッドキット Full type 車中泊マット",seed))
        self.assertTrue(refresh.required_groups_ok("N-VAN JJ1 JJ2 ベッドキット Full type",seed))
        self.assertFalse(refresh.identity_ok("N-WGN N-VAN ベッドキット",seed))

if __name__=="__main__":
    unittest.main()
