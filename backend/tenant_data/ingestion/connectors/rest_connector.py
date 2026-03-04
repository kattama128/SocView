import base64
import json
import time
from datetime import datetime, timezone
from urllib import parse, request
from urllib.error import HTTPError, URLError


def _read_json(response):
    body = response.read().decode("utf-8")
    if not body:
        return {}
    return json.loads(body)


def _resolve_path(payload, path, default=None):
    if not path:
        return payload
    current = payload
    for token in str(path).split("."):
        if isinstance(current, dict):
            current = current.get(token)
        else:
            return default
    return current if current is not None else default


def _prepare_headers(config):
    headers = dict(config.get("headers", {}))
    headers.setdefault("Accept", "application/json")

    auth = config.get("auth", {})
    auth_type = auth.get("type")
    if auth_type == "token":
        token = auth.get("token")
        if token:
            prefix = auth.get("prefix", "Bearer")
            headers["Authorization"] = f"{prefix} {token}".strip()
    elif auth_type == "basic":
        username = auth.get("username", "")
        password = auth.get("password", "")
        raw = f"{username}:{password}".encode("utf-8")
        headers["Authorization"] = f"Basic {base64.b64encode(raw).decode('utf-8')}"

    return headers


def _http_call(url, method, headers, payload, timeout=15):
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")

    req = request.Request(url=url, data=data, method=method, headers=headers)
    with request.urlopen(req, timeout=timeout) as response:
        return response.status, _read_json(response)


def _is_internal_mock_rest_endpoint(url):
    parsed = parse.urlparse(url)
    return parsed.path.rstrip("/") == "/api/ingestion/mock/rest-events"


def _build_internal_mock_events():
    now = datetime.now(timezone.utc).isoformat()
    return [
        {
            "event_id": "rest-demo-1",
            "title": "REST suspicious activity",
            "severity": "high",
            "timestamp": now,
            "message": "Evento REST demo ripetibile per dedup",
        },
        {
            "event_id": "rest-demo-2",
            "title": "REST parser failure demo",
            "severity": "medium",
            "timestamp": now,
            "message": "Evento con parse error controllato",
            "force_parse_error": True,
            "parse_error_message": "Errore parser simulato da REST mock",
        },
    ]


def fetch_rest_events(source):
    config = source.config.config_json or {}

    if config.get("use_mock", False):
        return config.get("mock_events", [])

    base_url = config.get("url")
    method = str(config.get("method", "GET")).upper()
    payload = config.get("body")
    timeout = int(config.get("timeout", 15))
    headers = _prepare_headers(config)

    if not base_url:
        raise ValueError("Configurazione REST incompleta: url obbligatoria")
    if _is_internal_mock_rest_endpoint(base_url):
        return _build_internal_mock_events()

    pagination = config.get("pagination", {})
    rate_limit = int(config.get("rate_limit_per_minute", 0) or 0)

    def throttle():
        if rate_limit > 0:
            pause = 60.0 / float(rate_limit)
            time.sleep(pause)

    events = []

    if pagination.get("type") == "page":
        start = int(pagination.get("start", 1))
        max_pages = int(pagination.get("max_pages", 1))
        page_param = pagination.get("param", "page")
        results_path = pagination.get("results_path")

        for page in range(start, start + max_pages):
            url_parts = parse.urlparse(base_url)
            params = parse.parse_qs(url_parts.query)
            params[page_param] = [str(page)]
            query = parse.urlencode(params, doseq=True)
            paged_url = parse.urlunparse(url_parts._replace(query=query))

            status, data = _http_call(paged_url, method, headers, payload if method != "GET" else None, timeout=timeout)
            if status >= 400:
                raise ValueError(f"REST polling failed status={status}")

            page_events = _resolve_path(data, results_path, data)
            if isinstance(page_events, dict):
                page_events = [page_events]
            if not isinstance(page_events, list):
                page_events = []

            events.extend(page_events)
            if not page_events:
                break
            throttle()
    else:
        status, data = _http_call(base_url, method, headers, payload if method != "GET" else None, timeout=timeout)
        if status >= 400:
            raise ValueError(f"REST polling failed status={status}")

        results_path = config.get("results_path")
        resolved = _resolve_path(data, results_path, data)
        if isinstance(resolved, list):
            events = resolved
        elif isinstance(resolved, dict):
            events = [resolved]
        else:
            events = []

    return events


def test_rest_connection(source):
    config = source.config.config_json or {}
    if config.get("use_mock", False):
        return {"ok": True, "detail": "Mock REST attivo"}

    base_url = config.get("url")
    if not base_url:
        return {"ok": False, "detail": "URL mancante"}
    if _is_internal_mock_rest_endpoint(base_url):
        return {"ok": True, "detail": "Mock REST endpoint interno"}

    healthcheck_url = config.get("healthcheck_url") or base_url
    method = str(config.get("healthcheck_method", "GET")).upper()
    headers = _prepare_headers(config)
    timeout = int(config.get("timeout", 15))
    expected_path = config.get("healthcheck_expected_path")

    try:
        payload = config.get("healthcheck_body")
        if payload is None and method != "GET":
            payload = config.get("body")
        status, response_data = _http_call(
            healthcheck_url,
            method,
            headers,
            payload if method != "GET" else None,
            timeout=timeout,
        )
        if status >= 400:
            return {"ok": False, "detail": f"HTTP {status}"}
        if expected_path:
            marker = _resolve_path(response_data, expected_path)
            if marker is None:
                return {
                    "ok": False,
                    "detail": f"HTTP {status} ma path atteso mancante: {expected_path}",
                }
        return {"ok": True, "detail": f"HTTP {status}"}
    except (HTTPError, URLError, ValueError) as exc:
        return {"ok": False, "detail": str(exc)}
