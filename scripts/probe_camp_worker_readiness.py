"""Two-request bounded CAMP Worker comparison, no published-data mutation.

A public /health success alone cannot prove that Rakuten API secrets are
installed. The deployed Worker responds 400 to a deliberately INVALID item
identity only AFTER checking required secrets; 503 means not configured.
That request makes ZERO upstream Rakuten calls. Only if both checks succeed
do we attempt one audited exact item, then one *untrusted* alternate merchant
listing for comparison. A failed audited query aborts the second call.

All reported data are sanitized. Never print actual prices, SKUs, affiliate
URLs, API credentials, response bodies or raw network exceptions.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from acquire import ROOT
from stage_camp_api_evidence import WORKER, HEADERS, request_exact, validate_candidate
from probe_camp_alternate_sellers import ALTERNATES, _alternate_audit, _find_old

WORKER_ORIGIN = WORKER.removesuffix("/api/item-evidence")
SAMPLE_CATEGORY = "led_lantern"
SAMPLE_MODEL = "2000038854"
PROBE_TIMEOUT = 12
MAX_UPSTREAM_ITEM_REQUESTS = 2
REPORT = "reports/camp-worker-readiness.json"


def get_status(url, *, opener=None):
    request = urllib.request.Request(url, headers=HEADERS)
    try:
        if opener is None:
            opener = urllib.request.urlopen
        try:
            response = opener(request, timeout=PROBE_TIMEOUT)
            with response:
                status = response.status
                data = json.loads(response.read(4096).decode("utf-8"))
            return status, data if isinstance(data, dict) else {}
        except urllib.error.HTTPError as error:
            # Treat only the Worker-defined machine error as trustworthy.
            # An unrelated proxy 400/503 is NOT evidence of app readiness.
            try:
                payload = json.loads(error.read(4096).decode("utf-8"))
                code = payload.get("error") if isinstance(payload, dict) else None
            except (ValueError, UnicodeError):
                code = None
            return error.code, {"error": code if code in (
                "invalid_exact_item_identity", "server_not_configured") else None}
    except (urllib.error.URLError, TimeoutError, ValueError, UnicodeError, OSError):
        return None, {}


def probe(*, root=ROOT, get=get_status, fetch=None, now=None):
    observed = now or datetime.now(timezone.utc)
    if observed.tzinfo is None:
        raise ValueError("timezone_required")
    observed = observed.astimezone(timezone.utc)
    # Preconditions checked BEFORE any network requests.
    catalog_path = root / "data/products.json"
    audits_path = root / "data/audited-products.json"
    equipment_path = root / "data/equipment.json"
    paths = (catalog_path, audits_path, equipment_path)
    original = tuple(path.read_bytes() for path in paths)
    audits = json.loads(original[1]).get("products") or []
    equipment = json.loads(original[2])
    targets = [a for a in audits
               if a.get("category") == SAMPLE_CATEGORY
               and a.get("model") == SAMPLE_MODEL]
    if len(targets) != 1 or not targets[0].get("itemCode") or not targets[0].get("itemUrl"):
        raise ValueError("missing_previously_audited_sample")
    alternative = ALTERNATES[0]
    alternate = _alternate_audit(
        _find_old({"products": audits}, alternative[0], alternative[1]),
        alternative[2], alternative[3])
    if not alternate.get("itemCode") or not alternate.get("itemUrl"):
        raise ValueError("missing_alternate_merchant_identity")

    health_http, health = get(WORKER_ORIGIN + "/health")
    health_ok = (health_http == 200 and health.get("ok") is True
                 and health.get("service") == "daily-cost-api")
    config_http = None
    config_error = None
    api_status = "not_requested"
    alternative_status = "not_requested"
    alternate_http_status = None
    alternate_upstream_status = None
    attempted = 0
    # This is deliberately invalid input, not a request for any real product.
    # The Worker must return 400 only when credentials are present.
    if health_ok:
        config_http, config = get(WORKER_ORIGIN + "/api/item-evidence?url=invalid&itemCode=invalid")
        config_error = config.get("error")
    ready = health_ok and config_http == 400 and config_error == "invalid_exact_item_identity"
    if ready:
        attempted = 1
        live = request_exact(targets[0], fetch=fetch)
        api_status = validate_candidate(
            targets[0], live, equipment, observed.isoformat())["status"]
        if api_status == "api_confirmed_seller_variant_audit_required":
            # A known-good baseline separates general Worker outages from
            # invalid/retired/blocked unverified merchant listing IDs.
            attempted += 1
            other = request_exact(alternate, fetch=fetch)
            alternative_status = validate_candidate(
                alternate, other, equipment, observed.isoformat())["status"]
            if isinstance(other, dict) and alternative_status in (
                    "worker_unavailable", "rate_limited"):
                http = other.get("worker_status")
                upstream = other.get("upstream_status")
                alternate_http_status = http if type(http) is int and 100 <= http <= 599 else None
                alternate_upstream_status = upstream if type(upstream) is int and 100 <= upstream <= 599 else None
    elif health_http is None:
        api_status = "worker_health_unreachable"
    elif not health_ok:
        api_status = "worker_health_unverified"
    elif config_http == 503 and config_error == "server_not_configured":
        api_status = "worker_rakuten_credentials_missing"
    else:
        api_status = "worker_evidence_route_unverified"

    if any(p.read_bytes() != b for p, b in zip(paths, original)):
        raise AssertionError("production_input_mutated_by_probe")
    return {
        "schemaVersion": 1,
        "type": "worker_readiness_diagnostic_not_for_publication",
        "observedAt": observed.isoformat(),
        "healthHttpStatus": health_http,
        "healthOk": health_ok,
        "credentialGateHttpStatus": config_http,
        "credentialGateResponse": config_error,
        "credentialGateVerified": ready,
        "maximumRakutenApiRequests": MAX_UPSTREAM_ITEM_REQUESTS,
        "rakutenApiRequests": attempted,
        "officialExactItemEvidence": api_status,
        "unverifiedAlternateMerchantEvidence": alternative_status,
        "unverifiedAlternateWorkerHttp": alternate_http_status,
        "unverifiedAlternateRakutenHttp": alternate_upstream_status,
        "verifiedForPublication": False,
    }


def main(root=ROOT):
    result = probe(root=root)
    path = root / REPORT
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print("CAMP_WORKER_READINESS", json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
