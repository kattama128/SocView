from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.rbac import CAP_MANAGE_SOURCES
from tenant_data.audit import create_audit_log
from tenant_data.ingestion.parser import ParserValidationError, parse_event, parse_parser_config_text
from tenant_data.models import ParserDefinition, ParserRevision
from tenant_data.parser_serializers import ParserDefinitionSerializer
from tenant_data.permissions import RoleBasedWritePermission, TenantSchemaAccessPermission
from tenant_data.rbac import (
    ensure_customer_capability,
    filter_queryset_by_customer_access,
    parse_and_validate_customer_id,
)


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
                "raw_payload": serializers.JSONField(),
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
        raw_payload = request.data.get("raw_payload", {})
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
