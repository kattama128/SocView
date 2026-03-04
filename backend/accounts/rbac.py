from __future__ import annotations

from typing import Iterable


CAP_VIEW = "view"
CAP_TRIAGE = "triage"
CAP_MANAGE_SOURCES = "manage_sources"
CAP_MANAGE_CUSTOMERS = "manage_customers"
CAP_MANAGE_USERS = "manage_users"
CAP_EXPORT = "export"
CAP_ADMIN = "admin"

ALL_CAPABILITIES: tuple[str, ...] = (
    CAP_VIEW,
    CAP_TRIAGE,
    CAP_MANAGE_SOURCES,
    CAP_MANAGE_CUSTOMERS,
    CAP_MANAGE_USERS,
    CAP_EXPORT,
    CAP_ADMIN,
)

ROLE_CAPABILITIES: dict[str, set[str]] = {
    "SUPER_ADMIN": set(ALL_CAPABILITIES),
    "SOC_MANAGER": {
        CAP_VIEW,
        CAP_TRIAGE,
        CAP_MANAGE_SOURCES,
        CAP_MANAGE_CUSTOMERS,
        CAP_MANAGE_USERS,
        CAP_EXPORT,
    },
    "SOC_ANALYST": {CAP_VIEW, CAP_TRIAGE, CAP_EXPORT},
    "READ_ONLY": {CAP_VIEW, CAP_EXPORT},
}

ROLE_LABELS: dict[str, str] = {
    "SUPER_ADMIN": "SuperAdmin",
    "SOC_MANAGER": "SOC Manager",
    "SOC_ANALYST": "SOC Analyst",
    "READ_ONLY": "Read Only",
}

ROLE_DESCRIPTIONS: dict[str, str] = {
    "SUPER_ADMIN": "Accesso completo globale, inclusi utenti, policy e audit di sicurezza.",
    "SOC_MANAGER": "Gestione SOC operativa su clienti assegnati, fonti, policy e utenti scoped.",
    "SOC_ANALYST": "Triage operativo e investigazione allarmi su clienti assegnati.",
    "READ_ONLY": "Consultazione dashboard/allarmi in sola lettura su clienti assegnati.",
}


def capabilities_for_role(role: str | None) -> set[str]:
    if not role:
        return set()
    return set(ROLE_CAPABILITIES.get(role, set()))


def has_capability(user, capability: str) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return capability in capabilities_for_role(getattr(user, "role", None))


def permissions_map_for_role(role: str | None) -> dict[str, bool]:
    role_caps = capabilities_for_role(role)
    return {capability: capability in role_caps for capability in ALL_CAPABILITIES}


def permissions_map_for_user(user) -> dict[str, bool]:
    if not user or not user.is_authenticated:
        return {capability: False for capability in ALL_CAPABILITIES}
    if user.is_superuser:
        return {capability: True for capability in ALL_CAPABILITIES}
    return permissions_map_for_role(getattr(user, "role", None))


def role_matrix_payload(roles: Iterable[str]) -> list[dict]:
    payload = []
    for role in roles:
        payload.append(
            {
                "role": role,
                "label": ROLE_LABELS.get(role, role),
                "description": ROLE_DESCRIPTIONS.get(role, ""),
                "permissions": permissions_map_for_role(role),
            }
        )
    return payload
