from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from core.throttling import AuthRateThrottle
from .serializers import CustomTokenObtainPairSerializer, UserSerializer
from .models import User


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


class UsersListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=UserSerializer(many=True), tags=["Auth"])
    def get(self, request):
        queryset = User.objects.filter(is_active=True).order_by("username")
        return Response(UserSerializer(queryset, many=True).data)
