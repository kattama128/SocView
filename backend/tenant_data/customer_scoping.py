from __future__ import annotations

from tenant_data.models import CustomerSourcePreference, Source


def get_enabled_source_names_for_customer(customer_id: int) -> list[str] | None:
    """
    Return effective enabled global source names for a customer.

    Backward compatibility:
    - include legacy customer-bound enabled sources (`Source.customer_id = customer_id`)
      so existing tenants continue to work during migration to global sources.

    Return semantics:
    - `None`: no global or legacy sources configured, so caller should not apply source filtering.
    - `[]`: sources exist but all disabled for this customer.
    """
    global_sources = list(
        Source.objects.filter(customer__isnull=True, is_enabled=True)
        .values("id", "name")
        .order_by("name", "id")
    )
    legacy_sources = list(
        Source.objects.filter(customer_id=customer_id, is_enabled=True)
        .values_list("name", flat=True)
        .order_by("name", "id")
    )
    if not global_sources and not legacy_sources:
        return None

    enabled_names = set(legacy_sources)
    if global_sources:
        source_ids = [item["id"] for item in global_sources]
        disabled_ids = set(
            CustomerSourcePreference.objects.filter(
                customer_id=customer_id,
                source_id__in=source_ids,
                is_enabled=False,
            ).values_list("source_id", flat=True)
        )
        enabled_names.update(item["name"] for item in global_sources if item["id"] not in disabled_ids)

    return sorted(enabled_names)
