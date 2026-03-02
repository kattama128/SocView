import csv
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import HttpResponse
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework.exceptions import ValidationError
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from tenant_data.audit import create_audit_log
from tenant_data.models import (
    Alert,
    AlertOccurrence,
    AlertState,
    AlertTag,
    Assignment,
    Attachment,
    AuditLog,
    Comment,
    NotificationEvent,
    NotificationRead,
    SavedSearch,
    Tag,
)
from tenant_data.permissions import RoleBasedWritePermission
from tenant_data.search import SearchRequest, build_all_source_field_schemas, build_source_field_schema, search_alerts
from tenant_data.search.backends import extract_path
from tenant_data.security import scan_attachment_placeholder
from tenant_data.serializers import (
    AlertSearchRequestSerializer,
    AlertDetailSerializer,
    AlertListSerializer,
    AlertTimelineEventSerializer,
    AlertStateSerializer,
    AssignSerializer,
    AttachmentSerializer,
    AttachmentUploadSerializer,
    AuditLogSerializer,
    CommentCreateSerializer,
    CommentSerializer,
    ExportConfigurableRequestSerializer,
    NotificationAckSerializer,
    NotificationEventSerializer,
    SavedSearchSerializer,
    StateChangeSerializer,
    TagMutationSerializer,
    TagSerializer,
)

User = get_user_model()


class AlertStateViewSet(viewsets.ModelViewSet):
    queryset = AlertState.objects.all().order_by("order", "id")
    serializer_class = AlertStateSerializer
    permission_classes = [RoleBasedWritePermission]
    write_roles = (User.Role.SUPER_ADMIN, User.Role.SOC_MANAGER)

    def perform_create(self, serializer):
        state = serializer.save()
        create_audit_log(
            self.request,
            action="alert_state.created",
            obj=state,
            diff={
                "name": state.name,
                "order": state.order,
                "is_final": state.is_final,
                "is_enabled": state.is_enabled,
            },
        )

    def perform_update(self, serializer):
        old = {
            "name": serializer.instance.name,
            "order": serializer.instance.order,
            "is_final": serializer.instance.is_final,
            "is_enabled": serializer.instance.is_enabled,
        }
        state = serializer.save()
        create_audit_log(
            self.request,
            action="alert_state.updated",
            obj=state,
            diff={
                "old": old,
                "new": {
                    "name": state.name,
                    "order": state.order,
                    "is_final": state.is_final,
                    "is_enabled": state.is_enabled,
                },
            },
        )

    def perform_destroy(self, instance):
        payload = {"name": instance.name, "order": instance.order}
        super().perform_destroy(instance)
        create_audit_log(
            self.request,
            action="alert_state.deleted",
            obj=instance,
            diff=payload,
        )

    @extend_schema(request=None, responses=AlertStateSerializer(many=True), tags=["Alert States"])
    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request):
        state_ids = request.data.get("state_ids", [])
        if not isinstance(state_ids, list) or not state_ids:
            return Response({"detail": "state_ids deve essere una lista non vuota"}, status=status.HTTP_400_BAD_REQUEST)

        states_map = {str(item.id): item for item in AlertState.objects.all()}
        if any(str(item_id) not in states_map for item_id in state_ids):
            return Response({"detail": "Uno o piu state_ids non esistono"}, status=status.HTTP_400_BAD_REQUEST)

        for index, item_id in enumerate(state_ids):
            state = states_map[str(item_id)]
            state.order = index
            state.save(update_fields=["order", "updated_at"])

        first_state = AlertState.objects.order_by("order", "id").first()
        create_audit_log(
            request,
            action="alert_state.reordered",
            obj=first_state or AlertState(name="reordered"),
            diff={"state_ids": state_ids},
        )

        serializer = self.get_serializer(AlertState.objects.all().order_by("order", "id"), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all().order_by("name")
    serializer_class = TagSerializer
    permission_classes = [RoleBasedWritePermission]
    write_roles = (User.Role.SUPER_ADMIN, User.Role.SOC_MANAGER, User.Role.SOC_ANALYST)

    def perform_create(self, serializer):
        tag = serializer.save()
        create_audit_log(
            self.request,
            action="tag.created",
            obj=tag,
            diff={"name": tag.name, "scope": tag.scope, "color": tag.color},
        )

    def perform_update(self, serializer):
        old = {
            "name": serializer.instance.name,
            "scope": serializer.instance.scope,
            "color": serializer.instance.color,
            "metadata": serializer.instance.metadata,
        }
        tag = serializer.save()
        create_audit_log(
            self.request,
            action="tag.updated",
            obj=tag,
            diff={
                "old": old,
                "new": {
                    "name": tag.name,
                    "scope": tag.scope,
                    "color": tag.color,
                    "metadata": tag.metadata,
                },
            },
        )

    def perform_destroy(self, instance):
        payload = {"name": instance.name, "scope": instance.scope}
        super().perform_destroy(instance)
        create_audit_log(self.request, action="tag.deleted", obj=instance, diff=payload)


class AlertViewSet(viewsets.ModelViewSet):
    queryset = (
        Alert.objects.select_related("current_state")
        .prefetch_related("alert_tags__tag", "comments__author", "attachments", "audit_logs", "assignment")
        .all()
    )
    permission_classes = [RoleBasedWritePermission]
    write_roles = (User.Role.SUPER_ADMIN, User.Role.SOC_MANAGER, User.Role.SOC_ANALYST)

    def get_serializer_class(self):
        if self.action == "list":
            return AlertListSerializer
        return AlertDetailSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        state_id = self.request.query_params.get("state")
        severity = self.request.query_params.get("severity")
        text = self.request.query_params.get("text")
        is_active = self.request.query_params.get("is_active")

        if state_id:
            queryset = queryset.filter(current_state_id=state_id)

        if severity:
            queryset = queryset.filter(severity=severity)

        if text:
            queryset = queryset.filter(
                Q(title__icontains=text)
                | Q(source_name__icontains=text)
                | Q(source_id__icontains=text)
                | Q(dedup_fingerprint__icontains=text)
            )

        if is_active in {"true", "false"}:
            queryset = queryset.filter(current_state__is_final=(is_active == "false"))

        return queryset

    def _parse_search_payload_for_export(self, payload):
        serializer = AlertSearchRequestSerializer(data=payload or {})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        return SearchRequest(
            text=validated.get("text", ""),
            source_name=validated.get("source_name", ""),
            state_id=validated.get("state_id"),
            severity=validated.get("severity", ""),
            is_active=validated.get("is_active"),
            dynamic_filters=validated.get("dynamic_filters", []),
            ordering=validated.get("ordering", "-event_timestamp"),
            page=validated.get("page", 1),
            page_size=validated.get("page_size", 100),
        )

    def _collect_alert_ids_for_export(self, search_request, all_results=True):
        if not all_results:
            return search_alerts(search_request).alert_ids

        collected = []
        page = 1
        max_pages = 50
        while page <= max_pages:
            search_request.page = page
            result = search_alerts(search_request)
            if not result.alert_ids:
                break
            collected.extend(result.alert_ids)
            if len(collected) >= result.total:
                break
            page += 1
        return collected

    def perform_create(self, serializer):
        current_state = serializer.validated_data.get("current_state")
        if current_state is None:
            current_state = AlertState.objects.filter(is_enabled=True).order_by("order", "id").first()
            if current_state is None:
                raise ValidationError({"current_state": "Nessuno stato disponibile"})

        alert = serializer.save(current_state=current_state)
        AlertOccurrence.objects.get_or_create(
            alert=alert,
            defaults={
                "count": 1,
                "first_seen": alert.event_timestamp,
                "last_seen": alert.event_timestamp,
            },
        )

        create_audit_log(
            self.request,
            action="alert.created",
            obj=alert,
            alert=alert,
            diff={"title": alert.title, "state": alert.current_state.name, "severity": alert.severity},
        )

    def perform_update(self, serializer):
        old = {
            "title": serializer.instance.title,
            "severity": serializer.instance.severity,
            "event_timestamp": serializer.instance.event_timestamp.isoformat(),
            "source_name": serializer.instance.source_name,
            "source_id": serializer.instance.source_id,
            "current_state_id": serializer.instance.current_state_id,
            "dedup_fingerprint": serializer.instance.dedup_fingerprint,
        }
        alert = serializer.save()
        create_audit_log(
            self.request,
            action="alert.updated",
            obj=alert,
            alert=alert,
            diff={
                "old": old,
                "new": {
                    "title": alert.title,
                    "severity": alert.severity,
                    "event_timestamp": alert.event_timestamp.isoformat(),
                    "source_name": alert.source_name,
                    "source_id": alert.source_id,
                    "current_state_id": alert.current_state_id,
                    "dedup_fingerprint": alert.dedup_fingerprint,
                },
            },
        )

    def perform_destroy(self, instance):
        payload = {
            "title": instance.title,
            "severity": instance.severity,
            "current_state": instance.current_state.name,
        }
        super().perform_destroy(instance)
        create_audit_log(
            self.request,
            action="alert.deleted",
            obj=instance,
            diff=payload,
        )

    @extend_schema(request=StateChangeSerializer, responses=AlertDetailSerializer, tags=["Alerts"])
    @action(detail=True, methods=["post"], url_path="change-state")
    def change_state(self, request, pk=None):
        alert = self.get_object()
        serializer = StateChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_state = serializer.validated_data["state_id"]
        old_state = alert.current_state

        alert.current_state = new_state
        alert.save(update_fields=["current_state", "updated_at"])

        create_audit_log(
            request,
            action="alert.state_changed",
            obj=alert,
            alert=alert,
            diff={"old_state": old_state.name, "new_state": new_state.name},
        )
        return Response(AlertDetailSerializer(alert, context={"request": request}).data)

    @extend_schema(request=TagMutationSerializer, responses=AlertDetailSerializer, tags=["Alerts"])
    @action(detail=True, methods=["post"], url_path="add-tag")
    def add_tag(self, request, pk=None):
        alert = self.get_object()
        serializer = TagMutationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tag = serializer.validated_data["tag_id"]

        AlertTag.objects.get_or_create(alert=alert, tag=tag)

        create_audit_log(
            request,
            action="alert.tag_added",
            obj=alert,
            alert=alert,
            diff={"tag_id": tag.id, "tag_name": tag.name},
        )
        return Response(AlertDetailSerializer(alert, context={"request": request}).data)

    @extend_schema(request=TagMutationSerializer, responses=AlertDetailSerializer, tags=["Alerts"])
    @action(detail=True, methods=["post"], url_path="remove-tag")
    def remove_tag(self, request, pk=None):
        alert = self.get_object()
        serializer = TagMutationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tag = serializer.validated_data["tag_id"]

        AlertTag.objects.filter(alert=alert, tag=tag).delete()

        create_audit_log(
            request,
            action="alert.tag_removed",
            obj=alert,
            alert=alert,
            diff={"tag_id": tag.id, "tag_name": tag.name},
        )
        return Response(AlertDetailSerializer(alert, context={"request": request}).data)

    @extend_schema(request=AssignSerializer, responses=AlertDetailSerializer, tags=["Alerts"])
    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        alert = self.get_object()
        serializer = AssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignee = serializer.validated_data["assigned_to_id"]

        assignment, _ = Assignment.objects.get_or_create(alert=alert)
        old_assignee = assignment.assigned_to
        assignment.assigned_to = assignee
        assignment.assigned_by = request.user
        assignment.save()

        create_audit_log(
            request,
            action="alert.assigned",
            obj=assignment,
            alert=alert,
            diff={
                "old_assigned_to": old_assignee.username if old_assignee else None,
                "new_assigned_to": assignee.username if assignee else None,
            },
        )
        return Response(AlertDetailSerializer(alert, context={"request": request}).data)

    @extend_schema(request=CommentCreateSerializer, responses=CommentSerializer(many=True), tags=["Alerts"])
    @action(detail=True, methods=["get", "post"], url_path="comments")
    def comments(self, request, pk=None):
        alert = self.get_object()

        if request.method.lower() == "get":
            payload = CommentSerializer(alert.comments.select_related("author").all(), many=True).data
            return Response(payload)

        serializer = CommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = Comment.objects.create(
            alert=alert,
            author=request.user,
            body=serializer.validated_data["body"],
        )
        create_audit_log(
            request,
            action="alert.comment_added",
            obj=comment,
            alert=alert,
            diff={"body": comment.body},
        )
        payload = CommentSerializer(comment).data
        return Response(payload, status=status.HTTP_201_CREATED)

    @extend_schema(request=AttachmentUploadSerializer, responses=AttachmentSerializer(many=True), tags=["Alerts"])
    @action(detail=True, methods=["get", "post"], url_path="attachments", parser_classes=[MultiPartParser, FormParser])
    def attachments(self, request, pk=None):
        alert = self.get_object()

        if request.method.lower() == "get":
            payload = AttachmentSerializer(
                alert.attachments.all(),
                many=True,
                context={"request": request},
            ).data
            return Response(payload)

        serializer = AttachmentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded_file = serializer.validated_data["file"]
        max_mb = int(getattr(settings, "MAX_ATTACHMENT_SIZE_MB", 25) or 25)
        max_bytes = max_mb * 1024 * 1024
        upload_size = getattr(uploaded_file, "size", 0) or 0
        if upload_size > max_bytes:
            raise ValidationError({"file": f"File troppo grande: massimo {max_mb}MB"})

        scan_status, scan_detail = scan_attachment_placeholder(uploaded_file)

        attachment = Attachment.objects.create(
            alert=alert,
            filename=uploaded_file.name,
            file=uploaded_file,
            content_type=getattr(uploaded_file, "content_type", "") or "application/octet-stream",
            size=upload_size,
            scan_status=scan_status,
            scan_detail=scan_detail,
            uploaded_by=request.user,
        )

        create_audit_log(
            request,
            action="alert.attachment_uploaded",
            obj=attachment,
            alert=alert,
            diff={
                "filename": attachment.filename,
                "content_type": attachment.content_type,
                "size": attachment.size,
                "scan_status": attachment.scan_status,
                "scan_detail": attachment.scan_detail,
            },
        )

        payload = AttachmentSerializer(attachment, context={"request": request}).data
        return Response(payload, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="audit")
    def alert_audit(self, request, pk=None):
        alert = self.get_object()
        queryset = AuditLog.objects.filter(alert=alert).select_related("actor")
        serializer = AuditLogSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset())

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="alerts.csv"'

        writer = csv.writer(response)
        writer.writerow(["id", "title", "severity", "state", "is_active", "source_name", "event_timestamp"])

        for alert in queryset:
            writer.writerow(
                [
                    alert.id,
                    alert.title,
                    alert.severity,
                    alert.current_state.name,
                    alert.is_active,
                    alert.source_name,
                    alert.event_timestamp.isoformat(),
                ]
            )

        return response

    @extend_schema(request=None, responses=AlertTimelineEventSerializer(many=True), tags=["Alerts"])
    @action(detail=True, methods=["get"], url_path="timeline")
    def timeline(self, request, pk=None):
        alert = self.get_object()
        events = []

        occurrence = getattr(alert, "occurrence", None)
        if occurrence:
            events.append(
                {
                    "timestamp": occurrence.last_seen,
                    "type": "occurrence",
                    "title": "Occorrenze aggiornate",
                    "detail": {
                        "count": occurrence.count,
                        "first_seen": occurrence.first_seen,
                        "last_seen": occurrence.last_seen,
                    },
                }
            )

        for comment in alert.comments.select_related("author").all():
            events.append(
                {
                    "timestamp": comment.created_at,
                    "type": "comment",
                    "title": f"Nota di {comment.author.username if comment.author else 'utente'}",
                    "detail": {"body": comment.body},
                }
            )

        for audit_entry in alert.audit_logs.select_related("actor").all():
            if audit_entry.action == "alert.state_changed":
                detail = audit_entry.diff or {}
                title = "Cambio stato"
            elif audit_entry.action == "alert.updated":
                detail = audit_entry.diff or {}
                title = "Alert modificato"
            elif audit_entry.action == "alert.assigned":
                detail = audit_entry.diff or {}
                title = "Assegnazione aggiornata"
            else:
                continue

            events.append(
                {
                    "timestamp": audit_entry.timestamp,
                    "type": audit_entry.action,
                    "title": title,
                    "detail": detail,
                }
            )

        events = sorted(events, key=lambda item: item["timestamp"], reverse=True)
        serializer = AlertTimelineEventSerializer(events, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(request=ExportConfigurableRequestSerializer, responses={200: "text/csv"}, tags=["Alerts"])
    @action(detail=False, methods=["post"], url_path="export-configurable")
    def export_configurable(self, request):
        serializer = ExportConfigurableRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        columns = payload.get("columns") or [
            "id",
            "title",
            "severity",
            "state",
            "is_active",
            "source_name",
            "event_timestamp",
        ]
        all_results = payload.get("all_results", True)
        search_request = self._parse_search_payload_for_export(payload)
        alert_ids = self._collect_alert_ids_for_export(search_request, all_results=all_results)

        alerts_map = {
            item.id: item
            for item in Alert.objects.select_related("current_state")
            .prefetch_related("alert_tags__tag", "assignment", "occurrence")
            .filter(id__in=alert_ids)
        }
        ordered_alerts = [alerts_map[item_id] for item_id in alert_ids if item_id in alerts_map]

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="alerts-configurable.csv"'

        writer = csv.writer(response)
        writer.writerow(columns)

        for alert in ordered_alerts:
            tags_value = ",".join([tag.name for tag in [item.tag for item in alert.alert_tags.select_related("tag")]])
            occurrence = getattr(alert, "occurrence", None)
            row = []
            for column in columns:
                if column.startswith("dyn:"):
                    dynamic_path = column[4:]
                    dynamic_value = extract_path(alert.parsed_payload, dynamic_path)
                    if dynamic_value is None:
                        dynamic_value = extract_path(alert.raw_payload, dynamic_path)
                    row.append(dynamic_value)
                    continue

                value_map = {
                    "id": alert.id,
                    "title": alert.title,
                    "severity": alert.severity,
                    "state": alert.current_state.name,
                    "is_active": alert.is_active,
                    "source_name": alert.source_name,
                    "source_id": alert.source_id,
                    "event_timestamp": alert.event_timestamp.isoformat(),
                    "created_at": alert.created_at.isoformat(),
                    "updated_at": alert.updated_at.isoformat(),
                    "dedup_fingerprint": alert.dedup_fingerprint,
                    "assignment": (
                        alert.assignment.assigned_to.username
                        if getattr(alert, "assignment", None) and alert.assignment.assigned_to
                        else ""
                    ),
                    "tags": tags_value,
                    "occurrence_count": occurrence.count if occurrence else 1,
                    "parse_error_detail": alert.parse_error_detail,
                }
                row.append(value_map.get(column, ""))
            writer.writerow(row)

        return response


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("actor").all()
    serializer_class = AuditLogSerializer
    permission_classes = [RoleBasedWritePermission]

    def get_queryset(self):
        queryset = super().get_queryset()

        action = self.request.query_params.get("action")
        object_type = self.request.query_params.get("object_type")
        object_id = self.request.query_params.get("object_id")
        alert_id = self.request.query_params.get("alert_id")
        actor_id = self.request.query_params.get("actor_id")
        from_dt = self.request.query_params.get("from")
        to_dt = self.request.query_params.get("to")

        if action:
            queryset = queryset.filter(action=action)

        if object_type:
            queryset = queryset.filter(object_type__iexact=object_type)

        if object_id:
            queryset = queryset.filter(object_id=str(object_id))

        if alert_id:
            queryset = queryset.filter(alert_id=alert_id)

        if actor_id:
            queryset = queryset.filter(actor_id=actor_id)

        if from_dt:
            from_parsed = parse_datetime(from_dt)
            if from_parsed:
                queryset = queryset.filter(timestamp__gte=from_parsed)

        if to_dt:
            to_parsed = parse_datetime(to_dt)
            if to_parsed:
                queryset = queryset.filter(timestamp__lte=to_parsed)

        return queryset


class SavedSearchViewSet(viewsets.ModelViewSet):
    serializer_class = SavedSearchSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return SavedSearch.objects.filter(user=self.request.user).order_by("name", "id")

    def perform_create(self, serializer):
        saved_search = serializer.save(user=self.request.user)
        create_audit_log(
            self.request,
            action="saved_search.created",
            obj=saved_search,
            diff={"name": saved_search.name},
        )

    def perform_update(self, serializer):
        old_name = serializer.instance.name
        saved_search = serializer.save()
        create_audit_log(
            self.request,
            action="saved_search.updated",
            obj=saved_search,
            diff={"old_name": old_name, "new_name": saved_search.name},
        )

    def perform_destroy(self, instance):
        payload = {"name": instance.name}
        super().perform_destroy(instance)
        create_audit_log(
            self.request,
            action="saved_search.deleted",
            obj=instance,
            diff=payload,
        )


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationEventSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = NotificationEvent.objects.select_related("alert").filter(is_active=True)
        status_filter = (self.request.query_params.get("status") or "all").strip().lower()
        if status_filter == "unread":
            read_ids = NotificationRead.objects.filter(user=self.request.user).values_list("notification_id", flat=True)
            queryset = queryset.exclude(id__in=read_ids)
        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        limit = min(max(int(request.query_params.get("limit", 30)), 1), 100)
        notifications = list(queryset[:limit])
        user_read_ids = set(
            NotificationRead.objects.filter(user=request.user).values_list("notification_id", flat=True)
        )
        reads_map = {
            item.notification_id: item.read_at
            for item in NotificationRead.objects.filter(
                user=request.user,
                notification_id__in=[item.id for item in notifications],
            )
        }
        serializer = self.get_serializer(
            notifications,
            many=True,
            context={"request": request, "reads_map": reads_map},
        )
        unread_count = NotificationEvent.objects.filter(is_active=True).exclude(id__in=user_read_ids).count()
        return Response({"unread_count": unread_count, "results": serializer.data}, status=status.HTTP_200_OK)

    @extend_schema(request=NotificationAckSerializer, responses=inline_serializer(name="NotificationAckResponse", fields={"acknowledged": serializers.IntegerField()}), tags=["Notifications"])
    @action(detail=False, methods=["post"], url_path="ack-all")
    def ack_all(self, request):
        unread = NotificationEvent.objects.filter(is_active=True).exclude(
            id__in=NotificationRead.objects.filter(user=request.user).values_list("notification_id", flat=True)
        )
        created = 0
        for notification in unread:
            _, was_created = NotificationRead.objects.get_or_create(notification=notification, user=request.user)
            if was_created:
                created += 1
        return Response({"acknowledged": created}, status=status.HTTP_200_OK)

    @extend_schema(request=NotificationAckSerializer, responses=inline_serializer(name="NotificationAckSingleResponse", fields={"acknowledged": serializers.BooleanField()}), tags=["Notifications"])
    @action(detail=True, methods=["post"], url_path="ack")
    def ack(self, request, pk=None):
        notification = self.get_object()
        NotificationRead.objects.get_or_create(notification=notification, user=request.user)
        return Response({"acknowledged": True}, status=status.HTTP_200_OK)


class AlertSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        request=AlertSearchRequestSerializer,
        responses=inline_serializer(
            name="AlertSearchResponse",
            fields={
                "backend": serializers.CharField(),
                "count": serializers.IntegerField(),
                "page": serializers.IntegerField(),
                "page_size": serializers.IntegerField(),
                "results": AlertListSerializer(many=True),
            },
        ),
        tags=["Alerts Search"],
    )
    def post(self, request):
        serializer = AlertSearchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        search_request = SearchRequest(
            text=payload.get("text", ""),
            source_name=payload.get("source_name", ""),
            state_id=payload.get("state_id"),
            severity=payload.get("severity", ""),
            is_active=payload.get("is_active"),
            dynamic_filters=payload.get("dynamic_filters", []),
            ordering=payload.get("ordering", "-event_timestamp"),
            page=payload.get("page", 1),
            page_size=payload.get("page_size", 25),
        )
        result = search_alerts(search_request)

        alerts_map = {
            item.id: item
            for item in Alert.objects.select_related("current_state")
            .prefetch_related("alert_tags__tag", "assignment")
            .filter(id__in=result.alert_ids)
        }
        ordered_alerts = [alerts_map[item_id] for item_id in result.alert_ids if item_id in alerts_map]

        data = AlertListSerializer(ordered_alerts, many=True, context={"request": request}).data
        return Response(
            {
                "backend": result.backend,
                "count": result.total,
                "page": search_request.page,
                "page_size": search_request.page_size,
                "results": data,
            },
            status=status.HTTP_200_OK,
        )


class SourceFieldSchemaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        responses=inline_serializer(
            name="SourceFieldSchemaResponse",
            many=True,
            fields={
                "source_name": serializers.CharField(),
                "fields": inline_serializer(
                    name="SourceFieldSchemaField",
                    many=True,
                    fields={
                        "field": serializers.CharField(),
                        "type": serializers.CharField(),
                    },
                ),
            },
        ),
        tags=["Alerts Search"],
    )
    def get(self, request):
        source_name = (request.query_params.get("source_name") or "").strip()
        if source_name:
            return Response(
                [{"source_name": source_name, "fields": build_source_field_schema(source_name)}],
                status=status.HTTP_200_OK,
            )
        return Response(build_all_source_field_schemas(), status=status.HTTP_200_OK)
