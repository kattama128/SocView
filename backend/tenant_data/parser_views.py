import json

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.rbac import CAP_MANAGE_SOURCES
from tenant_data.audit import create_audit_log
from tenant_data.ingestion.parser import ParserValidationError, parse_event, parse_parser_config_text
from tenant_data.models import ParserDefinition, ParserRevision, ParserTestCase
from tenant_data.parser_serializers import (
    ParserDefinitionSerializer,
    ParserRevisionListItemSerializer,
    ParserTestCaseCreateSerializer,
    ParserTestCaseSerializer,
)
from tenant_data.permissions import RoleBasedWritePermission, TenantSchemaAccessPermission
from tenant_data.rbac import (
    ensure_customer_capability,
    filter_queryset_by_customer_access,
    parse_and_validate_customer_id,
)


def _structured_diff(left, right, path="$"):
    if isinstance(left, dict) and isinstance(right, dict):
        operations = []
        left_keys = set(left.keys())
        right_keys = set(right.keys())
        for key in sorted(left_keys - right_keys):
            operations.append({"path": f"{path}.{key}", "type": "remove", "old": left[key], "new": None})
        for key in sorted(right_keys - left_keys):
            operations.append({"path": f"{path}.{key}", "type": "add", "old": None, "new": right[key]})
        for key in sorted(left_keys & right_keys):
            operations.extend(_structured_diff(left[key], right[key], path=f"{path}.{key}"))
        return operations

    if isinstance(left, list) and isinstance(right, list):
        operations = []
        max_len = max(len(left), len(right))
        for idx in range(max_len):
            item_path = f"{path}[{idx}]"
            if idx >= len(left):
                operations.append({"path": item_path, "type": "add", "old": None, "new": right[idx]})
                continue
            if idx >= len(right):
                operations.append({"path": item_path, "type": "remove", "old": left[idx], "new": None})
                continue
            operations.extend(_structured_diff(left[idx], right[idx], item_path))
        return operations

    if left != right:
        return [{"path": path, "type": "change", "old": left, "new": right}]
    return []


def _parse_test_input(input_raw):
    try:
        return json.loads(input_raw)
    except (TypeError, ValueError):
        return input_raw


class ParserDefinitionViewSet(viewsets.ModelViewSet):
    queryset = ParserDefinition.objects.select_related("source", "active_revision").prefetch_related(
        "revisions",
        "revisions__created_by",
        "revisions__rollback_from",
    )
    serializer_class = ParserDefinitionSerializer
    permission_classes = [TenantSchemaAccessPermission, RoleBasedWritePermission]
    read_capability = CAP_MANAGE_SOURCES
    write_capability = CAP_MANAGE_SOURCES

    @staticmethod
    def _resolve_preview_input(data):
        raw_event = data.get("raw_event")
        if raw_event is not None and raw_event != "":
            return raw_event
        return data.get("raw_payload", {})

    def get_queryset(self):
        queryset = super().get_queryset()
        customer_id = self.request.query_params.get("customer_id")
        if customer_id:
            parsed_customer_id = parse_and_validate_customer_id(
                customer_id,
                user=self.request.user,
                capability=CAP_MANAGE_SOURCES,
            )
            queryset = queryset.filter(source__customer_id=parsed_customer_id)
        else:
            queryset = filter_queryset_by_customer_access(
                queryset,
                self.request.user,
                customer_field="source__customer_id",
                include_null=True,
            )
        source_id = self.request.query_params.get("source_id")
        if source_id:
            queryset = queryset.filter(source_id=source_id)
        return queryset

    def perform_create(self, serializer):
        source = serializer.validated_data.get("source")
        ensure_customer_capability(self.request.user, getattr(source, "customer_id", None), CAP_MANAGE_SOURCES)
        parser_definition = serializer.save()
        create_audit_log(
            self.request,
            action="parser.created",
            obj=parser_definition,
            diff={
                "source_id": parser_definition.source_id,
                "name": parser_definition.name,
                "is_enabled": parser_definition.is_enabled,
                "active_revision": parser_definition.active_revision_id,
            },
        )

    def perform_update(self, serializer):
        source = serializer.instance.source
        ensure_customer_capability(self.request.user, getattr(source, "customer_id", None), CAP_MANAGE_SOURCES)
        old = {
            "name": serializer.instance.name,
            "description": serializer.instance.description,
            "is_enabled": serializer.instance.is_enabled,
            "active_revision": serializer.instance.active_revision_id,
        }
        parser_definition = serializer.save()
        create_audit_log(
            self.request,
            action="parser.updated",
            obj=parser_definition,
            diff={
                "old": old,
                "new": {
                    "name": parser_definition.name,
                    "description": parser_definition.description,
                    "is_enabled": parser_definition.is_enabled,
                    "active_revision": parser_definition.active_revision_id,
                },
            },
        )

    def perform_destroy(self, instance):
        ensure_customer_capability(self.request.user, getattr(instance.source, "customer_id", None), CAP_MANAGE_SOURCES)
        payload = {
            "source_id": instance.source_id,
            "name": instance.name,
            "active_revision": instance.active_revision_id,
        }
        super().perform_destroy(instance)
        create_audit_log(self.request, action="parser.deleted", obj=instance, diff=payload)

    @extend_schema(
        request=inline_serializer(
            name="ParserPreviewConfigRequest",
            fields={
                "config_text": serializers.CharField(),
                "raw_payload": serializers.JSONField(),
            },
        ),
        responses=inline_serializer(
            name="ParserPreviewConfigResponse",
            fields={
                "ok": serializers.BooleanField(),
                "parsed_payload": serializers.JSONField(),
                "field_schema": serializers.JSONField(),
            },
        ),
        tags=["Parsers"],
    )
    @action(detail=False, methods=["post"], url_path="preview-config")
    def preview_config(self, request):
        config_text = request.data.get("config_text", "")
        raw_payload = request.data.get("raw_payload", {})
        try:
            config_data = parse_parser_config_text(config_text)
            result = parse_event(raw_payload, parser_config=config_data)
        except ParserValidationError as exc:
            return Response(
                {"ok": False, "detail": "Config parser non valida", "errors": exc.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {"ok": False, "detail": "Errore esecuzione parser", "errors": [str(exc)]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "ok": True,
                "parsed_payload": result.parsed_payload,
                "field_schema": result.field_schema,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        request=inline_serializer(
            name="ParserPreviewRequest",
            fields={
                "raw_payload": serializers.JSONField(required=False),
                "raw_event": serializers.CharField(required=False),
                "config_text": serializers.CharField(required=False),
            },
        ),
        responses=inline_serializer(
            name="ParserPreviewResponse",
            fields={
                "ok": serializers.BooleanField(),
                "parsed_payload": serializers.JSONField(),
                "field_schema": serializers.JSONField(),
            },
        ),
        tags=["Parsers"],
    )
    @action(detail=True, methods=["post"], url_path="preview")
    def preview(self, request, pk=None):
        parser_definition = self.get_object()
        raw_payload = self._resolve_preview_input(request.data)
        config_text = request.data.get("config_text")
        try:
            if config_text:
                config_data = parse_parser_config_text(config_text)
            else:
                if not parser_definition.active_revision:
                    return Response(
                        {"ok": False, "detail": "Nessuna revisione parser attiva"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                config_data = parser_definition.active_revision.config_data
            result = parse_event(raw_payload, parser_config=config_data)
        except ParserValidationError as exc:
            return Response(
                {"ok": False, "detail": "Config parser non valida", "errors": exc.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {"ok": False, "detail": "Errore esecuzione parser", "errors": [str(exc)]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        create_audit_log(
            request,
            action="parser.preview",
            obj=parser_definition,
            diff={"source_id": parser_definition.source_id},
        )

        return Response(
            {
                "ok": True,
                "parsed_payload": result.parsed_payload,
                "field_schema": result.field_schema,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(responses=ParserRevisionListItemSerializer(many=True), tags=["Parsers"])
    @action(detail=True, methods=["get"], url_path="revisions")
    def revisions(self, request, pk=None):
        parser_definition = self.get_object()
        queryset = parser_definition.revisions.select_related("created_by").order_by("-version", "-id")
        serializer = ParserRevisionListItemSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        responses=inline_serializer(
            name="ParserRevisionDiffResponse",
            fields={
                "left": serializers.JSONField(),
                "right": serializers.JSONField(),
                "diff": serializers.ListField(child=serializers.JSONField()),
            },
        ),
        tags=["Parsers"],
    )
    @action(detail=True, methods=["get"], url_path=r"revisions/(?P<revision_id>[^/.]+)/diff")
    def revision_diff(self, request, pk=None, revision_id=None):
        parser_definition = self.get_object()
        compare_to = request.query_params.get("compare_to")
        if not compare_to:
            return Response({"detail": "compare_to obbligatorio"}, status=status.HTTP_400_BAD_REQUEST)

        left_revision = parser_definition.revisions.filter(id=revision_id).first()
        right_revision = parser_definition.revisions.filter(id=compare_to).first()
        if not left_revision or not right_revision:
            return Response({"detail": "Revisione non trovata"}, status=status.HTTP_404_NOT_FOUND)

        left_snapshot = left_revision.config_data or {}
        right_snapshot = right_revision.config_data or {}
        return Response(
            {
                "left": {
                    "revision_id": left_revision.id,
                    "version": left_revision.version,
                    "config_text": left_revision.config_text,
                    "config_snapshot": left_snapshot,
                },
                "right": {
                    "revision_id": right_revision.id,
                    "version": right_revision.version,
                    "config_text": right_revision.config_text,
                    "config_snapshot": right_snapshot,
                },
                "diff": _structured_diff(left_snapshot, right_snapshot),
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        request=ParserTestCaseCreateSerializer,
        responses=ParserTestCaseSerializer(many=True),
        tags=["Parsers"],
    )
    @action(detail=True, methods=["get", "post"], url_path="test-cases")
    def test_cases(self, request, pk=None):
        parser_definition = self.get_object()
        if request.method == "GET":
            queryset = parser_definition.test_cases.select_related("created_by").order_by("name", "id")
            serializer = ParserTestCaseSerializer(queryset, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        serializer = ParserTestCaseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = ParserTestCase.objects.create(
            parser=parser_definition,
            name=serializer.validated_data["name"],
            input_raw=serializer.validated_data["input_raw"],
            expected_output=serializer.validated_data["expected_output"],
            created_by=request.user if request.user.is_authenticated else None,
        )
        create_audit_log(
            request,
            action="parser.test_case.created",
            obj=parser_definition,
            diff={"test_case_id": instance.id, "name": instance.name},
        )
        payload = ParserTestCaseSerializer(instance).data
        return Response(payload, status=status.HTTP_201_CREATED)

    @extend_schema(responses=None, tags=["Parsers"])
    @action(detail=True, methods=["delete"], url_path=r"test-cases/(?P<tc_id>\d+)")
    def delete_test_case(self, request, pk=None, tc_id=None):
        parser_definition = self.get_object()
        test_case = parser_definition.test_cases.filter(id=tc_id).first()
        if not test_case:
            return Response({"detail": "Test case non trovato"}, status=status.HTTP_404_NOT_FOUND)
        test_case.delete()
        create_audit_log(
            request,
            action="parser.test_case.deleted",
            obj=parser_definition,
            diff={"test_case_id": tc_id},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        responses=inline_serializer(
            name="ParserRunAllResponse",
            fields={
                "results": serializers.ListField(child=serializers.JSONField()),
                "passed": serializers.IntegerField(),
                "failed": serializers.IntegerField(),
            },
        ),
        tags=["Parsers"],
    )
    @action(detail=True, methods=["post"], url_path="test-cases/run-all")
    def run_all_test_cases(self, request, pk=None):
        parser_definition = self.get_object()
        if not parser_definition.active_revision:
            return Response({"detail": "Nessuna revisione parser attiva"}, status=status.HTTP_400_BAD_REQUEST)

        parser_config = parser_definition.active_revision.config_data
        queryset = parser_definition.test_cases.order_by("name", "id")
        results = []
        passed = 0

        for test_case in queryset:
            actual_output = {}
            diff = []
            passed_case = False
            try:
                parsed_input = _parse_test_input(test_case.input_raw)
                result = parse_event(parsed_input, parser_config=parser_config)
                actual_output = result.parsed_payload
                diff = _structured_diff(test_case.expected_output, actual_output)
                passed_case = not diff
            except Exception as exc:
                actual_output = {"_error": str(exc)}
                diff = _structured_diff(test_case.expected_output, actual_output)
                passed_case = False

            if passed_case:
                passed += 1

            results.append(
                {
                    "tc_id": test_case.id,
                    "name": test_case.name,
                    "passed": passed_case,
                    "actual_output": actual_output,
                    "diff": diff,
                }
            )

        failed = len(results) - passed
        create_audit_log(
            request,
            action="parser.test_case.run_all",
            obj=parser_definition,
            diff={"total": len(results), "passed": passed, "failed": failed},
        )
        return Response({"results": results, "passed": passed, "failed": failed}, status=status.HTTP_200_OK)

    @extend_schema(
        request=inline_serializer(
            name="ParserRollbackRequest",
            fields={"revision_id": serializers.IntegerField()},
        ),
        responses=ParserDefinitionSerializer,
        tags=["Parsers"],
    )
    @action(detail=True, methods=["post"], url_path="rollback")
    def rollback(self, request, pk=None):
        parser_definition = self.get_object()
        revision_id = request.data.get("revision_id")
        if not revision_id:
            return Response(
                {"detail": "revision_id obbligatorio"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        revision = ParserRevision.objects.filter(
            id=revision_id,
            parser_definition=parser_definition,
        ).first()
        if not revision:
            return Response(
                {"detail": "Revision non trovata per questo parser"},
                status=status.HTTP_404_NOT_FOUND,
            )

        latest = parser_definition.revisions.order_by("-version").first()
        next_version = (latest.version if latest else 0) + 1
        user = request.user if request.user.is_authenticated else None

        new_revision = ParserRevision.objects.create(
            parser_definition=parser_definition,
            version=next_version,
            config_text=revision.config_text,
            config_data=revision.config_data,
            rollback_from=revision,
            created_by=user,
        )
        parser_definition.active_revision = new_revision
        parser_definition.save(update_fields=["active_revision", "updated_at"])

        create_audit_log(
            request,
            action="parser.rollback",
            obj=parser_definition,
            diff={
                "rollback_to_revision_id": revision.id,
                "rollback_to_version": revision.version,
                "new_revision_id": new_revision.id,
                "new_version": new_revision.version,
            },
        )

        serializer = self.get_serializer(parser_definition)
        return Response(serializer.data, status=status.HTTP_200_OK)
