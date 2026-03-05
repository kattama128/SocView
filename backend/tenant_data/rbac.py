from __future__ import annotations

import logging
from typing import Iterable

from django.db.models import Q
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError

from accounts.rbac import (
    CAP_ADMIN,
    CAP_EXPORT,
    CAP_MANAGE_CUSTOMERS,
    CAP_MANAGE_SOURCES,
    CAP_MANAGE_USERS,
    CAP_TRIAGE,
    CAP_VIEW,
    has_capability,
)
from tenant_data.models import Customer, CustomerMembership

logger = logging.getLogger(__name__)

SCOPE_CAPABILITIES: dict[str, set[str]] = {
    CustomerMembership.Scope.VIEWER: {CAP_VIEW, CAP_EXPORT},
    CustomerMembership.Scope.TRIAGE: {CAP_VIEW, CAP_TRIAGE, CAP_EXPORT},
    CustomerMembership.Scope.MANAGER: {
        CAP_VIEW,
        CAP_TRIAGE,
        CAP_EXPORT,
        CAP_MANAGE_SOURCES,
        CAP_MANAGE_CUSTOMERS,
        CAP_MANAGE_USERS,
    },
}


def _active_memberships_queryset(user):
    return CustomerMembership.objects.filter(user=user, is_active=True)


def get_accessible_customer_ids(user) -> set[int] | None:
    """
    Return customer ids visible for user.

    - `None` means unrestricted (admin/global scope).
    - `set()` means no accessible customers.
    """
    if not user or not user.is_authenticated:
        return set()
    if user.is_superuser or has_capability(user, CAP_ADMIN):
        return None
    membership_ids = set(_active_memberships_queryset(user).values_list("customer_id", flat=True))
    if membership_ids:
        return membership_ids
    if has_capability(user, CAP_VIEW):
        logger.warning(
            "User %s (id=%s) has CAP_VIEW but no customer memberships — access denied. "
            "Assign explicit memberships to restore access.",
            user.username, user.id,
        )
    return set()


def has_customer_capability(user, customer_id: int | None, capability: str) -> bool:
    if not has_capability(user, capability):
        return False

    # Capabilities without explicit customer scope.
    if customer_id is None:
        return True

    if user.is_superuser or has_capability(user, CAP_ADMIN):
        return True

    membership = _active_memberships_queryset(user).filter(customer_id=customer_id).first()
    if not membership:
        return False
    return capability in SCOPE_CAPABILITIES.get(membership.scope, set())


def ensure_customer_capability(user, customer_id: int | None, capability: str, field_name: str = "customer_id"):
    if has_customer_capability(user, customer_id, capability):
        return
    raise PermissionDenied({field_name: "Non autorizzato per il cliente selezionato"})


def filter_queryset_by_customer_access(queryset, user, customer_field: str = "customer_id", include_null: bool = False):
    allowed_customer_ids = get_accessible_customer_ids(user)
    if allowed_customer_ids is None:
        return queryset

    if not allowed_customer_ids and not include_null:
        return queryset.none()

    filter_q = Q(**{f"{customer_field}__in": allowed_customer_ids})
    if include_null:
        filter_q |= Q(**{f"{customer_field}__isnull": True})
    return queryset.filter(filter_q)


def parse_and_validate_customer_id(raw_value, user=None, capability: str = CAP_VIEW, field_name: str = "customer_id"):
    if raw_value in (None, ""):
        return None
    try:
        customer_id = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field_name: "customer_id non valido"}) from exc
    if customer_id < 1:
        raise ValidationError({field_name: "customer_id deve essere >= 1"})
    if user is not None:
        ensure_customer_capability(user, customer_id, capability, field_name=field_name)
    return customer_id


def resolve_customer_for_user(
    customer_id: int | None,
    *,
    user=None,
    capability: str = CAP_VIEW,
    field_name: str = "customer_id",
) -> Customer | None:
    if customer_id is None:
        return None
    customer = Customer.objects.filter(id=customer_id).first()
    if not customer:
        raise ValidationError({field_name: "Customer non trovato"})
    if user is not None:
        ensure_customer_capability(user, customer.id, capability, field_name=field_name)
    return customer


def scoped_user_ids_for_manager(request_user) -> set[int] | None:
    """
    Returns:
    - None for global admin.
    - set of user ids visible to scoped manager.
    """
    if not request_user or not request_user.is_authenticated:
        return set()
    if request_user.is_superuser or has_capability(request_user, CAP_ADMIN):
        return None
    customer_ids = get_accessible_customer_ids(request_user)
    if not customer_ids:
        return {request_user.id}
    scoped_ids = set(
        CustomerMembership.objects.filter(customer_id__in=customer_ids, is_active=True).values_list("user_id", flat=True)
    )
    scoped_ids.add(request_user.id)
    return scoped_ids


def ensure_membership_targets_allowed(request_user, target_customer_ids: Iterable[int]):
    if request_user.is_superuser or has_capability(request_user, CAP_ADMIN):
        return
    allowed = get_accessible_customer_ids(request_user)
    if allowed is None:
        return
    disallowed = sorted(set(target_customer_ids) - set(allowed))
    if disallowed:
        raise PermissionDenied({"memberships": f"Customer non autorizzati: {disallowed}"})
