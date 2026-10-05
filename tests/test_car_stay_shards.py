import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def load_module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

refresh=load_module("car_stay_refresh_shard_test",ROOT/"car-stay"/"scripts"/"refresh_products.py")
merge=load_module("car_stay_merge_test",ROOT/"car-stay"/"scripts"/"merge_product_shards.py")

class CarStayShardTests(unittest.TestCase):
    def test_three_shards_partition_every_seed_exactly_once(self):
        original_total,original_index=refresh.SHARD_TOTAL,refresh.SHARD_INDEX
        try:
            all_paths=sorted(refresh.SEED_DIR.glob("*.json"))
            expected={json.loads(p.read_text())["productId"] for p in all_paths}
            seen=[]
            for index in range(3):
                refresh.SHARD_TOTAL=3
                refresh.SHARD_INDEX=index
                seen.extend(seed["productId"] for seed in refresh.load_seeds())
            self.assertEqual(set(seen),expected)
            self.assertEqual(len(seen),len(expected))
        finally:
            refresh.SHARD_TOTAL,refresh.SHARD_INDEX=original_total,original_index

    def test_merge_keeps_newest_product_and_clears_its_failure(self):
        with tempfile.TemporaryDirectory() as td:
            d=Path(td)
            base={"version":1,"runtimeBudgetSeconds":300,"deferred":{}}
            (d/"a.json").write_text(json.dumps({
                **base,"updatedAt":"2026-10-05T10:00:00+00:00",
                "products":[{"productId":"p1","verifiedAt":"2026-10-05T10:00:00+00:00","vehicleFit":[{"vehicleId":"v"}],"gapIds":["g"],"score":80}],
                "failures":{"p1":"old error"}
            }))
            (d/"b.json").write_text(json.dumps({
                **base,"updatedAt":"2026-10-05T11:00:00+00:00",
                "products":[{"productId":"p1","verifiedAt":"2026-10-05T11:00:00+00:00","vehicleFit":[{"vehicleId":"v"}],"gapIds":["g"],"score":90}],
                "failures":{}
            }))
            result=merge.merge(d)
            self.assertEqual(len(result["products"]),1)
            self.assertEqual(result["products"][0]["score"],90)
            self.assertNotIn("p1",result["failures"])
            self.assertEqual(result["shardsMerged"],2)

    def test_merge_preserves_distinct_products_from_each_shard(self):
        with tempfile.TemporaryDirectory() as td:
            d=Path(td)
            for i,pid in enumerate(("a","b","c")):
                (d/f"{i}.json").write_text(json.dumps({
                    "version":1,"updatedAt":f"2026-10-05T1{i}:00:00+00:00",
                    "runtimeBudgetSeconds":300,
                    "products":[{"productId":pid,"verifiedAt":f"2026-10-05T1{i}:00:00+00:00","vehicleFit":[{"vehicleId":f"v{i}"}],"gapIds":["g"],"score":80}],
                    "failures":{},"deferred":{}
                }))
            result=merge.merge(d)
            self.assertEqual({p["productId"] for p in result["products"]},{"a","b","c"})
            self.assertEqual(result["runtimeBudgetSeconds"],900)

if __name__=="__main__":
    unittest.main()
