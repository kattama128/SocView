from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.audit import create_security_audit_event
from accounts.rbac import (
    CAP_ADMIN,
    CAP_TRIAGE,
    CAP_VIEW,
    has_capability,
    role_matrix_payload,
)
from core.throttling import AuthRateThrottle
from tenant_data.permissions import TenantSchemaAccessPermission
from tenant_data.rbac import parse_and_validate_customer_id, scoped_user_ids_for_manager

from .models import SecurityAuditEvent, User
from .permissions import CanManageUsers, CanTriage
from .serializers import (
    CustomTokenObtainPairSerializer,
    SecurityAuditEventSerializer,
    UserDetailSerializer,
    UserSerializer,
    UserWriteSerializer,
)


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]


class CustomTokenRefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=UserSerializer, tags=["Auth"])
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UsersManagementViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("username")
    permission_classes = [TenantSchemaAccessPermission, CanManageUsers]

    @staticmethod
    def _membership_snapshot(user):
        return list(
            user.customer_memberships.order_by("customer_id").values(
                "customer_id",
                "scope",
                "is_active",
            )
        )

    def get_permissions(self):
        if self.action == "assignable":
            return [TenantSchemaAccessPermission(), CanTriage()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return UserWriteSerializer
        if self.action == "assignable":
            return UserSerializer
        return UserDetailSerializer

    def get_queryset(self):
        queryset = User.objects.all().order_by("username")
        requester = self.request.user

        if self.action == "assignable":
            queryset = queryset.filter(is_active=True)
            customer_id = parse_and_validate_customer_id(
                self.request.query_params.get("customer_id"),
                user=requester,
                capability=CAP_TRIAGE,
            )
            if customer_id is not None:
                return queryset.filter(
                    customer_memberships__customer_id=customer_id,
                    customer_memberships__is_active=True,
                ).distinct()

            scoped_ids = scoped_user_ids_for_manager(requester)
            if scoped_ids is None:
                return queryset
            return queryset.filter(id__in=scoped_ids).distinct()

        scoped_ids = scoped_user_ids_for_manager(requester)
        if scoped_ids is None:
            return queryset
        return queryset.filter(id__in=scoped_ids).distinct()

    @extend_schema(responses=UserDetailSerializer(many=True), tags=["Auth"])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(responses=UserDetailSerializer, tags=["Auth"])
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(request=UserWriteSerializer, responses=UserDetailSerializer, tags=["Auth"])
    def create(self, request, *args, **kwargs):
        serializer = UserWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        create_security_audit_event(
            request,
            action="user.created",
            object_type="User",
            object_id=str(user.id),
            metadata={
                "role": user.role,
                "is_active": user.is_active,
                "memberships": self._membership_snapshot(user),
            },
        )
        return Response(UserDetailSerializer(user).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=UserWriteSerializer, responses=UserDetailSerializer, tags=["Auth"])
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = UserWriteSerializer(instance, data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        create_security_audit_event(
            request,
            action="user.updated",
            object_type="User",
            object_id=str(user.id),
            metadata={
                "role": user.role,
                "is_active": user.is_active,
                "memberships": self._membership_snapshot(user),
            },
        )
        return Response(UserDetailSerializer(user).data)

    @extend_schema(request=UserWriteSerializer, responses=UserDetailSerializer, tags=["Auth"])
    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = UserWriteSerializer(instance, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        create_security_audit_event(
            request,
            action="user.updated_partial",
            object_type="User",
            object_id=str(user.id),
            metadata={
                "role": user.role,
                "is_active": user.is_active,
                "memberships": self._membership_snapshot(user),
            },
        )
        return Response(UserDetailSerializer(user).data)

    @extend_schema(responses=UserDetailSerializer, tags=["Auth"])
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        create_security_audit_event(
            request,
            action="user.deactivated",
            object_type="User",
            object_id=str(instance.id),
            metadata={"is_active": instance.is_active},
        )
        return Response(UserDetailSerializer(instance).data)

    @extend_schema(responses=UserSerializer(many=True), tags=["Auth"])
    @action(detail=False, methods=["get"], url_path="assignable")
    def assignable(self, request):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class RolesView(APIView):
    permission_classes = [TenantSchemaAccessPermission, permissions.IsAuthenticated]

    @extend_schema(tags=["Auth"])
    def get(self, request):
        if not has_capability(request.user, CAP_VIEW):
            return Response({"detail": "Permessi insufficienti"}, status=status.HTTP_403_FORBIDDEN)
        payload = role_matrix_payload(role for role, _label in User.Role.choices)
        return Response(payload, status=status.HTTP_200_OK)


class SecurityAuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SecurityAuditEventSerializer
    permission_classes = [TenantSchemaAccessPermission, CanManageUsers]
    queryset = SecurityAuditEvent.objects.select_related("actor").all().order_by("-created_at", "-id")

    def get_queryset(self):
        queryset = super().get_queryset()
        requester = self.request.user
        action = self.request.query_params.get("action")
        actor_id = self.request.query_params.get("actor_id")
        object_type = self.request.query_params.get("object_type")
        if action:
            queryset = queryset.filter(action=action)
        if actor_id:
            queryset = queryset.filter(actor_id=actor_id)
        if object_type:
            queryset = queryset.filter(object_type=object_type)

        if requester.is_superuser or has_capability(requester, CAP_ADMIN):
            return queryset

        scoped_ids = scoped_user_ids_for_manager(requester) or {requester.id}
        return queryset.filter(
            Q(actor_id__in=scoped_ids)
            | Q(object_type="User", object_id__in=[str(item) for item in scoped_ids])
        )
