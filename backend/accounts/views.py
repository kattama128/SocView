from django.conf import settings
from django.core.mail import send_mail
from django.utils.crypto import get_random_string
from django.db.models import Q
from django.middleware.csrf import get_token
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
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


def _auth_cookie_domain():
    domain = getattr(settings, "AUTH_COOKIE_DOMAIN", "").strip()
    return domain or None


def _set_auth_cookies(response, access_token=None, refresh_token=None):
    cookie_kwargs = {
        "httponly": True,
        "secure": getattr(settings, "AUTH_COOKIE_SECURE", False),
        "samesite": getattr(settings, "AUTH_COOKIE_SAMESITE", "Strict"),
        "domain": _auth_cookie_domain(),
    }
    if access_token:
        response.set_cookie(
            getattr(settings, "AUTH_ACCESS_COOKIE_NAME", "access_token"),
            access_token,
            max_age=getattr(settings, "AUTH_ACCESS_COOKIE_MAX_AGE", 900),
            path=getattr(settings, "AUTH_ACCESS_COOKIE_PATH", "/"),
            **cookie_kwargs,
        )
    if refresh_token:
        response.set_cookie(
            getattr(settings, "AUTH_REFRESH_COOKIE_NAME", "refresh_token"),
            refresh_token,
            max_age=getattr(settings, "AUTH_REFRESH_COOKIE_MAX_AGE", 604800),
            path=getattr(settings, "AUTH_REFRESH_COOKIE_PATH", "/api/auth/token/refresh/"),
            **cookie_kwargs,
        )


def _clear_auth_cookies(response):
    delete_kwargs = {
        "path": getattr(settings, "AUTH_ACCESS_COOKIE_PATH", "/"),
        "domain": _auth_cookie_domain(),
        "samesite": getattr(settings, "AUTH_COOKIE_SAMESITE", "Strict"),
    }
    response.delete_cookie(getattr(settings, "AUTH_ACCESS_COOKIE_NAME", "access_token"), **delete_kwargs)
    delete_kwargs["path"] = getattr(settings, "AUTH_REFRESH_COOKIE_PATH", "/api/auth/token/refresh/")
    response.delete_cookie(getattr(settings, "AUTH_REFRESH_COOKIE_NAME", "refresh_token"), **delete_kwargs)


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    @extend_schema(tags=["Auth"])
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        access_token = validated.pop("access", None)
        refresh_token = validated.pop("refresh", None)
        payload = {"user": UserSerializer(serializer.user, context={"request": request}).data}
        response = Response(payload, status=status.HTTP_200_OK)
        _set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)
        return response


class CustomTokenRefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    @extend_schema(tags=["Auth"])
    def post(self, request, *args, **kwargs):
        payload = request.data.copy()
        if not payload.get("refresh"):
            refresh_cookie_name = getattr(settings, "AUTH_REFRESH_COOKIE_NAME", "refresh_token")
            refresh_cookie = request.COOKIES.get(refresh_cookie_name)
            if refresh_cookie:
                payload["refresh"] = refresh_cookie

        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        response = Response({}, status=status.HTTP_200_OK)
        _set_auth_cookies(
            response,
            access_token=validated.get("access"),
            refresh_token=validated.get("refresh"),
        )
        return response


class TokenCookieMigrationView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    @extend_schema(tags=["Auth"])
    def post(self, request):
        access = request.data.get("access")
        refresh = request.data.get("refresh")
        if not access:
            raise ValidationError({"access": "Token access mancante"})

        authenticator = JWTAuthentication()
        try:
            validated = authenticator.get_validated_token(access)
            user = authenticator.get_user(validated)
        except Exception as exc:
            raise ValidationError({"access": "Token access non valido"}) from exc

        if refresh:
            try:
                RefreshToken(refresh)
            except TokenError as exc:
                raise ValidationError({"refresh": "Token refresh non valido"}) from exc

        response = Response({"user": UserSerializer(user, context={"request": request}).data}, status=status.HTTP_200_OK)
        _set_auth_cookies(response, access_token=access, refresh_token=refresh)
        return response


class CSRFTokenView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(tags=["Auth"])
    def get(self, request):
        token = get_token(request)
        return Response({"csrfToken": token}, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(tags=["Auth"])
    def post(self, request):
        refresh_cookie_name = getattr(settings, "AUTH_REFRESH_COOKIE_NAME", "refresh_token")
        refresh_cookie = request.COOKIES.get(refresh_cookie_name)
        if refresh_cookie:
            try:
                RefreshToken(refresh_cookie).blacklist()
            except (AttributeError, TokenError):
                pass

        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_auth_cookies(response)
        return response


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=UserSerializer, tags=["Auth"])
    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)


class WebSocketTokenView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(tags=["Auth"])
    def get(self, request):
        token = str(RefreshToken.for_user(request.user).access_token)
        return Response({"access": token}, status=status.HTTP_200_OK)


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
        return Response(UserDetailSerializer(user, context={"request": request}).data, status=status.HTTP_201_CREATED)

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
        return Response(UserDetailSerializer(user, context={"request": request}).data)

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
        return Response(UserDetailSerializer(user, context={"request": request}).data)

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
        return Response(UserDetailSerializer(instance, context={"request": request}).data)

    @extend_schema(responses=UserSerializer(many=True), tags=["Auth"])
    @action(detail=False, methods=["get"], url_path="assignable")
    def assignable(self, request):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=inline_serializer(
            name="UserSetActiveRequest",
            fields={"is_active": serializers.BooleanField()},
        ),
        responses=UserDetailSerializer,
        tags=["Auth"],
    )
    @action(detail=True, methods=["post"], url_path="set-active")
    def set_active(self, request, pk=None):
        user = self.get_object()
        is_active = bool(request.data.get("is_active", True))
        user.is_active = is_active
        user.save(update_fields=["is_active"])
        create_security_audit_event(
            request,
            action="user.set_active",
            object_type="User",
            object_id=str(user.id),
            metadata={"is_active": is_active},
        )
        return Response(UserDetailSerializer(user, context={"request": request}).data, status=status.HTTP_200_OK)

    @extend_schema(
        request=inline_serializer(
            name="UserResetPasswordRequest",
            fields={"temporary_password": serializers.CharField(required=False)},
        ),
        responses=inline_serializer(
            name="UserResetPasswordResponse",
            fields={
                "detail": serializers.CharField(),
                "email_sent": serializers.BooleanField(),
            },
        ),
        tags=["Auth"],
    )
    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        user = self.get_object()
        temporary_password = request.data.get("temporary_password") or get_random_string(16)
        user.set_password(temporary_password)
        user.save(update_fields=["password"])

        email_sent = False
        if user.email:
            try:
                send_mail(
                    subject="SocView - Reset password",
                    message=(
                        f"Ciao {user.username},\\n\\n"
                        "La tua password temporanea e stata rigenerata dall'amministratore SOC.\\n"
                        f"Password temporanea: {temporary_password}\\n\\n"
                        "Accedi e cambiala subito."
                    ),
                    from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "socview@localhost"),
                    recipient_list=[user.email],
                    fail_silently=False,
                )
                email_sent = True
            except Exception:
                email_sent = False

        create_security_audit_event(
            request,
            action="user.reset_password",
            object_type="User",
            object_id=str(user.id),
            metadata={"email_sent": email_sent},
        )
        return Response(
            {"detail": "Password temporanea rigenerata", "email_sent": email_sent},
            status=status.HTTP_200_OK,
        )


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
