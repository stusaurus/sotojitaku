import importlib.util
import json
import pathlib
import unittest
from datetime import datetime, timezone
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("fishing_worker_diagnostics", ROOT / "fishing/scripts/refresh_products.py")
refresh = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(refresh)


class WorkerDiagnosticsTests(unittest.TestCase):
    def test_search_recovers_after_first_query_failure(self):
        seed = {
            "itemUrl": "https://item.rakuten.co.jp/shop/rod/",
            "searchQueries": ["first", "second"],
            "identityGroups": [["verified rod"]],
        }
        payload = {"products": [{"name": "verified rod", "price": 1000, "url": seed["itemUrl"], "image": "https://example.com/item.jpg"}]}
        with mock.patch.object(refresh, "fetch_json_quick", side_effect=[refresh.WorkerProbeError("rakuten_api_error"), payload]) as lookup:
            self.assertEqual(refresh.worker_search_candidate(seed)["itemUrl"], seed["itemUrl"])
        self.assertEqual(lookup.call_count, 2)

    def test_shipping_recovers_after_search_failure(self):
        seed = {
            "itemUrl": "https://item.rakuten.co.jp/shop/rod/",
            "searchQueries": ["first"],
            "identityGroups": [["verified rod"]],
        }
        payload = {"found": True, "name": "verified rod", "price": 1000, "url": seed["itemUrl"], "image": "https://example.com/item.jpg"}
        with mock.patch.object(refresh, "fetch_json_quick", side_effect=[refresh.WorkerProbeError("transport_error"), payload]):
            self.assertEqual(refresh.worker_search_candidate(seed)["source"], "worker_shipping_exact_url")

    def response(self, payload):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(payload).encode()
        return response

    def test_api_error_is_not_an_empty_catalog(self):
        with mock.patch.object(refresh.urllib.request, "urlopen", return_value=self.response({"found": False, "error": "rakuten_api_error"})):
            with self.assertRaisesRegex(refresh.WorkerProbeError, "^rakuten_api_error$"):
                refresh.fetch_json_quick(refresh.ITEM_LOOKUP)

    def test_confirmed_empty_response_remains_usable(self):
        payload = {"found": False, "reason": "exact_item_not_found"}
        with mock.patch.object(refresh.urllib.request, "urlopen", return_value=self.response(payload)):
            self.assertEqual(refresh.fetch_json_quick(refresh.ITEM_LOOKUP), payload)

    def test_upstream_message_and_transport_url_are_not_exposed(self):
        with mock.patch.object(refresh.urllib.request, "urlopen", return_value=self.response({"error": "private upstream body ?accessKey=secret"})):
            with self.assertRaisesRegex(refresh.WorkerProbeError, "^worker_api_error$"):
                refresh.fetch_json_quick(refresh.ITEM_LOOKUP)
        with mock.patch.object(refresh.urllib.request, "urlopen", side_effect=refresh.urllib.error.URLError("private request ?accessKey=secret")):
            with self.assertRaisesRegex(refresh.WorkerProbeError, "^transport_error$"):
                refresh.fetch_json_quick(refresh.ITEM_LOOKUP)

    def test_failed_probe_is_recorded_and_next_source_is_tried(self):
        seed = {"productId": "diagnostic-fixture"}
        with mock.patch.object(refresh, "spec_audit_fresh", return_value=True), \
             mock.patch.object(refresh, "worker_exact_candidate", side_effect=refresh.WorkerProbeError("rakuten_api_error")), \
             mock.patch.object(refresh, "api_search_candidate", return_value=None) as fallback, \
             mock.patch.object(refresh, "worker_search_candidate", return_value=None), \
             mock.patch.object(refresh, "api_exact_candidate", return_value=None):
            product, reason = refresh.audit_one(seed, datetime.now(timezone.utc), "2026-10-11")
        self.assertIsNone(product)
        self.assertIn("worker_exact_url:rakuten_api_error", reason)
        fallback.assert_called_once_with(seed)


if __name__ == "__main__":
    unittest.main()
