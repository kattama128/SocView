import json
import re
from dataclasses import dataclass

try:
    import yaml
except Exception:  # pragma: no cover - resolved by runtime dependency
    yaml = None


SUPPORTED_EXTRACT_TYPES = {"jsonpath", "regex", "grok"}
SUPPORTED_TRANSFORM_TYPES = {"rename", "cast", "concat", "map_values"}
SUPPORTED_OUTPUT_MODES = {"normalized", "working", "raw"}

GROK_PATTERNS = {
    "WORD": r"\b\w+\b",
    "INT": r"[-+]?\d+",
    "NUMBER": r"[-+]?(?:\d+(?:\.\d+)?)",
    "IPV4": r"(?:\d{1,3}\.){3}\d{1,3}",
    "GREEDYDATA": r".*",
    "DATA": r".*?",
    "EMAILADDRESS": r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
}


class ParserValidationError(ValueError):
    def __init__(self, errors):
        if isinstance(errors, str):
            errors = [errors]
        self.errors = [str(item) for item in errors]
        super().__init__("; ".join(self.errors))


@dataclass
class ParserExecutionResult:
    parsed_payload: dict | None
    field_schema: list[dict]


def _normalize_jsonpath(path):
    text = str(path).strip()
    if text == "$":
        return ""
    if text.startswith("$."):
        text = text[2:]
    text = re.sub(r"\[['\"]([^'\"]+)['\"]\]", r".\1", text)
    text = re.sub(r"\[(\d+)\]", r".\1", text)
    return text.strip(".")


def _get_by_path(payload, path):
    if path in (None, "", "$"):
        return payload

    normalized = _normalize_jsonpath(path)
    if not normalized:
        return payload

    current = payload
    for token in normalized.split("."):
        if isinstance(current, dict):
            if token not in current:
                return None
            current = current[token]
            continue
        if isinstance(current, list):
            if not token.isdigit():
                return None
            index = int(token)
            if index < 0 or index >= len(current):
                return None
            current = current[index]
            continue
        return None
    return current


def _set_by_path(payload, path, value):
    normalized = _normalize_jsonpath(path)
    if not normalized:
        return

    tokens = normalized.split(".")
    current = payload
    for token in tokens[:-1]:
        next_value = current.get(token)
        if not isinstance(next_value, dict):
            next_value = {}
            current[token] = next_value
        current = next_value
    current[tokens[-1]] = value


def _resolve_field(path, raw_payload, working_payload, normalized_payload=None):
    candidate = str(path).strip()
    if not candidate:
        return None

    if candidate.startswith("raw."):
        return _get_by_path(raw_payload, candidate[4:])

    if candidate.startswith("working."):
        return _get_by_path(working_payload, candidate[8:])

    if candidate.startswith("normalized.") and normalized_payload is not None:
        return _get_by_path(normalized_payload, candidate[11:])

    value = _get_by_path(working_payload, candidate)
    if value is not None:
        return value

    return _get_by_path(raw_payload, candidate)


def _flatten_schema(payload, prefix=""):
    items = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            full_key = f"{prefix}.{key}" if prefix else str(key)
            items.extend(_flatten_schema(value, full_key))
        return items

    if isinstance(payload, list):
        if not payload:
            items.append((prefix, "list"))
            return items
        items.append((prefix, "list"))
        items.extend(_flatten_schema(payload[0], f"{prefix}[]"))
        return items

    if payload is None:
        items.append((prefix, "null"))
        return items
    if isinstance(payload, bool):
        items.append((prefix, "bool"))
        return items
    if isinstance(payload, int):
        items.append((prefix, "int"))
        return items
    if isinstance(payload, float):
        items.append((prefix, "float"))
        return items
    items.append((prefix, "string"))
    return items


def build_field_schema(payload):
    if not isinstance(payload, dict):
        return []
    flattened = _flatten_schema(payload)
    unique = {}
    for field_name, field_type in flattened:
        if field_name and field_name not in unique:
            unique[field_name] = field_type
    return [{"field": key, "type": value} for key, value in sorted(unique.items())]


def _compile_grok(pattern):
    token_pattern = re.compile(r"%\{(?P<name>[A-Z0-9_]+)(?::(?P<alias>[a-zA-Z0-9_.-]+))?\}")

    def replacer(match):
        name = match.group("name")
        alias = match.group("alias")
        if name not in GROK_PATTERNS:
            raise ParserValidationError(f"Grok pattern non supportato: {name}")
        regex_body = GROK_PATTERNS[name]
        if alias:
            return f"(?P<{alias}>{regex_body})"
        return f"(?:{regex_body})"

    return token_pattern.sub(replacer, pattern)


def parse_parser_config_text(config_text):
    raw = (config_text or "").strip()
    if not raw:
        raise ParserValidationError("config_text obbligatorio")

    parsed = None
    json_error = None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        json_error = str(exc)

    if parsed is None:
        if yaml is None:
            raise ParserValidationError(
                f"Config parser non valida come JSON ({json_error}) e supporto YAML non disponibile"
            )
        try:
            parsed = yaml.safe_load(raw)
        except Exception as exc:
            raise ParserValidationError(
                f"Config parser non valida. JSON error: {json_error}. YAML error: {exc}"
            ) from exc

    if not isinstance(parsed, dict):
        raise ParserValidationError("La config parser deve essere un oggetto JSON/YAML")
    return validate_parser_config(parsed)


def validate_parser_config(config):
    errors = []
    extract_steps = config.get("extract", [])
    transform_steps = config.get("transform", [])
    normalize_cfg = config.get("normalize", {})
    output_cfg = config.get("output", {})

    if not isinstance(extract_steps, list):
        errors.append("extract deve essere una lista")
    if not isinstance(transform_steps, list):
        errors.append("transform deve essere una lista")
    if not isinstance(normalize_cfg, dict):
        errors.append("normalize deve essere un oggetto")
    if not isinstance(output_cfg, dict):
        errors.append("output deve essere un oggetto")

    normalized_extract = []
    if isinstance(extract_steps, list):
        for index, step in enumerate(extract_steps):
            if not isinstance(step, dict):
                errors.append(f"extract[{index}] deve essere un oggetto")
                continue
            step_type = step.get("type")
            if step_type not in SUPPORTED_EXTRACT_TYPES:
                errors.append(
                    f"extract[{index}].type non supportato ({step_type}). "
                    f"Supportati: {sorted(SUPPORTED_EXTRACT_TYPES)}"
                )
                continue
            if step_type == "jsonpath":
                if not step.get("name"):
                    errors.append(f"extract[{index}].name obbligatorio per jsonpath")
                if not step.get("path"):
                    errors.append(f"extract[{index}].path obbligatorio per jsonpath")
            if step_type in {"regex", "grok"}:
                if not step.get("source"):
                    errors.append(f"extract[{index}].source obbligatorio per {step_type}")
                if not step.get("pattern"):
                    errors.append(f"extract[{index}].pattern obbligatorio per {step_type}")
            normalized_extract.append(step)

    normalized_transform = []
    if isinstance(transform_steps, list):
        for index, step in enumerate(transform_steps):
            if not isinstance(step, dict):
                errors.append(f"transform[{index}] deve essere un oggetto")
                continue
            step_type = step.get("type")
            if step_type not in SUPPORTED_TRANSFORM_TYPES:
                errors.append(
                    f"transform[{index}].type non supportato ({step_type}). "
                    f"Supportati: {sorted(SUPPORTED_TRANSFORM_TYPES)}"
                )
                continue
            if step_type == "rename":
                if not step.get("from") or not step.get("to"):
                    errors.append(f"transform[{index}] rename richiede from e to")
            elif step_type == "cast":
                if not step.get("field") or step.get("to") not in {"int", "float", "str", "bool"}:
                    errors.append(f"transform[{index}] cast richiede field e to in [int,float,str,bool]")
            elif step_type == "concat":
                fields = step.get("fields")
                if not step.get("target") or not isinstance(fields, list) or not fields:
                    errors.append(f"transform[{index}] concat richiede target e fields non vuota")
            elif step_type == "map_values":
                if not step.get("field") or not isinstance(step.get("map", {}), dict):
                    errors.append(f"transform[{index}] map_values richiede field e map oggetto")
            normalized_transform.append(step)

    mapping = {}
    if isinstance(normalize_cfg, dict):
        mapping = normalize_cfg.get("ecs") or normalize_cfg.get("mapping") or {}
        if not isinstance(mapping, dict):
            errors.append("normalize.ecs (o normalize.mapping) deve essere un oggetto")
            mapping = {}

    include = output_cfg.get("include", [])
    mode = output_cfg.get("mode", "normalized")
    if mode not in SUPPORTED_OUTPUT_MODES:
        errors.append(
            f"output.mode non supportato ({mode}). Supportati: {sorted(SUPPORTED_OUTPUT_MODES)}"
        )
    if include is not None and not isinstance(include, list):
        errors.append("output.include deve essere una lista")

    if errors:
        raise ParserValidationError(errors)

    return {
        "extract": normalized_extract,
        "transform": normalized_transform,
        "normalize": {"mapping": mapping},
        "output": {"mode": mode, "include": include or []},
    }


def _cast_value(value, cast_to):
    if cast_to == "str":
        return str(value)
    if cast_to == "int":
        return int(value)
    if cast_to == "float":
        return float(value)
    if cast_to == "bool":
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"1", "true", "yes", "y", "on"}:
            return True
        if text in {"0", "false", "no", "n", "off"}:
            return False
        raise ValueError(f"valore non convertibile a bool: {value}")
    raise ValueError(f"cast non supportato: {cast_to}")


def _run_extract(raw_payload, config):
    extracted = {}
    for index, step in enumerate(config):
        step_type = step["type"]
        if step_type == "jsonpath":
            value = _get_by_path(raw_payload, step["path"])
            if value is not None:
                extracted[step["name"]] = value
            continue

        source_value = _resolve_field(step["source"], raw_payload, extracted)
        text = "" if source_value is None else str(source_value)

        pattern = step["pattern"]
        if step_type == "grok":
            pattern = _compile_grok(pattern)

        match = re.search(pattern, text)
        if not match:
            continue

        if step.get("name"):
            group = step.get("group")
            if group:
                extracted[step["name"]] = match.group(group)
            elif match.groupdict():
                if len(match.groupdict()) == 1:
                    extracted[step["name"]] = next(iter(match.groupdict().values()))
                else:
                    extracted[step["name"]] = match.group(0)
            elif match.groups():
                extracted[step["name"]] = match.group(1)
            else:
                extracted[step["name"]] = match.group(0)
            continue

        group_values = {key: value for key, value in match.groupdict().items() if value is not None}
        if group_values:
            extracted.update(group_values)
        elif step_type == "regex":
            extracted[f"regex_{index}"] = match.group(0)
    return extracted


def _run_transform(raw_payload, working_payload, config):
    working = dict(working_payload)
    for step in config:
        step_type = step["type"]
        if step_type == "rename":
            old_key = step["from"]
            new_key = step["to"]
            if old_key in working:
                working[new_key] = working.pop(old_key)
            continue

        if step_type == "cast":
            field = step["field"]
            if field in working and working[field] is not None:
                working[field] = _cast_value(working[field], step["to"])
            continue

        if step_type == "concat":
            target = step["target"]
            separator = step.get("separator", " ")
            values = []
            for field in step["fields"]:
                value = _resolve_field(field, raw_payload, working)
                if value is None:
                    continue
                values.append(str(value))
            working[target] = separator.join(values)
            continue

        if step_type == "map_values":
            field = step["field"]
            if field not in working:
                continue
            mapping = step.get("map", {})
            key = str(working[field])
            if key in mapping:
                working[field] = mapping[key]
            elif "default" in step:
                working[field] = step.get("default")
    return working


def _run_normalize(raw_payload, working_payload, mapping):
    normalized = {}
    for target_path, source_path in mapping.items():
        value = _resolve_field(source_path, raw_payload, working_payload, normalized)
        if value is None:
            continue
        _set_by_path(normalized, target_path, value)
    return normalized


def _run_output(raw_payload, working_payload, normalized_payload, output_cfg):
    mode = output_cfg.get("mode", "normalized")
    include = output_cfg.get("include", [])

    if mode == "working":
        base_payload = dict(working_payload)
    elif mode == "raw":
        base_payload = dict(raw_payload)
    else:
        base_payload = dict(normalized_payload) if normalized_payload else dict(working_payload)

    if not include:
        return base_payload

    selected = {}
    for field in include:
        value = _resolve_field(field, raw_payload, base_payload, normalized_payload)
        if value is None:
            continue
        _set_by_path(selected, field, value)
    return selected


def parse_event(raw_event, parser_config=None):
    if parser_config is None:
        if isinstance(raw_event, dict) and raw_event.get("force_parse_error"):
            raise ValueError(raw_event.get("parse_error_message", "Errore parser placeholder"))

        payload = raw_event if isinstance(raw_event, dict) else {"message": str(raw_event)}
        return ParserExecutionResult(parsed_payload=payload, field_schema=build_field_schema(payload))

    raw_payload = raw_event if isinstance(raw_event, dict) else {"value": str(raw_event)}
    config = validate_parser_config(parser_config)

    extracted = _run_extract(raw_payload, config["extract"])
    transformed = _run_transform(raw_payload, extracted, config["transform"])
    normalized = _run_normalize(raw_payload, transformed, config["normalize"]["mapping"])
    output_payload = _run_output(raw_payload, transformed, normalized, config["output"])

    if not isinstance(output_payload, dict):
        raise ValueError("Output parser non valido: parsed_payload deve essere un oggetto")

    return ParserExecutionResult(
        parsed_payload=output_payload,
        field_schema=build_field_schema(output_payload),
    )
