import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib import error as urlerror
from urllib import request as urlrequest

from django.conf import settings
from django.db.models import Q, TextField
from django.db.models.functions import Cast
from django.utils.dateparse import parse_datetime
from django.utils.timezone import now
from django.db import connection
from django.contrib.postgres.search import SearchQuery, SearchVector

from tenant_data.models import Alert


DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100
ALLOWED_ORDERINGS = {
    "id",
    "title",
    "severity",
    "event_timestamp",
    "created_at",
    "updated_at",
}


def _strip_array_tokens(path: str) -> list[str]:
    return [piece.replace("[]", "") for piece in path.split(".") if piece]


def extract_path(payload: Any, field_path: str):
    if payload is None:
        return None

    current = payload
    for part in _strip_array_tokens(field_path):
        if isinstance(current, list):
            if not current:
                return None
            current = current[0]

        if isinstance(current, dict):
            if part not in current:
                return None
            current = current.get(part)
        else:
            return None

    if isinstance(current, list):
        if not current:
            return None
        return current[0]

    return current


def _coerce_bool(value: Any):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "y", "si", "s"}:
            return True
        if lowered in {"false", "0", "no", "n"}:
            return False
    return None


def _coerce_number(value: Any):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _coerce_datetime(value: Any):
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return parse_datetime(value)
    return None


def _keyword_match(candidate: Any, operator: str, expected: Any) -> bool:
    if candidate is None:
        return False

    if isinstance(candidate, (dict, list)):
        candidate_text = json.dumps(candidate, ensure_ascii=False)
    else:
        candidate_text = str(candidate)

    if operator == "contains":
        return str(expected).lower() in candidate_text.lower()

    if operator == "in":
        if not isinstance(expected, list):
            return False
        expected_set = {str(item).lower() for item in expected}
        return candidate_text.lower() in expected_set

    return candidate_text == str(expected)


def _compare_scalars(left: Any, operator: str, right: Any) -> bool:
    if operator == "eq":
        return left == right
    if operator == "gt":
        return left > right
    if operator == "gte":
        return left >= right
    if operator == "lt":
        return left < right
    if operator == "lte":
        return left <= right
    return False


def _match_dynamic_filter(alert: Alert, filter_item: dict[str, Any]) -> bool:
    field = filter_item.get("field")
    filter_type = filter_item.get("type")
    operator = filter_item.get("operator", "eq")
    expected = filter_item.get("value")

    parsed_value = extract_path(alert.parsed_payload, field)
    raw_value = extract_path(alert.raw_payload, field)
    candidate = parsed_value if parsed_value is not None else raw_value

    if filter_type == "keyword":
        return _keyword_match(candidate, operator, expected)

    if filter_type == "boolean":
        bool_candidate = _coerce_bool(candidate)
        bool_expected = _coerce_bool(expected)
        if bool_candidate is None or bool_expected is None:
            return False
        return bool_candidate == bool_expected

    if filter_type == "number":
        number_candidate = _coerce_number(candidate)
        number_expected = _coerce_number(expected)
        if number_candidate is None or number_expected is None:
            return False
        return _compare_scalars(number_candidate, operator, number_expected)

    if filter_type == "date":
        dt_candidate = _coerce_datetime(candidate)
        dt_expected = _coerce_datetime(expected)
        if dt_candidate is None or dt_expected is None:
            return False
        return _compare_scalars(dt_candidate, operator, dt_expected)

    return False


def _looks_like_datetime(value: Any, field_name: str) -> bool:
    if isinstance(value, datetime):
        return True
    if isinstance(value, str) and parse_datetime(value):
        return True
    lowered = field_name.lower()
    return "timestamp" in lowered or lowered.endswith("_at") or lowered.startswith("@")


def flatten_payload(payload: Any, prefix: str = "") -> list[tuple[str, Any]]:
    items: list[tuple[str, Any]] = []

    if isinstance(payload, dict):
        for key, value in payload.items():
            full_key = f"{prefix}.{key}" if prefix else str(key)
            items.extend(flatten_payload(value, full_key))
        return items

    if isinstance(payload, list):
        if not payload:
            return items
        first_value = payload[0]
        list_prefix = f"{prefix}[]" if prefix else "[]"
        items.extend(flatten_payload(first_value, list_prefix))
        return items

    if prefix:
        items.append((prefix, payload))
    return items


@dataclass
class SearchRequest:
    text: str = ""
    source_name: str = ""
    state_id: int | None = None
    severity: str = ""
    is_active: bool | None = None
    dynamic_filters: list[dict[str, Any]] | None = None
    ordering: str = "-event_timestamp"
    page: int = 1
    page_size: int = DEFAULT_PAGE_SIZE


@dataclass
class SearchResult:
    alert_ids: list[int]
    total: int
    backend: str


class BaseSearchBackend:
    name = "base"

    def search(self, request_data: SearchRequest) -> SearchResult:  # pragma: no cover
        raise NotImplementedError

    def ensure_index(self):
        return None

    def sync_alert(self, alert: Alert):
        return None

    def remove_alert(self, alert_id: int):
        return None

    def rebuild(self):
        self.ensure_index()
        for alert in Alert.objects.all().iterator():
            self.sync_alert(alert)


class PostgresSearchBackend(BaseSearchBackend):
    name = "postgres"

    def _apply_core_filters(self, queryset, request_data: SearchRequest):
        if request_data.source_name:
            queryset = queryset.filter(source_name=request_data.source_name)

        if request_data.state_id:
            queryset = queryset.filter(current_state_id=request_data.state_id)

        if request_data.severity:
            queryset = queryset.filter(severity=request_data.severity)

        if request_data.is_active is not None:
            queryset = queryset.filter(current_state__is_final=(request_data.is_active is False))

        if request_data.text:
            text_value = request_data.text.strip()
            if text_value:
                try:
                    vector = (
                        SearchVector("title", weight="A")
                        + SearchVector("source_name", weight="B")
                        + SearchVector(Cast("raw_payload", output_field=TextField()), weight="C")
                        + SearchVector(Cast("parsed_payload", output_field=TextField()), weight="C")
                    )
                    queryset = queryset.annotate(search_document=vector).filter(
                        search_document=SearchQuery(text_value, search_type="websearch")
                    )
                except Exception:
                    queryset = queryset.annotate(
                        raw_payload_text=Cast("raw_payload", output_field=TextField()),
                        parsed_payload_text=Cast("parsed_payload", output_field=TextField()),
                    ).filter(
                        Q(title__icontains=text_value)
                        | Q(source_name__icontains=text_value)
                        | Q(source_id__icontains=text_value)
                        | Q(dedup_fingerprint__icontains=text_value)
                        | Q(raw_payload_text__icontains=text_value)
                        | Q(parsed_payload_text__icontains=text_value)
                    )

        return queryset

    def search(self, request_data: SearchRequest) -> SearchResult:
        queryset = Alert.objects.all()
        queryset = self._apply_core_filters(queryset, request_data)

        dynamic_filters = request_data.dynamic_filters or []
        if dynamic_filters:
            filtered_ids = []
            for alert in queryset.only(
                "id",
                "raw_payload",
                "parsed_payload",
                "event_timestamp",
                "created_at",
                "updated_at",
                "severity",
                "title",
            ):
                matches = all(_match_dynamic_filter(alert, filter_item) for filter_item in dynamic_filters)
                if matches:
                    filtered_ids.append(alert.id)
            if not filtered_ids:
                return SearchResult(alert_ids=[], total=0, backend=self.name)
            queryset = queryset.filter(id__in=filtered_ids)

        ordering = request_data.ordering or "-event_timestamp"
        normalized = ordering.lstrip("-")
        if normalized not in ALLOWED_ORDERINGS:
            ordering = "-event_timestamp"

        queryset = queryset.order_by(ordering, "-id")

        total = queryset.count()
        page = max(1, int(request_data.page or 1))
        page_size = max(1, min(int(request_data.page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
        start = (page - 1) * page_size
        end = start + page_size
        ids = list(queryset.values_list("id", flat=True)[start:end])

        return SearchResult(alert_ids=ids, total=total, backend=self.name)


def _build_dynamic_filter_items(parsed_payload: dict | None) -> list[dict[str, Any]]:
    if not isinstance(parsed_payload, dict):
        return []

    entries: list[dict[str, Any]] = []
    for path, value in flatten_payload(parsed_payload):
        entry: dict[str, Any] = {"path": path}

        if isinstance(value, bool):
            entry["value_type"] = "boolean"
            entry["bool_value"] = value
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            entry["value_type"] = "number"
            entry["number_value"] = float(value)
        elif _looks_like_datetime(value, path):
            parsed = parse_datetime(value) if isinstance(value, str) else value
            if parsed:
                entry["value_type"] = "date"
                entry["date_value"] = parsed.isoformat()
            else:
                entry["value_type"] = "keyword"
                entry["keyword_value"] = str(value)
        elif value is None:
            continue
        else:
            entry["value_type"] = "keyword"
            entry["keyword_value"] = str(value)

        entries.append(entry)

    return entries


class ElasticSearchBackend(BaseSearchBackend):
    name = "elastic"

    def __init__(self):
        self.base_url = (getattr(settings, "ELASTICSEARCH_URL", "http://elasticsearch:9200") or "").rstrip("/")
        self.index_prefix = getattr(settings, "ELASTICSEARCH_INDEX_PREFIX", "socview-alerts")
        self.timeout = int(getattr(settings, "ELASTICSEARCH_TIMEOUT_SECONDS", 3))

    @property
    def index_name(self):
        schema = connection.schema_name or "public"
        safe_schema = schema.replace("_", "-")
        return f"{self.index_prefix}-{safe_schema}"

    def _request(self, method: str, path: str, payload: dict | None = None, expected_codes: set[int] | None = None):
        expected = expected_codes or {200, 201}
        url = f"{self.base_url}{path}"
        body = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urlrequest.Request(url=url, data=body, method=method, headers=headers)
        try:
            with urlrequest.urlopen(req, timeout=self.timeout) as response:
                raw_data = response.read().decode("utf-8")
                data = json.loads(raw_data) if raw_data else {}
                if response.status not in expected:
                    raise RuntimeError(f"Elastic risposta inattesa ({response.status})")
                return data
        except urlerror.HTTPError as exc:
            payload_text = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Elastic HTTP {exc.code}: {payload_text[:400]}") from exc
        except urlerror.URLError as exc:
            raise RuntimeError(f"Elastic non raggiungibile: {exc}") from exc

    def is_available(self) -> bool:
        try:
            self._request("GET", "/", expected_codes={200})
            return True
        except Exception:
            return False

    def ensure_index(self):
        if not self.is_available():
            raise RuntimeError("Elastic non disponibile")

        try:
            self._request("HEAD", f"/{self.index_name}", expected_codes={200})
            return
        except Exception:
            pass

        mappings = {
            "mappings": {
                "properties": {
                    "id": {"type": "integer"},
                    "title": {"type": "text"},
                    "severity": {"type": "keyword"},
                    "event_timestamp": {"type": "date"},
                    "created_at": {"type": "date"},
                    "updated_at": {"type": "date"},
                    "source_name": {"type": "keyword"},
                    "source_id": {"type": "keyword"},
                    "current_state_id": {"type": "integer"},
                    "is_active": {"type": "boolean"},
                    "dedup_fingerprint": {"type": "keyword"},
                    "raw_text": {"type": "text"},
                    "parsed_text": {"type": "text"},
                    "dynamic_values": {
                        "type": "nested",
                        "properties": {
                            "path": {"type": "keyword"},
                            "value_type": {"type": "keyword"},
                            "keyword_value": {"type": "keyword", "ignore_above": 2048},
                            "number_value": {"type": "double"},
                            "date_value": {"type": "date"},
                            "bool_value": {"type": "boolean"},
                        },
                    },
                }
            }
        }
        self._request("PUT", f"/{self.index_name}", payload=mappings, expected_codes={200, 201})

    def _build_doc(self, alert: Alert) -> dict[str, Any]:
        return {
            "id": alert.id,
            "title": alert.title,
            "severity": alert.severity,
            "event_timestamp": alert.event_timestamp.isoformat() if alert.event_timestamp else now().isoformat(),
            "created_at": alert.created_at.isoformat() if alert.created_at else now().isoformat(),
            "updated_at": alert.updated_at.isoformat() if alert.updated_at else now().isoformat(),
            "source_name": alert.source_name,
            "source_id": alert.source_id,
            "current_state_id": alert.current_state_id,
            "is_active": alert.is_active,
            "dedup_fingerprint": alert.dedup_fingerprint,
            "raw_text": json.dumps(alert.raw_payload or {}, ensure_ascii=False),
            "parsed_text": json.dumps(alert.parsed_payload or {}, ensure_ascii=False),
            "dynamic_values": _build_dynamic_filter_items(alert.parsed_payload),
        }

    def sync_alert(self, alert: Alert):
        self.ensure_index()
        doc = self._build_doc(alert)
        self._request("PUT", f"/{self.index_name}/_doc/{alert.id}", payload=doc, expected_codes={200, 201})

    def remove_alert(self, alert_id: int):
        if not self.is_available():
            return
        self._request("DELETE", f"/{self.index_name}/_doc/{alert_id}", expected_codes={200, 202, 404})

    def _dynamic_clause(self, filter_item: dict[str, Any]):
        field = filter_item["field"]
        filter_type = filter_item["type"]
        operator = filter_item.get("operator", "eq")
        value = filter_item.get("value")

        must_clauses: list[dict[str, Any]] = [{"term": {"dynamic_values.path": field}}]

        if filter_type == "keyword":
            if operator == "contains":
                must_clauses.append({"wildcard": {"dynamic_values.keyword_value": f"*{value}*"}})
            elif operator == "in" and isinstance(value, list):
                must_clauses.append({"terms": {"dynamic_values.keyword_value": [str(item) for item in value]}})
            else:
                must_clauses.append({"term": {"dynamic_values.keyword_value": str(value)}})
        elif filter_type == "number":
            number_value = _coerce_number(value)
            if number_value is None:
                must_clauses.append({"term": {"dynamic_values.path": "__invalid__"}})
            elif operator == "eq":
                must_clauses.append({"term": {"dynamic_values.number_value": number_value}})
            else:
                must_clauses.append({"range": {"dynamic_values.number_value": {operator: number_value}}})
        elif filter_type == "date":
            date_value = _coerce_datetime(value)
            if date_value is None:
                must_clauses.append({"term": {"dynamic_values.path": "__invalid__"}})
            elif operator == "eq":
                must_clauses.append({"term": {"dynamic_values.date_value": date_value.isoformat()}})
            else:
                must_clauses.append({"range": {"dynamic_values.date_value": {operator: date_value.isoformat()}}})
        elif filter_type == "boolean":
            bool_value = _coerce_bool(value)
            if bool_value is None:
                must_clauses.append({"term": {"dynamic_values.path": "__invalid__"}})
            else:
                must_clauses.append({"term": {"dynamic_values.bool_value": bool_value}})

        return {"nested": {"path": "dynamic_values", "query": {"bool": {"must": must_clauses}}}}

    def search(self, request_data: SearchRequest) -> SearchResult:
        self.ensure_index()

        query_bool: dict[str, Any] = {"must": [], "filter": []}
        if request_data.text:
            query_bool["must"].append(
                {
                    "simple_query_string": {
                        "query": request_data.text,
                        "fields": [
                            "title^3",
                            "source_name^2",
                            "source_id",
                            "dedup_fingerprint",
                            "raw_text",
                            "parsed_text",
                        ],
                        "default_operator": "and",
                    }
                }
            )

        if request_data.source_name:
            query_bool["filter"].append({"term": {"source_name": request_data.source_name}})
        if request_data.state_id:
            query_bool["filter"].append({"term": {"current_state_id": request_data.state_id}})
        if request_data.severity:
            query_bool["filter"].append({"term": {"severity": request_data.severity}})
        if request_data.is_active is not None:
            query_bool["filter"].append({"term": {"is_active": request_data.is_active}})

        for filter_item in request_data.dynamic_filters or []:
            query_bool["filter"].append(self._dynamic_clause(filter_item))

        ordering = request_data.ordering or "-event_timestamp"
        ordering_field = ordering.lstrip("-")
        if ordering_field not in ALLOWED_ORDERINGS:
            ordering_field = "event_timestamp"
            ordering = "-event_timestamp"

        sort_direction = "desc" if ordering.startswith("-") else "asc"
        page = max(1, int(request_data.page or 1))
        page_size = max(1, min(int(request_data.page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
        from_index = (page - 1) * page_size

        payload = {
            "from": from_index,
            "size": page_size,
            "query": {"bool": query_bool},
            "sort": [{ordering_field: {"order": sort_direction}}, {"id": {"order": "desc"}}],
            "_source": ["id"],
        }

        data = self._request("POST", f"/{self.index_name}/_search", payload=payload, expected_codes={200})
        hits = data.get("hits", {})
        total = hits.get("total", {}).get("value", 0)
        alert_ids = [int(item.get("_source", {}).get("id")) for item in hits.get("hits", []) if item.get("_source")]

        return SearchResult(alert_ids=alert_ids, total=total, backend=self.name)


def resolve_search_backend() -> BaseSearchBackend:
    backend_name = (getattr(settings, "SEARCH_BACKEND", "auto") or "auto").strip().lower()

    if backend_name == "postgres":
        return PostgresSearchBackend()

    if backend_name == "elastic":
        return ElasticSearchBackend()

    elastic = ElasticSearchBackend()
    if elastic.is_available():
        return elastic
    return PostgresSearchBackend()
