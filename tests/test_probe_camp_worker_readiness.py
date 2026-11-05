"""No-network tests for nonpublishing Cloudflare Worker readiness triage."""
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import probe_camp_worker_readiness as readiness


class WorkerReadiness(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "data").mkdir()
        self.products = {"products": [{"model": "BASE"}]}
        self.audits = {"products": [
            {"category": "led_lantern", "model": "2000038854",
             "itemCode": "teststore:10001234",
             "itemUrl": "https://item.rakuten.co.jp/teststore/10001234/"},
            {"category": "led_lantern", "model": "2218364",
             "itemCode": "original:10002345",
             "itemUrl": "https://item.rakuten.co.jp/original/10002345/"}
        ]}
        for name, item in (
            ("products", self.products),
            ("audited-products", self.audits),
            ("equipment", {"categories": []}),
        ):
            (self.root / "data" / (name + ".json")).write_text(json.dumps(item))
        self.before = {
            p.name: p.read_bytes() for p in (self.root / "data").iterdir()
        }
        self.now = datetime(2026, 11, 5, 3, tzinfo=timezone.utc)

    def gate(self, health=(200, {"ok": True, "service": "daily-cost-api"}),
             config=(400, {"error": "invalid_exact_item_identity"})):
        calls = []
        def fake(url):
            calls.append(url)
            return config if "item-evidence" in url else health
        return fake, calls

    def check_read_only(self):
        for p in (self.root / "data").iterdir():
            self.assertEqual(p.read_bytes(), self.before[p.name])

    def test_valid_worker_configuration_performs_exactly_one_api_call(self):
        get, urls = self.gate()
        requests = []
        def item_fetch(audit, fetch=None):
            requests.append(audit)
            return {"found": True}
        with patch.object(readiness, "request_exact", side_effect=item_fetch), (
            patch.object(readiness, "validate_candidate",
                         return_value={"status": "api_confirmed_seller_variant_audit_required"})):
            result = readiness.probe(root=self.root, get=get, now=self.now)
        self.assertEqual(len(urls), 2)
        self.assertEqual(len(requests), 2)
        self.assertEqual(result["rakutenApiRequests"], 2)
        self.assertEqual(result["maximumRakutenApiRequests"], 2)
        self.assertTrue(result["credentialGateVerified"])
        self.assertEqual(result["officialExactItemEvidence"],
                         "api_confirmed_seller_variant_audit_required")
        self.assertEqual(result["unverifiedAlternateMerchantEvidence"],
                         "api_confirmed_seller_variant_audit_required")
        self.assertFalse(result["verifiedForPublication"])
        self.assertNotIn("itemCode", json.dumps(result))
        self.assertNotIn("itemUrl", json.dumps(result))
        self.check_read_only()

    def test_failed_known_seller_short_circuits_alternate_query(self):
        get, urls = self.gate()
        calls = []
        def fetch(audit, fetch=None):
            calls.append(audit["model"])
            return {"error": "worker_unavailable", "worker_status": 502}
        with patch.object(readiness, "request_exact", side_effect=fetch):
            result = readiness.probe(root=self.root, get=get, now=self.now)
        self.assertEqual(calls, ["2000038854"])
        self.assertEqual(result["rakutenApiRequests"], 1)
        self.assertEqual(result["officialExactItemEvidence"], "worker_unavailable")
        self.assertEqual(result["unverifiedAlternateMerchantEvidence"], "not_requested")
        self.assertFalse(result["verifiedForPublication"])
        self.check_read_only()

    def test_alternate_upstream_error_http_is_reported_without_merchant_identity(self):
        get, urls = self.gate()
        calls = []
        def fetch(audit, fetch=None):
            calls.append(audit["model"])
            return ({"found": True} if len(calls) == 1 else {
                "error": "worker_unavailable",
                "worker_status": 502,
                "upstream_status": 400})
        with patch.object(readiness, "request_exact", side_effect=fetch), (
            patch.object(readiness, "validate_candidate",
                         side_effect=[{"status": "api_confirmed_seller_variant_audit_required"},
                                      {"status": "worker_unavailable"}])):
            result = readiness.probe(root=self.root, get=get, now=self.now)
        self.assertEqual(calls, ["2000038854", "2218364"])
        self.assertEqual(result["rakutenApiRequests"], 2)
        self.assertEqual(result["unverifiedAlternateMerchantEvidence"], "worker_unavailable")
        self.assertEqual(result["unverifiedAlternateWorkerHttp"], 502)
        self.assertEqual(result["unverifiedAlternateRakutenHttp"], 400)
        self.assertFalse(result["verifiedForPublication"])
        text = json.dumps(result)
        self.assertNotIn("alpen", text)
        self.assertNotIn("itemCode", text)
        self.check_read_only()

    def test_missing_secrets_produces_diagnostic_without_rakuten_call(self):
        get, urls = self.gate(config=(503, {"error": "server_not_configured"}))
        with patch.object(readiness, "request_exact",
                          side_effect=AssertionError("must not call")):
            result = readiness.probe(root=self.root, get=get, now=self.now)
        self.assertEqual(len(urls), 2)
        self.assertEqual(result["rakutenApiRequests"], 0)
        self.assertEqual(result["credentialGateResponse"], "server_not_configured")
        self.assertEqual(result["officialExactItemEvidence"],
                         "worker_rakuten_credentials_missing")
        self.check_read_only()

    def test_deployed_old_route_and_proxy_failures_never_claim_success(self):
        for code, error in ((404, None), (400, None), (503, None),
                            (400, {"error": "server_not_configured"})):
            payload = error if isinstance(error, dict) else {}
            get, urls = self.gate(config=(code, payload))
            with patch.object(readiness, "request_exact",
                              side_effect=AssertionError("must not call")):
                result = readiness.probe(root=self.root, get=get, now=self.now)
            self.assertFalse(result["credentialGateVerified"])
            self.assertEqual(result["rakutenApiRequests"], 0)
            self.assertEqual(result["officialExactItemEvidence"],
                             "worker_evidence_route_unverified")
        self.check_read_only()

    def test_invalid_health_and_time_fail_before_item_api(self):
        for health in ((None, {}), (200, {"ok": False}),
                       (200, {"ok": True, "service": "different"})):
            get, urls = self.gate(health=health)
            with patch.object(readiness, "request_exact",
                              side_effect=AssertionError("must not call")):
                result = readiness.probe(root=self.root, get=get, now=self.now)
            self.assertEqual(len(urls), 1)
            self.assertEqual(result["rakutenApiRequests"], 0)
        get, urls = self.gate()
        with self.assertRaises(ValueError):
            readiness.probe(root=self.root, get=get,
                            now=datetime(2026, 11, 5))
        self.assertFalse(urls)
        self.check_read_only()

    def test_missing_or_duplicate_preaudited_model_aborts_before_network(self):
        for items in ([], self.audits["products"] * 2):
            (self.root / "data/audited-products.json").write_text(
                json.dumps({"products": items}))
            get, urls = self.gate()
            with self.assertRaises(ValueError):
                readiness.probe(root=self.root, get=get, now=self.now)
            self.assertFalse(urls)
            self.assertEqual(
                (self.root / "data/products.json").read_bytes(),
                self.before["products.json"])


if __name__ == "__main__":
    unittest.main()
