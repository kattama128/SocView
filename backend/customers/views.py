from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from .models import Client
from .serializers import TenantContextSerializer, TenantSerializer


class TenantContextView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=TenantContextSerializer, tags=["Tenancy"])
    def get(self, request):
        tenant = getattr(request, "tenant", None)
        if tenant is None:
            return Response({"schema": "public", "tenant": "public"}, status=status.HTTP_200_OK)

        return Response(
            {
                "schema": tenant.schema_name,
                "tenant": getattr(tenant, "name", tenant.schema_name),
            },
            status=status.HTTP_200_OK,
        )


class TenantsListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=TenantSerializer(many=True), tags=["Tenancy"])
    def get(self, request):
        if not request.user.is_superuser and request.user.role != request.user.Role.SUPER_ADMIN:
            return Response({"detail": "Permesso negato"}, status=status.HTTP_403_FORBIDDEN)

        data = [
            {
                "schema_name": tenant.schema_name,
                "name": tenant.name,
                "on_trial": tenant.on_trial,
            }
            for tenant in Client.objects.all().order_by("schema_name")
        ]
        return Response(data, status=status.HTTP_200_OK)
