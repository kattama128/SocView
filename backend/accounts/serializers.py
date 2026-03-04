from __future__ import annotations

from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from accounts.rbac import CAP_ADMIN, ROLE_CAPABILITIES, permissions_map_for_user
from tenant_data.models import Customer, CustomerMembership
from tenant_data.rbac import ensure_membership_targets_allowed, get_accessible_customer_ids

from .models import SecurityAuditEvent, User


def _default_membership_scope_for_role(role: str) -> str:
    if role in {User.Role.SUPER_ADMIN, User.Role.SOC_MANAGER}:
        return CustomerMembership.Scope.MANAGER
    if role == User.Role.READ_ONLY:
        return CustomerMembership.Scope.VIEWER
    return CustomerMembership.Scope.TRIAGE


class UserMembershipSerializer(serializers.ModelSerializer):
    customer_id = serializers.IntegerField(read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)

    class Meta:
        model = CustomerMembership
        fields = ("id", "customer_id", "customer_name", "scope", "is_active", "notes", "created_at", "updated_at")


class UserMembershipWriteSerializer(serializers.Serializer):
    customer_id = serializers.PrimaryKeyRelatedField(source="customer", queryset=Customer.objects.all())
    scope = serializers.ChoiceField(choices=CustomerMembership.Scope.choices, required=False)
    is_active = serializers.BooleanField(required=False, default=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")


class UserSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "role", "permissions")

    def get_permissions(self, obj):
        return permissions_map_for_user(obj)


class UserDetailSerializer(serializers.ModelSerializer):
    last_login = serializers.DateTimeField(read_only=True, allow_null=True)
    date_joined = serializers.DateTimeField(read_only=True)
    permissions = serializers.SerializerMethodField()
    memberships = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "permissions",
            "is_active",
            "last_login",
            "date_joined",
            "memberships",
        )

    def get_permissions(self, obj):
        return permissions_map_for_user(obj)

    def get_memberships(self, obj):
        queryset = obj.customer_memberships.select_related("customer").order_by("customer__name", "customer_id")
        return UserMembershipSerializer(queryset, many=True).data


class UserWriteSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)
    memberships = UserMembershipWriteSerializer(many=True, required=False)

    class Meta:
        model = User
        fields = ("username", "email", "first_name", "last_name", "role", "is_active", "password", "memberships")

    def validate_role(self, value):
        request = self.context.get("request")
        requester = getattr(request, "user", None)
        if not requester or not requester.is_authenticated:
            return value
        if requester.is_superuser:
            return value
        requester_caps = ROLE_CAPABILITIES.get(getattr(requester, "role", ""), set())
        if CAP_ADMIN in requester_caps:
            return value
        if value in {User.Role.SUPER_ADMIN, User.Role.SOC_MANAGER}:
            raise PermissionDenied({"role": "Solo un admin puo assegnare ruoli manager/admin"})
        return value

    def validate_memberships(self, value):
        request = self.context.get("request")
        requester = getattr(request, "user", None)
        customer_ids = [item["customer"].id for item in value]
        if len(customer_ids) != len(set(customer_ids)):
            raise serializers.ValidationError("Duplicati non consentiti nello stesso payload")
        if requester and requester.is_authenticated:
            ensure_membership_targets_allowed(requester, customer_ids)
        return value

    def _sync_memberships(self, user, memberships_data):
        normalized_payload = []
        for item in memberships_data:
            customer = item["customer"]
            normalized_payload.append(
                {
                    "customer_id": customer.id,
                    "scope": item.get("scope") or _default_membership_scope_for_role(user.role),
                    "is_active": item.get("is_active", True),
                    "notes": item.get("notes", ""),
                }
            )

        existing = {item.customer_id: item for item in CustomerMembership.objects.filter(user=user)}
        keep_customer_ids = set()
        for payload in normalized_payload:
            customer_id = payload["customer_id"]
            keep_customer_ids.add(customer_id)
            membership = existing.get(customer_id)
            if membership:
                membership.scope = payload["scope"]
                membership.is_active = payload["is_active"]
                membership.notes = payload["notes"]
                membership.save(update_fields=["scope", "is_active", "notes", "updated_at"])
            else:
                CustomerMembership.objects.create(
                    user=user,
                    customer_id=customer_id,
                    scope=payload["scope"],
                    is_active=payload["is_active"],
                    notes=payload["notes"],
                )

        stale_customer_ids = set(existing.keys()) - keep_customer_ids
        if stale_customer_ids:
            CustomerMembership.objects.filter(user=user, customer_id__in=stale_customer_ids).delete()

    def _build_default_memberships(self, user, requester):
        if requester and requester.is_authenticated:
            allowed = get_accessible_customer_ids(requester)
            if allowed is None:
                customers = list(Customer.objects.all().only("id"))
            else:
                customers = list(Customer.objects.filter(id__in=sorted(allowed)).only("id"))
        else:
            customers = list(Customer.objects.all().only("id"))

        return [
            {
                "customer": customer,
                "scope": _default_membership_scope_for_role(user.role),
                "is_active": True,
                "notes": "",
            }
            for customer in customers
        ]

    def create(self, validated_data):
        memberships_data = validated_data.pop("memberships", None)
        password = validated_data.pop("password", None)
        request = self.context.get("request")
        requester = getattr(request, "user", None)

        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()

        if memberships_data is None:
            memberships_data = self._build_default_memberships(user, requester)
        self._sync_memberships(user, memberships_data)
        return user

    def update(self, instance, validated_data):
        memberships_data = validated_data.pop("memberships", None)
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()

        if memberships_data is not None:
            self._sync_memberships(instance, memberships_data)
        return instance


class SecurityAuditEventSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = SecurityAuditEvent
        fields = (
            "id",
            "created_at",
            "actor",
            "actor_username",
            "action",
            "object_type",
            "object_id",
            "metadata",
            "ip_address",
            "user_agent",
        )


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
