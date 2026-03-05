from __future__ import annotations

from datetime import datetime

from django.db.models import DateTimeField, F, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError

from tenant_data.models import AuditLog


class AbstractBaseFilter:
    """Shared filtering helpers used by list/search/export alert endpoints."""

    def __init__(self, user):
        self.user = user

    @staticmethod
    def parse_datetime_like(raw_value):
        if raw_value in (None, ""):
            return None

        if isinstance(raw_value, datetime):
            parsed = raw_value
        else:
            parsed = parse_datetime(str(raw_value))
            if parsed is None:
                parsed_date = parse_date(str(raw_value))
                if parsed_date is None:
                    raise ValidationError({"in_state_since": "Formato data non valido"})
                parsed = datetime.combine(parsed_date, datetime.min.time())

        if timezone.is_naive(parsed):
            return timezone.make_aware(parsed, timezone.get_current_timezone())
        return parsed

    def resolve_assignee(self, assignee_value):
        raw = (assignee_value or "").strip()
        if not raw:
            return None
        if raw == "me":
            return self.user.id
        try:
            assignee_id = int(raw)
        except ValueError as exc:
            raise ValidationError({"assignee": "assignee deve essere 'me' o un id numerico"}) from exc
        if assignee_id <= 0:
            raise ValidationError({"assignee": "assignee deve essere 'me' o un id numerico"})
        return assignee_id

    @staticmethod
    def annotate_state_since(queryset):
        state_changed_subquery = (
            AuditLog.objects.filter(alert_id=OuterRef("pk"), action="alert.state_changed")
            .order_by("-timestamp")
            .values("timestamp")[:1]
        )
        return queryset.annotate(
            state_since=Coalesce(
                Subquery(state_changed_subquery, output_field=DateTimeField()),
                F("created_at"),
            )
        )

    def apply_assignment_and_state_filters(self, queryset, *, assignee=None, in_state_since=None):
        assignee_id = self.resolve_assignee(assignee)
        if assignee_id is not None:
            queryset = queryset.filter(assignment__assigned_to_id=assignee_id)

        state_since_dt = self.parse_datetime_like(in_state_since)
        if state_since_dt is not None:
            queryset = self.annotate_state_since(queryset).filter(state_since__lte=state_since_dt)

        return queryset
